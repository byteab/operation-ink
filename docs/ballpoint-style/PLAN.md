# Ballpoint game style

Status: the latest user revision replaces all blue ink with black, with neutral gray for lighter marks and secondary UI. This supersedes the blue palette and blue-ink guidance recorded below. A subsequent background revision uses pure white paper (#ffffff), neutral light-gray panel shading and neutral paper grain, superseding the warm-paper values below. Blood uses red droplets, splashes and pools in both the game and lab, overriding the earlier single-ink guidance. Geometry, stroke weights and distance taper remain unchanged. Browser verification remains paused for user review. See [implementation and checks](IMPLEMENTATION.md).

## Intent and reference

Make the game look like a high-school student drew a first-person shooter with one blue ballpoint pen on a blank sheet of paper. The drawing should have hesitant, retraced lines, uneven pressure and local scribbling, while keeping the map and action readable.

The [user's supplied image](reference.png) is the visual target. Its most important relationships are:

- The sky, walls and ground are mostly untouched white paper.
- Architecture has long, slightly wavering lines, partial second attempts, small overshoots and darker intersections.
- Roofs and shaded structural parts have sparse diagonal hatching. Most wall faces stay empty.
- The foreground gun and hands have much denser overlapping marks than the scenery, with paper still visible between strokes.
- People are simple, dark blue stick figures. Trees are quick angular branch drawings.
- Perspective remains coherent. The imperfection is in the marks, rather than a continuously wobbling world.

The latest user revision overrides the reference foreground treatment: use near-white paper with only faint yellow-brown warmth; solid black characters; fuller first-person arms with bold blue contours and paper interiors; guns drawn as continuous blue lines over plain paper faces without texture; and heavier building/road strokes. Scenery, HUD and effects keep blue ink. Ruled notebook lines and extra school-themed props remain outside the direction.

## Approved style rules

### Paper and pigment

These are initial tuning values, not sampled measurements from the image:

| Role | Proposed colour | Usage |
| --- | --- | --- |
| Paper | `#FAF8F2` | Background and nearly all surfaces |
| NPC characters | `#000000` | Solid black silhouettes |
| Main pen | `#2645A4` | Structural outlines and readable UI |
| Dense ink | `#192F78` | Dense blue effects and small recesses |
| Light pressure | `#7184B8` | Secondary traces and sparse hatching |
| Faint ink | `#B5BDD0` | Occasional construction marks |

Treat this as one pen at different pressures. Keep paper grain barely visible. Large fields of blue fill would lose the reference's openness.

Scenery, HUD and effects use blue ink. All NPC characters, including the hostage, use solid black without hatching. FPS arms and guns use blue contours with untextured paper-coloured faces to hide rear edges. Arms have fuller tapered upper arms and forearms, with slightly bolder contours than the gun. The hostage remains identifiable by the unarmed pose, cell location and interaction prompt. Security state, danger and interactions use shape, labels and mark density. No other gameplay accent colours are added.

### Linework and shading

- A strong main contour carries the shape: 2.2 CSS px for structural building and road edges, 1.35 px for details. Selected edges get incomplete, lighter retraces.
- Gun edges use 2.1 CSS px strokes with continuous primary paths, restrained pressure variation and silhouettes on rounded pieces. FPS arm contours use 2.4 px. Paper fills are depth-offset to prevent self-occlusion; all strokes still test scene depth.
- Use gentle changes of direction and thickness, with occasional pen lifts and overshoots. Preserve recognizable roofs, doors, gun sights and fence openings.
- Use stronger marks for foreground structure, lighter marks for secondary details, and sparse marks at distance.
- In perspective views, preserve full line weight through 8 m, then taper width and sketch offsets smoothly toward 24% of their near weight. Evaluate depth per endpoint/vertex so long roads and batched scenery narrow continuously. Curved silhouettes use the same taper. Orthographic plan-view weights stay fixed.
- Hatch selected scenery surfaces in directions that describe the surface. NPC characters remain solid black; FPS hands, arms and gun surfaces have no hatching or texture.
- Keep fence mesh comparatively simple; repeating every wire would bury the scene in ink.
- Seed marks once from stable object/part identifiers. Marks must follow objects and stay still when the game is still.

### HUD and lettering

Treat interface elements as short notes in the page margins: blue lettering, drawn rules, simple boxes and underlines. Keep current information hierarchy, functional hit targets and readable ammo/health numerals. Use restrained hand-lettering for larger headings or signs; tiny copy must remain easy to read. The exact font is a prototype choice, not a dependency on a remote font service.

Keep the center of the view open. Health stays lower left, ammunition lower right, and the objective stays near the upper edge. Pause and field-map views should use the same paper and pen vocabulary.

## What the code already supports

The game uses Three.js with unlit opaque surfaces, depth-tested lines and curved-object silhouette shells. Most scenery goes through `src/render/ink.ts` and its `Draft` builder. This is a suitable base; the first approach should extend it rather than replace the renderer.

The starting point differs from the reference mainly in its mechanically straight, uniform lines; gray/green fills; smooth cone trees; black hands/figures; coloured guns and effects; and polished military UI.

Weapons, actor rigs and effects have separate material paths. Updating only `palette` would leave those parts inconsistent.

## Technical approach

1. Add one shared style configuration for paper, ink, pressure, retracing and hatching. Both world and foreground code consume it.
2. Extend existing batched contour generation with bounded subdivisions and stable seeded deviation. Preserve semantic stroke roles and line batching.
3. Add an authored hatch-patch helper for selected roof planes, recesses and structural surfaces. Keep blank areas blank.
4. Use plain black materials for NPC characters while preserving the original skinning hook. Use untextured paper materials with blue contours for weapons and fuller FPS arms. Keep the existing blue hatch decorator only for effects that still use it.
5. Adapt character, weapon, effect and UI paths to the shared style.
6. Add subtle paper texture only if the first slice needs it. A full-screen postprocessing pipeline is not a prerequisite.

### Required shared contracts

The renderer owner establishes these before other agents edit consumers. Final names can follow repository conventions:

- A single palette/style configuration with environment, foreground, figure and UI roles.
- Deterministic seed derivation from semantic object names and part/stroke indices.
- A stroke builder accepting points, role, seed and a bounded retrace/detail profile; it returns batched render geometry.
- A hatch-patch builder accepting local origin, two surface axes, dimensions, density and seed. Its result is decorative and excluded from collision.
- A `MeshBasicMaterial` decorator that composes shader hooks and shader cache keys rather than replacing existing hooks.
- Shared resize and per-eye viewport handling for any new screen-space stroke widths.
- Explicit disposal ownership for new geometry, materials and textures.

### Constraints discovered in the repository

- `src/player/collision.ts` excludes `ShaderMaterial` meshes when building colliders. Replacing solid `MeshBasicMaterial` walls/floors with standalone shader materials can silently remove movement, sight and bullet blocking. Keep existing solid material types and compose `onBeforeCompile` for the first implementation.
- Additional decorative meshes must set `userData.noCollision`. Do not distort physical surfaces, alter collision panels or move door hinges to simulate drawing errors.
- `Draft.solid()` deletes UVs and merges geometry by fill. Hatching needs appropriate object-space coordinates or deliberately preserved attributes; normal UV textures cannot simply be assumed.
- `src/lab/rig.ts` already modifies shaders for dual-quaternion skinning. Compose the ink treatment with that hook, its uniforms and `customProgramCacheKey`. Preserve callbacks when materials are cloned.
- Marks on animated characters must use coordinates that deform with the skin; world-space noise would slide across them.
- Preserve existing depth testing and occlusion. Surface marks need controlled offset to prevent z-fighting and must not appear through walls.
- Preserve batching and bound hatch/retrace counts. Avoid one draw call per pen mark or rebuilding geometry per frame.
- Thin details need distance-aware simplification or fading when their projected spacing becomes too small. Dense fences are the primary aliasing risk.
- Existing XR rendering updates line resolution per eye. Preserve that behavior even though desktop is the first review target.

## Subagent implementation plan

Three read-only reviews informed this plan: renderer architecture, scene/UI integration, and project environment. Implementation can use three child agents plus the root agent, within the four-agent limit.

| Owner | File ownership | Deliverable |
| --- | --- | --- |
| Renderer agent | `src/render/*`, `src/main.ts`, renderer integration in `src/lab/main.ts` | Shared style tokens, stable sketch strokes, hatch/material helpers, viewport/disposal handling |
| Environment agent | `src/world/*`, `src/game/world.ts`, `src/game/rescue-jeep.ts` | Roof/recess hatching, irregular pine marks, tower/fence/ground treatment, consistent world signs |
| Characters and foreground agent | `src/lab/rig.ts`, `src/lab/weapons/models/*`, `src/game/weapons.ts`, `src/game/actors.ts`, `src/game/hostage-actor.ts`, relevant impact/blood/effect files | Untextured line-drawn guns, fuller outlined FPS arms, black figures, readable unarmed hostage, coherent blue effects, preserved animation hooks |
| Root: UI and integration | `src/game/hud.ts`, `src/game/game.css`, `src/style.css`, `src/interactions.ts`, documentation and coordinated checks | Paper-note HUD, map/alerts/copy consistency, integration, user review handoff and later verification |

Agents should not independently duplicate material helpers or change another owner's files. Shared-file needs, such as effect rendering in `src/game/runtime.ts`, go through the integration owner.

### Order of work

1. **User style revisions received:** near-white paper, solid black figures, fuller outlined FPS arms, stronger continuous blue gun lines, stronger buildings/roads.
2. **Foundation and a representative slice:** define the shared contracts; apply the treatment to one existing building/tower/fence/tree composition and the starting pistol/hands. This must demonstrate strong scenery outlines, black figures and untextured line-drawn foreground shapes.
3. **User-visible preview:** provide the local preview for judging the actual rendered look. Browser automation remains gated on the user's style approval; do not infer approval from elapsed time.
4. **Parallel rollout:** environment and character agents consume the settled foundation while root handles HUD/copy. Integrate in bounded changes without changing gameplay behavior.
5. **Authorized verification:** use `agent-browser`, as requested by the user and required by `AGENT.md`, once the user has approved the style. Fix observed problems within the approved direction.

The first slice is a rendering experiment on the existing game, not a separate illustration. The user reviews the rendered balance before browser verification.

## Later acceptance checks

### Visual

- A wide compound view immediately reads as blue ballpoint on mostly blank paper.
- Structural outlines have selective wavering/retracing and varied pressure; detail does not become a uniform double outline.
- Roofs, windows and towers remain recognizable, with hatching placed intentionally.
- NPC characters are solid black. FPS arms are visibly fuller, with bold blue outlines and plain paper interiors. Foreground guns have continuous blue outlines and plain paper faces, with no surface texture or hatching and readable sights.
- Pines resemble quick branch sketches; distant fencing remains legible.
- Figures, the hostage, interactions, security states, health and ammo remain easy to distinguish.
- Marks attach to surfaces during camera movement, aiming, reloads and character animation; still views do not shimmer.
- Pause screen, map, signs and gameplay effects use the same pen vocabulary.

### Functional and performance

After the relevant code changes, run `npm run build` and affected existing suites. Prioritize `test:player` for movement/collision, `test:weapons` for foreground/model contracts, `test:rescue` for hostage integration and `test:polish`/`test:expansion` when changing effects. Use targeted underlying checks when a whole suite would be unrelated. If rig hooks change, include relevant gait/combat/death checks; retain `test:vr` for renderer viewport changes.

Weapon and hostage appearance assertions must match solid black figures and outlined paper FPS arms, retaining all gameplay and rig invariants.

Once browser verification is authorized, inspect the opening view, a broad yard/tower view, nearby fence/pine detail, an interior, pistol aiming/reload, an animated guard/hostage, and pause/map. Use existing development hooks and stable views to collect comparable evidence. Inspect console errors and compare draw calls/frame behavior against the baseline on the same browser and viewport. Do not invent a performance pass threshold before measuring the current baseline.

## Current result

Revisions from the user's first playable review have been implemented. Source-level checks are recorded in IMPLEMENTATION.md. Browser verification remains paused pending the user's style review.
