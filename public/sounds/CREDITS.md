# Sound credits

- `step_gravel_*` — "Footsteps on different surfaces" (OpenGameArt), gravel set derived from Ali_6868's Gravel Footsteps, CC0. https://opengameart.org/content/footsteps-on-different-surfaces
- `hit_flesh_*`, `hit_world_*`, `body_fall_*`, `ladder_*`, `door_*` — Kenney "Impact Sounds", CC0. https://kenney.nl/assets/impact-sounds
- `shot_pistol_*` (CZ-52), `shot_rifle_*` (SKS) — "Gunshot Sounds" by Tabasco (OpenGameArt), CC0, single shots cut and normalized. https://opengameart.org/content/gunshot-sounds
- Former `voice_*` generated dialogue has been removed from served assets.

The earlier gameplay-polish revision added no downloaded assets. `src/game/audio.ts` creates an original D-minor atmospheric music phrase and mechanical/fallback effects with Web Audio synthesis. Fallback sniper reports reuse the credited CC0 rifle samples at a lower playback rate; hit-region and ladder variations reuse the credited CC0 impact samples with pitch/gain changes. The procedural music is original project content, with no recording, melody, or sound package taken from Project IGI or another game.

## Earlier ladder and guard-audio revision (recordings since removed)

- `guard_hey.m4a` — **“Male hey” by TaniCorn**, [source](https://opengameart.org/content/male-hey), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Converted from `hey.mp3` to mono AAC, leading silence trimmed, high-pass filtered and limited. The attribution applies to this recording and its modified version.
- `pain_0.m4a` through `pain_5.m4a` — **“Pain sounds by EmoPreben” by Lasse Bührmann (EmoPreben)**, [source](https://opengameart.org/content/pain-sounds-by-emopreben), [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Tracks 1–6 from `painsounds.zip`; converted to mono AAC, filtered, leading silence trimmed and limited.
- At this earlier revision, guard dialogue was original project text rendered with macOS speech. The updated generator resamples each source before pitch adjustment and checks for a valid recording before replacing files. Includes “Hey!”, “Hey you!”, “Stop there!”, “Where are you?”, “You cannot escape!”, “Ouch!” and “Ah!”. Recorded pain clips play independently of dialogue cooldowns.
- Existing Kenney CC0 body impacts are retained, with louder spatial and local hit feedback. At that revision, no sounds were extracted from another game.
- Ladder research: [Zabuhailo — ladder.wav](https://freesound.org/people/Zabuhailo/sounds/143255/) (CC0) contains opening, climbing and closing a ladder. It was reviewed as a candidate, **not imported**. Ladder playback is now disabled, including its procedural fallback; the old `ladder_*` files are unused.

## Project IGI import (2026-09-18)

- `igi/*.wav` — extracted from the user-supplied Project IGI installation archive `project-igi-files/pc/common/sounds/sounds.res`. These are Project IGI recordings, separate from the CC0 and CC BY assets credited above; no open-content license was supplied for this bank.
- 50 clips retain the original PCM and sample rate. `ak47_single.wav` and `mp5sd_single.wav` combine a short initial burst segment with the original decay tail, using a crossfade and boundary fades.
- Exact resource names, transformations, and hashes are recorded in [igi/manifest.json](igi/manifest.json). Extraction and integration details: [IGI audio import](../../docs/igi-audio/README.md).
- The IGI bank now supplies the primary combat, movement, pain, and mechanical effects. Earlier non-vocal effects remain available as fallbacks. `walk_ladder_1` through `walk_ladder_4` supply climbing sounds; `detected_01` through `detected_06` supply spotting/contact vocals; `ai_hit_01` through `ai_hit_03` supply hit reactions and hurt callouts. All character vocals now use only IGI recordings. Generated dialogue and the earlier Hey/pain recordings are removed from served assets, with no legacy or synthesized voice fallback. Unmapped lines retain captions. Procedural music remains in use.

- `igi/alarm_1.wav` — original IGI alarm from the existing extracted archive cache, copied without changing its stereo PCM or 22,050 Hz sample rate. Loops at its original pitch while the compound alarm is active; stops when silenced or gameplay pauses.
