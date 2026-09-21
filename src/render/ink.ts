import * as THREE from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { penDistanceGLSL, penPalette, penRandom, penSeed, sketchSegments, type SketchSegments } from './ballpoint'

export type Point = [number, number, number]
export type Fill = 'paper' | 'roof' | 'concrete' | 'glass' | 'green' | 'rock'
export type Stroke = 'edge' | 'detail' | 'mesh' | 'landscape'

export const palette = {
  paper: penPalette.paper, roof: penPalette.paper, concrete: penPalette.paper,
  glass: penPalette.paper, green: penPalette.paper, rock: penPalette.paper,
  ink: penPalette.ink,
}

export type HatchOptions = { spacing?: number; inset?: number; seed?: number; cross?: boolean; stroke?: Stroke }

const fills = Object.fromEntries(
  (['paper', 'roof', 'concrete', 'glass', 'green', 'rock'] as Fill[]).map(name => [name,
    new THREE.MeshBasicMaterial({
      color: palette[name], side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }),
  ]),
) as Record<Fill, THREE.MeshBasicMaterial>

// Every role shares one material; its width rides in instancePenWidth so a Draft's ink is a single draw call.
const strokeWidths: Record<Stroke, number> = { edge: 2.2, detail: 1.35, mesh: 0.72, landscape: 1.3 }
const strokeMaterial = new LineMaterial({ color: 0xffffff, vertexColors: true, linewidth: 1 })
strokeMaterial.depthTest = true
strokeMaterial.depthWrite = false
strokeMaterial.alphaToCoverage = true
strokeMaterial.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader
    .replace('uniform float linewidth;', `uniform float linewidth;
      ${penDistanceGLSL}
      attribute float instancePenWidth;
      attribute vec2 instancePenOffset;`)
    .replace('// ndc space', `// Stable pen deviation in pixels, without shifting the line's depth.
      // Per-endpoint depth lets long roads taper within a single batched mesh.
      float penStartScale = penDistanceScale(-start.z);
      float penEndScale = penDistanceScale(-end.z);
      float penWidthScale = (position.y < 0.5) ? penStartScale : penEndScale;
      vec2 penDirection = (clipEnd.xy / clipEnd.w - clipStart.xy / clipStart.w) * resolution;
      penDirection /= max(length(penDirection), 0.0001);
      vec2 penNormal = vec2(-penDirection.y, penDirection.x);
      clipStart.xy += penNormal * instancePenOffset.x * penStartScale * 2.0 / resolution * clipStart.w;
      clipEnd.xy += penNormal * instancePenOffset.y * penEndScale * 2.0 / resolution * clipEnd.w;
      // ndc space`)
    .replace('offset *= linewidth;', 'offset *= linewidth * instancePenWidth * penWidthScale;')
}
strokeMaterial.customProgramCacheKey = () => 'ballpoint-world-strokes-v2'

// Smooth objects need a moving silhouette, not a wireframe of their tessellation.
// Expand back faces with the same distance taper as the surrounding pen strokes.
const silhouette = new THREE.ShaderMaterial({
  uniforms: {
    ink: { value: new THREE.Color(palette.ink) },
    resolution: { value: new THREE.Vector2(1, 1) },
    width: { value: 1.15 },
  },
  vertexShader: `
    uniform vec2 resolution;
    uniform float width;
    ${penDistanceGLSL}
    void main() {
      vec4 view = modelViewMatrix * vec4(position, 1.0);
      vec4 clip = projectionMatrix * view;
      vec3 n = normalize(normalMatrix * normal);
      vec4 tip = projectionMatrix * vec4(view.xyz + n, 1.0);
      vec2 direction = (tip.xy * clip.w - clip.xy * tip.w) * resolution;
      direction /= max(length(direction), 0.0001);
      float pressure = 0.88 + 0.12 * sin(position.y * 8.7 + position.x * 3.1 + position.z * 5.3);
      clip.xy += direction * width * pressure * penDistanceScale(-view.z) * 2.0 / resolution * clip.w;
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
  strokeMaterial.resolution.set(width, height)
  silhouette.uniforms.resolution.value.set(width, height)
}

/** Single-sided ink lettering, placed just outside a wall with no backing board. */
export function wallText(text: string, position: Point, height = 0.6, angle = 0) {
  const root = new THREE.Group()
  root.name = `Wall text · ${text}`
  root.position.set(...position)
  root.rotation.y = angle
  root.userData = { noCollision: true, decorative: true, text }
  if (typeof document === 'undefined') return root
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return root
  const font = '88px "Chalkboard SE", "Comic Sans MS", cursive'
  context.font = font
  canvas.width = Math.ceil(context.measureText(text).width) + 24
  canvas.height = 128
  context.font = font
  context.fillStyle = `#${palette.ink.toString(16).padStart(6, '0')}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const lettering = new THREE.Mesh(new THREE.PlaneGeometry(height * canvas.width / canvas.height, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
  lettering.name = `${text} lettering`
  root.add(lettering)
  return root
}

const up = new THREE.Vector3(0, 1, 0)

// EdgesGeometry spent a third of the compound build re-deriving the same 12 edges for every box.
// Record them once as vertex indices; any transformed box replays them in the identical order.
const boxEdgeIndices = (() => {
  const box = new THREE.BoxGeometry(1, 2, 3), edges = new THREE.EdgesGeometry(box, 24)
  const corner = box.getAttribute('position'), end = edges.getAttribute('position')
  const indices = Array.from({ length: end.count }, (_, i) => {
    for (let j = 0; j < corner.count; j++) {
      if (corner.getX(j) === end.getX(i) && corner.getY(j) === end.getY(i) && corner.getZ(j) === end.getZ(i)) return j
    }
    throw new Error('Box edge template does not match BoxGeometry')
  })
  box.dispose(); edges.dispose()
  return indices
})()

/** One semantic environment object, with its static surfaces and ink batched by material. */
export class Draft extends THREE.Group {
  private surfaces = new Map<Fill, THREE.BufferGeometry[]>()
  private contours = new Map<Stroke, number[]>()
  private shells: THREE.BufferGeometry[] = []
  private hatchIndex = 0

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

  /** Sparse diagonal marks on a local patch. u and v are full surface span vectors. */
  hatch(origin: Point, u: Point, v: Point, options: HatchOptions = {}) {
    const width = Math.hypot(...u), height = Math.hypot(...v)
    const inset = Math.max(0, options.inset ?? 0.12)
    const w = width - inset * 2, h = height - inset * 2
    if (w <= 0 || h <= 0) return
    const random = penRandom(options.seed ?? penSeed(`${this.name}:hatch:${this.hatchIndex++}`))
    const point = (x: number, y: number): Point => [
      origin[0] + u[0] * (x + inset) / width + v[0] * (y + inset) / height,
      origin[1] + u[1] * (x + inset) / width + v[1] * (y + inset) / height,
      origin[2] + u[2] * (x + inset) / width + v[2] * (y + inset) / height,
    ]
    const spacing = Math.max(0.035, options.spacing ?? 0.8, (w + h) / 180)
    for (const slope of options.cross ? [0.76, -0.84] : [0.76]) {
      const reach = Math.abs(slope) * h
      for (let intercept = -reach; intercept <= w + reach; intercept += spacing * (0.85 + random() * 0.3)) {
        if (random() < 0.12) continue
        let low = Math.max(0, Math.min(-intercept / slope, (w - intercept) / slope))
        let high = Math.min(h, Math.max(-intercept / slope, (w - intercept) / slope))
        if (high <= low) continue
        const length = high - low
        low += length * random() * 0.1
        high -= length * random() * 0.16
        this.line([point(intercept + slope * low, low), point(intercept + slope * high, high)], options.stroke ?? 'mesh')
      }
    }
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
      const data = this.contours.get(outline) ?? []
      this.contours.set(outline, data)
      const corners = geometry.getAttribute('position')
      if (geometry.type === 'BoxGeometry' && corners.count === 24) {
        for (const i of boxEdgeIndices) data.push(corners.getX(i), corners.getY(i), corners.getZ(i))
      } else {
        const edges = new THREE.EdgesGeometry(geometry, 24)
        const vertices = edges.getAttribute('position')
        for (let i = 0; i < vertices.count; i++) data.push(vertices.getX(i), vertices.getY(i), vertices.getZ(i))
        edges.dispose()
      }
    }
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    if (flat !== geometry) geometry.dispose()
    flat.deleteAttribute('uv')
    if (smooth) this.shells.push(flat.clone())
    // Every fill is the same white paper, so they batch into one mesh. Glass and
    // concrete stay separate only because game code and checks find them by name.
    const batch = fill === 'glass' || fill === 'concrete' ? fill : 'paper'
    const group = this.surfaces.get(batch) ?? []
    this.surfaces.set(batch, group)
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
      mesh.userData.noCollision = true
      mesh.onBeforeRender = (renderer, _scene, camera) => {
        const viewport = (camera as THREE.PerspectiveCamera).viewport
        if (renderer.xr.isPresenting && viewport) {
          silhouette.uniforms.resolution.value.set(viewport.z, viewport.w)
          silhouette.uniformsNeedUpdate = true
        }
      }
      this.add(mesh)
      this.shells.forEach(g => g.dispose())
    }
    // Painted in the order the separate role materials used to sort: grey hatching over black edges.
    const marks: SketchSegments = { positions: [], colors: [], widths: [], offsets: [] }
    for (const stroke of Object.keys(strokeWidths) as Stroke[]) {
      const segments = this.contours.get(stroke)
      if (!segments?.length) continue
      const first = marks.widths.length
      sketchSegments(segments, penSeed(`${this.name}:${stroke}`), stroke, undefined, undefined, marks)
      for (let i = first; i < marks.widths.length; i++) marks.widths[i] *= strokeWidths[stroke]
    }
    if (marks.widths.length) {
      const geometry = new LineSegmentsGeometry().setPositions(marks.positions).setColors(marks.colors)
      geometry.setAttribute('instancePenWidth', new THREE.InstancedBufferAttribute(new Float32Array(marks.widths), 1))
      geometry.setAttribute('instancePenOffset', new THREE.InstancedBufferAttribute(new Float32Array(marks.offsets), 2))
      const ink = new LineSegments2(geometry, strokeMaterial)
      ink.name = `${this.name}: ink`
      ink.renderOrder = 2
      ink.userData.noCollision = true
      const updateResolution = ink.onBeforeRender
      ;(ink as THREE.Mesh).onBeforeRender = (renderer, _scene, camera) => {
        updateResolution.call(ink, renderer)
        const viewport = (camera as THREE.PerspectiveCamera).viewport
        if (renderer.xr.isPresenting && viewport) {
          ink.material.resolution.set(viewport.z, viewport.w)
          ink.material.uniformsNeedUpdate = true
        }
      }
      this.add(ink)
    }
    this.surfaces.clear()
    this.contours.clear()
    this.shells = []
    return this
  }
}
