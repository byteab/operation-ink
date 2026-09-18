# Gameplay, AI, Combat Feedback, and Audio Polish

Act as the lead implementation coordinator for this existing first-person stickman game. Improve the current gameplay systems in the repository and verify the result in the running game. This is an implementation request, not a request for a proposal. Inspect the current code and available character, weapon, animation, and audio systems first, then make the changes in small, integrated stages.

Preserve the established stickman and paper-and-ink visual style. Reuse existing systems and assets where they are suitable. Keep the game playable throughout the work, avoid unrelated rewrites, and document any design decisions that affect balance or architecture.

## Goals

Improve the game so combat feels readable, responsive, and satisfying while enemy behavior becomes more capable and fair. The finished work should provide:

- purposeful enemy movement and combat positioning;
- stronger detection, investigation, search, and combat AI;
- reliable hit reactions for every body region;
- balanced damage and weapon behavior;
- sniper enemies and a usable zooming sniper rifle;
- clear impact, muzzle flash, blood, recoil, and other combat feedback;
- better first-person arms and hand animation;
- populated houses and more interesting encounters;
- a player health display;
- improved ladder, weapon, enemy, voice, and level music audio.

## 1. Repository reconnaissance and baseline

Before editing, inspect the repository instructions, current game architecture, character and animation systems, weapons, AI, collision/navigation, audio loading, map layout, UI, and existing checks. Identify which features already exist in the character lab or other development tools and which are actually connected to gameplay.

Run the existing build and relevant regression checks before changing code. Record the baseline results and any pre-existing failures. Do not hide or rewrite unrelated user changes in the working tree.

Create or update a durable implementation record containing:

- relevant source files and system boundaries;
- reusable existing components;
- planned task ownership and dependencies;
- baseline test results;
- decisions about animation, damage, audio, and asset licensing.

## 2. Enemy movement and combat positioning

Remove unsupported sideways enemy movement from combat behavior. Enemies should not slide or strafe sideways when the game has no appropriate sideways locomotion animation.

Implement movement that matches the available animations and the tactical situation:

- Enemies may idle, walk, or run toward a meaningful destination.
- Running should be the normal response when an enemy has a reason to close distance quickly.
- Walking should be used for cautious searches, routine movement, or situations where speed is not urgent.
- When an enemy reaches a valid combat position, it should stop, face the player, and shoot.
- Enemies may use stop-and-shoot bursts or sustained fire according to their weapon, role, and AI state.
- Enemies should choose cover, spacing, and approach routes when the map supports them.
- Movement must stop cleanly before firing so the upper body, weapon direction, and hit detection remain coherent.
- Prevent foot sliding, sideways snapping, turning in place without a suitable animation, movement through walls, and oscillation around destinations.

Use the smallest complete locomotion state machine that fits the existing animation set. If a future animation would improve the system, document it as optional rather than blocking the current implementation.

## 3. Detection, investigation, and combat AI

Strengthen enemy AI while keeping it understandable and fair. Enemies must react to events that currently fail to affect them.

Implement or improve these states and transitions:

- routine, idle, patrol, and guard;
- suspicious or alerted;
- investigate a sound or disturbance;
- confirmed detection and combat;
- search around the last known position;
- lose contact and return to a reasonable routine.

When the player shoots near or at an enemy and the player is within that enemy's plausible view range, the enemy should investigate, turn toward the disturbance, acquire the player if visible, and fire when appropriate. A missed shot must still create an understandable reaction. Do not give enemies omniscience: preserve field of view, range, occlusion, reaction time, last-known-position tracking, and bounded communication.

Make the AI stronger through better perception and decisions rather than unfair accuracy or perfect information. Verify that enemies do not see through solid cover, instantly alert the entire map without an alarm rule, pursue forever without information, or become permanently stuck in combat.

## 4. Hit reactions, damage, and death balance

Every successful hit must produce immediate, visible, and audible feedback appropriate to the body region. At minimum, support distinct reactions for:

- head hits: head or upper-body flinch and a clear impact response;
- torso hits: body recoil or stagger;
- arm hits: arm movement or weapon disruption where supported;
- leg hits: leg movement, limp, stagger, or reduced mobility where supported.

Reactions must not break locomotion, aiming, weapon ownership, collision, or later state transitions. Prevent repeated hits from silently doing nothing. Use short cooldowns or layered reactions only when necessary to avoid animation spam.

Review and rebalance weapon damage so a normal pistol shot to the head does not immediately kill an enemy. Other non-sniper weapons should also require multiple hits, with head hits dealing substantially more damage than body or limb hits. The sniper rifle is the intended exception: a properly placed sniper headshot may kill immediately. Store the values in a clear configuration so they can be tuned without scattering constants through gameplay code.

Define and verify health, armor if present, hit multipliers, death thresholds, invulnerability windows if any, and the relationship between hit reactions and actual damage. The result must feel consistent rather than artificially resistant.

## 5. Combat juice and visual feedback

Add restrained, stylized feedback to make each shot readable and satisfying while preserving the game's cartoon stickman style:

- a clear cartoon-like muzzle flash at the weapon muzzle;
- recoil and a small, controlled camera response;
- a hit effect at the actual impact location;
- stylized blood particles or decals for character hits, including limb and head impacts;
- a character flinch or stagger synchronized with the hit;
- suitable impact effects for walls and other surfaces;
- death feedback that is distinct from a normal hit.

Use pooled or bounded effects where practical. Keep blood and particles visually readable without obscuring the entire screen, degrading performance, or creating effects after an entity has been removed. Ensure effects originate from actual raycast or collision results rather than approximate screen positions.

## 6. Sniper enemies and player sniper

Place two enemy snipers on the existing water towers. They must have defensible sightlines, readable silhouettes, sensible cover or exposure, and valid navigation or combat states. If they see the player under the normal AI perception rules, they may engage with sniper weapons. Their shots must obey line of sight, range, cooldown, accuracy, damage, and reaction rules.

Add or complete the player's sniper rifle:

- picking it up or equipping it must work through the existing weapon system;
- aiming must provide a useful zoom similar in function to a classic tactical shooter scope;
- zoom must have clear enter and exit behavior, sensible sensitivity, and no camera or weapon clipping;
- firing, recoil, reload, ammo, hit detection, and sniper damage must use the same authoritative weapon pipeline as other guns;
- the rifle must be the weapon capable of an immediate kill from a valid headshot, subject to the configured balance rules.

Do not copy proprietary game assets, audio, code, or voice recordings. Use original or properly licensed replacements and record asset provenance.

## 7. First-person arms, hands, and weapon animation

Improve the player's first-person arms so they are wider, readable, and visually consistent with the stickman style. The current narrow, stiff arms and rigid hand pose should be replaced with simple full-hand shapes that read as connected stylized hands rather than detailed individual fingers.

Improve the animation for aiming, firing, recoil, reloading, weapon switching, and idle movement:

- hands should rotate and reposition naturally in three dimensions;
- the grip should stay aligned with the weapon;
- reload motion should not make the hand only move vertically;
- arms should not detach, stretch implausibly, clip through the weapon, or disappear at common camera angles;
- transitions should not leave stale poses after firing, reloading, climbing, death, pause, or restart.

Inspect the result from the actual first-person camera at gameplay resolution. Numerical transforms alone are insufficient; verify the visual result in motion.

## 8. Player health and encounter layout

Add a compact, readable HUD element in a corner of the screen showing the player's current health. It should update immediately when damage is taken and recover or reset according to the existing game rules. It must remain legible against the level, avoid covering important interaction prompts, and reset correctly after death, retry, and restart.

Populate suitable houses with characters and meaningful behavior. Houses should not feel like empty shells. Place characters where they support encounters, patrols, guards, investigation, or ambient life. Ensure interiors have valid collision, entrances, exits, and AI paths. Do not add characters only for visual density if they cannot behave reliably.

## 9. Audio and music

Improve audio as a gameplay system with clear timing, spatial placement, volume control, and cleanup.

Add or improve:

- character body-hit sounds, with variations for different hit regions where practical;
- wall and surface impact sounds;
- muzzle flashes and gunshots that match the weapon event;
- reload, weapon switch, pickup, and empty-ammo sounds;
- enemy alert, detection, search, pain, and combat callouts;
- a better ladder-climbing sound with suitable cadence and variation;
- more natural timing and pacing for spoken character lines;
- music that fits this level's atmosphere and does not obscure important combat cues.

Search for suitable assets only from sources whose license permits this project to use them. Project IGI may be used as a mood or pacing reference, but do not download or include its proprietary sound package or recordings unless the repository has clear permission. Prefer original, public-domain, Creative Commons, or otherwise commercially usable assets, and document attribution and license terms in the existing audio credits file.

Support browser audio activation, pause/resume, mute or volume controls if already present, and safe disposal of one-shot and looping sources. Prevent repeated AI callouts, ladder loops that continue after dismounting, audio playing after death, and music continuing incorrectly after restart.

## 10. Subagent execution model

Use a coordinator plus small specialist implementation and verification subagents. Break the work into bounded tasks with explicit file ownership, interfaces, dependencies, acceptance criteria, and handoffs. Do not ask one subagent to implement the entire request.

Recommended work packages:

1. Repository reconnaissance and baseline verification.
2. Enemy locomotion and combat positioning.
3. Detection, investigation, search, and combat AI.
4. Hit reactions, damage configuration, and death balance.
5. Combat feedback, blood, muzzle flash, recoil, and impact audio hooks.
6. Water-tower snipers and player sniper zoom.
7. First-person arms, hands, and weapon animation.
8. Player health HUD and house population.
9. Ladder audio, weapon and impact audio, voices, and music.
10. Integration, performance, and full gameplay verification.

For every implementation task:

- the implementing subagent must inspect relevant code, make the change, run focused checks, and write a handoff containing changed files, behavior, tests, limitations, and remaining risks;
- an independent validator must inspect the actual implementation and runtime behavior, reproduce the relevant scenario, and report defects with severity, expected behavior, observed behavior, and evidence;
- if validation finds issues, assign a follow-up fix subagent and send the result back to the same validator for re-checking;
- do not treat an implementation summary as validation;
- parallelize only tasks with established contracts and no overlapping file ownership;
- keep durable records so another agent can resume without reconstructing the whole conversation.

Use subagents deliberately to manage context. If subagents are unavailable, follow the same implementation and independent-review sequence yourself and record that limitation honestly.

## 11. Verification and acceptance criteria

Run the production build and all relevant existing checks after integration. Add focused automated checks for damage calculation, hit-region handling, AI transitions, sniper placement/configuration, health updates, and reset behavior where those systems are regression-prone. Also perform actual runtime playthroughs and visual inspection.

The work is complete only when the following are verified:

- enemies do not strafe sideways without a matching animation;
- enemies can patrol, investigate missed shots, turn toward disturbances, search last-known positions, and enter combat without omniscient detection;
- enemies stop in valid positions before firing and recover from lost targets or stuck navigation;
- hits on the head, torso, arms, and legs all create visible reactions and appropriate sound;
- pistol and other ordinary weapons require multiple hits, while a valid sniper headshot can kill immediately;
- muzzle flash, recoil, hit effects, stylized blood, impact sounds, and death feedback are synchronized with real events;
- two water-tower snipers can detect and engage the player under documented rules;
- the player sniper zooms, fires, reloads, and damages targets correctly;
- first-person arms and hands look natural during idle, aiming, firing, reloading, and switching;
- the health HUD updates and resets correctly;
- populated houses have reliable character placement and navigation;
- ladder audio, voices, combat sounds, and level music work after normal browser startup and do not loop or spam incorrectly;
- no critical or major defects remain from independent validation;
- the existing character lab and unrelated gameplay remain functional;
- performance remains acceptable in a busy encounter, with the test environment and observed frame-rate behavior recorded.

Capture useful screenshots or short recordings for visual and runtime evidence. Record test conditions, routes, defects found, fixes applied, and any limitations that remain. Do not claim completion based only on a successful build.

## Final handoff

Deliver the code, any properly licensed assets and credits, updated documentation, and a concise final report that includes:

- the systems changed and their main files;
- the configured damage and AI decisions;
- how to run and test the relevant scenarios;
- subagent implementation and validation results;
- evidence links or paths;
- known limitations and follow-up work.

If committing changes, use a short, one-line commit message. Do not mention Codex in commit messages or pull requests.
