# First-level concept comparison

Design specialist proposal, based on `src/world/compound.ts`, `architecture.ts`, `industrial.ts`, `messHall.ts`, `player/controller.ts`, `player/body.ts`, `player/collision.ts`, and the implementation brief. Coordinates below are world metres: north is negative Z. The coordinator owns the final implementation design.

## Three concepts

| Concept | Central situation and tactical decision | Feasibility | Main risk |
| --- | --- | --- | --- |
| **Last Green Light** | Stop a munitions dispatch by setting a mechanical rail brake and isolating its electrical release, in either order, then commit the departure signal to STOP. The audible signal test sends a limited inspection team from nearby housing. Prepare the escape before announcing the stoppage. | Strongest: existing rail, towers, warehouse, doors, and ladders all matter. Three reliable interactions, a visible signal arm, and one bounded NPC event make a complete mission. | The map alone is too small to establish 15–30 minutes; actual encounter playtests must support the pacing claim. |
| **Borrowed Shift** | Use a mess-hall assembly bell to draw the security crew away from the east workshop. Watch their routine, change the maintenance roster, ring the bell, and disable an armored vehicle while its crew is absent. A suspicious foreman arrives early and can be evaded or intercepted. | Medium: the distinctive hook reuses the elaborate mess-hall route and interior. | Multiple synchronized schedules, readable early-return rules, and reliable multi-NPC doorway traffic create significant first-level dependencies. A simplistic implementation becomes waiting for a timer. |
| **Water Hammer** | Interrupt fuel transfers by switching the tower supply into a pressure-test circuit. Choose between a quiet multi-valve shutdown or a conspicuous emergency dump. The release changes guard routes and turns the exposed service lane into a new approach. | Medium-low: visually memorable industrial mission using tower and fuel annex. | Credible flowing-water effects, changing traversal conditions, and two sabotage systems are much more work than the existing environment supports. Without those elements the premise reduces to ordinary switches. |

**Recommendation: Last Green Light.** Its outcome is visible from the water tower, it produces a readable before/after world state, and stealth and gunplay support the same objective. It needs no moving train, escort AI, destructible geometry, universal alarm, or arbitrary countdown. A stationary loaded wagon and a semaphore communicate the dispatch fiction honestly; do not promise a departing train simulation.

## Recommended mission

The player is an advance scout stopping a weapons shipment long enough for a civilian evacuation. The compound cannot dispatch under a red signal with the release interlock isolated and the siding brake secured. All three conditions remain satisfied once established; guards investigate the fault but cannot silently undo progress.

Briefing: “Stop the shipment. Isolate the warehouse release circuit and lock the siding brake, in either order. Then set the east cabin signal to STOP. The signal test sounds across the siding: prepare a way out first. Return to the insertion point. You do not need to clear the compound.”

Start at the existing mess-hall west ladder forecourt with a suppressed pistol (12 loaded + 36 reserve), a service rifle (30 + 60), and 100 health. Two distinct ammunition pools; no regenerating ammunition. Suppression has a short audible radius, not immunity from detection. A single optional medical supply in the expansion is useful without becoming mandatory.

Primary objective: permanently stop dispatch and extract alive. Intermediate objectives: warehouse release isolator; siding brake; signal cabin. Optional opportunities: communications isolation reduces the responding team; tower observation reveals the patrol cycle; an inhabited crew house contains a limited medical resupply and a second exit for breaking sightlines.

## Concrete layout proposal

The existing perimeter and internal fences determine routes. The original railway separation fence runs from `(99,-18.75)` to `(-3,-18.75)`, turns through `(-3,-12)` and `(-12.45,-12)`, and continues to `(-12.45,16.2)`. It is a solid route barrier. The existing inner gate is `(-12.45,20.1)`. The existing east rail opening is at `(99,-32.4)` and is approximately 5.55 m wide. Never route NPCs or players across an unmodified fence segment.

| Area / location | Purpose, connections, cover, and encounter |
| --- | --- |
| Existing northwest mess hall, centre `(-34.2,-46.65)` | Quiet insertion tutorial through the existing west ladder, roof, access door, stairs, hall, and yard exit. The exterior ladder is approximately `(-48.665,-51.35)`; use the controller's actual ladder-derived spawn rather than hardcoding an unverified point. One guard outside the yard exit teaches observation; no unavoidable opening shot. The closed north service gate remains a barrier. |
| Existing water tower `(10.95,-34.05)` | Optional observation position. A two-person offset patrol loops around its base with a clear 10–15 second crossing opportunity. The platform reveals the east rail lane and warehouse division. Keep the existing ladder and zipline functional. |
| Existing west service yards and inner gate `(-12.45,20.1)` | Covered southern approach using shed corners, watch-tower legs, administration wing, and gatehouse. One sentry and a mobile patrol create a timing problem. A player can back away behind solid buildings if detected. The already-open west service gate at `(-60.45,21.15)` preserves access to the southwest yard. |
| Existing warehouse, centre `(25.5,-6.6)` | Electrical-release objective inside its western bay, proposed `(10,1.6,-4)`, reached from its existing west loading door near `(8.155,-0.18)`. Confirm furniture clearance before placing the panel. Doorway entry is a short close-range encounter; other existing loading doors allow repositioning. A rear exterior shortcut is not assumed. |
| New maintenance crossing in rail separation fence | Explicitly split the original horizontal fence around `(57,-18.75)` to leave a 4 m opening with visible open gate leaves. This joins rail and loading yard and supports alternate objective orderings. Add two offset solid crate groups south of the opening, keeping a 2 m clear path. This deliberate route change must also exist in collision and AI navigation. |
| New east service gate `(99,15)` | Split the east perimeter around this point to leave a 5 m opening. Retain the other original perimeter segments. This creates the second connection to the expansion; without it the new area would be a single-entry pocket. Its west approach at Z=15 avoids the existing workshop and southeast huts. |
| New east rail/service annex, bounded approximately X=99…157, Z=-42…35 | Approximately 58×77 m of purposeful expansion. Connect north through the existing rail gap and south through the new service gate. Continue track to X=153; end visibly at a buffer. Outer fence bounds all new edges. Separate the rail platform from the housing court with low cover and two passages, not a wall forcing a single route. |
| Siding brake `(134,1.1,-31)` | Required mechanical control beside a stationary wagon. A guard walks along the platform, turns at the buffer, then enters the signal cabin; that interval creates an opening. Wagon and platform stacks interrupt long sightlines. The control is usable from solid ground and does not require stepping onto rails or a prop. |
| New signal cabin, centre `(118,-7)`, footprint 10×9 m | Final STOP console at `(118,1.5,-8)`. Usable room with south-facing door near `(118,-2.45)` and a second east-side exit. The cabin looks toward the brake and rail signal. Add the second opening deliberately: generic `building()` has only front entries by default. Console must not be placed behind decorative window geometry. |
| New crew house, centre `(142,0)`, footprint 14×10 m | Two usable rooms, south front entry near `(142,5.05)`, west side exit into a screened court. Two or three reserve guards begin inside and emerge after the signal event. Before that, one guard enters and leaves on routine. Interior route waypoints must align to actual door openings. |
| New maintenance house, centre `(117,19)`, footprint 12×10 m | Optional communications isolator at `(117,1.4,19)` and one medical supply. An entry near `(117,24.05)` plus a west-side exit makes this a recovery route. Disabling communications before STOP reduces the responding crew from three to one. The local horn still sounds. |
| Covered housing court around `(131,17)` | Short solid walls, offset crates, and a service vehicle create an escape fork between rail and southern service gate. Preserve at least 2 m of clearance at all choke points; ensure the two exits are not simultaneously covered by one stationary NPC. |

A simple stencil system names WATER / RELEASE / SIDING / SIGNAL / SERVICE. An on-demand mission card gives a schematic showing fences and gates, not an omniscient enemy radar. The current task names a landmark and the prerequisite state. Required actions have one selected F prompt with an icon and a short label; inactive console feedback explains exactly which interlock remains. Exterior objective markers must not permit interaction through walls.

## State graph and recovery

```text
BRIEFING → ACTIVE
ACTIVE → RELEASE_ISOLATED              [warehouse F]
ACTIVE → BRAKE_LOCKED                  [siding F]
RELEASE_ISOLATED → BOTH_READY          [siding F]
BRAKE_LOCKED → BOTH_READY              [warehouse F]
ACTIVE / partial / BOTH_READY → COMMS_OFF [optional house F]
BOTH_READY → DISPATCH_STOPPED          [signal cabin F]
DISPATCH_STOPPED → COMPLETE            [extract at insertion, alive]
any live state → DEAD                  [health <= 0]
DEAD → last safe checkpoint or fresh start
```

The three required actions are idempotent and have no hidden expiry. Trying the signal early gives a prerequisite message without changing state. Optional comms affects only the reserve event if completed before STOP. Repeated interactions cannot spawn another team or duplicate supplies. No requirement checks enemy death count.

STOP visibly lowers the signal, plays a short horn and subtitle, and starts the inspection event. The briefing and console prompt both warn that this action calls attention. After an eight-second preparation interval, the reserve team leaves the crew house along actual interior/doorway paths. It goes to the signal cabin and brake, not the player's position. If nobody sees the player, it checks the controls, searches their vicinity for 35 seconds, then adopts a guarded routine. If the player is seen, each guard uses normal sight/hearing and last-known-position rules; cover and distance permit escape. Killing the reserve team is optional. No new waves spawn.

Save a full checkpoint after the first interlock when out of confirmed combat, then again when both are ready and safe. If the player is under pressure, defer saving until safe instead of capturing an unavoidable death. Show “Checkpoint secured.” Save player/inventory, objective flags, doors, alive NPCs and routines, dropped items, supplies, and event state atomically. Restoring must reset delayed sound/fire/reload work. Full restart resets everything to the same deterministic baseline. Do not silently replenish inventory on checkpoint restore.

## Two intended approaches

1. **Survey and slip through the rail lane:** use the mess-hall roof/yard route and water tower to inspect the northern patrol. Reach the annex through the original east rail gap, secure the brake first, and optionally isolate comms through the housing court. Use the new maintenance crossing to reach the warehouse release panel, then return to the cabin. This conserves ammunition and offers long sightlines, at the cost of exposure during rail crossings and a longer route.
2. **Control the service yard:** descend through the mess hall, use western service buildings and the inner gate to enter the loading yard, and isolate release first. Rifle fire can win a short local engagement but brings nearby guards to the last heard position. Traverse the existing eastern yard and the new service gate, use house interiors to break sightlines, lock the brake, and commit at the cabin. This is more direct and supplies cover for gunplay, but consumes ammunition and enters the crew's territory.

After STOP both approaches remain reversible. The player can use the rail route home, or retreat south through the gate and western service buildings. Doors and solid cover allow contact to be broken. The signal event must never seal both routes or spawn enemies in sight directly behind the player.

## Pacing hypothesis and tuning

| Beat | First successful run hypothesis | Decisions that occupy the time |
| --- | --- | --- |
| Briefing, controls, mess-hall infiltration | 2–4 min | Learn door/ladder/weapon handling, find yard exit, observe first guard. |
| Reconnaissance and first interlock | 4–6 min | Choose a route, read patrols, cross exposed lanes, enter a defended room or siding. |
| Route across the compound, second interlock | 4–6 min | Reposition, handle one or two local encounters, use ammo/health responsibly. |
| Optional preparation and final cabin entry | 2–4 min | Decide whether to cut comms, inspect crew-house exits, prepare escape. |
| Horn event and extraction | 3–6 min | Break contact or hold a local position, exploit the altered patrols, return safely. |
| **Total target** | **15–26 min** | No mandatory waiting or long travel-only padding. |

This is a design budget, not measured completion time. Existing movement is 4.2 m/s walking and 7.6 m/s sprinting, so even 600 m of travel takes only about 2.4 minutes of walking. Encounter readability, observation, interior entry, route planning, and recovery must account for the rest. Record clean real-input playthroughs of both routes; report human first-time pacing and enjoyment as provisional until a new player tests them. If the mission runs short, improve meaningful encounter decisions rather than adding hold-to-use bars, forced waits, or arbitrary prerequisite errands.

## Smallest complete mechanic set

| Mechanic | Implementation cost | Complete first version |
| --- | --- | --- |
| Three-condition dispatch state | Low | Typed state, either-order prerequisites, persistent panels, visible signal change, extraction gate. |
| Reserve inspection event | Medium | Three preplaced house NPCs, one-shot event, eight-second warning, door-aware route to controls, ordinary AI thereafter. Comms reduces responders. |
| Tactical NPC perception | High, required | Local vision/occlusion, accumulation before detection, hearing/investigation, last-known search, finite communication radius, fair bursts, navigation recovery. |
| Expanded compound routes | Medium | Three new usable buildings, two explicit fence openings, siding props, real collision, bounded exterior. |
| Safe snapshots | Medium | One serialized snapshot restores all mutable gameplay state; no ad hoc per-feature reset. |
| Mission feedback and sound | Medium | Small task HUD, contextual icons, signal animation, spatial alerts and weapon sounds, visible subtitles, pause/mute cleanup. |

Keep the first integrated slice to the warehouse panel, one enemy, one functioning gun, and the first objective transition. The final loop still requires both approaches, house exits, finite response, extraction, checkpoints, and real browser verification; these are not polish-only additions.
