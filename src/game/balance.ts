import type { HitZone } from './hit-reactions'
import type { WeaponItem, WeaponName } from './types'
import { GAIT_SPEED } from '../lab/gait'

// Faster mission running, with stride/cadence adaptation shared with the lab.
export const ENEMY_RUN_SPEED = GAIT_SPEED.run * 1.5
export const HOSTAGE_RUN_SPEED = 2.6

/** Ordinary jumps and drops up to about 2.3 m are safe; taller falls scale with impact energy. */
export function fallDamage(landingSpeed: number) {
  if (!Number.isFinite(landingSpeed) || landingSpeed <= 10) return 0
  return Math.min(100, (landingSpeed * landingSpeed - 100) * 0.3)
}

// No armor or damage immunity: every confirmed hit applies this damage immediately.
export const ENEMY_HEALTH = 100
export const HIT_MULTIPLIERS: Record<HitZone, number> = { head: 2.2, torso: 1, arm: 0.6, leg: 0.7 }
export const WEAPON_RULES = {
  pistol: { label: 'Pistol', capacity: 12, reload: 1.85, interval: 0.25, range: 110, damage: 30, automatic: false, kick: 0.03, settle: 0.55 },
  ak: { label: 'AK rifle', capacity: 30, reload: 2.3, interval: 0.12, range: 170, damage: 34, automatic: true, kick: 0.022, settle: 0.6 },
  smg: { label: 'SMG', capacity: 24, reload: 2.05, interval: 0.085, range: 100, damage: 24, automatic: true, kick: 0.012, settle: 0.65 },
  shotgun: { label: 'Pump shotgun', capacity: 6, reload: 0.65, interval: 0.9, range: 32, damage: 28, automatic: false, kick: 0.11, settle: 0.84 },
  sniper: { label: 'Sniper rifle', capacity: 5, reload: 2.9, interval: 1.35, range: 220, damage: 65, automatic: false, kick: 0.048, settle: 0.85 },
} as const

export const ENEMY_WEAPONS = {
  pistol: { magazine: 12, reload: 1.9, damage: 10, burst: 3, gap: 0.2, pause: [0.65, 0.95] },
  ak: { magazine: 30, reload: 2.4, damage: 9, burst: 4, gap: 0.11, pause: [0.55, 0.85] },
  smg: { magazine: 24, reload: 2.1, damage: 7, burst: 5, gap: 0.08, pause: [0.5, 0.75] },
  shotgun: { magazine: 6, reload: 3.9, damage: 14, burst: 1, gap: 0.9, pause: [1.2, 1.6] },
  sniper: { magazine: 5, reload: 2.9, damage: 32, burst: 1, gap: 1.35, pause: [2.0, 2.6] },
} as const

export function hitDamage(weapon: WeaponName | undefined, zone: HitZone, baseDamage: number) {
  return Math.max(0, baseDamage) * (zone === 'head' && weapon === 'sniper' ? 2 : HIT_MULTIPLIERS[zone])
}

/** Responsive combat: reaction runs alongside weapon presentation, never after it. */
export const ENEMY_COMBAT = {
  passiveRange: 20,
  sniperPassiveRange: 28,
  engagedRange: 60,
  sniperEngagedRange: 110,
  contactMemory: 8,
  senseIdle: 0.1,
  senseCombat: 0.05,
  settle: 0.16,
  aimHalfAngle: 12 * Math.PI / 180,
  turnSpeed: 7.5,
  aimDelay: 0.8,
  reaction: [0.8, 1.0],
  sniperReaction: [0.9, 1.1],
  openingHold: 1.75,
  blockedRetry: 0.05,
  blockedReposition: 0.3,
} as const

export const SHOTGUN_PELLETS = 8
// Buckshot fans out from the muzzle: about 1.57 m across at 10 m, 3.15 m at 20 m. Aiming does
// not change the barrel/choke, so ADS uses the same cone as hip fire.
export const SHOTGUN_BALLISTICS = { halfAngle: 4.5 * Math.PI / 180, fullDamageRange: 8, minimumDamageScale: 0.4 } as const

/** Pattern density does most of the range balancing; individual pellets also lose energy. */
export function shotgunDamageMultiplier(distance: number) {
  const travel = Math.max(0, Math.min(1, (distance - SHOTGUN_BALLISTICS.fullDamageRange) /
    (WEAPON_RULES.shotgun.range - SHOTGUN_BALLISTICS.fullDamageRange)))
  return 1 - travel * (1 - SHOTGUN_BALLISTICS.minimumDamageScale)
}

export const WEAPON_SLOTS = 4
export const SNIPER_ZOOM = { min: 2, max: 8, initial: 4 } as const
export function startingLoadout(): WeaponItem[] {
  return [
    { id: 'player-pistol', name: 'pistol', magazine: 12, reserve: 36 },
    { id: 'player-shotgun', name: 'shotgun', magazine: 6, reserve: 24 },
    { id: 'player-ak', name: 'ak', magazine: 30, reserve: 90 },
    { id: 'player-smg', name: 'smg', magazine: 24, reserve: 72 },
  ]
}
