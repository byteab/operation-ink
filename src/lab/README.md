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
// shader compresses that bone's mesh along its axis (thickness unchanged). Use it to fit an arm to a prop, see guns.ts aim2.
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
