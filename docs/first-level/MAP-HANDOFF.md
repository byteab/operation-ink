# Mission map handoff

Implemented in `src/game/world.ts`. The lead's [DESIGN.md](DESIGN.md) is authoritative. [CONCEPTS.md](CONCEPTS.md) records the earlier three-way design comparison and coordinate proposal; the selected implementation refines that proposal to the compact northeast annex described here.

## Integration contract

```ts
const compound = createCompound()
prepareCompound(compound)
const missionWorld = createMissionWorld()
scene.add(compound, missionWorld.root)
// Construct CollisionWorld, door/ladder discovery, mission and AI after this.
```

`createMissionWorld(): MissionWorld` returns root, seven stations, fourteen enemy specs, spawn, lookAt and bounds. The map adds four buildings, actual north/south doors, sparse interiors, roof access, rail extension and wagon, cover, signage, a visible semaphore, and a continuous outer collision boundary. Existing architecture functions and landmarks are unchanged.

`prepareCompound()` replaces the visual geometry and collision panels of exactly two existing fence runs, retaining their semantic parent names and all other segments. It is idempotent. It also turns the existing inner-gate open leaves west, clearing the narrow passage beside the gatehouse; this mission-only adjustment fixes a complete-route blockage discovered in verification. It creates:

- Rail maintenance crossing: X=54…60 at Z=-18.75, framed with open gate leaves. New stairs at X=57 lead onto the original loading platform; the platform's 1.05 m edge is not treated as a walkable step.
- East service crossing: Z=8…14 at X=99, framed with open gate leaves. This connects the original eastern service yard to the annex and gives the southern approach a genuine second entrance.

The existing eastern rail opening remains unchanged. Cross it around **Z=-34.2**. Z=-35 intersects its original northern fence return; a test exposed and corrected that route assumption.

## Fixed map data

All coordinates are world metres, X east and Z south. Apron top is Y=0.0425; house floors Y=0.12; maintenance roof Y=4.2. The player starts at `[-52.1,0.15,-51.35]`, looking toward the original mess-hall ladder at `[-48.665,1.7,-51.35]`. This position is checked against the actual collision mesh.

| Structure | Centre X,Z | Footprint | South door X,Z | North door X,Z |
| --- | --- | --- | --- | --- |
| Relay house | 117,-17 | 12×10 | 117,-11.965 | 117,-22.035 |
| Dispatch cabin | 146,-45 | 10×9 | 146,-40.465 | 146,-49.535 |
| Crew house | 143,3 | 14×10 | 143,8.035 | 143,-2.035 |
| Maintenance shelter | 111,-45 | 12×10 | 111,-39.965 | 111,-50.035 |

Doors are 2.1 m wide and initially closed. Front/rear passages use a central aisle wider than two metres. The crew house has two furnished sleeping spaces separated by a partial partition; reserve muster positions remain clear. The maintenance west exterior ladder has a real roof gap and load-bearing landing. Roof/walls support the established inspection cutaway metadata.

| Station ID | Kind | Geometry base X,Y,Z | Facing / selection |
| --- | --- | --- | --- |
| tower-radio | radio | 5.5,0.22,-40.2 | South; beside water-tower base |
| release-interlock | release | 120.7,0.12,-18.4 | West; inside relay |
| siding-brake | brake | 142,0,-35.4 | North; beside rails, clear of raised rail heads |
| dispatch-signal | signal | 149,0.12,-45.8 | West; inside dispatch |
| maintenance-supplies | supply | 114.7,0.12,-45.5 | West; inside maintenance |
| service-bell | distraction | -39,0,3 | South; western service yard |
| north-extraction | extract | -55.5,0,-51.35 | East; safe insertion forecourt |

Use the returned `station.point`, which is placed just in front of each panel at hand height; the geometry base in this table is not its interaction point. Every point has a capsule-sized standing area with unoccluded line of sight. Station IDs/kinds are stable. `signalStation.object.userData.signalArm` and `.signalLamp` reference the visible semaphore components; both are also available from `missionWorld.root.userData`. For STOP, set the arm Z rotation to zero and lamp material colour to a restrained red. The mast is at `(155,-38)`, visible from the siding and annex approaches.

The annex fence bounds X=99…164, Z=-57…18 and ties into the original perimeter. A visible masonry boundary at X=-108/169 and Z=-76/78 prevents escapes from the overall playable area. The original large paper ground remains intact.

## AI route contract

There are ten ordinary enemies and four reserves; exact `EnemySpec` patrols are authored at the end of `world.ts`. All ordinary complete loops pass a collision-based capsule traversal test. This validates geometry, not the eventual AI planner.

| IDs | Purpose |
| --- | --- |
| yard-patrol, west-patrol | Initial mess-yard observation and western service route |
| tower-patrol-a, tower-patrol-b | Offset patrols around water-tower base |
| inner-gate, loading-patrol, workshop-patrol | Southern approach pressure and short local gunfights |
| rail-patrol | Siding observation, brake exposure, dispatch exterior |
| relay-patrol | Enters relay through south door, leaves through north door |
| crew-patrol | Enters/leaves crew house on a repeatable exterior loop |
| reserve-1…4 | Preplaced crew-house detail; the mission decides when/how many activate |

The rail sentry passes behind dispatch at **Z=-53**. A previous Z=-51 route was blocked by the fully open north door; moving that part of the route fixed it. Reserves start at `(140,1.3)`, `(146,1.3)`, `(140,5)`, `(146,5)` in X,Z, at floor Y=0.12. Their route must go through the centre of the crew house, north door, east around the wagon, and into dispatch through its south door. They must not target the final cabin point by direct movement through its wall.

Reserve path, in X,Z:

```text
start → (143,3) → (143,-1.5) → (143,-5) → (151,-8)
      → (151,-22) → (154,-35) → (146,-37) → (146,-42)
```

All relevant AI doors are discoverable `kind: 'door'` groups. AI must open and wait for them; map tests open them explicitly to test the underlying route. The waypoint floor values are hints; sample actual ground on movement. Cover baffles leave these authored corridors clear. Signage and lamp sprites have `noCollision: true` and need ancestor-aware filtering in collision/occlusion queries, which the coordinator has added.

## Verification performed

`npx tsc --noEmit` passed after implementation. The durable Node test at `scripts/map-checks.ts`, run through the repository's `scripts/check-player.mjs` loader, builds the **real compound + mission**, creates the real `CollisionWorld`/`PlayerBody`/`PlayerActions`, and moves capsules at the normal 4.2 m/s walk speed. Final result: **52 checks passed** (including complete northern and southern ground approaches added during integration review).

Verified:

- Spawn is clear; all seven stations have clear standing capsules and line of sight.
- All fourteen enemy starting positions are clear.
- All ten ordinary patrol loops can be traversed completely without recurring stalls.
- All four buildings can be entered from south and exited north; their closed south doors prevent passage.
- Existing rail opening, new east service gate, new separation opening/stairs, annex cross-route, and reserve house-to-dispatch route are physically traversable.
- Maintenance ladder can be selected, climbed, and descended through the real actions controller, with clear endpoints.
- Sprinting into each of the four outer masonry boundaries stops the capsule inside the playable area.

The annex adds **168 mesh objects and approximately 17,226 triangles** in the Node environment, which omits CanvasTexture signs. This is a geometry inventory, not a frame-rate measurement. Browser signage adds a small number of two-triangle planes and textures.

One check initially failed because a suggested rail crossing at Z=-35 was outside the existing gap; the route was corrected to Z=-34.2. A second check found the open dispatch door blocking the rear sentry route; that patrol now uses Z=-53. Full-route integration testing then exposed the original inner gate opening into the gatehouse passage; the mission preparation hook now swings its leaves west. Both complete ground approaches passed after that correction. See MISSION-REVIEW.md for details.

No browser playthrough, combat balance assessment, screenshot inspection, or 15–30-minute pacing validation is claimed by this handoff. The coordinator owns integration and agent-browser verification. Browser review should specifically inspect signs, roof ladder landing, station prompt selection, crew-house traffic under the final AI, semaphore STOP feedback, and both complete mission approaches.

## Next dependencies

1. Coordinator integrates the preparation hook before collision construction and applies the spawn/lookAt.
2. AI specialist consumes the returned specs, opens relevant doors and verifies actual patrol/reserve behavior.
3. Mission logic updates the provided semaphore references, manages station state and uses only live reachable prompts.
4. Independent browser verifier checks actual rendering and full normal-input routes. Geometry tests are not substitutes for this evidence.
