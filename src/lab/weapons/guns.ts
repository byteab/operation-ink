import * as THREE from 'three'
import { applyPenMaterial, penPalette } from '../../render/ballpoint'
import { makeClip, type Key, type Pose } from '../clip'
import { hang } from '../clips/idle'
import { enterPosture, postureClips, weaponPosture, type Posture } from '../postures'
import type { Action, Ctx } from '../registry'
import { builders, disposeGun, type Gun, type GunClass, type GunName } from './models'
import { placeHand, supportHand } from './support'
import { dropGun, clearDroppedGuns } from './dropped'
import { heldPose, mountPosition, mountQuaternion, armBones, type Hold } from './poses'

// The grip is mounted at the rendered fist centre; authored holds below solve the actual rig lengths.
const MOUNT_Q = mountQuaternion
const MOUNT_POS = mountPosition
const standing: Pose = { ...hang, hips: [0, -32, 0], spine: [2, -4, 0], chest: [4, -4, 0], head: [0, 34, 0],
  'thigh.L': [-8, 0, 0], 'thigh.R': [6, 0, -6], 'shin.L': [8, 0, 0] }
const support: [number, number, number] = [0, -0.005, 0.26]
const shoulderHold: Hold = { position: [-0.185, 1.22, 0.27] }
const waistHold: Hold = { position: [-0.12, 1.02, 0.22], yaw: 35 }
const readyHold: Hold = { position: [-0.19, 1.03, 0.22], pitch: 24, yaw: 8 }
// Small guns follow the forearm: a soft extended aim, relaxed thigh-level carry,
// and a bent elbow at the hip. Pulling the lowered fist up to the belt hooks the wrist.
const handgunHold: Hold = { position: [-0.13, 1.22, 0.55] }
const handgunDown: Hold = { position: [-0.20, 0.695, 0.10], pitch: 65, yaw: 5, elbow: [-0.4, 0, -1] }
const lower1 = heldPose(hang, handgunDown)
const handgunHip: Hold = { position: [-0.18, 0.93, 0.32], elbow: [-0.4, -1, -0.3] }
const reloadHold: Hold = { position: [-0.06, 1.075, 0.31], pitch: 12, yaw: -12 }
const aim1 = heldPose({ ...hang, chest: [2, -8, 0], head: [0, 8, 0] }, handgunHold)
const aim2 = heldPose(standing, shoulderHold, support)
const hip2 = heldPose({ ...standing, chest: [10, -4, 0], head: [3, 65, 0] }, waistHold, support)
const hip1 = heldPose({ ...hang, chest: [3, -8, 0], head: [0, 8, 0] }, handgunHip)
const lowReady = heldPose(standing, readyHold, support)
const chestHold = heldPose({ ...hang, chest: [4, 0, 0], head: [12, -5, 0] }, reloadHold, undefined, [0.14, 0.85, 0.20])
const kickHold = (hold: Hold, distance: number, pitch: number): Hold => ({ ...hold,
  position: [hold.position[0], hold.position[1] + 0.008, hold.position[2] - distance], pitch: (hold.pitch ?? 0) - pitch })
const recoil1 = heldPose({ ...hang, chest: [0, -8, 0], head: [-1, 8, 0] }, kickHold(handgunHold, 0.018, 7))
const recoil2 = heldPose({ ...standing, chest: [2, -4, 0] }, kickHold(shoulderHold, 0.012, 2.5), support)
const recoilHip = heldPose({ ...standing, chest: [8, -4, 0], head: [3, 65, 0] }, kickHold(waistHold, 0.015, 3), support)
const recoilHip1 = heldPose({ ...hang, chest: [1, -8, 0] }, kickHold(handgunHip, 0.018, 6))

// Reload left-hand routes stay in front of the torso. Contact IK supplies the weapon-specific
// mechanism position and orientation during the hold windows, including moving magazines.
const reloadSmall = (left: [number, number, number]) => heldPose(chestHold, reloadHold, undefined, left)
const reloadLong = (left: [number, number, number]) => heldPose(standing, readyHold, undefined, left)
const smallMag = reloadSmall([0.01, 0.97, 0.31]), smallOut = reloadSmall([0.02, 0.81, 0.31])
const smallTop = reloadSmall([0.00, 1.20, 0.29])
const longMag = reloadLong([-0.08, 0.93, 0.30]), longOut = reloadLong([-0.06, 0.80, 0.33])
const longBolt = reloadLong([-0.04, 1.08, 0.32])
const belt = reloadLong([0.16, 0.79, 0.17])
const reloadPistol: Key[] = [
  { t: 0, pose: chestHold }, { t: 0.35, pose: smallMag }, { t: 0.6, pose: smallOut },
  { t: 1, pose: smallMag }, { t: 1.35, pose: smallTop }, { t: 1.55, pose: smallTop }, { t: 1.9, pose: chestHold },
]
const reloadRevolver: Key[] = [
  { t: 0, pose: chestHold }, { t: 0.35, pose: smallTop }, { t: 0.7, pose: smallTop },
  { t: 1.1, pose: reloadSmall([0.17, 0.79, 0.17]) }, { t: 1.5, pose: smallTop }, { t: 1.9, pose: smallTop }, { t: 2.2, pose: chestHold },
]
const reloadAk: Key[] = [
  { t: 0, pose: lowReady }, { t: 0.4, pose: longMag }, { t: 0.7, pose: longOut },
  { t: 1.2, pose: longMag }, { t: 1.6, pose: longBolt }, { t: 1.8, pose: longBolt }, { t: 2.3, pose: lowReady },
]
const reloadShotgun: Key[] = [
  { t: 0, pose: lowReady }, ...[0, 1, 2].flatMap(i => [
    { t: 0.4 + i * 0.5, pose: belt }, { t: 0.7 + i * 0.5, pose: longMag },
  ]), { t: 2.3, pose: lowReady },
]
const reloadSniper: Key[] = [
  { t: 0, pose: lowReady }, { t: 0.4, pose: longMag }, { t: 0.7, pose: longOut },
  { t: 1.2, pose: longMag }, { t: 1.6, pose: lowReady },
]
const pump: Key[] = [{ t: 0, pose: aim2 }, { t: 0.2, pose: aim2 }, { t: 0.45, pose: aim2 }]
function boltKeys(base: Pose, body: Pose, hold: Hold): Key[] {
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, THREE.MathUtils.degToRad(hold.yaw ?? 0), 0))
  const point = new THREE.Vector3(-0.14, -0.07, 0.02).applyQuaternion(rotation).add(new THREE.Vector3(...hold.position))
  const free = heldPose(body, { ...hold, pitch: 35, elbow: [0, -1, 0], position: point.toArray() as [number, number, number] })
  const outside: Pose = { ...base, 'upper_arm.R': free['upper_arm.R'], 'forearm.R': free['forearm.R'], 'hand.R': free['hand.R'] }
  return [{ t: 0, pose: base }, { t: 0.12, pose: outside }, { t: 0.85, pose: outside }, { t: 1, pose: base }]
}
const bolt = boltKeys(aim2, standing, shoulderHold)
const still = (name: string, pose: Pose) => makeClip(name, [{ t: 0, pose }], { loop: true, duration: 1 })
const shot = (name: string, base: Pose, kick: Pose, dur: number, loop = false) =>
  makeClip(name, [{ t: 0, pose: base }, { t: 0.04, pose: kick, ease: 'linear' }, { t: dur, pose: base }], { loop, duration: dur })
export const clips = {
  posture_stand: postureClips.stand, posture_crouch: postureClips.crouch,
  posture_kneel: postureClips.kneel, posture_prone: postureClips.prone,
  gun_aim1: still('gun_aim1', aim1), gun_fire1: shot('gun_fire1', aim1, recoil1, 0.16), gun_auto1: shot('gun_auto1', aim1, recoil1, 0.08, true),
  gun_aim2: still('gun_aim2', aim2), gun_fire2: shot('gun_fire2', aim2, recoil2, 0.2), gun_auto2: shot('gun_auto2', aim2, recoil2, 0.1, true),
  gun_hip: still('gun_hip', hip2), gun_fireHip: shot('gun_fireHip', hip2, recoilHip, 0.2), gun_autoHip: shot('gun_autoHip', hip2, recoilHip, 0.1, true),
  gun_hip1: still('gun_hip1', hip1), gun_fireHip1: shot('gun_fireHip1', hip1, recoilHip1, 0.18),
  gun_autoHip1: shot('gun_autoHip1', hip1, recoilHip1, 60 / 900, true),
  gun_lower1: still('gun_lower1', lower1),
  gun_lowReady: still('gun_lowReady', lowReady), gun_pump: makeClip('gun_pump', pump), gun_bolt: makeClip('gun_bolt', bolt),
  gun_reload_pistol: makeClip('gun_reload_pistol', reloadPistol), gun_reload_ak: makeClip('gun_reload_ak', reloadAk),
  gun_reload_revolver: makeClip('gun_reload_revolver', reloadRevolver),
  gun_reload_shotgun: makeClip('gun_reload_shotgun', reloadShotgun), gun_reload_sniper: makeClip('gun_reload_sniper', reloadSniper),
}

const raise1 = makeClip('gun_raise1', [{ t: 0, pose: aim1 }, { t: 0.35, pose: aim1 }])
const raise2 = makeClip('gun_raise2', [{ t: 0, pose: aim2 }, { t: 0.35, pose: aim2 }])
const raiseHip1 = makeClip('gun_raiseHip1', [{ t: 0, pose: hip1 }, { t: 0.35, pose: hip1 }])
const raiseHip2 = makeClip('gun_raiseHip2', [{ t: 0, pose: hip2 }, { t: 0.35, pose: hip2 }])
const pumpHip = makeClip('gun_pump', pump.map(key => ({ ...key, pose: hip2 })))
const boltHip = makeClip('gun_bolt', boltKeys(hip2, { ...standing, chest: [10, -4, 0], head: [3, 65, 0] }, waistHold))

// ---------------------------------------------------------------- state
type Stance = 'down' | 'aim' | 'hip'
type Operation = { gun: Gun; clip: THREE.AnimationClip | null; supportPose?: THREE.Quaternion[];
  raising?: { position: THREE.Vector3; rotation: THREE.Quaternion; hold: Hold };
  cycleHold?: { position: THREE.Vector3; rotation: THREE.Quaternion } }
let ctx: Ctx
let gun: Gun | null = null
let stance: Stance = 'down'
let bodyPosture: Posture = 'stand'
let postureEntering: THREE.AnimationClip | null = null
let pendingPostureAction: 'fire' | 'auto' | 'reload' | null = null
const postureCache = new Map<THREE.AnimationClip, Map<Posture, THREE.AnimationClip>>()
const posedClips = new WeakSet<THREE.AnimationClip>()
function inPosture(clip: THREE.AnimationClip) {
  if (bodyPosture === 'stand' || posedClips.has(clip)) return clip
  let variants = postureCache.get(clip)
  if (!variants) { variants = new Map(); postureCache.set(clip, variants) }
  let result = variants.get(bodyPosture)
  if (!result) {
    result = weaponPosture(clip, postureClips[bodyPosture], clip.duration, gun?.userData.twoHanded)
    result.name = `${clip.name}_${bodyPosture}`
    variants.set(bodyPosture, result); posedClips.add(result)
    if (supported.has(clip)) supported.add(result)
    ctx.clips[`${clip.name}_${bodyPosture}`] = result
  }
  return result
}
let auto = false
let nextShot = 0
let busy: Operation | null = null
let autoClip: THREE.AnimationClip | null = null
type Handoff = { position: THREE.Vector3; rotation: THREE.Quaternion; pole: THREE.Vector3; duration: number }
type HoldTransition = { clip: THREE.AnimationClip; position: THREE.Vector3; rotation: THREE.Quaternion; hold: Hold; duration: number; elapsed: number; handoff?: Handoff }
let poseTransition: HoldTransition | null = null
let pendingAction: 'fire' | 'reload' | null = null
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
const shellMat = applyPenMaterial(new THREE.MeshBasicMaterial({ color: penPalette.ink, toneMapped: false }), { density: 0.48, scale: 200, seed: 911 })
const shotgunShellGeom = new THREE.CylinderGeometry(0.007, 0.007, 0.028, 10)
const shotgunShellMat = applyPenMaterial(new THREE.MeshBasicMaterial({ color: penPalette.dark, toneMapped: false }), { density: 0.72, scale: 180, seed: 919 })
const flashTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')!
  g.strokeStyle = `#${penPalette.ink.toString(16).padStart(6, '0')}`
  g.lineCap = 'round'
  // A fixed uneven burst of pen marks replaces the soft orange flash glow.
  for (let pass = 0; pass < 2; pass++) for (let ray = 0; ray < 9; ray++) {
    const angle = ray * Math.PI * 2 / 9 + Math.sin(ray * 7) * 0.13 + pass * 0.045
    const length = 19 + Math.sin(ray * 13) * 8
    g.globalAlpha = pass ? 0.45 : 0.95; g.lineWidth = pass ? 1 : 2
    g.beginPath()
    g.moveTo(32 + Math.cos(angle) * 5, 32 + Math.sin(angle) * 5)
    g.lineTo(32 + Math.cos(angle) * 13 + pass, 32 + Math.sin(angle) * 13 - pass)
    g.lineTo(32 + Math.cos(angle) * length, 32 + Math.sin(angle) * length)
    g.stroke()
  }
  g.globalAlpha = 0.9; g.lineWidth = 1.5
  for (let line = 0; line < 7; line++) {
    g.beginPath(); g.moveTo(24 + line, 29 + line); g.lineTo(35 + line, 23 + line); g.stroke()
  }
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()

function restClip() { return inPosture(bodyPosture === 'prone' ? (gun?.userData.twoHanded ? clips.gun_aim2 : clips.gun_aim1) : gun?.userData.twoHanded ? clips.gun_lowReady : clips.gun_lower1) }
function stanceClip(s: Stance) {
  if (s === 'down') return restClip()
  if (s === 'hip' && bodyPosture !== 'prone') return inPosture(gun?.userData.twoHanded ? clips.gun_hip : clips.gun_hip1)
  return inPosture(gun?.userData.twoHanded ? clips.gun_aim2 : clips.gun_aim1)
}
function raiseClip() { return stance === 'hip' && bodyPosture !== 'prone' ? (gun?.userData.twoHanded ? raiseHip2 : raiseHip1) : gun?.userData.twoHanded ? raise2 : raise1 }
function remount(g = gun) {
  if (!g) return
  ctx.rig.bones['hand.R'].add(g)
  g.position.copy(MOUNT_POS); g.quaternion.copy(MOUNT_Q)
}
function resetMechanisms() {
  for (const m of motions) m.obj[m.property][m.axis] = m.base
  motions.length = 0
}
function cancel(restoreMount = true) {
  postureEntering = null; pendingPostureAction = null
  busy = null; auto = false; autoClip = null; poseTransition = null; pendingAction = null
  timers.length = 0
  resetMechanisms()
  if (restoreMount) remount()
}
function holdForStance(s: Stance): Hold {
  const two = gun?.userData.twoHanded
  return s === 'down' ? (two ? readyHold : handgunDown) : s === 'hip' ? (two ? waistHold : handgunHip) : two ? shoulderHold : handgunHold
}
function transitionTo(clip: THREE.AnimationClip, hold: Hold, duration = 0.35, from?: { position: THREE.Vector3; rotation: THREE.Quaternion }) {
  if (!gun) return
  poseTransition = { clip, hold, duration, elapsed: 0,
    position: from?.position ?? gun.getWorldPosition(new THREE.Vector3()), rotation: from?.rotation ?? gun.getWorldQuaternion(new THREE.Quaternion()) }
}
function setStance(s: Stance, fade = ctx.player.fade) {
  // Two-handed holds need a grip-space arc even between weapon stances: blending
  // elbow rotations alone sweeps the stock through the shortened upper arm.
  const needsTransition = !!gun?.userData.twoHanded || !!busy || !!poseTransition || !ctx.player.current?.getClip().name.startsWith('gun_')
  // A relaxed thigh-level carry has a longer arc back to aim than a belt-level fist.
  if (gun && !gun.userData.twoHanded && fade > 0) fade = Math.max(fade, 0.28)
  const from = gun && { position: gun.getWorldPosition(new THREE.Vector3()), rotation: gun.getWorldQuaternion(new THREE.Quaternion()) }
  const handoff = gun?.parent === ctx.rig.bones['hand.L'] && fade > 0 && bodyPosture === 'stand' ? {
    position: ctx.rig.bones['hand.R'].localToWorld(MOUNT_POS.clone()),
    rotation: ctx.rig.bones['hand.R'].getWorldQuaternion(new THREE.Quaternion()),
    pole: ctx.rig.bones['forearm.R'].getWorldPosition(new THREE.Vector3()).sub(ctx.rig.bones['upper_arm.R'].getWorldPosition(new THREE.Vector3())).normalize(),
    duration: 0.2,
  } : undefined
  cancel(!handoff); stance = s
  const clip = stanceClip(s)
  if (needsTransition && fade > 0 && bodyPosture === 'stand') {
    fade = Math.max(fade, 0.35); transitionTo(clip, holdForStance(s), fade, from ?? undefined)
    if (poseTransition) poseTransition.handoff = handoff
  }
  ctx.player.play(clip, { fade })
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
  const right = new THREE.Vector3(revolver ? -0.4 : g.userData.name === 'sniper' ? -1 : 1, 0, revolver ? -1 : 0).transformDirection(g.matrixWorld)
  const vel = right.multiplyScalar(1.4 + Math.random() * 0.5).add(new THREE.Vector3(0, revolver ? -0.3 : 1.8, 0))
  obj.quaternion.copy(g.getWorldQuaternion(new THREE.Quaternion()))
  fx.add(obj)
  shells.push({ obj, vel, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(30), t0: time })
}
function bang(g: Gun) {
  const ray = muzzle(g)
  const size = g.userData.twoHanded ? 0.16 : 0.1
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, toneMapped: false }))
  flash.scale.setScalar(size); flash.position.copy(ray.origin).addScaledVector(ray.direction, size * 0.3)
  fx.add(flash); fades.push({ obj: flash, t0: time, dur: 0.04 })
  const tracer = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([ray.origin, ray.origin.clone().addScaledVector(ray.direction, 8)]),
    new THREE.LineBasicMaterial({ color: penPalette.ink, transparent: true, toneMapped: false }))
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
  clip = inPosture(clip)
  op.clip = clip
  return await ctx.player.play(clip, { once: true, fade }) && active(op)
}
async function raise(op: Operation) {
  const hold = holdForStance(stance)
  poseTransition = null
  if (bodyPosture === 'stand') op.raising = { position: op.gun.getWorldPosition(new THREE.Vector3()), rotation: op.gun.getWorldQuaternion(new THREE.Quaternion()), hold }
  const done = await play(op, raiseClip(), 0.35)
  op.raising = undefined
  return done
}
function run(job: (op: Operation) => Promise<void>) {
  if (!gun || busy) return
  const op: Operation = { gun, clip: null }
  busy = op
  void job(op).finally(() => {
    if (!active(op) || ctx.player.current?.getClip().name.startsWith('die')) return
    busy = null
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].op === op) timers.splice(i, 1)
    resetMechanisms()
    remount(op.gun)
  })
}

/** One shot and its manual cycle. Aim/hip returns a world ray; lowered/carry fire raises first and returns null. */
function fire(): ReturnType<typeof muzzle> | null {
  if (!gun || busy || auto) return null
  if (postureEntering) { pendingPostureAction = 'fire'; return null }
  if (poseTransition?.handoff && gun.parent === ctx.rig.bones['hand.L']) { pendingAction = 'fire'; return null }
  const raising = stance === 'down' || !!poseTransition || !ctx.player.current?.getClip().name.startsWith('gun_')
  if (stance === 'down') stance = 'aim'
  const g = gun, two = g.userData.twoHanded
  const clip = stance === 'hip' && bodyPosture !== 'prone' ? (two ? clips.gun_fireHip : clips.gun_fireHip1) : two ? clips.gun_fire2 : clips.gun_fire1
  let ray: ReturnType<typeof muzzle> | null = null
  run(async op => {
    if (raising && !await raise(op)) return
    // Sample the firing pose before emitting, including a shot from low-ready.
    const recoil = play(op, clip, 0)
    ctx.player.update(0)
    alignSupport()
    ray = bang(g)
    if (!await recoil) return
    if (g.userData.cls === 'shotgun') {
      // Cycle in the selected hold so a hip shot does not jerk up to the shoulder.
      const cycle = play(op, stance === 'hip' && bodyPosture !== 'prone' ? pumpHip : clips.gun_pump)
      move(g.userData.parts.pump, 'z', -0.07, clips.gun_pump.duration)
      later(op, 0.2, () => eject(g))
      if (!await cycle) return
    } else if (g.userData.cls === 'sniper') {
      // Establish the shoulder pose before handing the rifle to the support hand.
      ctx.player.play(stanceClip(stance), { fade: 0 }); ctx.player.update(0); alignSupport()
      op.supportPose = supportBones.map(name => ctx.rig.bones[name].quaternion.clone())
      if (stance === 'hip' && bodyPosture !== 'prone') op.cycleHold = { position: g.getWorldPosition(new THREE.Vector3()), rotation: g.getWorldQuaternion(new THREE.Quaternion()) }
      ctx.rig.bones['hand.L'].attach(g)
      const cycle = play(op, stance === 'hip' && bodyPosture !== 'prone' ? boltHip : clips.gun_bolt)
      holdSupport(op)
      later(op, 0.25, () => move(g.userData.parts.bolt, 'z', -0.04, 0.45))
      later(op, 0.45, () => eject(g))
      const done = await cycle
      if (!active(op) || ctx.player.current?.getClip().name.startsWith('die')) return
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
  const posture = bodyPosture
  unequip()
  bodyPosture = posture
  gun = builders[name]()
  remount()
  // There is no draw clip: spawn a new weapon already in its safe hold, so a long
  // barrel cannot sweep through the legs or floor from the unarmed idle hand.
  setStance('down', 0)
  ctx.player.update(0)
  alignSupport(1)
  previousGun = gun
  gun.getWorldPosition(previousGrip); gun.getWorldQuaternion(previousGunQ)
}
function release() {
  if (!gun) return
  cancel(false)
  dropGun(gun, ctx)
  gun = null; stance = 'down'; bodyPosture = 'stand'
}
function unequip() {
  clearDroppedGuns()
  cancel()
  if (gun) disposeGun(gun)
  gun = null; stance = 'down'; bodyPosture = 'stand'
  ctx.player.play(ctx.clips.idle ?? clips.gun_lowReady)
}
function beginAuto() {
  if (!gun) return
  auto = true; nextShot = time
  autoClip = stance === 'hip' && bodyPosture !== 'prone'
    ? (gun.userData.twoHanded ? clips.gun_autoHip : clips.gun_autoHip1)
    : gun.userData.twoHanded ? clips.gun_auto2 : clips.gun_auto1
  autoClip = inPosture(autoClip)
  ctx.player.play(autoClip, { fade: 0, speed: autoClip.duration / (60 / RPM[gun.userData.name]!) })
  ctx.player.update(0)
}
function toggleAuto() {
  if (!gun || busy || !RPM[gun.userData.name]) return
  if (postureEntering) { pendingPostureAction = 'auto'; return }
  if (auto) {
    auto = false; autoClip = null; resetMechanisms()
    ctx.player.play(stanceClip(stance))
    return
  }
  if (stance === 'down' || poseTransition || !ctx.player.current?.getClip().name.startsWith('gun_')) {
    if (stance === 'down') stance = 'aim'
    run(async op => {
      if (await raise(op)) beginAuto()
    })
  } else beginAuto()
}
function reload() {
  if (!gun || busy) return
  if (postureEntering) { pendingPostureAction = 'reload'; return }
  if (poseTransition?.handoff && gun.parent === ctx.rig.bones['hand.L']) { pendingAction = 'reload'; return }
  auto = false; autoClip = null; resetMechanisms()
  const g = gun, name = g.userData.name
  run(async op => {
    const clip = inPosture(name === 'revolver' ? clips.gun_reload_revolver : clips[`gun_reload_${g.userData.cls}`])
    const fromCarry = !!poseTransition || !ctx.player.current?.getClip().name.startsWith('gun_')
    if (fromCarry && bodyPosture === 'stand') transitionTo(clip, g.userData.twoHanded ? readyHold : reloadHold)
    const reloading = play(op, clip, fromCarry ? 0.35 : 0.2)
    if (name === 'revolver') {
      later(op, 0.3, () => move(g.userData.parts.cylinder, 'x', 0.065, 1.65, 'hold'))
      later(op, 0.8, () => {
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3
          eject(g, g.userData.eject.clone().add(new THREE.Vector3(0.065 + Math.sin(a) * 0.019, Math.cos(a) * 0.019, 0)), true)
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
    equip, unequip, release, fire, reload, toggleAuto,
    posture: setPosture, nearMiss: (reaction: 'curious' | 'prone' | 'kneel') => setPosture(reaction === 'curious' ? 'crouch' : reaction, reaction === 'curious'),
    get bodyPosture() { return bodyPosture },
    get changingPosture() { return postureEntering !== null },
    aim: () => gun && setStance('aim'), hip: () => gun && setStance('hip'), lower: () => gun && setStance('down'),
    get current() { return gun },
    get stance() { return stance },
    get automatic() { return auto },
    get busy() { return busy !== null || !!poseTransition?.handoff || pendingAction !== null },
    get readyToFire() { return !!gun && !busy && !auto && !postureEntering && !poseTransition && stance !== 'down' && !!ctx.player.current?.getClip().name.startsWith('gun_') },
    get canAuto() { return !!gun && !!RPM[gun.userData.name] },
    pose: (p: Pose) => { cancel(); ctx.player.play(still('gun_dev', p)) },
  })
}

async function setPosture(posture: Posture, scan = false) {
  if (!Object.hasOwn(postureClips, posture)) return
  const entering = enterPosture(ctx.rig, posture, scan, gun ? (gun.userData.twoHanded ? standing : aim1) : undefined)
  cancel(); bodyPosture = posture; stance = 'aim'
  const source = gun?.userData.twoHanded ? clips.gun_aim2 : clips.gun_aim1
  const clip = gun ? weaponPosture(source, entering, entering.duration, gun.userData.twoHanded) : entering
  if (gun) clip.name = `gun_enter_${posture}`
  if (gun) { supported.add(clip); posedClips.add(clip) }
  postureEntering = clip
  const done = await ctx.player.play(clip, { once: true, fade: 0.06 })
  if (!done || postureEntering !== clip) return
  postureEntering = null
  const pending = pendingPostureAction as 'fire' | 'auto' | 'reload' | null; pendingPostureAction = null
  ctx.player.play(gun ? stanceClip(stance) : postureClips[posture], { fade: 0 })
  if (pending === 'fire') fire()
  else if (pending === 'auto') toggleAuto()
  else if (pending === 'reload') reload()
}

const label: Record<GunName, string> = { pistol: 'Pistol', revolver: 'Revolver', smg: 'SMG', ak: 'AK-47', shotgun: 'Shotgun', sniper: 'Sniper' }
export const actions: Action[] = [
  ...(['stand', 'crouch', 'kneel', 'prone'] as const).map<Action>(posture => ({ group: 'Combat stance',
    label: { stand: 'Stand', crouch: 'Shallow crouch', kneel: 'One knee', prone: 'Prone' }[posture], run: c => api(c).posture(posture) })),
  ...(Object.keys(builders) as GunName[]).map<Action>(name => ({ group: 'Weapons', label: `Equip: ${label[name]}`, run: c => api(c).equip(name) })),
  { group: 'Weapons', label: 'Holster', run: c => api(c).unequip() },
  { group: 'Shooting', label: 'Aim', hotkey: 'a', run: c => api(c).aim() },
  { group: 'Shooting', label: 'Fire', hotkey: 'f', run: c => { api(c).fire() } },
  { group: 'Shooting', label: 'Auto fire (SMG / AK)', run: c => api(c).toggleAuto() },
  { group: 'Shooting', label: 'Hip fire', run: c => api(c).hip() },
  { group: 'Shooting', label: 'Reload', hotkey: 'l', run: c => api(c).reload() },
  { group: 'Shooting', label: 'Lower gun', run: c => api(c).lower() },
]

const supported = new WeakSet([
  clips.gun_aim2, clips.gun_fire2, clips.gun_auto2, clips.gun_hip, clips.gun_fireHip,
  clips.gun_autoHip, clips.gun_lowReady, clips.gun_pump, pumpHip, raise2, raiseHip2,
])
const supportBones = ['upper_arm.L', 'forearm.L', 'hand.L'] as const
const triggerBones = ['upper_arm.R', 'forearm.R', 'hand.R'] as const
function holdSupport(op: Operation) {
  if (!op.supportPose) return
  ctx.player.adjustBones(supportBones.map(name => ctx.rig.bones[name]), () => {
    supportBones.forEach((name, i) => ctx.rig.bones[name].quaternion.copy(op.supportPose![i]))
    if (!op.cycleHold) return
    // Bring a hip-held rifle up slightly to work its bolt, then settle back into the
    // selected hold. Keeping it at waist height forces the trigger forearm through the stock.
    const t = ctx.player.current?.time ?? 0
    const lift = 0.12 * THREE.MathUtils.smoothstep(t, 0, 0.12) * (1 - THREE.MathUtils.smoothstep(t, 0.85, 1))
    const handRotation = op.cycleHold.rotation.clone().multiply(op.gun.quaternion.clone().invert())
    const target = op.cycleHold.position.clone().add(new THREE.Vector3(0, lift, 0))
      .sub(op.gun.position.clone().applyQuaternion(handRotation)).add(MOUNT_POS.clone().applyQuaternion(handRotation))
    placeHand(ctx.rig, 'L', target, 1, { orientation: handRotation,
      pole: new THREE.Vector3(0.65, -1, -0.15).transformDirection(ctx.rig.root.matrixWorld) })
  })
}
let supporting = false, supportWeight = 1
function alignSupport(dt = 0) {
  if (!gun || !supported.has(ctx.player.current?.getClip() as THREE.AnimationClip)) { supporting = false; return }
  if (!supporting) { supporting = true; supportWeight = 0 }
  supportWeight = busy?.raising || poseTransition ? 1 : Math.min(1, supportWeight + dt / 0.18)
  const anchor = gun.userData.support?.clone()
  if (anchor && gun.userData.parts.pump) anchor.z += gun.userData.parts.pump.position.z - 0.26
  ctx.player.adjustBones(supportBones.map(name => ctx.rig.bones[name]), () => supportHand(ctx.rig, gun!, anchor, supportWeight))
}

function placeHold(hold: Hold, position: THREE.Vector3, rotation: THREE.Quaternion, t: number) {
  const blend = t * t * (3 - 2 * t)
  const point = ctx.rig.root.localToWorld(new THREE.Vector3(...hold.position)).lerp(position, 1 - blend)
  // Arc the stock around the trigger arm and toward the support hand. The slight
  // inward component keeps both grips reachable with the shorter arm proportions.
  if (gun?.userData.twoHanded) point.add(new THREE.Vector3(0.03, 0.025, 0.05)
    .applyQuaternion(ctx.rig.root.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(Math.sin(Math.PI * t) ** 2))
  const orientation = ctx.rig.root.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(
    new THREE.Euler(THREE.MathUtils.degToRad(hold.pitch ?? 0), THREE.MathUtils.degToRad(hold.yaw ?? 0), 0, 'YXZ')))
  orientation.slerp(rotation, 1 - blend).multiply(MOUNT_Q.clone().invert())
  const elbowPole = new THREE.Vector3(...(hold.elbow ?? [-0.4, -1, -0.7] as const)).transformDirection(ctx.rig.root.matrixWorld)
  ctx.player.adjustBones(triggerBones.map(name => ctx.rig.bones[name]), () =>
    placeHand(ctx.rig, 'R', point, 1, { orientation, pole: elbowPole }))
}
function alignHoldTransition(dt: number) {
  if (poseTransition) {
    const interrupted = ctx.player.current?.getClip() !== poseTransition.clip
    const handingBack = poseTransition.handoff && gun?.parent === ctx.rig.bones['hand.L']
    if (interrupted) pendingAction = null
    if (!gun || (interrupted && !handingBack)) { poseTransition = null; pendingAction = null }
    else {
      poseTransition.elapsed += dt
      const { hold, position, rotation, duration, elapsed, handoff } = poseTransition
      const handoffDuration = handoff?.duration ?? 0
      if (handoff && gun.parent === ctx.rig.bones['hand.L']) {
        // Keep the rifle supported while the operating hand returns to the trigger.
        // Remounting first would teleport that hand from the bolt to the grip.
        const blend = THREE.MathUtils.smoothstep(elapsed, 0, handoffDuration)
        const leftRotation = rotation.clone().multiply(gun.quaternion.clone().invert())
        const leftTarget = position.clone().sub(gun.position.clone().applyQuaternion(leftRotation))
          .add(MOUNT_POS.clone().applyQuaternion(leftRotation))
        const rightRotation = rotation.clone().multiply(MOUNT_Q.clone().invert()).slerp(handoff.rotation, 1 - blend)
        const rightTarget = position.clone().lerp(handoff.position, 1 - blend)
        const rightPole = new THREE.Vector3(-0.4, -1, -0.7).transformDirection(ctx.rig.root.matrixWorld).lerp(handoff.pole, 1 - blend).normalize()
        ctx.player.adjustBones(armBones.map(name => ctx.rig.bones[name]), () => {
          placeHand(ctx.rig, 'L', leftTarget, 1, { orientation: leftRotation, pole: new THREE.Vector3(0.65, -1, -0.15).transformDirection(ctx.rig.root.matrixWorld) })
          placeHand(ctx.rig, 'R', rightTarget, 1, { orientation: rightRotation, pole: rightPole })
        })
        if (elapsed >= handoffDuration) remount()
      }
      if (elapsed >= handoffDuration) {
        if (interrupted) poseTransition = null
        else placeHold(hold, position, rotation, Math.min(1, (elapsed - handoffDuration) / duration))
      }
      if (elapsed >= duration + handoffDuration) poseTransition = null
    }
  }
  if (busy?.raising && gun) {
    const { hold, position, rotation } = busy.raising
    placeHold(hold, position, rotation, THREE.MathUtils.clamp((ctx.player.current?.time ?? 0) / 0.35, 0, 1))
  }
}

const carryPoint = new THREE.Vector3(), carryQ = new THREE.Quaternion(), carryRotation = new THREE.Quaternion()
const pole = new THREE.Vector3()
let carrying = false, carryWeight = 1, previousGun: Gun | null = null
const previousGrip = new THREE.Vector3(), previousGunQ = new THREE.Quaternion()
const carryStart = new THREE.Vector3(), carryStartQ = new THREE.Quaternion()
function alignCarry(dt: number) {
  if (!gun || gun.parent !== ctx.rig.bones['hand.R']) { carrying = false; return }
  const name = ctx.player.current?.getClip().name ?? ''
  if (name.startsWith('gun_')) { carrying = false; return }
  if (!carrying) {
    carrying = true; carryWeight = previousGun === gun ? 0 : 1
    carryStart.copy(previousGrip); carryStartQ.copy(previousGunQ)
  }
  carryWeight = name === 'patrolWalk' || name === 'armedAlert' ? 1 : Math.min(1, carryWeight + dt / 0.2)
  const chest = ctx.rig.bones.chest
  chest.updateWorldMatrix(true, false)
  // Carry targets follow the torso during walking, crouching and reactions; they stay
  // in front of its surface instead of inheriting gestures that swing a gun into the head.
  if (gun.userData.twoHanded) carryPoint.set(-0.13, -0.05, 0.22)
  else {
    // Reuse the relaxed lowered hold, translated by the torso's movement.
    const rest = ctx.rig.rest
    carryPoint.set(...handgunDown.position)
    carryPoint.y -= rest.hips.pos.y + rest.spine.pos.y + rest.chest.pos.y
  }
  const chestUp = new THREE.Vector3(0, 1, 0).transformDirection(chest.matrixWorld)
  // As the chest leans into a run, lift the fore-end enough for the support
  // forearm to remain beneath it. Blend with torso lean rather than clip changes.
  if (gun.userData.twoHanded) carryPoint.y += 0.03 * THREE.MathUtils.smoothstep(1 - chestUp.y, 0.01, 0.05)
  if (gun.userData.twoHanded && chestUp.y < 0.9) { carryPoint.x -= 0.12; carryPoint.y -= 0.02; carryPoint.z -= 0.04 }
  carryPoint.applyQuaternion(ctx.rig.root.getWorldQuaternion(carryQ)).add(chest.getWorldPosition(new THREE.Vector3()))
  const pitch = gun.userData.twoHanded
    ? Math.min(18, THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp((carryPoint.y - 0.08) / gun.userData.muzzle.z, 0, 1)))) : handgunDown.pitch!
  carryRotation.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(pitch), gun.userData.twoHanded ? 0.61 : THREE.MathUtils.degToRad(handgunDown.yaw!), 0, 'YXZ'))
  carryQ.multiply(carryRotation)
  const blend = carryWeight * carryWeight * (3 - 2 * carryWeight)
  carryPoint.lerp(carryStart, 1 - blend)
  carryQ.slerp(carryStartQ, 1 - blend).multiply(MOUNT_Q.clone().invert())
  pole.fromArray(gun.userData.twoHanded ? [-0.4, -1, -0.7] : handgunDown.elbow!).transformDirection(ctx.rig.root.matrixWorld)
  ctx.player.adjustBones(armBones.map(name => ctx.rig.bones[name]), () => {
    placeHand(ctx.rig, 'R', carryPoint, 1, { orientation: carryQ, pole })
    if (gun!.userData.twoHanded) supportHand(ctx.rig, gun!)
  })
}

function contact(part: THREE.Object3D | undefined, side: 'L' | 'R', weight: number) {
  const grip = part?.userData.grip as THREE.Vector3 | undefined
  if (!part || !grip || weight <= 0 || !gun) return
  part.updateWorldMatrix(true, false)
  const target = part.localToWorld(grip.clone())
  // Approach along the hand's forearm while retaining its existing roll. A fixed
  // palm quaternion can be 180 degrees from an animated hand; shortest-arc blending
  // then flips sides halfway through a reload. This swing-only target stays local.
  const hand = ctx.rig.bones[`hand.${side}`], fore = ctx.rig.bones[`forearm.${side}`]
  const orientation = hand.getWorldQuaternion(new THREE.Quaternion())
  const fingers = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation)
  const approach = target.clone().sub(fore.getWorldPosition(new THREE.Vector3())).normalize()
  orientation.premultiply(new THREE.Quaternion().setFromUnitVectors(fingers, approach))
  const elbowPole = side === 'R'
    ? new THREE.Vector3(0, -1, 0).transformDirection(ctx.rig.root.matrixWorld)
    : new THREE.Vector3(0.65, -1, -0.15).transformDirection(ctx.rig.root.matrixWorld)
  ctx.player.adjustBones((side === 'L' ? supportBones : triggerBones).map(name => ctx.rig.bones[name]),
    () => placeHand(ctx.rig, side, target, weight, { orientation, pole: elbowPole, maxWristAngle: 60 }))
}
function alignMechanisms() {
  if (!busy || !gun) return
  const t = ctx.player.current?.time ?? 0
  const reach = (start: number, hold: number, release: number, end: number) =>
    THREE.MathUtils.smoothstep(t, start, hold) * (1 - THREE.MathUtils.smoothstep(t, release, end))
  const parts = gun.userData.parts
  if (gun.userData.twoHanded && busy.clip?.name.startsWith('gun_reload_') && t < 0.26) {
    const hold = 1 - THREE.MathUtils.smoothstep(t, 0.12, 0.26)
    ctx.player.adjustBones(supportBones.map(name => ctx.rig.bones[name]), () => supportHand(ctx.rig, gun!, undefined, hold))
  }
  if (busy.clip?.name.startsWith('gun_bolt')) {
    contact(parts.bolt, 'R', reach(0.12, 0.25, 0.7, 0.85))
  } else if (busy.clip?.name.startsWith('gun_reload_')) {
    if (gun.userData.name === 'revolver') {
      contact(parts.cylinder, 'L', Math.max(reach(0.15, 0.35, 0.8, 1), reach(1.2, 1.45, 1.95, 2.15)))
    } else if (gun.userData.name === 'shotgun') {
      contact(parts.loadingPort, 'L', Math.max(...[0, 0.5, 1].map(offset => reach(0.45 + offset, 0.65 + offset, 0.72 + offset, 0.88 + offset))))
    } else {
      const small = gun.userData.cls === 'pistol'
      contact(parts.magazine, 'L', small ? reach(0.15, 0.35, 1, 1.2) : reach(0.2, 0.4, 1.2, 1.4))
      if (gun.userData.name === 'pistol') contact(parts.slide, 'L', reach(1.15, 1.35, 1.65, 1.85))
      if (RPM[gun.userData.name]) contact(parts.bolt, 'L', reach(1.3, 1.55, small ? 1.72 : 1.8, small ? 1.9 : 2.1))
    }
  }
}

export function update(dt: number, c: Ctx) {
  api(c)
  const current = c.player.current?.getClip()
  if (postureEntering && current !== postureEntering) { postureEntering = null; pendingPostureAction = null }
  if (bodyPosture !== 'stand' && current !== postureEntering && (!current || !posedClips.has(current)) && current !== postureClips[bodyPosture]) {
    bodyPosture = 'stand'; postureEntering = null; pendingPostureAction = null
  }
  if (gun && c.player.current?.getClip().name.startsWith('die')) {
    // Direct clip playback reaches this fallback after the mixer has already moved
    // the hands. Release from the last visible hold, as the lethal UI actions do.
    if (previousGun === gun) {
      c.scene.attach(gun)
      gun.position.copy(c.scene.worldToLocal(previousGrip.clone()))
      gun.quaternion.copy(c.scene.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(previousGunQ))
    }
    release()
  }
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
  alignHoldTransition(delta)
  alignCarry(delta)
  alignSupport(delta)
  alignMechanisms()
  previousGun = gun
  if (gun) { gun.getWorldPosition(previousGrip); gun.getWorldQuaternion(previousGunQ) }
  if (pendingAction && gun?.parent === c.rig.bones['hand.R']) {
    const action = pendingAction; pendingAction = null
    if (action === 'fire') fire(); else reload()
  }
}
