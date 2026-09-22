---
name: browser-check
description: Verify a gameplay, HUD, menu, animation or visual change in the real running game or lab with agent-browser. Use after any change whose result is visible on screen, when asked to run a scripts/check-*.js or capture-*.js script, or when asked for a screenshot of the game or lab.
---

# Browser check

Logic checks (`npm test`) don't open a browser. Anything visible needs this.

1. Make sure the dev server is up: `curl -sf localhost:5173 >/dev/null || (npm run dev > /tmp/project-stickman-vite.log 2>&1 &)`.
2. Open the right page with `npx agent-browser open <url>`:
   - game: `http://localhost:5173/` — wait until `window.__environment.mission.ready` is true
   - lab: `http://localhost:5173/lab.html` — hook is `window.__lab`
   - static camera views for scenery: `/?view=overview|yard|rail|tanks|plan|roof|mess|office|water|watch`
3. Run the matching script, if one exists (`ls scripts/check-*.js scripts/capture-*.js`; the header comment of each says which page it expects):
   `npx agent-browser eval --stdin < scripts/check-menus.js`
   A script throws on the first failed check and otherwise returns its results array.
4. If there is no matching script, drive state through the hooks with a short `eval` (teleport the player, set health, trigger the event) rather than playing through with inputs. Copy the setup/teardown pattern from `scripts/check-menus.js`. Only add a new `scripts/check-<topic>.js` when the check is worth re-running later.
5. Capture to the ignored evidence directory: `npx agent-browser screenshot artifacts/<topic>.png` and look at the image. Passing asserts are not proof of a correct picture. For layout work also check a narrow viewport (390×844).
6. Check the console for errors and shader warnings, then reload the page — several scripts stub AI or enable pointer-lock fallback or toggle invincibility.

Report which checks ran, pass/fail counts, what the screenshot showed, and anything staged instead of reaching through real input.
