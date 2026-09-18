# Audio implementation handoff

Owned files: `src/game/audio.ts`, `public/sounds/CREDITS.md`, `docs/first-level/AUDIO.md`, `scripts/polish-audio-checks.ts`, this handoff.

Implemented sample/fallback sniper sounds, per-region hit coloration via `SoundEvent.zone`, alternating ladder samples with duplicate suppression, distinct switch/reload/ready/pickup/empty envelopes, voice pacing that also governs urgent lines, original quiet procedural atmospheric music and combat ducking. Existing licensed effects and offline voice files are reused. Contradictory legacy documentation claiming all sound was procedural and browser speech was live has been corrected.

Lifecycle: one wind source plus one music source during active play. Pause clears synchronously, resume starts one pair, reset clears and the next active camera update restarts the bed. Muting gates future effects and sets master output to zero. Disposal aborts loading, prevents late decode writes, disconnects all tracked nodes, and cannot be reactivated. At most 80 total simultaneous sources. Diagnostics are read-only state/counters.

Contracts: runtime emits ladder events only during actual climbing and controls cadence; AI emits `enemy-hit` with `zone` and bounded callout events; weapon system emits `shot-sniper`, `enemy-shot-sniper` (AI), `switch`, reload and inventory events. Runtime drives `setActive(false)` on pause/death and exposes diagnostics through its existing debug surface if desired.

Verification: `node scripts/check-player.mjs scripts/polish-audio-checks.ts` passes seven focused groups covering activation, all body zones and mechanical cues, event radius, urgent voice suppression/cooldowns, ladder deduplication, mute/pause/resume/reset/disposal, late sample loads and sampled pitch/duration behavior. First TypeScript pass found only concurrent AI/actor interface integration errors; no audio errors. Coordinator owns final integrated build and independent browser verification.

Limitations: browser automation can establish running context, actual loaded buffers, event/source lifecycle and rendered gameplay state but cannot judge subjective loudness/timbre. Human listening on physical speakers/headphones remains advisable. Existing macOS-generated voice provenance is preserved, with no new voice assets generated. Music is intentionally restrained and synthesizer based. Urgent dialogue is dropped while another line is speaking, prioritizing intelligibility over guaranteed delivery of every callout; directional captions remain independent.
