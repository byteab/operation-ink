import type * as THREE from 'three'
import { makeClip, mirrorPose, type Key, type Pose, type Vec3 } from '../clip'
import { hang } from './idle'
import type { Action, Ctx } from '../registry'
import { bakeGait } from '../gait'

// All clips are in place: the game moves/turns the root. Axis cheat sheet (rig.ts):
//   thigh x: - forward (knee lift) / + back      shin x: + bends knee (keep >= 0)
//   upper_arm y: L -fwd/+back, R +fwd/-back      forearm z: L - bends / R + bends
//   hips/spine/chest x: + lean forward, y: + turn left, z: + lean right

const LEG = 0.79 // thigh 0.371 + shin 0.42, hips node at y 0.82
/** hips y drop that keeps the feet on the floor for a symmetric crouch with the thighs at `deg` from vertical */
const drop = (deg: number) => -LEG * (1 - Math.cos((deg * Math.PI) / 180))
const legs = (thigh: number, shin: number, spread = 0): Pose => ({
  'thigh.L': [thigh, 0, -spread], 'thigh.R': [thigh, 0, spread], 'shin.L': [shin, 0, 0], 'shin.R': [shin, 0, 0],
})
/** Symmetric crouch: thighs `deg` forward of vertical (world), knees under the hips, pelvis pitched `lean` forward.
 *  Thighs are children of hips, so the pelvis pitch is subtracted from the thigh angle. */
const squat = (deg: number, lean: number, spread = 0): Pose => ({ ...legs(-(deg + lean), deg * 2, spread), hips: [lean, 0, 0] })

// Whole-body walk/run references are retargeted together in gait.ts.
const walk = bakeGait('walk')
const run = bakeGait('run')
const mirrorKeys = (keys: Key[], half: number): Key[] =>
  keys.map(k => ({ ...k, t: k.t + half, pose: mirrorPose(k.pose), root: k.root && ([-k.root[0], k.root[1], k.root[2]] as Vec3) }))

// ---------------------------------------------------------------- jump (1.1 s)
const jump = makeClip('jump', [
  { t: 0, pose: { ...hang, ...legs(0, 0), hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0] }, root: [0, 0, 0] },
  { t: 0.14, root: [0, drop(20), 0], pose: { ...squat(20, 14, 3), spine: [4, 0, 0], chest: [3, 0, 0], head: [-6, 0, 0],
    'upper_arm.L': [-74, 20, 0], 'upper_arm.R': [-74, -20, 0] } },
  { t: 0.28, root: [0, drop(38) + 0.01, 0], pose: {    // anticipation crouch, arms swing back
    ...squat(38, 28, 6), spine: [8, 0, 0], chest: [6, 0, 0], head: [-14, 0, 0],
    'upper_arm.L': [-70, 45, 0], 'upper_arm.R': [-70, -45, 0], 'forearm.L': [0, 0, -15], 'forearm.R': [0, 0, 15],
  } },
  { t: 0.42, root: [0, 0.12, 0], pose: {              // launch: everything extends, arms thrown up
    ...legs(6, 0, 3), hips: [-4, 0, 0], spine: [-4, 0, 0], chest: [-4, 0, 0], head: [-4, 0, 0],
    'upper_arm.L': [40, 0, -20], 'upper_arm.R': [40, 0, 20], 'forearm.L': [0, 0, -20], 'forearm.R': [0, 0, 20],
  } },
  { t: 0.62, root: [0, 0.45, 0], pose: {              // apex tuck
    ...squat(55, 10, 5), spine: [6, 0, 0], chest: [4, 0, 0], head: [-4, 0, 0],
    'upper_arm.L': [-20, 0, -40], 'upper_arm.R': [-20, 0, 40], 'forearm.L': [0, 0, -50], 'forearm.R': [0, 0, 50],
  } },
  { t: 0.8, root: [0, 0.12, 0], pose: {               // legs reach for the ground
    ...squat(18, 6, 5), spine: [2, 0, 0], chest: [2, 0, 0],
    'upper_arm.L': [-40, 0, -30], 'upper_arm.R': [-40, 0, 30], 'forearm.L': [0, 0, -30], 'forearm.R': [0, 0, 30],
  } },
  { t: 0.9, root: [0, drop(34), 0], pose: {           // landing absorb
    ...squat(34, 24, 6), spine: [8, 0, 0], chest: [6, 0, 0], head: [-14, 0, 0],
    'upper_arm.L': [-55, -30, 0], 'upper_arm.R': [-55, 30, 0], 'forearm.L': [0, 0, -40], 'forearm.R': [0, 0, 40],
  } },
  { t: 1.0, root: [0, drop(18), 0], pose: { ...squat(18, 12, 3), spine: [4, 0, 0], chest: [3, 0, 0], head: [-6, 0, 0], 'upper_arm.L': [-70, -10, 0], 'upper_arm.R': [-70, 10, 0] } },
  { t: 1.1, root: [0, 0, 0], pose: { ...hang, ...legs(0, 0), hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0] } },
])

// ---------------------------------------------------------------- crouch idle / crouch walk
const CROUCH = 42, LEAN = 30
const sneakArms: Pose = {
  'upper_arm.L': [-60, -5, 0], 'forearm.L': [0, 0, -45],        // left arm tucked, elbow bent
  'upper_arm.R': [-55, 35, 0], 'forearm.R': [0, 0, 50],         // right hand slightly forward, ready
}
const crouchBase: Pose = { ...squat(CROUCH, LEAN, 8), spine: [6, 0, 0], chest: [4, 0, 0], head: [-18, 0, 0], ...sneakArms }
const crouchRoot: Vec3 = [0, drop(CROUCH), 0]
const crouchIdle = makeClip('crouchIdle', [
  { t: 0, pose: crouchBase, root: [0, crouchRoot[1] - 0.02, 0] },
  { t: 1.4, pose: { ...crouchBase, chest: [6, 0, 0], head: [-16, 0, 0], 'upper_arm.R': [-55, 38, 0] }, root: [0, crouchRoot[1] - 0.008, 0] },
], { loop: true, duration: 2.8 })

const sneakHalf: Key[] = [
  { t: 0, root: [0.015, crouchRoot[1] - 0.01, 0], pose: {  // L foot placed forward, R behind (thigh values include the pelvis pitch)
    ...crouchBase, 'thigh.L': [-(62 + LEAN), 0, -6], 'shin.L': [78, 0, 0], 'thigh.R': [-(24 + LEAN), 0, 6], 'shin.R': [88, 0, 0],
    hips: [LEAN, -6, 0], chest: [4, 6, 0],
  } },
  { t: 0.3, root: [0.02, crouchRoot[1] + 0.01, 0], pose: {  // R leg lifts and passes
    ...crouchBase, 'thigh.L': [-(44 + LEAN), 0, -6], 'shin.L': [80, 0, 0], 'thigh.R': [-(50 + LEAN), 0, 6], 'shin.R': [110, 0, 0],
    hips: [LEAN, 0, -2], chest: [4, 0, 2],
  } },
]
// the mirrored half would swap the arms too; the lead hand stays the right one
const sneakKeys = [...sneakHalf, ...mirrorKeys(sneakHalf, 0.6)].map((k, i) => ({
  ...k, pose: { ...k.pose, ...sneakArms, 'upper_arm.R': [-55, 35 + (i % 2 ? -4 : 4), 0] as Vec3 },
}))
const crouchWalk = makeClip('crouchWalk', sneakKeys, { loop: true, duration: 1.2 })

// ---------------------------------------------------------------- turn in place (0.5 s)
// Built in the NEW heading's frame: hips start twisted back toward the old heading and unwind to 0.
// The action rotates rig.root by the turn angle before playing so the world facing is continuous.
const TURN = 60
const turnKeys: Key[] = [
  { t: 0, pose: { ...hang, ...legs(0, 0), hips: [0, -TURN, 0], chest: [0, 0, 0], head: [0, 0, 0] } },
  { t: 0.12, pose: { hips: [0, -TURN, 0], head: [0, TURN * 0.7, 0], chest: [0, TURN * 0.35, 0] } },    // eyes + shoulders lead
  { t: 0.28, root: [0, -0.02, 0], pose: {                                                              // hips come round, near foot steps
    hips: [2, -TURN * 0.35, 0], head: [0, TURN * 0.3, 0], chest: [0, TURN * 0.15, 0],
    'thigh.L': [-20, 0, -8], 'shin.L': [45, 0, 0], 'thigh.R': [4, 0, 0], 'shin.R': [6, 0, 0],
    'upper_arm.L': [-75, -12, 0], 'upper_arm.R': [-75, -12, 0],
  } },
  { t: 0.42, root: [0, -0.005, 0], pose: { hips: [0, 0, 0], head: [0, 0, 0], chest: [0, 0, 0], ...legs(-2, 8), ...hang } },
  { t: 0.5, root: [0, 0, 0], pose: { ...legs(0, 0) } },
]
const turnL = makeClip('turnL', turnKeys)
const turnR = makeClip('turnR', mirrorKeys(turnKeys, 0))

// ---------------------------------------------------------------- stumble back (0.7 s): non-lethal hit to the body
const stumble = makeClip('stumble', [
  { t: 0, pose: { ...hang, ...legs(0, 0), hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0] } },
  { t: 0.1, root: [0, -0.01, -0.02], pose: {        // impact: torso folds back, arms fly forward
    hips: [-6, 4, 0], spine: [-10, 0, 0], chest: [-14, 0, 0], head: [-16, 0, 0],
    'upper_arm.L': [-40, -50, 0], 'upper_arm.R': [-40, 50, 0], 'forearm.L': [0, 0, -60], 'forearm.R': [0, 0, 60],
    'thigh.L': [-8, 0, 0], 'shin.L': [12, 0, 0], 'thigh.R': [-6, 0, 0], 'shin.R': [10, 0, 0],
  } },
  { t: 0.3, root: [0, -0.035, -0.05], pose: {        // right foot catches the body behind
    hips: [-2, 2, 0], spine: [-6, 0, 0], chest: [-8, 0, 0], head: [-10, 0, 0],
    'upper_arm.L': [-45, -40, 0], 'upper_arm.R': [-45, 40, 0],
    'thigh.L': [-22, 0, -4], 'shin.L': [34, 0, 0], 'thigh.R': [26, 0, 6], 'shin.R': [14, 0, 0],
  } },
  { t: 0.5, root: [0, -0.008, -0.03], pose: {        // settle, weight back over both feet
    hips: [2, 0, 0], spine: [2, 0, 0], chest: [0, 0, 0], head: [2, 0, 0],
    'upper_arm.L': [-65, -15, 0], 'upper_arm.R': [-65, 15, 0], 'forearm.L': [0, 0, -25], 'forearm.R': [0, 0, 25],
    'thigh.L': [-10, 0, -4], 'shin.L': [14, 0, 0], 'thigh.R': [12, 0, 4], 'shin.R': [18, 0, 0],
  } },
  { t: 0.7, root: [0, 0, 0], pose: { ...hang, ...legs(0, 0), hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0] } },
])

export const clips = { walk, run, jump, crouchIdle, crouchWalk, turnL, turnR, stumble }

// These clips contain absolute hips-position tracks for foot-grounding. Blending
// those tracks with a different gait independently of the leg rotations makes the
// feet dip and skate during transitions. Keep locomotion transitions at the
// authored pose boundary; the clips remain in place and the game still moves the
// rig root.
const LOCOMOTION_FADE = 0

/** Play a one-shot, then fall back to idle unless something else took over meanwhile. */
async function oneShot(ctx: Ctx, clip: THREE.AnimationClip, fade = 0) {
  const { player } = ctx
  const action = player.mixer.clipAction(clip)
  await player.play(clip, { once: true, fade })
  if (player.current === action) player.play(ctx.clips.idle, { fade })
}
const turn = (ctx: Ctx, clip: THREE.AnimationClip, sign: 1 | -1, fade = 0) => {
  ctx.rig.root.rotation.y += (sign * TURN * Math.PI) / 180
  return oneShot(ctx, clip, fade)
}

export const actions: Action[] = [
  // Locomotion clips contain their own hips height offsets. Blending those offsets with
  // the previous gait makes both feet dip and skate during transitions, so switch gait
  // clips at a pose boundary and let the authored cycle establish its root height.
  { group: 'Locomotion', label: 'Walk', hotkey: 'w', run: ({ player }) => { player.play(walk, { fade: LOCOMOTION_FADE }) } },
  { group: 'Locomotion', label: 'Run', hotkey: 'r', run: ({ player }) => { player.play(run, { fade: LOCOMOTION_FADE }) } },
  { group: 'Locomotion', label: 'Jump', hotkey: ' ', run: ctx => oneShot(ctx, jump, LOCOMOTION_FADE) },
  { group: 'Locomotion', label: 'Crouch', hotkey: 'c', run: ({ player }) => { player.play(crouchIdle, { fade: LOCOMOTION_FADE }) } },
  { group: 'Locomotion', label: 'Crouch walk', run: ({ player }) => { player.play(crouchWalk, { fade: LOCOMOTION_FADE }) } },
  { group: 'Locomotion', label: 'Turn L', run: ctx => turn(ctx, turnL, 1, LOCOMOTION_FADE) },
  { group: 'Locomotion', label: 'Turn R', run: ctx => turn(ctx, turnR, -1, LOCOMOTION_FADE) },
  { group: 'Locomotion', label: 'Stumble', run: ctx => oneShot(ctx, stumble, LOCOMOTION_FADE) },
]
