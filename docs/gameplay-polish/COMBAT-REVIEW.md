# Independent combat review

Date: 2026-09-17. Target: `http://127.0.0.1:5173`. Session: `polish-review-combat`, agent-browser headless. Scope: AI, actual animated actors, first-person weapons, scope and combat impact feedback. Audio implementer acts as an independent validator of these systems. Explicitly staged inventory/camera/target fixtures are labeled; the coordinator independently owns the input-only mission route.

## Final result

No unresolved critical or major defects remain in the reviewed scope. Two major defects were independently reproduced, assigned to their implementers and rechecked after fresh page loads. A sniper sound-radius mismatch was also corrected and verified at the event boundary. This is a behavioral/visual signoff; it makes no claim about perceived audio quality on physical speakers.

## Findings and rechecks

### COMBAT-001 — Gameplay camera uses overview FOV (major, fixed and rechecked)

Expected: ordinary gameplay uses the camera's configured 75-degree walk FOV and scope exit restores that FOV. Observed after normal Begin: camera FOV is 38 degrees, causing a greatly enlarged weapon and cropped hands. The coordinator independently observed a giant pistol with hands outside the frame at 1280×577 on the input-only route.

Cause confirmed by source inspection: `FirstPersonWeapons` captures `baseFov` during construction before `player.enable()` invokes `camera.enterWalk()`. Constructor receives overview FOV38; every unscoped weapon update restores it. This also constrains the scoped view relative to the wrong baseline. Reported immediately to coordinator and weapon implementer.

Weapon implementer corrected FOV ownership: capture on actual scope entry and restore only when leaving scope. Independent fresh Begin confirms 75 ordinary / 21.718455 scoped / 75 exit. At 1440×900 and 1024×768, completed idle/aim/fire/20–100% reload/switch captures for all four weapons, with correct ammo consumption, completed reload reserve transfer and visible flash. Inspected pistol idle/reload, AK idle/bolt work, SMG aim and sniper idle/scope/bolt at actual resolution. Connected broad arms and mitten grips now read clearly. Evidence: `evidence/combat/issue-001-before.png`, corrected `1440-pistol-idle.png`, `1024-sniper-aim.png` and the full pose matrix.

Initial aborted fixture (-25,1.8,-50) was inside a wall; completed weapon captures supersede those invalid views using open yard (0,1.8,-55). Actor fixture was likewise moved from behind the solid perimeter fence to exterior (0,.03,-58), then every raycast passed through the actual runtime world-occlusion and damage pipeline.

### COMBAT-002 — Revived enemy retains invisible weapon (major, fixed and rechecked)

Expected: retry/restart restores living guards with visible held weapons. Observed on an actual animated guard: sniper head death hides `actor.gun`; `actor.restore('guard')` leaves the gun hidden. Cause: restore preemptively sets `dead=false`, so the alive update's resurrection branch never restores gun visibility. Reported immediately to AI implementer and coordinator. Reproduction through the existing development surface: set target dead via actual sniper headshot, call actor.restore('guard'), inspect `gun.visible`. Evidence: head-death and subsequent actor baseline views, runtime visibility diagnostics.

After a fresh page load of the fix, independently exercised dead→guard, dead→combat and dead→patrol. All three restore a visible held gun with flash=false, kick=0 and reaction=0. Refreshed the entire six-region hit/repeat/death screenshot set after this fix; inspected `hit-thigh-L.png`, `repeat-upper_arm-R.png` and `sniper-head-death.png`. The rifle remains attached through nonlethal flinches and drops on death.

## Verified actor feedback

Actual animated target at (0,.03,-58), camera at (0,1.5,-62), all other actors temporarily reserved to isolate damage. Six raycast targets (head/chest/left+right upper arm/left+right thigh), one immediate repeated hit each. Predicted animated capsule impact equals runtime impact point for every shot. Modes: flinchHead, flinchBody, flinchArmLeft/flinchArm, flinchLegLeft/flinchLeg. Repeated hits reset clip time to .115 seconds after the same .08-second simulation advance, create eight additional droplets and apply damage again. The screenshots visibly show body bend, side-correct limb changes and localized pigment. Pistol head damage66 leaves34HP; sniper head damage130 produces0HP and dieHead. Evidence under `evidence/combat/hit-*`, `repeat-*`, `pistol-head-survives.png`, `sniper-head-death.png`.

## Verified AI and surface feedback

Both snipers used their real, unchanged level posts and real world collision. Water target (29.61645,.029,-24.04974); watch target (-35.47208,.029,4.17208). Each proceeded guard→suspicious→combat and fired three times during 12 seconds. First reports occurred at 3.767 and 3.75 seconds respectively; both remained exactly stationary. Every emitted shot had moveSpeed=0 and settledFor≥1.75. Water sniper's actual damage callback returned32 per hit. Damage callbacks were recorded instead of applied during this isolated timing fixture so player death could not truncate it. `ai-results.json` contains final diagnostics and both tower screenshots show readable enemy silhouettes on the actual structures.

Ordinary patrol and investigation rendered walk/turnL/turnR/idle/lookRelaxed. Across 1723 moving frames, the maximum horizontal component perpendicular to enemy facing was below1e-13. A heard gunshot supplied a grounded last-known point while canSee=false; investigation→search→patrol completed with no shot at the hidden remote player. A separate 18-second close-distance combat fixture exercised run, turn and walk, with511 moving frames and eight rounds—all fired at speed0 after at least1.283 seconds settled. With the player occluded behind the water tank and still within plausible distance, the sniper fired zero rounds, progressed combat→investigate→search→guard and cleared lastKnown.

An ordinary guard at (0,.03,-53) engaged a staged player at (0,.03,-49). Of38 rounds over20 seconds,20 misses hit the actual solid fence plane z=-48.0299987793 and invoked the runtime surface-impact callback with those exact collision points;18 successful damage callbacks were9 each. All shots were stationary. `enemy-wall-impact.png` shows the emitted paper/ink chips. Effect simulation was initially held while collecting callback evidence; normal animation/effect updates are used in the continuous video.

Sniper reports previously had radius36 despite110m sight range. Implementer changed sniper reports only to radius120; final fresh-page event records in `ai-results.json` confirm120, while ordinary combat reports remain36. This verifies propagation/range eligibility, not subjective audibility.

## Visual evidence, replay and limits

`weapon-motion-final.webm` records continuous rendered idle/aim/fire/full reload/switch sequences for pistol, AK, SMG and sniper at1280×720. The earlier `weapon-motion.webm` is an aborted recording setup (record start recreated the browser page); use the final file. Inspected full-resolution phase screenshots at1440×900/1024×768 and final1280×720/1280×577 views: hands remain connected and visible, scope hides the near viewmodel, scope exit restores75-degree FOV, and the shorter landscape view no longer crops away the pistol grip.

Replay with a running development server and an initialized `polish-review-combat` agent-browser session: `node scripts/polish-combat-runtime.js setup`, then `weapons`, `actors`, `ai` or `video`. Set `AGENT_BROWSER_CLI` to a binary or JS entrypoint as needed; PATH discovery and this machine's existing cached CLI are fallback options. `AGENT_BROWSER_SOCKET_DIR` is configurable. The staged script deliberately freezes normal simulation while stepping the tested systems and modifies local inventory/actors; reload the page afterwards. This complements, and does not replace, the coordinator's input-only mission route.

Screen capture and deterministic runtime checks verify state, transforms, raycasts, animation phases and cleanup; physical-device audio perception and subjective motion preference remain human judgments. No implementation code was changed by this validator; fixes were returned to their owners and rechecked independently.
