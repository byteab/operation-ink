# Hostage Rescue Map

The existing compound, its two entrance routes, occupied barracks, patrol network,
interactive doors, maintenance roof ladder, railway gap and field supplies remain
the foundation. The former relay house is replaced by a detention guardroom with
a physically connected underground holding area. The dispatch cabin becomes the
security office. The south service approach favors cover and short exposure;
the north railway approach reaches camera controls before the cells.

The existing north service-yard gate at X -61.8, Z -48 is now an ordinary closed
interactive gate, signed SERVICE ENTRY. It gives the insertion a ground-level
alternative to the occupied mess hall and roof ladder. A physically validated
perimeter route is: (-53,-62.3), (-61.8,-52), gate, (-61.8,-39), (-72,-39),
(-72,15), (-60,15), the west service gate at (-60,21), then the southern lanes.
Continue past Z -40 before turning west so the open entrance leaf stays clear.
This is a route choice through the existing fence opening; normal patrols remain
active and players still need to observe the loading court before crossing.

## Shared Coordinate Contract

`src/game/rescue-layout.ts` is the single source for captive positions, the escort
route, vehicle seating, the vehicle exit route and camera mounts. World construction,
hostage movement and security detection consume this contract.

- Detention footprint: X 108 to 126, Z -29 to -5.
- Basement floor: Y -4.2, four cells at X 110.5 / 123.5 and Z -21 / -26.
- Corridor: X 113 to 121. Each 2.3 metre cell door opens toward the corridor edge.
- Stair: X 115.4 to 118.6, Z -19.8 to -9, 18 physical 0.24 metre risers and
  0.6 metre treads. It connects the basement to the 0.12 metre guardroom floor.
- Jeep: X 155, Z 11, four distinct passenger seats. Boarding is at its rear,
  X 151, Z 11. The interaction belongs to the jeep, without an obstructing kiosk.
- Exit: X 164, Z 11, an 8 metre gate in the annex fence. The exterior lane ends
  at X 175 and the outer playable boundary is X 183.

The original enormous ground plane, annex paving and guardroom floor share the
same stairwell opening. Leaving any of these uncut would seal the basement with
an invisible or visible horizontal collision plane. The basement is otherwise
covered by the surface slabs, so the corridor remains a real enclosed interior.

## Collision and Interaction

Cell doors and the exit gate use the existing hinged-door geometry and dynamic
collision enrollment. They start `missionLocked`; the mission owns opening them.
The entrance door starts open and is a normal interactive door. Broad stairs and
the escort route avoid furniture, fence runs, the siding, barracks and cover.

The jeep is a scripted extraction vehicle, not a free-driving simulation. Its
visual group is noncolliding, preventing obsolete static geometry after departure.
Camera meshes and signs are decorative; camera lamps use their own unlit material
and do not illuminate surrounding surfaces. Camera positions sit outside the
facades so detection rays start in visible, unobstructed space.

Security controls, alarm shutdown panels, cell release panels, the exit control,
the vehicle and escort rally point reuse the existing station interaction model.
Security can be prepared before any hostage is released. Captive release controls
sit on the corridor side of their own cells, giving a visible reachable target.

## Validation

Run `node scripts/check-player.mjs scripts/hostage-checks.ts` for actual-world
capsule clearance through all four cells, stairs, the escort lane and boarding.
Run `node scripts/check-player.mjs scripts/rescue-map-checks.ts` for the player
controller on both stair directions, every cell, the gate and full vehicle width.
Run `node scripts/check-player.mjs scripts/security-checks.ts` for security
behavior and actual camera sightlines. Browser walkthrough evidence is recorded
by the coordinating verification pass.
