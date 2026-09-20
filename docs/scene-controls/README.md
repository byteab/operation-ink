# Scene controls, contact outlines and mission recap

The annotated warehouse loading platform, stairs and annex concrete barrier now have continuous ground-contact ink above the paving. The paving reaches 0.0425 m; the new contours sit at 0.055 m while the solid collision geometry stays in place. Building plinths and outdoor control bases use the same correction.

The Security cabin's two alarm-shaped pedestals are gone. Camera shutdown now uses a desk computer with a blue four-feed monitor, keyboard, mouse and separate tower. The remaining alarm control is outside detention. The exit uses a wide lever-and-keypad enclosure with a gate pictogram. Each retains its own camera, alarm or gate action. The outdoor regroup pedestal beside Crew quarters is removed; walking back to the hostage still restores escort progress.

The successful completion menu reports elapsed mission time, kills and remaining health. Health uses the HUD's percentage rounding. Play again resets the statistics; opening, pause and death menus do not show the completion recap.

## Verification

- `npm run build`, `npm run test:map` and `npm run test:rescue` passed.
- Real collision-world checks cover clear standing positions, reachable interaction targets, independent control effects, patrol paths, escort routing and the full vehicle exit envelope.
- Agent-browser ran all 34 checks in `scripts/check-menus.js`, including nonzero kills, fractional health, zero kills, full health and Play again/reset. Its death fixture temporarily disables the existing invincibility setting and restores it afterward.
- `scripts/check-scene-controls.js` used the actual F handler at staged player positions. The computer only disabled cameras, the alarm only silenced the alarm, and the exit control only opened the gate. The wire gate reached its fully open angle.
- Visually inspected all annotated locations, both new control models, and the completion menu at 1440×900 and 320×568. No browser or shader errors.
- These are staged runtime and geometry checks, not a complete input-only rescue playthrough.

## Visual evidence

- [Warehouse platform and stairs](warehouse.png)
- [Concrete barrier](barrier.png)
- [Security room](security-room.png) and [computer close-up](computer.png)
- [Exit lever and keypad](gate-control.png)
- [Courtyard without regroup pedestal](yard.png)
- [Completion recap](recap-desktop.png) and [320px layout](recap-narrow.png)

For staged scene views, load the dev game, wait for `window.__environment.mission.ready`, and install `scripts/check-scene-controls.js` with `agent-browser eval --stdin`. Call `window.__sceneControls.controls()` for the real F checks, or `warehouse()`, `barrier()`, `room()`, `computer()`, `yard()` and `gate()` for the saved camera views. Reload afterward to restore normal simulation.
