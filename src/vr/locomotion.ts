import * as THREE from 'three'

/** Read only the standard thumbstick slots; Quest's first two axes are touchpad placeholders. */
export function thumbstick(gamepad: Pick<Gamepad, 'mapping' | 'axes'> | undefined) {
  if (!gamepad || gamepad.mapping !== 'xr-standard' || gamepad.axes.length < 4) return [0, 0] as const
  const x = gamepad.axes[2], y = gamepad.axes[3]
  const length = Math.hypot(x, y)
  if (length <= 0.18) return [0, 0] as const
  const scale = Math.min(1, (length - 0.18) / 0.82) / length
  return [x * scale, y * scale] as const
}

export class SnapTurn {
  private armed = true
  update(axis: number) {
    if (Math.abs(axis) < 0.25) this.armed = true
    if (!this.armed || Math.abs(axis) < 0.65) return 0
    this.armed = false
    return -Math.sign(axis) * Math.PI / 6
  }
  reset() { this.armed = true }
}

/** Virtual feet move with the collision body; local-floor supplies the actual eye height. */
export class VRRig extends THREE.Group {
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.06, 1600)
  readonly head = new THREE.PerspectiveCamera()
  private offset = new THREE.Vector3()
  private headPivot = new THREE.Vector3()
  private forward = new THREE.Vector3()
  private euler = new THREE.Euler(0, 0, 0, 'YXZ')

  constructor() { super(); this.name = 'VR player rig'; this.add(this.camera) }

  place(feet: THREE.Vector3, heading: THREE.Quaternion) {
    const headingYaw = this.euler.setFromQuaternion(heading, 'YXZ').y
    const trackedYaw = this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ').y
    this.rotation.set(0, headingYaw - trackedYaw, 0)
    this.offset.copy(this.camera.position).applyQuaternion(this.quaternion).setY(0).negate()
    this.sync(feet)
  }

  sync(feet: THREE.Vector3) {
    this.position.copy(feet).add(this.offset)
    this.updateWorldMatrix(true, true)
    // PlayerActions expects an unparented camera in world coordinates.
    this.camera.getWorldPosition(this.head.position)
    this.camera.getWorldQuaternion(this.head.quaternion)
    this.head.updateMatrixWorld()
  }

  turn(angle: number, feet: THREE.Vector3) {
    if (!angle) return
    this.headPivot.copy(this.head.position)
    this.rotation.y += angle
    this.offset.copy(this.camera.position).applyQuaternion(this.quaternion)
    this.offset.set(this.headPivot.x - feet.x - this.offset.x, 0, this.headPivot.z - feet.z - this.offset.z)
    this.sync(feet)
  }

  direction(x: number, y: number, result: THREE.Vector3) {
    this.head.getWorldDirection(this.forward)
    this.forward.y = 0
    if (this.forward.lengthSq() < 0.0001) this.forward.set(0, 0, -1).applyQuaternion(this.quaternion)
    this.forward.normalize()
    // 1.8 m/s at full deflection, using the existing body's 4.2 m/s walk speed.
    return result.set(-this.forward.z, 0, this.forward.x).multiplyScalar(x)
      .addScaledVector(this.forward, -y).multiplyScalar(1.8 / 4.2)
  }
}
