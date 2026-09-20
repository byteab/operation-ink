import * as THREE from 'three'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'

/** Black pen scenery on white paper, with solid black characters. */
export const penPalette = {
  paper: 0xffffff,
  character: 0x000000,
  ink: 0x000000,
  dark: 0x000000,
  light: 0x808080,
  faint: 0xbdbdbd,
} as const

export type PenRole = 'edge' | 'detail' | 'mesh' | 'landscape'
export type PenMaterialOptions = { density?: number; scale?: number; seed?: number }
export type PenDistanceProfile = 'world' | 'weapon'

/** Weapon details are centimetres apart, so their contours must thin before scenery's. */
function distanceShader(profile: PenDistanceProfile) {
  const [near, falloff, minimum] = profile === 'weapon' ? [2, 10, 0.1] : [8, 32, 0.24]
  return `
  float penDistanceScale(float viewDepth) {
    // Orthographic plan views have no perspective distance shrinkage.
    if (projectionMatrix[2][3] != -1.0) return 1.0;
    float depthRatio = max(viewDepth - ${near.toFixed(1)}, 0.0) / ${falloff.toFixed(1)};
    return ${minimum} + ${(1 - minimum).toFixed(2)} / (1.0 + depthRatio * depthRatio);
  }
`
}

/** Shared scenery taper for strokes and silhouettes, measured in view-space metres. */
export const penDistanceGLSL = distanceShader('world')

/** Semantic seeds survive reloads and are independent of the scene's allocation order. */
export function penSeed(value: string | number): number {
  const text = String(value)
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return hash >>> 0
}

export function penRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ state >>> 15, 1 | state)
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

type CompileHook = THREE.MeshBasicMaterial['onBeforeCompile'] & { penBaseHook?: THREE.MeshBasicMaterial['onBeforeCompile'] }

/**
 * Surface-attached hatching, composed with existing skinning hooks. Position and
 * normal are sampled in bind space, so the drawing deforms with animated meshes.
 * Re-applying this decorator also works on clones which copied the source hooks.
 * The material remains MeshBasicMaterial: world collision uses that distinction.
 */
export function applyPenMaterial<T extends THREE.MeshBasicMaterial>(material: T, options: PenMaterialOptions = {}): T {
  const previous = material.onBeforeCompile as CompileHook
  const baseHook = previous.penBaseHook ?? previous
  const baseKey = material.customProgramCacheKey()
  const density = THREE.MathUtils.clamp(options.density ?? 0.65, 0, 1)
  const scale = Math.max(0.01, options.scale ?? 36)
  const seed = (options.seed ?? 1) % 8191
  const hook: CompileHook = function (this: THREE.MeshBasicMaterial, shader, renderer) {
    baseHook.call(this, shader, renderer)
    Object.assign(shader.uniforms, {
      penPaper: { value: new THREE.Color(penPalette.paper) },
      penInk: { value: new THREE.Color(penPalette.ink) },
      penDark: { value: new THREE.Color(penPalette.dark) },
      penDensity: { value: density }, penScale: { value: scale }, penSeedValue: { value: seed },
    })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPenPosition;
        varying vec3 vPenNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPenPosition = position;
        vPenNormal = normal;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPenPosition;
        varying vec3 vPenNormal;
        uniform vec3 penPaper;
        uniform vec3 penInk;
        uniform vec3 penDark;
        uniform float penDensity;
        uniform float penScale;
        uniform float penSeedValue;

        float penStroke(float phase, float width) {
          float footprint = max(fwidth(phase), 0.0001);
          float distanceToStroke = abs(fract(phase) - 0.5);
          float mark = 1.0 - smoothstep(width - footprint * 0.65, width + footprint * 0.65, distanceToStroke);
          // Subpixel hatch resolves to average pigment instead of sparkling.
          return mix(mark, min(width * 2.0, 1.0), smoothstep(0.35, 1.2, footprint));
        }
        float penHatch(vec2 p) {
          p += vec2(penSeedValue * 0.137, penSeedValue * 0.071);
          float first = p.x + p.y * 0.74 + 0.12 * sin(p.y * 1.9) + 0.055 * sin(p.x * 4.1);
          float second = p.x * 0.86 - p.y * 0.69 + 0.16 * sin(p.y * 1.25 + 1.7);
          float pressure = 0.82 + 0.18 * sin(p.y * 0.93 + p.x * 0.51);
          float width = mix(0.025, 0.25, penDensity) * pressure;
          float a = penStroke(first, width);
          float b = penStroke(second, width * 0.83) * smoothstep(0.18, 0.76, penDensity);
          float worked = penStroke(p.x * 0.43 + p.y * 1.21 + 0.16 * sin(p.y * 2.4), width * 0.61);
          worked *= smoothstep(0.58, 0.96, penDensity);
          return 1.0 - (1.0 - a) * (1.0 - b) * (1.0 - worked);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 penP = vPenPosition * penScale;
        vec3 penWeights = pow(abs(normalize(vPenNormal)), vec3(6.0));
        penWeights /= max(dot(penWeights, vec3(1.0)), 0.0001);
        float penCoverage = dot(penWeights, vec3(penHatch(penP.yz), penHatch(penP.xz), penHatch(penP.xy)));
        penCoverage *= step(0.001, penDensity);
        vec3 penPigment = mix(penInk, penDark, penCoverage * 0.6);
        diffuseColor.rgb = mix(penPaper, penPigment, penCoverage);`)
  }
  hook.penBaseHook = baseHook
  material.onBeforeCompile = hook
  material.customProgramCacheKey = () => `${baseKey}|ballpoint-v1:${density}:${scale}:${seed}`
  material.userData.pen = { density, scale, seed }
  material.needsUpdate = true
  return material
}

export type SketchSegments = { positions: number[]; colors: number[]; widths: number[]; offsets: number[] }
type SketchProfile = { retraceScale?: number; deviationScale?: number; pressureScale?: number }
const paper = new THREE.Color(penPalette.paper)
const roleColors: Record<PenRole, THREE.Color> = {
  edge: new THREE.Color(penPalette.ink), detail: new THREE.Color(penPalette.ink),
  mesh: new THREE.Color(penPalette.light), landscape: new THREE.Color(penPalette.ink),
}

/**
 * Keep depth coordinates on the source edge. The line shader applies the small
 * transverse deviations in pixels; physical geometry and occlusion stay intact.
 * Pass `result` to append several roles into one batch.
 */
export function sketchSegments(segments: ArrayLike<number>, seed: number, role: PenRole, spacing = 0.8, profile: SketchProfile = {},
  result: SketchSegments = { positions: [], colors: [], widths: [], offsets: [] }): SketchSegments {
  const random = penRandom(seed)
  const color = new THREE.Color()
  const fine = role === 'mesh'
  const deviationScale = profile.deviationScale ?? 1
  const pressureScale = profile.pressureScale ?? 1
  const append = (a: THREE.Vector3, b: THREE.Vector3, start: number, end: number, retrace: boolean) => {
    const length = a.distanceTo(b)
    const count = Math.max(1, Math.min(12, Math.ceil(length * (end - start) / spacing)))
    const phase = random() * Math.PI * 2
    const amplitude = (fine ? 0.18 : role === 'edge' ? 0.68 : 0.42) * deviationScale
    const bias = retrace ? (random() < 0.5 ? -1 : 1) * (0.65 + random() * 0.7) * deviationScale : 0
    const offset = (t: number) => bias + Math.sin(t * Math.PI) * Math.sin(t * 5.2 + phase) * amplitude
    for (let i = 0; i < count; i++) {
      const t0 = start + (end - start) * i / count, t1 = start + (end - start) * (i + 1) / count
      result.positions.push(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.z + (b.z - a.z) * t0,
        a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1, a.z + (b.z - a.z) * t1)
      result.offsets.push(offset(t0), offset(t1))
      const pressure = 0.5 + 0.5 * Math.sin(phase + i * 0.73)
      result.widths.push(retrace ? 0.68 + pressure * 0.14 : 1 - 0.16 * pressureScale + pressure * 0.3 * pressureScale)
      for (const t of [t0, t1]) {
        const pressureFade = 0.5 + 0.5 * Math.sin(phase + t * 7.1)
        const lightness = retrace ? 0.28 + pressureFade * 0.12
          : fine ? 0.05 + pressureFade * 0.14 : 0.025 + pressureFade * 0.075
        color.copy(roleColors[role]).lerp(paper, lightness)
        result.colors.push(color.r, color.g, color.b)
      }
    }
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3()
  for (let i = 0; i < segments.length; i += 6) {
    a.set(segments[i], segments[i + 1], segments[i + 2])
    b.set(segments[i + 3], segments[i + 4], segments[i + 5])
    if (a.distanceToSquared(b) < 1e-12) continue
    append(a, b, 0, 1, false)
    const chance = role === 'edge' ? 0.38 : role === 'landscape' ? 0.2 : role === 'detail' ? 0.13 : 0
    if (a.distanceTo(b) > spacing * 0.35 && random() < chance * (profile.retraceScale ?? 1)) {
      const start = random() * 0.35
      append(a, b, start, Math.min(1, start + 0.3 + random() * 0.46), true)
    }
  }
  return result
}

function createEdgeMaterial(distance: PenDistanceProfile) {
  const material = new LineMaterial({ color: 0xffffff, vertexColors: true, linewidth: 2.1,
    depthTest: true, depthWrite: false, alphaToCoverage: true, toneMapped: false })
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('uniform float linewidth;', `uniform float linewidth;
        ${distanceShader(distance)}
        attribute float instancePenWidth;
        attribute vec2 instancePenOffset;`)
      .replace('// ndc space', `// Foreground contours stay continuous with only a small pressure variation.
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
  material.customProgramCacheKey = () => `ballpoint-foreground-edges-v4:${distance}`
  return material
}
const edgeMaterials = { world: createEdgeMaterial('world'), weapon: createEdgeMaterial('weapon') }
const penViewport = new THREE.Vector4()

/** Logical desktop viewport keeps widths in CSS pixels despite supersampling. */
function updatePenResolution(resolution: THREE.Vector2, renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
  renderer.getViewport(penViewport)
  const viewport = (camera as THREE.PerspectiveCamera).viewport
  resolution.set(renderer.xr.isPresenting && viewport ? viewport.z : penViewport.z,
    renderer.xr.isPresenting && viewport ? viewport.w : penViewport.w)
}

/** Hard-edge strokes in the geometry's own space. Pass `result` to batch several parts into one stroke mesh. */
export function penEdgeMarks(geometry: THREE.BufferGeometry, seed: number, role: PenRole = 'detail', result?: SketchSegments) {
  // Curved pieces get a separate silhouette. Keep their cap rims, not the facets
  // of low-segment cylinders or spheres, as authored hard edges.
  const curved = ['CylinderGeometry', 'SphereGeometry', 'ConeGeometry', 'TorusGeometry', 'CapsuleGeometry'].includes(geometry.type)
  const source = new THREE.EdgesGeometry(geometry, curved ? 60 : 25)
  const marks = sketchSegments(source.getAttribute('position').array, seed, role, 0.07,
    { retraceScale: 0.18, deviationScale: 0.12, pressureScale: 0.25 }, result)
  source.dispose()
  return marks
}

/** An authored connected path, without extracting triangle edges. */
export function penLineMarks(points: readonly THREE.Vector3[], seed: number, role: PenRole = 'detail', result?: SketchSegments) {
  const segments: number[] = []
  for (let i = 1; i < points.length; i++) segments.push(...points[i - 1].toArray(), ...points[i].toArray())
  return sketchSegments(segments, seed, role, 0.07, { retraceScale: 0, deviationScale: 0.12, pressureScale: 0.25 }, result)
}

/** Caller owns the returned geometry; all gun outlines share the material. */
export function createPenEdges(geometry: THREE.BufferGeometry, seed: number, role: PenRole = 'detail',
  distance: PenDistanceProfile = 'world'): LineSegments2 {
  return createPenStrokeMesh(penStrokeGeometry(penEdgeMarks(geometry, seed, role), 2.1, distance), distance)
}

/** Draw an authored connected path directly, without extracting triangle edges. */
export function createPenLines(points: readonly THREE.Vector3[], seed: number, role: PenRole = 'detail', width = 1.8,
  distance: PenDistanceProfile = 'world'): LineSegments2 {
  const line = createPenStrokeMesh(penStrokeGeometry(penLineMarks(points, seed, role), width, distance), distance)
  line.name = 'Continuous black pen path'
  return line
}

/** `marks.widths` are pressures; `width` is their pen width in CSS px. */
export function penStrokeGeometry(marks: SketchSegments, width: number, distance: PenDistanceProfile) {
  const lineGeometry = new LineSegmentsGeometry().setPositions(marks.positions).setColors(marks.colors)
  const widths = marks.widths.map(pressure => pressure * width / edgeMaterials[distance].linewidth)
  lineGeometry.setAttribute('instancePenWidth', new THREE.InstancedBufferAttribute(new Float32Array(widths), 1))
  lineGeometry.setAttribute('instancePenOffset', new THREE.InstancedBufferAttribute(new Float32Array(marks.offsets), 2))
  return lineGeometry
}

/** The geometry may be shared between meshes; the caller owns it. */
export function createPenStrokeMesh(lineGeometry: LineSegmentsGeometry, distance: PenDistanceProfile): LineSegments2 {
  const edgeMaterial = edgeMaterials[distance]
  const line = new LineSegments2(lineGeometry, edgeMaterial)
  line.name = 'Continuous black pen edges'
  line.userData.noCollision = true
  line.renderOrder = 2
  ;(line as THREE.Mesh).onBeforeRender = (renderer, _scene, camera) => {
    updatePenResolution(edgeMaterial.resolution, renderer, camera)
    edgeMaterial.uniformsNeedUpdate = true
  }
  return line
}

const silhouetteMaterials = new Map<string, THREE.ShaderMaterial>()

/**
 * A view-dependent outline for smooth parts. The source geometry is shared, not
 * copied or mutated; the caller retains ownership. The hull tests scene depth and
 * never writes it, so hands and other parts can still hide it normally.
 */
export function createPenSilhouette(geometry: THREE.BufferGeometry, width = 2.1,
  color: THREE.ColorRepresentation = penPalette.ink, distance: PenDistanceProfile = 'world'): THREE.Mesh {
  const pigment = new THREE.Color(color)
  const key = `${width}:${pigment.getHexString()}:${distance}`
  let material = silhouetteMaterials.get(key)
  if (!material) {
    material = new THREE.ShaderMaterial({
      uniforms: { ink: { value: pigment }, resolution: { value: new THREE.Vector2(1, 1) }, width: { value: width } },
      vertexShader: `
        uniform vec2 resolution;
        uniform float width;
        ${distanceShader(distance)}
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          vec4 clip = projectionMatrix * view;
          vec3 viewNormal = normalize(normalMatrix * normal);
          vec4 tip = projectionMatrix * vec4(view.xyz + viewNormal, 1.0);
          vec2 direction = (tip.xy * clip.w - clip.xy * tip.w) * resolution;
          direction /= max(length(direction), 0.0001);
          clip.xy += direction * width * penDistanceScale(-view.z) * 2.0 / resolution * clip.w;
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
      side: THREE.BackSide, depthTest: true, depthWrite: false, toneMapped: false,
    })
    silhouetteMaterials.set(key, material)
  }
  const hullMaterial = material
  const shell = new THREE.Mesh(geometry, hullMaterial)
  shell.name = 'Black pen silhouette'
  shell.userData.noCollision = true
  shell.renderOrder = 1
  shell.onBeforeRender = (renderer, _scene, camera) => {
    updatePenResolution(hullMaterial.uniforms.resolution.value, renderer, camera)
    hullMaterial.uniformsNeedUpdate = true
  }
  return shell
}
