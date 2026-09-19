import * as THREE from 'three'
import { poseQuat, type Pose } from '../clip'
import { BONE_NAMES, rest, type BoneName, type Rig } from '../rig'
import { placeHand } from './support'

export const mountQuaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)))
export const mountPosition = new THREE.Vector3(0, 0.035, 0)
export const cradleQuaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)))
export const armBones = ['upper_arm.R', 'forearm.R', 'hand.R', 'upper_arm.L', 'forearm.L', 'hand.L'] as const

// A rest skeleton lets us author poses in metres and solve them before building animation tracks.
// Every solve retains the actual arm lengths from the model.
const root = new THREE.Group()
const bones = Object.fromEntries(BONE_NAMES.map(name => [name, new THREE.Bone()])) as Rig['bones']
const parent: Record<BoneName, BoneName | undefined> = {
  hips: undefined, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  'shoulder.L': 'chest', 'shoulder.R': 'chest', 'upper_arm.L': 'shoulder.L', 'upper_arm.R': 'shoulder.R',
  'forearm.L': 'upper_arm.L', 'forearm.R': 'upper_arm.R', 'hand.L': 'forearm.L', 'hand.R': 'forearm.R',
  'thigh.L': 'hips', 'thigh.R': 'hips', 'shin.L': 'thigh.L', 'shin.R': 'thigh.R',
}
for (const name of BONE_NAMES) (parent[name] ? bones[parent[name]!] : root).add(bones[name])
const rig = { root, bones, rest } as Rig
const rightPole = new THREE.Vector3(-0.4, -1, -0.7), leftPole = new THREE.Vector3(0.65, -1, -0.15)
export type Hold = { position: [number, number, number]; pitch?: number; yaw?: number; roll?: number; elbow?: [number, number, number] }
export function heldPose(body: Pose, hold: Hold, support?: [number, number, number], left?: [number, number, number]): Pose {
  for (const name of BONE_NAMES) {
    bones[name].position.copy(rest![name].pos)
    poseQuat(name, body[name] ?? [0, 0, 0], bones[name].quaternion)
  }
  root.updateMatrixWorld(true)
  const gunQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    (hold.pitch ?? 0) * THREE.MathUtils.DEG2RAD, (hold.yaw ?? 0) * THREE.MathUtils.DEG2RAD,
    (hold.roll ?? 0) * THREE.MathUtils.DEG2RAD, 'YXZ'))
  const point = new THREE.Vector3(...hold.position)
  placeHand(rig, 'R', point, 1, { orientation: gunQ.clone().multiply(mountQuaternion.clone().invert()), pole: hold.elbow ? new THREE.Vector3(...hold.elbow) : rightPole })
  if (support || left) {
    const target = left ? new THREE.Vector3(...left) : new THREE.Vector3(...support!).applyQuaternion(gunQ).add(point)
    placeHand(rig, 'L', target, 1, { orientation: gunQ.clone().multiply(cradleQuaternion), pole: leftPole, maxWristAngle: 60 })
  }
  const pose = { ...body }
  for (const name of armBones) {
    const relative = rest![name].quat.clone().invert().multiply(bones[name].quaternion)
    const e = new THREE.Euler().setFromQuaternion(relative, 'ZYX')
    pose[name] = [e.x, e.y, e.z].map(a => a * THREE.MathUtils.RAD2DEG) as [number, number, number]
  }
  return pose
}

/** Re-fit the trigger hand after changing the torso's posture, retaining the barrel's orientation. */
export function shiftTriggerPose(body: Pose, offset: [number, number, number], prone = 0, twoHanded = true): Pose {
  for (const name of BONE_NAMES) {
    bones[name].position.copy(rest![name].pos)
    poseQuat(name, body[name] ?? [0, 0, 0], bones[name].quaternion)
  }
  root.updateMatrixWorld(true)
  const point = bones['hand.R'].localToWorld(mountPosition.clone()).add(new THREE.Vector3(...offset))
  const rotation = bones['hand.R'].getWorldQuaternion(new THREE.Quaternion()).multiply(mountQuaternion)
  placeHand(rig, 'R', point, 1, { orientation: rotation.clone().multiply(mountQuaternion.clone().invert()),
    pole: new THREE.Vector3(-0.6, -1, -0.4).lerp(new THREE.Vector3(-0.65, -1, -0.35), prone) })
  if (!twoHanded && prone > 0) {
    const brace = point.clone().add(new THREE.Vector3(0.055, -0.035, 0.015).applyQuaternion(rotation))
    placeHand(rig, 'L', brace, prone, { pole: new THREE.Vector3(0.8, -1, -0.1), maxWristAngle: 65 })
  }
  const pose = { ...body }
  for (const name of armBones) {
    const e = new THREE.Euler().setFromQuaternion(rest![name].quat.clone().invert().multiply(bones[name].quaternion), 'ZYX')
    pose[name] = [e.x, e.y, e.z].map(v => v * THREE.MathUtils.RAD2DEG) as [number, number, number]
  }
  return pose
}
