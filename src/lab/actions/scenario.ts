import * as THREE from 'three'
import { clipToJSON } from '../clip'
import { mapGait } from '../gait'
import { hitRegion, hitShotgun, type Region } from '../clips/damage'
import { curious, clips as behavior } from '../clips/behavior'
import { clips as loco } from '../clips/locomotion'
import { clips as gunClips } from '../weapons/guns'
import { rest, type BoneName } from '../rig'
import type { Action, Ctx } from '../registry'

/** `base` with the tracks of `bones` swapped for `top`'s (walk legs + low-ready arms). */
function mix(name: string, base: THREE.AnimationClip, top: THREE.AnimationClip, bones: BoneName[]) {
  // Position tracks set limb lengths as well as rotations. Mixing only the
  // quaternions silently restores the source gait's arm proportions.
  const names = new Set(bones.flatMap(b => [`${rest![b].node}.quaternion`, `${rest![b].node}.position`]))
  return mapGait(base, variant => new THREE.AnimationClip(name, variant.duration, [...variant.tracks.filter(t => !names.has(t.name)), ...top.tracks.filter(t => names.has(t.name))]))
}
const ARMS: BoneName[] = ['upper_arm.L', 'upper_arm.R', 'forearm.L', 'forearm.R', 'hand.L', 'hand.R']
export const clips = {
  patrolWalk: mix('patrolWalk', loco.walk, gunClips.gun_lowReady, ARMS),
  armedAlert: mix('armedAlert', behavior.alert, gunClips.gun_lowReady, ARMS),
}

const regions: Region[] = ['head', 'body', 'arm', 'leg']

type Burst = {
  gun: THREE.Object3D
  revision: number
  phase: 'alert' | 'aim' | 'shot'
  action: THREE.AnimationAction
  shots: number
  elapsed: number
  delay: number
}
let activeBurst: Burst | null = null

function burst(ctx: Ctx) {
  const guns = ctx.weapons.guns
  guns.equip('ak')
  ctx.player.play(clips.armedAlert, { once: true, fade: 0 })
  activeBurst = {
    gun: guns.current, revision: ctx.player.revision, phase: 'alert',
    action: ctx.player.current!, shots: 0, elapsed: 0, delay: 0.3,
  }
}

/** Use playback time so pausing or slowing the lab also pauses/slows the burst. */
export function update(dt: number, ctx: Ctx) {
  const op = activeBurst
  if (!op) return
  const { player } = ctx, guns = ctx.weapons.guns
  if (guns.current !== op.gun) { activeBurst = null; return }
  if (player.revision !== op.revision) {
    // A completed shot returns to aim inside the gun module. This is the only
    // playback command the sequence accepts from elsewhere; every user command,
    // including replaying Aim, invalidates the remaining shots.
    const finishedShot = op.phase === 'shot' && op.action.time >= op.action.getClip().duration
      && player.revision === op.revision + 1 && !guns.busy && guns.stance === 'aim'
      && player.current?.getClip() === gunClips.gun_aim2
    if (!finishedShot) { activeBurst = null; return }
    op.revision = player.revision
    op.action = player.current!
    op.phase = 'aim'
  }
  const delta = dt * player.mixer.timeScale
  if (delta <= 0) return
  if (op.phase === 'alert') {
    if (op.action.time < clips.armedAlert.duration) return
    guns.aim()
    op.revision = player.revision; op.action = player.current!; op.phase = 'aim'
    return
  }
  op.elapsed += delta
  // Aim can still be carrying the rifle into position after the shot interval.
  // Firing then queues a separate raise and returns no ray, so wait for the gun
  // module's actual readiness instead of assuming a particular crossfade length.
  if (op.phase !== 'aim' || op.elapsed < op.delay || !guns.readyToFire) return
  if (!guns.fire()) { activeBurst = null; return }
  if (++op.shots === 3) { activeBurst = null; return }
  op.revision = player.revision; op.action = player.current!; op.phase = 'shot'
  op.elapsed = 0; op.delay = 0.26
}

function reset(ctx: Ctx) {
  activeBurst = null
  ctx.player.stop(0)
  ctx.rig.resetPose()
  ctx.rig.root.rotation.y = 0
  ctx.weapons.guns?.unequip()
  ctx.fx.blood?.clear()
  ctx.player.play(ctx.clips.idle)
}

function exportClips(ctx: Ctx) {
  const json = JSON.stringify(Object.values(ctx.clips).map(clipToJSON))
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  a.download = 'stickman-clips.json'
  a.click()
  URL.revokeObjectURL(a.href)
  console.log(`stickman-clips.json: ${Object.keys(ctx.clips).length} clips, ${(json.length / 1024).toFixed(0)} KB`)
}

export const actions: Action[] = [
  { group: 'Scenario', label: 'Shot: shotgun blast', run: hitShotgun },
  ...regions.map((r): Action => ({ group: 'Scenario', label: `Shot: ${r} (lethal)`, run: ctx => hitRegion(ctx, r, true) })),
  ...regions.map((r): Action => ({ group: 'Scenario', label: `Shot: ${r} (wound)`, run: ctx => hitRegion(ctx, r, false) })),
  { group: 'Scenario', label: 'Shot: miss → curious', run: curious },
  { group: 'Scenario', label: 'Shot: miss → drop prone', run: ctx => ctx.weapons.guns?.nearMiss('prone') },
  { group: 'Scenario', label: 'Shot: miss → one knee', run: ctx => ctx.weapons.guns?.nearMiss('kneel') },
  { group: 'Scenario', label: 'Armed guard patrol', run: ctx => { ctx.weapons.guns.equip('ak'); ctx.player.play(clips.patrolWalk, { fade: 0 }) } },
  { group: 'Scenario', label: 'Armed: alert & fire burst', run: burst },
  { group: 'Scenario', label: 'Reset scene', hotkey: '0', run: reset },
  { group: 'Export', label: 'Export clips JSON', hotkey: 'e', run: exportClips },
]
