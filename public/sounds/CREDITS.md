# Sound credits

- `step_gravel_*` — "Footsteps on different surfaces" (OpenGameArt), gravel set derived from Ali_6868's Gravel Footsteps, CC0. https://opengameart.org/content/footsteps-on-different-surfaces
- `hit_flesh_*`, `hit_world_*`, `body_fall_*`, `door_*` — Kenney "Impact Sounds", CC0. https://kenney.nl/assets/impact-sounds
- `shot_pistol_*` (CZ-52), `shot_rifle_*` (SKS) — "Gunshot Sounds" by Tabasco (OpenGameArt), CC0, single shots cut and normalized. https://opengameart.org/content/gunshot-sounds
- Former `voice_*` generated dialogue has been removed from served assets.

The earlier gameplay-polish revision added no downloaded assets. `src/game/audio.ts` creates an original D-minor atmospheric music phrase and mechanical/fallback effects with Web Audio synthesis. Fallback sniper reports reuse the credited CC0 rifle samples at a lower playback rate; hit-region and ladder variations reuse the credited CC0 impact samples with pitch/gain changes. The procedural music is original project content, with no recording, melody, or sound package taken from Project IGI or another game.

## Earlier ladder and guard-audio revision (recordings since removed)

- `guard_hey.m4a` — **“Male hey” by TaniCorn**, [source](https://opengameart.org/content/male-hey), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Converted from `hey.mp3` to mono AAC, leading silence trimmed, high-pass filtered and limited. The attribution applies to this recording and its modified version.
- `pain_0.m4a` through `pain_5.m4a` — **“Pain sounds by EmoPreben” by Lasse Bührmann (EmoPreben)**, [source](https://opengameart.org/content/pain-sounds-by-emopreben), [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Tracks 1–6 from `painsounds.zip`; converted to mono AAC, filtered, leading silence trimmed and limited.
- At this earlier revision, guard dialogue was original project text rendered with macOS speech. The updated generator resamples each source before pitch adjustment and checks for a valid recording before replacing files. Includes “Hey!”, “Hey you!”, “Stop there!”, “Where are you?”, “You cannot escape!”, “Ouch!” and “Ah!”. Recorded pain clips play independently of dialogue cooldowns.
- Existing Kenney CC0 body impacts are retained, with louder spatial and local hit feedback. At that revision, no sounds were extracted from another game.
- Ladder research: [Zabuhailo — ladder.wav](https://freesound.org/people/Zabuhailo/sounds/143255/) (CC0) contains opening, climbing and closing a ladder. It was reviewed as a candidate, **not imported**. Ladder playback is now disabled, including its procedural fallback; the old `ladder_*` files were unused and have been deleted.

## Project IGI import (2026-09-18)

- `igi/*.m4a`, `igi/alarm_1.flac` (served encodes of the extracted `igi/*.wav`, see "Served encoding" below) — extracted from the user-supplied Project IGI installation archive `project-igi-files/pc/common/sounds/sounds.res`. These are Project IGI recordings, separate from the CC0 and CC BY assets credited above; no open-content license was supplied for this bank.
- 50 clips retain the original PCM and sample rate. `ak47_single.wav` and `mp5sd_single.wav` combine a short initial burst segment with the original decay tail, using a crossfade and boundary fades.
- Exact resource names, transformations, and hashes are recorded in [igi/manifest.json](igi/manifest.json).
- The IGI bank now supplies the primary combat, movement, pain, and mechanical effects. Earlier non-vocal effects remain available as fallbacks. `walk_ladder_1` through `walk_ladder_4` supply climbing sounds; `detected_01` through `detected_06` supply spotting/contact vocals; `ai_hit_01` through `ai_hit_03` supply hit reactions and hurt callouts. All character vocals now use only IGI recordings. Generated dialogue and the earlier Hey/pain recordings are removed from served assets, with no legacy or synthesized voice fallback. Unmapped lines retain captions. Procedural music remains in use.

- `igi/alarm_1` — original IGI alarm from the existing extracted archive cache, 22,050 Hz. Loops at its original pitch while the compound alarm is active; stops when silenced or gameplay pauses.

### Served encoding (2026-09-21)

The extracted PCM WAVs (1.75 MB) are no longer served; `manifest.json` still describes them (names, frames, hashes) and the code keeps the `igi/<name>.wav` ids. The lossless WAVs are in git history up to commit `3103624`, or re-run `scripts/extract-igi-audio.py`. `src/game/audio.ts` maps each id to the served file:

- everything except the alarm → mono AAC-LC `.m4a`, Apple AudioToolbox encoder via ffmpeg, 96 kb/s for the 44.1 kHz gunshots and 56 kb/s for the 22.05 kHz clips:
  `ffmpeg -i x.wav -map_metadata -1 -ac 1 -c:a aac_at -b:a 96k -movflags +faststart x.m4a` (`56k` when the source is 22,050 Hz)
- `alarm_1` → stereo FLAC, bit-exact PCM (`ffmpeg -i alarm_1.wav -map_metadata -1 -c:a flac -compression_level 12 alarm_1.flac`). It is the only looped sample; AAC decodes with up to 40 ms of trailing padding, which would be a gap at every loop. It stays stereo because its channels are partly out of phase (correlation −0.32): a mono downmix is 4.8 dB quieter and changes the timbre.

Measured with `decodeAudioData` in Chrome 147 and Safari 26.3 against the WAVs (cross-correlation of the decoded head): AAC `.m4a` starts 0 samples late in both; MP3 starts 13–26 ms late in Safari and Ogg Opus loses the first 6.5 ms in Chrome, so neither is used. Firefox was not measured. Do not re-encode with ffmpeg's native `aac` encoder: at the same bitrates it measured 4 dB SNR on the gravel footsteps against 13 dB for `aac_at`.

The earlier CC0 `.m4a` recordings stay as fallbacks but are only downloaded for kinds whose IGI samples fail to load. The unused `ladder_0/1.m4a` were deleted.
