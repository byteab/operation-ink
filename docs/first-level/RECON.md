# Repository reconnaissance and baseline

Inspected 2026-09-16 before first-level implementation. Source is authoritative. This is the durable project-environment record returned by the environment-inspector specialist.

```json
{
  "workspace_path": "/Users/ehsan/Desktop/project-stickman",
  "project_type": "vite-threejs-preact-web",
  "is_react_native": false,
  "is_expo": false,
  "is_native_ios": false,
  "is_native_android": false,
  "platforms": ["web", "experimental-webxr"],
  "package_manager": "npm",
  "lockfile": "package-lock.json",
  "node_version": "20.20.0",
  "npm_version": "10.8.2",
  "dependencies": { "three": "^0.186.0", "preact": "^10.29.8" },
  "dev_server": "npm run dev",
  "fixed_port_server": "npm run dev:vr",
  "default_port": 5173,
  "production_build": "npm run build",
  "existing_checks": ["npm run test:player", "npm run test:vr"],
  "entries": ["index.html", "lab.html"],
  "native_platform_directories": [],
  "metro_port": null,
  "ci_configuration": null,
  "argent_available": true
}
```

## Baseline results

- `npm run build`: PASS. TypeScript and both Vite entry points built. Existing warning: shared ink/Three chunk approximately 673 kB minified, 171 kB gzip, exceeds Vite's 500 kB advisory.
- `npm run test:player`: PASS. Walking/sprinting/diagonal speed/frame-rate independence, jumping, wall/fence collision, mess hall stairs, all six ladders, opening/using doors, mess hall yard exit and re-entry, and interaction distance/facing/occlusion.
- `npm run test:vr`: PASS. Quest axes/deadzone/missing controllers/speed cap, snap-turn release, floor height/heading/crouching/pivot, head-relative movement, all six instant ladder traversals.
- Lab browser checks require a running dev server and the real loaded rig. They were inventoried but not executed by reconnaissance. Four scripts: `check-lab-guns.js`, `check-lab-gun-poses.js`, `check-lab-scenarios.js`, `check-lab-dropped-guns.js`. Browser verifier should use Argent runtime evaluation, respecting the installed tooling rules, instead of assuming the README's `agent-browser` tool is installed.
- No browser, headset, audio, route, or visual verification was performed during reconnaissance.

## Existing user work to preserve

The worktree already contained experimental VR changes before this task. Modified tracked files: `README.md`, `index.html`, `package.json`, `scripts/check-player.mjs`, `src/camera.ts`, `src/main.ts`, `src/player/actions.ts`, `src/player/controller.ts`, `src/render/ink.ts`, `src/style.css`. Existing untracked content included the implementation prompt, `doc/`, `docs/quest-vr.md`, `scripts/vr-checks.ts`, and `src/vr/`. Do not reset these files or assume the branch base represents current behavior.

Current VR integration owns renderer XR animation-loop switching and exposes `player.immersive`, `camera.immersive`, `setImmersive`, and instant ladder activation. Desktop mission integration should preserve the exploration experiment or explicitly gate desktop gameplay while XR is active.

## Reusable source inventory

| Source | Existing behavior and practical reuse |
| --- | --- |
| `src/render/ink.ts` | Unlit paper surfaces, batched geometry, screen-space line widths, `Draft` primitive builder, flat palette. Use for mission buildings/props. |
| `src/world/compound.ts` | Recognizable 14-building compound, fuel annex, water/watch towers, rail spur, fences and landmarks. `mapPoint(x,y)` converts the plan with scale 0.15 m/pixel; north is −Z. |
| `src/world/architecture.ts` | `building(BuildingSpec)` creates entry openings, doors, floors, steps and furnished interiors; metadata exposes footprints, entries, interior floor. Generic buildings open on local +Z. Standard floor is 0.28 m; warehouse floor is 0.65 m. |
| `src/world/messHall.ts` | Fully traversable starting ladder → roof → stairwell → dining hall → yard exit route. |
| `src/world/doors.ts` | `createDoor`, `setDoorOpen(door, open, instant)`, `updateDoors`. `userData.kind='door'`, `open`, `width`, `height`, and marked hinge. Instant restoration is supported. |
| `src/world/ladders.ts`, `industrial.ts` | Six authored ladders with landing metadata, tanks, towers, fences/gates, railway and canopy. Zipline is a static prop. |
| `src/player/collision.ts` | Lazy local triangle trees, moving door collision, capsule resolution, step-floor support and real geometry LOS via `visible(from,to,target)`. |
| `src/player/body.ts` | Reusable physical actor body: 1.8 m capsule, radius 0.28 m, step height 0.34 m, eye height 1.65 m, walk 4.2 m/s, sprint 7.6 m/s, gravity/jump, teleport. Simulation caps dt at 0.05 and uses ≤1/120 s steps. |
| `src/player/actions.ts` | Distance/facing/LOS-ranked single door/ladder target, validation repeated on activation, animated/instant climb. Extend this arbitration for mission actions and pickups. |
| `src/player/controller.ts` | Keyboard movement, pointer lock with drag fallback, pause, respawn, prompt UI, camera sync. Has no damage, inventory, mission hooks or health. |
| `src/interactions.ts`, `camera.ts` | Inspection mode, door/cutaway rendering, bookmarks and orbit/free cameras; keep as development/exploration tools. |
| `src/lab/rig.ts`, `clip.ts`, `player.ts` | Real skinned rig, rest-pose clip construction, dual-quaternion skinning, animation crossfade/interruption and post-animation pose adjustment. Character faces +Z, ~1.74 m high. |
| `src/lab/clips/*` | In-place locomotion, idle, curious/alert/look/point/cower, damage and death poses. Suitable gameplay animation library after correct load ordering. |
| `src/lab/weapons/models/*` | Six independent geometry gun builders. Grip-centred origin, local +Z muzzle direction, +Y up, muzzle/ejection/support points, moving mechanism parts. Materials are unlit; per-gun geometry disposal helper preserves shared materials. |
| `src/lab/weapons/support.ts`, `poses.ts` | Fixed-length analytic arm fitting, grip contact and wrist orientation references. |

## Lab-only behavior and missing gameplay

`registry.ts` eagerly registers lab action buttons and module updaters only after the GLB loads. `guns.ts`, scenario actions, blood effects and dropped props operate against a lab `Ctx` with unlimited ammunition and one demonstration actor. They are references and reusable geometry/animation, not gameplay inventory, AI, health, hit detection, or authoritative timed weapon actions.

Missing at baseline: mission state/checkpoints, enemy perception/communication/search/combat, navigation graph, world population, player health/death/retry, firearm damage/aim/reload/ammunition/pickups, first-person arms, mission/pickup F targets, sound, bounded mission space, runtime mission verification and representative performance evidence.

## Critical integration constraints

1. **Collision snapshot:** `CollisionWorld` captures every non-ShaderMaterial mesh at construction. It cannot add geometry later, ignores no actor tag, and only refreshes transforms for door descendants. Construct all static mission geometry before `FirstPersonController`; add actors/viewmodels/pickups afterwards, or explicitly add collision inclusion/exclusion APIs. Otherwise a stickman/viewmodel can become a permanently frozen collider.
2. **LOS target argument:** `visible` ignores all descendants of the supplied target, then ray-tests actual static meshes and dynamic door leaves. Use a dedicated empty target for general vision/shots; do not pass the whole scene or map group, which would ignore every obstacle. A raycast distance API is still needed for first-person wall proximity and hit ordering.
3. **Interaction snapshot:** `PlayerActions` traverses doors/ladders once on construction. Late mission interactables need explicit registration or a resolver callback. Preserve exactly one arbitration result; revalidate on F. Current range is 2.65 m, facing dot at least 0.25, and LOS required.
4. **Control conflicts:** Current `R` immediately respawns. Inspection `Digit1`–`Digit0` handlers run before the camera's `walking` guard, so they override gameplay weapon slots unless explicitly gated. Reserve R for reload and move restart into pause UI (or an explicit chord). Preserve inspection shortcuts only outside the mission.
5. **Loop:** `main.ts` sleeps when player/camera/doors are idle. Mission simulation, enemy routines and ambience need an explicit active-game condition. Pause must stop simulation timers, sound and delayed gameplay actions, including while pointer lock is lost.
6. **Rig load order:** `makeClip` and `poseQuat` throw until `loadStickman()` sets exported module-level rest pose. Dynamically import clip modules after the first load. Do not import all of lab registry into the game, because that also loads demonstration actions, effects and global updater state.
7. **Rig sharing:** `rig.ts` uses shared fill, outline and DQ uniform objects; default fill is light concrete and violates the requested black gameplay silhouette. Override per-actor material safely (or add an explicit rig option) without recoloring the lab globally. Standard rig scale is retained. Multiple actors need independent skeletons and mixers; cloning only Object3D without skeleton cloning is insufficient. Shared stretch uniforms assume compatible rest skeletons and require care if using length-changing poses.
8. **Navigation:** Existing player physics is reliable but does not route around walls. Author door-centred, collision-verified navigation nodes for the mission; a direct line toward a goal is not pathfinding. Door hinges must open and animate before a path crosses the threshold. Stuck recovery must not teleport through walls.
9. **Bounds:** Base ground is a 2400 m plane and controller only respawns outside ±1150 m or below −20 m. North and rail gates are open. Mission needs deliberate playable bounds/return behavior separate from the broad exploration fallback.
10. **Renderer:** No lights, tone mapping or shadows. Character MeshBasicMaterial supports requested solid unlit silhouettes while retaining depth. Preserve screen-space ink sizing on resize and the XR-specific resolution adjustment.
11. **Testing:** `scripts/check-player.mjs` accepts a TypeScript test entry argument and bundles it for Node. Extend this for deterministic mission/inventory/AI checks, while retaining real-browser visual/playthrough checks. Production build includes only `src` in TypeScript checks; test-entry bundling alone is not full static checking.

## Recommended dependency contract

- Lead owns `main.ts`, controller/action hooks, shared contracts and integration; existing camera/controller files overlap VR user work.
- Map module returns a static group plus explicit objective, spawn, route, cover and navigation metadata; attach before collision creation.
- Mission state is serializable and advances only through validated semantic actions; checkpoint stores mission, doors, actor states, inventory/pickups and player transform together.
- AI takes fixed-step input (player position/visibility, sound events, objective events), world LOS/collision and navigation graph. It returns damage/sound/drop events and exposes serializable state.
- Weapons separate authoritative inventory/timers from rendered geometry and effects. Muzzle/damage/ammo share one accepted shot event; cancellation invalidates pending reload/action work.
- Audio receives world events rather than independently generating AI stimuli; provide subtitles for important enemy/objective signals.
- Verifier owns evidence and deterministic tests, does not accept implementer handoffs as proof of a complete playable route.

No source behavior was changed by this reconnaissance task.
