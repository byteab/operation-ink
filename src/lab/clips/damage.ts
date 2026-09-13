import * as THREE from 'three'
import { makeClip, type Key, type Pose } from '../clip'
import type { BoneName } from '../rig'
import type { Action, Ctx } from '../registry'
import { hang } from './idle'

/**
 * Hit reactions. Shooter stands in front (+Z) so blood exits backward (-Z). Hit arm / hit leg are the
 * character's RIGHT (.R); use mirrorPose() on the keys if a left-side variant is ever needed.
 * Heights: hips rest 0.82, knee 0.42, head centre 1.33. Lying root y ≈ 0.10-0.15 (root offset ≈ -0.70).
 */
export type Region = 'head' | 'body' | 'arm' | 'leg'

const K = (t: number, pose: Pose, root?: Key['root']): Key => ({ t, pose, root })
const limp: Pose = { 'upper_arm.L': [-80, 0, 0], 'upper_arm.R': [-80, 0, 0], 'forearm.L': [0, 0, 0], 'forearm.R': [0, 0, 0] }
const clutchChest: Pose = {
  'upper_arm.L': [-62, -70, 0], 'forearm.L': [-30, 0, -125], 'hand.L': [-20, 0, 0],
  'upper_arm.R': [-62, 70, 0], 'forearm.R': [-30, 0, 125], 'hand.R': [-20, 0, 0],
}

// ---------------------------------------------------------------- flinches (one-shot, back to idle)

const flinchHead = makeClip('flinchHead', [
  K(0, hang),
  K(0.08, { ...hang, head: [-38, 28, 12], neck: [-18, 0, 0], chest: [-8, 0, 0],
    'upper_arm.L': [-55, -45, 0], 'forearm.L': [0, 0, -85], 'upper_arm.R': [-55, 45, 0], 'forearm.R': [0, 0, 85] }, [0, 0, -0.03]),
  K(0.26, { head: [-14, 16, 6], neck: [-6, 0, 0], chest: [-3, 0, 0],
    'upper_arm.L': [-68, -20, 0], 'forearm.L': [0, 0, -40], 'upper_arm.R': [-68, 20, 0], 'forearm.R': [0, 0, 40] }, [0, 0, -0.02]),
  K(0.5, { ...hang, head: [0, 0, 0], neck: [0, 0, 0], chest: [0, 0, 0] }, [0, 0, 0]),
])

const flinchBody = makeClip('flinchBody', [
  K(0, hang),
  K(0.08, { ...clutchChest, spine: [26, 0, 0], chest: [18, 0, 0], head: [-8, 0, 0],
    'thigh.R': [32, 0, 0], 'shin.R': [35, 0, 0], 'thigh.L': [-10, 0, 0], 'shin.L': [8, 0, 0] }, [0, -0.05, -0.06]),
  K(0.26, { spine: [30, 0, 0], chest: [15, 0, 0], head: [-12, 0, 0],
    'thigh.R': [12, 0, 0], 'shin.R': [12, 0, 0], 'thigh.L': [-22, 0, 0], 'shin.L': [22, 0, 0] }, [0, -0.08, -0.16]),
  K(0.42, { spine: [12, 0, 0], chest: [6, 0, 0], head: [-4, 0, 0],
    'thigh.R': [-8, 0, 0], 'shin.R': [8, 0, 0], 'thigh.L': [-12, 0, 0], 'shin.L': [26, 0, 0] }, [0, -0.04, -0.08]),
  K(0.6, { ...hang, spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0],
    'thigh.R': [0, 0, 0], 'shin.R': [0, 0, 0], 'thigh.L': [0, 0, 0], 'shin.L': [0, 0, 0] }, [0, 0, 0]),
])

const flinchArm = makeClip('flinchArm', [
  K(0, hang),
  K(0.06, { ...hang, 'upper_arm.R': [-58, -85, 0], 'forearm.R': [0, 0, 60], chest: [4, -22, 0], head: [4, -18, 0], spine: [0, -6, 0] }, [0, 0, -0.03]),
  K(0.24, { 'upper_arm.R': [-70, 25, 0], 'forearm.R': [-20, 0, 95], 'hand.R': [-20, 0, 0],
    'upper_arm.L': [-66, -48, 0], 'forearm.L': [-55, 0, -105], 'hand.L': [-25, 0, 0],
    chest: [10, -10, 0], head: [22, -10, 0], spine: [6, -4, 0] }, [0, -0.02, -0.02]),
  K(0.4, { 'upper_arm.R': [-72, 15, 0], 'forearm.R': [-15, 0, 80], 'upper_arm.L': [-68, -40, 0], 'forearm.L': [-45, 0, -95], head: [15, -6, 0] }),
  K(0.6, { ...hang, 'hand.L': [0, 0, 0], 'hand.R': [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], spine: [0, 0, 0] }, [0, 0, 0]),
])

const flinchLeg = makeClip('flinchLeg', [
  K(0, hang),
  K(0.08, { 'thigh.R': [-22, 0, 0], 'shin.R': [75, 0, 0], 'thigh.L': [-6, 0, -10], 'shin.L': [14, 0, 0], hips: [6, 0, 9], spine: [4, 0, -5],
    'upper_arm.L': [-40, -25, 0], 'upper_arm.R': [-40, 25, 0], 'forearm.L': [0, 0, -30], 'forearm.R': [0, 0, 30] }, [0, -0.13, 0]),
  K(0.22, { 'thigh.R': [-32, 0, 0], 'shin.R': [65, 0, 0], 'thigh.L': [-4, 0, -6], 'shin.L': [4, 0, 0], hips: [4, 0, 5] }, [0, 0.03, 0]),
  K(0.34, { 'thigh.R': [-15, 0, 0], 'shin.R': [45, 0, 0], 'shin.L': [26, 0, 0], hips: [3, 0, 4] }, [0, -0.06, 0]),
  K(0.56, { ...hang, 'thigh.R': [0, 0, 0], 'shin.R': [0, 0, 0], 'thigh.L': [0, 0, 0], 'shin.L': [0, 0, 0], hips: [0, 0, 0], spine: [0, 0, 0] }, [0, 0, 0]),
])

// ---------------------------------------------------------------- deaths (one-shot, hold last frame)

/** Head: snap back, limbs go limp, sit straight down, topple onto the back. Ends on the back, head at -Z. */
const dieHead = makeClip('dieHead', [
  K(0, hang),
  K(0.07, { ...limp, head: [-45, 22, 15], neck: [-20, 0, 0], chest: [-10, 0, 0] }, [0, 0, -0.02]),
  K(0.28, { 'thigh.L': [-25, 0, 0], 'thigh.R': [-25, 0, 0], 'shin.L': [60, 0, 0], 'shin.R': [60, 0, 0], hips: [-6, 0, 0], head: [-40, 22, 15],
    'upper_arm.L': [-80, -20, 0], 'upper_arm.R': [-80, 20, 0] }, [0, -0.11, -0.05]),
  K(0.48, { 'thigh.L': [-55, 0, -6], 'thigh.R': [-55, 0, -6], 'shin.L': [115, 0, 0], 'shin.R': [115, 0, 0], hips: [-18, 0, 0], head: [-30, 22, 15],
    'upper_arm.L': [-80, -5, 0], 'upper_arm.R': [-80, 5, 0] }, [0, -0.37, -0.12]),
  K(0.6, { hips: [-40, 0, 0], 'thigh.L': [-60, 0, -6], 'thigh.R': [-60, 0, -6], 'shin.L': [95, 0, 0], 'shin.R': [95, 0, 0], head: [-22, 22, 15] }, [0, -0.43, -0.2]),
  K(0.72, { hips: [-66, 0, 0], 'thigh.L': [-20, 0, -6], 'thigh.R': [-20, 0, -6], 'shin.L': [20, 0, 0], 'shin.R': [20, 0, 0], head: [-15, 22, 15] }, [0, -0.52, -0.32]),
  K(0.84, { hips: [-90, 0, 0], 'thigh.L': [-28, 0, -6], 'thigh.R': [-28, 0, -6], 'shin.L': [58, 0, 0], 'shin.R': [58, 0, 0], head: [24, 22, 15], neck: [8, 0, 0],
    'upper_arm.L': [-62, 8, 0], 'upper_arm.R': [-62, -8, 0], 'forearm.L': [0, 0, -15], 'forearm.R': [0, 0, 15] }, [0, -0.71, -0.5]),
  K(0.92, { hips: [-85, 0, 0], head: [32, 22, 15] }, [0, -0.68, -0.5]),
  K(1.02, { hips: [-90, 0, 0], head: [22, 24, 15] }, [0, -0.71, -0.5]),
  K(1.7, { 'thigh.L': [-12, 0, -8], 'thigh.R': [-10, 0, -5], 'shin.L': [28, 0, 0], 'shin.R': [22, 0, 0], head: [22, 34, 18], neck: [10, 0, 0],
    'upper_arm.L': [-55, 6, 0], 'upper_arm.R': [-60, -4, 0], 'forearm.L': [-12, 0, -25], 'forearm.R': [0, 0, 10], 'hand.L': [-20, 0, 0] }, [0, -0.71, -0.5]),
])

/** Body: clutch chest, two steps back, to the knees, face-down forward. Ends prone, head at +Z. */
const dieBody = makeClip('dieBody', [
  K(0, hang),
  K(0.1, { ...clutchChest, chest: [-10, 0, 0], head: [10, 0, 0] }, [0, 0, -0.03]),
  K(0.35, { spine: [22, 0, 0], chest: [14, 0, 0], head: [14, 0, 0],
    'thigh.R': [30, 0, 0], 'shin.R': [40, 0, 0], 'thigh.L': [-15, 0, 0], 'shin.L': [10, 0, 0] }, [0, -0.04, -0.2]),
  K(0.6, { spine: [30, 0, 0], chest: [16, 0, 0],
    'thigh.L': [30, 0, 0], 'shin.L': [40, 0, 0], 'thigh.R': [-12, 0, 0], 'shin.R': [16, 0, 0] }, [0, -0.02, -0.42]),
  K(0.85, { spine: [18, 0, 0], chest: [10, 0, 0], head: [-12, 0, 0], hips: [0, 0, 0],
    'thigh.L': [0, 0, -4], 'shin.L': [110, 0, 0], 'thigh.R': [0, 0, -4], 'shin.R': [110, 0, 0] }, [0, -0.38, -0.46]),
  K(1.02, { hips: [12, 0, 0], head: [-6, 0, 0] }, [0, -0.39, -0.44]),
  K(1.26, { hips: [58, 0, 0], spine: [10, 0, 0], chest: [6, 0, 0], head: [-18, 0, 0],
    'thigh.L': [0, 0, -4], 'thigh.R': [0, 0, -4], 'shin.L': [100, 0, 0], 'shin.R': [100, 0, 0],
    'upper_arm.L': [-55, -22, 0], 'upper_arm.R': [-55, 22, 0], 'forearm.L': [-50, 0, -30], 'forearm.R': [-50, 0, 30] }, [0, -0.56, -0.15]),
  K(1.4, { hips: [90, 0, 0], spine: [0, 0, 0], chest: [-6, 0, 0], head: [-20, 20, 0], neck: [-14, 0, 0],
    'thigh.L': [0, 0, -4], 'thigh.R': [0, 0, -4], 'shin.L': [35, 0, 0], 'shin.R': [30, 0, 0],
    'upper_arm.L': [-50, 0, 0], 'upper_arm.R': [-50, 0, 0], 'forearm.L': [-65, 0, 0], 'forearm.R': [-65, 0, 0], 'hand.L': [0, 0, 0], 'hand.R': [0, 0, 0] }, [0, -0.71, -0.09]),
  K(1.48, { hips: [86, 0, 0], head: [-26, 20, 0] }, [0, -0.68, -0.09]),
  K(1.58, { hips: [90, 0, 0], head: [-20, 22, 0] }, [0, -0.71, -0.09]),
  K(2.0, { 'shin.L': [12, 0, 0], 'shin.R': [8, 0, 0], head: [-18, 42, 0], neck: [-12, 0, 0],
    'upper_arm.L': [-25, 4, 0], 'upper_arm.R': [-40, -6, 0], 'forearm.L': [-30, 0, 0], 'forearm.R': [-50, 0, 0] }, [0, -0.71, -0.09]),
])

/** Arm: impact spins the body half a turn, falls onto the right side, hit arm splayed out front. Ends on the right side, head at +X. */
const dieArm = makeClip('dieArm', [
  K(0, hang),
  K(0.08, { ...hang, 'upper_arm.R': [-50, -95, 0], 'forearm.R': [0, 0, 40], chest: [0, -22, 0], hips: [0, -15, 0], head: [0, -20, 0] }, [0, 0, -0.03]),
  K(0.3, { hips: [4, -80, 0], chest: [4, -10, 0], head: [8, -10, 0],
    'thigh.L': [-22, 0, 0], 'shin.L': [30, 0, 0], 'thigh.R': [14, 0, 0], 'shin.R': [10, 0, 0],
    'upper_arm.L': [-38, 35, 0], 'forearm.L': [0, 0, -20], 'upper_arm.R': [-30, -60, 0], 'forearm.R': [0, 0, 25] }, [0.02, -0.05, -0.1]),
  K(0.44, { hips: [8, -115, -14], head: [4, -4, -14], 'thigh.L': [-26, 0, 0], 'shin.L': [55, 0, 0], 'thigh.R': [2, 0, 0], 'shin.R': [28, 0, 0] }, [0.06, -0.1, -0.12]),
  K(0.55, { hips: [10, -140, -40], chest: [0, 0, 0], head: [0, 0, -15],
    'thigh.L': [-30, 0, 0], 'shin.L': [60, 0, 0], 'thigh.R': [-5, 0, 0], 'shin.R': [55, 0, 0],
    'upper_arm.L': [-30, 20, 0], 'upper_arm.R': [-45, 70, 0], 'forearm.R': [0, 0, 30] }, [0.12, -0.1, -0.15]),
  K(0.63, { hips: [0, -165, -65], head: [5, 0, -18],
    'thigh.L': [-42, 0, 4], 'shin.L': [62, 0, 0], 'thigh.R': [-12, 0, 0], 'shin.R': [45, 0, 0],
    'upper_arm.L': [-50, -40, 0], 'upper_arm.R': [-85, 80, 0], 'forearm.R': [0, 0, 30] }, [0.2, -0.36, -0.15]),
  K(0.72, { hips: [0, -180, -90], head: [10, 0, -20], neck: [0, 0, -6],
    'thigh.L': [-42, 0, 4], 'shin.L': [62, 0, 0], 'thigh.R': [-12, 0, 0], 'shin.R': [22, 0, 0],
    'upper_arm.L': [-70, -80, 0], 'forearm.L': [-60, 0, 0], 'upper_arm.R': [-90, 85, 0], 'forearm.R': [0, 0, 24], 'hand.R': [0, 0, 0] }, [0.26, -0.65, -0.15]),
  K(0.8, { hips: [0, -180, -84] }, [0.27, -0.62, -0.15]),
  K(0.9, { hips: [0, -180, -90] }, [0.27, -0.65, -0.15]),
  K(1.5, { head: [20, 0, -24], 'thigh.L': [-48, 0, 6], 'shin.L': [70, 0, 0], 'thigh.R': [-6, 0, 0], 'shin.R': [14, 0, 0],
    'upper_arm.L': [-74, -70, 0], 'forearm.L': [-70, 0, -10], 'upper_arm.R': [-90, 92, 0], 'forearm.R': [0, 0, 14] }, [0.27, -0.65, -0.15]),
])

/** Leg: right leg folds, drops to that knee, hands reach for the ground, rolls over the right shoulder onto the back. Ends on the back rolled 50° to the right. */
const dieLeg = makeClip('dieLeg', [
  K(0, hang),
  K(0.08, { 'thigh.R': [-30, 0, 0], 'shin.R': [90, 0, 0], 'thigh.L': [-20, 0, -6], 'shin.L': [45, 0, 0], hips: [10, 0, 10], spine: [4, 0, -4],
    'upper_arm.L': [-40, -30, 0], 'upper_arm.R': [-40, 30, 0], 'forearm.L': [0, 0, -25], 'forearm.R': [0, 0, 25] }, [0, -0.06, 0]),
  K(0.3, { 'thigh.R': [5, 0, 0], 'shin.R': [115, 0, 0], 'thigh.L': [-110, 0, -10], 'shin.L': [85, 0, 0], hips: [25, 0, 5], spine: [15, 0, 0], head: [-10, 0, 0],
    'upper_arm.L': [-50, -70, 0], 'forearm.L': [0, 0, -30], 'upper_arm.R': [-50, 70, 0], 'forearm.R': [0, 0, 30] }, [0, -0.38, -0.05]),
  K(0.42, { hips: [42, 0, 2], spine: [12, 0, 0], head: [-22, 0, 0], 'thigh.L': [-80, 0, -10], 'shin.L': [125, 0, 0],
    'upper_arm.L': [-40, -85, 0], 'forearm.L': [0, 0, -15], 'upper_arm.R': [-40, 85, 0], 'forearm.R': [0, 0, 15] }, [0, -0.4, 0.03]),
  K(0.55, { hips: [62, 0, 0], spine: [8, 0, 0], head: [-30, 0, 0], 'thigh.L': [-50, 0, -10], 'shin.L': [80, 0, 0], 'thigh.R': [-50, 0, 0], 'shin.R': [80, 0, 0],
    'upper_arm.L': [-30, -92, 0], 'forearm.L': [0, 0, -5], 'upper_arm.R': [-30, 92, 0], 'forearm.R': [0, 0, 5], 'hand.L': [0, 0, -30], 'hand.R': [0, 0, 30] }, [0, -0.4, 0.1]),
  K(0.78, { hips: [30, 0, 40], spine: [0, 0, 0], head: [-10, 0, 15], 'thigh.L': [-85, 0, 10], 'shin.L': [120, 0, 0], 'thigh.R': [-80, 0, 0], 'shin.R': [120, 0, 0],
    'upper_arm.L': [-45, -60, 0], 'forearm.L': [-20, 0, -80], 'upper_arm.R': [-60, 40, 0], 'forearm.R': [0, 0, 40] }, [-0.06, -0.48, 0.05]),
  K(0.88, { hips: [-5, 0, 45], head: [0, 0, 20], 'thigh.L': [-80, 0, 14], 'shin.L': [120, 0, 0], 'thigh.R': [-80, 0, 0], 'shin.R': [120, 0, 0] }, [-0.09, -0.5, -0.02]),
  K(0.98, { hips: [-40, 0, 50], head: [10, 0, 25], 'thigh.L': [-55, 0, 20], 'shin.L': [20, 0, 0], 'thigh.R': [-60, 0, 0], 'shin.R': [30, 0, 0],
    'upper_arm.L': [-58, -50, 0], 'forearm.L': [-30, 0, -90], 'upper_arm.R': [-80, 25, 0], 'forearm.R': [0, 0, 30] }, [-0.12, -0.58, -0.1]),
  K(1.12, { hips: [-90, 0, 50], head: [22, 0, 30], neck: [8, 0, 5], 'thigh.L': [-40, 0, 20], 'shin.L': [40, 0, 0], 'thigh.R': [-45, 0, 0], 'shin.R': [70, 0, 0] }, [-0.14, -0.68, -0.16]),
  K(1.2, { hips: [-84, 0, 48] }, [-0.14, -0.65, -0.16]),
  K(1.3, { hips: [-90, 0, 50] }, [-0.14, -0.68, -0.16]),
  K(1.9, { head: [24, 10, 34], neck: [10, 0, 5], 'thigh.L': [-22, 0, 24], 'shin.L': [30, 0, 0], 'thigh.R': [-42, 0, -4], 'shin.R': [96, 0, 0],
    'upper_arm.L': [-62, -44, 0], 'forearm.L': [-20, 0, -70], 'hand.L': [-15, 0, 0], 'upper_arm.R': [-85, 0, 0], 'forearm.R': [0, 0, 30], 'hand.R': [0, 0, 0] }, [-0.14, -0.68, -0.16]),
])

/** Shot from behind: thrown forward, lands flat on the face with the arms out. Ends prone, head at +Z. */
const dieBack = makeClip('dieBack', [
  K(0, hang),
  K(0.08, { chest: [22, 0, 0], head: [-22, 0, 0], 'upper_arm.L': [-35, -60, 0], 'upper_arm.R': [-35, 60, 0], 'forearm.L': [0, 0, -30], 'forearm.R': [0, 0, 30] }, [0, 0, 0.05]),
  K(0.3, { hips: [32, 0, 0], chest: [12, 0, 0], head: [-25, 0, 0], 'thigh.L': [12, 0, 0], 'thigh.R': [6, 0, 0], 'shin.L': [25, 0, 0], 'shin.R': [15, 0, 0] }, [0, -0.1, 0.18]),
  K(0.52, { hips: [72, 0, 0], chest: [4, 0, 0], head: [-30, 0, 0], 'upper_arm.L': [-30, -85, 0], 'upper_arm.R': [-30, 85, 0], 'forearm.L': [0, 0, -10], 'forearm.R': [0, 0, 10],
    'thigh.L': [0, 0, 0], 'thigh.R': [0, 0, 0], 'shin.L': [30, 0, 0], 'shin.R': [20, 0, 0] }, [0, -0.42, 0.42]),
  K(0.66, { hips: [90, 0, 0], chest: [-6, 0, 0], head: [-22, 30, 0], neck: [-14, 0, 0],
    'upper_arm.L': [-20, 0, 0], 'upper_arm.R': [-20, 0, 0], 'forearm.L': [-40, 0, 0], 'forearm.R': [-40, 0, 0], 'shin.L': [22, 0, 0], 'shin.R': [12, 0, 0] }, [0, -0.71, 0.58]),
  K(0.74, { hips: [85, 0, 0] }, [0, -0.67, 0.58]),
  K(0.84, { hips: [90, 0, 0] }, [0, -0.71, 0.58]),
  K(1.4, { head: [-18, 44, 0], neck: [-12, 0, 0], 'upper_arm.L': [-10, 4, 0], 'upper_arm.R': [-30, -4, 0], 'forearm.L': [-25, 0, 0], 'forearm.R': [-55, 0, 0], 'shin.L': [8, 0, 0], 'shin.R': [4, 0, 0] }, [0, -0.71, 0.58]),
])

export const clips = { flinchHead, flinchBody, flinchArm, flinchLeg, dieHead, dieBody, dieArm, dieLeg, dieBack }

// ---------------------------------------------------------------- helper + actions

const hitBone: Record<Region, BoneName> = { head: 'head', body: 'chest', arm: 'forearm.R', leg: 'thigh.R' }
const flinchOf: Record<Region, THREE.AnimationClip> = { head: flinchHead, body: flinchBody, arm: flinchArm, leg: flinchLeg }
const deathOf: Record<Region, THREE.AnimationClip> = { head: dieHead, body: dieBody, arm: dieArm, leg: dieLeg }

function spray(ctx: Ctx, bone: BoneName, amount: number) {
  const pos = ctx.rig.bones[bone].getWorldPosition(new THREE.Vector3())
  const dir = new THREE.Vector3(0, 0.25, -1).normalize()
  ctx.fx.blood?.spray?.(pos, dir, amount)
}

/** Play the hit reaction for a region. Non-lethal returns to idle; lethal holds the final frame. */
export async function hitRegion(ctx: Ctx, region: Region, lethal: boolean) {
  const { player, clips: all } = ctx
  spray(ctx, hitBone[region], lethal ? (region === 'head' ? 1 : 0.7) : 0.2)
  if (lethal) {
    if (await player.play(deathOf[region], { once: true })) ctx.fx.blood?.pool?.(ctx.rig.bones.chest.getWorldPosition(new THREE.Vector3()), 6)
    return
  }
  await player.play(flinchOf[region], { once: true, fade: 0.05 })
  // play() resolves the previous one-shot early when interrupted (e.g. by a death): only return to idle if we're still the flinch
  if (all.idle && player.current?.getClip() === flinchOf[region]) player.play(all.idle)
}

const regions: Region[] = ['head', 'body', 'arm', 'leg']
export const actions: Action[] = [
  ...regions.map((r): Action => ({ group: 'Damage', label: `Flinch: ${r}`, run: ctx => hitRegion(ctx, r, false) })),
  ...regions.map((r, i): Action => ({ group: 'Damage', label: `Die: ${r}`, hotkey: String(i + 1), run: ctx => hitRegion(ctx, r, true) })),
  { group: 'Damage', label: 'Die: from behind', hotkey: '5', run: async ctx => { spray(ctx, 'chest', 0.8); await ctx.player.play(dieBack, { once: true }) } },
]
