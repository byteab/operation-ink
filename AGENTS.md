# Project Stickman

A browser-based first-person hostage-rescue game ("Operation Safe Return") with a paper-and-ink look. TypeScript, Three.js (WebGL, unlit surfaces + screen-space outlines), Vite, Preact. No backend.

## Commands

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc --noEmit && vite build — this is the typecheck; run it after every change
npm test             # every scripts/*-checks.ts in Node (~45 s), prints ok/FAIL per file; rerun a FAIL with node scripts/check-player.mjs <file>
npm run test:<area>  # focused suite, see table
```

## Agent resources

- `AGENTS.md` is the canonical repository-wide guidance for coding agents.
- `.agent/` contains repository-owned workflow notes. Before verifying visible changes, read the [browser-check workflow](.agent/skills/browser-check/SKILL.md); do not rely on automatic directory discovery.
- `CLAUDE.md` is a compatibility pointer to this file; keep shared guidance here instead of duplicating it.
- Generated screenshots, recordings, and browser evidence belong in `artifacts/`, never in source or documentation directories.

| You touched                                                 | Run                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/player/` movement, collision, ladders                  | `test:player`, `test:traversal-audio`, `test:fall-damage`                    |
| `src/game/ai.ts`, `navigation.ts`                           | `test:ai`, `test:tower-patrol`                                               |
| `src/game/weapons.ts`, `weapon-models.ts`, bullets, impacts | `test:weapons`, `test:bullets`, `test:polish`                                |
| mission flow, hostage, jeep, security, gate                 | `test:rescue`, `test:escape`, `test:mission`                                 |
| player damage / death                                       | `test:player-hits`, `test:player-death`                                      |
| `src/lab/` rig, clips, gait, deaths                         | `test:gait`, `test:deaths`, `test:combat-animations`, `test:npc-transitions` |
| `src/world/` geometry                                       | `test:map`, `test:trees`, `test:player`, `test:expansion`                    |
| `src/vr/`                                                   | `test:vr`                                                                    |

## Layout

- `index.html` → `src/main.ts`: the game. `/?explore=1` is free exploration + experimental Quest WebXR. `/?view=overview` (also `yard`, `rail`, `tanks`, `plan`, `roof`, `mess`, `office`, `water`, `watch`) are inspection camera bookmarks.
- `lab.html` → `src/lab/main.ts`: character/animation lab. **The lab rig, clips and postures are shared with the game's enemies and hostage — an animation change affects both.** Read `src/lab/README.md` first.
- `src/game/`: mission runtime (`runtime.ts`, `mission.ts`), AI, weapons, HUD/menu, audio, effects. Tunables live in `balance.ts`.
- `src/world/`: compound geometry built in code from plan coordinates (0.15 m per reference pixel, north = −Z).
- `src/player/`: capsule controller, collision trees, ladders. Physics substeps are ≤ 1/120 s.
- `src/render/ink.ts`: the shared paper/ink materials. Use these; don't create ad-hoc materials.
- `public/`: `models/stickman.glb` (the one skinned character), `sounds/` (see `public/sounds/CREDITS.md`).
- `scripts/*-checks.ts`: Node logic checks. `scripts/check-*.js`, `capture-*.js`, route scripts: browser checks (see below). `scripts/agent-browser.mjs` provides the portable browser CLI launcher used by runtime checks.
- `localonly/` and `artifacts/` are git-ignored scratch space. Put screenshots and evidence there, never in the repo.

## Conventions and gotchas

- **Style:** pure white paper `#ffffff`, ink `#000000` / `#808080` / `#bdbdbd`. NPCs are solid black, the hostage is blue `#2878d0`, blood is solid red. Structural strokes are 2.2 CSS px and taper with distance. Never render mesh tessellation as wireframe.
- The stickman must read as one continuous body — no visible joints or separate limb meshes.
- Collision extraction skips `ShaderMaterial` meshes. Keep solid material types on anything that must block movement.
- Physics `dt` is capped at 50 ms; cinematics and door/gate timing use real elapsed time. Test timing-sensitive work at 30/60/144 fps like the existing checks do.
- Respect the Reduced Motion setting for any new camera or screen effect.
- Mission state must restore on checkpoint retry and full restart — add new state to both paths.
- A logic check is a plain `.ts` file that imports from `src/` and throws on failure. `scripts/check-player.mjs <file>` bundles it with rolldown and runs it in Node (CSS imports are stubbed). Add new ones as `scripts/<topic>-checks.ts`; `npm test` picks them up automatically.

## Browser verification

Always use `npx agent-browser` (not Playwright/Puppeteer). Dev builds expose `window.__environment` (game: `.mission`, `.player`) and `window.__lab` (lab `Ctx`). Browser scripts are run with `npx agent-browser eval --stdin < scripts/check-menus.js` against a freshly loaded dev page; each script's header comment says which page it needs. Reload afterwards — several scripts stub AI or enable invincibility.

Visual changes need a screenshot you have actually looked at, not just passing asserts.
