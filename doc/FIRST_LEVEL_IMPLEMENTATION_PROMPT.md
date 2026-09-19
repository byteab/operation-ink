# Build the first playable level of my stickman game

Act as the lead game designer and implementation coordinator for this repository. Design and build a complete first level for my **first-person, single-player tactical stickman game**, using specialist implementation and verification sub-agents.

I want a distinctive, enjoyable mission that rewards observation, timing, positioning, and planning. A successful first playthrough should take approximately **15–30 minutes**. Reckless play should be dangerous; thoughtful play should create satisfying opportunities. Aim for a polished, cohesive level rather than a collection of disconnected features.

This is an implementation request, not just a request for advice. **Design the mission first, document the decisions, then implement and verify it.** Make reasonable creative and technical decisions autonomously. Ask questions only when a consequential ambiguity cannot be resolved from the repository or this brief. Do not stop after delivering a plan.

## 1. Understand and preserve the existing project

Read the applicable repository instructions and inspect the current implementation before assigning changes. Treat source code as authoritative; verify documentation against it.

The project currently includes:

- A Three.js/TypeScript environment with a military compound, buildings and interiors, railway, towers, and a first-person controller.
- An unlit paper-and-ink environment style that should remain visually coherent.
- Existing collision, doors, stairs, ladders, and contextual **F** interactions.
- A separate character and animation lab at `/lab.html`, including stickman rigs, weapon models, poses, firing, reloading, reactions, and dropped-weapon behavior.
- Build and regression tooling documented in `README.md`, `src/lab/README.md`, and `package.json`.

Inventory what is reusable, what is lab-only, and what is missing. Do not assume that a lab demonstration is already a gameplay system. Reuse or extract shared code where appropriate, and keep the lab functional as a development and regression tool. Preserve existing functionality unless a deliberate change is necessary and documented.

## 2. Design the mission before changing the map

Assign a mission-design sub-agent to develop **three concise, meaningfully different concepts**, compare them, and recommend one. Choose the strongest feasible concept yourself and turn it into a concrete design document before implementation begins. This comparison is not a request to build three missions or wait for my selection.

Be creative. Recovering documents or rescuing prisoners are examples, not requirements. Avoid a generic sequence of “walk to marker, collect item, kill everyone.” The mission needs a memorable central situation or mechanic, and its objectives should affect how the player moves through and understands the compound.

The chosen design must specify:

- Mission premise, player role, motivation, starting equipment, and briefing.
- Primary objective, intermediate objectives, optional opportunities, and extraction or completion conditions.
- A clear mission-state graph, including prerequisites, alternate orderings, failure states, and recovery paths.
- An encounter and pacing breakdown showing how a first successful run plausibly lasts 15–30 minutes.
- At least two viable approaches through meaningful parts of the mission, with real tradeoffs in exposure, resources, timing, or difficulty.
- Useful observation positions, patrol windows, cover, alternate routes, and opportunities to wait deliberately or create an opening.
- At least one memorable complication or world change that follows understandable rules and gives the player a chance to respond.
- How objectives and consequences are communicated without overwhelming the screen.
- Death, retry, checkpoint, and restart behavior that preserves challenge without excessive repetition.

Difficulty should come from readable situations and consequential decisions, not unfair detection, unexplained failure, bullet-sponge enemies, mandatory idle waiting, or long empty walks. Do not require every enemy to die unless the chosen objective specifically justifies it.

Document any new mechanic needed by the design, its implementation cost, and its smallest complete version. Favor a focused, fully playable mission over ambitious dependencies that remain unfinished.

## 3. Expand the environment around the mission

Expand the current map substantially enough to support the mission, while preserving recognizable existing landmarks. Let the mission determine the layout and scale rather than adding arbitrary empty space.

Include connected areas with distinct gameplay purposes, additional buildings or houses, usable rooms, and relevant interior/exterior routes. Use the water tower, homes, service areas, rooftops, and other existing features where they strengthen the design.

Before detailed construction, create a layout plan describing each area's role, connections, sightlines, cover, patrols, and objective placement. Verify a traversable blockout before polishing it.

The finished environment must provide:

- Legible landmarks and enough environmental guidance to navigate without following a marker blindly.
- Meaningful route choices and places to observe safely, reposition, or break line of sight.
- Properly aligned entrances, doors, stairs, ladders, collision, and navigation connections.
- Functional interiors where characters can enter, exit, and move without clipping or getting stuck.
- A bounded playable space with no accidental escapes or inaccessible required objectives.

Every major new area should support an objective, encounter, route choice, or useful discovery. Maintain the established art direction and measure the cost of increased geometry and NPC activity.

## 4. Character appearance: flat, solid stickman silhouettes

Bring the existing lab characters into the game world. They remain **3D animated characters**, but should read visually like **2D stickman silhouettes**.

- Use solid black as the default character color.
- Selected characters may use a single solid color such as green or blue where it serves a clear visual purpose.
- **Do not use solid white characters.**
- Character bodies must have no visible reflection, gloss, specular highlights, shading gradients, or lighting-driven color variation. Use flat, unlit rendering appropriate to the existing renderer.
- Preserve depth testing, occlusion, animation, and spatial placement. Do not replace the characters with flat sprites.
- Check silhouettes against both interiors and outdoor backgrounds. Use pose, placement, background contrast, or restrained interface cues to preserve readability without breaking the flat-color requirement.
- Do not rely solely on body color to communicate a critical role or state.

## 5. First-person arms, weapons, and animation

Create convincing first-person stickman arms and hands that fit the character style. Project IGI and other tactical first-person shooters are references for readable weapon handling and atmosphere, not assets or designs to copy.

Keep the arms simple and stylized. Add minimal hand or finger geometry only where it improves grip readability. Weapons should feel physically held: no floating guns, visibly embedded receivers, detached wrists, or implausible arm stretching.

Implement a coherent weapon loop using suitable existing lab weapons:

- Equip, aim, fire, reload, switch weapons, and handle empty ammunition.
- Pick up weapons from the ground, including weapons dropped by defeated enemies, and support player weapon dropping with explicit inventory and ammunition rules.
- Synchronize damage, muzzle events, recoil, ammunition, reload completion, and sound with the actual gameplay action.
- Handle interrupted reloads, weapon switching, climbing, interaction, death, pause, and restart without stale animations, duplicate items, or delayed shots.
- Preserve hand contact through idle, movement, aiming, firing, reloading, and weapon transitions.
- Define weapon behavior near walls and during traversal so the viewmodel does not visibly pass through the environment or permit shooting through nearby cover.

Choose and document practical controls, resolving conflicts with existing exploration and inspection shortcuts. Keep camera motion restrained and provide reduced-motion behavior where appropriate.

Verify the arms and weapons visually in the actual first-person camera, including transitions and supported viewport sizes. Numerical attachment checks alone do not establish a convincing result.

## 6. Contextual interactions

Extend the existing interaction system into one consistent interface for doors, ladders, pickups, and mission actions.

Show **F**, an action-specific icon, and a short label when the player is close enough, looking toward a valid target, and able to use it. A ladder should have a recognizable ladder icon, a door a door icon, and so on.

Use a subtle blinking or pulsing cue where helpful, with a steady alternative for reduced motion. Prompts must respect distance, occlusion, current state, and competing targets. Show one clearly selected action at a time; do not allow interactions through walls or repeated inputs to duplicate rewards or corrupt state.

## 7. Populate the map with purposeful NPC behavior

Place characters throughout the map as part of a believable, readable routine. Include behaviors such as patrolling around the water tower, entering and leaving houses, guarding important locations, and multiple characters emerging from a building when their schedule or an event calls for it.

Assign an AI specialist to implement or adapt:

- Routine states such as idle, patrol, guard, and interior/exterior movement.
- Suspicion, investigation, confirmed detection, combat, search, and a sensible return to routine.
- Vision that respects field of view, range, and real occlusion.
- Hearing for relevant gameplay events with understandable distance and obstruction rules.
- Last-known-position tracking rather than perfect knowledge of the player through walls.
- Bounded communication between enemies; one detection should not magically inform the entire map unless a clearly established alarm system does so.
- Readable reactions and fair reaction times, weapon behavior, damage, and accuracy.
- Purposeful use of cover or repositioning where the layout supports it.
- Reliable pathfinding through relevant doorways and interiors, plus stuck recovery and collision avoidance.

Keep enemy movement, animation, weapon direction, shots, and hit detection consistent. Define how doors and mission events affect navigation. Prevent attacks through solid cover, overlapping crowds, endless pursuit without information, and unsupported movement such as walking through a closed door.

Reuse existing lab actions and add missing animations when gameplay requires them. Prioritize coherent behavior over a large collection of disconnected AI features.

## 8. Sound design

Build sound into the gameplay rather than leaving it as a final cosmetic layer. Cover weapons, impacts, footsteps, reloads, pickups, doors, ladders, enemy suspicion and alerts, combat callouts, damage, objective feedback, and environmental ambience where appropriate.

Make relevant world sounds spatial and distance-aware. Distinguish actionable cues from ambience, limit repeated callouts, and ensure important sounds remain intelligible during combat. Enemy vocal cues should clearly communicate suspicion, detection, or searching; use suitable original or properly licensed assets and document provenance.

Handle browser audio activation, pause/resume, volume or mute controls, and cleanup. Provide visual or text equivalents for information necessary to complete the mission. Avoid repetitive audio spam and silent placeholders presented as completed sound design.

## 9. Sub-agent orchestration and context management

Use a lead coordinator plus specialist sub-agents with concrete, bounded assignments. Suggested responsibilities are repository reconnaissance, mission design, map expansion, character rendering and animation, first-person weapons, AI/navigation, interactions and mission state, sound, and integration.

Use independent specialist verifiers for completed work. A verifier must inspect the implementation and evidence, reproduce relevant behavior, and report defects candidly. Verification is not simply accepting the implementing agent's summary.

Work in dependency order:

1. Inspect the repository and establish a working baseline.
2. Select the mission, document its layout and state graph, and define system interfaces.
3. Build a small integrated slice with movement, one enemy encounter, one weapon, one interaction, and objective progression.
4. Expand the map and complete the mission systems in manageable increments.
5. Integrate animation, sound, checkpoints, and the complete mission loop.
6. Playtest, review, fix, and verify the full level.

Parallelize only independent work after shared contracts are clear. Give each agent explicit file ownership, interfaces, dependencies, acceptance criteria, and a required handoff. Avoid concurrent edits to the same files; the coordinator owns integration and resolves conflicts.

Keep durable Markdown records of the mission design, architecture decisions, task ownership, integration status, known defects, and verification evidence. Each handoff should include changed files, behavior implemented, tests run, limitations, and the next dependency. Link to these records instead of repeatedly copying large source files or conversation histories into agent context.

Use available agent slots deliberately. If context becomes limited, checkpoint the exact state and next steps so work can resume without redesigning completed systems. If sub-agents are unavailable, disclose that limitation and follow the same staged workflow sequentially; never invent independent reviews.

## 10. Verification and completion criteria

Aim for excellent quality, but do not treat “10/10” or “perfect” as evidence. Reviewers should list reproducible issues with severity, expected behavior, observed behavior, and supporting evidence. A score may summarize a review, but cannot replace concrete checks.

Iterate through implementation → independent review → fixes → focused re-verification. Fix all critical and major defects before calling the level complete. Resolve smaller issues where practical and disclose any remaining ones. Do not loop indefinitely chasing a subjective perfect score or silently reduce the requested scope.

Verify at least the following:

- The production build and applicable existing regression checks pass; the character lab remains usable.
- The mission can be completed from a fresh start without debug shortcuts, including objective prerequisites and extraction/completion.
- At least two intended approaches work, and the complication behaves as designed.
- Death, retry, checkpoint restoration, and full restart restore consistent objectives, enemies, doors, inventory, pickups, and audio without softlocks.
- Detection, investigation, losing contact, searching, communication, and combat obey their documented rules.
- NPCs complete important patrol and interior routes without recurring stuck states.
- Weapon pickups, drops, reload interruptions, switching, ammunition, damage, and animation stay consistent.
- Doors, ladders, prompts, collisions, and first-person arms work in actual gameplay, including edge cases and transitions.
- Characters retain the required flat appearance, and sound cues work after normal browser startup.
- Performance is measured in representative busy scenes against a documented test environment and frame-rate target.

Use meaningful automated checks for state transitions and regression-prone logic, alongside actual visual inspection and runtime playthroughs. Capture relevant screenshots or video and record test conditions. A successful build alone is insufficient.

Record the route, elapsed time, deaths, and observations from full playthroughs. Treat 15–30-minute first-time pacing as a design target supported by evidence, not something proven by a fast debug run. If human first-time playtesting is unavailable, clearly identify pacing and subjective enjoyment as provisional.

## 11. Final delivery

Deliver the implemented level, supporting assets, design and handoff documents, and a concise report containing:

- The chosen mission and its central tactical decisions.
- What was implemented and where the main design document lives.
- How to run and play it, including controls and how to restart.
- Verification results and links to captured evidence.
- Remaining limitations or unverified claims, stated honestly.

Continue through implementation and verification rather than ending with proposed next steps. If a genuine external blocker prevents completion, finish unaffected work and record the exact blocker and resumable next action. Do not deploy, publish, or add paid services without authorization. If committing changes, use a short, one-line commit message and do not mention Codex in commits or pull requests.
