import * as THREE from 'three'
import { BONE_NAMES, rest, type BoneName } from './rig'
import { SHIN_LENGTH } from './gait'

const parents: Record<BoneName, BoneName | undefined> = {
  hips: undefined, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  'shoulder.L': 'chest', 'shoulder.R': 'chest', 'upper_arm.L': 'shoulder.L', 'upper_arm.R': 'shoulder.R',
  'forearm.L': 'upper_arm.L', 'forearm.R': 'upper_arm.R', 'hand.L': 'forearm.L', 'hand.R': 'forearm.R',
  'thigh.L': 'hips', 'thigh.R': 'hips', 'shin.L': 'thigh.L', 'shin.R': 'thigh.R',
}
type SampleTrack = THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant }
const up = new THREE.Vector3(0, 1, 0)
// Rigid head geometry in the shared GLB (centre measured in head-local space).
const headCenter = new THREE.Vector3(0, 0.190586, 0)
const headHeight = 0.219
const footHeight = 0.06
const handHeight = 0.054
const smooth = (u: number) => THREE.MathUtils.smootherstep(u, 0, 1)

/** Bake passive limb release into an ordinary, seekable clip. The authored impact
 * stays intact; joints settle at different times, with fixed lengths and floor
 * contact. There is no live solver to drift while paused or after a save/restore. */
export function settleDeath(source: THREE.AnimationClip, contact: number) {
  if (!rest) throw new Error('Load the stickman before baking death contacts')
  const bind = rest, root = new THREE.Group(), bones = {} as Record<BoneName, THREE.Bone>
  for (const name of BONE_NAMES) {
    const bone = bones[name] = new THREE.Bone()
    bone.position.copy(bind[name].pos); bone.quaternion.copy(bind[name].quat)
    const parent = parents[name]
    if (parent) bones[parent].add(bone)
    else root.add(bone)
  }
  const samples = new Map(source.tracks.map(track => [track.name, (track as SampleTrack).createInterpolant()]))
  const sample = (time: number) => {
    for (const name of BONE_NAMES) {
      bones[name].quaternion.fromArray(samples.get(`${bind[name].node}.quaternion`)!.evaluate(time))
      bones[name].position.copy(bind[name].pos)
    }
    const position = samples.get(`${bind.hips.node}.position`)
    if (position) bones.hips.position.fromArray(position.evaluate(time))
    root.updateMatrixWorld(true)
  }
  const point = (name: BoneName) => bones[name].getWorldPosition(new THREE.Vector3())
  // Rotate a segment without stretching or changing the parent's attachment.
  const aim = (name: BoneName, localEnd: THREE.Vector3, destination: THREE.Vector3) => {
    const bone = bones[name], origin = point(name)
    const from = bone.localToWorld(localEnd.clone()).sub(origin).normalize()
    const to = destination.clone().sub(origin).normalize()
    const world = new THREE.Quaternion().setFromUnitVectors(from, to).multiply(bone.getWorldQuaternion(new THREE.Quaternion()))
    bone.quaternion.copy(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world))
    bone.updateWorldMatrix(false, true)
  }
  // Project each segment onto its support plane, preserving its horizontal
  // direction and exact length. A high shoulder may leave an angled upper arm;
  // the elbow and wrist still droop instead of holding the forearm overhead.
  const groundedEnd = (origin: THREE.Vector3, end: THREE.Vector3, length: number, height: number) => {
    const dy = THREE.MathUtils.clamp(height - origin.y, -length * 0.98, length * 0.98)
    const direction = end.clone().sub(origin).setY(0)
    if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1)
    return direction.normalize().multiplyScalar(Math.sqrt(length * length - dy * dy)).add(origin).setY(origin.y + dy)
  }

  sample(source.duration)
  for (const side of ['L', 'R'] as const) {
    for (const arm of [true, false]) {
      const upper: BoneName = arm ? `upper_arm.${side}` : `thigh.${side}`
      const lower: BoneName = arm ? `forearm.${side}` : `shin.${side}`
      const endLocal = arm ? bind[`hand.${side}`].pos : new THREE.Vector3(0, SHIN_LENGTH, 0)
      const origin = point(upper), middle = point(lower), end = bones[lower].localToWorld(endLocal.clone())
      const elbow = groundedEnd(origin, middle, bind[lower].pos.length(), 0.065)
      const tip = groundedEnd(elbow, end, endLocal.length(), arm ? handHeight : footHeight)
      aim(upper, bind[lower].pos, elbow)
      aim(lower, endLocal, tip)
      if (arm) {
        // Relax the wrist along the forearm on the floor, with a little sideways
        // roll retained from the authored pose rather than a clenched raised fist.
        const hand: BoneName = `hand.${side}`
        const wrist = point(hand), direction = tip.clone().sub(elbow).setY(0).normalize()
        aim(hand, up.clone(), wrist.add(direction))
      }
    }
  }
  aim('head', headCenter, groundedEnd(point('head'), bones.head.localToWorld(headCenter.clone()), headCenter.length(), headHeight))
  const settled = Object.fromEntries(BONE_NAMES.map(name => [name, bones[name].quaternion.clone()])) as Record<BoneName, THREE.Quaternion>
  const duration = Math.max(source.duration, contact + 1.05)
  const count = Math.ceil(duration * 120)
  const times = Array.from({ length: count + 1 }, (_, i) => i / count * duration)
  const values = new Map<string, number[]>(BONE_NAMES.map(name => [name, []]))
  const positions: number[] = []
  for (const time of times) {
    sample(Math.min(time, source.duration))
    // The pelvis lands first. The waist and ribcage yield in opposition, then
    // dissipate the impact instead of rebounding as one rigid plank.
    const elapsed = time - contact
    if (elapsed > 0 && elapsed < 0.8) {
      const flex = Math.sin(elapsed * 11) * Math.exp(-elapsed * 6) * (1 - smooth(elapsed / 0.8))
      bones.spine.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.16 * flex, 0, 0.035 * flex)))
      bones.chest.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.21 * flex, 0, -0.045 * flex)))
    }
    for (const name of BONE_NAMES) {
      const limb = /^(upper_arm|forearm|hand|thigh|shin)\./.test(name)
      if (!limb && name !== 'head') continue
      const delay = name === 'head' ? 0.16 : name.startsWith('hand') ? 0.12 : name.startsWith('forearm') ? 0.06 : name.startsWith('shin') ? 0.08 : 0
      const sideDelay = name.endsWith('.L') ? 0.045 : 0
      const weight = smooth((time - contact - delay - sideDelay) / 0.7)
      bones[name].quaternion.slerp(settled[name], weight)
    }
    root.updateMatrixWorld(true)
    // The shortest quaternion arc can dip below the floor during a collapse.
    // Enforce contact throughout the fall, not only at the final keyframe.
    for (const side of ['L', 'R'] as const) for (const arm of [true, false]) {
      const upper: BoneName = arm ? `upper_arm.${side}` : `thigh.${side}`
      const lower: BoneName = arm ? `forearm.${side}` : `shin.${side}`
      const endLocal = arm ? bind[`hand.${side}`].pos : new THREE.Vector3(0, SHIN_LENGTH, 0)
      const middle = point(lower)
      if (middle.y < 0.06) aim(upper, bind[lower].pos, groundedEnd(point(upper), middle, bind[lower].pos.length(), 0.06))
      const end = bones[lower].localToWorld(endLocal.clone()), height = arm ? handHeight : footHeight
      if (end.y < height) aim(lower, endLocal, groundedEnd(point(lower), end, endLocal.length(), height))
    }
    const head = bones.head.localToWorld(headCenter.clone())
    if (head.y < headHeight) aim('head', headCenter, groundedEnd(point('head'), head, headCenter.length(), headHeight))
    for (const name of BONE_NAMES) values.get(name)!.push(...bones[name].quaternion.toArray())
    positions.push(...bones.hips.position.toArray())
  }
  const tracks: THREE.KeyframeTrack[] = BONE_NAMES.map(name => new THREE.QuaternionKeyframeTrack(`${bind[name].node}.quaternion`, times, values.get(name)!))
  tracks.push(new THREE.VectorKeyframeTrack(`${bind.hips.node}.position`, times, positions))
  for (const name of BONE_NAMES) if (name !== 'hips') tracks.push(new THREE.VectorKeyframeTrack(`${bind[name].node}.position`, [0], bind[name].pos.toArray()))
  return new THREE.AnimationClip(source.name, duration, tracks)
}
