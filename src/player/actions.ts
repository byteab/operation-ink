import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { setDoorOpen } from '../world/doors'
import { EYE_HEIGHT, PlayerBody } from './body'

export type ActionTarget = {
  object: THREE.Object3D
  kind: 'door' | 'ladder' | 'zipline' | 'pickup' | 'mission'
  point: THREE.Vector3
  label: string
  descending: boolean
  use?: () => boolean
  icon?: string
}

export class PlayerActions {
  readonly doors: THREE.Group[] = []
  readonly ladders: THREE.Object3D[] = []
  readonly ziplines: THREE.Object3D[] = []
  private readonly stairs: THREE.Object3D[] = []
  private cameraFeet = new THREE.Vector3()
  private cameraLanding = 0
  target: ActionTarget | null = null
  climbing: { object: THREE.Object3D; points: THREE.Vector3[]; descending: boolean } | null = null
  riding: { object: THREE.Object3D; points: THREE.Vector3[]; start: THREE.Vector3; end: THREE.Vector3;
    distance: number; remaining: number; destination: string } | null = null
  get traversing() { return !!(this.climbing || this.riding) }
  extraTargets: () => ActionTarget[] = () => []
  onAction: (target: ActionTarget) => void = () => {}
  private direction = new THREE.Vector3()
  private offset = new THREE.Vector3()
  private boardingCapsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.28)
  private boardingPoint = new THREE.Vector3()

  constructor(scene: THREE.Object3D, private body: PlayerBody) {
    scene.traverse(object => {
      if (object.userData.kind === 'door') this.doors.push(object as THREE.Group)
      if (object.userData.kind === 'ladder') this.ladders.push(object)
      if (object.userData.kind === 'stairs') this.stairs.push(object)
      if (object.userData.kind === 'zipline' && object.userData.gameplay) this.ziplines.push(object)
    })
  }

  ladderPoint(ladder: THREE.Object3D, top: boolean, outside = false) {
    const data = ladder.userData
    const y = top ? data.landingHeight : data.bottomHeight
    return ladder.localToWorld(new THREE.Vector3(0, y + 0.025, top && !outside ? -data.landingDepth - 0.18 : 0.44))
  }

  ziplinePoint(zipline: THREE.Object3D, end: boolean) {
    return zipline.localToWorld(new THREE.Vector3().fromArray(zipline.userData[end ? 'endLanding' : 'startLanding']))
  }

  private boardingClear(endpoint: THREE.Vector3) {
    // Eye-level visibility can see over rails. Check the standing player's short
    // approach too, so boarding cannot pull their body through a rail or post.
    const steps = Math.max(1, Math.ceil(this.body.position.distanceTo(endpoint) / 0.15))
    for (let i = 0; i <= steps; i++) {
      this.boardingPoint.copy(this.body.position).lerp(endpoint, i / steps)
      this.boardingCapsule.start.copy(this.boardingPoint).y += 0.28
      this.boardingCapsule.end.copy(this.boardingPoint).y += 1.52
      if (!this.body.world.fits(this.boardingCapsule)) return false
    }
    return true
  }

  private syncTrolley(object: THREE.Object3D) {
    const trolley = object.children.find(child => child.userData.kind === 'zipline-trolley')
    if (!trolley) return
    const data = object.userData, point = object.worldToLocal(this.body.position.clone())
    const from = new THREE.Vector3().fromArray(data.start), to = new THREE.Vector3().fromArray(data.end)
    const dx = to.x - from.x, dz = to.z - from.z
    const t = THREE.MathUtils.clamp(((point.x - from.x) * dx + (point.z - from.z) * dz) / (dx * dx + dz * dz), 0, 1)
    point.copy(from).lerp(to, t).y -= 4 * data.sag * t * (1 - t)
    trolley.position.copy(point).sub(new THREE.Vector3().fromArray(trolley.userData.origin))
  }

  findTarget(camera: THREE.Camera): ActionTarget | null {
    this.target = null
    if (this.traversing) return null
    camera.getWorldDirection(this.direction)
    let best = Infinity
    const consider = (target: ActionTarget) => {
      this.offset.copy(target.point).sub(camera.position)
      const distance = this.offset.length()
      const facing = this.offset.normalize().dot(this.direction)
      if (distance > 2.65 || facing < 0.25 || !this.body.world.visible(camera.position, target.point, target.object)) return
      const score = distance + (1 - facing) * 1.4
      if (score < best && (target.kind !== 'zipline' || this.boardingClear(this.ziplinePoint(target.object, target.descending)))) {
        best = score; this.target = target
      }
    }
    for (const door of this.doors) {
      if (door.userData.missionLocked) continue
      // Follow the leaf when it swings so an open doorway still offers "Close".
      const hinge = door.children.find(child => child.userData.doorHinge)!
      const point = hinge.localToWorld(new THREE.Vector3(door.userData.width * 0.7, 1.2, 0))
      consider({ object: door, point, kind: 'door', label: door.userData.open ? 'Close' : 'Open', descending: false })
    }
    for (const ladder of this.ladders) for (const descending of [false, true]) {
      const endpoint = this.ladderPoint(ladder, descending)
      if (Math.abs(this.body.position.y - endpoint.y) > 1 ||
        Math.hypot(this.body.position.x - endpoint.x, this.body.position.z - endpoint.z) > 2.3) continue
      const point = endpoint.clone()
      point.y += descending ? 0.85 : 1.25
      consider({ object: ladder, point, kind: 'ladder', label: descending ? 'Climb down' : 'Climb up', descending })
    }
    for (const zipline of this.ziplines) {
      // Only the water tower is a launch point; the lower tower is arrival-only.
      const endpoint = this.ziplinePoint(zipline, false)
      if (Math.abs(this.body.position.y - endpoint.y) > 0.8 ||
        Math.hypot(this.body.position.x - endpoint.x, this.body.position.z - endpoint.z) > 2.3) continue
      const point = endpoint.clone().add(new THREE.Vector3(0, 1.3, 0))
      consider({ object: zipline, point, kind: 'zipline', descending: false,
        label: 'Ride zipline' })
    }
    for (const target of this.extraTargets()) consider(target)
    return this.target
  }

  activate(camera: THREE.Camera, climb: 'animated' | 'instant' = 'animated') {
    // Recheck range and occlusion on the actual keypress, never use a stale prompt.
    const target = this.findTarget(camera)
    if (!target) return false
    if (target.kind === 'door') {
      const door = target.object as THREE.Group
      setDoorOpen(door, !door.userData.open)
    } else if (target.kind === 'ladder') {
      const bottom = this.ladderPoint(target.object, false)
      const topOutside = this.ladderPoint(target.object, true, true)
      const top = this.ladderPoint(target.object, true)
      // Tank roofs slope up beyond the ladder; use the actual landing surface.
      const floor = this.body.world.floor(top, 0.7, 0.25)
      if (Number.isFinite(floor)) top.y = floor + 0.025
      topOutside.y = Math.max(topOutside.y, top.y)
      if (target.descending) {
        // The interaction points include a small clearance margin. Do not lift
        // a grounded player into that margin before starting the descent.
        top.y = Math.min(top.y, this.body.position.y)
        topOutside.y = Math.min(topOutside.y, this.body.position.y)
      }
      this.climbing = { object: target.object, descending: target.descending,
        points: target.descending ? [top, topOutside, bottom] : [bottom, topOutside, top] }
      this.body.velocity.set(0, 0, 0)
      this.target = null
      if (climb === 'instant') {
        // VR uses a blink to the same landing, without moving or rotating the headset.
        this.body.teleport(this.climbing.points[this.climbing.points.length - 1])
        this.climbing = null
        return true
      }
      // Keep the player's view: boarding must not jerk the camera toward the wall.
    } else if (target.kind === 'zipline') {
      const object = target.object, data = object.userData
      const start = this.ziplinePoint(object, false), end = this.ziplinePoint(object, true)
      if (climb === 'instant') {
        this.body.teleport(end)
      } else {
        const from = new THREE.Vector3().fromArray(data.start), to = new THREE.Vector3().fromArray(data.end)
        const points = [start]
        for (let i = 0; i <= 96; i++) {
          const t = i / 96
          const point = from.clone().lerp(to, t)
          point.y -= data.anchorHeightAboveDeck - 0.031 + 4 * data.sag * t * (1 - t)
          // Tuck the legs at either platform lip so the descending cable never
          // pulls the standing capsule through the landing plate.
          point.y += 0.25 * (Math.exp(-t * data.horizontalSpan / 2) + Math.exp(-(1 - t) * data.horizontalSpan / 2))
          points.push(object.localToWorld(point))
        }
        points.push(end)
        let distance = this.body.position.distanceTo(points[0])
        for (let i = 1; i < points.length; i++) distance += points[i - 1].distanceTo(points[i])
        this.riding = { object, points, start, end, distance, remaining: distance,
          destination: 'Observation tower' }
        this.body.velocity.set(0, 0, 0)
        this.body.grounded = false
      }
      this.syncTrolley(object)
      this.target = null
    } else if (!target.use?.()) return false
    this.onAction(target)
    return true
  }

  updateClimb(dt: number) {
    if (!this.climbing) return false
    let travel = Math.max(0, Math.min(dt, 0.05)) * 2.7
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

  updateTraversal(dt: number) {
    if (!this.riding) return this.updateClimb(dt)
    const ride = this.riding
    let travel = Math.max(0, Math.min(dt, 0.05)) * 11
    while (travel > 0 && ride.points.length) {
      const next = ride.points[0], distance = this.body.position.distanceTo(next)
      const moved = Math.min(distance, travel)
      if (distance <= travel) { this.body.position.copy(next); ride.points.shift() }
      else this.body.position.lerp(next, travel / distance)
      travel -= moved
      ride.remaining = Math.max(0, ride.remaining - moved)
    }
    this.syncTrolley(ride.object)
    if (!ride.points.length) {
      this.body.teleport(ride.end)
      this.riding = null
    }
    return true
  }

  syncCamera(camera: THREE.Camera, dt = 0) {
    const feet = this.body.position
    this.cameraLanding = dt <= 0 ? 0 : this.climbing ? 0.3 : Math.max(0, this.cameraLanding - dt)
    let height = feet.y + EYE_HEIGHT
    if (dt > 0 && this.body.grounded && !this.traversing) {
      for (const stairs of this.stairs) {
        const data = stairs.userData
        const local = stairs.worldToLocal(feet.clone())
        const [x, bottom, start] = data.bottom, [, top, end] = data.top
        if (Math.abs(local.x - x) > data.width / 2 || local.z < start || local.z > end) continue
        const ramp = THREE.MathUtils.lerp(bottom, top, (local.z - start) / (end - start))
        if (Math.abs(local.y - ramp) > 0.45) continue
        // Render a continuous incline while the physical capsule still follows
        // the real treads. This removes the repeated drop on each stair.
        height = stairs.localToWorld(local.setY(ramp + 0.002)).y + EYE_HEIGHT
        break
      }
    }
    const smooth = dt > 0 && this.cameraFeet.distanceToSquared(feet) < 1 &&
      Math.abs(camera.position.y - height) < 0.7 &&
      (this.body.grounded || !!this.climbing || (this.cameraLanding > 0 && this.body.velocity.y <= 0))
    const previousY = camera.position.y
    camera.position.copy(feet)
    camera.position.y = smooth ? THREE.MathUtils.lerp(previousY, height, 1 - Math.exp(-18 * dt)) : height
    this.cameraFeet.copy(feet)
    camera.updateWorldMatrix(true, false)
  }

  reset() {
    // Inspection/VR changes can cancel transit; never leave the player over the void.
    if (this.riding) {
      this.body.teleport(this.riding.remaining > this.riding.distance / 2 ? this.riding.start : this.riding.end)
      this.syncTrolley(this.riding.object)
    }
    this.riding = null; this.climbing = null; this.target = null
  }
}
