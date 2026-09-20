# Stickman animation lab

`npm run dev` → http://localhost:5173/lab.html. Full-screen solid-black rendering of `public/models/stickman.glb` on paper
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
| `clips/behavior.ts` | behaviour clips; relaxed looking uses planted feet, separate head-led glances and delayed shoulder follow |
| `gait.ts` | bakes narrow walk/run foot paths, forward knee poles, pelvis height and fixed-length leg rotations into shared clips |
| `death-settle.ts` | bakes staggered limp limb release, impact flex and resting head/hand/leg floor contacts into all six deaths |
| `actions/scenario.ts` | game-like combos (shot → flinch/death + blood, armed patrol, alert + burst, reset) and "Export clips JSON" |
| `panel.tsx` | preact panel: camera presets, speed/crossfade, action buttons, bone inspector |
| `main.ts` | renderer, scene, orbit camera, rAF loop, hotkeys |
| `weapons/models/` | individual gun builders and shared ink primitives; grip origin and local muzzle/ejection markers. `gun()` batches every piece into one fill + one stroke mesh (+ one hull) per rigid unit and shares that geometry between all copies of a model: only groups registered in `parts` stay separately movable |
| `weapons/guns.ts` | gun clips, firing/reload operations, moving parts, effects, interruption cleanup |
| `weapons/poses.ts` | solves authored weapon holds into fixed-length arm animation keys |
| `weapons/support.ts` | analytic arm positioning, wrist orientation, and elbow direction for grips and moving mechanisms |
| `weapons/dropped.ts` | released weapon fall, floor settling, and cleanup |

The relaxed look-around loop lasts 9.6 s. Its pelvis and feet stay planted while the head/neck lead two
unequally timed glances, the shoulders follow 0.17 s later, and subtle breathing continues through the holds.
Every root sample is explicit, including the matching loop endpoints, so looking cannot slide the stance
or jump on repeat. The same clip is used by idle guards. Check it with `scripts/check-lab-relaxed-look.js`
through agent-browser and `scripts/enemy-motion-checks.ts`.

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

Deviation from the original rig handoff: head turn is **Y**, not Z. Everything else matched.

Mirror rule (verified exact on arms and legs): swap `.L`/`.R`, keep x, negate y and z → `mirrorPose()`.

## Caveats

- Don't `mergeVertices`; the mesh has no UVs.
- The bone inspector overrides the animation each frame for any bone whose sliders are non-zero; "reset pose" clears it.
  "copy pose JSON" logs and copies the non-zero bones as a `Pose`.
- The outline is an inverted hull (back faces pushed out 1.2 px along the skinned normal); it follows skinning. Fill is
  flat `MeshBasicMaterial`, no lights in the scene.
- No additive layering in `Player`: one active action plus crossfade.
- Hotkeys are ignored while a text input is focused; buttons blur themselves after click.

## Walking and running

The shared GLB's hip contour and upper-arm weight transition were refined after
the gait revision. The reproducible Blender script is `scripts/refine-stickman-contours.py`.
The current shoulder proportions
put arm attachments at ±15.5 cm, with a flatter shoulder slope and smaller,
lower armpit openings matching the annotated reference. The loaded rig now shortens
both arms by 8% from shoulder to wrist while preserving the shoulder attachment,
hand size and original GLB. Mesh vertices and joints are rebound together before
animation and weapon poses are built.
Regenerate exported clips against this model; weapon holds are solved from its
loaded joint positions.

The GLB's resting hip/knee/ankle centres are at ±8/10/15 cm. Its wide rest stance
is useful for other poses but should not define forward locomotion. `gait.ts`
uses upper-body motion from the [CC0 Quaternius library](data/README.md),
coordinated with support-driven walking and running. Grounded foot paths follow
parallel lanes (18/17 cm apart), with fixed-length legs and forward knee poles.
The baked ordinary quaternion and hips-position tracks are shared by the lab,
game and JSON export, without runtime IK or a modified GLB.

Walking lasts 0.86 s at 1.0 m/s; running lasts 0.68 s at 2.8 m/s. `GAIT_SPEED` is
shared with enemies and the hostage so stance-foot speed matches root travel.
Enemy running in the game uses the lab's 1.2× setting: 3.36 m/s with the same
adapted stride and cadence. Patrol walking and hostage escort keep their existing speeds.
Above normal speed, the playback control increases horizontal stride length as
well as cadence. At 2×, walking takes 50% longer steps at 1.33× cadence; running
takes 40% longer steps at 1.43× cadence. Cached variants retain fixed leg lengths
and grounded caps. Speed edits preserve step phase, pause freezes the current
stride, and speeds below 1× remain slow-motion previews. Mission movement and
armed-patrol scenarios use the same stride adaptation.
The model has rounded leg ends and no foot bones: ground clearance is calibrated
to those caps. These clips target level ground, without terrain adaptation.

Only planted feet constrain the pelvis; airborne legs lift to accommodate their
reach instead of pulling the body down. Walking rises over the straight support
leg with a single smooth arc and 2.6 cm foot recovery. Running keeps each foot
planted for 25% of the normal cycle, landing about 21 cm ahead of the hips and
pushing off about 26 cm behind them. The swing foot follows keyed points
(`RUN_SWING` in `gait.ts`): it trails and folds up behind the body, passes under
the hips late beneath a rising knee (thigh peaks near 45° around the opposite
toe-off), then reaches and pulls back into contact at ground speed. Coming forward
early read as a prancing high-knee jog; dropping early read as a goose-step. A
soft-knee reach limit eases in after toe-off and out before contact so the
fixed-length leg never snaps straight. Hip height is a ballistic flight arc
(`RUN_GRAVITY`, softened because footless legs cannot absorb a full landing)
joined to a cubic support dip, about 5.5 cm of travel. The hips shift 1 cm over the
planted foot, the pelvis drops 4.5° toward the swinging side and the chest
counter-leans 2°, with the head level and centred. The torso pitches through each
push-off and the head follows about 27 ms later at normal speed.
Ground contact shortens as running stride grows; forward/back foot travel spans
67–79 cm across 1×–2×. Normal walking body travel remains 3.24 cm.
Pelvis/shoulder counter-rotation and opposite arm swing follow the step phase,
with more arm travel for longer strides. Running leans the chest forward 9–15°
with a nearly level head (2–6°). Its arm swing is authored in world space on top of
that lean: the elbow drives behind the hip, the hand rises to chest height in front
and crosses slightly toward the sternum, with the elbows a little clear of the ribs.

Run `npm run test:gait` for real-GLB checks covering knee bend, landing speed,
support contact, step width, torso/head stability, one rise per step, bone lengths,
foot sliding, loop closure, export and game consumers.
`scripts/check-lab-gait.js` exercises the real lab controls and playback at 1×,
1.5× and 2× through agent-browser.
For front/side contact sheets, reload `/lab.html` and evaluate
`scripts/capture-lab-gait.js` through agent-browser. Review full-speed playback as
well as contact sheets; the technical checks cannot establish animation quality.

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
the source rest mesh. The arm shortening is then applied before the final rebind.
Grip contact is 3.5 cm along hand-local +Y, inside the visible fist. Weapon poses solve the
loaded arm lengths with explicit wrist orientations and outward/downward elbow directions. Ordinary body clips
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

All six deaths finish with supported hands, lower legs and head. Arm/leg deaths yield through the waist and
ribcage, roll toward a relaxed resting pose, then release the limbs at staggered times. The shared settling
pass adds a damped torso response and fixed-length floor contacts, baked at 120 Hz into ordinary clips;
pause, export, game mirroring and saved-pose restoration need no separate simulation state.
Run `npm run test:deaths` for the real-mesh and mission checks, or `scripts/check-lab-deaths.js` through
agent-browser for normal-speed button playback.

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

## Combat reactions and firing postures

The **Combat stance** group selects Stand, Shallow crouch, One knee, or Prone.
Equip any weapon, select a stance, then use Fire (`F`), aim/hip holds, reload, or
automatic fire (SMG/AK). These operations retain the lower-body stance. Prone uses
a forward supported hold even when Hip fire or Lower gun is selected. Holster and
Reset scene restore standing; switching weapons keeps the selected posture.

**Behaviour** and **Scenario** expose three missed-shot responses: a shallow crouch
with a left/right scan, a fast prone drop, and a one-knee drop. Each stays in its
defensive stance. Fire, reload, and auto commands during the transition queue until
the character settles. Stop, locomotion, another stance, holster, and death cancel
the old reaction. Standing from prone passes through kneeling.

**Shotgun: airborne knockback** (`6`) / **Shot: shotgun blast** releases the weapon,
dips the torso, throws the body backward with legs and arms lifting together, and
settles after a staggered back/shoulder impact. It adds multiple initial blood fans,
three airborne trail emissions, and an impact splash/pool. All effects respect
blood settings, playback speed, pause, interruption, and existing particle limits.

`postures.ts` authors the lower body and bakes posture-specific weapon performances
with fixed arm lengths and a forward muzzle. Static postures and generated weapon
variants are available in the clip export; support/mechanism contact uses the same
weapon IK as standing. The game enemy director now uses these shared poses for
near-miss reactions and firing, plus the shotgun death clip. Shared walk/run clips
also feed the game characters.

Run `scripts/check-lab-combat.js` through agent-browser after a fresh lab load.
