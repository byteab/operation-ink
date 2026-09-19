import type * as THREE from 'three'
import { makeClip, type Key, type Pose } from '../clip'
import { hang } from './idle'
import type { Action, Ctx } from '../registry'

// Enemy AI behaviour clips. Every pose spreads `stand` so fill-forward never leaves a leg/torso bone stuck.
// Axis cheatsheet (rig.ts): thigh -X = knee forward, shin +X = bend, spine/head +X = forward/nod, head +Y = turn left,
// upper_arm: X -80 hangs, Z ±90 straight forward (L -, R +); hanging arm Y swings forward (L -, R +).

const stand: Pose = {
  ...hang, hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0],
  'thigh.L': [0, 0, 0], 'thigh.R': [0, 0, 0], 'shin.L': [0, 0, 0], 'shin.R': [0, 0, 0],
  'hand.L': [0, 0, 0], 'hand.R': [0, 0, 0],
}

// ── curious ──────────────────────────────────────────────────────────────────
const flinch: Pose = {
  ...stand, spine: [-8, 0, 0], chest: [-6, 0, 0], head: [16, 0, 0],
  'upper_arm.L': [-60, -20, 0], 'upper_arm.R': [-60, 20, 0], 'forearm.L': [0, 0, -40], 'forearm.R': [0, 0, 40],
  'thigh.L': [-6, 0, 0], 'thigh.R': [-6, 0, 0], 'shin.L': [12, 0, 0], 'shin.R': [12, 0, 0],
}
const tense: Pose = {
  ...stand, spine: [-2, 0, 0], chest: [-2, 0, 0], head: [8, 0, 0],
  'upper_arm.L': [-72, -8, 0], 'upper_arm.R': [-72, 8, 0], 'forearm.L': [0, 0, -25], 'forearm.R': [0, 0, 25],
}
const CROUCH_Y = -0.15
const crouch: Pose = {
  ...stand, spine: [15, 0, 0], chest: [4, 0, 0], head: [-10, 0, 0],
  'thigh.L': [-35, 0, 0], 'thigh.R': [-35, 0, 0], 'shin.L': [70, 0, 0], 'shin.R': [70, 0, 0],
  'upper_arm.L': [-62, -15, 0], 'upper_arm.R': [-62, 15, 0], 'forearm.L': [0, 0, -35], 'forearm.R': [0, 0, 35],
}
// Head is a featureless ball, so the turn reads mostly through the torso twist + a small ear tilt.
const look = (y: number, extra: Pose = {}): Pose => ({ ...crouch, head: [-10, y, y * 0.15], chest: [4, y * 0.4, 0], spine: [15, y * 0.2, 0], ...extra })

// One creep step pair (left forward, then right forward). Low stance, right hand feeling ahead.
const CREEP = 1.0
const creepBase: Pose = {
  ...crouch,
  'upper_arm.R': [-55, 70, 0], 'forearm.R': [0, 0, 55], 'hand.R': [0, 0, 20],
  'upper_arm.L': [-70, 8, 0], 'forearm.L': [0, 0, -30],
}
const step = (l: [number, number], r: [number, number], head: number): Pose => ({
  ...creepBase, head: [-10, head, 0], 'thigh.L': [l[0], 0, 0], 'shin.L': [l[1], 0, 0], 'thigh.R': [r[0], 0, 0], 'shin.R': [r[1], 0, 0],
})
const creepKeys: Key[] = [
  { t: 0, pose: step([-50, 70], [-18, 68], 6), root: [0, CROUCH_Y, 0] },
  { t: 0.25, pose: step([-35, 70], [-35, 70], 0), root: [0, CROUCH_Y + 0.015, 0] },
  { t: 0.5, pose: step([-18, 68], [-50, 70], -6), root: [0, CROUCH_Y, 0] },
  { t: 0.75, pose: step([-35, 70], [-35, 70], 0), root: [0, CROUCH_Y + 0.015, 0] },
]
const repeat = (keys: Key[], cycle: number, n: number): Key[] =>
  Array.from({ length: n }, (_, i) => keys.map(k => ({ ...k, t: k.t + i * cycle }))).flat().concat({ ...keys[0], t: cycle * n })

// ── alert ────────────────────────────────────────────────────────────────────
const READY_Y = -0.025
const ready: Pose = {
  ...stand, spine: [6, 0, 0], chest: [3, 0, 0], head: [-4, 0, 0],
  'thigh.L': [-14, 0, -6], 'thigh.R': [-14, 0, 6], 'shin.L': [28, 0, 0], 'shin.R': [28, 0, 0],
  'upper_arm.L': [-52, -50, 0], 'upper_arm.R': [-52, 50, 0], 'forearm.L': [0, 0, -100], 'forearm.R': [0, 0, 100],
  'hand.L': [0, 0, -20], 'hand.R': [0, 0, 20],
}

// ── point ────────────────────────────────────────────────────────────────────
const point: Pose = {
  ...stand, spine: [12, -6, 0], chest: [8, -4, 0], head: [-6, 4, 0],
  'upper_arm.R': [-5, 0, 88], 'forearm.R': [0, 0, 5],
  'upper_arm.L': [-70, 10, 0], 'forearm.L': [0, 0, -30],
  'thigh.L': [-12, 0, 0], 'shin.L': [12, 0, 0], 'thigh.R': [6, 0, 0], 'shin.R': [6, 0, 0],
}

// ── cower ────────────────────────────────────────────────────────────────────
const COWER_Y = -0.35
const cower: Pose = {
  ...stand, spine: [30, 0, 0], chest: [15, 0, 0], head: [35, 0, 0],
  'thigh.L': [-60, 0, 0], 'thigh.R': [-60, 0, 0], 'shin.L': [110, 0, 0], 'shin.R': [110, 0, 0],
  // hands land beside the face (head is a 0.2 m ball on a 45° torso, so "over the head" = forward-up here)
  'upper_arm.L': [58, 0, -35], 'upper_arm.R': [58, 0, 35], 'forearm.L': [55, 0, 0], 'forearm.R': [55, 0, 0],
  'hand.L': [-30, 0, 0], 'hand.R': [-30, 0, 0],
}
const shake = (z: number): Pose => ({ ...cower, spine: [30, 0, z], head: [35, 0, -z] })

// ── taunt ────────────────────────────────────────────────────────────────────
const beckon = (curl: number, tilt = 12): Pose => ({
  ...stand, chest: [-3, -6, 4], head: [-2, -10, tilt],
  'upper_arm.R': [-30, 0, 75], 'forearm.R': [curl, 0, 0], 'hand.R': [curl > 60 ? 20 : -30, 0, 0],
  'upper_arm.L': [-76, 0, 0],
})

/** A planted idle with separate glances, not a whole-body side-to-side sweep.
 * The featureless head needs a small shoulder follow to read the turn, but the
 * pelvis and feet must not move to exaggerate it. Bake independent timings so
 * the head arrives first and the chest catches up after it. */
function relaxedLook() {
  const duration = 9.6, count = Math.round(duration * 60)
  const ease = (value: number) => {
    const u = Math.max(0, Math.min(1, value))
    return u * u * u * (10 + u * (-15 + u * 6))
  }
  const glance = (t: number, start: number, arrive: number, leave: number, end: number) =>
    ease((t - start) / (arrive - start)) * (1 - ease((t - leave) / (end - leave)))
  const gaze = (t: number) => 30 * glance(t, 0.8, 1.32, 3.05, 3.63) - 34 * glance(t, 4.85, 5.45, 7.3, 7.96)
  const keys: Key[] = Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count * duration
    const turn = gaze(t), neck = gaze(t - 0.055), shoulders = gaze(t - 0.17), waist = gaze(t - 0.24)
    const breath = (1 - Math.cos(2 * Math.PI * t / 4.8)) * 0.5
    const left = glance(t, 1.05, 1.55, 2.9, 3.55), right = glance(t, 5.1, 5.65, 7.15, 7.9)
    return {
      t, root: [0, 0, 0], ease: 'linear',
      pose: {
        ...stand,
        spine: [-0.15 * breath, waist * 0.035, 0],
        chest: [-0.45 * breath, shoulders * 0.14, 0],
        neck: [0, neck * 0.16, 0],
        head: [0.6 * breath + 1.8 * left - right, turn * 0.84, 0.6 * left + 0.4 * right],
        // Loose hanging arms absorb a little of the shoulder turn. No gesture
        // or shrug that could be mistaken for the character being pulled along.
        'upper_arm.L': [-78, -shoulders * 0.045, 0],
        'upper_arm.R': [-78, -shoulders * 0.045, 0],
      },
    }
  })
  return makeClip('lookRelaxed', keys, { loop: true, duration })
}

export const clips = {
  startle: makeClip('startle', [
    { t: 0, pose: stand },
    { t: 0.08, pose: flinch, root: [0, -0.02, 0], ease: 'linear' },
    { t: 0.3, pose: tense, root: [0, 0, 0] },
  ]),
  lower: makeClip('lower', [
    { t: 0, pose: tense },
    { t: 0.1, pose: { ...tense, spine: [-4, 0, 0] }, root: [0, 0.01, 0] },
    { t: 0.32, pose: { ...crouch, spine: [18, 0, 0] }, root: [0, CROUCH_Y - 0.02, 0] },
    { t: 0.4, pose: crouch, root: [0, CROUCH_Y, 0] },
  ]),
  lookAround: makeClip('lookAround', [
    { t: 0, pose: crouch, root: [0, CROUCH_Y, 0] },
    { t: 0.1, pose: look(-6) },
    { t: 0.4, pose: look(52) },
    { t: 0.55, pose: look(45) },
    { t: 0.95, pose: look(45, { head: [-13, 45, 7] }) },
    { t: 1.05, pose: look(50) },
    { t: 1.4, pose: look(-52) },
    { t: 1.55, pose: look(-45) },
    { t: 1.85, pose: look(-45, { head: [-13, -45, -7] }) },
    { t: 2.1, pose: crouch },
  ]),
  creep: makeClip('creep', creepKeys, { loop: true, duration: CREEP }),
  creepIn: makeClip('creepIn', repeat(creepKeys, CREEP, 2)),
  rise: makeClip('rise', [
    { t: 0, pose: crouch, root: [0, CROUCH_Y, 0] },
    { t: 0.38, pose: { ...stand, spine: [-3, 0, 0], chest: [-2, 0, 0], head: [-3, 0, 0] }, root: [0, 0.01, 0] },
    { t: 0.5, pose: stand, root: [0, 0, 0] },
  ]),

  alert: makeClip('alert', [
    { t: 0, pose: stand },
    { t: 0.1, pose: { ...stand, head: [-8, 0, 0], chest: [-5, 0, 0] }, ease: 'linear' },
    { t: 0.35, pose: { ...ready, 'upper_arm.L': [-70, -10, 0], 'upper_arm.R': [-70, 10, 0], 'forearm.L': [0, 0, -40], 'forearm.R': [0, 0, 40] }, root: [0, READY_Y - 0.01, 0] },
    { t: 0.55, pose: { ...ready, 'forearm.L': [0, 0, -118], 'forearm.R': [0, 0, 118] }, root: [0, READY_Y, 0] },
    { t: 0.7, pose: ready },
  ]),
  alertIdle: makeClip('alertIdle', [
    { t: 0, pose: ready, root: [0, READY_Y, 0] },
    { t: 0.6, pose: { ...ready, chest: [5, 3, 0], head: [-4, 12, 0], hips: [0, 0, 2] }, root: [0.015, READY_Y, 0] },
    { t: 1.2, pose: { ...ready, chest: [2, 0, 0] }, root: [0, READY_Y + 0.005, 0] },
    { t: 1.8, pose: { ...ready, chest: [5, -3, 0], head: [-4, -12, 0], hips: [0, 0, -2] }, root: [-0.015, READY_Y, 0] },
  ], { loop: true, duration: 2.4 }),

  lookRelaxed: relaxedLook(),

  point: makeClip('point', [
    { t: 0, pose: stand },
    { t: 0.15, pose: { ...stand, chest: [-4, 4, 0], head: [-4, 0, 0], 'upper_arm.R': [-85, 20, 0] } },
    { t: 0.4, pose: { ...point, spine: [15, -7, 0], 'upper_arm.R': [-2, 0, 96] } },
    { t: 0.55, pose: point },
    { t: 0.75, pose: { ...point, head: [5, 4, 0], chest: [11, -4, 0] } },
    { t: 0.9, pose: { ...point, head: [-8, 4, 0] } },
    { t: 1.05, pose: { ...point, head: [5, 4, 0], chest: [11, -4, 0] } },
    { t: 1.5, pose: point },
    { t: 1.95, pose: { ...stand, chest: [-2, 0, 0] } },
    { t: 2.1, pose: stand },
  ]),

  cower: makeClip('cower', [
    { t: 0, pose: stand },
    { t: 0.1, pose: { ...stand, spine: [-4, 0, 0], head: [-6, 0, 0], 'upper_arm.L': [-50, -20, 0], 'upper_arm.R': [-50, 20, 0] } },
    { t: 0.35, pose: { ...cower, spine: [34, 0, 0] }, root: [0, COWER_Y - 0.03, 0] },
    { t: 0.5, pose: cower, root: [0, COWER_Y, 0] },
  ]),
  cowerHold: makeClip('cowerHold', [
    { t: 0, pose: cower, root: [0, COWER_Y, 0] },
    { t: 0.09, pose: shake(2), root: [0.005, COWER_Y, 0] },
    { t: 0.18, pose: shake(-2), root: [-0.005, COWER_Y, 0] },
    { t: 0.27, pose: shake(1.5), root: [0.004, COWER_Y - 0.003, 0] },
  ], { loop: true, duration: 0.36 }),

  taunt: makeClip('taunt', [
    { t: 0, pose: stand },
    { t: 0.15, pose: { ...stand, chest: [-3, 0, 0], 'upper_arm.R': [-85, 15, 0] } },
    { t: 0.45, pose: beckon(30, 16) },
    { t: 0.55, pose: beckon(35) },
    { t: 0.8, pose: beckon(140) },
    { t: 1.0, pose: beckon(35) },
    { t: 1.25, pose: beckon(140) },
    { t: 1.45, pose: beckon(35) },
    { t: 1.7, pose: beckon(140) },
    { t: 1.95, pose: beckon(35) },
    { t: 2.4, pose: { ...stand, head: [0, 0, -2] } },
    { t: 2.55, pose: stand },
  ]),
}

/** Like player.queue, but stops (returns false) if something else interrupted the sequence. */
async function seq(player: Ctx['player'], list: THREE.AnimationClip[]) {
  for (const clip of list) {
    await player.play(clip, { once: true })
    if (player.current?.getClip() !== clip) return false
  }
  return true
}

/** Missed shot → startle, lower body, look left/right, creep two steps, stand back up to idle. */
export async function curious(ctx: Ctx) {
  if (ctx.weapons.guns?.nearMiss) { await ctx.weapons.guns.nearMiss('curious'); return }
  const { player, clips: c } = ctx
  if (await seq(player, [clips.startle, clips.lower, clips.lookAround, clips.creepIn, clips.rise])) player.play(c.idle)
}

const then = (clip: keyof typeof clips, next: (c: Ctx['clips']) => THREE.AnimationClip) => async (ctx: Ctx) => {
  if (await seq(ctx.player, [clips[clip]])) ctx.player.play(next(ctx.clips))
}

export const actions: Action[] = [
  { group: 'Behaviour', label: 'Missed shot → curious', hotkey: 'm', run: curious },
  { group: 'Behaviour', label: 'Missed shot → drop prone', run: ctx => ctx.weapons.guns?.nearMiss('prone') },
  { group: 'Behaviour', label: 'Missed shot → one knee', run: ctx => ctx.weapons.guns?.nearMiss('kneel') },
  { group: 'Behaviour', label: 'Alert', run: then('alert', () => clips.alertIdle) },
  { group: 'Behaviour', label: 'Look around (relaxed)', run: ({ player }) => { player.play(clips.lookRelaxed) } },
  { group: 'Behaviour', label: 'Point/shout', run: then('point', c => c.idle) },
  { group: 'Behaviour', label: 'Cower', run: then('cower', () => clips.cowerHold) },
  { group: 'Behaviour', label: 'Taunt', run: then('taunt', c => c.idle) },
]
