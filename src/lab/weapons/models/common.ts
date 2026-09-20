import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createPenSilhouette, createPenStrokeMesh, penEdgeMarks, penLineMarks, penPalette, penSeed, penStrokeGeometry,
  type SketchSegments } from '../../../render/ballpoint'

/** Gun frame: +Z forward, +Y up, origin at the centre of the firing-hand grip. Units are metres. */
export type GunName = 'pistol' | 'revolver' | 'smg' | 'ak' | 'shotgun' | 'sniper'
export type GunClass = 'pistol' | 'ak' | 'shotgun' | 'sniper'
export type Gun = THREE.Group & {
  userData: {
    name: GunName; cls: GunClass; twoHanded: boolean
    muzzle: THREE.Vector3; eject: THREE.Vector3; support?: THREE.Vector3
    parts: Record<string, THREE.Object3D>
  }
}

// Plain paper faces hide rear edges; black contours alone describe every gun part.
// Batched pieces carry gun-space coordinates, ten times larger than a piece's own, and the stroke and
// surface shaders round them differently: one depth unit no longer kept a contour in front of a coplanar
// face of the neighbouring piece (first-person pistol rear sight). Measured: 2 restores it, 3 starts to
// show hidden edges through thin plates in the lab.
const PAPER_OFFSET_UNITS = 2
export const metal = new THREE.MeshBasicMaterial({ color: penPalette.paper, toneMapped: false,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: PAPER_OFFSET_UNITS })
export const dark = metal
export const wood = metal
export type V = [number, number, number]

const CURVED = ['CylinderGeometry', 'SphereGeometry', 'ConeGeometry', 'TorusGeometry', 'CapsuleGeometry']
const PEN_WIDTH = 2.1

/** One rigid piece. `gun()` batches its paper faces, black contours and (for curved pieces) silhouette hull. */
export function part(geom: THREE.BufferGeometry, mat: THREE.Material, pos: V, rot: V = [0, 0, 0]) {
  // Push opaque paper a small depth-buffer amount behind its true edges. Keep
  // normal depth testing so fingers, other gun parts and world cover still occlude.
  if (!mat.transparent) {
    mat.polygonOffset = true
    mat.polygonOffsetFactor = 1
    mat.polygonOffsetUnits = PAPER_OFFSET_UNITS
  }
  const mesh = new THREE.Mesh(geom, mat)
  mesh.userData.seed = penSeed(`${geom.type}:${pos.join(',')}:${rot.join(',')}`)
  mesh.userData.hull = CURVED.includes(geom.type)
  mesh.position.set(...pos)
  mesh.rotation.set(...rot.map(v => v * THREE.MathUtils.DEG2RAD) as V)
  return mesh
}

/** An inked path with no surface of its own, batched into its owner's contours. */
export function path(points: THREE.Vector3[], seed: number, width: number) {
  const marker = new THREE.Object3D()
  marker.userData.path = { points, seed, width }
  return marker
}
export const box = (w: number, h: number, d: number, pos: V, mat = metal, rot?: V) =>
  part(new THREE.BoxGeometry(w, h, d), mat, pos, rot)
export const tube = (r: number, len: number, pos: V, mat = metal, rot: V = [90, 0, 0]) =>
  part(new THREE.CylinderGeometry(r, r, len, 16), mat, pos, rot)

type Batch = { fill?: THREE.BufferGeometry; hull?: THREE.BufferGeometry; ink?: ReturnType<typeof penStrokeGeometry> }
const batches = new Map<GunName, Batch[]>()

/**
 * A guard's gun used to be ~90 draw calls (a fill, a stroke mesh and often a hull per piece). Pieces that
 * move together now share one of each: the static body, and every entry of `parts` (slide, bolt, pump,
 * magazine...), which game and lab code animate as a unit. Each piece keeps its own stroke seed, so the
 * drawing is unchanged. The batched geometry is built once per model and shared by every copy of that gun.
 */
function batch(name: GunName, g: THREE.Group, parts: Record<string, THREE.Object3D>) {
  const owners = [g, ...Object.values(parts)]
  const pieces: THREE.Object3D[][] = owners.map(() => [])
  g.traverse(obj => {
    if (!(obj instanceof THREE.Mesh) && !obj.userData.path) return
    let owner = obj.parent!
    while (!owners.includes(owner)) owner = owner.parent!
    pieces[owners.indexOf(owner)].push(obj)
  })
  let built = batches.get(name)
  if (!built) {
    g.updateMatrixWorld(true)
    const local = new THREE.Matrix4(), point = new THREE.Vector3()
    built = owners.map((owner, i) => {
      const fills: THREE.BufferGeometry[] = [], hulls: THREE.BufferGeometry[] = []
      const marks: SketchSegments = { positions: [], colors: [], widths: [], offsets: [] }
      const inverse = owner.matrixWorld.clone().invert()
      for (const piece of pieces[i]) {
        local.multiplyMatrices(inverse, piece.matrixWorld)
        const first = marks.widths.length
        if (piece instanceof THREE.Mesh) {
          penEdgeMarks(piece.geometry, piece.userData.seed, 'edge', marks)
          const flat: THREE.BufferGeometry = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry.clone()
          flat.deleteAttribute('uv')
          fills.push(flat.applyMatrix4(local))
          if (piece.userData.hull) hulls.push(flat)
        } else {
          penLineMarks(piece.userData.path.points, piece.userData.path.seed, 'detail', marks)
          for (let j = first; j < marks.widths.length; j++) marks.widths[j] *= piece.userData.path.width / PEN_WIDTH
        }
        for (let j = first * 6; j < marks.positions.length; j += 3) {
          point.fromArray(marks.positions, j).applyMatrix4(local).toArray(marks.positions, j)
        }
      }
      const result: Batch = { fill: fills.length ? mergeGeometries(fills)! : undefined,
        hull: hulls.length ? mergeGeometries(hulls)! : undefined,
        ink: marks.widths.length ? penStrokeGeometry(marks, PEN_WIDTH, 'weapon') : undefined }
      fills.forEach(geometry => geometry.dispose())
      for (const geometry of [result.fill, result.hull, result.ink]) if (geometry) geometry.userData.shared = true
      return result
    })
    batches.set(name, built)
  }
  owners.forEach((owner, i) => {
    pieces[i].forEach(piece => piece.removeFromParent())
    const { fill, hull, ink } = built[i]
    if (fill) owner.add(new THREE.Mesh(fill, metal))
    if (hull) owner.add(createPenSilhouette(hull, PEN_WIDTH, penPalette.ink, 'weapon'))
    if (ink) owner.add(createPenStrokeMesh(ink, 'weapon'))
  })
}

export function gun(name: GunName, cls: GunClass, twoHanded: boolean, muzzle: V, eject: V,
  build: (g: THREE.Group, parts: Record<string, THREE.Object3D>) => void): Gun {
  const g = new THREE.Group() as Gun
  const parts: Record<string, THREE.Object3D> = {}
  build(g, parts)
  batch(name, g, parts)
  g.name = `gun:${name}`
  g.userData = { name, cls, twoHanded, muzzle: new THREE.Vector3(...muzzle), eject: new THREE.Vector3(...eject), parts }
  return g
}

/** Batched model geometry is shared between guns and lives as long as the page; anything added later is the gun's own. */
export function disposeGun(g: Gun) {
  const geometries = new Set<THREE.BufferGeometry>()
  g.traverse(obj => {
    if ((obj instanceof THREE.Mesh || obj instanceof THREE.Line) && !obj.geometry.userData.shared) geometries.add(obj.geometry)
  })
  for (const geometry of geometries) geometry.dispose()
  g.removeFromParent()
}
