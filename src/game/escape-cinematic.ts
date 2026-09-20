import * as THREE from 'three'
import { RESCUE_LAYOUT } from './rescue-layout'

export const ESCAPE_TIMING = { departure: 0.08, drive: 1.8, fade: 1.4, black: 1.85, menu: 2.05, end: 2.4 } as const
const smooth = THREE.MathUtils.smoothstep
const ACCELERATION = 0.4
const UP = new THREE.Vector3(0, 1, 0)

/** A stationary exterior shot; one clock owns vehicle travel, fade and menu reveal. */
export class EscapeCinematic {
  active = false
  elapsed = 0
  readonly position = new THREE.Vector3(...RESCUE_LAYOUT.escapeRoute[0])
  readonly rotation = new THREE.Quaternion()
  yaw = 0
  steering = 0
  private readonly route = RESCUE_LAYOUT.escapeRoute.map(point => new THREE.Vector3(...point))
  readonly length = this.route.slice(1).reduce((sum, point, i) => sum + point.distanceTo(this.route[i]), 0)
  private readonly cameraTarget = new THREE.Vector3(164, 0.8, 11)
  private readonly cameraOffset = new THREE.Vector3(-6, 5.6, 14)
  private readonly originalPosition = new THREE.Vector3()
  private readonly originalRotation = new THREE.Quaternion()
  private originalFov = 75

  get progress() {
    const t = THREE.MathUtils.clamp((this.elapsed - ESCAPE_TIMING.departure) / ESCAPE_TIMING.drive, 0, 1)
    const ramp = t / ACCELERATION
    // Integrate a smooth velocity ramp so acceleration has no abrupt start/end.
    const distance = t < ACCELERATION ? ACCELERATION * (ramp ** 3 - ramp ** 4 / 2) : t - ACCELERATION / 2
    return this.length * distance / (1 - ACCELERATION / 2)
  }
  get speed() {
    const t = (this.elapsed - ESCAPE_TIMING.departure) / ESCAPE_TIMING.drive
    if (t <= 0 || t >= 1) return 0
    return this.length / (ESCAPE_TIMING.drive * (1 - ACCELERATION / 2)) * smooth(t / ACCELERATION, 0, 1)
  }
  get crossedGate() { return this.progress >= this.length - 1e-6 }
  get fade() { return smooth(this.elapsed, ESCAPE_TIMING.fade, ESCAPE_TIMING.black) }
  get menuVisible() { return this.active && this.elapsed >= ESCAPE_TIMING.menu }
  get menuOpacity() { return smooth(this.elapsed, ESCAPE_TIMING.menu, ESCAPE_TIMING.end) }
  get running() { return this.active && this.elapsed < ESCAPE_TIMING.end }

  begin(camera: THREE.PerspectiveCamera) {
    this.originalPosition.copy(camera.position); this.originalRotation.copy(camera.quaternion); this.originalFov = camera.fov
    this.elapsed = 0; this.active = true
    this.position.copy(this.route[0])
    this.rotation.identity(); this.yaw = this.steering = 0
    this.applyCamera(camera)
  }

  update(dt: number) {
    if (!this.active) return
    this.elapsed = Math.min(ESCAPE_TIMING.end, this.elapsed + Math.max(0, dt))
    let remaining = this.progress
    for (let i = 1; i < this.route.length; i++) {
      const distance = this.route[i - 1].distanceTo(this.route[i])
      this.position.copy(this.route[i - 1]).lerp(this.route[i], Math.min(1, remaining / distance))
      if (remaining <= distance) break
      remaining -= distance
    }
    // Follow one shallow road curve. Body heading follows the travel tangent,
    // and wheel steering follows its curvature instead of yawing sideways.
    const s = this.progress / this.length
    if (s > 0 && s < 1) {
      const curve = Math.sin(Math.PI * s)
      const slope = -1.65 * Math.PI * curve ** 2 * Math.cos(Math.PI * s) / this.length
      const curvature = -1.65 * Math.PI ** 2 * (2 * curve * Math.cos(Math.PI * s) ** 2 - curve ** 3)
        / (this.length ** 2 * (1 + slope ** 2) ** 1.5)
      this.position.z -= 0.55 * curve ** 3
      this.yaw = -Math.atan(slope)
      this.steering = -Math.atan(3.2 * curvature)
    } else this.yaw = this.steering = 0
    this.rotation.setFromAxisAngle(UP, this.yaw)
  }

  applyCamera(camera: THREE.PerspectiveCamera) {
    // Fit the exit in portrait too. The stationary camera also avoids extra
    // motion for reduced-motion players: only the jeep moves, then a plain fade.
    camera.position.copy(this.cameraTarget).addScaledVector(this.cameraOffset, Math.max(1, 1.5 / camera.aspect))
    camera.lookAt(this.cameraTarget)
    if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix() }
  }

  reset(camera: THREE.PerspectiveCamera) {
    if (this.active) {
      camera.position.copy(this.originalPosition); camera.quaternion.copy(this.originalRotation)
      camera.fov = this.originalFov; camera.updateProjectionMatrix()
    }
    this.active = false; this.elapsed = 0; this.position.copy(this.route[0])
    this.rotation.identity(); this.yaw = this.steering = 0
  }
}
