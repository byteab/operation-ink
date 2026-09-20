# Urgent exterior getaway

Press **F Board jeep** after the hostage is aboard and the gate is open. The game cuts to a stationary exterior camera overlooking the exit, hides first-person weapons and HUD, and locks gameplay input through the shot.

The jeep launches after 0.08 seconds, accelerates smoothly to 13.89 m/s (50 km/h) over 0.72 seconds, and travels the 20 m exit in 1.8 seconds. One shallow road curve replaces the sideways fishtail: the body follows its travel direction, turning at most about 5.7°, and front-wheel steering follows the curve. Driver and hostage seat transforms follow the vehicle.

The rear-wheel dust is pure black at low opacity, with fewer, smaller puffs that expire in 0.45–0.8 seconds. It uses one instanced draw capped at 128 puffs. Emissions interpolate along the car's travel between frames to avoid disconnected clumps at low FPS.

The screen fades from 1.4 to 1.85 seconds, reaching black while the jeep is still moving. Completion is recorded at the end of the exit route, the menu appears at 2.05 seconds and finishes fading in at 2.4 seconds. The exterior camera stays stationary for Reduced Motion too. Hidden tabs freeze the sequence; Play again clears its camera, vehicle, particles and input state.

Cinematic travel and dust now use real frame time separately from the 50 ms physics step cap, which previously slowed the shot below 20 FPS. Visibility changes reset the render timestamp so time spent in a hidden tab cannot skip the ending.

## Verification

- This revision passed `npm run build`, `npm run test:escape`, and `npm run test:player-death`. The preceding cell/escort/ending integration also passed `npm run test:rescue`.
- Focused checks cover 10/15/30/60/144 fps; full-car desktop and portrait framing; the complete rotating vehicle within the 8 m exit lane; acceleration and alignment of body heading with travel; movement until black; completion before menu; input/damage isolation; hidden-tab pause; driver and hostage attachment; dust cap, freeze, expiry and disposal; and runtime restart cleanup.
- Agent-browser verification uses `scripts/check-escape-cinematic.js` to stage the hostage aboard and gate open, followed by the actual **F** handler. The helper can advance the real runtime at 60 Hz with `__cinemaCheck.step(seconds)`, inspect it with `.status()`, or restore normal animation with `.resume()`.
- Native **Play again** returned to active gameplay with health 100, invincibility enabled, normal FOV, visible weapon, unlocked movement, no fade and zero dust. Browser and shader errors were empty. Escape/M could not interrupt the driving shot.
- The real browser render loop was deliberately stalled for 90 ms per frame: 25 frames, 24 physics-capped frames, peak speed 13.89 m/s, and 2.403 seconds to finish the 2.4-second cinematic. Browser/shader errors were empty.
- This is staged ending verification, not a complete input-only mission playthrough. The rescue suite separately exercises cell, stair, escort, boarding and exit geometry.

## Captures

- [Exterior departure](evidence/departure.png)
- [Natural turn and light black dust at 0.9 seconds](evidence/driving.png)
- [Moving fade at 1.625 seconds](evidence/fading.png)
- [Completion menu](evidence/menu.png)
