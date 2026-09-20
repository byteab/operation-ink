# Directional first-person bullet reactions

## Intended feel

A hit starts at the struck body part, pulls the connected arm/weapon or shifts balance, and then reaches the head. It has one sharp attack and a slower recovery, never random camera noise. Left and right hits mirror; bullet travel determines the push. The player retains movement, firing, reload and mouse control.

- Hand/arm: the struck wrist recoils and its elbow folds. The right hand carries the gun; the left can briefly release its support grip. Camera motion is small and delayed.
- Shoulder: the struck shoulder retracts and rolls the weapon, with a stronger upper-body turn.
- Torso: both arms brace and the head follows a short directional jolt.
- Leg: the view dips and leans toward the struck leg as the arms counterbalance. The existing first-person model has no rendered legs, so this represents a brief knee buckle through eye height and balance, without adding a new full-body avatar.
- Head: a brief, restrained directional head flinch.

## Implementation

1. Extend enemy damage events with region, left/right side, world impact point, bullet travel direction and weapon. Existing enemy fire uses a seeded hit-chance model; on a successful accuracy roll, sample an anatomical target and trace that exact segment against cover and friendlies. Keep damage values and fire cadence unchanged. Exposed-head targeting remains available behind low cover.
2. Add a standalone deterministic reaction sampler. Use smooth finite attack/recovery envelopes with faster limb response and slower head/balance response. Store only a bounded number of recent hits and clamp combined displacement/rotation. Scale by damage, reduce camera movement while scoped, and stop all added motion under Reduced Motion.
3. Layer the sampled pose over existing first-person arm IK, gun recoil, aim and reload poses. Offset shoulders and wrist targets, solve the connected limbs, and keep bone lengths fixed. Keep the firing hand connected to its weapon.
4. Apply camera displacement/rotation only during mission presentation and firing; remove it immediately after rendering so walking, mouse input, checkpoints and traversal never inherit residual roll or translation. Preserve intentional weapon recoil when removing the overlay. Collision-limit the small eye displacement.
5. Freeze reactions on pause; clear them on restart/checkpoint restore, death, inspection and VR. Do not cancel reloads or change ammunition/damage because of a flinch.

## Acceptance checks

- Regions produce distinct movement and left/right limb hits mirror; identical hits are deterministic.
- Motion attacks quickly, recovers smoothly to exact rest, and matches at 30/60/144 FPS.
- Sustained hits remain bounded, with no accumulated camera drift or loss of weapon recoil/input.
- Hits sample anatomical points and the actual hit segment respects cover/friendly obstruction.
- Arms remain connected, within reach, and at fixed lengths during aim, reload, switch and hit combinations.
- Reduced Motion, scope, pause/resume, traversal, death and restore behave consistently.
- Run targeted checks plus build and the existing weapon, AI, player/traversal and VR checks affected by the integration. If authorized, use the repository's agent-browser workflow for staged visual checks in the real mission.
