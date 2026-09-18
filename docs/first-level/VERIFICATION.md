# First-level verification

Date: 2026-09-17. Last Green Light was implemented, reviewed and exercised through extraction on both routes. All browser work used the user-requested **agent-browser 0.27.0**. No known critical or major defect remains in the exercised scope. This report distinguishes normal-input runs, instrumented checks, visual inspection and unverified human judgments.

## Build and regression results

| Check | Result |
|---|---|
| `npm run build` | TypeScript and Vite production build passed |
| `npm run test:player` | 13 existing movement/collision/door/ladder checks passed |
| `npm run test:vr` | 4 existing input/pose/ladder groups passed |
| `npm run test:mission` | 14 checks passed |
| `npm run test:weapons` | 9 groups passed |
| `npm run test:map` | 52 checks passed using actual collision and player bodies |
| `npm run test:ai` | 8 groups passed, including 280 seconds of all-guard simulation |
| Existing four lab suites | 278 checks passed in the browser; [suite results](LAB-VERIFICATION.md) |
| `git diff --check` | Passed |

Vite reports a large shared Three.js chunk, approximately 727 kB minified / 187 kB gzip. The build succeeds; no bundle-size exemption was added. AI animation clips remain dynamically imported.

The production preview at `127.0.0.1:4173` was also tested: normal Begin mission click, one shot, full reload (12/36 → 11/36 → 12/35), and Escape pause. The production development surface is absent. Original exploration starts/pauses at `/?explore=1`; `/lab.html` loads its controls and equips/aims the AK. No page errors were recorded. [Rendered production pause](evidence/production-pause.png), [production browser errors](evidence/production-browser-errors.json). Development runs used `127.0.0.1:5173` / `localhost:5173`.

## Complete normal-input routes

Each final run began with a fresh page and used only the Begin/Resume interface, keyboard, mouse and contextual F actions. No teleporting, direct objective methods, health/ammo edits, accelerated clocks or collision bypass occurred during either run. The harness reads diagnostic positions to follow known waypoints and aim accurately at visible enemies. These are informed automated playthroughs, not blind human runs.

| Run | Route / objective order | Result | Active time | Health / kills / shots / deaths |
|---|---|---|---|---|
| Northern final-source repeat | Common roof/stairs entry → tower radio → railway → brake → relay release → dispatch STOP → reverse route → extraction | Complete; two reserves activated, two remained dormant | 176.441 s / 2:56 | 100 / 7 / 22 / 0 |
| Southern final-source run | Common roof/stairs entry → west service lane → inner gate → loading/workshop → relay release → brake → dispatch STOP → reverse service route → extraction | Complete; radio intact, all four reserves emerged | 288.779 s / 4:48 | 87 / 8 / 25 / 0 |

Neither run required killing everyone. Required objectives were completed through real range/facing/occlusion-checked prompts. Both withdrew via the hall, roof and west ladder. The northern route also passed once before its final-source repeat.

Evidence: [northern full input log/state](evidence/northern-playthrough-final.json), [northern debrief](evidence/northern-complete-final.png), [southern full log/state](evidence/south-completion.json), [southern debrief](evidence/south-completion.png). Browser CLI JSON wraps the result in `data.result`; some earlier diagnostic artifacts contain a further serialized JSON string.

The southern timer includes a 45-second automation waypoint timeout at an open service-gate leaf. Normal walking via `(105,7) → (105,11) → (99,11)` resolved it, with no reset or state edit. The direct diagonal was obstructed; the intended opening remained passable. See [combat review](COMBAT-REVIEW.md) for the complete account.

Reproduce northern automation on a development build by opening the mission with agent-browser, clicking Begin, then evaluating `scripts/play-mission-inputs.js` and `scripts/play-northern-route.js` with `eval --stdin`. The scripts dispatch input; the development diagnostics only supply read-only steering information. Manual play does not require this harness.

Earlier attempts exposed a fast-click defect, a harness that aimed from an unobstructed camera while its muzzle remained behind cover, and an exposed pause between route segments. Those attempts are diagnostic evidence, not passing runs. Fast clicks were fixed and independently rechecked; muzzle cover behavior was correct, so the harness learned to respect it.

## State, AI and interaction checks

The independent [mission/runtime review](MISSION-REVIEW.md) includes 13 instrumented browser checks of death, retry, door/enemy/player/gear restoration, exactly-once IDs, full restart, paused clocks and two/four reserves after the twelve-second horn. These stage development state to exercise edge cases; they are separate from the complete input-only runs. Mission tests cover either interlock order, optional radio timing, missing prerequisites, finite supplies, bell cooldown, and immutable dead/complete states.

AI regression tests exercise real FOV/range, solid occlusion, damped obstructed hearing, bounded communication, delayed detection, last-known investigation/search/return, world-clipped bullets, three-hit deaths and one weapon drop. Every patrol and reserve route completed in a 280-second actual-map simulation with zero failed paths. It uses fake render actors to isolate navigation; browser checks separately loaded and inspected the real animated rigs. Saved pending navigation jobs were tested after restore so later paths cannot leak into earlier checkpoints.

The independent [weapon/runtime review](COMBAT-REVIEW.md) checks semiautomatic fire, interrupted reload, pause, aim, weapon slots, drop/F pickup, duplicate input, real-wall obstruction and retry. Numerical weapon checks also cover swap/ammo conservation, fixed limb lengths and pickup-facing boundaries. Map checks cover all new interiors, fourteen enemy starts, objective standing positions, northern/southern routes, stair/ladder traversal and outer boundaries.

Reproducible review defects were corrected and checked: globally audible speech, silent objective cues after radius filtering, semaphore angle, blocked southern gate, route-map mismatch, disappearing fast clicks, pickup-facing mismatch and navigation frame stalls. Independent review scope and any self-checks are labeled in each report.

## Visual and sound evidence

Actual browser images were inspected, including black animated characters [outdoors](evidence/actors-outdoor.png) and [inside the relay house](evidence/actors-interior.png). Their bodies use solid black unlit, depth-tested materials. Weapon/actor captures use explicit staging for pose inspection and are not traversal evidence.

First-person idle/aim/fire/reload and weapon transitions were checked at **1440×900** and **1024×768**. Representative final captures: [pistol idle](evidence/weapon-pistol-idle-1440.png), [pistol reload](evidence/weapon-pistol-reload-1024.png), [rifle aim](evidence/weapon-ak-aim-1440.png), [rifle reload](evidence/weapon-ak-reload-1024.png), [SMG](evidence/weapon-smg-idle-1024.png), [wall obstruction](evidence/weapon-wall-blocked-1024.png). The review prompted tighter pistol support-hand geometry and improved rifle fore-end/aim contact. The briefing was checked at the shorter **1280×577** viewport and scrolls to its settings. Older `insertion.png` and `briefing.png` are retained diagnostics, not the final pose/map references.

Normal browser Begin clicks unlock a running AudioContext. Instrumented checks establish nearby objective audio, suppression of out-of-range speech, pause/reset cleanup and spatial configuration. Sound is original procedural synthesis with optional local browser speech; [provenance and behavior](AUDIO.md). Physical-speaker audibility, voice availability and subjective combat mixing have not been judged by a human listener.

## Measured performance

Environment: Apple M4 Max, macOS, HeadlessChrome 147, WebGL 2 / ANGLE Metal, viewport 1440×900, DPR 1, renderer pixel ratio 1.5. Target: 60 fps in representative active desktop gameplay.

A staged outdoor encounter with concurrent combat/investigation initially exposed an **826.4 ms** synchronous A* stall. Planning now runs as resumable jobs with a shared 3 ms/frame target. The same final scene measured **671 active frames over 6.001 seconds, 111.8 fps mean, 10.5 ms p95, 15.2 ms maximum**. Largest cold navigation slice: 8.4 ms. Rendering: 1,228 draw calls, 450,209 triangles, ten active routine guards and four dormant reserves. The player's health was not altered and remained 74. [Before](evidence/performance-outdoor.json), [after](evidence/performance-outdoor-after.json).

This short, staged sample clears the target on this host. It does not establish sustained frame rate on integrated GPUs, mobile browsers or headsets. Complete route runs additionally exercised activated reserves, but were not controlled performance benchmarks.

## Remaining limitations

- **15–30-minute first-time pacing and subjective enjoyment remain provisional.** Informed automation completed in roughly three to five minutes. No artificial waiting was added to inflate duration; human first-time tests are still needed to validate the design hypothesis.
- Enemy hitboxes are upright capsules, local tactical repositioning is simpler than a full cover planner, NPCs cannot climb ladders, and enemy reloads enforce ammo/timing without detailed magazine-hand choreography.
- Checkpoints last for the current page session. Browser speech is optional and nonspatial; paired synthesized cues and directional captions carry location.
- The existing experimental VR/exploration path and lab are preserved, but there was no physical-headset or mobile-device validation. Mission combat is designed for desktop keyboard/mouse.
- Evidence demonstrates the listed cases, not flawless behavior under every input sequence. No unresolved critical or major defect was observed in the final reviewed scope.
