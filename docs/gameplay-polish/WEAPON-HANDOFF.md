# Weapons, scope and first-person animation handoff

## Ownership and integration

- `src/game/weapons.ts`: authoritative inventory, fire, obstruction, reload, scope and first-person rig.
- `src/game/weapon-models.ts`: `createMissionGun(name: WeaponName): Gun`, reusing the existing original procedural lab builders, including the fully modeled sniper rifle. Lab sources are unchanged.
- `scripts/weapon-checks.ts`: existing tests now exercise sniper bone lengths through reload.
- `scripts/polish-weapon-checks.ts`: sniper model metadata, optical zoom, shot pipeline, reload transfer, cover and cancellation regressions.
- Shared `src/game/balance.ts` supplies/re-exports weapon rules. Runtime owns scope DOM and must use `weapons.scoped` and `weapons.lookSensitivity` (1 normally, 0.25 scoped). Active/climbing frames already cancel weapons on pause/death/climbing; restore cancels on restart.

## Behavior and design

Hold aim with the sniper to enter true 4× tangent-FOV zoom. The base camera FOV is preserved, and the viewmodel is hidden during scoped aiming to avoid zoom clipping. Releasing aim restores the baseline on the next frame. Reload, switch, cancel, restore and disposal restore FOV immediately. Cover prevents scope activation while the long muzzle is obstructed. Holding aim resumes zoom after reload completes. Scope UI and controller sensitivity are supplied by the integration owner.

Sniper shots use the same muzzle/world obstruction, ammo decrement, ray, recoil and sound path as other weapons. It uses shared configuration: five-round magazine, 2.9-second reload, 1.35-second firing interval, semi-automatic trigger, 220 m range and 65 base damage. Damage region multipliers and headshot outcomes belong to shared balance/actor integration.

Arms are 5.4–6 cm wide instead of 3.6–3.8 cm, with matching connected joints. Hands use overlapping low-poly mitten masses rather than individual fingers. The right grip moves with the weapon; the support hand follows the fore-end, magazine and action anchors. Reload adds diagonal magazine withdrawal and pitch/roll wrist rotation while keeping two-bone arm lengths fixed. A double-sided five-point flash replaces the cone. Switches now emit `switch` sound events. Cancellation clears pending recoil recovery as well as action/hand state.

All meshes are repository-owned procedural Three.js geometry; no external assets or licensing changes.

## Checks and remaining validation

Passed on 2026-09-17:

- `npm run test:weapons` — all nine existing checks; fixed arm lengths for pistol, AK, SMG and sniper across full reloads.
- `node scripts/check-player.mjs scripts/polish-weapon-checks.ts` — all ten focused checks, including pause, climb, switch, restore and disposal resets.

TypeScript checking during parallel implementation reported only in-progress AI/audio errors outside owned files; full build is deferred to integration.

Independent validation found a construction-order FOV defect: weapons were constructed during overview FOV 38 before the controller entered walk FOV 75. Fixed by capturing baseline only on entering scope and restoring only a scope-owned change. Unscoped updates/cancel/dispose preserve controller FOV. An eleventh focused check exercises construction38 → walk75 → scope → cancel75 → inspection38. Both weapon suites pass; the same validator rechecks actual browser behavior.

Actual first-person camera review remains required in the coordinator's explicitly requested headless `agent-browser` session. Numerical limb checks are not visual validation. Inspect idle, recoil, complete reload motion, switching, scope hold/release, cover blocking, pause/death/restart and ladder cancellation at gameplay resolution. The current scope transition is immediate (like a tactical scope); ordinary aim and weapon poses still ease.
