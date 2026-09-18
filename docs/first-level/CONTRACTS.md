# Integration contracts

Coordinator owns `src/game/mission.ts`, `runtime.ts`, `audio.ts`, `hud.ts`, `game.css`, main/controller/action integration, index, tests and README. Specialists own only assigned modules. World + stations built before CollisionWorld; moving actors/pickups/viewmodel added after. No actor goes into static collision. Do not change lab files unless explicitly agreed.

Shared `src/game/types.ts` is coordinator-owned. Read it before implementation; request changes by message. Import types rather than duplicated definitions.

Mission runtime constructor receives scene, renderer, camera facade, player and invalidate. It initializes weapon/AI systems asynchronously; controls stay disabled until actor asset loaded or a visible loading error is shown. Per-frame order: doors → player → runtime (input/perception/AI/weapons/mission/audio/HUD) → render. Mission update returns true while unpaused. Exploration/VR pauses mission. Scene data constructed by `createMissionWorld()` includes root, stations, spawn/look target, bounds and enemy specifications. Stations are local Object3D roots with world-space points. Waypoint positions are feet coordinates. Door references found by name or world proximity.

Audio events: `SoundEvent {kind, position?: Vector3, radius?: number, text?: string}`. Radius is gameplay hearing radius, independent of master volume. Runtime fans out emit to audio and AI where appropriate (enemy sounds must not recursively alert allies). Player damage callback is amount + optional source. Kill callback creates exactly one `WeaponItem` at death position. Snapshot APIs must return JSON-safe numbers/tuples/objects (no scene references).

Weapons own inventory and first-person rig, dropped meshes and item interactions. API described in types. Actual shot callback provides world origin/direction/range/damage; runtime resolves nearest solid occlusion and AI hit in same frame. No async action timers. Weapon snapshots conserve loaded/reserve ammo and ground item IDs. AI own animation, actor health, navigation/perception/combat, snapshot/restore and disposal. AI hit test is ray distance clipped by world obstruction. AI update uses current player eye/feet, velocity, active/alive flags and radioEnabled; no perfect tracking without sight/hearing.

All systems use dt seconds and deterministic serializable timers. Paused updates do not advance timers; interrupt pending actions on transition to paused/climbing/interaction/death. Each handoff records changed files, tests, limitations and integration dependency under docs/first-level.
