Fall damage verification — 2026-09-20

High landings remove health on contact and reuse the player's existing hurt recording, impact thump, screen flash/shading and camera/weapon reaction. The HUD identifies the cause as “Fall damage.” Drops up to roughly 2.3 m and ordinary jumps are safe; damage scales with downward impact speed, capped at 100.

Validation completed:

- Production build and `git diff --check` passed.
- `npm run test:fall-damage`: 20/30/60/144 fps, normal jumps, increasing/lethal falls, actual starting-roof and tower drops/jumps, intermediate platforms, teleport reset, shared runtime feedback, reduced motion, invincibility, death/retry and inactive/traversal/escape cleanup.
- Player, player-death, player-hit, traversal/audio, zipline, VR and mission checks passed. Existing stairs, ladders and zipline dismount checks now assert zero fall damage.
- `scripts/check-fall-damage.js` passed all 30 browser checks via the user-authorized agent-browser fallback. Setup stages positions and suppresses guards, then uses real keyboard handlers, movement, collision, mission, HUD and audio code. The final roof jump runs through the normal animation loop: 71 frames, one damaging impact, 33.55 health remaining. This was a targeted check, not a full mission playthrough.
- `browser-checks.json` contains the assertions and native audio diagnostics. `browser-errors.txt` is empty. `roof-landing.png` shows the actual live-loop landing, reduced heart fill, existing screen shading and explicit label; visually inspected.

The observation ladder route lands on the fence before reaching the yard; those are separate contacts. A direct water-tower fall is lethal from full health.

To repeat the browser check, start the local game, click Begin mission to unlock audio, and evaluate `scripts/check-fall-damage.js` through agent-browser. Reload afterward to remove the temporary staging hooks.
