import * as THREE from 'three'
import { BONE_NAMES, rest, type BoneName } from './rig'
import reference from './data/locomotion-reference.json'

/** In-place clip speeds; mission playback uses the same values. */
export const GAIT_SPEED = { walk: 1.0, run: 2.8 } as const
export const GAIT_STANCE = { walk: 0.5, run: 0.25 } as const
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
/** Running swing keys: [swing time, progress from toe-off (0) to contact (1), lift in metres].
 *  The foot trails and folds up behind the body, passes under the hips late beneath a rising
 *  knee, then reaches and pulls back into contact. Coming forward early forces a high prancing knee. */
const RUN_SWING = [[0, 0, 0], [0.15, -0.32, 0.14], [0.34, -0.12, 0.27], [0.5, 0.17, 0.225],
  [0.66, 0.55, 0.16], [0.8, 0.88, 0.1], [0.9, 1.08, 0.05], [1, 1, 0]]
/** Cubic Hermite through the swing keys; `slope` is the progress rate that matches ground speed at both ends. */
function runSwing(u: number, slope: number, extend: number) {
  const keys = RUN_SWING.map(([t, k, y]) => [t, k < 0 ? k * extend : k > 1 ? 1 + (k - 1) * extend : k, y])
  const next = keys.findIndex(key => key[0] > u), i = next < 0 ? keys.length - 2 : Math.max(0, next - 1)
  const a = keys[i], b = keys[i + 1], h = b[0] - a[0], t = (u - a[0]) / h
  const tangent = (j: number, c: number) => j === 0 || j === keys.length - 1 ? (c === 1 ? slope : 0)
    : (keys[j + 1][c] - keys[j - 1][c]) / (keys[j + 1][0] - keys[j - 1][0])
  const at = (c: number) => (2 * t ** 3 - 3 * t * t + 1) * a[c] + (t ** 3 - 2 * t * t + t) * h * tangent(i, c)
    + (3 * t * t - 2 * t ** 3) * b[c] + (t ** 3 - t * t) * h * tangent(i + 1, c)
  return { progress: at(1), lift: at(2) }
}
/** Softer than real gravity: fixed-length legs cannot absorb a full-weight landing without squatting. */
const RUN_GRAVITY = 7.5
/** Mean running chest pitch in degrees; the arm swing is authored in world space on top of it. */
const CHEST_LEAN = 12
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
  // Runners land close under the body and push off well behind it.
  const travel = cycleTravel * stance, front = travel * (gait === 'run' ? 0.45 : 0.5), back = travel - front
  const targets = frames.map((_, i) => (['L', 'R'] as const).map((side, index) => {
    const phase = (i / count + index * 0.5) % 1
    let z = front - cycleTravel * phase, lift = 0
    if (phase > stance) {
      const u = (phase - stance) / (1 - stance)
      const velocity = -cycleTravel * (1 - stance)
      // The cap travels backward at ground speed, then recovers along the route.
      // Match its horizontal velocity at lift-off and contact without overreaching.
      if (gait === 'run') {
        // Longer strides trail further behind and reach further ahead.
        const swing = runSwing(u, velocity / travel, 1 + 1.5 * (stride - 1))
        z = -back + travel * swing.progress
        lift = swing.lift
      } else {
        z = -back + travel * smooth(u) + velocity * u * (1 - u) * (1 - 2 * u) ** 9
        lift = 0.026 * Math.sin(Math.PI * u) ** 2
      }
    }
    return new THREE.Vector3((side === 'L' ? 1 : -1) * (gait === 'walk' ? 0.09 : 0.085), FOOT_CLEARANCE + lift, z)
  }))
  for (const [i, frame] of frames.entries()) {
    const phase = i / count, step = Math.cos(2 * Math.PI * phase), transfer = Math.sin(2 * Math.PI * phase)
    const load = Math.cos(4 * Math.PI * (phase - stance * 0.35))
    const follow = Math.cos(4 * Math.PI * (phase - stance * 0.35 - 0.04))
    // Running weight shifts over the planted foot: the pelvis drops toward the
    // swinging side while the chest leans back over the support.
    const sway = Math.cos(2 * Math.PI * (phase - stance / 2))
    frame.hips.x = gait === 'walk' ? 0.004 * transfer : 0.01 * sway
    // Drive the running torso into each step; the head follows a little later
    // while retaining a forward gaze. A fixed chest/head reads as jogging in place.
    const aligned = {} as Record<BoneName, THREE.Quaternion>
    for (const name of ['hips', 'spine', 'chest', 'neck', 'head'] as const) {
      const p = parent[name]
      const pitch = gait === 'run'
        ? name === 'hips' ? 8 + 1.5 * load : name === 'spine' ? 10 + 2 * load
          : name === 'chest' ? CHEST_LEAN + 3 * load : name === 'neck' ? 9 + 2 * follow : 4 + 2 * follow
        : name === 'head' ? 1 : 3
      const twist = (name === 'hips' ? -3 : name === 'spine' ? 0 : name === 'head' ? 0.5 : 3) * (gait === 'run' ? 2.5 : 1)
      const acting = new THREE.Euler(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(twist * step),
        THREE.MathUtils.degToRad(gait === 'run' ? (name === 'hips' ? 4.5 : name === 'spine' ? -1 : name === 'chest' ? -2 : 0) * sway
          : (name === 'hips' ? -0.8 : -0.4) * transfer), 'YXZ')
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
      const amplitude = (gait === 'run' ? 37 : 20) * (1 + (stride - 1) * 0.35)
      // The chest frame leans with the run; add it back so the elbow drives behind
      // the hip and the hand rises in front instead of both hovering ahead of the ribs.
      const armAngle = THREE.MathUtils.degToRad((gait === 'run' ? CHEST_LEAN + 3 * load - 18 : -2) - amplitude * drive)
      const flare = gait === 'run' ? 0.2 : 0.12
      const tucked = new THREE.Vector3(side === 'L' ? flare : -flare, -Math.cos(armAngle), Math.sin(armAngle)).normalize()
      const correction = new THREE.Quaternion().setFromUnitVectors(direction, tucked)
      upper.premultiply(shoulder.clone().invert().multiply(correction).multiply(shoulder))
      {
        const armFrame = shoulder.clone().multiply(upper), fore = frame.local[`forearm.${side}`]
        const foreDirection = yAxis.clone().applyQuaternion(fore).applyQuaternion(armFrame)
        const foreAngle = armAngle + THREE.MathUtils.degToRad(gait === 'run' ? 85 - 23 * drive : 14 - 6 * drive)
        // A running hand swings in toward the sternum in front and back out past the hip.
        const cross = gait === 'run' ? 0.03 - 0.12 * (1 - drive) : 0.03
        const foreTucked = new THREE.Vector3(side === 'L' ? cross : -cross, -Math.cos(foreAngle), Math.sin(foreAngle))
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
    // A running leg leaves the ground with a soft knee instead of snapping straight.
    const foot = targets[i][index], reach = (bind[`shin.${side}`].pos.length() + SHIN_LENGTH - 0.001) * (gait === 'run' ? 0.996 : 1)
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
  // Flight is a ballistic arc; support catches that fall and returns it as the
  // next launch. A plain sine glides.
  const cadence = (1 + (stride - 1) / 0.4) / stride, gravity = RUN_GRAVITY / cadence ** 2
  const air = (0.5 - stance) * duration, ground = stance * duration, launch = gravity * air / 2
  const pelvis = frames.map((_, i) => {
    if (gait !== 'run') return mean + 1.25 * (cosine * Math.cos(4 * Math.PI * i / count) + sine * Math.sin(4 * Math.PI * i / count))
    const step = i / count % 0.5, t = step / stance, tau = (step - stance) * duration
    return step > stance ? mean + launch * tau - gravity * tau * tau / 2
      : mean + ((t ** 3 - t * t) - (t ** 3 - 2 * t * t + t)) * ground * launch
  })
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
        // A swinging running leg never locks: ease a soft-knee limit in after
        // toe-off and back out before contact so neither end snaps straight.
        const u = ((i / count + index * 0.5) % 1 - stance) / (1 - stance)
        const soften = gait === 'run' ? 0.996 - 0.011 * smooth(Math.min(u, 1 - u) / 0.12) : 1
        const reach = (bind[`shin.${side}`].pos.length() + SHIN_LENGTH - 0.001) * soften
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
      // A driven running knee swings slightly outward instead of pumping like a piston.
      const swinging = gait === 'run' ? Math.max(0, ((i / count + index * 0.5) % 1 - stance) / (1 - stance)) : 0
      const ahead = forward.clone().setX((side === 'L' ? 0.06 : -0.06) * Math.sin(Math.PI * swinging))
      const pole = ahead.addScaledVector(axis, -ahead.dot(axis)).normalize()
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
