# Transport collision and exit gate

The rescue transport now blocks walking and sprinting. Closed body volumes prevent entering the cabin through thin panels; visible geometry supplies collision and cover for the tires, steps and bodywork. Colliders follow the moving car and return to its parked position on restart.

The hostage approaches outside the wheels and open passenger door before boarding. The driver's F interaction remains reachable from outside the car.

The final exit gate swings through 90 degrees over three seconds, easing into and out of movement. Its collision panel follows the hinge throughout. Mechanical travel retains this timing with Reduced Motion enabled, and uses real frame time when physics is capped at low frame rates. While the gate moves, the jeep prompt reads “Gate opening” and F waits; “Board jeep” becomes available once the gate clears.

## Verification

- `npm run build`, `npm run test:rescue`, `npm run test:player`, `npm run test:escape`, and the door-navigation checks passed. The added `scripts/transport-collision-checks.ts` is part of `test:rescue`.
- Collision regression checks cover walking/sprinting against all four sides at 30/60/144 fps, moving/rotating/resetting the vehicle, and three-second gate travel at 10/30/60/144 fps. They also cover live gate collision, repeated commands, reversal, reset and Reduced Motion.
- The complete automated rescue route and hostage boarding checks passed with the actual animated passenger door included.
- Authorized agent-browser checks exercised the running game's WASD and F event handlers from staged nearby positions. Sprinting stopped at x=157.770/152.230 and z=9.530/12.470 around the parked car. The driver interaction remained reachable.
- The real render loop opened the gate in **3.0093 s** over 181 frames. With an added 90 ms stall per frame it took **3.051 s** over 33 frames. Both runs rejected early boarding and accepted F after opening. Measurements: [normal frames](evidence/gate-normal.json), [slow frames](evidence/gate-slow-frames.json).
- Inspected the [closed](evidence/gate-closed.png), [half-open](evidence/gate-half-open.png) and [open](evidence/gate-open.png) gate. Browser errors were empty; the console contained only Vite connection messages.

Browser scenarios stage position and mission prerequisites; they are not a complete input-only rescue playthrough. To reproduce, load a fresh dev page, wait for `window.__environment.mission.ready`, and install `scripts/check-transport-collision.js` using `agent-browser eval --stdin`. Run `window.__transportChecks.collision()` and `gate()` / `gate(90)`. Run `view(0)`, `view(0.5)` and `view(1)` last, since those intentionally freeze the scene. Reload afterward to restore normal simulation.
