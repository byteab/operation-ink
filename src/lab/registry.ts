import type * as THREE from 'three'
import type { Player } from './player'
import type { Rig } from './rig'

export type Ctx = {
  rig: Rig
  player: Player
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** free-form slots for fx / weapon modules to stash state */
  fx: Record<string, any>
  weapons: Record<string, any>
  clips: Record<string, THREE.AnimationClip>
  /** seconds since the lab started */
  time: number
}
export type Action = { group: string; label: string; run: (ctx: Ctx) => void | Promise<void>; hotkey?: string }
export type Updater = (dt: number, ctx: Ctx) => void

type Mod = { clips?: Record<string, THREE.AnimationClip>; actions?: Action[]; update?: Updater }

export const clips: Record<string, THREE.AnimationClip> = {}
export const actions: Action[] = []
/** Per-frame hooks, run after player.update. Push at runtime or export `update` from a module. */
export const updaters: Updater[] = []

// This module is imported AFTER the rig loads (see main.ts) so clip modules can call makeClip at top level.
// Don't touch these arrays at module top level in a globbed module (circular import); export `update` instead.
const mods = {
  ...import.meta.glob<Mod>('./clips/*.ts', { eager: true }),
  ...import.meta.glob<Mod>(['./actions/*.ts', './fx/*.ts', './weapons/*.ts'], { eager: true }),
}
for (const mod of Object.values(mods)) {
  Object.assign(clips, mod.clips)
  actions.push(...(mod.actions ?? []))
  if (mod.update) updaters.push(mod.update)
}
