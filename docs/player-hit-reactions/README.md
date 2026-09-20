# Player bullet-hit reactions

Incoming rounds now carry an anatomical target, side, impact point and travel direction into a first-person reaction. The injured hand/arm or shoulder pulls back first, with a smaller delayed head response. Torso hits brace both arms. Leg hits dip eye height and lean toward the struck leg; there are no rendered first-person legs in the existing model. Responses are deterministic for the same impact, with no random camera shake.

The limb attack peaks around 45 ms, the head around 93 ms, and leg balance around 138 ms. Arm motion finishes within 380 ms; head motion within 498 ms; leg recovery within 658 ms. Damage scales the impulse, while simultaneous hits are capped at eight impulses, 6.5 cm combined eye displacement and about 3.7° combined camera rotation. Scope magnification scales down camera motion. Reduced Motion suppresses added camera and limb movement.

The camera offset exists during weapon firing and rendering, then is removed before input and movement. Recovery retains deliberate mouse aim and weapon recoil. Eye translation respects nearby cover. Arm IK keeps its 34/36 cm segment lengths, including hit/reload combinations; the firing hand remains attached to the weapon. Hits do not interrupt reloads or change ammunition or damage values. Pausing freezes recovery; restore, restart, death, inspection and VR clear it.

Enemy fire still uses the existing seeded accuracy model. A successful accuracy roll selects a body target, then checks that precise segment against scenery and friendlies. A hidden limb falls back to the exposed centre/head target. This is an anatomical extension of the existing shooting model, not a new full-body player ragdoll or permanent injury system.

## Verification

- `npm run build` passed; Vite retains its existing bundle-size advisory.
- `npm run test:player-hits` passed: anatomical targeting, distinct regions and mirrored sides, frame-rate equivalence at 30/60/144 FPS, bounded repeated hits, exact camera recovery, scoped/cover constraints, recoil preservation, all five weapons during aim/reload, fixed limb lengths, ammunition conservation, sight alignment, and actual enemy shot/cover integration.
- Existing `test:weapons`, `test:ai`, `test:player`, `test:traversal-audio`, `test:vr`, and `scripts/polish-weapon-checks.ts` passed.
- Authorized `agent-browser` checks ran on the real development mission using [the browser script](../../scripts/check-player-hits.js). A real guard was staged on a clear map lane, with seeded accuracy/target rolls; the normal enemy shot, mission damage, camera, weapon and render code ran. Checks covered body-part metadata, visible poses, recovery, pause/resume, mouse aim, reload, scope, reduced motion, checkpoint, restart, death and VR entry. Browser application errors were empty.
- Visually inspected the [comparison image](evidence/comparison.png). The base pose and recovered pose match; hand/shoulder hits alter the connected arm and gun, and opposite leg hits visibly lean in different directions. [Measured results](evidence/results.json) include the camera and hand positions.

These are staged integration and visual checks, not a full mission playthrough. Subjective intensity can be tuned after playing.

[Original implementation plan](PLAN.md)
