# Independent mission/runtime review

Reviewer implemented the mission map, but did **not** implement mission state, runtime orchestration, HUD, audio, weapons, or AI. This is an independent review of those integration contracts. Map clearance findings are explicitly self-verification rather than an independent map review.

Scope: `mission.ts`, `runtime.ts`, `hud.ts`, `audio.ts`, relevant `main.ts`, controller/actions integration, and weapon input/restore behavior. Review date: 2026-09-17. No unresolved critical or major defect was found in the contracts checked below after fixes. This statement does not establish full mission completion, subjective quality, or first-time pacing.

## Reproducible findings and fixes

| ID | Severity | Reproduction / expected | Observed before fix | Resolution and focused verification |
| --- | --- | --- | --- | --- |
| MR-01 | Major | Emit an enemy callout beyond its audible radius. It must not produce globally audible speech. | Instrumented agent-browser test placed a callout 1,731 m from the listener with radius 30; `speechSynthesis.speak` still received it at volume 0.231. Caption distance filtering worked, but speech did not. | Coordinator added runtime and audio-layer distance gates and voice attenuation. Repeated runtime and direct-audio tests produced **no** remote speech; a nearby control callout still spoke. |
| MR-02 | Minor | Use an unrelated objective, then STOP. Semaphore should retain its authored green angle until STOP and then become horizontal. | Authored green angle was -π/4; first objective snapped it to 0, and STOP set π/2. | Coordinator aligned state sync with the map contract. Browser readings: initial -0.785398; after release -0.785398; STOP 0. |
| MR-03 | Moderate | Activate a reachable ordinary objective after the new sound-radius filter. A local success cue should play. | Runtime ordinary objectives had radius 0, so the newly correct range gate suppressed release/brake/radio/supply/extraction sounds. | Coordinator changed objective radius to 6. At the relay, the real `PlayerActions` selector and activation succeeded; audio received exactly one `{kind:'objective', radius:6}` event and scheduled a source. |
| MR-04 | Major navigation defect | Follow the southern approach through the original open inner gate and around the gatehouse. The connection must be traversable. | Complete route test stopped at approximately `(-12.14,16.61)`: east-opening gate leaves sealed the narrow gap beside the gatehouse. Original shorter gap tests had not exposed the whole-route problem. | With coordinator authorization, map preparation flips only this gate to open west. Full southern capsule route passes. Legacy `createCompound()` without the mission preparation hook is unchanged. |
| MR-05 | Moderate navigation guidance | Follow the briefing's route lines. Both should reflect usable initial access and avoid closed fences/buildings. | The service line left insertion directly through the closed north service fence and crossed equipment sheds. | With coordinator authorization, HUD routes now share the mess-hall roof/hall entry, then branch. Source text explicitly explains that sequence. Complete north and south ground routes now pass collision traversal tests. |
| MR-06 | Minor, fixed after review | Drop a pistol, look toward it with forward dot product 0.32, then use the displayed pickup prompt. A displayed valid action should activate. | Browser test displayed `Pick up Pistol · 12 / 36`, but `PlayerActions.activate()` returned false and held weapon remained `Empty hands`. General selection accepts dot ≥0.25; weapon pickup required ≥0.40. | Weapon owner aligned activation with the selector at 0.25. New regression rejects 0.24 and accepts 0.32 through the real interaction selector. All nine weapon groups pass. This post-review fix was verified by the focused regression and source inspection, not a second independent browser boundary test. |

## Repeatable automated evidence

```sh
node scripts/check-player.mjs scripts/mission-checks.ts
node scripts/check-player.mjs scripts/map-checks.ts
npx tsc --noEmit
```

Results at review: **14 mission checks passed; 52 map checks passed; TypeScript passed.**

The mission suite covers both objective orderings with radio intact/isolated, missing prerequisites, idempotent controls, no kill requirement, exactly-once delayed complication, late radio rejection, finite medical supplies, bell cooldown, death/completion freezing, cloned checkpoint state, and real interaction distance/occlusion revalidation.

The map suite uses actual `CollisionWorld`, `PlayerBody`, and `PlayerActions`. It covers seven station standing/visibility positions; fourteen enemy starts; all ten ordinary patrol loops; four traversable interiors and their closed doors; both annex connections; platform stairs; reserve route; actual ladder climbing/descent; outer boundaries; and full north/south routes from the mess-yard exit. It does not execute the AI decision loop or combat.

## Browser integration evidence

Used the user-requested **agent-browser**, isolated session `mission-verifier`, against `http://127.0.0.1:5173`. Browser: HeadlessChrome 147, macOS user agent, WebGL 2, viewport **1280×577**, device-pixel ratio 1. [Reviewed briefing screenshot](evidence/mission-review-briefing.png). The lower settings area is scrollable at this short viewport. No page errors were reported after the integration checks.

Normal-input smoke check: Begin mission → canvas click/fire → R → Escape. Result: one shot, ammunition 11/36, reload canceled without moving reserve ammunition, paused panel visible, `playing=false`. Audio unlocked to `running` after the normal Start click.

Thirteen additional **instrumented development-surface checks** passed:

1. Lethal damage pauses play and cancels input.
2. Retry restores the complete mission state.
3. Retry restores inventory and loose pickups without ammunition changes.
4. Retry restores door states.
5. Retry restores enemy snapshot data.
6. Retry restores player position and orientation.
7. Repeated retry creates no duplicate weapon IDs.
8. Paused update leaves the mission clock unchanged.
9. Full restart exactly restores the captured initial snapshot.
10. Radio intact: no reserve leaves during the first eleven seconds.
11. Radio intact: exactly four reserves activate, with one activation call.
12. Radio isolated: no reserve leaves during the first eleven seconds.
13. Radio isolated: exactly two reserves activate, with one activation call.

These checks called development methods and staged state/positions where needed. They are **not** full normal-input playthroughs, do not prove that the player can complete either route under combat, and provide no 15–30-minute pacing evidence. The lead and AI verifier own separate fresh normal-input route runs. Checkpoint restoration equality was verified; fairness of saving under combat requires playtest evidence.

## Route data for playthroughs

The checked ground routes start after the common mess-hall roof → stairs → hall → south-yard exit:

```text
North, X/Z:
(-34,-34) → (-20,-29) → (17,-28) → (25,-34.2)
→ (97,-34.2) → (103,-34.2) → (107,-35) → (142,-35)

South, X/Z:
(-34,-34) → (-50,-30) → (-50,4) → (-20,4)
→ (-20,20.1) → (-11.75,20.1) → (-11.75,14)
→ (0,13) → (55,16) → (99,11) → (117,-9)
```

Relay south door: `(117,-11.965)`; release standing point approximately `(119.2,-18.4)`, looking east. For the exposed brake, approach from `(138,-36.8)` to `(142,-36.8)`, keeping north of the lever. Dispatch south door: `(146,-40.465)`; console standing point approximately `(147.5,-45.8)`, looking east. Return to insertion by reversing the mess-hall interior stairs/roof route and descending the west ladder. The original service enclosure fence blocks a direct ground shortcut around the west wall.
