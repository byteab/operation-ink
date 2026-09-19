# Grounded, flexible death animations

The arm and leg death clips used to hold their final reaction poses: an elevated forearm, and sometimes an
elevated leg, remained frozen after playback ended. They now roll toward a supported rest with independent
spine/chest motion, followed by staggered release of the elbows, wrists, knees and head.

`src/lab/death-settle.ts` applies the same settling treatment to all six death clips. It preserves limb
lengths, fits floor contacts to the shared rig, adds a brief damped waist/ribcage response at impact, and
bakes 120 Hz quaternion tracks. Completed clips stay motionless. These are deterministic flat-floor
animation contacts, not a runtime ragdoll or collision simulation against arbitrary scenery.

The arm clip lasts 1.77 s and the leg clip 2.17 s. The other endings also have time for passive release.
The head's support shape was measured from the actual GLB. Tests sample the real rigid mesh surfaces;
head contact is within 1 mm of the floor, hands within 19 mm, and lower-leg contact within 6 mm (at most
2.3 mm of surface penetration). The source model and locomotion clips are unchanged.

## Verification

- `npm run build` passed (existing bundle-size advisory remains).
- `npm run test:combat-animations` passed, including the new `test:deaths` checks.
- Death tests sample all six clips at 240 Hz, check fixed segment lengths, contact, continuity, pause,
  final hold, both mirrored arm/leg variants in mission actors, elevated floors and mid-fall restoration.
- Agent-browser exercised the six actual lab buttons at normal speed, with 117–162 rendered frames per
  action, followed by pause, half-speed and interruption checks. All seven checks passed; no runtime errors.
- Low and overhead views confirm that the raised limbs now rest on the ground.

## Evidence

- [Normal-speed playback](evidence/playback.mp4) (browser recording samples at 10 fps; live playback ran at approximately 60 fps).
- [Arm/leg close views](evidence/arm-leg-contacts.png).
- [All six resting poses](evidence/resting-poses.png).
- [Arm/leg collapse sequence](evidence/fall-sequence.png).
- [Browser results](evidence/browser-checks.json), [final contacts](evidence/contact-metrics.json), [sequence measurements](evidence/sequence-metrics.json).

Reproduce with `scripts/check-lab-deaths.js` and `scripts/capture-lab-deaths.js` through agent-browser on a
fresh `/lab.html`. The capture script supports `window.deathDetail = true` for low/overhead views and
`window.deathSequence = true` for the collapse sequence. Reload after capturing to remove the overlay.

Fully reload existing lab/game tabs to replace their cached clip and actor instances.
