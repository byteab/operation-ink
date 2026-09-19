# Project Stickman

A browser-based 3D hostage-rescue game with a paper-and-ink style, built with TypeScript, Three.js, Vite, and Preact.

- **Pages:** `/` game, `/lab.html` character animation lab, `/?explore=1` exploration and experimental VR.
- **Code:** `src/game/` gameplay and AI, `src/world/` environment, `src/player/` movement, `src/lab/` shared character rigs and animations.
- **Assets and tools:** `public/` models/sounds, `scripts/` checks, `docs/` feature notes.
- **Run:** `npm install` then `npm run dev`. Build with `npm run build`; test commands are in `package.json`.
- **Browser checks:** always use `agent-browser`. Animation changes affect both the lab and game.
- **More context:** `README.md`, `src/lab/README.md`, and `MEMORY.md`.
