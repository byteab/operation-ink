import * as THREE from 'three'

export type PlayOpts = {
  /** crossfade seconds from the current action; default Player.fade */
  fade?: number
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

  constructor(root: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(root)
    const hips = root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName('hips'))
    this.hips = hips instanceof THREE.Bone ? hips : null
    this.mixer.addEventListener('finished', e => { if (e.action === this.current) this.settle(true) })
  }

  /** Resolves `true` when a one-shot finishes (immediately for loops), `false` if interrupted by play/stop. */
  play(clip: THREE.AnimationClip, { fade = this.fade, once = false, loop = !once, speed = 1 }: PlayOpts = {}): Promise<boolean> {
    this.revision++
    const boneTransition = this.captureAdjustedPose(fade)
    this.restoreAdjustedBones()
    this.settle()
    const prev = this.current
    const action = this.mixer.clipAction(clip)
    action.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity).setEffectiveWeight(1)
    action.clampWhenFinished = !loop
    action.timeScale = speed
    action.play()
    if (prev && prev !== action) {
      if (fade > 0) prev.crossFadeTo(action, fade, false)
      else prev.stop()
      this.rootTransition = fade > 0 ? this.makeRootTransition(action, fade) : null
    } else {
      this.rootTransition = null
    }
    this.current = action
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
    this.restoreAdjustedBones()
    if (fade > 0) this.current?.fadeOut(fade)
    else this.current?.stop()
    this.current = null
    this.rootTransition = null
    this.boneTransition = boneTransition
    this.blendAdjustedPose(0)
    this.settle()
  }

  setSpeed(s: number) { this.mixer.timeScale = s }

  /** Apply a temporary pose correction after animation, keeping the first unadjusted pose. */
  adjustBones(bones: readonly THREE.Bone[], adjust: () => void) {
    for (const bone of bones) {
      if (!this.adjustedBones.has(bone)) this.adjustedBones.set(bone, bone.quaternion.clone())
    }
    adjust()
  }

  update(dt: number) {
    // The mixer skips writes when a track's value is unchanged. Restore its original
    // output before evaluation so frame-local IK cannot become the next pose's input.
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
