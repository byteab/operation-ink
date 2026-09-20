import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { penPalette } from '../render/ballpoint'

/**
 * BONE AXIS CONVENTIONS — verified empirically in the lab bone inspector (2026-09-13).
 *
 * Pose values are [x, y, z] DEGREES applied on top of the REST pose (T-pose) in the bone's rest-local
 * frame: rotate about rest X first, then rest Y, then rest Z (Three Euler order 'ZYX' == Blender's
 * "XYZ", so numbers from the Blender handoff port unchanged). [0,0,0] = rest. Bone-local +Y always
 * points along the bone. Facing: the character faces world +Z; .L bones are at world +X (screen-right
 * in the "front" camera). Feet at y=0, head top ~1.74. Hips node rests at (0, 0.82, 0).
 *
 *   bone            X                                   Y                                  Z
 *   upper_arm.L/R   - lowers arm from T-pose            with arm hanging (X=-80):          -90 swings the straight T-pose
 *                   (-80 = hanging at side),            -90 swings hand FORWARD (+Z),      arm forward (+Z) horizontally;
 *                   + raises it overhead                +90 backward; at T-pose = twist    + = backward
 *   forearm.L       (hanging) -90 bends hand inward     twist                              -90 bends elbow, hand FORWARD (+Z)
 *                   across the body                                                        (.R: +90)
 *   hand.L          - = tip toward the palm side        twist                              - = tip forward (+Z) (.R: +)
 *                   (same frame as forearm)
 *   shoulder.L/R    same frame as upper_arm; owns no vertices, leave at 0 and pose upper_arm instead
 *   thigh.L/R       + swings leg BACKWARD (-Z),         twist about the leg                + swings leg inward toward the
 *                   - swings FORWARD (knee lift)                                           other leg, - outward (.R mirror)
 *   shin.L/R        + bends the knee (heel goes         twist                              sideways (don't)
 *                   back, -Z); never negative
 *   hips/spine/     + leans FORWARD (+Z),               + turns toward the character's     + leans sideways toward the
 *   chest/neck      - backward                          LEFT (+X), - right                 character's RIGHT (-X)
 *   head            + nods down (nose forward/down)     + turns head to the LEFT (+X)      + tilts ear toward RIGHT shoulder
 *
 * Deviates from doc/HANDOFF-stickman.md: the head TURN is Y, not Z (Z tilts it sideways).
 * Mirror rule (verified exact): swap .L/.R and use [x, -y, -z]. See clip.ts mirrorPose().
 * GLTFLoader strips the dot from node names ("upper_arm.L" -> "upper_armL"); rest[bone].node has the real name.
 */

export const BONE_NAMES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulder.L', 'shoulder.R', 'upper_arm.L', 'upper_arm.R', 'forearm.L', 'forearm.R', 'hand.L', 'hand.R',
  'thigh.L', 'thigh.R', 'shin.L', 'shin.R',
] as const
export type BoneName = (typeof BONE_NAMES)[number]
/** Bones whose length a pose may scale (4th pose value): the child bone slides along the parent, the shader compresses the parent's mesh. */
export const STRETCH_CHILD: Partial<Record<BoneName, BoneName>> = {
  'upper_arm.L': 'forearm.L', 'upper_arm.R': 'forearm.R', 'forearm.L': 'hand.L', 'forearm.R': 'hand.R', 'thigh.L': 'shin.L', 'thigh.R': 'shin.R',
}

export type Rig = {
  root: THREE.Group
  mesh: THREE.SkinnedMesh
  bones: Record<BoneName, THREE.Bone>
  /** Rest transform per bone. `node` is the sanitized Object3D name GLTFLoader gave it ("upper_arm.L" -> "upper_armL"); use it in track names. */
  rest: Record<BoneName, { quat: THREE.Quaternion; pos: THREE.Vector3; node: string }>
  resetPose(): void
}

/** Rest pose of the loaded rig. Set by loadStickman(); clip.ts reads it, so build clips after the rig loads. */
export let rest: Rig['rest'] | undefined

const fill = new THREE.MeshBasicMaterial({ color: penPalette.character, toneMapped: false })

// Dual-quaternion skinning (Blender "Preserve Volume"): glTF only carries weights and Three.js skins with linear blending,
// which collapses the elbow/shoulder at 90 deg and candy-wraps the upper arm on twist. Rewrites the three skinning chunks.
// ponytail: assumes rigid bones (no scale); add column normalisation in dqRotOf if a bone ever scales.
/** Per-bone axial stretch (pose length factors): bind-space bone axis and origin, origin.w = current stretch. */
const DQ_MAX_BONES = 32
export const dqUniforms = {
  boneAxis: { value: Array.from({ length: DQ_MAX_BONES }, () => new THREE.Vector4(0, 1, 0, 0)) },
  boneOrigin: { value: Array.from({ length: DQ_MAX_BONES }, () => new THREE.Vector4(0, 0, 0, 1)) },
}
const DQ_FUNCS = /* glsl */ `
  uniform vec4 boneAxis[${DQ_MAX_BONES}];
  uniform vec4 boneOrigin[${DQ_MAX_BONES}];
  vec3 dqStretch1(vec3 p, int i) { vec4 o = boneOrigin[i]; vec3 a = boneAxis[i].xyz; return p + (o.w - 1.0) * dot(p - o.xyz, a) * a; }
  vec3 dqStretch(vec3 p) {
    return dqStretch1(p, int(skinIndex.x)) * skinWeight.x + dqStretch1(p, int(skinIndex.y)) * skinWeight.y
         + dqStretch1(p, int(skinIndex.z)) * skinWeight.z + dqStretch1(p, int(skinIndex.w)) * skinWeight.w;
  }
  vec4 dqMul(vec4 a, vec4 b) { return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz)); }
  vec4 dqRotOf(mat4 m) {
    float t = m[0][0] + m[1][1] + m[2][2]; vec4 q;
    if (t > 0.0) { float s = sqrt(t + 1.0) * 2.0; q = vec4((m[1][2] - m[2][1]) / s, (m[2][0] - m[0][2]) / s, (m[0][1] - m[1][0]) / s, 0.25 * s); }
    else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { float s = sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2.0; q = vec4(0.25 * s, (m[1][0] + m[0][1]) / s, (m[2][0] + m[0][2]) / s, (m[1][2] - m[2][1]) / s); }
    else if (m[1][1] > m[2][2]) { float s = sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2.0; q = vec4((m[1][0] + m[0][1]) / s, 0.25 * s, (m[2][1] + m[1][2]) / s, (m[2][0] - m[0][2]) / s); }
    else { float s = sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2.0; q = vec4((m[2][0] + m[0][2]) / s, (m[2][1] + m[1][2]) / s, 0.25 * s, (m[0][1] - m[1][0]) / s); }
    return normalize(q);
  }
  void dqAcc(mat4 m, float w, vec4 ref, inout vec4 r, inout vec4 d) {
    vec4 q = dqRotOf(m); if (dot(q, ref) < 0.0) q = -q;
    r += w * q; d += w * 0.5 * dqMul(vec4(m[3].xyz, 0.0), q);
  }
  vec3 dqRot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`
const DQ_BLEND = /* glsl */ `
  #ifdef USE_SKINNING
    vec4 dqR = vec4(0.0), dqD = vec4(0.0), dqRef = dqRotOf(boneMatX);
    dqAcc(boneMatX, skinWeight.x, dqRef, dqR, dqD); dqAcc(boneMatY, skinWeight.y, dqRef, dqR, dqD);
    dqAcc(boneMatZ, skinWeight.z, dqRef, dqR, dqD); dqAcc(boneMatW, skinWeight.w, dqRef, dqR, dqD);
    float dqLen = length(dqR); dqR /= dqLen; dqD /= dqLen;
  #endif
`
const DQ_NORMAL = /* glsl */ `
  #ifdef USE_SKINNING
    objectNormal = mat3(bindMatrixInverse) * dqRot(dqR, mat3(bindMatrix) * objectNormal);
  #endif
`
const DQ_VERTEX = /* glsl */ `
  #ifdef USE_SKINNING
    vec3 dqP = dqRot(dqR, dqStretch((bindMatrix * vec4(transformed, 1.0)).xyz)) + 2.0 * (dqR.w * dqD.xyz - dqD.w * dqR.xyz + cross(dqR.xyz, dqD.xyz));
    transformed = (bindMatrixInverse * vec4(dqP, 1.0)).xyz;
  #endif
`
export function dualQuaternionSkinning(vertexShader: string): string {
  return vertexShader
    .replace('#include <common>', '#include <common>' + DQ_FUNCS)
    .replace('#include <skinbase_vertex>', '#include <skinbase_vertex>' + DQ_BLEND)
    .replace('#include <skinnormal_vertex>', DQ_NORMAL)
    .replace('#include <skinning_vertex>', DQ_VERTEX)
}
fill.onBeforeCompile = (shader) => { shader.vertexShader = dualQuaternionSkinning(shader.vertexShader); Object.assign(shader.uniforms, dqUniforms) }

// Inverted-hull outline: back faces pushed out by `width` px along the skinned normal (same idea as ink.ts, plus skinning).
const outline = new THREE.ShaderMaterial({
  uniforms: { ink: { value: new THREE.Color(penPalette.character) }, resolution: { value: new THREE.Vector2(1, 1) }, width: { value: 1.2 }, ...dqUniforms },
  vertexShader: dualQuaternionSkinning(`
    #include <common>
    #include <skinning_pars_vertex>
    uniform vec2 resolution;
    uniform float width;
    void main() {
      #include <beginnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <begin_vertex>
      #include <skinning_vertex>
      vec4 view = modelViewMatrix * vec4(transformed, 1.0);
      vec4 clip = projectionMatrix * view;
      vec3 n = normalize(normalMatrix * objectNormal);
      vec4 tip = projectionMatrix * vec4(view.xyz + n, 1.0);
      vec2 direction = (tip.xy * clip.w - clip.xy * tip.w) * resolution;
      direction /= max(length(direction), 0.0001);
      clip.xy += direction * width * 2.0 / resolution * clip.w;
      gl_Position = clip;
    }
  `),
  fragmentShader: `
    uniform vec3 ink;
    void main() {
      gl_FragColor = vec4(ink, 1.0);
      #include <colorspace_fragment>
    }
  `,
  side: THREE.BackSide, depthWrite: false,
})

export function setOutlineResolution(width: number, height: number) {
  outline.uniforms.resolution.value.set(width, height)
}

/** Shorten each arm in bind space before clips and weapon holds read its lengths.
 * Keep the shoulder attachment and fist size, compressing only shoulder-to-wrist
 * distance. Rebinding below makes this the actual rest shape for every pose. */
function shortenArms(root: THREE.Group, mesh: THREE.SkinnedMesh) {
  const ratio = 0.92
  const positions = mesh.geometry.attributes.position
  const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight
  const point = new THREE.Vector3()
  for (const side of ['L', 'R']) {
    const bone = (name: string) => root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(`${name}.${side}`)) as THREE.Bone
    const shoulder = bone('upper_arm'), elbow = bone('forearm'), wrist = bone('hand')
    const origin = shoulder.getWorldPosition(new THREE.Vector3())
    const end = wrist.getWorldPosition(new THREE.Vector3())
    const axis = end.clone().sub(origin).normalize(), length = origin.distanceTo(end)
    const armIndices = new Set([shoulder, elbow, wrist].map(b => mesh.skeleton.bones.indexOf(b)))
    for (let i = 0; i < positions.count; i++) {
      let influence = 0
      for (let j = 0; j < 4; j++) if (armIndices.has(indices.getComponent(i, j))) influence += weights.getComponent(i, j)
      if (!influence) continue
      mesh.localToWorld(point.fromBufferAttribute(positions, i))
      const distance = THREE.MathUtils.clamp(point.clone().sub(origin).dot(axis), 0, length)
      point.addScaledVector(axis, distance * (ratio - 1) * influence)
      mesh.worldToLocal(point)
      positions.setXYZ(i, point.x, point.y, point.z)
    }
    elbow.position.multiplyScalar(ratio)
    wrist.position.multiplyScalar(ratio)
  }
  positions.needsUpdate = true
  mesh.geometry.computeVertexNormals()
  mesh.geometry.computeBoundingBox()
  mesh.geometry.computeBoundingSphere()
  root.updateMatrixWorld(true)
}

/**
 * Culling bounds in root space, shared and read-only. three.js would otherwise measure the pose of the first
 * frame, and a body lying 2 m from its root would vanish at the screen edge. Clips move joints at most 2.6 m
 * from this centre (dieShotgun's knockback; next is dieBack at 1.5 m), plus limb thickness and margin.
 */
const BODY_BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3.2)

let source: Promise<THREE.Group> | undefined

/** Fetch, parse and rebind the GLB once. It is never posed or added to a scene; every rig is a clone of it. */
function stickmanSource() {
  return source ??= new GLTFLoader().loadAsync(`${import.meta.env?.BASE_URL ?? '/'}models/stickman.glb`).then(gltf => {
    const root = gltf.scene
    const mesh = root.getObjectByName('Stickman') as THREE.SkinnedMesh
    if (!mesh?.isSkinnedMesh) throw new Error('stickman.glb: SkinnedMesh "Stickman" not found')
    if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals()
    // The source rig placed each wrist 8 cm before the visible hand end cap, inside the
    // forearm. Move the joint to its base and rebind at rest: the silhouette is unchanged,
    // but wrist rotation now bends the fist instead of the distal forearm.
    for (const side of ['L', 'R']) {
      const hand = root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(`hand.${side}`))
      if (hand instanceof THREE.Bone) hand.position.y += 0.08
    }
    root.updateMatrixWorld(true)
    shortenArms(root, mesh)
    mesh.skeleton.calculateInverses()
    return root
  }).catch(error => { source = undefined; throw error })
}

/** An independent skeleton per call; the rebound geometry and bone inverses are shared and must stay read-only. */
export async function loadStickman(): Promise<Rig> {
  const root = cloneSkinned(await stickmanSource()) as THREE.Group
  const mesh = root.getObjectByName('Stickman') as THREE.SkinnedMesh
  mesh.material = fill
  mesh.boundingSphere = BODY_BOUNDS
  root.updateMatrixWorld(true)

  const shell = new THREE.SkinnedMesh(mesh.geometry, outline)
  shell.bind(mesh.skeleton, mesh.bindMatrix)
  shell.boundingSphere = BODY_BOUNDS
  shell.renderOrder = 1
  shell.name = 'Stickman outline'
  const outlineViewport = new THREE.Vector4()
  shell.onBeforeRender = (renderer, _scene, camera) => {
    // Keep the optional lab contour accurate for each viewport, including XR eyes.
    renderer.getViewport(outlineViewport)
    const viewport = (camera as THREE.PerspectiveCamera).viewport
    setOutlineResolution(renderer.xr.isPresenting && viewport ? viewport.z : outlineViewport.z,
      renderer.xr.isPresenting && viewport ? viewport.w : outlineViewport.w)
    outline.uniformsNeedUpdate = true
  }
  mesh.parent!.add(shell)

  const bones = {} as Rig['bones']
  const restPose = {} as Rig['rest']
  for (const name of BONE_NAMES) {
    const node = THREE.PropertyBinding.sanitizeNodeName(name)
    const bone = root.getObjectByName(node)
    if (!(bone instanceof THREE.Bone)) throw new Error(`stickman.glb: bone "${name}" missing`)
    bones[name] = bone
    restPose[name] = { quat: bone.quaternion.clone(), pos: bone.position.clone(), node }
  }
  rest = restPose
  // Stretch uniforms: bind-space axis/origin per skeleton bone; origin.w = |child.position| / rest length, refreshed before each render.
  const bind = new THREE.Matrix4()
  const stretch: { index: number; child: THREE.Bone; restLen: number }[] = []
  mesh.skeleton.bones.forEach((bone, i) => {
    bind.copy(mesh.skeleton.boneInverses[i]).invert()
    dqUniforms.boneAxis.value[i].set(bind.elements[4], bind.elements[5], bind.elements[6], 0).normalize()
    dqUniforms.boneOrigin.value[i].set(bind.elements[12], bind.elements[13], bind.elements[14], 1)
    const name = BONE_NAMES.find(n => restPose[n].node === bone.name)
    const child = name && STRETCH_CHILD[name]
    if (child) stretch.push({ index: i, child: bones[child], restLen: restPose[child].pos.length() })
  })
  mesh.onBeforeRender = () => { for (const s of stretch) dqUniforms.boneOrigin.value[s.index].w = s.child.position.length() / s.restLen }
  return {
    root, mesh, bones, rest: restPose,
    resetPose() {
      for (const name of BONE_NAMES) {
        bones[name].quaternion.copy(restPose[name].quat)
        bones[name].position.copy(restPose[name].pos)
      }
    },
  }
}
