# Compound environment

A fully 3D, environment-only military rail compound, drawn with unlit paper surfaces and fine, depth-tested outlines. The supplied map determines the building footprints, tank farm, railway, workshop, towers and connected fence boundaries. The original prototype is preserved at `doc/helpers-assets/index.html`.

A short driveway and the open outer gate lead from the northern road to the mess hall's west ladder. The second, inner service-yard gate is closed.

Run `npm install`, then `npm run dev`. Open the local Vite URL (normally http://localhost:5173). `npm run build` type-checks and produces the production build; `npm run preview` serves it.

The scene uses geometry, opaque paper surfaces and ink outlines without lights, shadows or textures. Buildings have furnished military interiors and hinged doors; click a door to open or close it. A small “Explore the camp” control lists the inspection shortcuts. The workshop truck is a stationary geometry prop.

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
| 6 | Starting mess hall's flat roof and ladder |
| 7 | Inside the mess hall |
| 8 | Two-person office |
| 9 / 0 | Water tower / watchtower |
| Click a door | Open / close the visible door |
| O | Open / close the door at the centre of the view |
| I | Toggle building cutaway to inspect interiors |
| R | Reset the current view |

Bookmarks are also available through `?view=overview`, `?view=yard`, `?view=rail`, `?view=tanks`, `?view=plan`, `?view=roof`, `?view=mess`, `?view=office`, `?view=water`, and `?view=watch`. Interior bookmarks enter free camera mode, with slower movement for room inspection. This is a free inspection camera, with no collision or player simulation; climbing and riding the zipline are geometry prepared for a future character controller. In development, `window.__environment` provides scene inspection, door state, cutaway control, camera bookmarks and render statistics.

## Implementation

- `src/world/compound.ts`: plan coordinates, metre conversion, object placement and vegetation. Image coordinates map to X/Z with north along -Z, at 0.15 metres per reference pixel.
- `src/world/architecture.ts`: buildings, gable roofs, aligned openings, steps, containers, workshop and static truck.
- `src/world/messHall.ts`: starting building's parapet roof, exterior ladder, roof stairwell, entry room, dining hall and office.
- `src/world/doors.ts` and `src/interactions.ts`: separate hinged door leaves, occlusion-aware picking, door motion and interior cutaway.
- `src/world/industrial.ts`: fences, gates, storage tanks, braced towers, standard-gauge track and loading canopy.
- `src/world/ladders.ts`: shared pipe ladders with round rails, curved handholds and 35 cm rung spacing.
- `src/render/ink.ts`: batched opaque surfaces and screen-space line materials, plus back-face silhouettes for curved objects. Architectural strokes are 1.05 CSS pixels; secondary details use lighter, finer strokes. Depth-tested surfaces hide occluded lines. Mesh tessellation is never rendered as a wireframe.
- `src/camera.ts`: orbit, free inspection and orthographic plan cameras.

Three.js reuses the prototype's WebGL / unlit-surface approach. Its maintained [LineMaterial](https://threejs.org/docs/pages/LineMaterial.html) provides screen-space stroke widths and anti-aliased line edges. Tank cylinders use 80 radial segments with separately drawn rims and a silhouette shell; smaller ladder pipes use 24 segments and smooth silhouettes. Static geometry is batched by object and material; the renderer sleeps until the camera, viewport or context changes.

All fourteen buildings have real entry openings and furnished interiors. The starting mess hall is entered only from the roof: use the west ladder beside the entrance drive, cross the flat roof, and descend through the rooftop doorway and stairs into the vestibule. Its ground-level entrances are sealed. Other camp buildings include barracks, stores, communications, medical and equipment rooms. The two elevated towers are connected by a zipline, and the water tower has a widened ring walkway. Roofs and exterior walls can be hidden together with the cutaway shortcut while floors, furnishings and interior partitions remain visible.
