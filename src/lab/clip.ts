import * as THREE from 'three'
import { BONE_NAMES, STRETCH_CHILD, rest, type BoneName } from './rig'

export type Vec3 = [number, number, number]
/** [x, y, z] degrees, plus an optional length factor (1 = rest) for bones in STRETCH_CHILD: shortens the bone and its mesh. */
export type BoneVal = [number, number, number, number?]
/** Degrees per bone, bone-local, relative to REST ([0,0,0] = rest). See rig.ts for axis meanings. */
export type Pose = Partial<Record<BoneName, BoneVal>>
export type Key = {
  t: number
  pose: Pose
  /** hips position offset in metres, added to the rest hips position */
  root?: Vec3
  /** how the pose is reached FROM THE PREVIOUS key (ignored on the first key). Default 'smooth'. */
  ease?: 'linear' | 'smooth'
}

// ponytail: QuaternionKeyframeTrack only supports linear interpolation, so 'smooth' segments are
// baked to slerp samples at this rate. Raise if slow arcs look stepped.
const BAKE_HZ = 30

function needRest() {
  if (!rest) throw new Error('clip.ts: rest pose unknown, call loadStickman() before building clips')
  return rest
}

/** rest * euler for one bone. Euler order 'ZYX' = rotate about rest X first, then Y, then Z (Blender's "XYZ"). */
export function poseQuat(bone: BoneName, [x, y, z]: BoneVal, out = new THREE.Quaternion()) {
  const d = THREE.MathUtils.DEG2RAD
  return out.setFromEuler(new THREE.Euler(x * d, y * d, z * d, 'ZYX')).premultiply(needRest()[bone].quat)
}

/**
 * Bones mentioned in any key get a full track (fill-forward between keys); bones never mentioned
 * get a single rest keyframe so crossfades return them to rest.
 * opts.duration defaults to the last key's time. opts.loop appends key[0] at `duration` so the clip wraps.
 */
export function makeClip(name: string, keys: Key[], opts: { loop?: boolean; duration?: number } = {}): THREE.AnimationClip {
  const restPose = needRest()
  keys = [...keys].sort((a, b) => a.t - b.t)
  if (!keys.length) throw new Error(`makeClip(${name}): no keys`)
  const duration = opts.duration ?? keys[keys.length - 1].t
  if (opts.loop && keys[keys.length - 1].t < duration) keys.push({ ...keys[0], t: duration })

  const used = new Set<BoneName>()
  for (const k of keys) for (const b of Object.keys(k.pose) as BoneName[]) used.add(b)
  const useRoot = keys.some(k => k.root)

  const times: number[] = []
  const quats = new Map<BoneName, number[]>([...used].map(b => [b, []]))
  const roots: number[] = []
  const stretched = [...used].filter(b => STRETCH_CHILD[b]).map(b => STRETCH_CHILD[b]!)   // children whose position a length factor moves
  const childPos = new Map<BoneName, number[]>(stretched.map(c => [c, []]))
  const cur: Pose = {}
  let curRoot: Vec3 = [0, 0, 0]
  let prevT = 0
  let prevQ = new Map<BoneName, THREE.Quaternion>()
  let prevRoot = new THREE.Vector3()
  let prevChild = new Map<BoneName, THREE.Vector3>()

  const push = (t: number, q: Map<BoneName, THREE.Quaternion>, r: THREE.Vector3, c: Map<BoneName, THREE.Vector3>) => {
    times.push(t)
    for (const b of used) quats.get(b)!.push(...q.get(b)!.toArray())
    if (useRoot) roots.push(...r.toArray())
    for (const ch of stretched) childPos.get(ch)!.push(...c.get(ch)!.toArray())
  }

  keys.forEach((key, i) => {
    Object.assign(cur, key.pose)
    if (key.root) curRoot = key.root
    const q = new Map<BoneName, THREE.Quaternion>([...used].map(b => [b, poseQuat(b, cur[b] ?? [0, 0, 0])]))
    const r = restPose.hips.pos.clone().add(new THREE.Vector3(...curRoot))
    const c = new Map<BoneName, THREE.Vector3>([...used].filter(b => STRETCH_CHILD[b]).map(b => [STRETCH_CHILD[b]!, restPose[STRETCH_CHILD[b]!].pos.clone().multiplyScalar(cur[b]?.[3] ?? 1)]))
    if (i === 0) push(key.t, q, r, c)
    else {
      const smooth = (key.ease ?? 'smooth') === 'smooth'
      const n = smooth ? Math.max(1, Math.round((key.t - prevT) * BAKE_HZ)) : 1
      for (let s = 1; s <= n; s++) {
        const u = s / n, w = smooth ? u * u * (3 - 2 * u) : u
        push(prevT + (key.t - prevT) * u,
          new Map([...used].map(b => [b, prevQ.get(b)!.clone().slerp(q.get(b)!, w)])),
          prevRoot.clone().lerp(r, w),
          new Map(stretched.map(ch => [ch, prevChild.get(ch)!.clone().lerp(c.get(ch)!, w)])))
      }
    }
    prevT = key.t; prevQ = q; prevRoot = r; prevChild = c
  })

  const tracks: THREE.KeyframeTrack[] = []
  for (const b of BONE_NAMES) {
    const values = used.has(b) ? quats.get(b)! : restPose[b].quat.toArray()
    tracks.push(new THREE.QuaternionKeyframeTrack(`${restPose[b].node}.quaternion`, used.has(b) ? times : [0], values))
  }
  if (useRoot) tracks.push(new THREE.VectorKeyframeTrack(`${restPose.hips.node}.position`, times, roots))
  for (const ch of new Set(Object.values(STRETCH_CHILD)))   // every stretchable child gets a position track so crossfades restore its length
    tracks.push(new THREE.VectorKeyframeTrack(`${restPose[ch].node}.position`, childPos.has(ch) ? times : [0], childPos.get(ch) ?? restPose[ch].pos.toArray()))
  return new THREE.AnimationClip(name, duration, tracks)
}

/**
 * Swap .L/.R and mirror the rotation across the character's sagittal plane.
 * .R bone rest frames are the X-flipped mirror of .L (checked against the GLB rest quaternions), so
 * a mirrored rotation keeps X and negates Y and Z. Central bones (spine, head...) get the same sign flip.
 */
export function mirrorPose(pose: Pose): Pose {
  const out: Pose = {}
  for (const [name, v] of Object.entries(pose) as [BoneName, BoneVal][]) {
    const other = name.endsWith('.L') ? `${name.slice(0, -2)}.R` : name.endsWith('.R') ? `${name.slice(0, -2)}.L` : name
    out[other as BoneName] = v[3] === undefined ? [v[0], -v[1], -v[2]] : [v[0], -v[1], -v[2], v[3]]
  }
  return out
}

/** Serializable form for porting a clip into the game (THREE.AnimationClip.parse to load). */
export const clipToJSON = (clip: THREE.AnimationClip) => THREE.AnimationClip.toJSON(clip)
