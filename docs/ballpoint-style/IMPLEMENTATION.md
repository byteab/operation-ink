# Ballpoint style preview

The revised preview uses black environment outlines on white paper (`#ffffff`), solid black NPC characters, fuller FPS arms with black outlines and paper interiors, and guns with plain paper faces and stronger continuous black outlines. Blood uses solid red droplets, splashes and pools, with stronger bursts on confirmed hits. This follows the user's corrections after the previews. The local game is available at `http://localhost:5173/`.

The user will review the actual look before browser verification begins. No browser was opened and no screenshot, GPU shader compilation, frame-rate measurement or visual pass has been claimed.

## One-hand first-person pistol

- Removed the cupped support grip from the player's pistol. Only the right hand and arm are visible while carrying, aiming and firing; the left hand comes up from below for reloads and returns below view afterward. Other weapons retain their support hand.
- `npm run build`, `npm run test:weapons`, the polish weapon checks and `git diff --check` passed. Tests cover hand visibility during aiming/firing/reload, switching back and forth, reduced motion and fixed arm lengths. Browser verification remains deferred for style review.

## Solid blood and stronger hit feedback

- Removed the crosshatched coverage and pigment-density shading from all 32 blood stamps. The stamps retain irregular outlines with antialiased edges and fully filled interiors. Normal alpha blending preserves red where splashes overlap.
- Normal hits now emit 48 droplets and five immediate splashes (previously 24 and three); fatal hits emit 72 droplets and nine marks (previously 42 and six). Shotgun bursts emit 64/144 droplets for nonfatal/fatal hits, with stronger follow-up bursts. Droplets are larger, faster and stretch with velocity. The lab also has denser sprays and more splash specks.
- Mission effects remain capped at 192 droplets and 512 stains; collision, expiry, clear/dispose and deterministic checkpoint restoration checks pass.
- `npm run build` and the blood-feedback, shotgun-feedback and blood-performance checks passed. The new stamp-centre regression reproduced the grid failure before the fix and passes for all 32 stamps afterward.
- Inspected a CPU-composited preview of the actual splash, pool and droplet masks. Browser/GPU verification remains deferred for user style review. Full-map Node timing measured about 0.54 ms p95 for one fatal hit and 1.39 ms p95 at the particle cap; these are CPU simulation checks, not browser frame rates.

## Red blood revision

- Added a shared blood palette with fresh red droplets (`#cc1717`), darker rims/shading (`#7a0c0c`) and red stains/pools (`#a81010`) in the mission and animation lab.
- Blood emission, collision, spreading, particle limits and checkpoint behavior remain unchanged.
- `npm run build`, the existing blood-feedback and shotgun-feedback checks, and `git diff --check` passed after the color revisions. Browser/GPU verification has not been performed.

## White paper revision

- Set the scene, paper surfaces, UI backgrounds, browser theme and VR label background to white, retaining existing opacity. Shaded panels and paper grain now use neutral gray to remove the yellow tint.

## Black ink revision

- Replaced the shared blue rendering and UI palette with black main/dense ink, neutral gray lighter marks and muted text. Updated translucent UI effects and made VR label text follow the shared palette.
- Paper, line widths, pressure variation, perspective taper, geometry and gameplay remain unchanged.
- `npm run build` and `git diff --check` passed. No old blue palette values remain in `src`. Browser/GPU verification has not been performed.

## Earlier changes (blue ink now superseded by black)

- `src/render/ballpoint.ts` centralizes the palette, stable randomness, retraced contour geometry and surface-attached hatching. The hatch decorator remains available for blue effects; characters and guns no longer use it.
- `src/render/ink.ts` retains solid opaque collision surfaces and batched line meshes. Lines have bounded, stable screen-space deviation, per-segment pressure and selective retracing. Main building and road outlines are now 2.2 CSS px (previous preview: 1.18), with less pressure fading; detail lines are 1.35 px. Road and driveway edges use the main contour role. `Draft.hatch` supplies sparse authored shading.
- Environment roofs, recesses, windows, doors, crates, tanks, towers and jeep panels gain directional marks. Pines gain loose branch trails; road surfaces gain occasional scratches. Map dimensions and collision geometry remain unchanged.
- All NPC characters, including the hostage, use plain solid black. FPS arms now have fuller tapered geometry, paper interiors and 2.4 CSS px blue silhouettes. Gun hard edges use 2.1 CSS px screen-space strokes; rounded parts also have view-dependent silhouettes. Restrained stroke deviation and depth-offset paper faces address faint or self-occluded lines without disabling depth testing. Guns and arms have no surface hatching. Existing mounts, bone lengths, animation clips and ballistics remain intact.
- The AK's curved magazine has its own silhouette; all four pressed-rib curves use continuous 1.8 CSS px lines instead of the former one-pixel renderer.
- Perspective line widths and curved silhouettes now narrow with view-space depth. The shared taper preserves full weight through 8 m, then approaches 24% at long distances: structural baselines are about 1.36 px at 40 m and 0.80 px at 80 m. Sketch and retrace offsets shrink with the strokes. Per-endpoint/vertex evaluation works within batched roads and scenery, and also covers distant gun models. FPS arms/guns retain their nearby weight; orthographic plans keep fixed weights. No extra geometry, draw calls or per-frame CPU updates are introduced.
- Impact flecks, hit stains, muzzle flashes, shell casings, shot traces and camera indicators use the same blue palette. Active cameras have blue indicator dots; inactive dots become paper-coloured.
- HUD, pause screen, field map, signs, scope, damage feedback, VR labels and animation-lab controls use paper/blue styling. Low-health emphasis and confirmed-hit feedback use mark/weight changes rather than a second colour. Hostage instructions no longer refer to green.
- `src/render/paper.css` and a small static SVG texture add very faint paper grain to desktop views (overlay opacity reduced from 0.075 to 0.035). This overlay does not animate and cannot intercept input; it is hidden during immersive VR.

## Checks after the distance taper revision

- `npm run build` passed (TypeScript and production bundle; existing large-bundle warning remains).
- `npm run test:vr` and `git diff --check` passed.
- Inspected the installed Three.js line shader to confirm camera-space endpoints and width expansion occur after near-plane trimming. Distance taper is applied to both endpoint widths and sketch offsets, with the same function used by silhouette shaders.
- No browser or GPU verification was performed; the user is reviewing the style first.

## Checks after the foreground contour revision

- `npm run build` passed (TypeScript and production bundle; existing large-bundle warning remains).
- `npm run test:weapons` passed, including pose/bone-length checks, loadout and shotgun ballistics.
- `node scripts/check-player.mjs scripts/polish-weapon-checks.ts` passed, covering scoped fire, cancellation and muzzle obstruction.
- `npm run test:vr` passed.
- Renderer source checks confirm continuous primary edges, finite matching attributes, installed shader replacement tokens, CSS-pixel desktop sizing, per-eye XR resolution and single disposal of shared gun geometry.
- `git diff --check` passed. No browser or GPU verification was performed.

## Checks after the paper and character revision

- `npm run build` passed (TypeScript and production bundle).
- `npm run test:weapons` passed, including loadout and shotgun ballistics.
- `node scripts/check-player.mjs scripts/hostage-checks.ts` passed.
- `git diff --check` passed.
- Source inspection confirms the character skinning hook remains intact, with no hatch decorator on character bodies, FPS arms or gun surfaces.
- No browser/GPU verification was performed.

## Checks on the initial implementation

The production build (`npm run build`) passes, including TypeScript. Vite still reports a large shared bundle warning.

Existing source-level checks passed for:

- Player movement, collision, doors, stairs and ladders (`test:player`).
- Weapon mounts/poses, ammunition, reloads, muzzle obstruction and shotgun ballistics (`test:weapons`).
- Mission state, rescue geometry, hostage motion/boarding and security behavior (`test:rescue` components).
- Gameplay polish (`test:polish`).
- Fences, indoor enemies, zipline, near misses, impact lifecycle/performance, hit audio and enemy motion (`test:expansion`).
- Combat postures, recoil, shotgun feedback and death settling (`test:combat-animations`).
- Locomotion/armed/hostage gait (`test:gait`).
- VR locomotion/ladder invariants (`test:vr`).
- Map connectivity, placement and sightline checks (`test:map`, run by the environment agent).

The initial security check failed because it expected a green lamp. Only its colour expectations were updated to the approved blue/paper states, then the complete security check passed. Weapon and hostage appearance assertions were likewise updated; behavioral assertions were retained.

Renderer source checks used the installed Three.js shader chunks to verify that shader replacements exist, attributes have matching counts and finite values, sketch generation is deterministic and bounded, and dual-quaternion skinning composes exactly once with both dense guard and sparse hostage material variants. These are source checks, not a substitute for GPU/browser validation.

`git diff --check` passes. No commit was created.

## Next review

Open the game, choose **Begin mission**, and judge the lighter paper, stronger building/road strokes, black figures, fuller outlined FPS arms and stronger gun outlines. An environment inspection is available at `/?explore=1&view=yard`; the character/weapon lab is at `/lab.html`.

Once the user approves the playable style, use `agent-browser` to check rendering, camera movement, fencing/foliage at distance, weapon motion, hostage readability, HUD/map layout, console errors and frame performance. The shared material and stroke settings provide the first tuning points if the user requests a change.
