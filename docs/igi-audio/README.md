# Project IGI sound import

The supplied `project-igi-files/pc/common/sounds/sounds.res` contains 333 PCM sound resources. All are extracted to `artifacts/igi-audio.local/` (ignored by Git). The game uses 52 curated WAV files in `public/sounds/igi/`, totaling 1,416,190 bytes, across 25 sound event routes and three dialogue groups.

Run from the repository root:

```sh
python3 scripts/extract-igi-audio.py
python3 scripts/igi-audio-checks.py
npm run test:traversal-audio
npm run build
```

The extractor accepts `--source`, `--output`, and `--game-output`. It requires only Python's standard library. It reads the archive as data and never executes the supplied game binaries. The original files are untouched.

## Format and edits

This archive has an `ILFF` / `IRES` header and aligned `NAME` / `BODY` chunks, followed by a terminal `PATH` index. Each sound body has a 20-byte `ILSF` header. All 333 entries in this archive are signed 16-bit little-endian PCM (331 mono, two stereo). The extractor validates chunk bounds, strides, encoding, and frame counts before wrapping the original PCM in standard WAV headers at its original sample rate.

50 game clips are lossless rewraps. AK-47 and MP5SD recordings are burst loops with separate decay tails: the game clips take the first 85ms and 50ms respectively, crossfade for 8ms into their tails, and apply short boundary fades. These are one-shot edits, not looping sources. Shot timing remains controlled by the weapon system. The pistol uses Glock reports; the sniper uses the dedicated SVD report at its original pitch. Reload cues use AK magazine/bolt clips shared across the current generic reload events.

Footsteps, ladder climbing, impacts, flesh hits, body falls, pain, player damage, doors, weapon pickup/drop/switch, dry fire, and reload cues prefer the IGI bank. Four `walk_ladder_*` clips play as varied one-shots at the existing half-second climbing cadence. Six `detected_*` barks supply spotting/contact callouts; `ai_hit_*` supplies immediate hit reactions and hurt callouts. A hit interrupts that guard’s detection bark while the existing overlap limits stay in force. Missing or undecodable non-vocal effects fall back to the previous samples and then procedural synthesis. Character vocals are IGI-only: unavailable recordings and unmapped dialogue stay silent, with gameplay captions retained. The prior generated character dialogue and downloaded Hey/pain recordings have been removed from served assets. Music retains its existing implementation. If ladder samples are unavailable, climbing stays silent instead of producing a synthetic tone.

[`manifest.json`](../../public/sounds/igi/manifest.json) records each source resource, edit, rate, frame count, and SHA-256, as well as the archive hash. The full extraction includes additional effects for possible future use; only the curated bank is served with the game. Mission archives, cutscenes, and compressed menu music are outside this import.

## Verification

- All 333 entries passed PCM frame-length validation, including the two stereo resources.
- All 52 deployed WAV files passed hash, sample-rate, frame-count, and payload checks, plus independent FFmpeg decoding.
- Runtime tests with a simulated AudioContext verify all 25 event mappings and three original vocal groups, failed fetch/decode fallback for effects, IGI-only vocals with no legacy requests or synthesized voice fallback, original sniper fallback pitch, synthesized mechanical fallback, varied ladder one-shots, and pain interrupting original detection barks.
- Existing traversal, hit-confirmation, voice/pain overlap, mute/pause, source-budget, reset, and disposal checks pass.
- Production build passes (existing large-bundle advisory remains).

These checks verify data and routing; in-game listening and final mix balance have not been reviewed in a browser during this change.
