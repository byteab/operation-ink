# Responsive enemy AI with bounded awareness

Close-range guards identify the player promptly but aim for at least 800ms before firing, while distant guards need a reason to engage. Ordinary guards acquire an unprovoked player within 20m; snipers within 28m, subject to their forward cone and actual wall/door occlusion. Long-range perception extends to 60m / 110m only after personal sight, a hit, or seeing the player's muzzle flash. A missed shot in front of a guard can therefore reveal the shooter, even outside its sound range. A sound or radio report alone cannot extend sight. Contact expires after eight seconds without seeing the player. Every damaging shot rechecks visibility.

Hearing footsteps or gunfire previously used the same `spot`/`contact` recordings as visual detection. Hearing and bullet disturbance now use investigation captions without the detection bark. A visible muzzle can interrupt a near-miss scan; an unseen shot cannot. Witnesses to a guard's death investigate the body unless they actually saw the shooter.

The mission now starts behind the north wall of the mess hall/service building at `[-40, 0.15, -62.3]`, facing the path west around to the ladder. The start has supported, clear ground, no immediate enemy sightline, and a tested walking exit. Mission briefing and README directions describe the new start; the separate exploration mode retains its existing start.

## Combat behavior

Reaction and weapon presentation run together: ordinary guards use 800–1000ms reaction, snipers 900–1100ms, with 160ms planted readiness. Perception polls every 100ms outside combat and 50ms in combat. Startup staggering is bounded across the whole roster. A new sighting after lost contact requires a fresh 800ms aim period. Small tracking turns do not reset readiness; blocked attempts spend neither ammunition nor burst slots.

Enemies get an opening firing window before selecting cover/flanks, finish active bursts before moving, and interrupt an advance/flank when an exposed threat appears within nine metres. Squad flank ownership, reload shelter and separate search destinations remain. Persistently blocked lanes trigger a collision-checked lateral peek avoiding friendly bodies. A visible head over low cover can be targeted when the torso is hidden.

After feedback that the initial revision was too punishing, hit probability and sustained cadence were reduced: pistol bursts contain three rounds, AK four, SMG five, with longer pauses; sniper pauses are 2.0–2.6 seconds. Movement, distance, recoil and arm wounds reduce accuracy. Damage and enemy health are unchanged. Bullet flyby audio uses actual near-miss segments, is rate-limited, and respects mute/pause/reset. Tracers remain visible for 85ms.

Tuning lives in `ENEMY_COMBAT` and `ENEMY_WEAPONS` in `src/game/balance.ts`, plus the accuracy formula in `src/game/ai.ts`. Damage retains the existing probability-based hitscan model.

## Starting equipment and ladder approach

Keys 1–4 select pistol (12/36), pump shotgun (6/24), AK (30/90) and SMG (24/72). No sniper is issued at insertion. Four slots support pickup swaps, drops and checkpoint restoration; old two-slot snapshots remain readable. The existing procedural shotgun mesh now fires eight independently clipped hitscan pellets per shell, with spread and damage falloff. Its pump and support hand animate together; reloads insert one shell every 650ms and may be interrupted to fire without losing loaded shells. A blast counts once in mission shot statistics and produces one weapon report.

The west-aisle guard and both signals-office guards were removed. The roster is now 37 active guards plus four reserves. No authored enemy spawn or patrol segment comes within 12 metres of the starting ladder; nearby combat elsewhere can still develop naturally.

[Latest loadout and aim-delay browser results](evidence/starting-loadout-results.json) verified real number-key switching, eight pellets for one shell, pumping/reloading, 850ms first fire and 817ms reacquisition. [Shotgun at insertion](evidence/starting-shotgun.png) was visually inspected. Run `node scripts/starting-loadout-runtime.mjs` with Vite on port 5173 to repeat the staged check through agent-browser (`starting-loadout` session). `npm run test:weapons` includes shotgun, inventory, ammo, pose and ladder-clearance regression checks.

## Research

- [Epic: AI Perception](https://dev.epicgames.com/documentation/unreal-engine/ai-perception-in-unreal-engine): separate sensory stimuli, perception updates, sight retention and bounded memory.
- [mtrebi: AI_FPS](https://github.com/mtrebi/AI_FPS): tactical position queries, ally position reservation and coordinated cover/flank/search. Design reference only; no code imported. The author notes that the uploaded UE4 project cannot be built due to missing files.
- [Valve: The AI Systems of Left 4 Dead](https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf): reactive behavior and navigation remain separate concerns. The game's incremental navigation and collision checks were retained.

## Verification

- `npm run build`
- `npm run test:ai`: real-map patrols, tactics, reaction at 30/60/144fps, moving targets, walls, friendly lanes, long-range acquisition/expiry, near-miss/audio ordering, hits, heard-only stimuli, checkpoint restoration, 30 seconds of safe insertion, the walking exit, and 13 actual indoor/exterior wall sightlines.
- `npm run test:polish`: combat, animation, weapons, effects, and audio lifecycle.
- `npm run test:expansion`: indoor placement, near misses, fences, traversal, blood and hit audio.
- `npm run test:map`: spawn clearance, supported placements and patrols, routes, doors and ladders.
- `node scripts/fair-awareness-runtime.mjs`: agent-browser at `http://localhost:5173`, using dedicated session `fair-enemies`. Override `AGENT_BROWSER_CLI` for another agent-browser JS executable. This staged check uses the real map/actors, pauses regular simulation, isolates guard scenarios and records damage without ending the mission. It is not a full mission playthrough.

Awareness revision [browser evidence](evidence/fair-awareness-results.json): 15 seconds at the new insertion produced no shots, damage or detection barks. An unprovoked AK guard at 45m and sniper at 85m did not acquire the player; both returned fire after seeing a missed shot. A signals-office guard hearing outside footsteps investigated without visual detection, firing or a detection bark. [New insertion screenshot](evidence/rear-insertion.png) was visually inspected. Browser errors were empty.

Historical [response measurements](evidence/runtime-results.json) and [tracking screenshot](evidence/tracking-fire.png) record the previous, harder tuning. First-shot response remains covered by automated checks with real loaded actors; the old sustained damage/shot counts are historical. The Vite large-bundle advisory remains.
