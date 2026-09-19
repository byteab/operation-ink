# Locomotion reference

`locomotion-reference.json` contains sampled `Walk_Loop` and `Sprint_Loop`
motion from **Quaternius, Universal Animation Library**, released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
[Creator's pack and license](https://quaternius.com/packs/universalanimationlibrary.html).
Only animation data is included; the project retains its own character mesh.

The Standard no-root-motion GLB was obtained from this
[credited public mirror](https://raw.githubusercontent.com/Seyamalam/blood-league-kickoff/main/public/assets/vendor/quaternius/universal-animation-library.glb).
Source SHA-256:
`4c748767741a3e495d89667b9a218b690ba9810b9517a12e960780e3ca72c4e9`.

Regenerate from that GLB with:

```sh
node scripts/import-locomotion-reference.mjs /path/to/universal-animation-library.glb
```

The importer samples world-space deltas from `A_TPose` at 60 Hz. `gait.ts`
adapts timing, lean, arm swing and pelvis travel to the stickman, then solves
fixed-length legs against grounded foot paths. The reference's original timings
remain in the data as provenance, not playback settings.
