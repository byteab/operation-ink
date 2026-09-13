import * as THREE from 'three'
import { clipToJSON } from '../clip'
import { hitRegion, type Region } from '../clips/damage'
import { curious } from '../clips/behavior'
import { clips as loco } from '../clips/locomotion'
import { clips as gunClips } from '../weapons/guns'
import { rest, type BoneName } from '../rig'
import type { Action, Ctx } from '../registry'

// Game-like combinations of the other modules. Nothing here owns state.

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** `base` with the tracks of `bones` swapped for `top`'s (walk legs + low-ready arms). */
function mix(name: string, base: THREE.AnimationClip, top: THREE.AnimationClip, bones: BoneName[]) {
  const names = new Set(bones.map(b => `${rest![b].node}.quaternion`))
  return new THREE.AnimationClip(name, base.duration, [...base.tracks.filter(t => !names.has(t.name)), ...top.tracks.filter(t => names.has(t.name))])
}
const ARMS: BoneName[] = ['upper_arm.L', 'upper_arm.R', 'forearm.L', 'forearm.R', 'hand.L', 'hand.R']
export const clips = { patrolWalk: mix('patrolWalk', loco.walk, gunClips.gun_lowReady, ARMS) }

const regions: Region[] = ['head', 'body', 'arm', 'leg']

async function burst(ctx: Ctx) {
  const guns = ctx.weapons.guns
  guns.equip('ak')
  await ctx.player.play(ctx.clips.alert, { once: true })
  guns.aim()
  await sleep(300)
  for (let i = 0; i < 3; i++) { guns.fire(); await sleep(260) }
}

function reset(ctx: Ctx) {
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
  ...regions.map((r): Action => ({ group: 'Scenario', label: `Shot: ${r} (lethal)`, run: ctx => hitRegion(ctx, r, true) })),
  ...regions.map((r): Action => ({ group: 'Scenario', label: `Shot: ${r} (wound)`, run: ctx => hitRegion(ctx, r, false) })),
  { group: 'Scenario', label: 'Shot: miss → curious', run: curious },
  { group: 'Scenario', label: 'Armed guard patrol', run: ctx => { ctx.weapons.guns.equip('ak'); ctx.player.play(clips.patrolWalk) } },
  { group: 'Scenario', label: 'Armed: alert & fire burst', run: burst },
  { group: 'Scenario', label: 'Reset scene', hotkey: '0', run: reset },
  { group: 'Export', label: 'Export clips JSON', hotkey: 'e', run: exportClips },
]
