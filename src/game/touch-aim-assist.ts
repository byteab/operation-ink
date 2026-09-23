import * as THREE from 'three'
import type { Enemy } from './ai'
import type { HitVolume } from './hit-reactions'
import type { CollisionWorld } from '../player/collision'
import { TOUCH_AIM_ASSIST as RULES } from './balance'

type AimTarget = { enemy: Enemy; bone: HitVolume['bone']; point: THREE.Vector3; score: number }
type AimFrame = { enabled: boolean; strength: number; range: number; reducedMotion: boolean }

/** Touch-only camera attraction. Shots still use the ordinary crosshair and collision rules. */
export class TouchAimAssist {
  private locked: { enemy: Enemy; bone: HitVolume['bone'] } | null = null
  private projection = new THREE.Matrix4()
  private frustum = new THREE.Frustum()
  private bounds = new THREE.Sphere(new THREE.Vector3(), 1.9)
  private projected = new THREE.Vector3()
  private direction = new THREE.Vector3()
  private rotation = new THREE.Euler(0, 0, 0, 'YXZ')

  reset() { this.locked = null }

  update(dt: number, camera: THREE.PerspectiveCamera, enemies: readonly Enemy[],
    world: Pick<CollisionWorld, 'visible' | 'rayDistance'>, frame: AimFrame) {
    if (!frame.enabled || frame.strength >= RULES.freeTurnStrength || !(dt > 0) || !Number.isFinite(dt)) {
      this.reset(); return
    }
    camera.updateWorldMatrix(true, false)
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projection)
    const origin = camera.position, aspectScale = Math.min(1, camera.aspect)
    const candidates: AimTarget[] = []
    for (const enemy of enemies) {
      if (enemy.health <= 0 || enemy.state === 'dead' || enemy.state === 'reserve' || !enemy.actor.root.visible) continue
      this.bounds.center.copy(enemy.position).y += 0.85
      if (origin.distanceTo(this.bounds.center) > frame.range + this.bounds.radius || !this.frustum.intersectsSphere(this.bounds)) continue
      for (const volume of enemy.actor.hitVolumes.volumes()) {
        const point = volume.a.clone().lerp(volume.b, 0.5)
        if (origin.distanceToSquared(point) > frame.range * frame.range) continue
        this.projected.copy(point).project(camera)
        if (this.projected.z < -1 || this.projected.z > 1 || Math.abs(this.projected.x) > 1 || Math.abs(this.projected.y) > 1) continue
        const distance = Math.hypot(this.projected.x * camera.aspect, this.projected.y) / aspectScale
        const retained = this.locked?.enemy === enemy && this.locked.bone === volume.bone
        if (distance > (retained ? RULES.releaseRadius : RULES.acquireRadius)) continue
        candidates.push({ enemy, bone: volume.bone, point, score: distance * (retained ? RULES.retainedBias : 1) })
      }
    }
    // Only ray-test plausible targets, closest to the crosshair first. Test each
    // body part separately so an exposed head can win over a torso behind cover.
    candidates.sort((a, b) => a.score - b.score || origin.distanceToSquared(a.point) - origin.distanceToSquared(b.point))
    const target = candidates.find(candidate => {
      const distance = this.direction.copy(candidate.point).sub(origin).length()
      return world.visible(origin, candidate.point, candidate.enemy.actor.root) &&
        world.rayDistance(origin, this.direction.normalize(), distance) >= distance - 0.01
    })
    if (!target) { this.reset(); return }
    this.locked = { enemy: target.enemy, bone: target.bone }
    this.direction.copy(target.point).sub(origin).normalize()
    this.rotation.setFromQuaternion(camera.quaternion, 'YXZ')
    const yaw = Math.atan2(-this.direction.x, -this.direction.z)
    const pitch = THREE.MathUtils.clamp(Math.asin(this.direction.y), -1.5, 1.5)
    const dx = Math.atan2(Math.sin(yaw - this.rotation.y), Math.cos(yaw - this.rotation.y))
    const dy = pitch - this.rotation.x
    const angle = Math.hypot(dx, dy)
    if (angle < 1e-7) return
    // A deliberate turn always wins. Scope magnification shrinks both the
    // capture area in world space and the maximum correction speed.
    const influence = 1 - THREE.MathUtils.smoothstep(frame.strength, 0.1, RULES.freeTurnStrength)
    const step = Math.min(dt, 0.05)
    const zoomScale = Math.min(1, Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2) / Math.tan(Math.PI / 6))
    const motionScale = frame.reducedMotion ? 0.5 : 1
    const fraction = Math.min(1 - Math.exp(-RULES.followRate * influence * motionScale * step),
      RULES.maxRadiansPerSecond * zoomScale * influence * motionScale * step / angle)
    this.rotation.y += dx * fraction
    this.rotation.x += dy * fraction
    camera.quaternion.setFromEuler(this.rotation)
  }
}
