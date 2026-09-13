import * as THREE from 'three'
import { palette } from '../../../render/ink'

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

export const metal = new THREE.MeshBasicMaterial({ color: 0x4b555d })
export const dark = new THREE.MeshBasicMaterial({ color: 0x353d44 })
export const wood = new THREE.MeshBasicMaterial({ color: 0x8c7355 })
export const edge = new THREE.LineBasicMaterial({ color: palette.ink })
export type V = [number, number, number]

/** Mesh and hard-edge ink lines; materials are shared, geometry belongs to the gun. */
export function part(geom: THREE.BufferGeometry, mat: THREE.Material, pos: V, rot: V = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geom, mat)
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), edge))
  mesh.position.set(...pos)
  mesh.rotation.set(...rot.map(v => v * THREE.MathUtils.DEG2RAD) as V)
  return mesh
}
export const box = (w: number, h: number, d: number, pos: V, mat = metal, rot?: V) =>
  part(new THREE.BoxGeometry(w, h, d), mat, pos, rot)
export const tube = (r: number, len: number, pos: V, mat = metal, rot: V = [90, 0, 0]) =>
  part(new THREE.CylinderGeometry(r, r, len, 16), mat, pos, rot)

export function gun(name: GunName, cls: GunClass, twoHanded: boolean, muzzle: V, eject: V,
  build: (g: THREE.Group, parts: Record<string, THREE.Object3D>) => void): Gun {
  const g = new THREE.Group() as Gun
  const parts: Record<string, THREE.Object3D> = {}
  build(g, parts)
  g.name = `gun:${name}`
  g.userData = { name, cls, twoHanded, muzzle: new THREE.Vector3(...muzzle), eject: new THREE.Vector3(...eject), parts }
  return g
}

export function disposeGun(g: Gun) {
  const geometries = new Set<THREE.BufferGeometry>()
  g.traverse(obj => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) geometries.add(obj.geometry)
  })
  for (const geometry of geometries) geometry.dispose()
  g.removeFromParent()
}
