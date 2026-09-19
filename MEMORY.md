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
- Latest user revision: use black instead of blue throughout the scenery, guns, FPS arms, non-blood effects, HUD, lab and VR labels. Main/dense ink is #000000, light ink #808080 and faint ink #bdbdbd; UI secondary text uses #555555. The latest background revision uses pure white paper (#ffffff), neutral light-gray panel shading (#f5f5f5) and neutral gray paper grain, removing the yellow tint. Solid black NPC characters, plain paper gun faces, fuller FPS arms and all stroke weights remain as before. Main structural strokes are 2.2 CSS px, gun edges 2.1 px and arm contours 2.4 px. Foreground contours use screen-space strokes and curved silhouettes with depth-offset paper faces. Build and source checks passed; revised preview awaits user review.
- Blood uses solid red fills with irregular edges and no crosshatching or interior texture. The game and lab share fresh droplets #cc1717, dark rims/shading #7a0c0c and stains/pools #a81010, with normal alpha blending to keep overlapping marks red. Normal mission hits emit 48 droplets and five immediate splashes; fatal hits emit 72 droplets and nine marks. Shotgun hits emit 64/144 droplets (nonfatal/fatal), with stronger delayed bursts on lethal hits. Spray is faster and larger, with velocity-shaped droplets. Existing 192-droplet/512-stain mission caps remain. Build, blood-feedback (including all 32 solid stamp centres), shotgun-feedback and full-map blood-performance checks passed. A CPU atlas preview was inspected; no browser/GPU pass was performed.
- First-person pistols are held only in the right hand while idle, moving, aiming and firing. The left hand/arm enters from below for magazine/slide reload work, then disappears; two-handed weapons retain support. Build, weapon checks (including single-hand visibility, switching and fixed arm lengths), loadout/shotgun ballistics and polish weapon checks passed.
- The user must review the playable look before agent-browser visual verification begins. Build and source-level checks are permitted.
- Distance refinement: perspective outlines, curved silhouettes and sketch offsets now taper per vertex after 8 m toward 24% of their nearby weight. Structural strokes are about 1.36 px at 40 m and 0.80 px at 80 m. This also applies to distant held/dropped NPC guns; FPS weapons/arms stay inside the full-weight range. Orthographic plan views retain their original weights.
- Browser tooling availability has not been exercised; `agent-browser` is the specified later verification tool.
- Existing Vite server for this project is at `http://localhost:5173/`; HTTP availability confirmed. No browser was opened. See `docs/ballpoint-style/IMPLEMENTATION.md` for changes and completed source-level checks.
- Collision extraction currently excludes `ShaderMaterial` meshes. Preserve solid material types when introducing decorative shading.
- Commit messages must be short and one line. Do not mention Codex in commits or pull requests.

## Starting weapon and sniper zoom

- The AK-47 starts equipped in slot 3 on a fresh mission and on restoring the insertion checkpoint. Inventory order remains pistol, shotgun, AK, SMG.
- Sniper scope starts at 4× and adjusts from 2× to 8× in 1× steps while holding right click: Q / wheel down zooms out; E / wheel up zooms in. Held Q/E repeats. Inputs only affect an active sniper scope; wheel handling is limited to the game canvas and leaves modifier shortcuts alone.
- Scope HUD shows live magnification and control hints. Optical FOV and mouse sensitivity follow the selected magnification. Releasing aim or reloading preserves the equipped scope setting; changing weapons or restoring a checkpoint resets it to 4×. Leaving scope always restores the original camera FOV.
- Build, weapon/loadout/shotgun-ballistics checks and polish weapon checks passed, covering zoom bounds, inactive/reload input, picked-up sniper zoom, sensitivity, FOV restoration and AK checkpoint selection. No browser verification was performed.

## Armored rescue transport

- Replaced the open Willys escape jeep with the user's Humvee reference shape: enclosed two-door cabin with solid rear quarter panels, sloped hood/rear, split windshield, large treaded wheels. No roof gun or mount.
- User clarification: the entire vehicle must be white with drawn lines, like the other objects; no gray shading or colored fills, including tires and interior. It uses shared Draft paper materials, with unfilled window apertures.
- The passenger door automatically opens as the hostage approaches, closes after boarding, and resets on restart. Existing seat/footwell anchors and escape route are preserved.
- The user explicitly authorized agent-browser verification for this task. Build and rescue checks passed; agent-browser visual checks and staged boarding/escape/restart checks passed. Evidence and scope: `docs/rescue-transport/README.md`.

- Vehicle detail corrections: shortened side steps to the front-door span, leaving 0.437 m clearance from both tire envelopes, and added chassis brackets. Replaced the floating steering contour with a solid white rim, three spokes, hub, column and dashboard bracket; checked both geometry connections and side/driver views in agent-browser.

## Shotgun recoil

- Shotgun camera kick is now 0.11 radians (twice the previous amount; five times an AK shot at the same random sample), with a 0.16 s recovery time constant and 84% pitch recovery. The gun kick amplitude is 1.7; sideways kick is scaled by 0.55 to stay controlled. Ballistics and firing rate are unchanged; reduced motion suppresses the stronger camera and gun movement.
- Build, weapon/loadout/ballistics and polish weapon checks passed. Agent-browser verified the peak/recovery comparison and normal firing input; evidence and scope are in `docs/shotgun-recoil/README.md`.
