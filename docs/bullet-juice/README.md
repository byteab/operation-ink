# Bullet feedback and gun distance

The requested direction was fast but readable bullets, more fear when enemy rounds arrive, stronger combat feedback, and finer outlines on distant enemy guns. A plan was shared before implementation. Separate agents handled gun contours, audio, and regression coverage; the main implementation and browser checks integrated those changes.

## Design references

- [Battlefield V launch notes](https://eaassets-a.akamaihd.net/dice-commerce/Casablanca/Update_Notes/Battlefield_V_Launch_Notes_v3.pdf) describe shooter-aware flyby panning. Our passing sound has a small bias toward the muzzle before its quieter air layer moves beyond the closest point.
- [Bungie's Destiny 2 audio diary](https://www.bungie.net/7/en/News/article/51457) describes coordinating weapon audio and visual effects. Here, a near miss's crack and pressure cue arrive with the traveling mark; an actual hit adds a low thump to the existing damage sample and anatomical reaction.
- [Squirrel Eiserloh's GDC camera talk](https://media.gdcvault.com/gdc2016/Presentations/Eiserloh_Squirrel_JuicingYourCameras.pdf) informed restraint around first-person camera motion. Existing hit/recoil motion carries the physical response; near misses add edge pressure without moving aim.

## Behavior

- Both sides use moving ink heads, thin white contrast rims, and short tapered wakes. Travel lasts 55–150 ms depending on range, with a 35 ms shrinking afterimage. The visible path clips to the real hit point. Each pool reuses three instanced meshes and holds at most 96 rounds. Shotgun pellets have smaller marks. Authoritative hit tests, damage, spread, fire rate and ammunition remain unchanged; travel is presentation, not a new ballistic simulation.
- Enemy near misses within 2.4 m of the eye schedule their cue at closest approach. Playback rechecks the listener's current position and cover, including walls beside the bullet path. The 38 ms crack and 150 ms descending pass are directional and intensity-scaled; an 80 ms hit gate and 90 ms flyby gate prevent stacking. Bullet damage adds a 130 ms low thump; falls keep their original sound.
- Follow-up: directional edge shading and the “Hit” label now trigger only on confirmed damage, never on nearby misses. The opacity cap is 18% instead of 48%, and the separate damage shadow is similarly weaker. Recovery still finishes within 650 ms, the view centre stays clear, and Reduced Motion retains text without shading. Near misses retain their passing audio.
- Surface hits add an 85 ms ink burst and faster chips. Contact bursts are capped at 24 and chips at 80.
- Gun contours use an earlier taper appropriate to their small details: full weight through 2 m, about 55% at 12 m, 31% at 20 m and 16% at 40 m. Edges, sketch offsets, curved silhouettes and AK magazine details agree. Held enemies, dropped weapons, the lab and FPS use the same factory. Scenery keeps its original curve; near FPS and orthographic contours retain their weight.

## Verification

Passed build and `test:bullets`, `test:player-hits`, `test:weapons`, `test:ai`, `test:polish`, `test:player`, `test:vr`, plus the existing near-miss checks. The build retains its existing large-chunk warning.

`test:bullets` covers actual transformed geometry and contact bounds, 30/60/144 FPS, skipped frames, callback timing, lateral cover, moving/dead listeners, sustained-fire budgets, GPU resource disposal, pressure recovery, all 275 gun contours and incoming hit audio. Audio checks also cover native samples, gain/pan envelopes, source limits, priority, mute, pause and cleanup.

Authorized agent-browser checks ran in an isolated real development mission. [The staged combat script](../../scripts/check-bullet-juice.js) used the normal pointer firing handler and actual enemy firing path. It verified automatic/pellet marks, near-miss timing and no damage, hit flinch, pause, Reduced Motion, checkpoint and VR clearing. This is staged integration, not an input-only mission playthrough. Native browser audio ran with 96 decoded samples; subjective loudness and fear remain playtest judgments.

- [Combat results](evidence/combat-results.json)
- [Incoming fire](evidence/incoming-fire.png)
- [Player shot](evidence/player-shot.png)
- [Projectile frame sheet](evidence/projectile-frames.png) — canvas-only, so DOM pressure/captions appear in the separate incoming-fire capture.
- [Gun distance comparison](evidence/gun-distance.png) and [GPU results](evidence/gun-distance-results.json)

The gun GPU check uses identical geometry with isolated old/new material sets at fixed FOV and actual distances. It confirms reduced distant pigment and preserves near dark-pixel footprint within 1%. Repeated identical GPU captures showed small pigment variation even without a profile change; the report retains those controls rather than claiming pixel-identical shading. No shader compilation or browser application errors were reported. Static screenshots cannot convey the full temporal or audio feel.

## Enemy gunshot audibility correction

The user reported missing enemy muzzle reports after the feedback pass. Browser tracing reproduced zero report sources at 40/55 m: the existing ordinary-report cutoff was 36 m, although engaged guards can fire to 60 m. The new local flyby remained audible at those ranges. A saturated effects pool also rejected gunshots, and the original steep attenuation made in-range reports weak beside close-pass sounds.

Enemy report radii now cover engagement range plus 20 m (80 m ordinary, 130 m sniper). Their spatial attenuation is gentler, retaining the exact native sample, pitch and base gain. Player/enemy reports can reclaim old incidental effects, then whiz layers, while preserving existing reports, voices, music, alarms and hit thumps within the same 80-source cap.

Added regressions verify every enemy weapon at maximum engagement range, native report routing and attenuation, source-priority behavior and cleanup. [The native browser check](../../scripts/check-enemy-audio.js) passed 26 assertions through actual mission guard firing: original AK samples at 20/40/59 m and sniper samples at 70/109 m, full-pool playback, mute, zero volume and pause. Build, responsive/fair-awareness AI, bullet feedback and both audio suites passed. The browser checks measure source selection/allocation and panner attenuation; they do not claim a human listening evaluation.
