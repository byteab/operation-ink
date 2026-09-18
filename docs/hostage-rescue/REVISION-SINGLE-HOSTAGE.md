# Single-Hostage Revision

This revision supersedes the original four-hostage design and its recorded completion counts.

## Implementation

- Exactly one prisoner and one release control, in cell 01. The other holding cells are empty.
- `HostageActor` loads the same `/models/stickman.glb` and skinning shader as `EnemyActor`, with an isolated green material and no gun or combat hit volumes.
- A physical chair and barred cell door replace the standing captive presentation. Seated breathing, a 1.65-second weight-shift/stand-up clip, shared walking and cowering clips, and a 0.9-second boarding/sit-down transition run through the existing animation player.
- Escort movement is blocked until standing finishes. Ordinary interactions preserve animation progress; insertion restart restores the seated pose.
- The compact Willys-inspired jeep has an open cabin, nine-slot grille, round headlights, split windshield, dashboard, steering wheel, treaded wheels, spare tire and jerrycan. Its envelope is approximately 4.13 x 2.05 x 1.88 metres including fittings.
- Passenger and driver locations match the rebuilt model. Recessed footwells clear the passenger's legs, and wheels rotate during extraction.
- Objectives, briefing, release/gate prompts and completion checks require one hostage, not four.

## Verification

- Production build passes; the existing large shared Three.js bundle warning remains.
- `npm run test:rescue`: 26 checks across mission state, real map traversal, escort/animation/boarding, and security.
- `npm run test:player`, `npm run test:map`, and the four-weapon enemy-motion checks pass.
- Independent review found the stale boarding point and passenger/floor intersection. Both were fixed, with regressions asserting continuous boarding, proximity to the actual passenger seat, and footwell clearance.
- Headless agent-browser screenshots inspected at 1440 x 1000 and 390 x 844. Canvas pixel samples are nonblank; seated and standing poses visibly differ. No browser application errors.
- Staged browser integration uses the real F handler to release the prisoner, open the gate and board; it advances actual doors, collision refresh, escort and mission updates. The prisoner traverses the route, sits in the passenger seat, and extracts at X 175.021. Restart returns exactly one prisoner to the chair.

The browser integration is explicitly staged: `scripts/rescue-revision-visual.js` positions the player at interactions, suspends guard/camera updates and manually advances time. It is not a fresh-start combat playthrough. The older four-hostage input-only completion evidence is historical. Input replay scripts have been updated for the new prisoner count and driver-side boarding location but have not been rerun end-to-end for this revision.

## Visual Evidence

- [Prisoner behind bars](evidence/single-hostage-jail.png)
- [Seated green model and chair](evidence/single-hostage-seated.png)
- [Stand-up midpoint](evidence/single-hostage-standing-up.png)
- [Passenger seat](evidence/single-hostage-passenger.png)
- [Jeep front](evidence/willys-jeep-front.png)
- [Jeep rear](evidence/willys-jeep-rear.png)
- [Mobile prisoner](evidence/single-hostage-mobile.png)
- [Mobile jeep](evidence/willys-jeep-mobile.png)
