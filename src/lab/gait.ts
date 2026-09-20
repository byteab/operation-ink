import * as THREE from 'three'
import { BONE_NAMES, rest, type BoneName } from './rig'
import reference from './data/locomotion-reference.json'

/** In-place clip speeds; mission playback uses the same values. */
export const GAIT_SPEED = { walk: 1.0, run: 2.8 } as const
export const GAIT_STANCE = { walk: 0.5, run: 0.28 } as const
/** Longer running strides extend the flight arc, keeping planted reach bounded. */
export function gaitStance(gait: keyof typeof GAIT_SPEED, stride = 1) {
  return GAIT_STANCE[gait] / (gait === 'run' ? stride : 1)
}
type Gait = keyof typeof GAIT_SPEED
type GaitFamily = { gait: Gait; variants: Map<number, THREE.AnimationClip>; bake: (stride: number) => THREE.AnimationClip }
const families = new WeakMap<THREE.AnimationClip, GaitFamily>()

/** Keep speed-dependent lower-body motion when a scenario replaces the arm tracks. */
export function mapGait(clip: THREE.AnimationClip, adapt: (clip: THREE.AnimationClip) => THREE.AnimationClip) {
  const mapped = adapt(clip), family = families.get(clip)
  if (family) families.set(mapped, { gait: family.gait, variants: new Map([[0, mapped]]), bake: stride => adapt(family.bake(stride)) })
  return mapped
}

/** Spend most extra speed on stride length, then use cadence for the remainder. */
export function gaitPlayback(clip: THREE.AnimationClip, speed: number) {
  const family = families.get(clip)
  if (!family) return { clip, stride: 1 }
  // Bound and cache the variants; speed changes must never rebuild clips each frame.
  const step = Math.round(THREE.MathUtils.clamp(speed - 1, 0, 1) * 20)
  const stride = 1 + step / 20 * (family.gait === 'walk' ? 0.5 : 0.4)
  let variant = family.variants.get(step)
  if (!variant) {
    variant = family.bake(stride)
    family.variants.set(step, variant)
    families.set(variant, family)
  }
  return { clip: variant, stride }
}
export const SHIN_LENGTH = Math.hypot(0.36, 0.05)
export const FOOT_CLEARANCE = 0.054
const parent: Record<BoneName, BoneName | undefined> = {
  hips: undefined, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  'shoulder.L': 'chest', 'shoulder.R': 'chest', 'upper_arm.L': 'shoulder.L', 'upper_arm.R': 'shoulder.R',
  'forearm.L': 'upper_arm.L', 'forearm.R': 'upper_arm.R', 'hand.L': 'forearm.L', 'hand.R': 'forearm.R',
  'thigh.L': 'hips', 'thigh.R': 'hips', 'shin.L': 'thigh.L', 'shin.R': 'thigh.R',
}
const order: BoneName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulder.L', 'shoulder.R',
  'upper_arm.L', 'upper_arm.R', 'forearm.L', 'forearm.R', 'hand.L', 'hand.R', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R']
const yAxis = new THREE.Vector3(0, 1, 0)
const forward = new THREE.Vector3(0, 0, 1)
function boneFrame(direction: THREE.Vector3, normal: THREE.Vector3) {
  const y = direction.clone().normalize(), x = normal.clone().normalize()
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y).normalize()))
}
const smooth = (x: number) => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t) }


/** Coordinate authored upper-body motion with grounded, extending support legs. */
export function bakeGait(gait: Gait, stride = 1): THREE.AnimationClip {
  if (!rest) throw new Error('Load the stickman before baking locomotion')
  const bind = rest, source = reference.clips[gait], duration = gait === 'walk' ? 0.86 : 0.68
  const bindWorld = {} as Record<BoneName, THREE.Quaternion>
  for (const name of order) {
    const p = parent[name]
    bindWorld[name] = bind[name].quat.clone().premultiply(p ? bindWorld[p] : new THREE.Quaternion())
  }
  const tracks = new Map<string, number[]>()
  const push = (name: string, value: THREE.Vector3 | THREE.Quaternion) => {
    if (!tracks.has(name)) tracks.set(name, [])
    tracks.get(name)!.push(...value.toArray())
  }
  // Faster knee recovery needs finer samples to keep interpolated contacts fixed.
  const count = gait === 'run' ? 240 : 120
  const times = Array.from({ length: count + 1 }, (_, i) => i / count * duration)
  const frames = times.map((_, i) => {
    const sample = i / count * (source.frames.length - 1), index = Math.min(Math.floor(sample), source.frames.length - 2)
    const frame = source.frames[index], next = source.frames[index + 1], weight = sample - index
    const world = {} as Record<BoneName, THREE.Quaternion>
    const local = {} as Record<BoneName, THREE.Quaternion>
    for (const name of order) {
      const p = parent[name]
      world[name] = new THREE.Quaternion().fromArray(frame.rotations[name])
        .slerp(new THREE.Quaternion().fromArray(next.rotations[name]), weight).multiply(bindWorld[name])
      local[name] = world[name].clone().premultiply(p ? world[p].clone().invert() : new THREE.Quaternion())
    }
    return { hips: new THREE.Vector3(), local }
  })
  // Smooth the reference's baked keys around the loop. This removes sampling
  // chatter while preserving the authored overlap and asymmetry.
  const original = frames.map(frame => ({
    local: Object.fromEntries(order.map(name => [name, frame.local[name].clone()])) as Record<BoneName, THREE.Quaternion> }))
  frames.forEach((frame, i) => {
    for (const name of order) frame.local[name].copy(original[(i - 1 + count) % count].local[name])
      .slerp(original[(i + 1) % count].local[name], 0.5).slerp(original[i % count].local[name], 0.5)
  })
  const stance = gaitStance(gait, stride)
  const cycleTravel = GAIT_SPEED[gait] * duration * stride
  const travel = cycleTravel * stance, front = travel * 0.5
  const targets = frames.map((_, i) => (['L', 'R'] as const).map((side, index) => {
    const phase = (i / count + index * 0.5) % 1
    let z = front - cycleTravel * phase, lift = 0
    if (phase > stance) {
      const u = (phase - stance) / (1 - stance)
      const velocity = -cycleTravel * (1 - stance)
      // The cap travels backward at ground speed, then recovers along the route.
      // Match its horizontal velocity at lift-off and contact without overreaching.
      z = -front + travel * smooth(u) + velocity * u * (1 - u) * (1 - 2 * u) ** (gait === 'walk' ? 9 : 3)
      if (gait === 'run') {
        // Fold the heel behind the body first, then drive the knee through and
        // lower the foot for contact. A symmetric, low swing reads as skating.
        z -= (0.06 + 0.30 * (stride - 1)) * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u) ** 2
        lift = 0.22 * Math.sin(Math.PI * u) ** 2 * (1 + 0.8 * Math.cos(Math.PI * u))
      } else lift = 0.026 * Math.sin(Math.PI * u) ** 2
    }
    return new THREE.Vector3((side === 'L' ? 1 : -1) * (gait === 'walk' ? 0.09 : 0.085), FOOT_CLEARANCE + lift, z)
  }))
  for (const [i, frame] of frames.entries()) {
    const phase = i / count, step = Math.cos(2 * Math.PI * phase), transfer = Math.sin(2 * Math.PI * phase)
    const load = Math.cos(4 * Math.PI * (phase - stance * 0.35))
    const follow = Math.cos(4 * Math.PI * (phase - stance * 0.35 - 0.04))
    frame.hips.x = (gait === 'walk' ? 0.004 : 0.005) * transfer
    // Drive the running torso into each step; the head follows a little later
    // while retaining a forward gaze. A fixed chest/head reads as jogging in place.
    const aligned = {} as Record<BoneName, THREE.Quaternion>
    for (const name of ['hips', 'spine', 'chest', 'neck', 'head'] as const) {
      const p = parent[name]
      const pitch = gait === 'run'
        ? name === 'hips' ? 18 + 1.5 * load : name === 'spine' ? 20 + 2 * load
          : name === 'chest' ? 22 + 3 * load : name === 'neck' ? 19 + 2 * follow : 14 + 2 * follow
        : name === 'head' ? 1 : 3
      const twist = (name === 'hips' ? -3 : name === 'spine' ? 0 : name === 'head' ? 0.5 : 3) * (gait === 'run' ? 1.5 : 1)
      const acting = new THREE.Euler(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(twist * step),
        THREE.MathUtils.degToRad((name === 'hips' ? -0.8 : -0.4) * transfer), 'YXZ')
      aligned[name] = new THREE.Quaternion().setFromEuler(acting).multiply(bindWorld[name])
      frame.local[name].copy(aligned[name]).premultiply(p ? aligned[p].clone().invert() : new THREE.Quaternion())
    }
    for (const side of ['L', 'R'] as const) {
      frame.local[`shoulder.${side}`].slerp(bind[`shoulder.${side}`].quat, 0.65)
      const hang = bind[`upper_arm.${side}`].quat.clone().multiply(new THREE.Quaternion().setFromEuler(
        new THREE.Euler(THREE.MathUtils.degToRad(-78), 0, 0, 'ZYX')))
      frame.local[`upper_arm.${side}`].slerp(hang, gait === 'run' ? 0.3 : 0.1)
      // Opposite arm and leg travel together, with a relaxed walking elbow and
      // a compact bent running elbow. Longer steps get a little more arm drive.
      const shoulder = frame.local[`shoulder.${side}`], upper = frame.local[`upper_arm.${side}`]
      const direction = yAxis.clone().applyQuaternion(upper).applyQuaternion(shoulder)
      const drive = Math.cos(2 * Math.PI * (phase + (side === 'R' ? 0.5 : 0)))
      const amplitude = (gait === 'run' ? 35 : 20) * (1 + (stride - 1) * 0.35)
      const armAngle = THREE.MathUtils.degToRad((gait === 'run' ? -10 : -2) - amplitude * drive)
      const tucked = new THREE.Vector3(side === 'L' ? 0.12 : -0.12, -Math.cos(armAngle), Math.sin(armAngle)).normalize()
      const correction = new THREE.Quaternion().setFromUnitVectors(direction, tucked)
      upper.premultiply(shoulder.clone().invert().multiply(correction).multiply(shoulder))
      {
        const armFrame = shoulder.clone().multiply(upper), fore = frame.local[`forearm.${side}`]
        const foreDirection = yAxis.clone().applyQuaternion(fore).applyQuaternion(armFrame)
        const foreAngle = armAngle + THREE.MathUtils.degToRad(gait === 'run' ? 85 - 10 * drive : 14 - 6 * drive)
        const foreTucked = new THREE.Vector3(side === 'L' ? 0.03 : -0.03, -Math.cos(foreAngle), Math.sin(foreAngle))
        foreTucked.normalize()
        const foreCorrection = new THREE.Quaternion().setFromUnitVectors(foreDirection, foreTucked)
        fore.premultiply(armFrame.clone().invert().multiply(foreCorrection).multiply(armFrame))
      }
    }
  }
  // Only planted feet constrain the body. A reaching airborne leg must lift
  // to clear its arc instead of tugging the hips down between footfalls.
  const limits = frames.map((frame, i) => Math.min(...(['L', 'R'] as const).map((side, index) => {
    if ((i / count + index * 0.5) % 1 > stance) return Infinity
    const offset = bind[`thigh.${side}`].pos.clone().applyQuaternion(frame.local.hips)
    const foot = targets[i][index], reach = bind[`shin.${side}`].pos.length() + SHIN_LENGTH - 0.001
    const x = foot.x - frame.hips.x - offset.x, z = foot.z - offset.z
    return foot.y + Math.sqrt(Math.max(0, reach * reach - x * x - z * z)) - offset.y
  })))
  // One gentle rise per step. The second harmonic previously introduced an
  // extra chest/head pulse between footfalls, most visible at running speed.
  const mean = gait === 'run' ? bind.hips.pos.y : limits.slice(0, count).reduce((sum, height) => sum + height, 0) / count
  let cosine = 0, sine = 0
  for (let i = 0; gait === 'walk' && i < count; i++) {
    const angle = 4 * Math.PI * i / count
    cosine += limits[i] * Math.cos(angle) * 2 / count
    sine += limits[i] * Math.sin(angle) * 2 / count
  }
  // Running visibly loads the supporting leg, then lifts the torso into flight.
  // The upper-body pitch follows this same pulse instead of bouncing separately.
  const pelvis = frames.map((_, i) => gait === 'run'
    ? mean - 0.028 * Math.cos(4 * Math.PI * (i / count - stance * 0.35))
    : mean + 1.25 * (cosine * Math.cos(4 * Math.PI * i / count) + sine * Math.sin(4 * Math.PI * i / count)))
  const clearance = Math.max(0, ...pelvis.map((height, i) => height - limits[i]))
  frames.forEach((frame, i) => {
    frame.hips.y = pelvis[i] - clearance
    push(`${bind.hips.node}.position`, frame.hips)
    for (const name of order) if (!name.startsWith('thigh.') && !name.startsWith('shin.')) {
      push(`${bind[name].node}.quaternion`, frame.local[name])
    }
    for (const [index, side] of (['L', 'R'] as const).entries()) {
      const hip = bind[`thigh.${side}`].pos.clone().applyQuaternion(frame.local.hips).add(frame.hips)
      const target = targets[i][index]
      if ((i / count + index * 0.5) % 1 > stance) {
        const reach = bind[`shin.${side}`].pos.length() + SHIN_LENGTH - 0.001
        const x = target.x - hip.x, z = target.z - hip.z
        const required = hip.y - Math.sqrt(Math.max(0, reach * reach - x * x - z * z))
        // Smooth positive correction: no snap where the authored recovery arc
        // meets the reach limit, and no extra knee lift near the passing pose.
        const gap = required - target.y, blend = 0.008
        if (gap > -blend) target.y += gap >= blend ? gap : (gap + blend) ** 2 / (4 * blend)
      }
      const delta = target.clone().sub(hip), distance = delta.length(), axis = delta.clone().normalize()
      const length = bind[`shin.${side}`].pos.length(), along = (length ** 2 - SHIN_LENGTH ** 2 + distance ** 2) / (2 * distance)
      const bend = Math.sqrt(Math.max(0, length ** 2 - along ** 2))
      const pole = forward.clone().addScaledVector(axis, -forward.dot(axis)).normalize()
      const knee = hip.clone().addScaledVector(axis, along).addScaledVector(pole, bend)
      const normal = new THREE.Vector3().crossVectors(pole, axis).normalize()
      const upper = boneFrame(knee.clone().sub(hip), normal), lower = boneFrame(target.clone().sub(knee), normal)
      push(`${bind[`thigh.${side}`].node}.quaternion`, upper.clone().premultiply(frame.local.hips.clone().invert()))
      push(`${bind[`shin.${side}`].node}.quaternion`, lower.premultiply(upper.clone().invert()))
    }
  })
  const animationTracks: THREE.KeyframeTrack[] = []
  for (const [name, values] of tracks) animationTracks.push(name.endsWith('.position')
    ? new THREE.VectorKeyframeTrack(name, times, values) : new THREE.QuaternionKeyframeTrack(name, times, values))
  for (const name of BONE_NAMES) if (name !== 'hips') {
    animationTracks.push(new THREE.VectorKeyframeTrack(`${bind[name].node}.position`, [0], bind[name].pos.toArray()))
  }
  const clip = new THREE.AnimationClip(gait, duration, animationTracks)
  families.set(clip, { gait, variants: new Map([[0, clip]]), bake: stride => bakeGait(gait, stride) })
  return clip
}
