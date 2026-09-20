import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { CollisionWorld } from './collision'

export const EYE_HEIGHT = 1.65
const HEIGHT = 1.8
const RADIUS = 0.28
const STEP_HEIGHT = 0.34
const SUPPORT_RADIUS = RADIUS + 0.04

/** Metres and seconds; short simulation steps prevent sprinting through thin walls. */
export class PlayerBody {
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  grounded = false
  /** Downward speed at ground contact, retained across this frame's substeps. */
  landingSpeed = 0
  private capsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), RADIUS)
  private candidate = new THREE.Vector3()
  private delta = new THREE.Vector3()

  constructor(readonly world: CollisionWorld) {}

  teleport(position: THREE.Vector3) {
    this.position.copy(position)
    this.velocity.set(0, 0, 0)
    this.grounded = false
    this.landingSpeed = 0
  }

  private placeCapsule(position = this.position) {
    this.capsule.start.copy(position).y += RADIUS
    this.capsule.end.copy(position).y += HEIGHT - RADIUS
    return this.capsule
  }

  jump() {
    if (!this.grounded) return false
    this.velocity.y = 7
    this.grounded = false
    return true
  }

  update(dt: number, direction: THREE.Vector3, sprint: boolean) {
    this.landingSpeed = 0
    const steps = Math.max(1, Math.ceil(Math.min(dt, 0.05) / (1 / 120)))
    const step = Math.min(dt, 0.05) / steps
    for (let i = 0; i < steps; i++) this.step(step, direction, sprint)
  }

  private step(dt: number, direction: THREE.Vector3, sprint: boolean) {
    const wasGrounded = this.grounded
    const acceleration = 1 - Math.exp(-(wasGrounded ? 18 : 5) * dt)
    const speed = sprint ? 7.6 : 4.2
    this.velocity.x += (direction.x * speed - this.velocity.x) * acceleration
    this.velocity.z += (direction.z * speed - this.velocity.z) * acceleration
    if (wasGrounded && this.velocity.y < 0) this.velocity.y = 0
    this.velocity.y -= 22 * dt
    this.delta.copy(this.velocity).multiplyScalar(dt)
    this.candidate.copy(this.position).add(this.delta)

    if (wasGrounded) {
      const floor = this.world.floor(this.candidate, STEP_HEIGHT, STEP_HEIGHT, SUPPORT_RADIUS)
      const rise = floor - this.position.y
      if (rise > 0.002 && rise <= STEP_HEIGHT) {
        this.candidate.y = floor + 0.002
        if (this.world.fits(this.placeCapsule(this.candidate))) {
          this.position.y = this.candidate.y
          this.delta.y = 0
          this.velocity.y = 0
        }
      }
    }

    this.position.add(this.delta)
    this.placeCapsule()
    const downwardSpeed = Math.max(0, -this.velocity.y)
    this.grounded = this.world.resolve(this.capsule, this.velocity)
    this.position.copy(this.capsule.start).y -= RADIUS

    // Follow descending stairs while grounded; jumping and free falls retain gravity.
    if (wasGrounded && this.velocity.y <= 0) {
      const floor = this.world.floor(this.position, 0.025, STEP_HEIGHT, SUPPORT_RADIUS)
      if (floor >= this.position.y - STEP_HEIGHT && floor <= this.position.y + 0.025) {
        this.candidate.copy(this.position).y = floor + 0.002
        if (this.world.fits(this.placeCapsule(this.candidate))) {
          this.position.copy(this.candidate)
          this.grounded = true
        }
      }
    }
    if (this.grounded) {
      if (!wasGrounded) this.landingSpeed = Math.max(this.landingSpeed, downwardSpeed)
      this.velocity.y = 0
    }
    if (this.velocity.lengthSq() < 0.00001) this.velocity.set(0, 0, 0)
  }
}
