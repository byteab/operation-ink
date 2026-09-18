# Lab, exploration, and performance verification

Verified through agent-browser **headless**, isolated session `polish-review-lab`, against the local Vite development server at `http://127.0.0.1:5173`. The verifier implemented the AI package earlier, so this record independently verifies the unrelated character lab and exploration compatibility only; AI behavior signoff belongs to the separate combat validator. No implementation was changed to make these compatibility tests pass.

## Compatibility results

All 278 existing browser lab checks passed on `/lab.html`:

| Existing script | Passing checks | Evidence |
| --- | ---: | --- |
| `scripts/check-lab-guns.js` | 62 | [Report](evidence/lab-guns.json) |
| `scripts/check-lab-gun-poses.js` | 88 | [Report](evidence/lab-gun-poses.json) |
| `scripts/check-lab-dropped-guns.js` | 52 | [Report](evidence/lab-dropped-guns.json) |
| `scripts/check-lab-scenarios.js` | 76 | [Report](evidence/lab-scenarios.json) |

These execute the existing lab models, real animation mixer, weapon mechanisms, support contact, normal locomotion carry, interruption and pause behavior. The pose suite took 13.5 seconds and checks every simulated frame of the relevant animations. The saved pose report omits its large per-check geometry metrics but retains every named passing assertion. [Lab screenshot](evidence/lab-after-checks.png) was visually inspected: the established silhouette, floor grid, and playback/action controls render normally. No application page errors were reported.

`/?explore=1` still starts from the actual **Start walking** button, contains no mission runtime, and moves through the normal keyboard handlers. Holding W for 1.4 seconds moved the player 2.95 m. Browser Escape displayed **Resume walk**; position remained unchanged during a subsequent 0.5-second pause. [Exact state evidence](evidence/lab-exploration.json), [paused screenshot](evidence/lab-exploration-paused.png). Keyboard hold used DOM keyboard events; start and Escape used browser input commands. This is a compatibility smoke check, not a full exploration-route replay.

## Busy encounter performance

Hardware: Apple M4 Max, 14 logical CPU cores, 36 GiB memory; macOS 26.3.1 (a), build 25D771280a. Browser: HeadlessChrome 147, WebGL 2 through ANGLE Metal on Apple M4 Max. Viewport 1440×900, browser DPR 1, game render pixel ratio 1.5 (2160×1350 internal target). This was a development build on a shared host while other validation sessions were available; it is not a controlled production benchmark or a low-end hardware claim.

The [reproducible staging script](evidence/performance-staged-encounter.js) teleports only the player to the outdoor water-tower yard `(8, floor, -43)`, activates the existing four-person reserve detail, and generates one loud disturbance. All 18 original animated actors remain active and use their real perception, navigation, animation, weapons, collision, audio and rendering. Player health is held at 100 during sampling solely to prevent death from ending the measurement. This is explicitly a staged stress sample, separate from the coordinator's input-only playthrough.

After a two-second warmup, the eight-second sample recorded 754 frames with 2–3 enemies in combat, 4–6 investigating/searching, and 24 actual enemy rounds across the encounter.

| Measurement | Result |
| --- | ---: |
| Mean FPS | 94.1 |
| Mean / p95 / max frame duration | 10.63 / 16.70 / 50.00 ms |
| Frames over 33.34 / 50 ms | 3 / 0 |
| Mean / p95 / max navigation duration | 2.28 / 3.30 / 3.60 ms |
| Mean draw calls / triangles | 1,380 / 551,639 |
| Resident geometries / textures | 2,360 / 36 |

[Full measurement](evidence/performance-staged-encounter.json), [live encounter screenshot](evidence/performance-encounter-live.png), [post-sample paused screenshot](evidence/performance-encounter-paused.png). The live screenshot was captured after measurement resumed, with normal damage again enabled; health 46 and the incoming-fire cue are therefore expected. It was visually inspected and shows the outdoor tower encounter, active enemy silhouette, weapon/hands and readable health/ammo HUD.

Observed performance supports smooth play on this test host: p95 is about one 60 Hz frame, with three isolated longer frames and no measured frame above 50 ms. The earlier approximately 112 FPS observation used different encounter conditions, so this report does not treat it as an equivalent before/after baseline. Draw-call cost remains substantial; this sample does not establish performance on integrated GPUs or mobile devices. No application page errors were reported after the encounter.

## Validator follow-ups handled during this work

The separate combat validator found that resurrected real actors kept invisible guns after a death. The implementation was corrected and checked on freshly loaded real GLB actors for `dead → guard`, `dead → combat`, and `dead → patrol`, including flash/recoil/reaction cleanup. [Implementer regression evidence](evidence/lab-actor-restore-implementation-regression.json) is explicitly not independent signoff; the combat validator independently rechecked it successfully.

The coordinator requested enemy missed-round surface sound/effect hooks, and the combat validator identified insufficient sniper report radius. Both narrow fixes were added: exact world-hit callbacks/sound on missed rounds, and 120 m sniper report radius. TypeScript plus eight focused AI regression cases pass. The final radius-only change followed the performance sample and does not change its measured non-sniper firing workload. Independent combat review owns final signoff on these changes.
