"""Blender background inspection/refinement of the existing skinned GLB.

Run with --background --factory-startup --python-exit-code 1 --python this-file -- INPUT OUTPUT.
Keeps the source file intact. Moves the arm chains outward without changing
upper-arm/forearm lengths, and refines the continuous shoulder/hip surface.
"""
import bpy
import math
import sys
import json
import bmesh
from mathutils import Euler, Quaternion, Vector

if not bpy.app.background:
    raise RuntimeError('Run in a separate Blender background process with --factory-startup')

args = sys.argv[sys.argv.index('--') + 1:]
source, destination = args[:2]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=source)
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
armature = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
modifier = next(m for m in body.modifiers if m.type == 'ARMATURE')
modifier.use_deform_preserve_volume = True
groups = {g.index: g.name for g in body.vertex_groups}
positions = [v.co.copy() for v in body.data.vertices]

def inspect_hanging_arms():
    for bone in armature.pose.bones:
        bone.rotation_mode = 'QUATERNION'
        bone.rotation_quaternion = Quaternion()
    for side in ['L', 'R']:
        armature.pose.bones[f'upper_arm.{side}'].rotation_quaternion = Euler((math.radians(-78), 0, 0), 'XYZ').to_quaternion()
    bpy.context.view_layer.update()
    evaluated_object = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    evaluated = evaluated_object.to_mesh()
    errors = []
    for vertex in body.data.vertices:
        if not (0.215 < abs(positions[vertex.index].x) < 0.29 and 1.1 < positions[vertex.index].z < 1.28):
            continue
        side = 'L' if positions[vertex.index].x > 0 else 'R'
        bone = armature.pose.bones[f'upper_arm.{side}']
        rest_local = bone.bone.matrix_local.inverted() @ vertex.co
        posed_local = bone.matrix.inverted() @ evaluated.vertices[vertex.index].co
        errors.append(abs(math.hypot(posed_local.x, posed_local.z) - math.hypot(rest_local.x, rest_local.z)))
    evaluated_object.to_mesh_clear()
    for bone in armature.pose.bones:
        bone.rotation_quaternion = Quaternion()
    bpy.context.view_layer.update()
    return {'max_radius_error': max(errors), 'rms_radius_error': math.sqrt(sum(e * e for e in errors) / len(errors))}

before_arms = inspect_hanging_arms()

def smooth(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)

# Sample the exact horizontal silhouette, including edge/plane intersections.
# This avoids shaping the contour to the irregular voxel vertex rows.
def half_width(height):
    maximum = 0.0
    for edge in body.data.edges:
        a, b = [positions[i] for i in edge.vertices]
        if min(a.z, b.z) <= height <= max(a.z, b.z) and abs(a.z - b.z) > 1e-8:
            t = (height - a.z) / (b.z - a.z)
            maximum = max(maximum, abs(a.x + t * (b.x - a.x)))
    return maximum

heights = [0.6 + i * 0.005 for i in range(69)]
widths = [half_width(z) for z in heights]
low, high = widths[0], widths[-1]
hip_changes = 0
for vertex in body.data.vertices:
    z = vertex.co.z
    if not 0.6 < z < 0.94:
        continue
    sample = (z - 0.6) / 0.005
    index = min(len(widths) - 2, int(sample))
    envelope = widths[index] + (widths[index + 1] - widths[index]) * (sample - index)
    straight = low + (high - low) * (z - 0.6) / 0.34
    blend = smooth((z - 0.6) / 0.05) * smooth((0.94 - z) / 0.04)
    factor = 1 - blend * (envelope - straight) / envelope
    if abs(factor - 1) > 1e-6:
        vertex.co.x *= factor
        hip_changes += 1

# Residual chest influences extended 15 cm down the arm, especially on its
# underside. Release them symmetrically across the shoulder; preserve all
# elbow/wrist weights.
weight_changes = 0
for vertex in body.data.vertices:
    x, _, z = positions[vertex.index]
    amount = smooth((abs(x) - 0.13) / 0.075)
    if amount <= 0 or abs(x) > 0.34 or not 1.1 < z < 1.28:
        continue
    side = 'L' if x > 0 else 'R'
    values = {groups[g.group]: g.weight for g in vertex.groups}
    transfer = 0.0
    for name in ['chest', 'spine', 'hips', 'neck', 'head']:
        take = values.get(name, 0) * amount
        values[name] = values.get(name, 0) - take
        transfer += take
    if transfer <= 1e-6:
        continue
    name = f'upper_arm.{side}'
    values[name] = values.get(name, 0) + transfer
    total = sum(values.values())
    for group in body.vertex_groups:
        weight = values.get(group.name, 0) / total
        if weight > 1e-6:
            group.add([vertex.index], weight, 'REPLACE')
        else:
            group.remove([vertex.index])
    weight_changes += 1

# The original shoulder pivot was almost inside the torso (12 cm from centre,
# with an 11.5 cm torso radius). A 5 cm arm tube hanging there overlaps the chest
# for much of its length. Keep a modest clearance with a narrower shoulder span.
SHOULDER_OFFSET = 0.035
shoulder_vertices = 0
for vertex in body.data.vertices:
    x, y, z = positions[vertex.index]
    if not 1.075 < z < 1.29 or abs(x) < 0.08:
        continue
    weight = smooth((abs(x) - 0.08) / 0.10) * smooth((z - 1.075) / 0.07)
    vertex.co.x += math.copysign(SHOULDER_OFFSET * weight, x)
    # Remove the oversized shoulder-ball crown, blending into the arm's radius.
    if z > 1.2:
        radius = math.hypot(y, z - 1.2)
        crown = smooth((abs(x) - 0.09) / 0.075)
        scale = 1 - crown * max(0, radius - 0.049) / radius
        vertex.co.y *= scale
        vertex.co.z = 1.2 + (z - 1.2) * scale
    shoulder_vertices += 1

bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode='EDIT')
for side, sign in [('L', 1), ('R', -1)]:
    for name in [f'upper_arm.{side}', f'forearm.{side}', f'hand.{side}']:
        bone = armature.data.edit_bones[name]
        bone.head.x += sign * SHOULDER_OFFSET
        bone.tail.x += sign * SHOULDER_OFFSET
    armature.data.edit_bones[f'shoulder.{side}'].tail.x += sign * SHOULDER_OFFSET
bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.update()

# Fair the shoulder in its relaxed pose, then invert each vertex's rigid DQ
# blend back into bind space. This removes the cap ridge/fold at the attachment
# without smoothing away the straight arm tube or changing its skin weights.
for side in ['L', 'R']:
    armature.pose.bones[f'upper_arm.{side}'].rotation_quaternion = Euler((math.radians(-78), 0, 0), 'XYZ').to_quaternion()
bpy.context.view_layer.update()
evaluated_object = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
evaluated_mesh = evaluated_object.to_mesh()
posed = [v.co.copy() for v in evaluated_mesh.vertices]
evaluated_object.to_mesh_clear()
neighbors = [[] for _ in body.data.vertices]
for edge in body.data.edges:
    a, b = edge.vertices
    neighbors[a].append(b); neighbors[b].append(a)
influence = []
for p in posed:
    distance = (Vector((abs(p.x), p.y, p.z)) - Vector((0.12 + SHOULDER_OFFSET, 0, 1.2))).length
    influence.append(1 - smooth((distance - 0.035) / 0.085))
filtered = [p.copy() for p in posed]
for _ in range(16):
    previous = [p.copy() for p in filtered]
    for i, p in enumerate(previous):
        if influence[i] <= 0 or not neighbors[i]:
            continue
        average = sum((previous[j] for j in neighbors[i]), Vector()) / len(neighbors[i])
        filtered[i] = p.lerp(average, 0.45 * influence[i])

# Shape the relaxed silhouette to the annotated reference: a short, nearly level
# shoulder shelf with a rounded outer corner, and a smaller, lower armpit notch.
# Apply smooth fields through the full depth so the contour holds in three-quarter
# views as well as from the front. The arm below this attachment stays unchanged.
SHOULDER_LIFT = 0.020
ARMPIT_DROP = 0.035
for p in filtered:
    x, z = abs(p.x), p.z
    shelf = smooth((x - 0.065) / 0.08) * (1 - smooth((x - 0.165) / 0.055))
    shelf *= smooth((z - 1.115) / 0.10) * (1 - smooth((z - 1.265) / 0.035))
    armpit = math.exp(-((x - 0.125) / 0.034) ** 2 - ((z - 1.115) / 0.048) ** 2)
    p.z += SHOULDER_LIFT * shelf - ARMPIT_DROP * armpit

skin = {}
for bone in armature.pose.bones:
    matrix = bone.matrix @ bone.bone.matrix_local.inverted()
    rotation = matrix.to_quaternion()
    translation = matrix.to_translation()
    dual = Quaternion((0, *translation)) @ rotation
    skin[bone.name] = (rotation, dual)
max_inverse_error = 0.0
for vertex in body.data.vertices:
    i = vertex.index
    if (filtered[i] - posed[i]).length_squared < 1e-14:
        continue
    real, dual = [0.0] * 4, [0.0] * 4
    reference = skin[groups[vertex.groups[0].group]][0]
    for group in vertex.groups:
        r, d = skin[groups[group.group]]
        weight = group.weight * (1 if reference.dot(r) >= 0 else -1)
        for axis in range(4):
            real[axis] += r[axis] * weight
            dual[axis] += d[axis] * weight * 0.5
    norm = math.sqrt(sum(v * v for v in real))
    rotation = Quaternion([v / norm for v in real])
    translation_q = Quaternion([v / norm for v in dual]) @ rotation.conjugated()
    translation = Vector((translation_q.x, translation_q.y, translation_q.z)) * 2
    max_inverse_error = max(max_inverse_error, (rotation @ vertex.co + translation - posed[i]).length)
    vertex.co = rotation.inverted() @ (filtered[i] - translation)
assert max_inverse_error < 1e-5, max_inverse_error
for bone in armature.pose.bones:
    bone.rotation_quaternion = Quaternion()
bpy.context.view_layer.update()

report = {'vertices': len(body.data.vertices), 'hip_vertices': hip_changes, 'weight_vertices': weight_changes,
          'shoulder_vertices': shoulder_vertices, 'shoulder_offset': SHOULDER_OFFSET,
          'shoulder_lift': SHOULDER_LIFT, 'armpit_drop': ARMPIT_DROP,
          'shoulder_inverse_error': max_inverse_error,
          'max_displacement': max((v.co - positions[v.index]).length for v in body.data.vertices),
          'arms_before': before_arms, 'arms_after': inspect_hanging_arms(),
          'hip_envelope': [{'height': heights[i], 'before': widths[i], 'target': low + (high - low) * (heights[i] - 0.6) / 0.34} for i in range(0, len(heights), 8)]}
bm = bmesh.new(); bm.from_mesh(body.data)
report['nonmanifold_edges'] = sum(not edge.is_manifold for edge in bm.edges)
bm.normal_update(); bm.to_mesh(body.data); bm.free()
body.data.normals_split_custom_set([(0, 0, 0)] * len(body.data.loops))
report['max_weight_error'] = max(abs(sum(g.weight for g in v.groups) - 1) for v in body.data.vertices)
report['max_influences'] = max(sum(g.weight > 1e-6 for g in v.groups) for v in body.data.vertices)
assert report['nonmanifold_edges'] == 0
assert report['max_influences'] <= 4
assert report['max_weight_error'] < 1e-5
assert report['arms_after']['max_radius_error'] < 0.001, report['arms_after']
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); armature.select_set(True)
bpy.ops.export_scene.gltf(filepath=destination, export_format='GLB', use_selection=True,
                          export_apply=False, export_yup=True, export_skins=True,
                          export_animations=False, export_materials='EXPORT')
print('CONTOUR_RESULT ' + json.dumps(report))
