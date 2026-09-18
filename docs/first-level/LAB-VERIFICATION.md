# Independent lab regression verification

Date: 2026-09-17 (Asia/Muscat). Verifier implemented the new gameplay weapon module but made **no changes to the lab**. These checks independently exercise the preserved lab systems; they are not an independent review of the verifier's own gameplay weapon implementation.

Environment: Vite development server at `http://127.0.0.1:5173/lab.html`; requested `agent-browser` tool in isolated session `lab-verifier`; HeadlessChrome 147 on macOS; viewport 1280 × 577, device pixel ratio 1. `window.__lab` and its weapon API were present before execution.

| Existing suite | Checks | Result | Browser report |
|---|---:|---|---|
| `scripts/check-lab-guns.js` | 62 | Pass | [lab-guns.json](evidence/lab-guns.json) |
| `scripts/check-lab-gun-poses.js` | 88 | Pass | [lab-gun-poses.json](evidence/lab-gun-poses.json) |
| `scripts/check-lab-scenarios.js` | 76 | Pass | [lab-scenarios.json](evidence/lab-scenarios.json) |
| `scripts/check-lab-dropped-guns.js` | 52 | Pass | [lab-dropped-guns.json](evidence/lab-dropped-guns.json) |

All **278** existing checks passed. Each source script was executed unmodified using `agent-browser --session lab-verifier eval --stdin`. The suites advance animation and weapon state deterministically in the real browser, exercising ray/muzzle alignment, firing cadence, interrupted operations, mechanism resets, frame-by-frame pose/contact constraints, ordinary carry, armed scenarios, death release, ground contact and disposal. Their reported compute durations were 197 ms, 12,430 ms and 867 ms for guns, poses and scenarios respectively; these are test execution durations, not frame-rate measurements.

[Rendered lab screenshot](evidence/lab.png) was captured with an AK in the normal aiming pose and inspected using the image viewer. The character, weapon and controls render; hands meet the held weapon and the scene remains readable. The lab preserves its existing pale, ink-outlined character presentation. The mission's separate flat-black character rendering is outside this lab preservation check.

No reproducible defect was found in the tested lab scope. `agent-browser errors` returned no runtime errors. Concurrent Vite edits briefly reset an early screenshot to idle; the final screenshot was taken immediately after equipping and aiming, and the suites' saved results were all successful. The isolated browser session was closed after verification.

Limits: this is browser execution of existing deterministic regressions plus one representative rendered pose. It does not establish mission completion, first-person gameplay weapon quality, subjective animation quality across every lab action, mission performance or human pacing.
