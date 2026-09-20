# Hostage seating and lock light

The hostage is blue (`#2878d0`). The chair's seat previously intersected the rounded pelvis: its top was 0.4375 m, while the deformed skin extends down to approximately 0.336 m. The seat top is now 0.3325 m, and its legs and back supports remain connected. The first stand-up pose lifts slightly earlier to clear the seat while shifting forward over the feet.

The door lock retains its white housing and keyhole. A small domed green light (6 cm diameter) with a black bezel replaces the broad rectangular green panel. It sits above and beside the interaction marker so the marker does not hide it.

Validation:

- Build, full rescue suite and NPC transition checks passed. The rescue suite covers release, escort, boarding, restart and control sightlines.
- `scripts/hostage-checks.ts` evaluates the real mesh with the rig's dual-quaternion skinning, checking seat clearance throughout seated idle and every frame of the stand-up animation. A bone-height check alone missed the original overlap.
- Authorized agent-browser checks inspected the actual WebGL scene and live HUD. Native F released the hostage into the stand-up animation; the door lock moved 2.916 m with zero local attachment drift. Browser errors were empty.
- These were staged camera and interaction checks, not an input-only full mission playthrough. Camera staging uses `scripts/rescue-revision-visual.js`; reload after using it.

Evidence:

- [Seated blue hostage](evidence/seated.png)
- [Standing up without chair overlap](evidence/standing-up.png)
- [Round green light close-up](evidence/lock.png)
- [In-game Unlock prompt and visible light](evidence/unlock.png)
