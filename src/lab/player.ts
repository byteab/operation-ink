import * as THREE from 'three'
import { gaitPlayback, FOOT_CLEARANCE, SHIN_LENGTH } from './gait'

export type PlayOpts = {
  /** crossfade seconds from the current action; default Player.fade */
  fade?: number
  /** Blend from the rendered pose; call blendPose after frame-local IK/weapon adjustments. */
  poseFade?: boolean
  /** default: !once */
  loop?: boolean
  /** per-action time scale */
  speed?: number
  /** play once, hold the last frame, resolve the returned promise when finished */
  once?: boolean
}

type RootTransition = {
  action: THREE.AnimationAction
  track: THREE.VectorKeyframeTrack
  interpolant: THREE.Interpolant
  elapsed: number
  duration: number
}

type BoneTransition = {
  from: Map<THREE.Bone, THREE.Quaternion>
  elapsed: number
  duration: number
}
type BonePose = { position: THREE.Vector3; quaternion: THREE.Quaternion }
type PoseTransition = { from: Map<THREE.Bone, BonePose>; elapsed: number; duration: number; floor: number }

// ponytail: single active action + crossfade. No additive layers; add when a feature needs one.
export class Player {
  readonly mixer: THREE.AnimationMixer
  fade = 0.2
  current: THREE.AnimationAction | null = null
  /** Changes on every playback command, including replaying the same cached action. */
  revision = 0
  private finish: ((done: boolean) => void) | null = null
  private readonly hips: THREE.Bone | null
  private rootTransition: RootTransition | null = null
  private boneTransition: BoneTransition | null = null
  private readonly adjustedBones = new Map<THREE.Bone, THREE.Quaternion>()
  private readonly savedQuaternions = new Map<THREE.Bone, THREE.Quaternion>()
  private sourceClip: THREE.AnimationClip | null = null
  private actionSpeed = 1
  private lastPlaybackSpeed = 1
  private readonly bones: THREE.Bone[] = []
  private readonly shins: THREE.Bone[] = []
  private poseTransition: PoseTransition | null = null
  private readonly unblendedPose = new Map<THREE.Bone, BonePose>()
  private readonly footPoint = new THREE.Vector3()

  constructor(root: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(root)
    const hips = root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('hips'))
    this.hips = hips instanceof THREE.Bone ? hips : null
    root.traverse(object => { if (object instanceof THREE.Bone) this.bones.push(object) })
    this.shins = this.bones.filter(bone => ['shinL', 'shinR'].includes(bone.name))
    this.mixer.addEventListener('finished', e => { if (e.action === this.current) this.settle(true) })
  }

  /** Resolves `true` when a one-shot finishes (immediately for loops), `false` if interrupted by play/stop. */
  play(clip: THREE.AnimationClip, { fade = this.fade, poseFade = false, once = false, loop = !once, speed = 1 }: PlayOpts = {}): Promise<boolean> {
    this.revision++
    const poseTransition = poseFade && this.current && fade > 0
      ? { from: this.capturePose(), elapsed: 0, duration: fade, floor: this.footHeight() } : null
    const boneTransition = poseFade ? null : this.captureAdjustedPose(fade)
    this.restoreBlendedPose()
    this.restoreAdjustedBones()
    this.settle()
    const prev = this.current
    // A pose blend owns the transition, including interrupted blends. Keep one
    // target action so rapid state changes cannot accumulate fading actions.
    if (poseFade) this.mixer.stopAllAction()
    this.sourceClip = clip
    this.actionSpeed = speed
    const playback = gaitPlayback(clip, speed * this.lastPlaybackSpeed)
    const action = this.mixer.clipAction(playback.clip)
    action.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity).setEffectiveWeight(1)
    action.clampWhenFinished = !loop
    action.timeScale = speed / playback.stride
    action.play()
    if (prev && prev !== action) {
      if (fade > 0 && !poseFade) prev.crossFadeTo(action, fade, false)
      else prev.stop()
      this.rootTransition = fade > 0 && !poseFade ? this.makeRootTransition(action, fade) : null
    } else {
      this.rootTransition = null
    }
    this.current = action
    this.poseTransition = poseTransition
    this.boneTransition = boneTransition
    this.blendAdjustedPose(0)
    return loop ? Promise.resolve(true) : new Promise(resolve => { this.finish = resolve })
  }

  /** Play clips back to back as one-shots. */
  async queue(clips: THREE.AnimationClip[], opts: Omit<PlayOpts, 'once' | 'loop'> = {}) {
    for (const clip of clips) await this.play(clip, { ...opts, once: true })
  }

  stop(fade = this.fade) {
    this.revision++
    const boneTransition = this.captureAdjustedPose(fade)
    this.restoreBlendedPose()
    this.poseTransition = null
    this.restoreAdjustedBones()
    if (fade > 0) this.current?.fadeOut(fade)
    else this.current?.stop()
    this.current = null
    this.sourceClip = null
    this.rootTransition = null
    this.boneTransition = boneTransition
    this.blendAdjustedPose(0)
    this.settle()
  }

  setSpeed(s: number) {
    this.mixer.timeScale = s
    // Pause freezes the current stride as well as its time.
    if (s > 0) { this.lastPlaybackSpeed = s; this.refreshGait() }
  }

  /** Movement speed relative to the base clip, independent of global playback. */
  setActionSpeed(speed: number) {
    if (speed === this.actionSpeed) return
    this.actionSpeed = speed
    this.refreshGait()
  }

  private refreshGait() {
    const previous = this.current
    if (!previous || !this.sourceClip) return
    const playback = gaitPlayback(this.sourceClip, this.actionSpeed * this.lastPlaybackSpeed)
    if (playback.clip !== previous.getClip()) {
      // Changing speed keeps the same foot in the same phase; it is not a new
      // playback command and must not interrupt scenario/reaction bookkeeping.
      const time = previous.time * (playback.clip.duration / previous.getClip().duration)
      const paused = previous.paused, enabled = previous.enabled
      const weight = previous.getEffectiveWeight()
      previous.stop()
      const action = this.mixer.clipAction(playback.clip)
      action.reset().setLoop(previous.loop, previous.repetitions).setEffectiveWeight(weight)
      action.clampWhenFinished = previous.clampWhenFinished
      action.time = time
      action.paused = paused
      action.enabled = enabled
      action.play()
      this.current = action
      this.rootTransition = null
    }
    this.current!.timeScale = this.actionSpeed / playback.stride
  }

  /** Apply a temporary pose correction after animation, keeping the first unadjusted pose. */
  adjustBones(bones: readonly THREE.Bone[], adjust: () => void) {
    for (const bone of bones) {
      if (this.adjustedBones.has(bone)) continue
      // Every character adjusts ~9 bones each frame; keep one saved quaternion per bone instead of cloning.
      let saved = this.savedQuaternions.get(bone)
      if (!saved) this.savedQuaternions.set(bone, saved = new THREE.Quaternion())
      this.adjustedBones.set(bone, saved.copy(bone.quaternion))
    }
    adjust()
  }

  update(dt: number) {
    // The mixer skips writes when a track's value is unchanged. Restore its original
    // output before evaluation so frame-local IK cannot become the next pose's input.
    this.restoreBlendedPose()
    this.restoreAdjustedBones()
    this.mixer.update(dt)
    const transition = this.rootTransition
    if (transition && this.hips) {
      // Hips position is the clip's foot-ground compensation. Letting the mixer
      // blend two absolute hips tracks creates a third, usually too-low, height.
      const t = Math.min(transition.action.time, transition.track.times[transition.track.times.length - 1])
      const value = transition.interpolant.evaluate(Math.max(0, t))
      this.hips.position.fromArray(value)
      transition.elapsed += dt * this.mixer.timeScale
      if (transition.elapsed >= transition.duration) this.rootTransition = null
    }
    this.blendAdjustedPose(dt)
    if (this.poseTransition) this.poseTransition.elapsed += Math.max(0, dt * this.mixer.timeScale)
  }

  /** Finish after procedural posing, so the next state starts at the actual visible pose. */
  blendPose(grounded = false) {
    const transition = this.poseTransition
    if (!transition) return
    const t = Math.min(1, transition.elapsed / transition.duration)
    if (t >= 1) { this.poseTransition = null; return }
    const weight = t * t * (3 - 2 * t)
    const floor = grounded ? Math.min(FOOT_CLEARANCE, transition.floor, this.footHeight()) : -Infinity
    for (const [bone, from] of transition.from) {
      this.unblendedPose.set(bone, { position: bone.position.clone(), quaternion: bone.quaternion.clone() })
      bone.position.lerp(from.position, 1 - weight)
      bone.quaternion.slerp(from.quaternion, 1 - weight)
    }
    // Interpolating bent legs can temporarily lengthen their reach. Lift only
    // enough to keep the end caps grounded; never move the navigation root.
    if (this.hips && grounded) this.hips.position.y += Math.max(0, floor - this.footHeight())
  }

  private capturePose() {
    return new Map(this.bones.map(bone => [bone, { position: bone.position.clone(), quaternion: bone.quaternion.clone() }]))
  }

  private restoreBlendedPose() {
    for (const [bone, pose] of this.unblendedPose) {
      bone.position.copy(pose.position); bone.quaternion.copy(pose.quaternion)
    }
    this.unblendedPose.clear()
  }

  private footHeight() {
    let height = Infinity
    for (const shin of this.shins) {
      this.footPoint.set(0, SHIN_LENGTH, 0)
      for (let bone: THREE.Object3D | null = shin; bone && bone !== this.hips?.parent; bone = bone.parent) {
        this.footPoint.applyQuaternion(bone.quaternion).add(bone.position)
      }
      height = Math.min(height, this.footPoint.y)
    }
    return height
  }

  private captureAdjustedPose(duration: number): BoneTransition | null {
    if (duration <= 0 || !this.adjustedBones.size) return null
    return {
      from: new Map([...this.adjustedBones.keys()].map(bone => [bone, bone.quaternion.clone()])),
      elapsed: 0, duration,
    }
  }

  private blendAdjustedPose(dt: number) {
    const transition = this.boneTransition
    if (!transition) return
    transition.elapsed += dt * this.mixer.timeScale
    const t = Math.min(1, transition.elapsed / transition.duration)
    if (t >= 1) { this.boneTransition = null; return }
    const weight = t * t * (3 - 2 * t)
    // Crossfades only know animation tracks. Begin at the last rendered IK pose,
    // so restoring the underlying arm keys cannot make a weapon jump on a clip change.
    this.adjustBones([...transition.from.keys()], () => {
      for (const [bone, from] of transition.from) bone.quaternion.slerp(from, 1 - weight)
    })
  }

  private restoreAdjustedBones() {
    for (const [bone, quaternion] of this.adjustedBones) bone.quaternion.copy(quaternion)
    this.adjustedBones.clear()
  }

  private makeRootTransition(action: THREE.AnimationAction, duration: number): RootTransition | null {
    if (!this.hips) return null
    const path = `${this.hips.name}.position`
    const track = action.getClip().tracks.find(
      candidate => candidate.name === path && candidate instanceof THREE.VectorKeyframeTrack,
    )
    if (!(track instanceof THREE.VectorKeyframeTrack)) return null
    // @types/three omits KeyframeTrack.createInterpolant even though the
    // runtime API uses it for every animation binding.
    const interpolant = (track as THREE.VectorKeyframeTrack & {
      createInterpolant: () => THREE.Interpolant
    }).createInterpolant()
    return { action, track, interpolant, elapsed: 0, duration }
  }

  private settle(done = false) { this.finish?.(done); this.finish = null }
}
