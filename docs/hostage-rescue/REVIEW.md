# Independent Integration Review

The escort specialist reviewed mission state, runtime integration, world geometry, security, player actions, and controller changes authored by the other specialists. This is an independent cross-module review, not a claim that a fresh verification agent was spawned. It also ran an isolated `agent-browser` headless diagnostic session. The main coordinator owns the separate input-driven playthrough; the staged checks below are not a human-input playthrough.

## Findings and Corrections

1. **P1: Jeep absolute position confused with travel offset.** The jeep mesh contains local geometry and starts at the absolute extraction-route origin. Runtime synchronization assigned zero, moving the model to the map origin; escape assigned its displacement, also omitting the starting position. Corrected by restoring the route origin and assigning the absolute vehicle position during travel. Confirmed in `src/game/runtime.ts`.
2. **P1: Completion returned rescued passengers to the compound.** Calling escort synchronization after crossing the gate cleared the vehicle offset. The following update put the passengers back in their initial seat positions. Removed that reset at completion; restart still resets explicitly. Confirmed in `src/game/runtime.ts`.
3. **P2: Distant shots could cancel nearby danger.** Runtime retained only the most recent gunfire position, so a remote shot after a nearby shot made the escort consider its route safe. Corrected: nearby gunfire extends a persistent danger expiry independently of later distant shots. Confirmed in `src/game/runtime.ts`.
4. **P2: Field-map service route crossed the new detention wall.** The legacy straight segment to `(117,-9)` approached the wall away from the new south entrance. Corrected with intermediate points `(110,5)` and `(117,-2)`, an accurate detention footprint, and inward-aligned exit text. Confirmed in `src/game/hud.ts` and the desktop briefing screenshot.
5. **P2: New detention stairs omitted existing camera smoothing metadata.** The controller has continuous stair-camera handling but requires `kind: 'stairs'` and bottom/top/width data. Corrected with matching metadata on the new flight. Confirmed in `src/game/world.ts`.
6. **P2: Mobile ammunition text loses contrast over the weapon.** At 390 by 844, the black first-person weapon lay behind the dark-green ammunition count. Corrected with a pale background and padding on the mobile `.mission-weapon` HUD, confirmed in `src/game/game.css`. `evidence/review-mobile-gameplay.png` preserves the pre-fix finding; the coordinator verifies the final production appearance.

## Verified Contracts

- Mission interactions independently reject repeated state changes, premature boarding, missing hostages, and a closed gate. Completion requires the full passenger manifest and vehicle exit confirmation, never an enemy kill count.
- Player actions recompute distance, aim, and solid occlusion on activation. Locked cell doors and the gate are excluded from generic door interactions and automatic navigation opening.
- Camera detection uses a 0.75-second continuous dwell, physical line of sight, and a visible lamp material. Disabling cameras stops their sweep and detection without silently disabling an already active alarm.
- Alarm response communicates a fixed last-known report to guards and activates a finite reserve pool in two groups. Silencing preserves confirmed combat contact while allowing uncontacted responders to return to normal duties.
- Restart restores the saved mission and guards, door angles, weapons, health, security visuals, hostage transforms, and movement control. Insertion is the only current checkpoint.

## Executed Checks

`node scripts/check-player.mjs scripts/hostage-checks.ts`: all five checks pass against the actual compound. Every following frame validates standing capsule clearance, bounded horizontal movement, and individual stair-height changes. Tests also cover gunfire hold/resume, rally without teleportation, waiting for the player, seat attachment and vehicle offsets, and restart.

`node scripts/check-player.mjs scripts/rescue-map-checks.ts`: all five checks pass. The actual player capsule descends and ascends the basement stairs, traverses all four open cells and the escort lane, is blocked by the closed gate, passes through the open gate, and has usable sightlines to mission controls.

## Browser Diagnostics

Session `rescue-review` used the user-requested cached `agent-browser` CLI against `http://127.0.0.1:5174`, then closed only that session. Desktop viewport was 1440 by 900; mobile was 390 by 844. No browser errors were reported.

Staging was explicit: automatic runtime/player updates were temporarily replaced in that isolated page, the player was teleported to valid nearby interaction viewpoints, and real `PlayerActions.activate` calls performed releases, camera disabling, alarm silencing, gate opening, and jeep boarding. Security detection, escort movement, and vehicle travel were advanced directly through their real update methods. Guard combat was frozen. The second exterior capture advanced the already-authorized door animations explicitly. Weapon visibility and the pause overlay were temporarily hidden for unobstructed exterior photographs. These changes were confined to the browser page, not production source. The displayed elapsed mission time is therefore not a playthrough duration.

- All four cell release interactions selected the correct target and succeeded.
- Actual camera cone, dwell, and world occlusion triggered one alarm and exactly two reserve activations. All three lamps were green `56d46a`; the security computer changed them to disabled `26332b`. The alarm panel changed the alarm to silenced and the gate panel opened the gate.
- Ninety simulated seconds of actual escort updates loaded all four hostages into separate seats. No hostage status or position was assigned to force boarding.
- The actual boarding interaction locked movement. Halfway through extraction the jeep was `[165,0.05,11]` and all passenger positions had moved exactly ten metres.
- Completion placed the jeep at `[175,0.05,11]`, retained escort offset `[20,0,0]`, and retained passengers at `[174.5,0.9,10.1]`, `[174.5,0.9,11.9]`, `[175.9,0.9,10.1]`, and `[175.9,0.9,11.9]`. The mission became complete and paused normally.
- Clicking the real Retry checkpoint button restored health 100, four captive hostages at their original positions, four locked closed cell doors with zero hinge angles, four inactive reserves, active green cameras, inactive alarm, closed gate, jeep `[155,0.05,11]`, and unlocked player movement.
- Desktop and mobile screenshots show a rendered scene and fitting text. Mobile has no horizontal document overflow; the briefing scrolls vertically. Canvas pixel readback found 20 sampled colors at desktop backing size 2160 by 1350 after escape, and 194 sampled colors at mobile backing size 585 by 1266 in gameplay. Neither canvas is blank.

Screenshot evidence in `docs/hostage-rescue/evidence/`:

- `review-desktop-briefing.png`
- `review-cells-captive.png`
- `review-hostage-released.png`
- `review-camera-alarm.png`
- `review-camera-disabled.png`
- `review-four-aboard.png`
- `review-mid-escape.png`
- `review-complete-desktop.png`
- `review-complete-mobile.png`
- `review-retry-mobile.png`
- `review-mobile-gameplay.png`
- `review-extracted-passengers.png`

## Coordinator Playthrough

Separately from this staged review, the coordinator completed a fresh-insertion keyboard/mouse-driven run through the normal mission controls. `evidence/input-completion.json` records completion at 213.07 active seconds with health 100, 28 enemies defeated, 82 shots, cameras disabled, the gate open, and all four passengers loaded at the correct escaped positions. The manifest records no mission mutation, teleportation, invulnerability, enemy removal, or accelerated clock. This independently confirms that the rendered mission can complete through actual gameplay. The completion screenshot is `evidence/input-completion.png`.

Full stealth and combat balance remains distinct from these route, state, rendering, and completion checks. Camera and reserve regression checks are maintained by the security specialist.
