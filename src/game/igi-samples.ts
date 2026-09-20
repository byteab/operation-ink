/** Curated samples extracted by scripts/extract-igi-audio.py; provenance in sounds/igi/manifest.json. */
const files = (...names: string[]) => names.map(name => `igi/${name}.wav`)
const series = (prefix: string, count: number, padding = 1) =>
  files(...Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(padding, '0')}`))
export const IGI_SAMPLES: Record<string, { files: string[]; gain: number }> = {
  horn: { files: files('alarm_1'), gain: 0.48 },
  footstep: { files: series('walk_gravel_', 6), gain: 0.42 },
  'enemy-footstep': { files: series('walk_gravel_', 6), gain: 0.34 },
  ladder: { files: series('walk_ladder_', 4), gain: 0.3 },
  'shot-pistol': { files: files('glock_shot_1', 'glock_shot_2'), gain: 0.75 },
  'enemy-shot-pistol': { files: files('glock_shot_1', 'glock_shot_2'), gain: 0.7 },
  'shot-ak': { files: files('ak47_single'), gain: 0.8 },
  'enemy-shot-ak': { files: files('ak47_single'), gain: 0.75 },
  'shot-smg': { files: files('mp5sd_single'), gain: 0.62 },
  'enemy-shot-smg': { files: files('mp5sd_single'), gain: 0.6 },
  'shot-shotgun': { files: files('spas12_shot_1'), gain: 0.95 },
  'enemy-shot-shotgun': { files: files('spas12_shot_1'), gain: 0.88 },
  'weapon-pump': { files: files('spas12_pump'), gain: 0.4 },
  'shell-load': { files: series('spas12_bulins_', 4), gain: 0.3 },
  'reload-shotgun': { files: files('spas12_reload_1'), gain: 0.4 },
  'enemy-reload-shotgun': { files: files('spas12_pump'), gain: 0.35 },
  'reload-ready-shotgun': { files: files('spas12_reload_2'), gain: 0.4 },
  'shot-sniper': { files: files('svddrag_shot_1'), gain: 0.9 },
  'enemy-shot-sniper': { files: files('svddrag_shot_1'), gain: 0.82 },
  impact: { files: series('bul_concrete_', 2), gain: 0.35 },
  'enemy-hit': { files: series('bul_flesh_', 5), gain: 0.75 },
  'hit-confirm': { files: series('bul_flesh_', 5), gain: 0.34 },
  'enemy-pain': { files: series('ai_hit_', 3, 2), gain: 0.95 },
  'enemy-down': { files: series('bodyfall_', 9), gain: 0.5 },
  damage: { files: series('player_hit_', 4), gain: 0.5 },
  'player-death': { files: series('player_hit_', 4), gain: 0.62 },
  'player-fall': { files: series('bodyfall_', 9), gain: 0.7 },
  door: { files: files('door_open_1'), gain: 0.3 },
  pickup: { files: files('weaponpickup_1'), gain: 0.4 },
  drop: { files: series('weapondrop_', 2, 2), gain: 0.35 },
  switch: { files: files('new_gun'), gain: 0.3 },
  empty: { files: files('guns_dry_1'), gain: 0.45 },
  reload: { files: files('ak47_reload_1'), gain: 0.4 },
  'enemy-reload': { files: files('ak47_reload_1'), gain: 0.35 },
  'reload-ready': { files: files('ak47_reload_3'), gain: 0.4 },
}

/** Character vocals are IGI-only; remaining dialogue is caption-only. */
export const IGI_VOICES: Record<string, string[]> = {
  spot: series('detected_', 6, 2),
  contact: series('detected_', 6, 2),
  hurt: series('ai_hit_', 3, 2),
}
