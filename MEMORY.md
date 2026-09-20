# Project memory

## Stable startup and integrated VR menu

- Initial HTML stays hidden until mission initialization settles and the final camera view has rendered. This removes the unstyled VR flash and temporary ladder view; no timed splash/loading page was added. `src/startup.ts` also handles module/renderer failures with a reload action, while mission asset errors reveal the existing error menu.
- Home menu now has a VR page with the original headset support/Enter VR controls and controller instructions. Moving the existing panel preserves its listeners and browser user activation. VR remains exploration with the mission paused; `/?explore=1` retains its standalone controls.
- Build, VR locomotion and player checks passed. User-authorized agent-browser verified startup frames in development/production, all 37 menu checks, desktop/narrow layouts, simulated headset availability/permission rejection with real click activation, and renderer/model failure recovery. No actual headset session was tested. Evidence: `docs/startup-menu/README.md`.

## Solid transport and three-second exit gate

- Removed the rescue jeep's collision exclusion; added closed body volumes and dynamic collider refresh for the moving car and its passenger door. Visible geometry now supplies physical cover too. The hostage approach clears the side step/wheels and outward door swing; boarding and the driver F target remain reachable.
- Only the final exit gate has a three-second eased swing. Door updates use real elapsed time, keeping timing consistent at low FPS. Gate collision follows the hinge, and the jeep waits with “Gate opening” until fully open. Instant restart clears in-flight motion and restores car collision at the parked location.
- Build, rescue, player, escape and door-navigation checks passed, including added collision/timing regressions and actual passenger-door motion in escort checks. User authorized agent-browser: live movement stopped at all four sides, F rejected early boarding and accepted it afterward, and gate timing measured 3.0093 s normally / 3.051 s with 90 ms frame stalls. Closed/mid/open screenshots inspected; no browser/shader errors. Evidence and staged scope: `docs/transport-collision/README.md`.

## Blue hostage, chair clearance and lock light

- Hostage is now blue (`#2878d0`). Lowered the chair seat/supports to match the actual dual-quaternion skinned pelvis (seat top 0.3325 m, body bottom about 0.336 m). The first stand-up weight shift lifts slightly earlier so it also clears the seat.
- Removed the large green lock panel and its rectangular inset. The white housing now carries a 6 cm domed green indicator with a black bezel in the upper corner, clear of the central interaction marker. Unlock behavior and hinge attachment are retained.
- Build, full rescue suite and NPC transitions passed. Added actual deformed-mesh clearance checks across seated idle and every frame of standing up. Authorized agent-browser visual checks covered the seated body, stand-up, lock, actual HUD and native F release; attachment drift was zero and browser errors were empty. Evidence: `docs/hostage-seat/README.md`.

## Scene controls and completion recap

- Latest annotation: fixed buried bottom contours on building plinths, the warehouse platform, stairs and the annex barrier at [158, -12]. Contact ink sits at 0.055 m above paving that reaches 0.0425 m; solid geometry/collision stays unchanged.
- Removed Security cabin's alarm pedestal and the outdoor `escort-rally` pedestal by Crew quarters. `security-computer` is now a proper desk workstation with blue surveillance monitor, keyboard, mouse and tower. `exit-gate-control` has a distinct wide lever/keypad enclosure and gate pictogram. The exterior `detention-alarm` still silences alarms separately. Scene control construction lives in `src/game/mission-controls.ts`.
- Success menu adds actual kills and remaining health alongside elapsed time in a compact three-column recap. Health rounds like the HUD; statistics reset on Play again. Updated route tips to use walking back to the hostage now that the regroup pedestal is removed.
- Build, map and rescue suites passed. Previously authorized agent-browser fallback passed all 34 menu checks and actual F-handler checks for independent camera/alarm/gate functions. Inspected annotated locations and both new models, plus recap at 1440×900 and 320×568; no browser/shader errors. Staged scope, evidence and reproduction: `docs/scene-controls/README.md`. No full input-only rescue playthrough.

## Exterior getaway and cell lock

- Follow-up: user still found the car slow/unnatural and wanted lighter black dust. Drive is now 1.8 s (was 2.8), peak 13.89 m/s (was 9.04), with smooth acceleration and a shallow road curve instead of a sideways fishtail. Body yaw follows the route tangent and steering follows curvature. Dust is pure black with much lower opacity, density, size and lifetime; emissions interpolate over frame travel. Timings: 0.08 s launch, 1.4–1.85 s fade, 2.05–2.4 s menu.
- Found the cinematic inherited the 50 ms physics cap, making low-FPS playback slow. Runtime now receives uncapped frame elapsed time for cinematic travel/dust, keeping physics capped; visibility changes reset the frame timestamp. Build, escape checks at 10/15/30/60/144 fps and player-death checks passed. Real browser loop with 90 ms frame stalls finished in 2.403 s over 25 frames (24 capped physics steps); peak speed 13.89 m/s and no browser/shader errors. Updated dust/turn screenshots inspected.
- The cell's freestanding release pedestal is replaced by a green lock box attached to the door hinge. F Unlock uses a dynamic world interaction point and the existing release/open flow. Native F browser check showed following hostage, unlocked/open door, no old pedestal, 2.917 m lock movement and zero attachment drift.
- Build, `test:escape` (30/60/144 fps, desktop/portrait framing, gate clearance, acceleration, runtime lifecycle and dust), `test:player-death` and `test:rescue` passed. Agent-browser confirmed the exterior moving car, visible dust, passenger attachment, fade/menu and native Play again cleanup; browser/shader errors were empty. Evidence, timing and staged verification scope: `docs/escape-cinematic/README.md` and `docs/cell-lock/README.md`. No full input-only rescue run performed.

## Green hostage and smooth NPC transitions

- User requested a green hostage, faster running for hostage/enemies, and animated state transitions. Hostage color is `#229447`, travel speed is 2.6 m/s (was 2.05), and enemy running is 4.2 m/s (was 3.36). Enemy patrol walking stays unchanged; escort stride playback follows measured horizontal travel.
- Mission actors use `Player.play(..., { poseFade: true, fade: 0.22 })` and call `blendPose()` after procedural posing. Interruptions capture the visible pose; underlying mixer/IK poses are restored each frame. Ground compensation prevents interpolated legs sinking. Existing posture/flinch/death flows remain intact.
- Build, gait, escort/boarding, combat, death, AI and new multi-fps `test:npc-transitions` checks passed. One parallel patrol run missed a reserve waypoint; separate rerun passed. Agent-browser visual checks passed, enemies remained black, no browser errors. Evidence and reproduction: `docs/npc-motion/README.md`.
- The temporary playthrough invincibility has been disabled at the user's request (`MissionRuntime.invincible = false`); normal damage and death are restored, including after restarting the mission.

## Compact interaction prompts

- User requested minimal action labels after the HUD cleanup. Prompts now use one compact line: F, an icon and the short action; removed object/location descriptions and the blinking key. Ladder directions remain explicit; doors show Open/Close; zipline shows Ride zipline; pickups show Take/Swap plus the weapon name without ammo counts. Mission labels are shorter while preserving the temporary camera shutdown duration and jeep prerequisites.
- Build, weapon, mission and player suites passed. Agent-browser verified the actual roof-ladder prompt (143×40 px at 1440×900), native F descent, Climb up at 390×844, door labels and shortened mission labels; no browser errors.

## Icon-only health and ammunition

- Removed the in-play mission/objective panel, Inspect map button and movement/status text from the mission HUD. Follow-up also removes the guard/alarm status banner and bottom controls strip; notifications such as “Weapon ready” are now screen-reader-only. The M shortcut still opens the field map; exploration mode retains its controls.
- Health is a monochrome heart whose ink drains from the top. Ammunition is a magazine silhouette filled from the equipped weapon's real capacity; a small circular-arrow icon indicates reloading. User's follow-up adds a compact count beside the icon: nonempty loaded magazine plus `ceil(reserve / capacity)` spares, including partials. Weapon names and round counts remain absent visually; accessible meters retain full ammunition values. Empty hands hide the magazine. Both icons invert to white during sniper scope use.
- Follow-up browser checks passed 25 loaded/reserve/count combinations across all five weapons, hidden notification/controls/status checks, and desktop/narrow visual review. Build, weapons, player-hit and player-death suites passed.
- User authorized agent-browser without Argent. Build, weapons, mission and player-death suites passed. Browser checks covered native firing/reloading and the M shortcut, staged full/one-round/empty states for all five weapons, empty hands, health 100/50/35/1/0, and 1440×900 / 390×844 layouts. Scope contrast was visually verified. Existing browser health assertions now target the heart fill and accessible value.

## Minimal game menus

- User requested research first and substantially less menu text/clutter. Research from Game Accessibility Guidelines, NN/g progressive disclosure, and Xbox UI navigation informed compact single-purpose menus and optional Mission, Controls, and Settings pages. Sources and evidence: `docs/menu-simplification/README.md`.
- User clarified there are no checkpoints: death shows only “No way through.” and “Try again” as its main content. Try again starts a completely fresh mission immediately. Pause has Resume and Restart mission; restart confirmation offers Cancel. Internal restore snapshots remain for runtime/tests, but no checkpoint terminology or duplicate retry action appears in menus.
- `src/game/menu.ts` owns page navigation, focus, keyboard handling, and state-specific copy. M opens the mission map directly; Escape returns from subpages and resumes from pause. Controller `onPlayingChange` keeps transitions immediate, including map/resume/pause before a render frame. The default exploration controller callback is a no-op.
- User explicitly authorized agent-browser. Build, player, VR, mission and death suites passed. 31 staged browser menu checks passed; native input paths and layouts at 1440×900, 1024×600, 390×844 and 320×568 were reviewed. No browser errors. Opening screen is 14 words. No full rescue playthrough was performed.

## Ink bullets and surface splashes

- Latest shotgun damage follow-up: user requested another increase after 18→22; player pellet damage is now 28 (another ~27%). Spread, pellet count, falloff, recoil, reload and enemy shotgun damage are unchanged. Actual animated-target checks kill all centered 2m/3m cases; mean damage is ~83 at 6m, ~84 at 8m, ~41 at 16m and ~15 at 28m. The range assertion compares bands because hit-region sampling and the 100-health kill cap can reverse nearby averages. Build and the full weapon suite passed.
- Player and enemy rounds now use rounded ink heads and darker tapered wakes. Actual surface contacts trigger a wet blot, outward droplets and a projected black splatter at visual arrival; damage remains immediate. Enemy misses continue to a real surface within their weapon range instead of ending two metres beyond the player.
- `ink-splashes.ts` batches eight procedural blot variants, clipped to surface triangles and anchored to the hit mesh, including doors moving during/after flight. Stains last 45 active seconds, fade over the final five, and reuse 128 slots. Reset/disposal clear marks and pending arrivals; non-colliding effects cannot intercept shots.
- User's latest follow-up: splashes were still too big after the first reduction. Cut dimensions by more than half again (ordinary 0.16m, shotgun pellet 0.08m, sniper 0.22m before variation), reduced the contact blot to 0.038m scale, halved droplet size and reduced outward scatter.
- Latest shotgun follow-up: widened the cone another 50%, from 3° to 4.5° half-angle (originally 1.1°): about 1.57m across at 10m and 3.15m at 20m, identical for hip fire and ADS. Eight pellets still share the real muzzle; damage falloff, ammo and recoil are unchanged. Real animated-target checks retain lethal centred 2m shells, nearly lethal 3m shells and decreasing mean damage at 6/8/16/28m. Build and full weapon suite passed for this revision; full bullet suite passed for the preceding splash reduction.
- Build, bullet suite (including new real player/enemy surface integration, transformed door/edge clipping, expiry/cap/disposal and 116 actual-map contacts), weapons, AI, player, player-death and polish checks passed. Updated a stale polish check from the old 120m sniper sound radius to the existing 130m behavior. Inspected the CPU ink atlas; no browser/GPU QA was run because Argent is unavailable and the current fallback question has not been answered.

## First-person death sequence

- Latest follow-up gives fatal bullets a full-strength impact regardless of damage, including a one-point killing blow: head kick peaks at 65 ms, directional roll/yaw and shared arm/weapon recoil resolve by 420 ms into the existing fall. Initial backward movement follows the collision-checked resting path. Fall damage retains its prior motion, and Reduced Motion suppresses the kick. Extended 30/60/144 fps wall/ledge/aim checks, runtime one-point lethal handoff, and agent-browser real-loop death/retry/reduced-motion checks passed; impact and collapse frames were visually reviewed.
- Fatal player damage now runs `PlayerDeathSequence` before the menu: backward eye-height collapse, delayed skyward tilt, soft ground rebound, then menu fade. Latest user instruction removes the death circle entirely: no vignette, only uniform background blur to 10 px and dimming to 92%. Ground contact is 1.06 s, head settles by 1.44 s, dimming finishes at 3.35 s, menu fades from 3.7–4.25 s. Swept head collision and floor checks protect walls, wire panels and platform edges.
- The world must keep moving while the player falls. Death now advances blood, corpses, NPC movement, escort, projectiles/impacts and security-camera visuals until the menu opens. Dead players cannot be detected or shot. Hidden tabs and the menu still pause the world; mission active time stops at death. Combat shading now triggers only on actual damage, never on near misses; pressure cap is 0.18 instead of 0.48, with a similarly reduced damage shadow. Passing-bullet audio remains.
- Weapon/arms lower together and cannot fire or reload. Audio clears combat, plays a local player-hit recording plus descending pulse/breath, then a body-fall recording and low impact. It stays active through player pause; menu, hidden tabs, retry, inspection and disposal clean it up. Reduced Motion uses a still camera and plain fade. Retry restores all camera/weapon/UI state. Death menu hides briefing copy to keep retry visible on short windows.
- User authorized agent-browser fallback. Build, new `test:player-death` (including runtime lifecycle), audio, player-hit, weapon, player and VR checks passed. Latest follow-up passed full AI/bullet suites and security checks; browser verified actual misses cause no shading, hits trigger the weaker effect, blood settles/expires and corpse animation advances during the fall, with no death vignette or browser errors. Earlier checks covered native audio, a staged actual AK guard kill and real Retry/Resume controls. Revised screenshots: `docs/player-death/README.md`.

## Soldier running motion

- Follow-up: user selected the lab's 1.2× speed for enemy running in the actual game. `ENEMY_RUN_SPEED` is 3.36 m/s for combat/repositioning and urgent investigation, so actual travel and the existing speed-adapted clip stay synchronized. Lab default, patrol walking and hostage escort remain unchanged.
- User rejected the moonwalking run and then a restrained revision as jogging; wants visible head/body movement and a soldier's forward drive. Shared run now lasts 0.68 s at the same 2.8 m/s, with 28% contact per foot at normal speed, earlier heel recovery and fixed-length grounded legs. Walking is unchanged.
- Torso leans 19–25° through each push-off, pelvis travels 5.6 cm, shoulders counter-rotate more, and the head follows about 27 ms later at 1× with 6.9 cm of vertical travel. Run uses 241 keys to retain foot contact between samples. Faster stride variants, pause, export, enemies and hostage still share the clip.
- User authorized agent-browser fallback. Build, gait (including between-key samples, foot drift, dynamic torso/head and follow delay), combat animation/death and enemy-motion checks passed. Real Character Lab controls passed at 1×/1.5×/2×, including pause and speed continuity; final side poses inspected. The follow-up 1.2× game-speed change passed build, gait and AI checks.

## Bullet feedback and gun distance

- Follow-up enemy gunshot fix: the user reported inaudible firing. Native browser tracing found ordinary muzzle reports hard-culled beyond36m although guards engage to60m; local flybys still played. Enemy report radius now engagement range+20m (80/130m), with refDistance10m (sniper16m) and rolloff.85. Shots reserve capacity by reclaiming incidental effects then whiz layers, protecting other reports/voices/loops/hit thumps under80 sources. All5 maximum-range AI/native-route tests and real browser AK20/40/59m +sniper70/109m checks passed, including saturation/mute/pause. Helper: `scripts/check-enemy-audio.js`.

- Replaced full-path player/enemy lines with `BulletTrails`: reusable ink heads, paper contrast rims and short wakes, capped at 96 per pool; cosmetic flight 55–150 ms, 35 ms afterimage. Damage/hit tests remain immediate and unchanged. Enemy misses schedule sound at closest approach and recheck current eye position and lateral cover. Runtime clears effects on checkpoint/restart/death/inspection/VR; pause freezes travel.
- Incoming audio uses a 38 ms crack plus 150 ms spatial passing air, 90 ms gate; bullet hits add a local 130 ms low thump with an 80 ms gate. All effects share volume/mute/pause and atomic 80-source budget. Old incidental footsteps/impacts may be reclaimed for incoming cues. Native weapon reports remain intact.
- `IncomingFire` drives bounded directional edge shading and a short text cue, recovering within 650 ms. Reduced Motion suppresses shading. Surface impacts add an 85 ms ink burst capped at 24.
- Gun rendering opts into an earlier distance profile in `ballpoint.ts`: full weight through 2 m, ~55% at12m/~31% at20m/~16% at40m. Edges, offsets and curved silhouettes match; scenery/default profile stays unchanged. Shared held/drop/FPS factory; orthographic unchanged.
- User authorized agent-browser fallback and isolated subagents. Build, test:bullets/player-hits/weapons/ai/polish/player/vr and existing near-miss checks passed. Staged real-mission pointer/guard checks and GPU gun comparisons passed with no browser/shader errors. Pixel-comparison near criterion uses footprint agreement because identical GPU draws showed small pigment variance. Sources, scope and screenshots: `docs/bullet-juice/README.md`. No commits made.

## Directional player bullet reactions

- Incoming enemy rounds carry anatomical region/side, exact aimed point, travel direction and weapon into `MissionRuntime.damage`. The existing seeded hit-chance model remains; successful rounds sample torso, shoulder, arm, hand, leg or head and check cover/friendlies against that segment.
- `src/game/player-hit-reactions.ts` adds bounded deterministic finite flinch envelopes: arm/weapon response peaks first, camera follows, leg hits lower world-space eye height and lean toward the struck side. The current first-person model has arms but no visible legs. No permanent injury or movement knockback was added.
- The camera overlay is applied before weapon update and removed by `MissionRuntime.finishFrame()` immediately after rendering in `main.ts`; keep that cleanup so input, movement, traversal and checkpoints do not inherit the temporary pose. Camera cleanup retains weapon recoil. Arm IK retains fixed lengths and firing-hand connection during layered hits/reloads.
- Scope scales camera motion, Reduced Motion clears it, pause freezes it, and restore/restart/death/inspection/VR clear it. Damage values and reload/ammo behavior are unchanged.
- The user explicitly authorized agent-browser fallback without Argent for this task. Build, new `test:player-hits`, existing weapons/AI/player/traversal-audio/VR and polish weapon checks passed. Staged real-guard browser integration and visual comparison passed with no browser errors. Plan and evidence: `docs/player-hit-reactions/`.

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

## Annotated compound corrections

- The user subsequently authorized agent-browser verification. Captured and inspected forecourt, observation tower, railway, detention exterior, warehouse interior and closed/open exit views; the real F handler opens the rescue wire gate. Browser errors were empty. Evidence and staged-check scope: `docs/compound-corrections/README.md`.
- Removed the outer roadside fences around the mess-hall forecourt. The north service-yard wire gate remains permanently closed and is not registered as an interactive door. Spawn-to-annex traversal now explicitly verifies the exterior roof ladder, mess-hall stairs and yard exit.
- The tower indicated by the annotation is the observation tower near the fuel area. Moved it 3m north to `[-50.4, 15.15]`, synchronized its sniper and zipline, and connected the cross fence behind it while keeping the west service gate open.
- The rescue exit uses a hinged wire gate. Its moving collision barrier blocks bodies while passing sight and gunfire; mission control still opens it for the vehicle.
- Shortened the loading platform to X=98.4 and canopy to X=97.4, inside the annex fence at X=99; kept the full railway. Removed the separate rail entrance shelter and the low baffle beside detention at `[103, -6]`.
- Shared building walls are 0.14m thick; door frames have 0.05m jambs and 0.14m depth. Added interior wall/ceiling corners, both-face opening contours, gable/roof underside contours, and detention's missing above-ground footprint line.
- The small annex buildings are Security cabin (camera controls), Maintenance shelter (field supplies and roof ladder), and Crew house (guard quarters/reserves).
- Build and player, map, rescue-route, mission, hostage, security, indoor-enemy, door-navigation, wire-fence, tower-patrol and zipline checks passed. Zipline obstruction fixtures now follow the landing's orientation.

### Follow-up annotation cleanup

- Removed the seven floating outdoor direction boards, the fence return around the west end of the administration wing, and the concrete baffle east of detention at `[132, -18]`. Fence and baffle collision disappear with their geometry.
- Gabled buildings no longer draw a horizontal seam across either face of their end walls. Sloping roof contours, interior corners and flat-ceiling outlines remain.
- Water-tower catwalk and launch-landing top rails are now 0.8m above the deck (previously 1.1m), with matching shorter posts and middle rails.
- Build, player, map, rescue-route, tower-patrol and zipline checks passed. Map checks cover walking through the removed fence and baffle locations. No browser verification was performed for this follow-up; confirmation to use agent-browser without Argent is pending.

## Surveillance and tree update

- Removed the small signboards above all mission interaction controls. Added batched broadleaf and poplar trees among the pines; moved the annex-corner pine to [102.9, 24.75], outside both fence runs. Real-map checks verify all tree crown envelopes clear every fence panel.
- Added `mess-hall-exit-camera` on the first building's southeast corner at [-20.16, 3.45, -35.66], with a wall bracket. All four cameras have green watching/red alarm/dark offline indicators and 3.5-second holds separated by smooth 1.8-second turns. Detection uses actual pivot heading.
- The first signals-office monitor is blue and registered as `signals-office-computer`; F disables all cameras for 60 active seconds with a HUD countdown. The chair is pulled aside. Pause freezes the timer; checkpoints preserve it; restart resets it. The security-cabin terminal remains permanent and can override the temporary shutdown. Existing alarms require separate silencing.
- Added the cached original IGI `alarm_1.wav` and its manifest entry/import selection. Browser audio loops it at native pitch without stacking; silence, pause, mute, range, reset and disposal stop it. The installed WAV exactly matches the existing extracted cache; the source archive is absent.
- User explicitly authorized agent-browser verification for this task. Build, mission, security, audio, player, map and rescue-route checks passed. Agent-browser visually verified the scene and used the real F handler for computer shutdown and alarm silencing, including HUD, pause, recovery, checkpoints, restart and native audio decoding/looping. Browser errors were empty. Evidence and staged-check scope: `docs/security-upgrade/README.md`; helper: `scripts/check-security-upgrade.js`.

## Pine trees only

- The user rejected the spring/broadleaf tree designs and requested only pines with some shape randomness. Removed all non-pine generators and the rejected spring-tree preview artifacts.
- All 40 planting sites now use the original three-tier cone style, with modest seeded variation in height, width, trunk thickness, lean, tier proportions/spacing and branch strokes. `drawPine` in `src/world/vegetation.ts` hashes both planting coordinates with the shared `penSeed`/`penRandom`. Shape variation stays fixed across reloads; each tree uses 320 solid triangles and four batched draw calls when drawn alone.
- The western planting stays at plan [70,640] to keep its crown clear of the fence. Build, `test:trees` (128 actual geometry cases plus exact repeatability), and full map checks passed, including all-pine species, every fence clearance, station visibility, patrols and walking routes. Previously authorized agent-browser fallback verified four pine variations and the real mission landscape; browser errors were empty.
