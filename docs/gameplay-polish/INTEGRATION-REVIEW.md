# Independent integration and audio review

Reviewed 2026-09-17 in isolated **headless agent-browser** session `polish-review-ui`, local Vite server `http://127.0.0.1:5173`, Chromium default viewport 1280 × 577. Read the CLI core instructions before interacting. The coordinator runs a separate input-only playthrough; this review combines trusted button clicks and explicitly staged development-runtime scenarios.

Scope: runtime/world/HUD/impacts/controller integration and the audio specialist's implementation. This reviewer authored weapons, so weapons are **excluded from independent approval**.

## Results

No unresolved critical or major defect found in this review's scope.

| Scenario | Observed result |
| --- | --- |
| Fresh startup, trusted Begin mission click | AudioContext running, 173 decoded samples, exactly two tracked sources: ambience and original music. |
| Stage 31 damage through MissionRuntime.damage | Health 100 → 69 by next presented frame. Text, accessible label and 69% bar agree. |
| Twenty simultaneous contact callouts | One accepted, nineteen suppressed; three total sources including the two loops. |
| Mute/unmute | Master gain zero while muted; events allocate no additional sources; unmute restores configured gain 0.55. |
| Pause | Zero sources, music/ambience false, context suspended. Paused callouts create no sources. |
| Resume click, staged lethal damage | Dead phase, health zero, paused player, recovery heading “No way through.”, hidden scope, inactive audio and zero sources. |
| Trusted Retry checkpoint click | Restores active mission state, health 100 and health DOM; remains paused with zero sources. |
| Forty staged impact bursts | Capped at 80 instances. All expire after 0.5 seconds of simulation. |
| Restart with transient effects | Clears chips, tracer list and audio sources; health returns to 100. |
| Actual runtime surface shot | Solid insertion geometry hit at 3.906506 m; seven chips at exact ray hit minus intended 1.5 cm anti-clipping offset. |
| Four house guards | Relay, crew, dispatch and maintenance contain living patrol actors on supported interior floors. |
| Two tower posts | Each sniper has one stationary waypoint and actual scene floor within 5 cm of specified height. |
| Staged relay interior encounter | Visible standing guard reacts with SUSPICION and an “Ahead” caption; doors, objective and health remain readable. |
| Audio disposal | Zero sources, disposed flag true, context released. |
| Browser errors | No JavaScript errors; only normal Vite connection/HMR diagnostics. |

Independently passed `node scripts/check-player.mjs scripts/polish-audio-checks.ts`: all six groups covering activation, range/hit regions, voice cooldowns, ladder one-shots, mute/pause/reset/dispose and late asynchronous loads.

Independently passed `node scripts/check-player.mjs scripts/map-checks.ts`: eighteen spawn clearances, complete house patrol clearances, both tower floor/open sightlines, all named routes, doors, ladder and perimeters. Collision checks supplement the actual relay scene; they are not represented as an input-only route.

## Evidence and reproduction

- `evidence/review-health-69.png`: rendered HUD at 69. Captured before the independently discovered weapon FOV fix; health evidence only.
- `evidence/review-death.png`: lethal recovery state before scrolling the small-height pause panel.
- `evidence/review-death-scrolled.png`: initial broad scroll attempt, retained for test history.
- `evidence/review-relay-interior.png`: actual relay guard, suspicion/caption and HUD after integration reload. Player position was explicitly staged.
- `scripts/polish-runtime-checks.js`: staged browser assertions. Load using `agent-browser ... eval --stdin < scripts/polish-runtime-checks.js`; after trusted Begin click run health(), audio(), trusted Resume click, death(), scroll/retry click, recovered(), impacts(), world(). Reload and Begin before surfaceShot(); dispose() goes last. Methods are on `window.polishReview`.

Initial Retry assertion failed because the automation clicked the button center below the 577 px viewport without scrolling the nested pause panel. `scrollintoview '#mission-retry'` then a trusted click succeeded. This was a harness interaction error, not a failed recovery handler. Initial house assertion incorrectly assumed an `active` snapshot field; activation uses `state`. Corrected to living patrol actors and rechecked successfully.

## Limits and review separation

Real decoded WebAudio graphs and lifecycle were inspected, but headless verification cannot establish subjective sound quality. Cadence/cleanup have executable coverage; perceptual sound quality needs listening judgment.

The separate combat validator identified construction-time overview FOV capture. This reviewer temporarily returned to weapon implementation ownership to fix it and add a regression, then sent it back to the same independent validator. That fix is not self-approved here.

The source world has one water tower and one observation tower; the two supported sniper posts use both, following the documented implementation decision.

## Final-source recheck

After coordinator HUD adjustments, reloaded the final source and repeated trusted startup and staged health assertions successfully. `evidence/review-health-final.png` shows 69 health with no status overlap: walk-status bottom 465 px, health panel top 480 px (15 px gap).

`evidence/review-scope-hud-final.png` visually verifies scope overlay and readable ammunition on the new paper panel (computed rgba(250,251,249,0.93)). Sniper equipment/player position were staged solely to review integration HUD contrast, not to independently approve weapon behavior.

The actual AI context `onSurfaceHit` callback creates seven runtime chips. Restart returns chips to zero, hides scope, restores health DOM to 100 and leaves zero audio sources. Exact enemy ray-hit geometry is additionally covered by the AI owner's regression suite; this browser callback check verifies integration wiring.
