import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import type { CollisionWorld } from '../player/collision'

export const DEATH_TIMING = { impact: 1.06, darkened: 3.35, menu: 3.7, end: 4.25 } as const
const ease = THREE.MathUtils.smoothstep

/** One clock drives the fall, loss of vision, impact sound and menu handoff. */
export class PlayerDeathSequence {
  elapsed = 0
  active = false
  reducedMotion = false
  private start = new THREE.Vector3()
  private rest = new THREE.Vector3()
  private rotation = new THREE.Quaternion()
  private restRotation = new THREE.Quaternion()
  private lastPosition = new THREE.Vector3()
  private candidate = new THREE.Vector3()
  private head = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.13)
  private impactPlayed = false
  private bulletImpact = false
  private hitRotation = new THREE.Vector3()

  /** A fatal round always lands with full weight, even at one remaining HP. */
  get hitKick() {
    if (!this.active || !this.bulletImpact || this.reducedMotion) return 0
    return ease(this.elapsed, 0, 0.065) * (1 - ease(this.elapsed, 0.065, 0.42))
  }
  get hitSide() { return this.hitRotation.z / 0.14 }

  get running() { return this.active && this.elapsed < DEATH_TIMING.end }
  get menuVisible() { return this.active && this.elapsed >= DEATH_TIMING.menu }
  get visionLoss() { return ease(this.elapsed, 0.75, DEATH_TIMING.darkened) }
  get menuOpacity() { return ease(this.elapsed, DEATH_TIMING.menu, DEATH_TIMING.end) }

  begin(camera: THREE.PerspectiveCamera, feet: THREE.Vector3, world: CollisionWorld, reducedMotion: boolean, bulletDirection?: THREE.Vector3) {
    this.reset()
    this.active = true
    this.reducedMotion = reducedMotion
    this.start.copy(camera.position)
    this.lastPosition.copy(this.start)
    this.rotation.copy(camera.quaternion)
    const yaw = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').y
    if (bulletDirection && bulletDirection.lengthSq() > 1e-10) {
      this.bulletImpact = true
      const local = bulletDirection.clone().normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw)
      // A single directional head snap hands off to the falling body's momentum.
      this.hitRotation.set(0.14 + local.z * 0.045, -local.x * 0.09, -local.x * 0.14)
    }
    this.restRotation.setFromEuler(new THREE.Euler(1.48, yaw + 0.025, -0.045, 'YXZ'))
    const backward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    const floor = world.floor(feet, 0.35, 100)
    const support = Number.isFinite(floor) ? floor : feet.y
    this.rest.set(feet.x, support + 0.22, feet.z)
    // Keep the head on its current platform and leave space behind it. Thin
    // fences participate in fits(), even when they intentionally pass bullets.
    for (let distance = 0.05; distance <= 0.65; distance += 0.05) {
      this.candidate.copy(feet).addScaledVector(backward, distance)
      const height = world.floor(this.candidate, 0.35, 100)
      if (!Number.isFinite(height) || Math.abs(height - support) > 0.3) break
      const edge = world.floor(this.candidate.clone().addScaledVector(backward, this.head.radius), 0.35, 100)
      if (!Number.isFinite(edge) || Math.abs(edge - support) > 0.3) break
      this.candidate.y = height + 0.22
      this.head.start.copy(this.candidate); this.head.end.copy(this.candidate)
      if (!world.fits(this.head)) break
      this.rest.copy(this.candidate)
    }
  }

  /** Returns true once, on ground contact, even when a frame crosses the cue. */
  update(dt: number, camera: THREE.PerspectiveCamera, world: CollisionWorld) {
    if (!this.active) return false
    this.elapsed = Math.min(DEATH_TIMING.end, this.elapsed + Math.max(0, Number.isFinite(dt) ? dt : 0))
    if (!this.reducedMotion) {
      const fall = ease(this.elapsed, 0.06, DEATH_TIMING.impact)
      const kick = this.hitKick
      // Kick toward the already collision-checked resting point, never off a ledge.
      const travel = Math.min(1, ease(this.elapsed, 0.08, 1.18) + kick * 0.14)
      const bounce = this.elapsed > DEATH_TIMING.impact
        ? Math.sin(Math.PI * ease(this.elapsed, DEATH_TIMING.impact, 1.4)) : 0
      const desired = this.start.clone().lerp(this.rest, travel)
      desired.y = THREE.MathUtils.lerp(this.start.y, this.rest.y, fall) + bounce * 0.028
      // Sweep a small head volume; never jump through a wall on a slow frame.
      const from = this.lastPosition.clone(), steps = Math.max(1, Math.ceil(from.distanceTo(desired) / 0.035))
      for (let index = 1; index <= steps; index++) {
        this.candidate.copy(from).lerp(desired, index / steps)
        this.head.start.copy(this.candidate); this.head.end.copy(this.candidate)
        if (!world.fits(this.head)) break
        this.lastPosition.copy(this.candidate)
      }
      camera.position.copy(this.lastPosition)
      // The head lags the collapsing body; a single soft rebound settles it.
      camera.quaternion.slerpQuaternions(this.rotation, this.restRotation, ease(this.elapsed, 0.16, 1.44))
      camera.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
        this.hitRotation.x * kick, this.hitRotation.y * kick, this.hitRotation.z * kick, 'YXZ')))
      camera.rotateX(-bounce * 0.025)
    }
    const impact = !this.impactPlayed && this.elapsed >= DEATH_TIMING.impact
    this.impactPlayed ||= impact
    return impact
  }

  reset() { this.active = false; this.elapsed = 0; this.impactPlayed = false; this.bulletImpact = false; this.hitRotation.set(0, 0, 0) }
}
