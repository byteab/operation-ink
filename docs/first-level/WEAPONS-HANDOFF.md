# First-person weapon handoff

Implemented in `src/game/weapons.ts`. Focused regressions: `scripts/weapon-checks.ts`.

## Integration API

`new FirstPersonWeapons(context: WeaponContext)` adds its camera-child model after static collision has been constructed. The runtime must add the camera to the scene. Call `update(dt, frame)` after player/camera movement; only active, non-climbing frames advance weapon clocks. Pass `active: false` while paused, interacting, dead, in exploration or in VR, and call `cancel()` immediately at state transitions.

- `trigger(pressed)` handles edge-triggered pistol fire and held AK/SMG fire. A shot occurs synchronously in the next update after the current muzzle obstruction check. Input while disabled, reloading or switching is discarded.
- `reload()`, `switchSlot(0 | 1)`, `drop(feet)` and `pickup(id)` return success booleans.
- `addPickup(item)` creates an individually tracked ground weapon; duplicate IDs already in the inventory or ground set are rejected. Provide stable IDs for enemy and supply weapons.
- `pickupTargets()` returns `{object, point, label, id}` for the central action selector. `pickup(id)` independently rechecks distance (2.7 m from eye), facing and occlusion.
- `snapshot()` and `restore(snapshot)` use the shared JSON-safe `WeaponSnapshot`; snapshots deep-copy items. Restore cancels action/trigger state and resets shot cadence.
- `cancel()` cancels reload, input and visual action state without changing ammunition. `dispose()` removes all owned meshes/geometries/materials, leaving shared lab gun materials intact.
- Getters: `label: string`, `ammo: string` (`12 / 36`), `selected: 0 | 1`, `current: WeaponItem | null`, `slots: readonly (WeaponItem | null)[]`, `reloading: boolean`, `blocked: boolean`.

## Rules and visible behavior

Starting inventory is pistol (12 loaded + 36 reserve), empty second slot. Capacities are pistol 12, AK 30 and SMG 24. Weapon ammo belongs to the individual item, including when dropped. A pickup uses the first empty slot and equips it; when both slots are occupied, the selected weapon is dropped before the new item replaces it. No ammunition is merged, replenished or discarded during pickup/drop. The same ground item cannot be collected twice.

Reloads take 1.85/2.3/2.05 seconds and transfer `min(capacity - loaded, reserve)` rounds only upon completion. Every interruption preserves pre-reload ammo. Fire intervals are 0.25/0.12/0.085 seconds; stalled frames cannot release a backlog burst. Damage is 34 and ranges are 110/170/100 metres. The runtime resolves each synchronous shot against nearest world/enemy collision. Muzzle flash, consumed cartridge, recoil and shot sound originate from that same event.

The lab pistol, AK and SMG geometry/materials are reused without changing any lab files. Arms and minimally articulated hand/finger meshes use solid black `MeshBasicMaterial` with depth testing. The right hand remains attached to the gun grip. Camera-space two-bone solves keep upper/forearm lengths at 34/36 cm across tested aim, recoil and reload poses. The left support hand approaches the actual magazine contact, follows its removal/insertion, works the slide/bolt and returns to support. No hand is attached to a floating magazine clone. Aim reduces bob; reduced motion removes bob and recoil movement, retaining muzzle feedback and functional reload handling.

Near cover is checked along eye-to-intended-muzzle and immediately ahead of the barrel; the stable intended probe avoids a raise/lower oscillation. Obstruction lowers the model and blocks ammo consumption/damage. The actual animated muzzle is checked again at discharge. Shooting direction converges on the camera's nearest world hit. Viewmodel depth testing remains enabled.

Sound kinds emitted: `shot-pistol`, `shot-ak`, `shot-smg`, `reload`, `reload-ready`, `empty`, `pickup`, `drop`. Shot hearing radii are 38/55/55 m; handling sounds have 2–3 m radii. Caption text is provided with each sound.

## Verification and remaining evidence

`node scripts/check-player.mjs scripts/weapon-checks.ts`: **9 groups passed** (synchronous fire, a complete press/release between animation frames, ammo conservation, pause/climb/restore interruption, inventory replacement/drop/duplicate rejection, real cover obstruction, activation validation, facing-threshold alignment, arm lengths/materials/contact-path poses). `npx tsc --noEmit` passes.

Actual first-person `agent-browser` inspection was completed on 2026-09-17 in the isolated `weapon-visual` session, using the mission's normal renderer/camera at 1440 × 900 and 1024 × 768. Weapon/animation state was staged through the development inspection surface with mission/player updates frozen; these captures are **visual checks, not a mission playthrough**. Every listed screenshot was opened in the image viewer. The session was closed afterward; `agent-browser errors` returned no runtime errors.

Visual review found and fixed three issues: the pistol's generic support fingers looked disconnected (replaced with a dedicated cupping fist), the slimmer rifle fingers sat below the lab's original support anchor (raised to contact the fore-end), and the rifle aim pose showed too much buttstock in the central foreground (lowered aim hold slightly). The images show a continuous black forearm-to-hand-to-grip silhouette in idle/aim/fire, retained right-hand contact through reload, and the left hand following the lowered magazine. At full withdrawal the magazine and left hand partly leave the bottom of the viewport, a deliberate low reload path. Camera motion is not added.

| Pose | 1440 × 900 | 1024 × 768 |
|---|---|---|
| Pistol idle | [Image](evidence/weapon-pistol-idle-1440.png) | [Image](evidence/weapon-pistol-idle-1024.png) |
| Pistol aim | [Image](evidence/weapon-pistol-aim-1440.png) | [Image](evidence/weapon-pistol-aim-1024.png) |
| Pistol firing | [Image](evidence/weapon-pistol-fire-1440.png) | [Image](evidence/weapon-pistol-fire-1024.png) |
| Pistol reload | [Image](evidence/weapon-pistol-reload-1440.png) | [Magazine withdrawn](evidence/weapon-pistol-reload-1024.png) |
| AK idle | [Image](evidence/weapon-ak-idle-1440.png) | [Image](evidence/weapon-ak-idle-1024.png) |
| AK aim | [Image](evidence/weapon-ak-aim-1440.png) | [Image](evidence/weapon-ak-aim-1024.png) |
| AK reload | [Image](evidence/weapon-ak-reload-1440.png) | [Magazine withdrawn](evidence/weapon-ak-reload-1024.png) |

Additional captures: [SMG support grip](evidence/weapon-smg-idle-1024.png), [near-wall lowered pistol](evidence/weapon-wall-blocked-1024.png). At the wall, the world probe reported obstruction and pressing/releasing fire left ammunition at `12 / 36`.

Lead live-input testing also exposed a quick-click responsiveness defect: release previously erased a press before the next frame. Release now clears only the held state; the queued press is consumed exactly once on update, while interruptions still clear it. This has a dedicated regression. Complete mission playback, sound audibility and busy-scene cost are coordinator verification dependencies; none are claimed by these staged visual checks.

Final independent review exposed a pickup prompt/activation discrepancy at facing dot 0.32: the shared selector accepted dots ≥ 0.25 while pickup required 0.4. Pickup now uses the same 0.25 threshold; the regression rejects 0.24 and accepts 0.32 with ammunition unchanged.

Maintenance SMG placement was inspected in a separate staged `agent-browser` session. [Screenshot](evidence/maintenance-smg-placement.png): the model lies clear of the supply pedestal (weapon Z range −44.973..−44.603, pedestal ends at −45.1). At feet `[114, 0.125, -43.4]`, the capsule fits, the real selector chooses the pickup, and `PlayerActions.activate()` equips the SMG with `24 / 48` and removes its ground item. Four sampled approaches had clear sight; the north approach was correctly occluded by the supply cabinet. The initial runtime spawn Y of 0.18 put its bottom at 0.192 above the 0.12 floor; the lead was advised to lower that spawn Y to 0.12. No runtime change was made by this specialist.
