import * as THREE from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type Point = [number, number, number]
export type Fill = 'paper' | 'roof' | 'concrete' | 'glass' | 'green' | 'rock'
export type Stroke = 'edge' | 'detail' | 'mesh' | 'landscape'

export const palette = {
  paper: 0xfafbf9, roof: 0xf6f7f4, concrete: 0xf3f4f0,
  glass: 0xf0f3f2, green: 0xe4eade, rock: 0xf2f3ee,
  ink: 0x3e4951,
}

const fills = Object.fromEntries(
  (['paper', 'roof', 'concrete', 'glass', 'green', 'rock'] as Fill[]).map(name => [name,
    new THREE.MeshBasicMaterial({
      color: palette[name], side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }),
  ]),
) as Record<Fill, THREE.MeshBasicMaterial>

const strokes: Record<Stroke, LineMaterial> = {
  edge: new LineMaterial({ color: palette.ink, linewidth: 1.05 }),
  detail: new LineMaterial({ color: 0x6b767c, linewidth: 0.75 }),
  mesh: new LineMaterial({ color: 0x929b9b, linewidth: 0.55 }),
  landscape: new LineMaterial({ color: 0x8d9a87, linewidth: 0.7 }),
}
for (const material of Object.values(strokes)) {
  material.depthTest = true
  material.depthWrite = false
  material.alphaToCoverage = true
}

// Smooth objects need a moving silhouette, not a wireframe of their tessellation.
// Expand back faces in screen space so tank and tree contours keep the same weight.
const silhouette = new THREE.ShaderMaterial({
  uniforms: {
    ink: { value: new THREE.Color(palette.ink) },
    resolution: { value: new THREE.Vector2(1, 1) },
    width: { value: 0.75 },
  },
  vertexShader: `
    uniform vec2 resolution;
    uniform float width;
    void main() {
      vec4 view = modelViewMatrix * vec4(position, 1.0);
      vec4 clip = projectionMatrix * view;
      vec3 n = normalize(normalMatrix * normal);
      vec4 tip = projectionMatrix * vec4(view.xyz + n, 1.0);
      vec2 direction = (tip.xy * clip.w - clip.xy * tip.w) * resolution;
      direction /= max(length(direction), 0.0001);
      clip.xy += direction * width * 2.0 / resolution * clip.w;
      gl_Position = clip;
    }
  `,
  fragmentShader: `
    uniform vec3 ink;
    void main() {
      gl_FragColor = vec4(ink, 1.0);
      #include <colorspace_fragment>
    }
  `,
  side: THREE.BackSide, depthWrite: false,
})

export function resizeInk(width: number, height: number) {
  for (const material of Object.values(strokes)) material.resolution.set(width, height)
  silhouette.uniforms.resolution.value.set(width, height)
}

const up = new THREE.Vector3(0, 1, 0)

/** One semantic environment object, with its static surfaces and ink batched by material. */
export class Draft extends THREE.Group {
  private surfaces = new Map<Fill, THREE.BufferGeometry[]>()
  private contours = new Map<Stroke, number[]>()
  private shells: THREE.BufferGeometry[] = []

  constructor(name: string, x = 0, z = 0, angle = 0) {
    super()
    this.name = name
    this.position.set(x, 0, z)
    this.rotation.y = angle
    this.userData.environment = true
  }

  line(points: Point[], stroke: Stroke = 'edge', close = false) {
    const data = this.contours.get(stroke) ?? []
    this.contours.set(stroke, data)
    for (let i = 1; i < points.length; i++) data.push(...points[i - 1], ...points[i])
    if (close && points.length > 2) data.push(...points[points.length - 1], ...points[0])
  }

  ring(radius: number, y: number, x = 0, z = 0, stroke: Stroke = 'edge', segments = 80) {
    this.line(Array.from({ length: segments }, (_, i) => {
      const a = i / segments * Math.PI * 2
      return [x + Math.cos(a) * radius, y, z + Math.sin(a) * radius]
    }), stroke, true)
  }

  solid(geometry: THREE.BufferGeometry, p: Point = [0, 0, 0], fill: Fill = 'paper',
    outline: Stroke | false = 'edge', rotation: Point = [0, 0, 0], smooth = false) {
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(1, 1, 1),
    )
    geometry.applyMatrix4(transform)
    if (outline) {
      const edges = new THREE.EdgesGeometry(geometry, 24)
      const vertices = edges.getAttribute('position')
      const data = this.contours.get(outline) ?? []
      this.contours.set(outline, data)
      for (let i = 0; i < vertices.count; i++) data.push(vertices.getX(i), vertices.getY(i), vertices.getZ(i))
      edges.dispose()
    }
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    if (flat !== geometry) geometry.dispose()
    flat.deleteAttribute('uv')
    if (smooth) this.shells.push(flat.clone())
    const group = this.surfaces.get(fill) ?? []
    this.surfaces.set(fill, group)
    group.push(flat)
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number,
    fill: Fill = 'paper', outline: Stroke | false = 'edge', rotation: Point = [0, 0, 0]) {
    this.solid(new THREE.BoxGeometry(w, h, d), [x, y, z], fill, outline, rotation)
  }

  cylinder(r: number, h: number, x: number, y: number, z: number, fill: Fill = 'paper', topR = r) {
    this.solid(new THREE.CylinderGeometry(topR, r, h, 80), [x, y, z], fill, false, [0, 0, 0], true)
    this.ring(r, y - h / 2, x, z)
    if (topR > 0) this.ring(topR, y + h / 2, x, z)
  }

  beam(a: Point, b: Point, width = 0.12, fill: Fill = 'paper', outline: Stroke | false = 'edge') {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b)
    const delta = end.clone().sub(start)
    const geo = new THREE.BoxGeometry(width, delta.length(), width)
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()))
    this.solid(geo, start.add(end).multiplyScalar(0.5).toArray(), fill, outline)
  }

  face(vertices: Point[], fill: Fill = 'paper', outline: Stroke | false = 'edge') {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3))
    const indices: number[] = []
    for (let i = 1; i < vertices.length - 1; i++) indices.push(0, i, i + 1)
    geo.setIndex(indices)
    geo.computeVertexNormals()
    this.solid(geo, [0, 0, 0], fill, false)
    if (outline) this.line(vertices, outline, true)
  }

  finish() {
    for (const [fill, geometries] of this.surfaces) {
      const merged = mergeGeometries(geometries)
      if (!merged) throw new Error(`Could not merge ${this.name} surfaces`)
      const mesh = new THREE.Mesh(merged, fills[fill])
      mesh.name = `${this.name}: ${fill} surfaces`
      this.add(mesh)
      geometries.forEach(g => g.dispose())
    }
    if (this.shells.length) {
      const merged = mergeGeometries(this.shells)!
      const mesh = new THREE.Mesh(merged, silhouette)
      mesh.name = `${this.name}: smooth silhouettes`
      mesh.renderOrder = 1
      this.add(mesh)
      this.shells.forEach(g => g.dispose())
    }
    for (const [stroke, segments] of this.contours) {
      if (!segments.length) continue
      const geometry = new LineSegmentsGeometry().setPositions(segments)
      const ink = new LineSegments2(geometry, strokes[stroke])
      ink.name = `${this.name}: ${stroke} ink`
      ink.renderOrder = 2
      this.add(ink)
    }
    this.surfaces.clear()
    this.contours.clear()
    this.shells = []
    return this
  }
}
