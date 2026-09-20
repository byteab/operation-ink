import * as THREE from 'three'
import type { CollisionWorld } from '../player/collision'
import { EnemyNavigation } from './navigation'
import { RESCUE_LAYOUT } from './rescue-layout'
import { BOARD_SECONDS, HostageActor } from './hostage-actor'
import { HOSTAGE_RUN_SPEED } from './balance'
import type { Vec3 } from './types'

export type EscortHostage = {
  id: string
  status: 'captive' | 'following' | 'loaded'
  position: Vec3
  routeIndex: number
}

export type EscortMissionState = {
  hostages: EscortHostage[]
  jeep: 'waiting' | 'boarding' | 'escaping' | 'escaped'
  escapeProgress: number
}


type Travel = { detour: THREE.Vector3[]; stalled: number; retryAfter: number; previous: THREE.Vector3 | null;
  boardingFrom: THREE.Vector3 | null; boardingTime: number }

/** Authored multilevel corridor plus real capsule steps, shared with guard navigation. */
export class HostageEscort {
  readonly actors: HostageActor[] = []
  private disposed = false
  readonly jeepOffset = new THREE.Vector3()
  readonly jeepRotation = new THREE.Quaternion()
  private readonly jeepOrigin = new THREE.Vector3(...RESCUE_LAYOUT.escapeRoute[0])
  private navigation: EnemyNavigation
  private route = RESCUE_LAYOUT.escortRoute.map(point => new THREE.Vector3(...point))
  private lengths: number[] = [0]
  private routeLine = new THREE.Line3()
  private routePoint = new THREE.Vector3()
  private travel: Travel[] = []
  private calmFor = 0

  constructor(private scene: THREE.Scene, world: CollisionWorld, doors: THREE.Group[]) {
    this.navigation = new EnemyNavigation(world, doors, () => {})
    for (let index = 1; index < this.route.length; index++) {
      this.lengths[index] = this.lengths[index - 1] + this.route[index].distanceTo(this.route[index - 1])
    }
  }

  async init() {
    for (const position of RESCUE_LAYOUT.hostageSpawns) {
      const actor = await HostageActor.create()
      if (this.disposed) { actor.dispose(); return }
      actor.root.position.fromArray(position)
      this.scene.add(actor.root)
      this.travel.push(this.freshTravel())
      this.actors.push(actor)
    }
  }

  private freshTravel(): Travel { return { detour: [], stalled: 0, retryAfter: 0, previous: null, boardingFrom: null, boardingTime: 0 } }

  private progress(position: THREE.Vector3) {
    let bestDistance = Infinity, progress = 0
    for (let index = 1; index < this.route.length; index++) {
      const line = this.routeLine.set(this.route[index - 1], this.route[index])
      const t = line.closestPointToPointParameter(position, true)
      const distance = line.at(t, this.routePoint).distanceToSquared(position)
      if (distance < bestDistance) {
        bestDistance = distance
        progress = THREE.MathUtils.lerp(this.lengths[index - 1], this.lengths[index], t)
      }
    }
    return progress
  }

  private captiveRouteIndex(position: Vec3) {
    let closest = 0
    for (let index = 1; index < this.route.length; index++) {
      if (this.route[index].distanceToSquared(new THREE.Vector3(...position)) < this.route[closest].distanceToSquared(new THREE.Vector3(...position))) closest = index
    }
    return closest
  }

  sync(state: EscortMissionState) {
    this.jeepOffset.set(0, 0, 0)
    this.jeepRotation.identity()
    this.calmFor = 0
    this.navigation.clear()
    state.hostages.forEach((hostage, index) => {
      if (!this.actors[index]) return
      this.travel[index] = this.freshTravel()
      if (hostage.status === 'captive') hostage.routeIndex = this.captiveRouteIndex(hostage.position)
      this.actors[index].root.position.fromArray(hostage.position)
      this.actors[index].root.rotation.set(0, Math.PI / 2, 0)
      this.actors[index].restore(hostage.status === 'captive', hostage.status === 'loaded')
      this.actors[index].animate(0, false, false, hostage.status === 'loaded', hostage.status === 'captive')
    })
  }

  /** Rally clears detours and retries from the current, physically reached position. */
  rally(state: EscortMissionState) {
    this.navigation.clear()
    for (let index = 0; index < state.hostages.length; index++) {
      if (state.hostages[index].status !== 'following') continue
      const hostage = state.hostages[index]
      const position = new THREE.Vector3(...hostage.position)
      const next = this.route[hostage.routeIndex]
      this.travel[index] = this.freshTravel()
      if (next && Math.abs(next.y - position.y) < 0.4 && !this.navigation.segment(position, next)) {
        this.travel[index].detour = this.navigation.plan(position, next)
      }
    }
  }

  update(dt: number, state: EscortMissionState, playerFeet: THREE.Vector3, danger: boolean) {
    const elapsed = Math.max(0, Math.min(dt, 0.1))
    this.calmFor = danger ? 0 : this.calmFor + elapsed
    const leaderProgress = this.progress(playerFeet)
    state.hostages.forEach((hostage, index) => {
      const actor = this.actors[index], motion = this.travel[index]
      if (!actor || !motion) return
      const position = new THREE.Vector3(...hostage.position)
      let moving = false
      let moveSpeed = 0
      actor.advanceRelease(elapsed, hostage.status === 'captive')
      const cowering = hostage.status === 'following' && this.calmFor < 1.1
      if (hostage.status === 'loaded') {
        if (motion.boardingFrom) {
          motion.boardingTime = Math.min(BOARD_SECONDS, motion.boardingTime + elapsed)
          const t = motion.boardingTime / BOARD_SECONDS
          position.copy(motion.boardingFrom).lerp(new THREE.Vector3(...RESCUE_LAYOUT.jeepSeats[index]), t * t * (3 - 2 * t))
          if (t === 1) motion.boardingFrom = null
        } else position.fromArray(RESCUE_LAYOUT.jeepSeats[index])
        position.sub(this.jeepOrigin).applyQuaternion(this.jeepRotation).add(this.jeepOrigin).add(this.jeepOffset)
        actor.root.rotation.set(0, Math.PI / 2, 0)
        actor.root.quaternion.premultiply(this.jeepRotation)
      } else if (hostage.status === 'following' && actor.canWalk && !cowering) {
        const progress = this.progress(position)
        const led = leaderProgress + 1.6 >= progress
        motion.retryAfter = Math.max(0, motion.retryAfter - elapsed)
        let next = motion.detour[0] ?? this.route[hostage.routeIndex]
        if (next && position.distanceTo(next) < (hostage.routeIndex === this.route.length - 1 ? 0.18 : 0.33)) {
          if (motion.detour.length) motion.detour.shift()
          else hostage.routeIndex++
          next = motion.detour[0] ?? this.route[hostage.routeIndex]
          motion.stalled = 0
        }
        if (hostage.routeIndex >= this.route.length - 1 && position.distanceTo(new THREE.Vector3(...RESCUE_LAYOUT.jeepBoardPoint)) < 0.25) {
          hostage.status = 'loaded'
          if (state.jeep === 'waiting') state.jeep = 'boarding'
          motion.boardingFrom = position.clone()
          motion.boardingTime = 0
          actor.root.rotation.y = Math.PI / 2
        } else if (next && led) {
          const direction = next.clone().sub(position).setY(0).normalize()
          const waitingForCompanion = state.hostages.some((other, otherIndex) => {
            if (otherIndex === index || other.status !== 'following') return false
            const separation = new THREE.Vector3(...other.position).sub(position)
            if (Math.abs(separation.y) > 0.45 || separation.lengthSq() > 0.7 * 0.7) return false
            const ahead = separation.dot(direction)
            const closer = next!.distanceToSquared(new THREE.Vector3(...other.position)) - next!.distanceToSquared(position)
            return ahead > -0.08 && (closer < -0.01 || (Math.abs(closer) <= 0.01 && otherIndex < index))
          })
          if (waitingForCompanion) {
            actor.animate(elapsed, false, false, false, false)
            return
          }
          const stepped = this.navigation.step(position, next, elapsed * HOSTAGE_RUN_SPEED)
          if (stepped && stepped.distanceToSquared(position) > 0.000001) {
            actor.root.rotation.y = Math.atan2(stepped.x - position.x, stepped.z - position.z)
            motion.previous = position.clone()
            moveSpeed = Math.hypot(stepped.x - position.x, stepped.z - position.z) / elapsed
            position.copy(stepped)
            moving = true
            motion.stalled = 0
          } else {
            motion.stalled += elapsed
            if (motion.stalled > 1.5 && !motion.retryAfter) {
              // Local replanning never uses the single-height grid to bypass a staircase.
              if (Math.abs(next.y - position.y) < 0.4) motion.detour = this.navigation.plan(position, next)
              else if (motion.previous && this.navigation.segment(position, motion.previous, false)) motion.detour = [motion.previous.clone()]
              motion.retryAfter = 3
              motion.stalled = 0
            }
          }
        }
      }
      hostage.position = position.toArray() as Vec3
      actor.root.position.copy(position)
      actor.animate(elapsed, moving, cowering, hostage.status === 'loaded', hostage.status === 'captive', moveSpeed)
    })
  }

  dispose() {
    this.disposed = true
    for (const actor of this.actors) actor.dispose()
    this.navigation.clear()
  }
}
