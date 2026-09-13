import * as THREE from 'three'
import { makeClip, type BoneVal, type Key, type Pose } from '../clip'
import { hang } from '../clips/idle'
import type { Action, Ctx } from '../registry'
import { builders, type Gun, type GunClass, type GunName } from './models'

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
  'upper_arm.R': [-73, 14, 50], 'forearm.R': [0, 14, 69], 'hand.R': [14, 0, 11],
  'upper_arm.L': [-81, -58, -6], 'forearm.L': [0, -3, -15], 'hand.L': [0, 0, -45],
  'thigh.L': [-8, 0, 0], 'thigh.R': [6, 0, -6], 'shin.L': [8, 0, 0],
}
const recoilHip: Pose = { 'upper_arm.R': [-70, 14, 50], 'upper_arm.L': [-78, -58, -6], chest: [0, -6, 0] }
// Low ready: rifle held diagonally across the body, muzzle down-left.
const lowReady: Pose = {
  chest: [2, -8, 0], head: [0, 8, 0],
  'upper_arm.R': [-86, 12, 20], 'forearm.R': [0, -19, 46], 'hand.R': [-9, 0, 23],
  'upper_arm.L': [-91, -37, 0], 'forearm.L': [0, -42, -23], 'hand.L': [-45, 0, -45],
}

// Reloads: the gun stays in hand.R; the left hand does the work. Left-arm keys were solved against gun-local
// points (mag well, slide, charging handle...) so they land on the model.
type Arm = [BoneVal, BoneVal, BoneVal]   // upper_arm, forearm, hand
const armL = (base: Pose, [u, f, h]: Arm): Pose => ({ ...base, 'upper_arm.L': u, 'forearm.L': f, 'hand.L': h })
const chestHold: Pose = { ...hang, chest: [6, 0, 0], head: [22, -6, 0], 'upper_arm.R': [-43, 47, 51], 'forearm.R': [0, 38, 70], 'hand.R': [17, 0, 12] }
const reloadPistol: Key[] = [
  { t: 0, pose: chestHold },
  { t: 0.35, pose: armL(chestHold, [[-95, -61, -12], [0, -9, -37], [-33, 0, -45]]) },  // hand.L on the mag
  { t: 0.6, pose: armL(chestHold, [[-100, -55, 0], [0, -21, -5], [-45, 0, -45]]) },    // mag out (pull down)
  { t: 1.0, pose: armL(chestHold, [[-95, -61, -12], [0, -9, -37], [-33, 0, -45]]) },   // new mag in
  { t: 1.35, pose: armL(chestHold, [[-97, -64, -24], [0, 17, -80], [-45, 0, 36]]) },   // hand.L over the slide
  { t: 1.55, pose: armL(chestHold, [[-97, -52, -30], [0, 11, -94], [-42, 0, 44]]) },   // rack back
  { t: 1.9, pose: chestHold },
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
const shot = (name: string, base: Pose, kick: Pose, dur: number, loop = false) =>
  makeClip(name, [{ t: 0, pose: base }, { t: 0.04, pose: { ...base, ...kick }, ease: 'linear' }, { t: dur, pose: base }], { loop, duration: dur })

export const clips = {
  gun_aim1: still('gun_aim1', aim1), gun_fire1: shot('gun_fire1', aim1, recoil1, 0.16), gun_auto1: shot('gun_auto1', aim1, recoil1, 0.08, true),
  gun_aim2: still('gun_aim2', aim2), gun_fire2: shot('gun_fire2', aim2, recoil2, 0.2), gun_auto2: shot('gun_auto2', aim2, recoil2, 0.1, true),
  gun_hip: still('gun_hip', hip2), gun_fireHip: shot('gun_fireHip', hip2, recoilHip, 0.2), gun_autoHip: shot('gun_autoHip', hip2, recoilHip, 0.1, true),
  gun_lowReady: still('gun_lowReady', lowReady),
  gun_pump: makeClip('gun_pump', pump), gun_bolt: makeClip('gun_bolt', bolt),
  gun_reload_pistol: makeClip('gun_reload_pistol', reloadPistol), gun_reload_ak: makeClip('gun_reload_ak', reloadAk),
  gun_reload_shotgun: makeClip('gun_reload_shotgun', reloadShotgun), gun_reload_sniper: makeClip('gun_reload_sniper', reloadSniper),
}

// ---------------------------------------------------------------- state
type Stance = 'down' | 'aim' | 'hip'
let ctx: Ctx
let gun: Gun | null = null
let stance: Stance = 'down'
let auto = false
let nextShot = 0
let busy: Promise<void> | null = null   // fire/pump/bolt/reload in progress
const RPM: Partial<Record<GunName, number>> = { smg: 900, ak: 600 }
const SHELL: Record<GunClass, 'shot' | 'cycle' | 'none'> = { pistol: 'shot', ak: 'shot', shotgun: 'cycle', sniper: 'cycle' }

const fx = new THREE.Group()
type Fade = { obj: THREE.Object3D; t0: number; dur: number; opacity?: THREE.Material }
const fades: Fade[] = []
type Shell = { obj: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; t0: number }
const shells: Shell[] = []
type Kick = { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; base: number; amp: number; t0: number; dur: number }
const kicks: Kick[] = []
const timers: { at: number; fn: () => void }[] = []
const shellGeom = new THREE.CylinderGeometry(0.005, 0.005, 0.02, 8)
const shellMat = new THREE.MeshBasicMaterial({ color: 0xd9b23c })
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
  if (s === 'hip') return clips.gun_hip
  return gun?.userData.twoHanded ? clips.gun_aim2 : clips.gun_aim1
}
function setStance(s: Stance) { stance = s; auto = false; ctx.player.play(stanceClip(s)) }
function remount() { gun && (ctx.rig.bones['hand.R'].add(gun), gun.position.copy(MOUNT_POS), gun.quaternion.copy(MOUNT_Q)) }

/** Muzzle origin + barrel direction in world space. */
function muzzle() {
  const g = gun!
  g.updateWorldMatrix(true, false)
  const origin = g.localToWorld(g.userData.muzzle.clone())
  const direction = g.localToWorld(g.userData.muzzle.clone().add(new THREE.Vector3(0, 0, 1))).sub(origin).normalize()
  return { origin, direction }
}

/** Spawn one shot's effects (no animation). Returns the shot ray. */
function bang() {
  const ray = muzzle()
  const g = gun!
  const size = g.userData.twoHanded ? 0.16 : 0.09
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false }))
  flash.scale.setScalar(size); flash.position.copy(ray.origin).addScaledVector(ray.direction, size * 0.3)
  fx.add(flash); fades.push({ obj: flash, t0: ctx.time, dur: 0.035 })
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true })
  const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([ray.origin, ray.origin.clone().addScaledVector(ray.direction, 8)]), tracerMat)
  fx.add(tracer); fades.push({ obj: tracer, t0: ctx.time, dur: 0.08, opacity: tracerMat })
  if (SHELL[g.userData.cls] === 'shot') eject()
  if (g.userData.parts.slide) kick(g.userData.parts.slide, 'z', -0.025, 0.07)
  return ray
}
function eject() {
  const g = gun!
  if (g.userData.name === 'revolver') return
  const obj = new THREE.Mesh(shellGeom, shellMat)
  obj.position.copy(g.localToWorld(g.userData.eject.clone()))
  const right = g.localToWorld(g.userData.eject.clone().add(new THREE.Vector3(1, 0, 0))).sub(obj.position).normalize()
  const vel = right.multiplyScalar(1.6 + Math.random() * 0.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4))
  obj.quaternion.copy(g.getWorldQuaternion(new THREE.Quaternion()))
  fx.add(obj)
  shells.push({ obj, vel, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(30), t0: ctx.time })
}
/** Move `obj[axis]` by `amp` and back over `dur` seconds (slide, pump, bolt). */
function kick(obj: THREE.Object3D, axis: 'x' | 'y' | 'z', amp: number, dur: number) {
  kicks.push({ obj, axis, base: obj.position[axis], amp, t0: ctx.time, dur })
}

// ---------------------------------------------------------------- actions
async function run(job: () => Promise<void>) {
  if (busy) return
  busy = job().finally(() => { busy = null })
  await busy
}

/** One shot: recoil clip + fx, then the per-class cycle (pump / bolt). Returns the shot ray (null if unarmed or mid-cycle/reload). */
function fire() {
  if (!gun || busy) return null
  if (stance === 'down') stance = 'aim'
  const two = gun.userData.twoHanded
  const clip = stance === 'hip' ? clips.gun_fireHip : two ? clips.gun_fire2 : clips.gun_fire1
  const ray = bang()
  // play() resolves false when something else (a death, a flinch) took over: don't fight it for the rig
  void run(async () => {
    if (!await ctx.player.play(clip, { once: true, fade: 0.03 })) return
    if (stance === 'aim' && gun?.userData.cls === 'shotgun') {
      kick(gun.userData.parts.pump, 'z', -0.07, 0.4)
      const p = ctx.player.play(clips.gun_pump, { once: true, fade: 0.05 })
      later(0.18, eject)
      if (!await p) return
    } else if (stance === 'aim' && gun?.userData.cls === 'sniper') {
      ctx.rig.bones['hand.L'].attach(gun)
      kick(gun.userData.parts.bolt, 'z', -0.04, 0.5)
      const p = ctx.player.play(clips.gun_bolt, { once: true, fade: 0.05 })
      later(0.35, eject)
      const done = await p
      remount()
      if (!done) return
    }
    ctx.player.play(stanceClip(stance), { fade: 0.08 })
  })
  return ray
}

function equip(name: GunName) {
  unequip()
  gun = builders[name]()
  remount()
  setStance('down')
}
function unequip() {
  if (!gun) return
  gun.removeFromParent(); gun = null; stance = 'down'; auto = false
  ctx.player.play(ctx.clips.idle ?? clips.gun_lowReady)
}
function toggleAuto() {
  if (!gun) return
  auto = !auto
  if (!auto) return ctx.player.play(stanceClip(stance))
  if (stance === 'down') stance = 'aim'
  nextShot = ctx.time
  const two = gun.userData.twoHanded
  autoClip = stance === 'hip' ? clips.gun_autoHip : two ? clips.gun_auto2 : clips.gun_auto1
  ctx.player.play(autoClip, { fade: 0.05 })
}
function reload() {
  if (!gun) return
  auto = false
  const cls = gun.userData.cls
  void run(async () => {
    if (cls === 'sniper') {
      ctx.rig.bones['hand.L'].attach(gun!); kick(gun!.userData.parts.bolt, 'z', -0.04, 0.5)
      const done = await ctx.player.play(clips.gun_bolt, { once: true }); remount()
      if (!done) return
    }
    if (!await ctx.player.play(clips[`gun_reload_${cls}`], { once: true })) return
    if (gun?.userData.parts.slide) kick(gun.userData.parts.slide, 'z', -0.025, 0.2)
    ctx.player.play(stanceClip(stance))
  })
}

/** ctx.weapons.guns — equip(name) / unequip() / current / fire() → { origin, direction } in world space. */
function api(c: Ctx) {
  ctx = c
  return (c.weapons.guns ??= {
    names: Object.keys(builders) as GunName[],
    equip, unequip, fire, reload, toggleAuto,
    aim: () => gun && setStance('aim'), hip: () => gun && setStance('hip'), lower: () => gun && setStance('down'),
    get current() { return gun },
    get stance() { return stance },
    /** dev helper: hold an arbitrary pose */
    pose: (p: Pose) => ctx.player.play(still('gun_dev', p)),
  })
}

const label: Record<GunName, string> = { pistol: 'Pistol', revolver: 'Revolver', smg: 'SMG', ak: 'AK-47', shotgun: 'Shotgun', sniper: 'Sniper' }
export const actions: Action[] = [
  ...(Object.keys(builders) as GunName[]).map<Action>(name => ({ group: 'Weapons', label: `Equip: ${label[name]}`, run: c => api(c).equip(name) })),
  { group: 'Weapons', label: 'Holster', run: c => api(c).unequip() },
  { group: 'Shooting', label: 'Aim', hotkey: 'a', run: c => api(c).aim() },
  { group: 'Shooting', label: 'Fire', hotkey: 'f', run: c => { api(c).fire() } },
  { group: 'Shooting', label: 'Auto fire (hold)', run: c => api(c).toggleAuto() },
  { group: 'Shooting', label: 'Hip fire', run: c => api(c).hip() },
  { group: 'Shooting', label: 'Reload', hotkey: 'l', run: c => api(c).reload() },
  { group: 'Shooting', label: 'Lower gun', run: c => api(c).lower() },
]

export function update(dt: number, c: Ctx) {
  api(c)
  if (!fx.parent) c.scene.add(fx)
  const t = c.time
  for (let i = timers.length - 1; i >= 0; i--) if (t >= timers[i].at) timers.splice(i, 1)[0].fn()
  if (auto && c.player.current?.getClip() !== autoClip) auto = false   // something else took the rig: stop shooting
  if (auto && gun && !busy) {
    const period = 60 / (RPM[gun.userData.name] ?? 400)
    while (t >= nextShot) { bang(); nextShot += period }
  }
  for (let i = fades.length - 1; i >= 0; i--) {
    const f = fades[i], u = (t - f.t0) / f.dur
    if (u >= 1) { f.obj.removeFromParent(); fades.splice(i, 1); continue }
    if (f.opacity) f.opacity.opacity = 1 - u
  }
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i]
    if (t - s.t0 > 2) { s.obj.removeFromParent(); shells.splice(i, 1); continue }
    s.vel.y -= 9.8 * dt
    s.obj.position.addScaledVector(s.vel, dt)
    s.obj.rotation.x += s.spin.x * dt; s.obj.rotation.z += s.spin.z * dt
    if (s.obj.position.y < 0.01 && s.vel.y < 0) { s.obj.position.y = 0.01; s.vel.y *= -0.35; s.vel.x *= 0.6; s.vel.z *= 0.6; s.spin.multiplyScalar(0.5) }
  }
  for (let i = kicks.length - 1; i >= 0; i--) {
    const k = kicks[i], u = Math.min(1, (t - k.t0) / k.dur)
    k.obj.position[k.axis] = k.base + k.amp * Math.sin(u * Math.PI)
    if (u >= 1) kicks.splice(i, 1)
  }
}
const later = (delay: number, fn: () => void) => timers.push({ at: ctx.time + delay, fn })
let autoClip: THREE.AnimationClip | null = null
