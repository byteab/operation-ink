# Startup and VR menu

The game now reveals the mission menu only after mission initialization and its first completed render. A small inline visibility rule covers the initial HTML before Vite loads styles. This removes both the unstyled VR panel and the temporary camera view beside the ladder. There is no added loading screen or timed delay.

The home menu includes **VR** beside Mission, Controls and Settings. Its page contains the existing headset-support check, Enter VR action, controller instructions and retry feedback. The original button is moved with its listeners intact, preserving browser user activation. VR remains an exploration walkthrough while the mission is paused. The explicit `/?explore=1` route retains its exploration controls.

Startup import/renderer failures show a reload action. Mission asset failures reveal the existing mission error message instead of leaving the page hidden.

## Verification

- `npm run build`, `npm run test:vr` and `npm run test:player` passed.
- Agent-browser captured startup frames in development and production. Every visible frame had the final menu and a rendered scene; the development camera position/orientation remained identical throughout all 15 visible samples. The first visible frame focused Begin mission. See [development](evidence/startup.json) and [production](evidence/production-startup.json).
- All 37 existing/updated [menu checks](evidence/menu-checks.json) passed, including VR page isolation, Escape, focus, gameplay, pause, restart, death and completion.
- Reviewed screenshots at [1440×900](evidence/menu-desktop.png) and [320×568](evidence/menu-narrow.png), plus the [desktop](evidence/vr-desktop.png) and [narrow](evidence/vr-narrow.png) VR page and [production menu](evidence/production-menu.png). No browser errors occurred during normal checks.
- With simulated headset support, a native button click requested `immersive-vr` with `local-floor` and active user activation. Simulated permission rejection left the mission paused and offered retry inside the VR menu. See [VR entry](evidence/vr-entry.json). No physical headset session was tested.
- Page initialization hooks simulated [renderer failure](evidence/startup-failure.json) and [model download failure](evidence/mission-failure.json); both recovery messages remained visible. Browser request-abort routing did not reproduce a failure, so these checks used deterministic WebGL/fetch failures instead.

For menu checks, open a fresh development game with agent-browser, wait for `window.__environment.mission.ready` and the removal of `html[data-loading]`, then run `agent-browser eval --stdin < scripts/check-menus.js`. Reload afterward to restore the untouched mission.
