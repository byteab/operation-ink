# Ladder movement and guard audio

- Stair camera height follows the continuous incline described by the actual stair geometry, while capsule collision remains on the treads. Small camera-height changes ease across tread/landing transitions; jumps and teleports remain immediate.
- Ladder boarding preserves orientation and does not lift a grounded descending player into the interaction-point clearance margin. Camera easing covers the final landing.
- Ladder playback is deliberately silent. Its gameplay hearing event remains intact.
- Guard dialogue now includes Hey/Hey you, Stop there, Where are you, You cannot escape, and searching variations. All four voice sets were regenerated with the correct source sample rate and valid-file checks. Voices remain generated speech except the credited recorded Hey.
- Six recorded pain variations plus Ouch/Ah are separate from tactical dialogue cooldowns. A guard's own speech can be interrupted by pain; bursts are capped at three simultaneous reactions and a 0.55-second per-guard interval. Spatial vocal attenuation makes nearby shouts easier to hear.
- Body impacts retain the existing licensed Kenney recordings, with increased spatial/local gain. Confirmed hits remain the only trigger.

Sources, modifications and licenses: [sound credits](../../public/sounds/CREDITS.md). Online research found TaniCorn's recorded Hey, EmoPreben's pain pack and Zabuhailo's ladder recording. The first two were imported; the ladder recording was not imported and the old ladder playback was removed.

Validation used an isolated `ladder-audio` **agent-browser** session on the existing development server. These are staged runtime integration checks, plus a real F-key ladder descent, not a complete mission playthrough. Audio buffer decoding, nonzero signal, state/hit routing and playback-source lifecycle were verified; subjective listening quality was not assessed.

- [Movement results](evidence/movement-results.json): all seven actual-map ladders keep orientation, descend steadily and reach supported ground. Stair camera maximum frame descent was 0.045914 m versus a physical tread drop of 0.196774 m; successive camera-step variation was 0.00000504 m at 60 Hz.
- [Real F-key descent](evidence/keyboard-descent-results.json): 347 rendered frames, no upward bump, unchanged quaternion, grounded arrival.
- [Audio results](evidence/audio-results.json): all 178 samples decoded; suspicious/combat/lost/search state transitions started voice samples. An actual confirmed torso hit triggered body impact, local confirmation and recorded pain during an active callout. Repeated immediate pain, ladder playback and muted events created no extra sources; pause cleared all sources.
- [Asset checks](evidence/asset-checks.json): all 143 voice/pain recordings have valid durations and payloads; browser waveform checks found no silent recordings.
- Production build / TypeScript, `test:player`, `test:traversal-audio`, `test:polish`, VR and zipline checks passed. Build retains its existing large-chunk advisory. [Browser errors](evidence/browser-errors.txt): none.
