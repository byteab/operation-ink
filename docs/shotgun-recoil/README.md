# Shotgun camera recoil

Shotgun blasts now produce twice their previous upward camera kick and five times an AK shot's kick at the same random sample. The gun itself moves back 1.7 times as far. Camera recovery takes longer, while the final aim climb stays close to the previous amount. Sideways recoil remains restrained. Reduced motion suppresses both camera recoil and the gun's kick.

## Verification

- `npm run build` passed (existing Vite chunk-size advisory).
- `npm run test:weapons` and `node scripts/check-player.mjs scripts/polish-weapon-checks.ts` passed.
- New checks compare the weakest shotgun kick with the strongest AK kick, verify smooth recovery at 30/144 FPS, and exercise hip fire, aiming, reduced motion, repeated shots, ammo use and alignment of the central pellet with the visible sight.
- Used an isolated **agent-browser** session on the real development game. `scripts/check-shotgun-recoil.js` freezes simulation and compares one shot from each gun using the same random sample. At peak: AK **1.26°**, shotgun **6.30°**. After 150 ms: AK **0.65°**, shotgun **3.08°**. After 800 ms: AK **0.50°**, shotgun **1.04°**.
- A real browser click triggered the shotgun through its normal input handler, consumed one shell and produced the larger camera kick. Camera orientation after mouse movement was recorded separately before applying the firing update. Reduced motion left the camera quaternion unchanged. No browser application errors were reported.

These are staged visual/integration checks, not a full mission playthrough. Damage, pellet spread and firing rate are unchanged.

[Comparison](evidence/comparison.png) · [Shot fired](evidence/shotgun-fired.png) · [Recovered](evidence/shotgun-recovered.png) · [Measured results](evidence/results.json)
