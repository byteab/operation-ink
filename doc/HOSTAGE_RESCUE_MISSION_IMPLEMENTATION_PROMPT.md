# Implement a Hostage Rescue Mission for the First Level

Act as the lead game designer and implementation coordinator for this existing first-person tactical stickman game. Change the current first mission into a clear, readable hostage rescue operation set inside a military compound.

This is an implementation request, not a request for advice. Inspect the current mission, map, AI, interaction, alarm, camera, door, vehicle, and objective systems first. Then refine the design, update the map, implement the mission, and verify that it can be completed from start to finish.

The new mission should be easy for a player to understand: infiltrate the compound, reach the underground cells, release four hostages, escort them to a jeep, open the exit gate, and escape the military area.

## 1. Preserve the Existing Game Feel

Keep the current first-person stickman style, tactical combat, and Project IGI-inspired atmosphere. Reuse existing systems wherever they already work. Do not rewrite unrelated gameplay systems just to support this mission.

Before editing, inspect:

- the current mission objective flow;
- the compound layout, buildings, interiors, fences, doors, stairs, and collision;
- enemy AI, patrols, combat, spawning, alert states, and navigation;
- alarm, camera, interaction, HUD, and objective messaging systems;
- any existing extraction, vehicle, gate, hostage, civilian, or follow/escort logic.

Document what already exists, what can be reused, and what must be added.

## 2. Mission Premise

Replace the current mission premise with a hostage rescue:

The player infiltrates a guarded military compound where four hostages are being held in underground cells beneath one of the houses or command buildings. The player must fight or sneak through enemy patrols, disable surveillance, open a secure exit gate, release the hostages, escort them to a jeep, load them into the vehicle, and escape.

The mission should communicate this clearly through concise objective text and world layout. The player should understand what they are doing without needing a long explanation.

## 3. Required Mission Flow

Implement the mission as a structured but flexible objective chain:

1. Enter or move through the military compound.
2. Locate the building with underground stairs.
3. Go down into the underground detention area.
4. Find the jail cells or holding rooms.
5. Release four hostages.
6. Disable or avoid security cameras.
7. Open the compound exit gate.
8. Escort the hostages to the jeep.
9. Get all four hostages into the jeep.
10. Escape through the gate to complete the mission.

The player should be allowed to prepare before releasing the hostages. For example, the player may first clear enemies, disable cameras, open the gate, or reduce patrols before bringing the hostages outside.

Do not require the player to kill every enemy unless the level state makes it necessary for safe extraction. The win condition is successful hostage extraction, not total enemy elimination.

## 4. Make the Mission More Interesting

Start by improving this plan before implementation. Design the final version so it has tactical choices and tension rather than a simple linear fetch objective.

Include at least two viable approaches:

- A stealth-focused route where the player observes patrols, disables cameras, avoids triggering the alarm, opens the gate, and extracts the hostages with minimal combat.
- A combat-focused route where the player clears key areas, survives reinforcements, and creates a safe extraction path by force.

Add one or two optional advantages that reward planning, such as:

- disabling the camera system from a security computer;
- opening the exit gate before releasing the hostages;
- turning off the alarm from a wall switch or security panel;
- clearing a barracks or guard post to reduce enemy response;
- using alternate paths through interiors, alleys, rooftops, or service areas.

Difficulty should come from enemy placement, patrol timing, cameras, alarms, hostage safety, and extraction pressure. Avoid unfair detection, invisible triggers, confusing objective text, or endless enemy waves.

## 5. Map and Layout Changes

Update the map so it supports the hostage rescue mission naturally. The level should contain:

- a military compound enclosed by fences;
- a clear exit gate or fence door that the player can open;
- a jeep near the extraction route, large enough to visually hold four hostages;
- a house, command post, or detention building with stairs leading underground;
- an underground detention area with cells or holding rooms;
- at least four hostages placed in the underground area;
- patrol routes around the compound;
- barracks or houses where enemies can emerge during alarms;
- camera coverage near important routes without making the mission impossible;
- security computers or panels used to disable cameras;
- alarm switches or panels used to turn off the alarm.

The underground area should feel like a real part of the compound, not a disconnected room. Use doors, stairs, corridors, cells, simple props, and lighting or visual contrast to make it readable.

The extraction path from the cells to the jeep and from the jeep to the gate must be traversable by the player and hostages. Verify collisions, door widths, stairs, pathfinding, and line of sight.

## 6. Hostage Behavior

Implement hostages as readable non-combat characters. They should be visually distinct from enemies without breaking the stickman art style.

Required behavior:

- Hostages begin captive inside underground cells or holding rooms.
- The player releases them through a clear interaction prompt.
- Released hostages follow the player or move toward the jeep when it is safe.
- Hostages should avoid running directly into active gunfire when possible.
- Hostages should enter or attach to the jeep when they reach it.
- The HUD or objective system should show how many hostages have been rescued or loaded.
- The mission completes only after all four hostages are loaded and the player escapes.

If full hostage AI is too expensive, implement the smallest complete version that still feels coherent: for example, hostages follow the player in a simple formation and snap into seated jeep positions after reaching the vehicle interaction zone. Document any simplifications.

Prevent softlocks:

- Hostages should not get permanently stuck on stairs, doors, cells, fences, or the jeep.
- If a hostage falls behind, the player should have a way to recover them.
- Restarting or retrying should reset hostage state correctly.

Decide and document whether hostages can die. If they can, communicate mission failure clearly. If they cannot, make their protected state believable enough for gameplay.

## 7. Cameras and Alarm System

Add or improve surveillance cameras as simple readable security devices.

Camera requirements:

- Cameras should rotate or sweep across an area.
- Each camera should have a visible status light.
- A green light means normal active camera operation.
- If cameras are disabled, the light should change or turn off.
- The light should be visible on the camera object itself; it should not cast strange colored lighting across the scene.
- If a camera sees the player while active, it should trigger the alarm.

Do not make the camera visuals look weird or overly sci-fi. A simple mounted camera with a small colored indicator is enough.

Alarm behavior:

- When the alarm triggers, enemies inside barracks or houses become alert and some rush out to search or attack.
- Not every enemy should emerge at once. A believable portion of soldiers should respond first, with others remaining inside or emerging later if needed.
- Existing outdoor patrols should also react to the alarm.
- Enemies should search for the player based on last known position, camera sighting, sound, or alarm zones instead of instantly knowing the player's exact location forever.
- The player can turn off the alarm using switches or security panels.
- After the alarm is turned off, enemies should continue searching briefly, then return to posts, patrols, or barracks if they lose contact.

The compound should still feel guarded when the alarm is off. Keep normal patrols active around the map.

## 8. Barracks and Enemy Response

Use houses, barracks, or guard buildings as believable enemy sources. They can either contain real interior soldiers or act as controlled spawn/activation points, but the result should feel like soldiers are coming from occupied buildings.

Preferred behavior:

- Some soldiers patrol outside from the start.
- Some soldiers guard key locations such as the detention building, security room, gate, and jeep.
- Some soldiers are stationed inside barracks or houses.
- When the alarm triggers, a subset of indoor soldiers exits and moves to search or attack.
- If the alarm is disabled and no player contact remains, surviving soldiers eventually return to reasonable routines.

Avoid infinite enemy generation unless explicitly documented and balanced. If reinforcements are used, cap them and communicate the pressure through alarms, doors, callouts, or movement rather than silently spawning enemies behind the player.

## 9. Security Computers, Panels, and Interactions

Add clear interaction points for mission-critical actions:

- release hostages;
- disable cameras from a security computer;
- turn off the alarm from alarm switches or panels;
- open the exit gate;
- load hostages into the jeep if needed;
- start extraction or complete escape.

Use the existing interaction style if one exists. Prompts should be short and concrete, such as:

- `F Release hostage`
- `F Disable cameras`
- `F Turn off alarm`
- `F Open gate`
- `F Board jeep`

Interactions must respect distance, line of sight, object state, and objective prerequisites. They should not work through walls, repeat endlessly, duplicate hostages, or corrupt mission state.

## 10. Objective UI and Player Guidance

Keep objective text concise. The player should always know the next meaningful goal without the HUD becoming noisy.

Suggested objective sequence:

- Find the detention building.
- Reach the underground cells.
- Release the hostages: 0/4.
- Disable cameras or avoid detection.
- Open the exit gate.
- Escort hostages to the jeep: 0/4 aboard.
- Escape the compound.

Use world design, landmarks, lighting, signs, or subtle markers to guide the player. Do not rely only on a floating marker if the map itself is confusing.

When the alarm is active, show a clear alarm state in the HUD and support it with audio. When cameras are disabled or the gate is open, communicate the state change immediately.

## 11. Combat and Stealth Balance

The main hardship should be dealing with enemies who block the route to the hostages and extraction. Combat should be dangerous but readable.

Balance expectations:

- Patrols should create observation and timing opportunities.
- Guards should protect important areas.
- The player should be able to clear the area before escorting hostages.
- Triggering the alarm should make the mission harder but not instantly unwinnable.
- Reinforcements should pressure the player without becoming endless chaos.
- Hostage escort should be tense because of remaining enemies and cameras, not because hostages constantly fail pathfinding.

Make sure the player can recover from mistakes by fighting, hiding, disabling alarms, or changing route.

## 12. Mission State and Checkpoints

Implement a reliable mission-state model. Track at least:

- cameras active or disabled;
- alarm inactive, active, or recently silenced;
- gate closed or open;
- each hostage captive, released, following, loaded, missing, or dead if applicable;
- jeep extraction state;
- mission completed or failed.

Add checkpoints or restart behavior appropriate to the existing game. At minimum, death and restart must restore enemies, hostages, cameras, alarms, gate state, objective text, interactions, and jeep state consistently.

Avoid softlocks where:

- a hostage is released but cannot leave;
- the gate cannot be opened after combat;
- cameras remain permanently active after the computer is used;
- the alarm cannot be turned off;
- objective text advances out of order;
- enemies spawn inside walls or blocked rooms;
- the jeep leaves without all required hostages.

## 13. Implementation Workflow

Work in staged, verifiable increments:

1. Inspect existing code and document reusable mission, map, AI, and interaction systems.
2. Write a short mission design document with the final layout, objective graph, alarm rules, and extraction flow.
3. Build the underground detention area, exit gate, jeep extraction zone, and security room as a traversable blockout.
4. Implement mission state, objectives, and interactions.
5. Add hostages and basic release/follow/load behavior.
6. Add cameras, camera disabling, alarm triggering, and alarm shutdown.
7. Add barracks response and patrol behavior.
8. Tune combat, stealth routes, and extraction pacing.
9. Verify the full mission loop, fix defects, and record evidence.

If sub-agents are available, use them for bounded tasks such as mission design, map layout, hostage behavior, alarm/camera systems, AI response, and verification. Keep one coordinator responsible for integration and mission-state consistency.

## 14. Verification Requirements

Do not call the mission complete based only on a successful build. Verify the actual playable flow.

Required checks:

- The production build passes.
- The player can complete the mission from a fresh start.
- The player can release all four hostages.
- Hostages can reach and board the jeep.
- The exit gate can be opened.
- The mission completes only when the intended extraction condition is met.
- Cameras can detect the player and trigger the alarm.
- Cameras can be disabled from the security computer.
- The alarm brings enemies out of barracks or houses.
- The alarm can be turned off from a switch or panel.
- Enemies do not spawn endlessly or appear in impossible places.
- Hostages do not get permanently stuck on the main extraction path.
- Restart or retry restores all relevant mission state.
- At least one stealth-oriented and one combat-oriented route are playable.
- Objective text and interaction prompts are clear at every stage.

Capture screenshots or short recordings of the important states: underground cells, hostage release, camera/alarm behavior, gate opening, hostages boarding the jeep, and mission completion.

## 15. Final Delivery

Deliver:

- the implemented hostage rescue mission;
- any updated mission design or implementation notes;
- a concise summary of changed systems and files;
- instructions for running and testing the mission;
- verification results and remaining limitations.

If committing changes, use a short, one-line commit message. Do not mention Codex in commit messages or pull requests.
