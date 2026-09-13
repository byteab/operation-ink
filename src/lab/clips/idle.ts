import { makeClip, type Pose } from '../clip'
import type { Action } from '../registry'

/** Arms hanging at the sides with a slightly bent elbow. Reuse as the base for standing poses. */
export const hang: Pose = {
  'upper_arm.L': [-78, 0, 0], 'upper_arm.R': [-78, 0, 0],
  'forearm.L': [0, 0, -10], 'forearm.R': [0, 0, 10],
}

const exhale: Pose = { ...hang, spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0] }
const inhale: Pose = {
  ...hang,
  'upper_arm.L': [-76, 0, 3], 'upper_arm.R': [-76, 0, -3],
  spine: [-1, 0, 0], chest: [-2.5, 0, 0], head: [1.5, 0, 0],
}

export const clips = {
  idle: makeClip('idle', [
    { t: 0, pose: exhale },
    { t: 1.7, pose: inhale, root: [0, 0.008, 0] },
  ], { loop: true, duration: 3.6 }),
}

export const actions: Action[] = [
  { group: 'Locomotion', label: 'Idle', hotkey: 'i', run: ({ player }) => { player.play(clips.idle) } },
]
