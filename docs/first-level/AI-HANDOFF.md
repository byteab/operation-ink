# AI, navigation and character handoff

Owner: AI/navigation specialist. Files: `src/game/ai.ts`, `src/game/actors.ts`, `src/game/navigation.ts`, `scripts/ai-checks.ts`. Shared contracts and existing lab files were not changed.

## Integrated API

`EnemyDirector(context: AIContext)` exposes the requested `init`, `update`, `hear`, `hit`, `activateReserves`, `snapshot`, `restore`, `dispose`, `enemies`, and `alertLevel`. `init()` must finish before play. Add static map geometry before constructing `CollisionWorld`; actors are added afterwards and explicitly carry `noCollision`.

An optional second constructor parameter injects an actor factory for deterministic Node simulation tests. Production defaults to actual GLB actors. The tests substitute rendering only: map collision, navigation, perception, state transitions, weapon timers, snapshots and damage/drop callbacks remain the production implementation.

Required collision APIs supplied by lead: `fits(capsule, ignored?: readonly Object3D[])`, `visible(from,to,ignoredRoot)`, `floor(...)`, and `rayDistance(origin,direction,range)`. Director `hit` receives a world-clipped maximum distance and chooses the nearest upright enemy capsule.

## Combat, damage and search update (2026-09-17)

- Hits use animated per-limb capsules (`hit-reactions.ts`): head ×3, torso ×1, arm ×0.55, leg ×0.6 damage. Non-lethal hits play zone flinches (left limbs mirrored), lethal hits choose dieHead/dieBody/dieArm/dieLeg or dieBack from behind; the chosen clip is checkpointed. Arm wounds lower accuracy, leg wounds slow movement. `MissionBlood` sprays droplets and leaves floor stains; lethal stains spread into pools.
- Combat borrows the dive/Yuka structure (hunt → dodge/charge) and adds cover: guards score walkable points hidden from the player's eye, run there, peek out to fire, flank when an ally is already engaging, charge when close, strafe when nothing hides them and retreat at low health. Automatics fire 4–5 round bursts, pistols double taps; accuracy improves with uninterrupted aim time and drops when moving or wounded. Losing sight triggers 1.4 s of harmless blind fire at the last contact.
- Search walks up to three points around the last contact (corners first, allies fan out) instead of turning in place. Witnesses of a kill go to the shooter's position. Guards that overlap are pushed apart softly, so crossing routes never deadlock.

## Rules implemented

- Fourteen separately loaded lab skeletons: ten routine guards and four dormant reserves. Materials are isolated MeshBasicMaterial clones with exact black (`0x000000`), original dual-quaternion callback, depth testing and no tone mapping. Grey outline shell is hidden; lab materials remain unchanged. Every actor uses its own mixer and skeleton.
- Animation imports follow the initial GLB load so lab rest-pose initialization is valid. Idle, walk, look-around and body death clips are reused. Gun geometry is the actual pistol/AK/SMG builder. Lab hold solving and grip transforms mount the gun in the right fist, with analytic support-hand correction and unchanged arm lengths. Brief muzzle flashes accompany accepted enemy shots.
- Patrols walk at 1.4 m/s with 1.3–3.5 second observation pauses. Guards investigate at 1.9 m/s. Rotation is bounded, providing visible turn/reaction time. The two water-tower routes oppose one another; relay/crew routes cross real interior doors.
- Vision: horizontal 110° cone, 36 m routine range / 43 m combat range, maximum 13 m vertical difference; real solid geometry must expose eye or torso. Sight checks are staggered at 0.14 seconds. Only successful sight checks update last-known position; cached visibility cannot track a hidden player.
- Suspicion rises over approximately 0.63 seconds at <9 m, 1.05 seconds at <22 m, and 1.54 seconds at longer range. Initial suspicion has a distinct caption/callout. Confirmed contact starts an additional 0.85–1.15 second firing windup.
- Losing sight for 0.6 seconds enters investigation of the last-known position. Reaching it, or 11 seconds without reaching it, begins an eight-second local search. Search expires and the guard returns to its route/post. Seeing the player again follows the same suspicion/reaction rules.
- Hearing uses the event's gameplay radius; solid obstruction reduces that radius to 42%. Sounds supply a location to investigate, never confirmed sight. All `enemy-*`, callout, ambience and door events are excluded from fanout hearing to avoid self-alert recursion. Audible player movement, gunshots and the distraction bell should be emitted by runtime with appropriate radii.
- Communication is bounded: local clear-line callout range 20 m when radio is disabled; radio range 58 m when enabled. Allies investigate the last transmitted position and need their own sight to enter combat. Communication cooldown is seven seconds.
- Enemy shots require a fresh cone, aim alignment within 12°, muzzle-to-target LOS and no friendly capsule in the shot line. Cadence is 1.15–1.65 seconds; accuracy drops with distance and player movement. Pistol damage is 10; rifle damage 13. Twelve/thirty-round magazines require 1.9/2.4 second reload windows. Nearby safe sidesteps and closing to <27 m provide bounded repositioning; guards do not select abstract cover scores.
- Every guard has 70 health. Three 34-damage pistol body hits defeat one. Death plays the lab animation and emits exactly one dropped weapon using the guard's current magazine plus 12 pistol / 30 rifle reserve rounds. Saved `dropped` state prevents duplicate creation on restore.
- Radio state chooses two/four reserves. They leave the crew house along authored doors/corridors, then occupy different collision-checked dispatch investigation positions to avoid crowding a single console. After searching they guard these new inspection posts. No teleport is used.

## Navigation and performance boundaries

Shared 0.8 m A* grid, at most 2,200 explored cells per planning request, bounded local search box and resumable planning jobs with a shared 3 ms/frame target. Direct-line swept tests, nearest-node searches, A* and path simplification yield between small units of work; the director services pending actors round-robin. A single cold collision query can exceed the target, so actual maximum slices are measured. Navigation uses the actual 1.74 m / 0.27 m capsule and samples travel every 0.32 m. The floor support footprint matches the player's step-edge strategy. Cached static node/route tests ignore door leaves while planning; actual motion opens a nearby threshold and waits until real moving-door collision permits passage. Every movement step checks floor/capsule clearance and 0.62 m separation from other living actors and player.

Stuck guards yield/try short, physically valid side steps, then replan after 2.8 seconds. There is no teleport, noclip or remote door opening. Complex distant pursuits can exhaust the bounded A* search and then become finite local searches; patrol and reserve routes are authored and fully tested. AI does not climb ladders or traverse rooftops.

Meaningful timers, waypoint/path state, last-known position, health, ammunition, reload state, callout/communication cooldowns, deterministic PRNG, drop flag, reserve state/post and animation time are JSON-safe snapshots. Restore clears transient tracers and navigation caches, restores corpse pose without emitting a new drop, and does not re-fire audio. Pause works by not calling update; there are no setTimeout gameplay events.

Pending navigation requests are recorded as target + planning flag. Restore discards old generators and restarts only saved pending requests from the restored actor position. State transitions and disposal cancel obsolete jobs. This prevents a result computed in a later checkpoint from overwriting a restored path.

## Verification evidence

Run `node scripts/check-player.mjs scripts/ai-checks.ts` (lead updated the runner to support dynamic animation chunks). Checks cover cone/range, obstructed hearing, body hit geometry, A* door/corner/sealed-goal rules, every authored patrol/reserve path, real closed-door passage, continuous all-guard movement, suspicion delay, bounded communication, last-known tracking, search expiry, world-clipped hit rejection, three-hit death/exactly-one drop, and exact snapshot restoration.

The 280-second continuous actual-map headless simulation passed with zero failed paths for all fourteen guards. Ordinary waypoint visits: yard 26, west 27, tower A 18, tower B 17, inner gate 56, loading 23, workshop 27, rail 18, relay 37, crew 37. All four reserves visited all nine route points. Simulation took approximately 6.0 seconds on this host (rendering replaced by a fake actor); this is physics/AI evidence, not a browser frame-rate measurement or a player playthrough.

`npm run build` passed after integration; existing large shared Three chunk warning remains. Tests found and fixed two defects: navigation dropping onto a plinth edge while its capsule still overlaps the edge, and stale cached sight updating a hidden player's location. The long simulation additionally found and fixed reserve crowding at a shared final point.

During browser self-check, synchronous long-range investigation A* caused an 826.4 ms frame. The authorized incremental-planning fix retained routes and search bounds. Same staged 1440×900 outdoor live-gameplay repro, M4 Max / HeadlessChrome 147 / renderer pixel ratio 1.5: 671 active frames over 6.001 seconds, mean 111.8 fps, p95 10.5 ms, maximum 15.2 ms; maximum navigation slice 8.4 ms. Player health was never edited and remained 74. See `evidence/performance-outdoor.json` (before) and `evidence/performance-outdoor-after.json` (after). Build and all AI regression groups passed after the fix.

## Completed integration and remaining verification limits

- Runtime maps `enemy-shot`, `enemy-footstep`, `enemy-reload`, `enemy-down`, `callout` and `door` to original sound/captions. Hearing radius is independent of audio volume.
- Actual browser self-check inspected outdoor/interior black silhouettes and held guns with real loaded actors; screenshots and material diagnostics are linked in [COMBAT-REVIEW.md](COMBAT-REVIEW.md). This is explicitly self-check evidence, not an independent AI review.
- Actual rendered frame timings and the authorized hitch fix are recorded above. A fresh input-only full southern approach and extraction completed on the final source with intact radio/four reserves, 87 health, eight kills and zero deaths; see the combat review for the complete route log and its informed-automation limitations.
- First-time pacing, subjective difficulty/enjoyment and a human assessment of the sound mix remain unverified. The reviewer has not converted the fast automated completion into a claimed 15–30-minute human result.
- Limitations: enemies use upright capsule hitboxes rather than exact animated limb triangles; tactical repositioning is local sidestepping/closing distance rather than a full cover-selection planner; NPCs do not climb ladders; enemy reloads enforce timing/ammo and lower their shot rate but do not reproduce the lab's detailed magazine-hand choreography.
