# Hostage Rescue Verification

Current single-hostage model, chair animation and Willys jeep checks are in [Single-Hostage Revision](REVISION-SINGLE-HOSTAGE.md). The four-hostage runs below document the original implementation and are retained as historical evidence.

## Input-driven fresh-start completion

Headless agent-browser completed the northern combat route from the normal insertion checkpoint using only keyboard and mouse events. The run used the starter AK, collected the existing maintenance dressing, disabled cameras in security, opened the exit gate, descended the physical staircase, released all four hostages, led them out and waited for automatic boarding, then used the jeep.

- Result: mission complete, four loaded passengers, jeep outside the gate at `[175, 0.05, 11]`.
- Active time: 213.07 seconds, health 100, 28 enemies defeated, 82 shots, zero deaths on the successful run.
- Nine original guards and all four inactive reserves remained alive. Completion has no kill quota.
- Passenger positions remained attached outside the compound at X 174.5 / 175.9.
- No teleportation, invulnerability, enemy deletion, direct objective mutations or clock acceleration were used on this run.
- An earlier pistol-only combat attempt died inside the mess hall; normal restart restored insertion and the successful run switched to the starter AK.

Evidence: [full input log and final state](evidence/input-completion.json), [completion screenshot](evidence/input-completion.png). Reusable harness: `scripts/rescue-input-run.js`; route: `scripts/rescue-combat-route.js`. The scripted route fires with automated aim and does not establish human difficulty or expected first-play completion time.

## Stealth-oriented service completion

A second fresh-start input-only run completed through the new western service entrance and covered southern lanes. The western perimeter initially passed without combat. The runner then used defensive fire only against guards who acquired the player, disabled cameras, prepared the gate, released and escorted all four hostages, and escaped.

- Result: complete at 307.19 active seconds, health 68, 23 enemies defeated, 83 shots, zero camera detections and zero reserve activations.
- All four hostages loaded, cameras disabled, gate open, jeep escaped; no gameplay state edits, teleportation, invulnerability or clock acceleration.
- The route includes a normal Space jump over the raised railway-platform edge at approximately `[106.5, -23.9]`, plus normal pause/resume between automation segments.
- This proves a second playable route that avoids the compound alarm. It is not a pacifist or fully undetected run: ordinary guards still acquired and fought the player. Human stealth balance and patrol-timing opportunities need further playtesting.

Evidence: [service completion and input log](evidence/stealth-complete.json), [service completion screenshot](evidence/stealth-complete.png); replay route: `scripts/rescue-stealth-route.js`.

Earlier no-fire attempts died in the mess hall and loading court. Those observations led to making the existing western service gate usable so players can bypass the occupied mess hall. A development reload interrupted another attempt; it is not counted as a completion. The reported successful run was repeated with source files frozen.

## Independent diagnostic browser checks

The escort specialist reviewed systems authored by the other agents and independently checked the rendered application. These checks deliberately staged locations and some mission conditions to isolate behaviors; they are not represented as fresh-start playthroughs.

- Four release interactions succeeded at real nearby control points.
- The actual camera cone, sustained detection and world visibility triggered an alarm and two responders.
- Real computer, alarm-panel and gate interactions disabled surveillance, silenced the alarm and opened the gate.
- Loaded passengers remained attached throughout a real runtime departure and after completion.
- Retry restored all captive statuses and locked doors, four reserves, active green cameras, inactive alarm, closed gate, initial jeep placement, 100 health and player movement.
- Desktop 1440x900 and mobile 390x844 rendered without horizontal overflow; the briefing remains scrollable. Mobile canvas samples contained 194 distinct colors. A mobile ammo contrast finding was fixed with an opaque pale backing.
- No browser errors were reported.

The final production build was checked separately at 1440x1000 and 390x844. It loads successfully, has no `window.__environment` debug surface, displays the corrected detention footprint and unclipped gate label, and reports no browser errors or horizontal overflow. Mobile canvas readback found 670 distinct colors; the ammunition panel has the expected pale background. See [production desktop](evidence/production-desktop.png) and [production mobile gameplay](evidence/production-mobile-gameplay.png).

See [independent review and screenshot inventory](REVIEW.md). Key captures: [cells](evidence/review-cells-captive.png), [released hostage](evidence/review-hostage-released.png), [alarm](evidence/review-camera-alarm.png), [disabled camera](evidence/review-camera-disabled.png), [four aboard](evidence/review-four-aboard.png), [extracted passengers](evidence/review-extracted-passengers.png).

## Automated checks

`npm run build` passes TypeScript and production bundling. Vite retains the existing warning about the large shared Three.js chunk.

`npm run test:rescue` passes 24 checks: mission ordering and prerequisites, premature/repeated actions, death and reset, actual player stair/cell/escort traversal, the new service-gate interaction and route, closed/open exit behavior, full vehicle clearance, hostage movement and recovery, geometric camera detection, capped staged response and actual barracks egress.

Existing player, VR, weapon, map, AI, gameplay polish and combat expansion suites pass. The obsolete relay-house fixtures now describe the detention entrance and basement. `git diff --check` passes.

## Running

Run `npm install` if dependencies are missing, then `npm run dev`. Open the URL Vite prints and choose Begin mission. Run `npm run test:rescue` for the focused checks and `npm run build` for the production build.

For browser automation, open the app in a headless agent-browser session, set a desktop viewport, start a fresh mission through its UI, then load `scripts/rescue-input-run.js` and `scripts/rescue-combat-route.js` using `eval --stdin`. Diagnostics use the development-only `window.__environment` surface, which is absent from production.

## Deliberate simplifications

Hostages are protected noncombatants with authored, collision-checked route following and a brief gunfire hold. They do not have general-purpose squad navigation or health. The jeep is a scripted extraction ride, not a driving simulator. Retry uses insertion only. Camera sightings drive compound alarms; ordinary guard detection retains the existing local radio/combat behavior. Four preallocated reserve actors activate inside barracks, without endless generation.

Mobile verification covers layout and rendering; the game retains its existing keyboard/mouse controls. Human balance and long-session playtesting remain useful, particularly patrol timing on a low-combat approach.
