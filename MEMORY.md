# Project memory

## Project environment

Inspected read-only on 2026-09-19 by the environment-inspector subagent. No application or browser was launched.

```json
{
  "project": "project-stickman",
  "is_react_native": false,
  "is_native_ios": false,
  "is_native_android": false,
  "platform": "browser",
  "framework": ["TypeScript", "Vite", "Preact"],
  "renderer": {
    "library": "Three.js ^0.186.0",
    "api": "WebGLRenderer",
    "style": "Unlit opaque paper surfaces, depth-tested screen-space outlines, silhouette shells for curved objects",
    "entry": "src/main.ts",
    "shared_materials": "src/render/ink.ts",
    "notes": "Static geometry is batched. First-person play renders continuously; idle inspection sleeps."
  },
  "routes": {
    "/": "Hostage-rescue game",
    "/lab.html": "Character and animation lab",
    "/?explore=1": "Exploration and experimental Quest WebXR",
    "/?view=overview": "Inspection bookmark; yard, rail, tanks, plan, roof, mess, office, water and watch bookmarks also exist"
  },
  "scripts": {
    "install": "npm install",
    "dev": "npm run dev",
    "dev_vr": "npm run dev:vr",
    "build": "npm run build",
    "build_steps": "tsc --noEmit && vite build",
    "preview": "npm run preview",
    "test_commands": [
      "test:player", "test:gait", "test:vr", "test:mission", "test:rescue",
      "test:weapons", "test:ai", "test:tower-patrol", "test:map",
      "test:expansion", "test:polish", "test:traversal-audio",
      "test:combat-animations", "test:deaths"
    ]
  },
  "tests": {
    "runner": "scripts/check-player.mjs bundles TypeScript checks with rolldown and runs them in Node",
    "browser_tooling": "agent-browser",
    "browser_instructions": "AGENT.md: Browser checks always use agent-browser",
    "browser_hooks": ["window.__environment", "window.__lab"],
    "existing_browser_scripts": [
      "scripts/rescue-revision-visual.js", "scripts/check-game-combat.js",
      "scripts/check-tower-patrol.js", "scripts/check-lab-relaxed-look.js",
      "scripts/check-lab-deaths.js", "scripts/capture-lab-contours.js",
      "scripts/capture-lab-guns.js"
    ],
    "evidence_examples": [
      "docs/water-tower-patrol/evidence/", "docs/character-relaxed-look/evidence/",
      "docs/character-death-settle/evidence/"
    ]
  },
  "project_instructions": "AGENT.md",
  "argent_available": false,
  "actions_taken": "Read-only repository inspection. No installs, launches, browser verification, tests or source edits."
}
```

## Approved ballpoint style

- See `docs/ballpoint-style/PLAN.md` for the reference interpretation, concrete file ownership, rendering constraints and subagent plan.
- The user requested a blue-pen student-doodle style and wants to verify the style before browser verification begins.
- Latest user revision: near-white paper with faint warmth (#faf8f2), solid black NPC characters, guns with continuous blue outlines and plain paper faces (no hatching/texture), and fuller FPS arms with paper interiors and slightly bolder blue outlines. Main structural strokes are 2.2 CSS px, gun edges 2.1 px and arm contours 2.4 px. Foreground contours use screen-space strokes and curved silhouettes with depth-offset paper faces. Revised preview awaits user review.
- The user must review the playable look before agent-browser visual verification begins. Build and source-level checks are permitted.
- Browser tooling availability has not been exercised; `agent-browser` is the specified later verification tool.
- Existing Vite server for this project is at `http://localhost:5173/`; HTTP availability confirmed. No browser was opened. See `docs/ballpoint-style/IMPLEMENTATION.md` for changes and completed source-level checks.
- Collision extraction currently excludes `ShaderMaterial` meshes. Preserve solid material types when introducing decorative shading.
- Commit messages must be short and one line. Do not mention Codex in commits or pull requests.
