# Gameplay polish verification

Date: 2026-09-17. Browser verification uses **agent-browser 0.27.0 in headless Chromium**, as requested. Development server: `127.0.0.1:5173`; production preview: `127.0.0.1:4173`. Existing uncommitted project work was preserved. No commit was made.

## Systems and configuration

| System | Main files / decision |
| --- | --- |
| AI and animation | `src/game/ai.ts`, `actors.ts`: forward walk/run paths, authored turn steps, no strafe or passive sliding, 0.22 s planted before weapon windup, frozen root during full-body flinch |
| Damage | `balance.ts`: health 100; pistol/AK/SMG/sniper base 30/34/24/65; ordinary head ×2.2, sniper head ×2, torso ×1, arms ×0.6, legs ×0.7; no armor or damage immunity |
| Perception | Ordinary range 36 m, combat 43 m, sniper 110 m; 55° half-cone, real occlusion and last-known position; audible shots investigate, never grant instant combat; local communication 58 m with radio / 20 m without |
| Snipers | One water-tower post and one observation-tower post: these are the map's two existing towers. No second water tower exists. They stay on their decks. Acquisition and aim windup precede shots; damage32, 2.6–3.4 s cadence |
| Player weapons | `weapons.ts`, `weapon-models.ts`: existing lab sniper model, 5-round magazine, 4× optical scope, sensitivity¼, 2.9 s reload, shared authoritative ammunition/ray pipeline; wider connected hands and 3D reload |
| Feedback | `hit-reactions.ts`, `impacts.ts`, `runtime.ts`: actual animated hit capsules, replayable left/right regional flinches, bounded blood/chips, real-contact tracers, muzzle star/recoil, distinct lethal responses |
| Encounters/UI | `world.ts`, `hud.ts`, `game.css`: dispatch and maintenance guards extend existing relay/crew population; 18 total enemies including four reserves; paper-backed health bar and scope/ammo HUD |
| Audio | `audio.ts`: spatial existing CC0 samples, region variation, sniper/mechanical cues, paced voices, alternating ladder one-shots, original quiet music with ducking and lifecycle cleanup |

Arms and weapon meshes are original existing repository geometry. No new external sound assets were downloaded. [Audio credits](../../public/sounds/CREDITS.md) and [audio behavior](../first-level/AUDIO.md) distinguish reused sampled effects, pre-existing synthesized voice files, and original new synthesis.

## Automated checks

Baseline build plus player, VR, mission, weapons, map and AI checks passed before edits. Production build and **all seven test commands below pass**, as does `git diff --check`: [full final check log](evidence/final-checks.log), [final review-fix build and polish checks](evidence/final-fix-checks.log). The pre-existing Vite shared Three.js chunk warning remains (approximately 727 kB minified); it is not a build failure.

Run:

```sh
npm run build
npm run test:player
npm run test:vr
npm run test:mission
npm run test:weapons
npm run test:map
npm run test:ai
npm run test:polish
```

The polish suite covers scope/FOV ownership and all cancellation paths, sniper ammunition/cover, damage thresholds, movement/firing separation, missed shots, hidden-target independence, stationary snipers, repeated regional reactions, exact enemy world impacts, audio startup/voice pacing/disposal, and bounded effect origins/reset. The existing AI suite also simulates 280 seconds on the actual map; every patrol/reserve completed its route with zero failed paths after this change.

## Runtime and independent review

Three specialists implemented bounded AI, weapon and audio packages. Handoffs: [AI](AI-HANDOFF.md), [weapons](WEAPON-HANDOFF.md), [audio](AUDIO-HANDOFF.md). The audio specialist independently reviews AI/weapons, the weapon specialist independently reviews audio/runtime/HUD/world, and the AI specialist checks unchanged lab/exploration plus performance. Review results are evidence from the running app, separate from implementation summaries.

Both independent combat and integration reviews signed off with **no unresolved critical or major defects in the exercised scope**. All review browser sessions were closed after capturing evidence.

- [Independent combat review](COMBAT-REVIEW.md): visual poses, scope, region reactions and enemy firing.
- [Independent integration review](INTEGRATION-REVIEW.md): health/recovery, audio lifecycle, houses, effects.
- [Lab, exploration and performance](LAB-PERFORMANCE.md): compatibility and busy encounter measurement.

Review caught a major camera lifecycle defect: constructing weapons before walk-camera setup captured overview FOV38 and cropped the hands. Scope now borrows the current FOV only on entering zoom and restores it only on exiting; ordinary updates leave camera ownership intact. A regression exercises construction38 → walk75 → scope → exit75 → inspection38. The same independent reviewer confirmed corrected75° gameplay and visible hands. A health/status overlap and scoped-ammo contrast were also corrected.

Independent combat review also found that restoring a dead actor to a living checkpoint left its gun hidden. Restore now explicitly restores gun visibility and clears stale flash, recoil, reaction and aiming state. The same reviewer reloaded the app and checked guard, combat and patrol restores. Both actual tower actors acquired a visible target and fired after about 3.75 seconds, with no movement during their 12-second test. Patrol/hearing/search observation returned to routine without firing at an unseen player; measured movement stayed aligned with facing.

## Playthrough evidence

The first integrated northern run completed all objectives and extraction using only keyboard/mouse/F interactions, ending at health36 with8 kills,48 shots and0 deaths. It exposed the camera issue and remains diagnostic evidence: [log](evidence/northern-playthrough.json), [debrief](evidence/northern-complete.png). Route traversal itself took185.8 seconds; the mission timer includes74 seconds idle before starting the harness.

A corrected-camera repeat completed in **186.76 active seconds**, with **68 health, 8 kills, 48 shots and 0 deaths**: [complete input log and state](evidence/northern-final.json), [debrief screenshot](evidence/northern-final.png), [zero browser errors](evidence/northern-final-errors.json). The later actor-restore and distant-shot-audibility fixes received focused rechecks; those do not change this route's movement/objective pipeline. The input harness reads diagnostics to aim and follow known waypoints, but does not teleport, change health/ammo, bypass collision, call mission objectives directly, or accelerate clocks. Reproduce on a development page after clicking Begin using `agent-browser eval --stdin < scripts/play-mission-inputs.js`, then `... < scripts/play-northern-route.js`. These are informed automated runs, not first-time human playtests.

Representative visual evidence: [pistol hands](evidence/combat/1440-pistol-idle.png), [rifle reload](evidence/combat/1440-ak-reload-80.png), [scope and readable ammo](evidence/review-scope-hud-final.png), [regional leg impact](evidence/combat/hit-thigh-L.png), [populated relay interior](evidence/review-relay-interior.png), [health HUD](evidence/review-health-final.png). Weapon review uses actual first-person renders at 1440×900 and 1024×768, including multiple phases of every reload.

[Continuous weapon animation recording](evidence/combat/weapon-motion-final.webm) captures all four weapons through idle, aiming, firing, full reload and switching at 1280×720. Regional-hit screenshots were refreshed after the gun-restore fix; the attached rifle remains visible during the limb reactions.

The production smoke test uses normal Begin/canvas click/R/Escape: ammo12/36 →11/36 →12/35, health100, pause visible, no development debug surface and no page errors. [Result](evidence/production-smoke.json), [errors](evidence/production-errors.json), [gameplay](evidence/production-play.png).

## Compatibility and performance

The unchanged lab passes all **278 existing browser checks**: 62 gun, 88 pose, 52 dropped-gun and 76 scenario checks. Original exploration starts, moves 2.95 m during a 1.4-second W input, and pauses without drift. Details and evidence are in [LAB-PERFORMANCE.md](LAB-PERFORMANCE.md).

At 1440×900, renderer pixel ratio 1.5, Apple M4 Max, HeadlessChrome 147 / ANGLE Metal, an explicitly staged encounter with **18 active actors, 2–3 in combat and 4–6 investigating/searching** measured **94.1 fps mean**, **16.7 ms p95**, and **50 ms maximum** across 754 frames over 8 seconds after a 2-second warmup. Three frames exceeded 33.34 ms; none exceeded 50 ms. Navigation averaged 2.28 ms, p95 3.30 ms, max 3.60 ms. Approximately 1,380 draw calls / 552k triangles, 24 actual enemy rounds. Player health was held at 100 solely to keep the performance sample alive; this is separate from normal playthrough evidence. [Raw measurements](evidence/performance-staged-encounter.json), [live encounter](evidence/performance-encounter-live.png).

This supports acceptable performance on the tested host, not a guarantee for integrated GPUs, mobile browsers or headsets.

## Test routes and limitations

Manual sniper: enter through mess roof/stairs, reach maintenance shelter in the east annex, pick up the rifle beside field supplies with F, hold right mouse to scope, fire, reload, release aim, switch slots, pause/resume and retry. Tower marksmen also drop their rifles. Use houses and tower tanks as real cover; guards can open house doors. Health recovers through the finite dressing supply or checkpoint/restart rules, not automatic regeneration.

Staged camera/inventory/target fixtures are used for isolated visual and lifecycle cases; they are not claimed as input-only traversal. Automated audio evidence establishes decoded samples, source timing, spatial setup and cleanup. Subjective mix, voice naturalness, first-time pacing and enjoyment still need human listening/playtesting. Foot placement uses authored in-place animation with speed-matched cadence, without foot IK. No physical headset or mobile hardware was tested.
