# Last Green Light — first playable mission

Status: implemented; final layout refinements below reflect traversal testing. Evidence: [VERIFICATION.md](VERIFICATION.md). Concepts: [CONCEPTS.md](CONCEPTS.md). Repository facts: [RECON.md](RECON.md).

## Premise and player contract

You are a lone rail saboteur entering a supply compound before a munitions departure. Prevent the release of the train without destroying the station, then return to the north insertion point. No civilians or required kills. Start with a pistol (12 + 36 rounds), a field map and 100 health. Enemy rifles can be recovered. Black, unlit 3D stickmen and restrained paper/ink architecture preserve the established visual language.

Briefing: “The green signal releases an ammunition train. Cut its electrical release in the relay house and set the trackside brake, in either order. Then throw STOP in the dispatch cabin. The horn will bring an inspection detail out of the crew house. Break contact and return to the north gate. Isolate the tower radio first to keep the response local. Observe the water-tower patrol before crossing.”

## State graph and tactical choices

`briefing → active → {release isolated, brake set} → stop signal → withdrawal → extracted`

The two preparations work in either order. The stop signal is unavailable until both are complete, with an explanatory prompt. A tower radio isolation opportunity is optional at any time before STOP: it cuts long-range alarm communication and reduces the inspection response. A service-yard distraction bell attracts nearby guards to a known position; reusable with a cooldown, and heard by the same hearing rules as other sounds. Field supplies are finite and persist across checkpoint restoration.

STOP is irrevocable, accompanied by a horn and explicit warning. After 12 seconds, two reserve guards leave the crew house; four if communications are intact. They investigate the signal cabin, then search locally before resuming assigned routines. No timed instant failure. The player may withdraw during the warning, use the opposite route, break line of sight and wait, or fight. Neither ammunition exhaustion nor an alarm prevents mission progression.

Death freezes combat and offers retry from checkpoint or full restart. Checkpoints at insertion and after the two preparations snapshot mission, player pose/health/inventory, enemies, loose items and door state. Restore cancels pending shots/reloads/interactions, resets sound and restores all snapshots atomically. Full restart restores initial state. Save is session-local, stated in UI. Pausing freezes all mission/AI/weapon clocks.

## Layout and routes (metres; north = -Z)

Existing landmarks remain: northwest mess hall/roof entry, water tower (11,-34), warehouse (25,-7), western fuel tanks, southern barracks, watchtower and east workshop. A framed pedestrian maintenance opening at x=54..60,z=-18.75 and a service opening at x=99,z=8..14 connect the southern approach. The existing eastern rail opening near x=99,z=-34 is the northern connection into the annex. Mission setup opens the inner service gate westward so its leaves do not seal the gatehouse passage; original exploration geometry is unchanged.

Expanded rail annex: x=102..164,z=-57..18, bounded by a solid perimeter. Three purpose-built occupied structures connect via loading lanes and cover: relay house near (117,-17), dispatch cabin near (146,-45), crew house near (143,3). A maintenance shelter near (111,-45) provides observation, a spare SMG and finite medical supplies; a traversable roof/ladder offers a view over the railway. The rail brake at (142,-35.4) is outside beside the track, exposed from the dispatch cabin. Interiors use real door openings, sparse furniture and two entries where a through-route matters. Short baffle walls, freight stacks and rail wagons divide long firing lanes without filling them with noise. Signage names destinations; a briefing field map shows landmarks and your position, not enemy locations.

Both approaches initially use the west mess-hall ladder → roof door → interior stairs → hall → south yard exit. The closed north service fence prevents a direct ground shortcut. Extraction reverses the mess-hall route and descends the west ladder.

**Northern rail approach:** mess-hall yard exit → water tower observation → rail lane → annex maintenance shelter → brake/dispatch. Shorter but exposed to the water-tower patrol and rail sentry; deliberate observation gives crossing windows. Optional radio isolates response. Roof ladders enable observation, not mandatory waiting.

**Southern service approach:** mess hall exit → western service yard → open inner gate → loading court/warehouse cover → east workshop → maintenance connection → relay house. Longer, with doors/interiors to break sight, finite supplies and more close-range encounters. Both reconnect at the annex and both remain usable after STOP.

Patrols: service yard short loop; water tower clockwise loop with observation pauses; warehouse loading patrol; east workshop sentry; annex rail patrol; relay guard entering/leaving the house; crew-house routine and event reserves. Guards start beyond safe insertion sightlines. All movement uses collision-tested navigation and doors; no teleports through obstructions. Required controls are at hand height with clear standing space.

## Pacing hypothesis

First-time target 15–30 minutes: briefing/orientation 1–2; infiltration and observation 3–5; route exploration/radio opportunity 2–4; annex entry and both preparations 4–7; signal complication and escape 4–7; recovery/extra exploration 1–5. Fast informed runs will be shorter. There are no timers added solely to stretch duration. First-time pacing and enjoyment remain provisional until human tests; record actual test routes, time and deaths separately.

## Rules, costs and smallest complete implementation

| System | Smallest complete version | Cost |
|---|---|---|
| Mission | Pure prerequisite reducer, seven contextual stations, one horn/reserve event, extraction and retry | Medium |
| Navigation | Collision-checked local grid/waypoint routes, door opening, bounded repath and separation | High |
| Perception | Range + cone + solid occlusion, suspicion delay, audible local events, last-known search, bounded radio | High |
| Combat | Ray-to-body hits behind world cover, fair enemy windup/cadence, three-hit ordinary enemies | Medium |
| Weapons | Lab pistol/AK/SMG models, two-slot ammo-conserving inventory, explicit drops, cancellable reload, procedural held arms | High |
| Annex | Four functional structures, bounded lanes, signage/cover, aligned doors/ladder | Medium |
| Audio | Original procedural Web Audio gun/foley/ambience plus browser speech callouts and text equivalents; no downloaded assets | Medium |
| UI | Briefing, unobtrusive objective/ammo/health, one F prompt with icon, field map, pause settings | Medium |

## Controls and presentation

WASD move; Shift sprint; Space jump; mouse look; left mouse fire; right mouse hold aim; R reload; 1/2 weapon slots; G drop current weapon; F selected interaction; M field map/briefing; Esc pause. Pause contains retry/restart, volume/mute and reduced motion. Inspection and existing VR remain available as explicitly separate exploration modes; mission combat pauses there. R is reserved for reload in the mission, preserving legacy exploration respawn outside it. There is no shooting while climbing, paused, interacting or dead. Near-wall obstruction lowers the held weapon and blocks shots at the actual muzzle. A single action selector resolves doors/ladders/items/stations with distance, facing, occlusion and state checks on activation. Reduced motion eliminates bob/pulse/recoil movement while retaining firing feedback.

Health/ammo and a short current objective are continuously visible; alerts and sound captions are brief and distance-aware. Mission terminal signage and field map provide navigation. No dependence on body colour for identity. Enemies use black MeshBasicMaterial with depth testing and real rig animation. Weapons retain subdued lab materials. Distinct door/ladder/pickup/control SVG icons accompany F.

## Verification gates

Build, player and VR regressions; all four existing lab weapon suites; mission state/inventory/AI regression tests; blockout traversal with real collision; actual first-person viewport inspection; two routes and complete extraction without teleport/state edits; death/checkpoint/full restart; pause/reload/pickup edge cases; patrol doorways/occlusion/search; representative frame timing. Test browser via agent-browser as requested. An automated/deterministic state run is not labelled a human playthrough. Critical/major review defects must be fixed or clearly remain incomplete.
