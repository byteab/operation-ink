# Independent verification plan

Use isolated agent-browser session `combat-verify`, local development server http://localhost:5173. Do not affect the user's review session. Read the installed version-matched agent-browser core guide before interaction.

- Fences: find actual fence panel in the composed world; cast reciprocal sight and ballistic rays through its open wire area, confirm player capsule still collides, and retain a solid-wall negative control. Stage enemy and player on opposite sides to verify acquisition and damage in both directions.
- Tower cable: inspect both endpoint interaction prompts; take each direction via F, verify traversing input restrictions, smooth intermediate position and arrival on supported roof. Check interruption/restart restores normal movement.
- Population: inspect actual spawned roster for at least 40 active guards and supported, capsule-clear positions; locate occupants inside the first ladder-roof mess hall and other houses. Simulate patrol paths and report trapped or crowded placements.
- Blood: fire actual runtime shots into animated enemy hit volumes; verify visible spatter/decal evidence and stronger fatal feedback, bounded particle/decal counts, cleanup on restart.
- Audio: start via trusted Begin mission click, verify body and lethal event routing into an unlocked audio graph, assets loading and nonzero resulting playback. Compare misses and wall impacts to avoid false body sounds. Subjective sound quality requires listening.
- Near miss: shoot just beside an unaware enemy, assert no damage and suspicious scanning before investigation; repeat behind an opaque wall and distant from a guard as negative controls. Confirm no omniscient player-location knowledge.
- Liveliness: sample unaware stationary and walking actor bone transforms over time, check variation without hit-volume detachment; inspect rendered frames for hand glitches. Verify dead and reserved actors remain appropriate and combat aim stays stable.

Evidence should distinguish trusted UI playthroughs, staged runtime integration checks, visual inspection, and unit simulations. Run the relevant existing regression checks plus build after all implementations land.
