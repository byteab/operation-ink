# Operation Safe Return

A playable first-person hostage rescue in the paper-and-ink military compound. Reach the underground detention cells, release the unarmed prisoner seated in cell 01, escort him to the jeep, open the east gate, and escape together. Prepare the route by disabling surveillance in the security cabin or opening the gate early. Alarms activate a finite four-soldier barracks response. Cameras show a green status light while watching and red during an alarm, turning between lookout directions with 3.5-second pauses. A fourth camera watches the mess-hall yard exit. In the first building’s signals office, approach the blue-screen computer and press **F** to disable every camera for **60 seconds**; the HUD shows the countdown, and pausing freezes it. The security cabin still offers a permanent shutdown. The alarm uses the original IGI siren and stops when silenced.

```sh
npm install
npm run dev
```

Open the local URL shown by Vite. Click **Begin mission**. You start behind the mess hall, sheltered by its rear wall. For the quieter approach, follow the wall west and open the service gate to bypass the occupied mess hall. The roof ladder and interior stairs provide the northern railway approach. **M** pauses and opens your field map. Both routes lead to detention in the eastern annex.

**Controls:** WASD move, mouse look, Shift sprint, Space jump, left click fire, right click hold aim, F use/pick up, R reload, 1–4 select weapon slot, G drop, Esc pause. Pause includes retry checkpoint, full restart, volume/mute, and reduced motion. You start with 1 pistol, 2 pump shotgun, 3 AK and 4 SMG, with ammunition for each. The AK-47 is equipped by default when starting or restarting the mission. No starting sniper. Four slots; a pickup swaps the selected weapon onto the ground when full. The shotgun fires eight pellets with short-range damage falloff, pumps between shots, and reloads one shell at a time; firing interrupts its reload while preserving loaded shells. Ammunition stays with each weapon. Retry restores the insertion checkpoint, including enemies, doors, hostages, cameras, alarm, gate and jeep.

The single hostage uses the same skinned stickman model as enemies, solid black and unarmed. He waits on a chair behind the barred door in cell 01, stands before following, and takes cover during nearby gunfire. Lead him along the marked stair and surface route; walk back or use the regroup panel if he falls behind. He boards the passenger side of the Willys-inspired jeep and sits down. Once he is aboard and the gate is open, **F Board jeep** at the driver's side starts a short scripted drive outside the compound. No kill quota is required. See the [single-hostage revision and visual checks](docs/hostage-rescue/REVISION-SINGLE-HOSTAGE.md).

- [Rescue design and agent architecture](docs/hostage-rescue/DESIGN.md)
- [Rescue map and geometry](docs/hostage-rescue/MAP.md)
- [Rescue verification and remaining limitations](docs/hostage-rescue/VERIFICATION.md)

The original exploration/experimental Quest walkthrough remains at **`/?explore=1`**. The character/animation lab remains at **`/lab.html`**.

Gameplay polish adds forward walk/run tactics, stop-and-shoot enemies, marksmen on the water and observation towers, occupied dispatch/maintenance houses, regional hit reactions and tuned damage. Find the five-round sniper rifle beside the maintenance supplies or pick one up from a defeated tower marksman. Hold right click to use the scope, starting at 4×. While scoped, press Q or scroll down to zoom out, and E or scroll up to zoom in (2×–8×). The scope shows its current magnification, and mouse sensitivity scales with zoom. Release right click to exit. Reloading, climbing, switching, pause and restart exit the scope; the selected magnification stays with the equipped rifle until you switch weapons or restore a checkpoint. Single-pellet/pistol/automatic headshots cannot kill a healthy guard outright; a sniper headshot is lethal. Health is shown at the lower left. The existing volume/mute control also covers the quiet original level music.

The water-tower marksman walks around the catwalk and pauses at varied lookout points for 3–7 seconds, facing outward. He holds position when engaging a target and resumes the patrol after the search ends. The observation-tower marksman keeps his fixed post. See [patrol checks and screenshots](docs/water-tower-patrol/README.md).

The compound now has 37 active guards and four inspection reserves, including 17 indoor guards in the opening mess hall, homes, barracks, warehouses and utility rooms. The three guards closest to the starting ladder were removed; authored spawns and patrols stay at least 12 metres away. Enemies must aim for at least 800 ms after acquiring or reacquiring the player before firing. Nearby guards coordinate one flanker with a teammate holding the firing lane, avoid occupied cover, and seek shelter when wounded or reloading. Search teams check separate points. Guards who see a fallen teammate investigate its location and remember the discovery across checkpoints; bodies do not reveal the player's hidden position. Wire fences and wire gates block movement but let bullets and enemy sight pass; solid posts, walls and closed doors still provide cover. A nearby missed shot makes an unaware guard scan the area before investigating the bullet's path. `npm run test:ai` checks patrol navigation and squad tactics; `npm run test:expansion` checks the expanded combat and traversal features.

Confirmed hits produce dense red blood sprays and immediate solid red splashes with irregular edges; lethal hits leave a spreading solid red pool. Faster, larger droplets stretch along their motion, and shotgun hits produce stronger bursts. Effects are bounded and restore with checkpoints. Local body/head impact cues and a distinct kill confirmation remain audible at long range and obey the volume, mute and pause controls. Guards vary their idle looks, keep weapons ready while searching, and visibly scan after a near miss.

Incoming bullets also produce directional first-person reactions: the struck hand, arm or shoulder recoils with the weapon, torso hits brace the arms, and leg hits dip the stance and tilt the view toward the injured side. A small delayed camera response follows the body and smoothly recovers without losing mouse aim. Repeated hits stay bounded; scope zoom scales the motion and Reduced Motion suppresses it. See [player hit reactions and verification](docs/player-hit-reactions/README.md); run `npm run test:player-hits` for the focused checks.

Bullets now travel as compact ink marks with white contrast rims and short tapered trails. Close enemy misses produce a directional crack, passing whizz and brief peripheral pressure; hits add a low thump, and surface impacts burst into ink chips. Reduced Motion keeps the incoming direction cue without the pressure pulse. Enemy and dropped guns also use finer outlines at combat distances. See [bullet feedback and verification](docs/bullet-juice/README.md); run `npm run test:bullets` for the focused checks.

- [Gameplay polish implementation and balance](docs/gameplay-polish/IMPLEMENTATION.md)
- [Gameplay polish verification and evidence](docs/gameplay-polish/VERIFICATION.md)

- [Original rail-mission design (historical)](docs/first-level/DESIGN.md)
- [Original implementation and handoffs (historical)](docs/first-level/STATUS.md)
- [Original mission verification (historical)](docs/first-level/VERIFICATION.md)
- [Sound provenance](docs/first-level/AUDIO.md)

```sh
npm run build
npm run test:player
npm run test:vr
npm run test:mission
npm run test:rescue
npm run test:weapons
npm run test:map
npm run test:ai
npm run test:polish
```

The 15–30-minute first-time pacing goal is provisional pending human playtesting. Browser verification uses agent-browser; input-only route automation and staged edge-case checks are distinguished in the evidence report.

# Compound environment

A fully 3D military rail compound with first-person exploration, drawn with white paper surfaces and bold, depth-tested black outlines. The supplied map determines the building footprints, tank farm, railway, workshop, towers and connected fence boundaries. The original prototype is preserved at `doc/helpers-assets/index.html`.

A short driveway and the open outer gate lead from the northern road to the mess hall's west ladder. The second, inner service-yard gate is closed.

Run `npm install`, then `npm run dev`. Open the local Vite URL (normally http://localhost:5173). `npm run build` type-checks and produces the production build; `npm run preview` serves it.

The scene uses geometry, opaque paper surfaces and ink outlines without lights, shadows or textures. Buildings have furnished military interiors and hinged doors. The workshop truck is a stationary geometry prop.

## First-person exploration

**Quest VR experiment:** the `experiment/quest-webxr` branch adds immersive headset exploration with Touch controller movement and interactions. See [the Quest testing guide](docs/quest-vr.md) for USB setup, the HTTPS alternative, controls, and limitations. Start the fixed-port test server with `npm run dev:vr`, forward port 5173 with ADB, then open `http://localhost:5173/` in Meta Quest Browser and choose **Enter VR**.

The default view starts beside the mess hall's west ladder. Click **Start walking** to capture the mouse. Walk toward the ladder, look for the blinking symbol, and press **F** to climb onto the roof. The rooftop door leads to the stairs and furnished interior. Follow the central dining aisle to the **EXIT** sign on the south wall, then press **F** to open the ground-level door into the compound yard.

| Input | Action |
| --- | --- |
| Mouse | Look around |
| W A S D / arrow keys | Walk |
| Shift + movement | Sprint |
| Space | Jump |
| F | Open / close a nearby door, or climb a ladder up / down |
| Escape | Pause and release the mouse |
| R | Return to the entrance |
| Inspect map / 1–0 | Switch to an inspection view |

The player collides with walls, closed doors, furniture, tanks, and wire fences; stairs and low steps can be walked normally. Gravity handles jumps and falls. All six ladders support automatic climbing in both directions. Interactions require a nearby, visible target in front of the player; F prompts update as doors move and respect reduced-motion preferences. If mouse capture is unavailable, hold the left mouse button and drag to look while using the same keyboard controls. **Walk the map** returns from inspection to the starting point. `?view=walk` also opens first-person mode.

Run `npm run test:player` for movement, jump, collision, staircase, all-ladder, and door interaction regression checks against the actual map geometry. Stair descent uses a continuous camera incline, and ladder boarding preserves your view. Ladder climbing plays varied original IGI rung sounds. `npm run test:traversal-audio` covers camera continuity and sound routing.

Guards have spotting, searching and combat dialogue, immediate bounded pain reactions, and separate body-impact feedback. The imported Project IGI sound bank supplies weapon reports, footsteps, ladder climbing, guard detection barks, impacts, pain, and mechanical cues, with the previous sounds as fallbacks. Character vocals now use only IGI recordings; other dialogue remains caption-only. See [sound credits](public/sounds/CREDITS.md) and [extraction details](docs/igi-audio/README.md).

## Camera inspection

| Input | Camera operation |
| --- | --- |
| Left drag / one-finger drag | Orbit |
| Right drag / two-finger drag | Pan |
| Wheel / pinch | Zoom |
| W A S D | Translate the inspection camera |
| Q / E | Lower / raise camera |
| Shift | Faster translation |
| V | Toggle free camera; left drag looks around |
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

Bookmarks are also available through `?view=overview`, `?view=yard`, `?view=rail`, `?view=tanks`, `?view=plan`, `?view=roof`, `?view=mess`, `?view=office`, `?view=water`, and `?view=watch`. Interior bookmarks enter free camera mode, with slower movement for room inspection. Inspection cameras move freely without collision. At the water tower's cable landing, look at the grip and press F to ride down to the observation tower. The observation landing is arrival-only. Weapons are lowered during transit; pause freezes the ride. VR uses a blink from the water tower to the observation landing. In development, `window.__environment` provides the player, scene inspection, door state, cutaway control, camera bookmarks and render statistics.

## Implementation

- `src/world/compound.ts`: plan coordinates, metre conversion, object placement and vegetation. Image coordinates map to X/Z with north along -Z, at 0.15 metres per reference pixel.
- `src/world/architecture.ts`: buildings, gable roofs, aligned openings, steps, containers, workshop and static truck.
- `src/world/messHall.ts`: starting building's parapet roof, exterior ladder, roof stairwell, entry room, dining hall and office.
- `src/world/doors.ts` and `src/interactions.ts`: separate hinged door leaves, occlusion-aware picking, door motion and interior cutaway.
- `src/world/industrial.ts`: fences, gates, storage tanks, braced towers, standard-gauge track and loading canopy.
- `src/world/ladders.ts`: shared pipe ladders with round rails, curved handholds and 35 cm rung spacing.
- `src/render/ink.ts`: batched opaque surfaces and screen-space line materials, plus back-face silhouettes for curved objects. Architectural and road-edge strokes are 2.2 CSS pixels nearby and taper smoothly with perspective distance; secondary details use lighter, finer strokes. Depth-tested surfaces hide occluded lines. Mesh tessellation is never rendered as a wireframe.
- `src/camera.ts`: orbit, free inspection and orthographic plan cameras.
- `src/player/`: grounded capsule movement, nearby geometry collision trees, moving door collision, ladder traversal, mouse capture, and interaction prompts. Simulation uses steps of at most 1/120 second.

Three.js reuses the prototype's WebGL / unlit-surface approach. Its maintained [LineMaterial](https://threejs.org/docs/pages/LineMaterial.html) provides screen-space stroke widths and anti-aliased line edges. Tank cylinders use 80 radial segments with separately drawn rims and a silhouette shell; smaller ladder pipes use 24 segments and smooth silhouettes. Static geometry is batched by object and material. First-person mode renders continuously while playing; paused and inspection views sleep when nothing changes.

All fourteen buildings have real entry openings and furnished interiors. The starting route enters the mess hall from the roof: use the west ladder beside the entrance drive, cross the flat roof, and descend through the rooftop doorway and stairs into the vestibule. A marked ground-level exit at the south end of the dining hall opens onto the compound yard, beyond the closed service-yard gate; the door also allows re-entry from the yard. Other camp buildings include barracks, stores, communications, medical and equipment rooms. The two elevated towers are connected by a zipline, and the water tower has a widened ring walkway. Roofs and exterior walls can be hidden together with the cutaway shortcut while floors, furnishings and interior partitions remain visible.
