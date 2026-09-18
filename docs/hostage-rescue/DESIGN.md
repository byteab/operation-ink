# Operation Safe Return

The [single-hostage revision](REVISION-SINGLE-HOSTAGE.md) supersedes the original four-person cast and vehicle geometry below. The module ownership and authoritative state architecture remain in place.

## Reuse and ownership

The existing Three.js world, PlayerBody capsule collision, PlayerActions distance/facing/visibility checks, dynamic door leaves, EnemyNavigation, EnemyDirector perception/combat, weapon loadout, audio and session snapshot are retained. The old rail interlock objective chain is replaced. No hostage, vehicle extraction, underground detention, or surveillance system existed.

The coordinator owns mission.ts, runtime.ts, shared types and HUD. A map specialist owns world.ts and rescue-layout.ts. Escort and security specialists own hostages.ts and security.ts/AI alarm changes respectively. An independent reviewer checks modules they did not author against acceptance criteria; reproducible findings return to the owning specialist, followed by verification. This session used cross-module review after the available agent-thread limit prevented a fresh reviewer. Prefer a fresh reviewer when capacity permits; use a fresh implementation specialist only when the existing implementation needs an independent redesign. File ownership and shared contracts matter more than proliferating agents.

## Layout and objective graph

For future work, keep four concurrent roles at most: coordinator plus three implementation specialists, then reuse a freed slot for independent verification. Define data contracts before delegation. Give each specialist exclusive source ownership and concrete acceptance checks; let them communicate coordinate/API changes directly. Send a reproducible failing check to the original owner first, then have the reviewer rerun it. A new owner is useful for a redesign or repeated failed fixes, not for every critique.

| Module | Responsibility | Boundary |
| --- | --- | --- |
| `rescue-layout.ts` | Authored coordinates and route | Data only, shared by world/escort/security |
| `mission.ts` | State, objectives, prerequisites | No rendering, audio or navigation |
| `world.ts` | Geometry, controls and patrol placement | Publishes object references and station points |
| `hostages.ts` | Protected actors, route movement, seats | Updates hostage records; never completes mission |
| `security.ts` | Sweep, detection, alarms and capped response | Reports sightings to existing enemy AI |
| `runtime.ts` | Input effects, state synchronization, extraction, retry | Sole integration owner |
| `hud.ts` | Briefing, counters and prompts | Reads state; delegates actions to runtime |

Verification has three layers: pure mission transitions; actual-world collision/AI checks; rendered input-driven browser completion. Diagnostic staging isolates edge cases, while a fresh-start input run establishes reachability. Keep these evidence categories separate.

Insertion remains behind the mess hall. The northern roof/rail route favors observation and access to security. The western service gate is now a normal interactive door, allowing the quieter southern route to bypass the occupied mess hall. The service route uses building cover and approaches detention directly. Detention replaces the relay building in the east annex. A real staircase descends to four cells at elevation -4.2. The marked escort path climbs back to the surface, bypasses the barracks west side and turns east to a four-passenger jeep. A wide controlled east gate opens onto the departure lane.

Preparation is unordered: disable cameras and/or open the gate at any time. Find detention -> reach cells -> release each hostage -> lead the four along the route -> automatic boarding -> open gate if needed -> board jeep -> visible scripted drive across the perimeter. Neither camera disabling nor enemy elimination is a completion prerequisite.

## Security and escort rules

Cameras sweep with object-local green lamps, use world occlusion and require sustained sight. Disabling cameras extinguishes their indicators; an existing alarm requires its own panel. An alarm activates two existing barracks reserves, with two more after 14 seconds if still sounding. Four is the mission-wide cap. Guards investigate the reported position, retaining normal personal sight/hearing rules. Silencing starts a bounded search, then routine resumes unless new contact occurs.

Hostages are protected noncombatants in distinct vests. They take cover during nearby fire and resume after it stops. They follow a collision-checked authored evacuation path when the player leads nearby, avoiding unreliable multilevel global pathfinding. Regroup controls and walking back along the route recover stragglers without wall-crossing teleports. Loaded figures attach to four jeep seats. The jeep departure is a short scripted ride; it is not a free-driving vehicle.

## State and retry

MissionState is the authoritative serializable record: per-hostage status/position/progress, camera network, alarm/timers/last sighting, finite reserve count, gate, jeep and extraction progress. Runtime coordinates side effects. Death and retry restore the insertion snapshot, including doors, enemies, weapons, blood, hostages, camera indicators, alarm and jeep. No mid-escort save is introduced. Completion requires all four aboard, an open gate, and the jeep finishing its route outside the compound.

## Verification

Build and focused state/collision/security checks precede headless agent-browser verification. Browser evidence distinguishes input-driven playthroughs from diagnostic staging. Existing player, weapon and AI regressions must remain passing. See VERIFICATION.md for actual results and limitations.
