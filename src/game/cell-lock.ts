import * as THREE from 'three'
import { Draft } from '../render/ink'
import type { Station } from './types'

export const CELL_LOCK_GREEN = 0x229447

/** Door-mounted release lock: the housing and interaction point follow the leaf. */
export function createCellLock(door: THREE.Group): Station {
  const hinge = door.children.find(child => child.userData.doorHinge)!
  const id = door.userData.hostageId as string
  const lock = new Draft('Cell door release lock')
  lock.position.set(door.userData.width - 0.25, 1.22, 0.12)
  lock.userData = { noCollision: true, kind: 'mission-station', stationKind: 'hostage', stationId: id }
  lock.box(0.36, 0.46, 0.16, 0, 0, 0, 'concrete', 'detail')
  const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.039, 0.012, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }))
  bezel.name = 'Cell lock light bezel'
  bezel.rotation.x = Math.PI / 2
  bezel.position.set(0.095, 0.135, 0.085)
  lock.add(bezel)
  const indicator = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16),
    new THREE.MeshBasicMaterial({ color: CELL_LOCK_GREEN, toneMapped: false }))
  indicator.name = 'Green cell lock indicator'
  indicator.scale.z = 0.45
  // Keep the light above the central interaction marker so it stays visible.
  indicator.position.set(0.095, 0.135, 0.094)
  lock.add(indicator)
  const keyhole = new THREE.Mesh(new THREE.CircleGeometry(0.024, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }))
  keyhole.position.set(0, -0.135, 0.082)
  lock.add(keyhole)
  lock.line([[0, -0.14, 0.083], [0, -0.19, 0.083]], 'detail')
  hinge.add(lock.finish())
  return { id, kind: 'hostage', object: lock, label: 'Unlock',
    get point() { return lock.localToWorld(new THREE.Vector3(0, 0.045, 0.11)) } }
}
