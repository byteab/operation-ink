# Combat/inventory review and character rendering self-check

Independent reviewer: the AI/navigation implementer reviewed weapons, runtime inputs and checkpoint behavior implemented by other agents. AI appearance and navigation performance below are explicitly **self-checks**, not independent reviews. Browser: isolated `ai-verifier` agent-browser session, local Vite `http://localhost:5173`, HeadlessChrome 147 on macOS / Apple M4 Max. No source edits were made during weapon review. A separately authorized AI performance fix is recorded below.

## Normal-input weapon/runtime checks

These checks used Begin/Resume/Retry buttons, keyboard events and pointer events. Diagnostics were read without calling weapon methods or editing inventory, health, objectives, player transforms or clocks. Initial viewport 1280×577.

| Check | Observed result |
| --- | --- |
| Hold pistol trigger for 650 ms | Exactly one shot; 12→11 rounds. Semiautomatic behavior retained. |
| R while standing | Reload starts, player position unchanged; no exploration respawn. |
| Pause 500 ms into reload, wait 2.1 s | Reload canceled; 11/36 unchanged; mission clock frozen. |
| Resume, complete reload | 12/35; exactly one reserve round transferred. |
| Hold/release right button | Aim eased to 0.988 within 350 ms, then returned toward zero. |
| 2 then 1 | Empty slot then pistol; first-person mode and position retained; no inspection bookmark. |
| G drop, look down, F pickup | Same `player-pistol` identity and 12/35 ammo returned to inventory; ground instance removed. |
| Repeat F ten times after pickup | No additional item or ammunition. |
| Walk into actual mess-hall exterior with W, fire | `blocked=true`; 12 rounds and one prior shot unchanged. HUD says “Weapon obstructed · step back”; held weapon lowers below the wall. [Screenshot](evidence/combat-wall.png). |
| Drop pistol again, Escape, click Retry checkpoint | Initial pistol 12/36, only initial maintenance-SMG pickup, all enemies at 70 health/initial positions, mission elapsed 0/health 100, paused at insertion. No duplicate dropped pistol. |

Raw evidence: [combat-inputs.json](evidence/combat-inputs.json).

## Defect found and reverified

**Major, fixed: fast clicks could disappear between render frames.** A pointerdown followed by pointerup before the next rendered update produced zero shots/ammo use while active and unobstructed. Release cleared the queued press. This also prevented the normal-input combat harness from firing. The weapons owner changed release to clear only held state; cancel still removes pending actions. After explicit page reload, the same event pair produced exactly one shot, 12→11 rounds, with no second shot after another 300 ms. [Independent re-test](evidence/combat-fast-click-retest.json).

No unresolved critical/major weapon/runtime defect was found in the listed checks. This is scoped evidence, not an assertion that every possible viewport/action combination was exercised.

## Actual character rendering — AI self-check

Explicit debug staging relocated the player/camera solely to inspect real loaded actors; these captures are **not playthrough evidence**. At 1440×900, actual animated black characters remain readable outdoors and inside the relay house. The body remains uniformly solid black, while weapons retain restrained material colors. No white body, lighting gradient, gloss or reflection is visible. Door/furniture occlusion remains intact. Diagnostics for all 14 actors confirmed independent SkinnedMesh bodies, MeshBasicMaterial color `000000`, depthTest/depthWrite true.

- [Outdoor water-tower patrol](evidence/actors-outdoor.png).
- [Relay-house interior and doorway](evidence/actors-interior.png).

## Actual rendering performance — AI self-check

The initial live outdoor measurement found a visible **826.4 ms hitch** during distant radio-linked investigation planning. Lead authorized fixing AI/navigation; resumable generators now spread swept direct-line tests and A* work across frames using a shared 3 ms target. Saved pending requests restart from checkpoint safely. This was not fixed by disabling distant pursuit or weakening collision.

Same outdoor staging after the fix: 1440×900, DPR 1, renderer 1.5×, ANGLE Metal / Apple M4 Max. **671/671 frames remained in active gameplay** during 6.001 s; mean 111.8 fps, p95 10.5 ms, maximum 15.2 ms. Navigation's largest cold slice was 8.4 ms. Scene: 1,228 draw calls, 450,209 triangles, 10 routine NPCs with concurrent combat/investigation plus 4 dormant reserves. Health was not edited and ended at 74. This clears a 60 fps target on this measured machine; it does not establish performance on slower hardware.

[Before JSON](evidence/performance-outdoor.json), [after JSON](evidence/performance-outdoor-after.json). A first attempted sample was discarded because the player had died before its measurement ended; it is not presented as frame-rate evidence.

## Full southern route

**Completed from a fresh reload through extraction on the final navigation/weapon source.** This run used only Begin/Resume UI plus mouse, keyboard and F inputs through `scripts/play-mission-inputs.js`. No teleport, direct mission action call, health/inventory edit, clock acceleration, collision bypass or debug state mutation occurred during the run. The automated harness reads diagnostic positions to choose known waypoints and aim at visible enemies; it is an informed automation run, not human first-time playtesting.

Route: north insertion → west mess-hall ladder → roof doorway/stairs → dining-hall yard exit → west service lane → inner gate → loading court → east workshop/service gate → relay house release → rail brake via the wagon's east side → dispatch STOP → reverse relay/service route → mess-hall interior/stairs/roof → ladder down → north extraction. Radio remained intact. The expected four-reserve detail activated after STOP and physically left the crew house. Extraction succeeded while enemies remained alive.

Final recorded state: **complete, 288.779 seconds active time (4:48), 87 health, 8 enemies defeated, 25 shots, zero deaths**. Release and brake were both true before STOP. No retries or restarts occurred during this run. The displayed debrief matched the recorded elapsed time/kills/deaths.

One harness route needed a normal movement correction: the straight reverse diagonal from relay exit toward `(99,11)` contacted the open northern service-gate leaf at `(99.86,7.92)` and hit the 45-second waypoint timeout. Walking via `(105,7) → (105,11) → (99,11)` cleared the leaf. This was a visible physical obstacle with a working walk-around, not an inaccessible objective or softlock. The timer includes that timeout and time spent entering the corrected route; it should not be read as pure traversal speed.

Evidence: [full final input log and mission state](evidence/south-completion.json), [actual extraction debrief screenshot](evidence/south-completion.png), [infiltration/release leg](evidence/south-leg1.json), [brake/STOP/withdrawal and reserve evidence](evidence/south-leg2.json).

The optimized, automated 4:48 run **does not establish the 15–30-minute first-time target**. First-time pacing and subjective enjoyment remain provisional pending human playtesting. No remaining critical/major defect was observed in the reviewed weapon/runtime scenarios or this completed route. The explicit AI implementation limitations remain documented in [AI-HANDOFF.md](AI-HANDOFF.md); this review does not claim a human assessment of the sound mix.
