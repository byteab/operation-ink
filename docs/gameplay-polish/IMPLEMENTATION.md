# Gameplay polish implementation record

2026-09-17. Preserve the existing dirty worktree, including first-level gameplay and VR work. No commit requested.

## Baseline

Production build and player, VR, mission, weapons, map, AI checks all passed before edits. Existing Vite warning: shared Three.js chunk exceeds 500 kB. Existing reserve-2 simulation reports 80 failed path attempts but completes its route. Baseline has 14 enemies.

## Boundaries and ownership

- Coordinator: shared types and balance configuration; world population; runtime integration, impact feedback, health/scope HUD, documentation and browser verification.
- AI specialist: `src/game/ai.ts`, `src/game/actors.ts`, focused AI checks. Stop-and-shoot locomotion, perception/search, region reactions, tower sniper behavior.
- Weapon specialist: `src/game/weapons.ts`, new mission weapon model helper, focused weapon checks. Wider arms, connected mitten hands, 3D reload, sniper and zoom. Preserve lab model implementations.
- Audio specialist: `src/game/audio.ts`, audio credits/documentation, audio checks. Spatial event variants, voice pacing, ladder cadence and original procedural music, lifecycle cleanup.
- Independent validator after integration: review implementation and actual runtime via agent-browser headless; document evidence and defects, return fixes for re-check.

Shared contract: `WeaponName` adds `sniper`; `EnemySpec.role` supports stationary sniper posts; SoundEvent optionally carries `zone`. `balance.ts` owns player/enemy weapon values and hit multipliers. Weapon module re-exports WEAPON_RULES for existing callers. Actors and first-person weapons use a mission-only model factory for sniper, reusing lab assets for other guns. Runtime owns scope DOM, weapon owns FOV and exposes scoped state. Browser verification explicitly uses agent-browser per user request.

## Reuse and decisions

Reuse lab skeleton/locomotion/damage clips, animated hit capsules, mirrored limb reactions, bounded MissionBlood pigment stamps, collision navigation, existing sampled CC0 effects and inventory/checkpoint pipeline. No armor or invulnerability window; every confirmed hit applies damage. Enemy health 100; base pistol/AK/SMG/sniper damage 30/34/24/65; head multiplier 2.2 ordinary and 2 sniper; torso 1, arm .6, leg .7. Ordinary headshots require two hits; sniper headshot kills, torso requires two. Enemy damage uses a separate explicit fair-play table.

Audio additions will be original synthesis or existing documented samples, with no proprietary downloads. Optional future assets: authored turn-in-place and lateral locomotion; lateral combat is removed now.

## Validation

Production build, existing regressions and added polish checks pass. Headless agent-browser completed two input-only northern routes and independent staged combat/integration checks; records and evidence are in [VERIFICATION.md](VERIFICATION.md). Review findings include corrected FOV capture, corpse-to-living weapon visibility, HUD contrast/overlap and sniper shot audibility. Subjective audio quality is not inferred from event counts.

World decision: the actual map contains one water tower and one observation tower, so both existing supported decks receive marksmen rather than adding a redundant second water tower. Two additional house guards populate dispatch/maintenance, extending existing relay/crew actors. Mission sniper is the existing original lab model. The player pickup is beside maintenance supplies; defeated snipers also drop it.
