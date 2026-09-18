# Aiming and recoil verification

2026-09-17, agent-browser isolated session on localhost:5173.

- Started with the real Begin mission button. Staged stationary, loaded enemy rigs and stepped the real weapon/runtime damage pipeline with AI movement paused.
- All 64 crosshair-center cases hit: pistol, AK, SMG, sniper; head and chest; 2, 10, 45, 85 metres; hip fire and aiming. Distant cases used an elevated clear lane to isolate aim from map occlusion.
- Ground-level pistol check used real mouse down/up input: one cartridge consumed, head hit registered, enemy health changed from 100 to 34.
- Immediate recoil measured 1.713 degrees; after one second it retained 0.830 degrees of displacement. Screenshots show before, kick, and settled states.
- Browser error log was empty. Closed only this verification session; existing dev server was left running.

These are staged integration checks, not a full mission playthrough. The subsequent enemy-arm fix was checked with the actual GLB rigs in the automated AI suite; visual review is left to the user as requested.
