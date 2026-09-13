# Stickman animation lab

`npm run dev` → http://localhost:5173/lab.html. Full-screen ink/paper render of `public/models/stickman.glb`
with a panel on the right. `window.__lab` is the `Ctx` in dev.

## Files

| File | What |
|---|---|
| `lab.html` (project root) | canvas `#lab` + panel `#panel`, second Vite entry |
| `rig.ts` | `loadStickman()` → `Rig { root, mesh, bones, rest, resetPose() }`, `BoneName`, `BONE_NAMES`, flat fill + skinned outline material. **Bone axis table lives in the comment at the top.** |
| `clip.ts` | `makeClip(name, keys, opts)`, `poseQuat`, `mirrorPose`, `clipToJSON` |
| `player.ts` | `Player`: `play`, `queue`, `stop`, `setSpeed`, `update`; `fade` default |
| `registry.ts` | `Ctx`, `Action`, `Updater`; globs `clips/*.ts`, `actions/*.ts`, `fx/*.ts`, `weapons/*.ts` |
| `clips/idle.ts` | worked example: `hang` pose, `idle` clip, "Idle" action |
| `actions/scenario.ts` | game-like combos (shot → flinch/death + blood, armed patrol, alert + burst, reset) and "Export clips JSON" |
| `panel.tsx` | preact panel: camera presets, speed/crossfade, action buttons, bone inspector |
| `main.ts` | renderer, scene, orbit camera, rAF loop, hotkeys |
| `weapons/models/` | individual gun builders and shared ink primitives; grip origin and local muzzle/ejection markers |
| `weapons/guns.ts` | gun clips, firing/reload operations, moving parts, effects, interruption cleanup |
| `weapons/poses.ts` | solves authored weapon holds into fixed-length arm animation keys |
| `weapons/support.ts` | analytic arm positioning, wrist orientation, and elbow direction for grips and moving mechanisms |
| `weapons/dropped.ts` | released weapon fall, floor settling, and cleanup |

## Adding things (drop a file in, no edits to existing files)

Every module in `clips/`, `actions/`, `fx/`, `weapons/` is imported eagerly. It may export:

```ts
export const clips: Record<string, THREE.AnimationClip>   // merged into ctx.clips
export const actions: Action[]                             // buttons in the panel, grouped by `group`
export const update: (dt: number, ctx: Ctx) => void        // called every frame after player.update
```

`Action = { group, label, run(ctx), hotkey? }`. `hotkey` is a single key (letter/digit), matched case-insensitively.
`Ctx = { rig, player, scene, camera, fx, weapons, clips, time }` — `fx`/`weapons` are empty objects for you to
stash state in. `updaters` from `registry.ts` can also be pushed to at runtime (from `run`), but not at module
top level (circular import). Modules evaluate after the rig loads, so `makeClip` at top level is fine.

Clip module template:

```ts
import { makeClip, mirrorPose, type Pose } from '../clip'
import { hang } from './idle'
import type { Action } from '../registry'

const punch: Pose = { ...hang, 'upper_arm.R': [-70, 90, 0], 'forearm.R': [0, 0, 20] }
export const clips = {
  punch: makeClip('punch', [{ t: 0, pose: hang }, { t: 0.15, pose: punch }, { t: 0.5, pose: hang }]),
  punchL: makeClip('punchL', [{ t: 0, pose: hang }, { t: 0.15, pose: mirrorPose(punch) }, { t: 0.5, pose: hang }]),
}
export const actions: Action[] = [
  { group: 'Combat', label: 'Punch', hotkey: 'p', run: async ({ player, clips }) => { await player.play(clips.punch, { once: true }); player.play(clips.idle) } },
]
```

## Pose / Key format

```ts
type Pose = Partial<Record<BoneName, [x, y, z, len?]>>   // degrees, bone-local, relative to REST; [0,0,0] = T-pose
// len (optional, default 1) scales the bone's length for upper_arm/forearm/thigh: the child bone slides along it and the
// shader compresses that bone's mesh along its axis (thickness unchanged). Weapon holds retain the rig's actual lengths.
type Key = { t: number; pose: Pose; root?: [x, y, z]; ease?: 'linear' | 'smooth' }
makeClip(name, keys, { loop?: boolean; duration?: number })
```

- Rotation = rest × Euler(x, y, z, order 'ZYX'): X applied first, then Y, then Z, about the bone's REST axes. This is
  what Blender calls XYZ, so handoff numbers port unchanged.
- `root` = hips position offset in metres (jumps, crouches). Omit it and hips stay at rest height.
- `ease` describes how the pose is reached from the previous key (default `smooth`, which is baked to 30 Hz slerp
  samples because `QuaternionKeyframeTrack` has no smooth interpolant).
- Bones set in an earlier key and omitted later hold their value (fill-forward). Bones never mentioned in the clip get
  one rest keyframe, so a crossfade to this clip returns them to rest — so start from `hang` if arms should stay down.
- `duration` defaults to the last key's `t`. `loop: true` appends `keys[0]` at `duration` so the clip wraps seamlessly.
- Track names use the sanitized node names (`upper_armL.quaternion`); `clipToJSON(clip)` gives
  `THREE.AnimationClip.toJSON` output, load in the game with `THREE.AnimationClip.parse`.

`player.play(clip, { fade = player.fade, once = false, loop = !once, speed = 1 })` crossfades from the current action and
returns a promise: `true` when a one-shot finishes (immediately for loops), `false` if something else interrupted it — check it before chaining the next clip.
`player.queue([a, b, c])` chains one-shots. `player.stop()` fades out; `rig.resetPose()` snaps bones to rest.

## Verified bone axes (lab inspector, 2026-09-13)

Character faces **+Z**. `.L` bones are at world +X (screen-right in the "front" camera). Bone-local +Y runs along the bone.

| bone | +X | +Y | +Z |
|---|---|---|---|
| upper_arm.L/R | raises arm above T-pose; **−80 = hanging at side** | with the arm hanging: −90 swings hand forward (+Z), +90 back; at T-pose it's a twist | swings the T-pose arm backward; **−90 = straight forward** |
| forearm.L | (hanging) −90 bends hand inward across the body | twist | −90 bends elbow, hand forward (+Z). `.R` is +90 |
| hand.L | bends toward the palm side (−) | twist | −60 tips hand forward (+Z). `.R` is + |
| shoulder.L/R | same frame as upper_arm, owns no vertices | | leave at 0 |
| thigh.L/R | swings leg **backward** (−Z); −X = forward / knee lift | twist | + = inward toward the other leg, − = outward (`.R` mirrored) |
| shin.L/R | **bends the knee** (heel goes back); keep ≥ 0 | twist | sideways, avoid |
| hips / spine / chest / neck | leans forward (+Z) | turns toward the character's left (+X) | leans sideways toward the character's right (−X) |
| head | nods down | **turns head** to the character's left (+X) | tilts ear to the right shoulder |

Deviation from `doc/HANDOFF-stickman.md`: head turn is **Y**, not Z. Everything else matched.

Mirror rule (verified exact on arms and legs): swap `.L`/`.R`, keep x, negate y and z → `mirrorPose()`.

## Caveats

- Don't `mergeVertices`; the mesh has no UVs.
- The bone inspector overrides the animation each frame for any bone whose sliders are non-zero; "reset pose" clears it.
  "copy pose JSON" logs and copies the non-zero bones as a `Pose`.
- The outline is an inverted hull (back faces pushed out 1.2 px along the skinned normal); it follows skinning. Fill is
  flat `MeshBasicMaterial`, no lights in the scene.
- No additive layering in `Player`: one active action plus crossfade.
- Hotkeys are ignored while a text input is focused; buttons blur themselves after click.

## Guns

Pistol and revolver silhouettes are about 26 cm long, with grips fitted to the existing fist. Each builder uses +Z
for the barrel, +Y for up, and a grip-centred origin. `userData.muzzle` and `eject` are local effect markers;
`support` places the support fist on a long gun. Animated `parts` can expose a local `userData.grip` for hand contact.

Only SMG and AK support the automatic-fire toggle. Shotgun and sniper cycle after both aimed and hip shots.
Revolver reload opens the cylinder and ejects six cases; magazine-fed guns move their magazines and charging parts.
The lab has unlimited ammunition. All gun effects and mechanisms follow the playback speed and pause control.
Changing stance, holstering, switching weapons, or interrupting the action cancels pending weapon work.

Arm corrections use `Player.adjustBones()` so the original animation pose is restored before the next mixer update.
This is necessary even for static poses: Three's mixer can skip unchanged track writes. The sniper retains its
solved support arm during the bolt cycle, while the free hand follows the bolt handle.

The loaded rig rebases each wrist 8 cm toward the visible hand and recalculates its inverse bind matrices, preserving
the rest mesh. Grip contact is then 3.5 cm along hand-local +Y, inside the visible fist. Weapon poses solve the
unchanged arm lengths with explicit wrist orientations and outward/downward elbow directions. Ordinary body clips
receive a weapon carry correction; crossfades start from the last corrected arm pose. Entering a weapon action
from movement interpolates the visible gun transform while maintaining hand contact. Equipping establishes a
safe hold immediately, since the lab has no draw animation.
Small guns use a relaxed thigh-level lowered hold, a softly extended aiming arm, and a nearly neutral wrist.
Idle and walking carry reuse that lowered hold. The SMG receiver sits above the fist so its rear clears the forearm.
Exported clips target this calibrated rig; use `loadStickman()` or apply its wrist rebinding when playing them elsewhere.

Firing from a lowered stance or an ordinary movement animation raises the weapon before emitting the shot.
`fire()` returns `null` while that raise is queued, and returns the actual muzzle ray for immediate aimed or hip
shots. Raising preserves the selected aimed or hip hold, follows playback time, and can be interrupted like a reload.
Manual cycling retains the selected aimed or hip stance.
`readyToFire` indicates that `fire()` can emit immediately; scripted bursts wait for it across hold transitions.
Lethal reactions release the weapon before the death pose starts. The prop falls and settles on the floor,
following playback speed; equipping, holstering, or resetting the scene clears the dropped prop.

For regression checks, start the dev server, open and reload `/lab.html` in agent-browser, then run from the project root:

```sh
agent-browser eval --stdin < scripts/check-lab-guns.js
agent-browser eval --stdin < scripts/check-lab-gun-poses.js
agent-browser eval --stdin < scripts/check-lab-scenarios.js
agent-browser eval --stdin < scripts/check-lab-dropped-guns.js
```

Use the same `--session` flag as the browser session if one was supplied. The scripts check the real rig, effects,
mechanisms, pause behavior, switching, and hand attachment using deterministic simulation steps. The pose checks
also sample weapon surfaces against body interiors, derive fist contact from the mesh, and track movement between
animation frames. Scenario checks cover patrol, alert, burst timing, and interruption. The scripts restore the
selected weapon, stance, playback speed and crossfade afterward. `npm run build` verifies TypeScript and the production bundle.

For visual checks, capture the six weapons in lowered, aimed, and hip positions:

```sh
agent-browser eval --stdin < scripts/capture-lab-guns.js
agent-browser screenshot /tmp/gun-poses.png --full
```

Reload the page to remove the contact sheet. Before running the capture script, set
`window.__gunCaptureOptions` with `view: 'front' | 'side' | 'three' | 'back'`,
`mode: 'stances' | 'reload' | 'fire' | 'auto'`, optional `names`, `times` (seconds), and
`stance: 'hip'`. For example, `{ mode: 'fire', names: ['shotgun', 'sniper'], times: [0.04, 0.4, 0.7] }`
shows recoil and manual cycling. Inspect multiple views: correct attachment coordinates alone cannot establish
that the stock, receiver, wrists, and body have a convincing silhouette.
