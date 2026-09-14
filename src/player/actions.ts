import * as THREE from 'three'
import { setDoorOpen } from '../world/doors'
import { EYE_HEIGHT, PlayerBody } from './body'

export type ActionTarget = {
  object: THREE.Object3D
  kind: 'door' | 'ladder'
  point: THREE.Vector3
  label: string
  descending: boolean
}

export class PlayerActions {
  readonly doors: THREE.Group[] = []
  readonly ladders: THREE.Object3D[] = []
  target: ActionTarget | null = null
  climbing: { object: THREE.Object3D; points: THREE.Vector3[]; descending: boolean } | null = null
  private direction = new THREE.Vector3()
  private offset = new THREE.Vector3()

  constructor(scene: THREE.Object3D, private body: PlayerBody) {
    scene.traverse(object => {
      if (object.userData.kind === 'door') this.doors.push(object as THREE.Group)
      if (object.userData.kind === 'ladder') this.ladders.push(object)
    })
  }

  ladderPoint(ladder: THREE.Object3D, top: boolean, outside = false) {
    const data = ladder.userData
    const y = top ? data.landingHeight : data.bottomHeight
    return ladder.localToWorld(new THREE.Vector3(0, y + 0.025, top && !outside ? -data.landingDepth - 0.18 : 0.44))
  }

  findTarget(camera: THREE.Camera): ActionTarget | null {
    this.target = null
    if (this.climbing) return null
    camera.getWorldDirection(this.direction)
    let best = Infinity
    const consider = (target: ActionTarget) => {
      this.offset.copy(target.point).sub(camera.position)
      const distance = this.offset.length()
      const facing = this.offset.normalize().dot(this.direction)
      if (distance > 2.65 || facing < 0.25 || !this.body.world.visible(camera.position, target.point, target.object)) return
      const score = distance + (1 - facing) * 1.4
      if (score < best) { best = score; this.target = target }
    }
    for (const door of this.doors) {
      // Follow the leaf when it swings so an open doorway still offers "Close".
      const hinge = door.children.find(child => child.userData.doorHinge)!
      const point = hinge.localToWorld(new THREE.Vector3(door.userData.width * 0.7, 1.2, 0))
      consider({ object: door, point, kind: 'door', label: door.userData.open ? 'Close door' : 'Open door', descending: false })
    }
    for (const ladder of this.ladders) for (const descending of [false, true]) {
      const endpoint = this.ladderPoint(ladder, descending)
      if (Math.abs(this.body.position.y - endpoint.y) > 1 ||
        Math.hypot(this.body.position.x - endpoint.x, this.body.position.z - endpoint.z) > 2.3) continue
      const point = endpoint.clone()
      point.y += descending ? 0.85 : 1.25
      consider({ object: ladder, point, kind: 'ladder', label: descending ? 'Climb down' : 'Climb up', descending })
    }
    return this.target
  }

  activate(camera: THREE.Camera) {
    // Recheck range and occlusion on the actual keypress, never use a stale prompt.
    const target = this.findTarget(camera)
    if (!target) return false
    if (target.kind === 'door') {
      const door = target.object as THREE.Group
      setDoorOpen(door, !door.userData.open)
    } else {
      const bottom = this.ladderPoint(target.object, false)
      const topOutside = this.ladderPoint(target.object, true, true)
      const top = this.ladderPoint(target.object, true)
      // Tank roofs slope up beyond the ladder; use the actual landing surface.
      const floor = this.body.world.floor(top, 0.7, 0.25)
      if (Number.isFinite(floor)) top.y = floor + 0.025
      topOutside.y = Math.max(topOutside.y, top.y)
      this.climbing = { object: target.object, descending: target.descending,
        points: target.descending ? [top, topOutside, bottom] : [bottom, topOutside, top] }
      this.body.velocity.set(0, 0, 0)
      this.target = null
      const inward = target.object.localToWorld(new THREE.Vector3(0, 0, -1)).sub(target.object.getWorldPosition(new THREE.Vector3())).normalize()
      camera.lookAt(camera.position.clone().add(inward).add(new THREE.Vector3(0, target.descending ? -0.2 : 0.25, 0)))
    }
    return true
  }

  updateClimb(dt: number) {
    if (!this.climbing) return false
    let travel = Math.min(dt, 0.05) * 2.7
    while (travel > 0 && this.climbing.points.length) {
      const next = this.climbing.points[0]
      const distance = this.body.position.distanceTo(next)
      if (distance <= travel) {
        this.body.position.copy(next)
        this.climbing.points.shift()
        travel -= distance
      } else {
        this.body.position.lerp(next, travel / distance)
        travel = 0
      }
    }
    if (!this.climbing.points.length) {
      this.climbing = null
      this.body.grounded = false
    }
    return true
  }

  syncCamera(camera: THREE.Camera) {
    camera.position.copy(this.body.position).y += EYE_HEIGHT
    camera.updateWorldMatrix(true, false)
  }

  reset() { this.climbing = null; this.target = null }
}
