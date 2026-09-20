import * as THREE from 'three'
import type { PlayerSense, WeaponName } from './types'
import type { CollisionWorld } from '../player/collision'

export type PlayerHitRegion = 'head' | 'torso' | 'shoulder' | 'arm' | 'hand' | 'leg'
export type PlayerBulletHit = {
  region: PlayerHitRegion
  side: -1 | 0 | 1 // Anatomical left / centre / right, independent of the shooter.
  point: THREE.Vector3
  direction: THREE.Vector3 // Bullet travel, from muzzle toward the body.
  weapon?: WeaponName
}

/** The director already rolls accuracy. This selects where a successful round is aimed. */
export function playerHitTarget(player: Pick<PlayerSense, 'feet' | 'yaw'>, roll: number): Pick<PlayerBulletHit, 'region' | 'side' | 'point'> {
  const targets: { region: PlayerHitRegion; weight: number; x: number; y: number; z: number }[] = [
    { region: 'torso', weight: 0.42, x: 0.075, y: 1.17, z: 0 },
    { region: 'shoulder', weight: 0.16, x: 0.24, y: 1.43, z: 0 },
    { region: 'arm', weight: 0.14, x: 0.28, y: 1.22, z: -0.09 },
    { region: 'hand', weight: 0.06, x: 0.19, y: 1.21, z: -0.32 },
    { region: 'leg', weight: 0.18, x: 0.14, y: 0.59, z: 0 },
    { region: 'head', weight: 0.04, x: 0, y: 1.65, z: 0 },
  ]
  let value = THREE.MathUtils.clamp(roll, 0, 1 - Number.EPSILON)
  for (const target of targets) {
    if (value < target.weight || target.region === 'head') {
      const side = target.region === 'head' ? 0 : value < target.weight / 2 ? -1 : 1
      const point = new THREE.Vector3(target.x * side, target.y, target.z)
        .applyAxisAngle(UP, player.yaw ?? 0).add(player.feet)
      return { region: target.region, side, point }
    }
    value -= target.weight
  }
  throw new Error('Missing player hit target')
}

export type PlayerHitPose = {
  cameraPosition: THREE.Vector3
  cameraRotation: THREE.Vector3
  weaponPosition: THREE.Vector3
  weaponRotation: THREE.Vector3
  leftHand: THREE.Vector3
  shoulders: [THREE.Vector3, THREE.Vector3] // Right, left, matching the viewmodel IK.
}
const UP = new THREE.Vector3(0, 1, 0)
const makePose = (): PlayerHitPose => ({
  cameraPosition: new THREE.Vector3(), cameraRotation: new THREE.Vector3(),
  weaponPosition: new THREE.Vector3(), weaponRotation: new THREE.Vector3(),
  leftHand: new THREE.Vector3(), shoulders: [new THREE.Vector3(), new THREE.Vector3()],
})
const vectors = (pose: PlayerHitPose) => [pose.cameraPosition, pose.cameraRotation, pose.weaponPosition,
  pose.weaponRotation, pose.leftHand, ...pose.shoulders]
const smooth = THREE.MathUtils.smoothstep
/** Finite, velocity-continuous flinch: quick attack, slower recovery, no noise or ringing. */
function pulse(age: number, peak: number, duration: number, delay = 0) {
  const t = age - delay
  if (t <= 0 || t >= duration) return 0
  return t < peak ? smooth(t, 0, peak) : 1 - smooth(t, peak, duration)
}

type Impulse = { hit: PlayerBulletHit; age: number; strength: number; grounded: boolean }

export class PlayerHitReactions {
  readonly pose = makePose()
  private impulses: Impulse[] = []
  private applied: { camera: THREE.PerspectiveCamera; position: THREE.Vector3; rotation: THREE.Vector3;
    baseQuaternion: THREE.Quaternion; shownQuaternion: THREE.Quaternion } | null = null

  hit(hit: PlayerBulletHit, damage: number, grounded: boolean) {
    if (!Number.isFinite(damage) || damage <= 0 || hit.direction.lengthSq() < 1e-10) return
    this.impulses.push({ hit: { ...hit, point: hit.point.clone(), direction: hit.direction.clone().normalize() }, age: 0,
      strength: THREE.MathUtils.clamp(Math.sqrt(damage / 12), 0.55, 1.55), grounded })
    this.impulses = this.impulses.slice(-8)
  }

  update(dt: number, yaw: number, reducedMotion = false) {
    for (const vector of vectors(this.pose)) vector.set(0, 0, 0)
    if (reducedMotion) { this.impulses = []; return this.pose }
    const delta = Number.isFinite(dt) ? Math.max(0, dt) : 0
    for (const impulse of this.impulses) {
      impulse.age += delta
      const { hit, age, strength } = impulse
      const arm = hit.region === 'arm' || hit.region === 'hand' || hit.region === 'shoulder'
      const leg = hit.region === 'leg'
      const fast = pulse(age, 0.045, arm ? 0.38 : 0.32) * strength
      const follow = pulse(age, leg ? 0.12 : 0.075, leg ? 0.64 : 0.48, 0.018) * strength
      const local = hit.direction.clone().applyAxisAngle(UP, -yaw)
      // The struck anatomical side turns with the body; the force stays in world space.
      const side = hit.side
      const headScale = arm ? (hit.region === 'shoulder' ? 0.72 : 0.36) : 1
      const weight = leg ? (impulse.grounded ? 1 : 0.25) : 0
      this.pose.cameraPosition.add(new THREE.Vector3(local.x * 0.014, -weight * 0.055,
        local.z * 0.013).multiplyScalar(follow * headScale))
      this.pose.cameraRotation.add(new THREE.Vector3(
        local.z * (hit.region === 'head' ? 0.036 : 0.018) - weight * 0.022,
        -local.x * 0.022 - side * (arm ? 0.012 : 0.004),
        -local.x * 0.019 - side * (leg ? 0.035 : arm ? 0.016 : 0.009),
      ).multiplyScalar(follow * headScale))

      // Bracing follows every hit. Limb-specific motion then pulls the injured chain.
      this.pose.weaponPosition.add(new THREE.Vector3(local.x * 0.009, -0.012 + weight * 0.019, 0.018).multiplyScalar(fast))
      this.pose.weaponRotation.add(new THREE.Vector3(-0.024, -local.x * 0.025, -side * 0.025).multiplyScalar(fast))
      if (arm) {
        const shoulder = hit.region === 'shoulder'
        const pull = fast * (shoulder ? 1 : hit.region === 'hand' ? 0.8 : 0.9)
        const index = hit.side < 0 ? 1 : 0
        this.pose.shoulders[index].add(new THREE.Vector3(hit.side * 0.014, -0.014, 0.024).multiplyScalar(pull))
        if (hit.side >= 0) {
          this.pose.weaponPosition.add(new THREE.Vector3(0.025, -0.035, 0.043).multiplyScalar(pull))
          this.pose.weaponRotation.add(new THREE.Vector3(-0.065, -0.045, -0.09).multiplyScalar(pull))
        } else {
          this.pose.leftHand.add(new THREE.Vector3(-0.055, -0.042, 0.06).multiplyScalar(pull))
          this.pose.weaponRotation.z += 0.035 * pull
        }
      }
    }
    this.impulses = this.impulses.filter(impulse => impulse.age < 0.7)
    // Multiple attackers must not produce a camera spiral or pull IK out of reach.
    this.pose.cameraPosition.clampLength(0, 0.065)
    this.pose.cameraRotation.clampLength(0, 0.065)
    this.pose.weaponPosition.clampLength(0, 0.095)
    this.pose.weaponRotation.clampLength(0, 0.19)
    this.pose.leftHand.clampLength(0, 0.105)
    for (const shoulder of this.pose.shoulders) shoulder.clampLength(0, 0.04)
    return this.pose
  }

  /** Overlay lasts through firing and render only, never into movement or mouse input. */
  applyCamera(camera: THREE.PerspectiveCamera, world: Pick<CollisionWorld, 'rayDistance'>, scale = 1) {
    this.removeCamera()
    if (this.pose.cameraPosition.lengthSq() + this.pose.cameraRotation.lengthSq() === 0) return
    const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    const offset = this.pose.cameraPosition.clone().multiplyScalar(scale).applyAxisAngle(UP, rotation.y)
    const length = offset.length()
    if (length > 1e-8) {
      // Preserve near-plane clearance when the player's head is next to geometry.
      const distance = world.rayDistance(camera.position, offset.clone().normalize(), length + 0.08)
      offset.multiplyScalar(THREE.MathUtils.clamp((distance - 0.08) / length, 0, 1))
    }
    const turn = this.pose.cameraRotation.clone().multiplyScalar(scale)
    turn.x = THREE.MathUtils.clamp(rotation.x + turn.x, -1.5, 1.5) - rotation.x
    const baseQuaternion = camera.quaternion.clone()
    const basePosition = camera.position.clone()
    camera.position.add(offset)
    rotation.set(rotation.x + turn.x, rotation.y + turn.y, rotation.z + turn.z, 'YXZ')
    camera.quaternion.setFromEuler(rotation)
    this.applied = { camera, position: basePosition, rotation: turn, baseQuaternion, shownQuaternion: camera.quaternion.clone() }
  }

  removeCamera() {
    if (!this.applied) return
    const { camera, position, rotation, baseQuaternion, shownQuaternion } = this.applied
    camera.position.copy(position)
    if (camera.quaternion.equals(shownQuaternion)) camera.quaternion.copy(baseQuaternion)
    else {
      // Weapons add Euler pitch/yaw recoil during update; retain that deliberate change.
      const current = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
      current.set(THREE.MathUtils.clamp(current.x - rotation.x, -1.5, 1.5), current.y - rotation.y, current.z - rotation.z, 'YXZ')
      camera.quaternion.setFromEuler(current)
    }
    camera.updateMatrixWorld(true)
    this.applied = null
  }

  clear() {
    this.removeCamera()
    this.impulses = []
    for (const vector of vectors(this.pose)) vector.set(0, 0, 0)
  }
}
