# Compound environment

A fully 3D, environment-only military rail compound, drawn with unlit paper surfaces and fine, depth-tested outlines. The supplied map determines the building footprints, tank farm, railway, workshop, towers and connected fence boundaries. The original prototype is preserved at `doc/helpers-assets/index.html`.

A short driveway and two open gates connect the northern road to the west service yard; this small addition makes access through the compound's enclosures coherent.

Run `npm install`, then `npm run dev`. Open the local Vite URL (normally http://localhost:5173). `npm run build` type-checks and produces the production build; `npm run preview` serves it.

The page contains only the environment canvas. There are no characters, gameplay systems, lights, shadows, textures, HUDs or menus. The workshop truck is a stationary geometry prop.

## Camera inspection

| Input | Camera operation |
| --- | --- |
| Left drag / one-finger drag | Orbit |
| Right drag / two-finger drag | Pan |
| Wheel / pinch | Zoom |
| W A S D | Translate the inspection camera |
| Q / E | Lower / raise camera |
| Shift | Faster translation |
| F | Toggle free camera; left drag looks around |
| Escape | Leave free camera |
| 1 | Compound overview |
| 2 | Yard at architectural viewing height |
| 3 | Railway and loading platform |
| 4 | Fuel storage |
| 5 | Orthographic plan, north at the top |
| R | Reset the current view |

Bookmarks are also available through `?view=overview`, `?view=yard`, `?view=rail`, `?view=tanks`, and `?view=plan`. This is a free inspection camera, with no collision or player simulation. In development, `window.__environment` provides scene inspection, camera bookmarks and render statistics.

## Implementation

- `src/world/compound.ts`: plan coordinates, metre conversion, object placement and vegetation. Image coordinates map to X/Z with north along -Z, at 0.15 metres per reference pixel.
- `src/world/architecture.ts`: buildings, gable roofs, aligned openings, steps, containers, workshop and static truck.
- `src/world/industrial.ts`: fences, gates, storage tanks, braced towers, standard-gauge track and loading canopy.
- `src/render/ink.ts`: batched opaque surfaces and screen-space line materials, plus back-face silhouettes for curved objects. Architectural strokes are 1.05 CSS pixels; secondary details use lighter, finer strokes. Depth-tested surfaces hide occluded lines. Mesh tessellation is never rendered as a wireframe.
- `src/camera.ts`: orbit, free inspection and orthographic plan cameras.

Three.js reuses the prototype's WebGL / unlit-surface approach. Its maintained [LineMaterial](https://threejs.org/docs/pages/LineMaterial.html) provides screen-space stroke widths and anti-aliased line edges. Smooth cylinders use 80 radial segments with separately drawn rims and a silhouette shell. Static geometry is batched by object and material; the renderer sleeps until the camera, viewport or context changes.

Building doors and windows are facade details. The workshop is open geometry; the other buildings are exterior shells. The scene can be extended with separate interior geometry later.
