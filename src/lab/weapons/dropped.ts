import * as THREE from 'three'
import type { Ctx } from '../registry'
import { disposeGun, type Gun } from './models'

type Dropped = {
  gun: Gun
  corners: THREE.Vector3[]
  velocity: THREE.Vector3
  spin: THREE.Vector3
  landing?: { from: THREE.Quaternion; to: THREE.Quaternion; elapsed: number }
  resting: boolean
}
const dropped: Dropped[] = []
const FLOOR = 0.006
const GRAVITY = 9.8
const SETTLE_TIME = 0.45
const point = new THREE.Vector3(), direction = new THREE.Vector3()
const rotation = new THREE.Quaternion(), angles = new THREE.Euler()

/** Cache each rigid part's bounds in gun space once, including protruding magazines and sights. */
function bounds(gun: Gun) {
  gun.updateWorldMatrix(true, true)
  const inverse = gun.matrixWorld.clone().invert(), transform = new THREE.Matrix4()
  const corners: THREE.Vector3[] = []
  gun.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.geometry.computeBoundingBox()
    const box = obj.geometry.boundingBox
    if (!box) return
    transform.multiplyMatrices(inverse, obj.matrixWorld)
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
      corners.push(new THREE.Vector3(x, y, z).applyMatrix4(transform))
  })
  return corners
}

function floorHeight(item: Dropped) {
  item.gun.updateMatrixWorld(true)
  let min = Infinity
  for (const corner of item.corners) min = Math.min(min, point.copy(corner).applyMatrix4(item.gun.matrixWorld).y)
  return min
}

/** Detach the actual weapon without changing its visible transform or the death animation. */
export function dropGun(gun: Gun, ctx: Ctx) {
  if (dropped.some(item => item.gun === gun)) return
  ctx.scene.attach(gun)
  const rootRotation = ctx.rig.root.getWorldQuaternion(new THREE.Quaternion())
  dropped.push({
    gun, corners: bounds(gun),
    // A small sideways release lets the body fall without landing on its weapon.
    velocity: new THREE.Vector3(-0.9, 0.12, 0.12).applyQuaternion(rootRotation),
    spin: new THREE.Vector3(1.2, -0.6, 2.8), resting: false,
  })
}

/** Scene reset, holster, or the next equip removes the previous dropped weapon. */
export function clearDroppedGuns() {
  for (const item of dropped) disposeGun(item.gun)
  dropped.length = 0
}

function step(item: Dropped, dt: number) {
  if (item.resting) return
  const { gun, velocity } = item
  velocity.y -= GRAVITY * dt
  gun.position.addScaledVector(velocity, dt)
  if (item.landing) {
    const landing = item.landing
    landing.elapsed += dt
    const t = Math.min(1, landing.elapsed / SETTLE_TIME)
    gun.quaternion.slerpQuaternions(landing.from, landing.to, t * t * (3 - 2 * t))
    const friction = Math.exp(-8 * dt)
    velocity.x *= friction; velocity.z *= friction
  } else {
    angles.set(item.spin.x * dt, item.spin.y * dt, item.spin.z * dt)
    gun.quaternion.premultiply(rotation.setFromEuler(angles))
  }

  const bottom = floorHeight(item)
  if (bottom < FLOOR) {
    gun.position.y += FLOOR - bottom
    if (!item.landing) {
      direction.set(0, 0, 1).applyQuaternion(gun.quaternion)
      const yaw = Math.atan2(direction.x, direction.z)
      item.landing = {
        from: gun.quaternion.clone(),
        to: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.PI / 2, 'YXZ')),
        elapsed: 0,
      }
      velocity.y = Math.min(0.45, Math.abs(velocity.y) * 0.14)
    } else velocity.y = 0
  }
  if (item.landing && item.landing.elapsed >= SETTLE_TIME) {
    gun.quaternion.copy(item.landing.to)
    gun.position.y += FLOOR - floorHeight(item)
    velocity.set(0, 0, 0)
    item.resting = true
  }
}

/** Lightweight rigid-prop fall; time follows the same pause/speed control as the character. */
export function update(dt: number, ctx: Ctx) {
  let remaining = Math.min(2, dt * ctx.player.mixer.timeScale)
  if (remaining <= 0) return
  while (remaining > 0) {
    const delta = Math.min(remaining, 1 / 120)
    for (const item of dropped) step(item, delta)
    remaining -= delta
  }
}
