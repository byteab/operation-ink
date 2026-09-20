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
  lock.box(0.27, 0.27, 0.018, 0, 0.045, 0.087, 'paper', 'detail')
  const indicator = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.21),
    new THREE.MeshBasicMaterial({ color: CELL_LOCK_GREEN, toneMapped: false }))
  indicator.name = 'Green cell lock indicator'
  indicator.position.set(0, 0.045, 0.099)
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
