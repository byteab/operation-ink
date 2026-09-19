# Relaxed look-around

The previous loop combined ±3 cm pelvis translation with ±3° hip roll and an unrelated arm gesture.
That moved the standing body sideways while looking, creating the pendulum effect. Its loop also omitted
the final root reset, leaving a position discontinuity when playback wrapped.

The replacement in `src/lab/clips/behavior.ts` keeps the pelvis and both feet planted. It uses two separate
glances with unequal timing and holds, a brief return to facing forward, shared head/neck rotation, and
a smaller shoulder turn starting 0.17 s later. Quintic turn curves start and stop smoothly. Breathing stays
subtle, the arms remain relaxed, and the 9.6 s loop ends at its exact starting pose.

Verification:

- `npm run build` passed.
- `node scripts/check-player.mjs scripts/enemy-motion-checks.ts` passed for pistol, AK, SMG and sniper guards.
  The checks now measure visible world-space head rotation (including the neck), and explicitly assert that
  the pelvis and foot endpoints remain planted through a complete loop.
- Agent-browser played 601 frames across a full loop and verified both glances, the loop transition, pause
  and half speed. Pelvis travel was zero; foot travel was below 0.001 mm. World-space gaze covered about
  35° left and 40° right. No browser runtime errors were reported.

[60 fps playback preview](evidence/playback.mp4) · [Browser measurements](evidence/browser-checks.json)

Reproduce through agent-browser with `scripts/check-lab-relaxed-look.js`. Set `window.recordRelaxedLook = true`
before running it to include a base64 WebM in the result. Fully reload the lab/game to replace cached clips.
