import * as THREE from 'three'
import { makeClip, poseQuat, type Key, type Pose } from './clip'
import { BONE_NAMES, rest, type BoneName, type Rig } from './rig'
import { hang } from './clips/idle'
import { shiftTriggerPose } from './weapons/poses'

export type Posture = 'stand' | 'crouch' | 'kneel' | 'prone'
const upright: Pose = { ...hang, hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0],
  neck: [0, 0, 0], head: [0, 0, 0], 'thigh.L': [0, 0, 0], 'thigh.R': [0, 0, 0],
  'shin.L': [0, 0, 0], 'shin.R': [0, 0, 0] }
export const postures: Record<Posture, Key> = {
  stand: { t: 0, pose: upright, root: [0, 0, 0] },
  crouch: { t: 0, pose: { ...upright, hips: [3, 0, 0], spine: [7, 0, 0], chest: [2, 0, 0], head: [-12, 0, 0],
    'thigh.L': [-26, 0, 0], 'thigh.R': [-26, 0, 0], 'shin.L': [46, 0, 0], 'shin.R': [46, 0, 0] }, root: [0, -0.07, 0] },
  kneel: { t: 0, pose: { ...upright, hips: [4, 0, 0], spine: [3, 0, 0], head: [-7, 0, 0],
    'thigh.L': [-94, 0, -5], 'shin.L': [92, 0, 0], 'thigh.R': [-20, 0, -4], 'shin.R': [106, 0, 0] }, root: [0, -0.38, -0.06] },
  prone: { t: 0, pose: { ...upright, hips: [88, 0, 0], spine: [-8, 0, 0], chest: [-7, 0, 0],
    neck: [-38, 0, 0], head: [-35, 0, 0], 'thigh.L': [0, 0, -4], 'thigh.R': [0, 0, 4],
    'shin.L': [3, 0, 0], 'shin.R': [2, 0, 0] }, root: [0, -0.715, 0.08] },
}

export const postureClips = Object.fromEntries(Object.entries(postures).map(([name, key]) =>
  [name, makeClip(`posture_${name}`, [key], { duration: 1, loop: true })])) as Record<Posture, THREE.AnimationClip>

/** Start at the visible pose, including interrupted reactions and low firing positions. */
export function enterPosture(rig: Rig, posture: Posture, scan = false, standPose?: Pose) {
  const pose: Pose = {}
  for (const name of BONE_NAMES) {
    const q = rig.rest[name].quat.clone().invert().multiply(rig.bones[name].quaternion)
    const e = new THREE.Euler().setFromQuaternion(q, 'ZYX')
    pose[name] = [e.x, e.y, e.z].map(v => v * THREE.MathUtils.RAD2DEG) as [number, number, number]
  }
  const start: Key = { t: 0, pose, root: rig.bones.hips.position.clone().sub(rig.rest.hips.pos).toArray() }
  const target = posture === 'stand' && standPose ? { ...postures.stand, pose: { ...upright, ...standPose } } : postures[posture], low = start.root![1] < -0.5
  const keys: Key[] = [start]
  if (posture === 'prone' && !low) {
    keys.push({ ...postures.crouch, t: 0.1, ease: 'linear' },
      { t: 0.26, pose: { ...postures.kneel.pose, hips: [48, 0, -3], spine: [10, 0, 0], head: [-40, 0, 0],
        'thigh.L': [-50, 0, -4], 'thigh.R': [-12, 0, 4], 'shin.L': [65, 0, 0], 'shin.R': [75, 0, 0] }, root: [0, -0.43, 0.04], ease: 'linear' },
      { ...target, t: 0.43, root: [0, -0.725, 0.08], ease: 'linear' }, { ...target, t: 0.56 })
  } else {
    if (low && posture !== 'prone') keys.push({ ...postures.kneel, t: 0.32 })
    keys.push({ ...target, t: low ? 0.76 : posture === 'kneel' ? 0.34 : 0.24 })
  }
  if (scan) {
    const t = keys.at(-1)!.t
    for (const [time, turn] of [[0.24, 42], [0.6, 38], [0.95, -44], [1.3, -38], [1.65, 0]]) {
      keys.push({ ...target, t: t + time, pose: { ...target.pose,
        chest: [2, turn * 0.22, 0], head: [-12, turn, turn * 0.08] } })
    }
  }
  return makeClip(`posture_enter_${posture}`, keys)
}

const torso: BoneName[] = ['hips', 'spine', 'chest']
const isArm = (name: BoneName) => /^(upper_arm|forearm|hand)\./.test(name)
type SampleTrack = THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant }
function sampler(clip: THREE.AnimationClip) {
  return new Map(clip.tracks.map(track => [track.name, (track as SampleTrack).createInterpolant()]))
}

/** Bake a weapon performance onto a lower body without rotating the barrel into the floor.
 * Preserve the arms' world-space rotations relative to their new shoulder positions.
 * Ordinary clips can still be exported and replayed without a runtime posture layer.
 */
export function weaponPosture(source: THREE.AnimationClip, body: THREE.AnimationClip, duration = source.duration, twoHanded = true) {
  const bind = rest!, gun = sampler(source), lower = sampler(body)
  const times = Array.from({ length: Math.ceil(duration * 60) + 1 }, (_, i) => i)
  for (let i = 0; i < times.length; i++) times[i] = i / (times.length - 1) * duration
  const values = new Map<string, number[]>()
  const rotation = (s: ReturnType<typeof sampler>, name: BoneName, t: number) => {
    const value = s.get(`${bind[name].node}.quaternion`)
    return value ? new THREE.Quaternion().fromArray(value.evaluate(t)) : bind[name].quat.clone()
  }
  for (const t of times) {
    const a = Math.min(t, source.duration), b = Math.min(t, body.duration)
    const oldChest = new THREE.Quaternion(), newChest = new THREE.Quaternion()
    for (const name of torso) { oldChest.multiply(rotation(gun, name, a)); newChest.multiply(rotation(lower, name, b)) }
    const rotations = {} as Record<BoneName, THREE.Quaternion>
    for (const name of BONE_NAMES) {
      const q = rotation(isArm(name) ? gun : lower, name, isArm(name) ? a : b)
      if (name.startsWith('upper_arm.')) {
        const shoulder = `shoulder.${name.at(-1)}` as BoneName
        const oldParent = oldChest.clone().multiply(rotation(gun, shoulder, a))
        const newParent = newChest.clone().multiply(rotation(lower, shoulder, b))
        q.premultiply(oldParent).premultiply(newParent.invert())
      }
      rotations[name] = q
    }
    const lean = new THREE.Vector3(0, 1, 0).applyQuaternion(newChest)
    const prone = THREE.MathUtils.smoothstep(1 - lean.y, 0.15, 0.6)
    const pose: Pose = {}
    for (const name of BONE_NAMES) {
      const e = new THREE.Euler().setFromQuaternion(bind[name].quat.clone().invert().multiply(rotations[name]), 'ZYX')
      pose[name] = [e.x, e.y, e.z].map(v => v * THREE.MathUtils.RAD2DEG) as [number, number, number]
    }
    // An untwisted low torso puts the opposite shoulder farther from the fore-end.
    // Bring the grip inward/back and lift it in prone so both elbows clear the ground.
    const fit = body.name === 'posture_enter_stand' ? 1 - THREE.MathUtils.smoothstep(t, 0, duration) : 1
    const shifted = shiftTriggerPose(pose, [(twoHanded ? 0.115 : 0) * fit,
      0.075 * prone * fit, (twoHanded ? -0.20 - 0.04 * prone : -0.24 * prone) * fit], prone, twoHanded)
    for (const name of BONE_NAMES) if (isArm(name)) poseQuat(name, shifted[name]!, rotations[name])
    for (const name of BONE_NAMES) {
      const path = `${bind[name].node}.quaternion`
      if (!values.has(path)) values.set(path, [])
      values.get(path)!.push(...rotations[name].toArray())
    }
    const path = `${bind.hips.node}.position`
    if (!values.has(path)) values.set(path, [])
    values.get(path)!.push(...(lower.get(path)?.evaluate(b) ?? bind.hips.pos.toArray()))
  }
  const tracks = [...values].map(([name, v]) => name.endsWith('.position')
    ? new THREE.VectorKeyframeTrack(name, times, v) : new THREE.QuaternionKeyframeTrack(name, times, v))
  for (const name of BONE_NAMES) if (name !== 'hips') tracks.push(
    new THREE.VectorKeyframeTrack(`${bind[name].node}.position`, [0], bind[name].pos.toArray()))
  // Retain the operation prefix; the caller appends the posture for distinct exports.
  return new THREE.AnimationClip(source.name, duration, tracks)
}
