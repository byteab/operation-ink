import * as THREE from 'three'
import { makeClip, type BoneVal, type Key, type Pose } from '../clip'
import { hang } from '../clips/idle'
import type { Action, Ctx } from '../registry'
import { builders, disposeGun, type Gun, type GunClass, type GunName } from './models'
import { placeHand, supportHand } from './support'

/*
 * Guns held in hand.R. Mount maps the gun frame (+Z barrel, +Y up, +X right side) into hand.R's rest-local
 * frame: barrel = hand +Y (along the fingers), gun up = hand -X (index-finger side), gun right side = hand -Z (palm).
 * Poses below were found with a coordinate-descent solver on the live rig (see README "Verified bone axes").
 */
const MOUNT_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)))
const MOUNT_POS = new THREE.Vector3(0, 0.035, 0)

// ---------------------------------------------------------------- poses
// One-hand aim: right arm straight forward (+Z) at shoulder height, forearm twisted so the gun is upright.
// upper_arm Z=108 because the chest/spine turn (-18) yaws the arm back to +Z.
const aim1: Pose = {
  ...hang,
  'upper_arm.R': [0, 0, 108], 'forearm.R': [0, 90, 0], 'hand.R': [0, 0, 0],
  chest: [0, -12, 0], spine: [0, -6, 0], head: [2, 8, 0],
  'thigh.L': [0, 0, 4], 'thigh.R': [0, 0, 4],
}
const recoil1: Pose = { 'upper_arm.R': [7, 0, 108], 'forearm.R': [0, 90, 6], 'hand.R': [0, 0, 14], chest: [-2, -12, 0] }

// Two-hand aim (gun held high in front of the chest, trigger elbow hanging at the waist, left hand on the handguard),
// body bladed 30°. The 4th value is a bone LENGTH factor: the trigger arm gets a shorter upper arm and a longer forearm so
// the elbow can hang under the shoulder while the fist reaches the grip (solved by IK in the lab, 2026-09-13).
const aim2: Pose = {
  hips: [0, -30, 0], spine: [0, -5, 0], chest: [4, -8, 0], head: [0, 15, 0],
  'upper_arm.R': [-46.2, -30.7, 140.4, 0.95], 'forearm.R': [96.9, -12.7, 103.2, 1.25], 'hand.R': [12.7, 13.1, -52.2],
  'upper_arm.L': [-21.9, -82.6, -44.4], 'forearm.L': [1.9, 17.2, -11.1], 'hand.L': [3.8, 0.2, -27],
  'thigh.L': [-8, 0, 0], 'thigh.R': [6, 0, -6], 'shin.L': [8, 0, 0],
}
const recoil2: Pose = { chest: [1, -8, 0], head: [-2, 15, 0], 'upper_arm.R': [-43.7, -30.7, 140.4, 0.95], 'upper_arm.L': [-19.4, -82.6, -44.4] }
// Hip fire (AK): rifle at the waist, body bladed 20°.
const hip2: Pose = {
  hips: [0, -20, 0], spine: [0, -4, 0], chest: [2, -6, 0], head: [4, 18, 0],
  'upper_arm.R': [-80.82, -3.45, 45.94], 'forearm.R': [-4.13, 7.65, 123.26], 'hand.R': [23.79, 1.19, -24.78],
  'upper_arm.L': [-86.51, -38.04, -2.75], 'forearm.L': [-1.07, -1.09, -77.04], 'hand.L': [4.16, 1.86, -3.06],
  'thigh.L': [-8, 0, 0], 'thigh.R': [6, 0, -6], 'shin.L': [8, 0, 0],
}
const recoilHip: Pose = { 'upper_arm.R': [-78.32, -3.45, 45.94], 'upper_arm.L': [-84.01, -38.04, -2.75], chest: [0, -6, 0] }
// Low ready: rifle held diagonally across the body, muzzle down-left.
const lowReady: Pose = {
  chest: [2, -8, 0], head: [0, 8, 0],
  'upper_arm.R': [-88.1, -1.24, 19.32], 'forearm.R': [-0.86, -20.99, 143.91], 'hand.R': [-34.08, -7.59, -56.23],
  'upper_arm.L': [-92.73, -29.94, -0.28], 'forearm.L': [-1.13, -40.81, -74.5], 'hand.L': [-17.12, 14.15, -8.13],
}

// Reloads: the gun stays in hand.R; the left hand does the work. Left-arm keys were solved against gun-local
// points (mag well, slide, charging handle...) so they land on the model.
type Arm = [BoneVal, BoneVal, BoneVal]   // upper_arm, forearm, hand
const armL = (base: Pose, [u, f, h]: Arm): Pose => ({ ...base, 'upper_arm.L': u, 'forearm.L': f, 'hand.L': h })
const chestHold: Pose = { ...hang, chest: [6, 0, 0], head: [22, -6, 0], 'upper_arm.R': [-124.47, 45.83, -9.6], 'forearm.R': [-137.96, 78.04, 29.95], 'hand.R': [106.42, 14.32, -113.77] }
const reloadPistol: Key[] = [
  { t: 0, pose: chestHold },
  { t: 0.35, pose: armL(chestHold, [[-95, -61, -12], [0, -9, -37], [-33, 0, -45]]) },  // hand.L on the mag
  { t: 0.6, pose: armL(chestHold, [[-100, -55, 0], [0, -21, -5], [-45, 0, -45]]) },    // mag out (pull down)
  { t: 1.0, pose: armL(chestHold, [[-95, -61, -12], [0, -9, -37], [-33, 0, -45]]) },   // new mag in
  { t: 1.35, pose: armL(chestHold, [[-97, -64, -24], [0, 17, -80], [-45, 0, 36]]) },   // hand.L over the slide
  { t: 1.55, pose: armL(chestHold, [[-97, -52, -30], [0, 11, -94], [-42, 0, 44]]) },   // rack back
  { t: 1.9, pose: chestHold },
]
// Load at the cylinder without the pistol's magazine swap and slide rack.
const cylinderHold = armL(chestHold, [[-94, -64, -19], [0, 6, -53], [-25, 0, -30]])
const reloadRevolver: Key[] = [
  { t: 0, pose: chestHold }, { t: 0.35, pose: cylinderHold },
  { t: 0.7, pose: cylinderHold },
  { t: 1.1, pose: armL(chestHold, [[-79, 30, 15], [0, -79, -118], [45, 0, 45]]) },
  { t: 1.5, pose: cylinderHold }, { t: 1.9, pose: cylinderHold },
  { t: 2.2, pose: chestHold },
]
const reloadAk: Key[] = [
  { t: 0, pose: lowReady },
  { t: 0.4, pose: armL(lowReady, [[-89, -24, -28], [0, -48, -31], [-45, 0, -45]]) },  // grab mag
  { t: 0.7, pose: armL(lowReady, [[-80, -30, -20], [0, -40, -8], [-45, 0, -45]]) },   // rock out
  { t: 1.2, pose: armL(lowReady, [[-89, -24, -28], [0, -48, -31], [-45, 0, -45]]) },  // rock in
  { t: 1.6, pose: armL(lowReady, [[-100, -13, -6], [0, 5, -69], [-45, 0, -21]]) },    // charging handle
  { t: 1.8, pose: armL(lowReady, [[-98, -4, -30], [0, -43, -88], [-24, 0, 14]]) },    // pull
  { t: 2.3, pose: lowReady },
]
const reloadShotgun: Key[] = [
  { t: 0, pose: lowReady },
  ...[0, 1, 2].flatMap(i => [
    { t: 0.4 + i * 0.5, pose: armL(lowReady, [[-79, 30, 15], [0, -79, -118], [45, 0, 45]]) },   // shell from belt
    { t: 0.7 + i * 0.5, pose: armL(lowReady, [[-91, -27, -28], [0, -48, -25], [-45, 0, -45]]) }, // push into port
  ]),
  { t: 2.3, pose: lowReady },
]
const reloadSniper: Key[] = [
  { t: 0, pose: lowReady },
  { t: 0.4, pose: armL(lowReady, [[-92, -25, -22], [0, -42, -29], [-45, 0, -45]]) },  // mag box
  { t: 0.7, pose: armL(lowReady, [[-82, -28, -22], [0, -42, -10], [-45, 0, -45]]) },  // out
  { t: 1.2, pose: armL(lowReady, [[-92, -25, -22], [0, -42, -29], [-45, 0, -45]]) },  // in
  { t: 1.6, pose: lowReady },
]
// Shotgun pump: left hand slides back then forward along the tube (gun part follows, see kick()).
const pump: Key[] = [
  { t: 0, pose: aim2 },
  { t: 0.2, pose: armL(aim2, [[-72.3, -67.9, 5.2], [-1.9, 19.8, -61.4], [-0.8, -2.3, 4.1]]) },   // hand 7 cm back along the tube
  { t: 0.45, pose: aim2 },
]
// Sniper bolt: gun is re-parented to hand.L for the clip so the right hand can leave the grip.
// The right arm is solved against the bolt handle in the current aim2 mount (the gun used to
// retain a pose from the previous shoulder setup, leaving the hand 10+ cm short).
const boltUp: Pose = { ...aim2, 'upper_arm.R': [-27.4, -25.7, 150.4, 0.95], 'forearm.R': [118.1, -6, 78.3, 1.25], 'hand.R': [-2.3, 1.5, -74.6] }
const bolt: Key[] = [
  { t: 0, pose: aim2 },
  { t: 0.25, pose: boltUp },                                                                            // up to the handle
  { t: 0.45, pose: boltUp },                                                                            // pull the bolt while maintaining the grip
  { t: 0.7, pose: boltUp },                                                                             // forward + down
  { t: 1.0, pose: aim2 },
]

const still = (name: string, pose: Pose) => makeClip(name, [{ t: 0, pose }], { loop: true, duration: 1 })
const hip1: Pose = { ...hang, chest: hip2.chest, spine: hip2.spine, hips: hip2.hips,
  'upper_arm.R': hip2['upper_arm.R'], 'forearm.R': hip2['forearm.R'], 'hand.R': hip2['hand.R'] }
const shot = (name: string, base: Pose, kick: Pose, dur: number, loop = false) =>
  makeClip(name, [{ t: 0, pose: base }, { t: 0.04, pose: { ...base, ...kick }, ease: 'linear' }, { t: dur, pose: base }], { loop, duration: dur })

export const clips = {
  gun_aim1: still('gun_aim1', aim1), gun_fire1: shot('gun_fire1', aim1, recoil1, 0.16), gun_auto1: shot('gun_auto1', aim1, recoil1, 0.08, true),
  gun_aim2: still('gun_aim2', aim2), gun_fire2: shot('gun_fire2', aim2, recoil2, 0.2), gun_auto2: shot('gun_auto2', aim2, recoil2, 0.1, true),
  gun_hip: still('gun_hip', hip2), gun_fireHip: shot('gun_fireHip', hip2, recoilHip, 0.2), gun_autoHip: shot('gun_autoHip', hip2, recoilHip, 0.1, true),
  gun_hip1: still('gun_hip1', hip1), gun_fireHip1: shot('gun_fireHip1', hip1, { 'upper_arm.R': recoilHip['upper_arm.R'] }, 0.18),
  gun_autoHip1: shot('gun_autoHip1', hip1, { 'upper_arm.R': recoilHip['upper_arm.R'] }, 60 / 900, true),
  gun_lowReady: still('gun_lowReady', lowReady),
  gun_pump: makeClip('gun_pump', pump), gun_bolt: makeClip('gun_bolt', bolt),
  gun_reload_pistol: makeClip('gun_reload_pistol', reloadPistol), gun_reload_ak: makeClip('gun_reload_ak', reloadAk),
  gun_reload_revolver: makeClip('gun_reload_revolver', reloadRevolver),
  gun_reload_shotgun: makeClip('gun_reload_shotgun', reloadShotgun), gun_reload_sniper: makeClip('gun_reload_sniper', reloadSniper),
}

// ---------------------------------------------------------------- state
type Stance = 'down' | 'aim' | 'hip'
type Operation = { gun: Gun; clip: THREE.AnimationClip | null; supportPose?: THREE.Quaternion[] }
let ctx: Ctx
let gun: Gun | null = null
let stance: Stance = 'down'
let auto = false
let nextShot = 0
let busy: Operation | null = null
let autoClip: THREE.AnimationClip | null = null
let time = 0 // Follows playback speed, including pause.
const RPM: Partial<Record<GunName, number>> = { smg: 900, ak: 600 }
const SHELL: Record<GunClass, 'shot' | 'cycle'> = { pistol: 'shot', ak: 'shot', shotgun: 'cycle', sniper: 'cycle' }

const fx = new THREE.Group()
fx.name = 'gun effects'
type Fade = { obj: THREE.Sprite | THREE.Line; t0: number; dur: number }
const fades: Fade[] = []
type Shell = { obj: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; t0: number }
const shells: Shell[] = []
type Motion = {
  obj: THREE.Object3D; property: 'position' | 'rotation'; axis: 'x' | 'y' | 'z'
  base: number; amp: number; t0: number; dur: number; shape: 'kick' | 'hold' | 'step'
}
const motions: Motion[] = []
const timers: { at: number; op: Operation; fn: () => void }[] = []
const shellGeom = new THREE.CylinderGeometry(0.005, 0.005, 0.02, 8)
const shellMat = new THREE.MeshBasicMaterial({ color: 0xd9b23c })
const shotgunShellGeom = new THREE.CylinderGeometry(0.007, 0.007, 0.028, 10)
const shotgunShellMat = new THREE.MeshBasicMaterial({ color: 0xa94e38 })
const flashTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,230,1)'); grad.addColorStop(0.35, 'rgba(255,210,80,0.9)'); grad.addColorStop(1, 'rgba(255,150,30,0)')
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
})()

function restClip() { return gun?.userData.twoHanded ? clips.gun_lowReady : ctx.clips.idle ?? clips.gun_lowReady }
function stanceClip(s: Stance) {
  if (s === 'down') return restClip()
  if (s === 'hip') return gun?.userData.twoHanded ? clips.gun_hip : clips.gun_hip1
  return gun?.userData.twoHanded ? clips.gun_aim2 : clips.gun_aim1
}
function remount(g = gun) {
  if (!g) return
  ctx.rig.bones['hand.R'].add(g)
  g.position.copy(MOUNT_POS); g.quaternion.copy(MOUNT_Q)
}
function resetMechanisms() {
  for (const m of motions) m.obj[m.property][m.axis] = m.base
  motions.length = 0
}
function cancel() {
  busy = null; auto = false; autoClip = null
  timers.length = 0
  resetMechanisms()
  remount()
}
function setStance(s: Stance) {
  cancel(); stance = s
  ctx.player.play(stanceClip(s))
}

/** Muzzle origin + barrel direction in world space, including the current rig pose. */
function muzzle(g: Gun) {
  g.updateWorldMatrix(true, false)
  const origin = g.localToWorld(g.userData.muzzle.clone())
  const direction = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld)
  return { origin, direction }
}

/** Stable rest points prevent repeated shots from accumulating slide drift. */
function move(obj: THREE.Object3D | undefined, axis: Motion['axis'], amp: number, dur: number,
  shape: Motion['shape'] = 'kick', property: Motion['property'] = 'position') {
  if (!obj) return
  const previous = motions.findIndex(m => m.obj === obj && m.axis === axis && m.property === property)
  const base = previous < 0 ? obj[property][axis] : motions.splice(previous, 1)[0].base
  motions.push({ obj, axis, property, base, amp, dur, shape, t0: time })
}
function eject(g: Gun, point = g.userData.eject, revolver = false) {
  if (g !== gun || (g.userData.name === 'revolver' && !revolver)) return
  const isShotgun = g.userData.cls === 'shotgun'
  const obj = new THREE.Mesh(isShotgun ? shotgunShellGeom : shellGeom, isShotgun ? shotgunShellMat : shellMat)
  g.updateWorldMatrix(true, false)
  obj.position.copy(g.localToWorld(point.clone()))
  const right = new THREE.Vector3(revolver ? -0.4 : 1, 0, revolver ? -1 : 0).transformDirection(g.matrixWorld)
  const vel = right.multiplyScalar(1.4 + Math.random() * 0.5).add(new THREE.Vector3(0, revolver ? -0.3 : 1.8, 0))
  obj.quaternion.copy(g.getWorldQuaternion(new THREE.Quaternion()))
  fx.add(obj)
  shells.push({ obj, vel, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(30), t0: time })
}
function bang(g: Gun) {
  const ray = muzzle(g)
  const size = g.userData.twoHanded ? 0.16 : 0.1
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false }))
  flash.scale.setScalar(size); flash.position.copy(ray.origin).addScaledVector(ray.direction, size * 0.3)
  fx.add(flash); fades.push({ obj: flash, t0: time, dur: 0.04 })
  const tracer = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([ray.origin, ray.origin.clone().addScaledVector(ray.direction, 8)]),
    new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true }))
  fx.add(tracer); fades.push({ obj: tracer, t0: time, dur: 0.08 })
  if (SHELL[g.userData.cls] === 'shot') eject(g)
  move(g.userData.parts.slide, 'z', -0.03, 0.06)
  if (RPM[g.userData.name]) move(g.userData.parts.bolt, 'z', -0.025, 0.055)
  move(g.userData.parts.cylinder, 'z', Math.PI / 3, 0.1, 'step', 'rotation')
  move(g.userData.parts.hammer, 'x', -0.4, 0.1, 'kick', 'rotation')
  return ray
}

function later(op: Operation, delay: number, fn: () => void) { timers.push({ at: time + delay, op, fn }) }
function active(op: Operation) { return busy === op && gun === op.gun }
async function play(op: Operation, clip: THREE.AnimationClip, fade = 0.05) {
  if (!active(op)) return false
  op.clip = clip
  return await ctx.player.play(clip, { once: true, fade }) && active(op)
}
function run(job: (op: Operation) => Promise<void>) {
  if (!gun || busy) return
  const op: Operation = { gun, clip: null }
  busy = op
  void job(op).finally(() => {
    if (!active(op)) return
    busy = null
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].op === op) timers.splice(i, 1)
    resetMechanisms()
    remount(op.gun)
  })
}

/** One shot and the required manual cycle. Ray is returned immediately in world space. */
function fire(): ReturnType<typeof muzzle> | null {
  if (!gun || busy || auto) return null
  if (stance === 'down') stance = 'aim'
  const g = gun, two = g.userData.twoHanded
  const clip = stance === 'hip' ? (two ? clips.gun_fireHip : clips.gun_fireHip1) : two ? clips.gun_fire2 : clips.gun_fire1
  let ray: ReturnType<typeof muzzle> | null = null
  run(async op => {
    // Sample the firing pose before emitting, including a shot from low-ready.
    const recoil = play(op, clip, 0)
    ctx.player.update(0)
    alignSupport()
    ray = bang(g)
    if (!await recoil) return
    if (g.userData.cls === 'shotgun') {
      // Hip shots still need a pump cycle; shoulder briefly to cycle the action.
      const cycle = play(op, clips.gun_pump)
      move(g.userData.parts.pump, 'z', -0.07, clips.gun_pump.duration)
      later(op, 0.2, () => eject(g))
      if (!await cycle) return
    } else if (g.userData.cls === 'sniper') {
      // Establish the shoulder pose before handing the rifle to the support hand.
      ctx.player.play(clips.gun_aim2, { fade: 0 }); ctx.player.update(0); alignSupport()
      op.supportPose = supportBones.map(name => ctx.rig.bones[name].quaternion.clone())
      ctx.rig.bones['hand.L'].attach(g)
      const cycle = play(op, clips.gun_bolt)
      holdSupport(op)
      later(op, 0.25, () => move(g.userData.parts.bolt, 'z', -0.04, 0.45))
      later(op, 0.45, () => eject(g))
      const done = await cycle
      if (!active(op)) return
      op.supportPose = undefined
      remount(g)
      if (!done) return
    }
    ctx.player.play(stanceClip(stance), { fade: 0.08 })
  })
  return ray
}

function equip(name: GunName) {
  if (!Object.hasOwn(builders, name)) return
  unequip()
  gun = builders[name]()
  remount()
  setStance('down')
}
function unequip() {
  cancel()
  if (gun) disposeGun(gun)
  gun = null; stance = 'down'
  ctx.player.play(ctx.clips.idle ?? clips.gun_lowReady)
}
function toggleAuto() {
  if (!gun || busy || !RPM[gun.userData.name]) return
  if (auto) {
    auto = false; autoClip = null; resetMechanisms()
    ctx.player.play(stanceClip(stance))
    return
  }
  if (stance === 'down') stance = 'aim'
  auto = true; nextShot = time
  autoClip = stance === 'hip'
    ? (gun.userData.twoHanded ? clips.gun_autoHip : clips.gun_autoHip1)
    : gun.userData.twoHanded ? clips.gun_auto2 : clips.gun_auto1
  ctx.player.play(autoClip, { fade: 0, speed: autoClip.duration / (60 / RPM[gun.userData.name]!) })
  ctx.player.update(0)
}
function reload() {
  if (!gun || busy) return
  auto = false; autoClip = null; resetMechanisms()
  const g = gun, name = g.userData.name
  run(async op => {
    const clip = name === 'revolver' ? clips.gun_reload_revolver : clips[`gun_reload_${g.userData.cls}`]
    const reloading = play(op, clip)
    if (name === 'revolver') {
      later(op, 0.3, () => move(g.userData.parts.cylinder, 'x', -0.065, 1.65, 'hold'))
      later(op, 0.8, () => {
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3
          eject(g, g.userData.eject.clone().add(new THREE.Vector3(-0.065 + Math.sin(a) * 0.019, Math.cos(a) * 0.019, 0)), true)
        }
      })
    } else {
      const magStart = name === 'pistol' || name === 'smg' ? 0.35 : 0.4
      const magDuration = name === 'pistol' || name === 'smg' ? 0.65 : 0.8
      later(op, magStart, () => move(g.userData.parts.magazine, 'y', name === 'smg' ? -0.17 : -0.12, magDuration, 'hold'))
      if (name === 'pistol') later(op, 1.35, () => move(g.userData.parts.slide, 'z', -0.03, 0.3))
      if (name === 'smg' || name === 'ak') later(op, 1.55, () => move(g.userData.parts.bolt, 'z', -0.035, 0.3))
    }
    if (!await reloading) return
    ctx.player.play(stanceClip(stance))
  })
}

/** ctx.weapons.guns — equip / unequip / fire / reload, plus observable state for the lab. */
function api(c: Ctx) {
  ctx = c
  return (c.weapons.guns ??= {
    names: Object.keys(builders) as GunName[],
    equip, unequip, fire, reload, toggleAuto,
    aim: () => gun && setStance('aim'), hip: () => gun && setStance('hip'), lower: () => gun && setStance('down'),
    get current() { return gun },
    get stance() { return stance },
    get automatic() { return auto },
    get busy() { return busy !== null },
    get canAuto() { return !!gun && !!RPM[gun.userData.name] },
    pose: (p: Pose) => { cancel(); ctx.player.play(still('gun_dev', p)) },
  })
}

const label: Record<GunName, string> = { pistol: 'Pistol', revolver: 'Revolver', smg: 'SMG', ak: 'AK-47', shotgun: 'Shotgun', sniper: 'Sniper' }
export const actions: Action[] = [
  ...(Object.keys(builders) as GunName[]).map<Action>(name => ({ group: 'Weapons', label: `Equip: ${label[name]}`, run: c => api(c).equip(name) })),
  { group: 'Weapons', label: 'Holster', run: c => api(c).unequip() },
  { group: 'Shooting', label: 'Aim', hotkey: 'a', run: c => api(c).aim() },
  { group: 'Shooting', label: 'Fire', hotkey: 'f', run: c => { api(c).fire() } },
  { group: 'Shooting', label: 'Auto fire (SMG / AK)', run: c => api(c).toggleAuto() },
  { group: 'Shooting', label: 'Hip fire', run: c => api(c).hip() },
  { group: 'Shooting', label: 'Reload', hotkey: 'l', run: c => api(c).reload() },
  { group: 'Shooting', label: 'Lower gun', run: c => api(c).lower() },
]

const supported = new Set([
  clips.gun_aim2, clips.gun_fire2, clips.gun_auto2, clips.gun_hip, clips.gun_fireHip,
  clips.gun_autoHip, clips.gun_lowReady, clips.gun_pump,
])
const supportBones = ['upper_arm.L', 'forearm.L', 'hand.L'] as const
const triggerBones = ['upper_arm.R', 'forearm.R', 'hand.R'] as const
function holdSupport(op: Operation) {
  if (!op.supportPose) return
  ctx.player.adjustBones(supportBones.map(name => ctx.rig.bones[name]), () =>
    supportBones.forEach((name, i) => ctx.rig.bones[name].quaternion.copy(op.supportPose![i])))
}
function alignSupport() {
  if (!gun || !supported.has(ctx.player.current?.getClip() as THREE.AnimationClip)) return
  const anchor = gun.userData.support?.clone()
  if (anchor && gun.userData.parts.pump) anchor.z += gun.userData.parts.pump.position.z - 0.26
  ctx.player.adjustBones(supportBones.map(name => ctx.rig.bones[name]), () => supportHand(ctx.rig, gun!, anchor))
}

function contact(part: THREE.Object3D | undefined, side: 'L' | 'R', weight: number) {
  const grip = part?.userData.grip as THREE.Vector3 | undefined
  if (!part || !grip || weight <= 0) return
  part.updateWorldMatrix(true, false)
  const target = part.localToWorld(grip.clone())
  ctx.player.adjustBones((side === 'L' ? supportBones : triggerBones).map(name => ctx.rig.bones[name]),
    () => placeHand(ctx.rig, side, target, weight))
}
function alignMechanisms() {
  if (!busy || !gun) return
  const t = ctx.player.current?.time ?? 0
  const reach = (start: number, hold: number, release: number, end: number) =>
    THREE.MathUtils.smoothstep(t, start, hold) * (1 - THREE.MathUtils.smoothstep(t, release, end))
  const parts = gun.userData.parts
  if (busy.clip === clips.gun_bolt) {
    contact(parts.bolt, 'R', reach(0.12, 0.25, 0.7, 0.98))
  } else if (busy.clip?.name.startsWith('gun_reload_')) {
    if (gun.userData.name === 'revolver') {
      contact(parts.cylinder, 'L', Math.max(reach(0.15, 0.35, 0.8, 1), reach(1.2, 1.45, 1.95, 2.15)))
    } else if (gun.userData.name === 'shotgun') {
      contact(parts.loadingPort, 'L', Math.max(...[0, 0.5, 1].map(offset => reach(0.45 + offset, 0.65 + offset, 0.72 + offset, 0.88 + offset))))
    } else {
      const small = gun.userData.cls === 'pistol'
      contact(parts.magazine, 'L', small ? reach(0.15, 0.35, 1, 1.2) : reach(0.2, 0.4, 1.2, 1.4))
      if (gun.userData.name === 'pistol') contact(parts.slide, 'L', reach(1.15, 1.35, 1.65, 1.85))
      if (RPM[gun.userData.name]) contact(parts.bolt, 'L', reach(1.3, 1.55, 1.8, small ? 1.9 : 2.1))
    }
  }
}

export function update(dt: number, c: Ctx) {
  api(c)
  if (!fx.parent) c.scene.add(fx)
  const delta = dt * c.player.mixer.timeScale
  time += delta
  // Invalidate before delayed effects if another animation took the rig.
  if (busy?.clip && c.player.current?.getClip() !== busy.clip) cancel()
  // Keep the solved support grip when the bolt clip writes its original arm keys.
  if (busy) holdSupport(busy)
  if (auto && c.player.current?.getClip() !== autoClip) { auto = false; resetMechanisms() }
  for (let i = timers.length - 1; i >= 0; i--) {
    if (time < timers[i].at) continue
    const timer = timers.splice(i, 1)[0]
    if (active(timer.op)) timer.fn()
  }
  if (auto && gun && !busy && delta > 0 && time >= nextShot) {
    const period = 60 / RPM[gun.userData.name]!
    // Skip missed intervals instead of accumulating a burst after a stall.
    bang(gun)
    nextShot += (Math.floor((time - nextShot) / period) + 1) * period
  }
  for (let i = fades.length - 1; i >= 0; i--) {
    const f = fades[i], u = (time - f.t0) / f.dur
    if (u >= 1) {
      f.obj.removeFromParent()
      if (f.obj instanceof THREE.Line) f.obj.geometry.dispose()
      ;(f.obj.material as THREE.Material).dispose()
      fades.splice(i, 1)
    } else (f.obj.material as THREE.Material).opacity = 1 - u
  }
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i]
    if (time - s.t0 > 2) { s.obj.removeFromParent(); shells.splice(i, 1); continue }
    s.vel.y -= 9.8 * delta
    s.obj.position.addScaledVector(s.vel, delta)
    s.obj.rotation.x += s.spin.x * delta; s.obj.rotation.z += s.spin.z * delta
    if (s.obj.position.y < 0.01 && s.vel.y < 0) {
      s.obj.position.y = 0.01; s.vel.y *= -0.35; s.vel.x *= 0.6; s.vel.z *= 0.6; s.spin.multiplyScalar(0.5)
    }
  }
  for (let i = motions.length - 1; i >= 0; i--) {
    const m = motions[i], u = Math.min(1, (time - m.t0) / m.dur)
    const weight = m.shape === 'step' ? u * u * (3 - 2 * u)
      : m.shape === 'hold' ? Math.min(1, u / 0.25, (1 - u) / 0.25)
      : Math.sin(u * Math.PI)
    m.obj[m.property][m.axis] = m.base + m.amp * weight
    if (u >= 1) motions.splice(i, 1)
  }
  alignSupport()
  alignMechanisms()
}
