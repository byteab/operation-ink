import * as THREE from 'three'
import { applyPenMaterial, penPalette } from '../render/ballpoint'
import { loadStickman, BONE_NAMES, type Rig } from '../lab/rig'
import { Player } from '../lab/player'
import { makeClip, poseQuat, type Pose } from '../lab/clip'
import type { Posture } from '../lab/postures'
import { GAIT_SPEED } from '../lab/gait'
import { disposeGun, type Gun } from '../lab/weapons/models'
import { createMissionGun } from './weapon-models'
import { supportHand } from '../lab/weapons/support'
import { AnimatedHitVolumes, mirrorReactionClip } from './hit-reactions'
import type { EnemyState, WeaponName } from './types'

type Library = {
  clips: Record<string, THREE.AnimationClip>
  poses: typeof import('../lab/weapons/poses')
  postures: typeof import('../lab/postures')
  hang: import('../lab/clip').Pose
}
export type ActorPostureSnapshot = {
  posture: Posture
  transition?: ReturnType<typeof THREE.AnimationClip.toJSON>
  transitionTime?: number
  deathDirection?: [number, number, number]
  deathTravelScale?: number
  deathClip?: ReturnType<typeof THREE.AnimationClip.toJSON>
}
let library: Promise<Library> | undefined

/** The lab builds clips from the loaded rest skeleton, so imports intentionally follow loadStickman. */
async function animations(rig: Rig): Promise<Library> {
  return library ??= Promise.all([
    import('../lab/clips/idle'), import('../lab/clips/locomotion'),
    import('../lab/clips/behavior'), import('../lab/clips/damage'), import('../lab/weapons/poses'), import('../lab/postures'),
  ]).then(([idle, motion, behavior, damage, poses, postures]) => {
    const clips: Record<string, THREE.AnimationClip> = { ...idle.clips, ...motion.clips, ...behavior.clips, ...damage.clips }
    for (const name of ['flinchArm', 'flinchLeg', 'dieArm', 'dieLeg']) clips[`${name}Left`] = mirrorReactionClip(clips[name], rig)
    // The lab turns the root by 60 degrees at once and cancels that with a hips twist.
    // Mission steering rotates continuously: retain its planted foot steps without that cancellation.
    for (const name of ['turnL', 'turnR']) {
      const clip = clips[name].clone()
      const track = clip.tracks.find(track => track.name === `${rig.bones.hips.name}.quaternion`)
      const rest = poseQuat('hips', [0, 0, 0]), inverse = rest.clone().invert()
      if (track) for (let i = 0; i < track.values.length; i += 4) {
        const rotation = new THREE.Quaternion().fromArray(track.values, i).premultiply(inverse)
        const euler = new THREE.Euler().setFromQuaternion(rotation, 'ZYX')
        euler.y = 0
        rest.clone().multiply(rotation.setFromEuler(euler)).toArray(track.values, i)
      }
      clips[name] = clip
    }
    return { clips, poses, postures, hang: idle.hang }
  })
}

/** A real independently loaded lab skeleton, with isolated solid black materials. */
export class EnemyActor {
  readonly root: THREE.Group
  readonly player: Player
  readonly gun: Gun
  private material: THREE.MeshBasicMaterial
  private outlineMaterials: THREE.Material[] = []
  private mode = ''
  private dead = false
  private kick = 0
  private flash: THREE.Mesh
  private armPose = new Map<string, THREE.Quaternion>()
  private displayedArmPose = new Map<string, THREE.Quaternion>()
  private lastPitch = Infinity
  private lastAim = false
  private lastReady = false
  private scanBlend = 0
  private scanProgress = 0
  private idlePhase = 0
  private reacting = 0
  private previousYaw = 0
  private bodyPosture: Posture = 'stand'
  private postureTransition: THREE.AnimationClip | null = null
  private deathAnimation: THREE.AnimationClip | null = null
  private deathDirection?: [number, number, number]
  private deathTravelScale = 1
  private transientClips = new Set<THREE.AnimationClip>()
  readonly hitVolumes: AnimatedHitVolumes
  private readonly upperBody: THREE.Bone[]
  private readonly arms: THREE.Bone[]
  deathClip = 'dieBody'

  private constructor(readonly rig: Rig, private lib: Library, readonly weapon: WeaponName) {
    this.root = rig.root
    this.root.name = 'Black stickman guard'
    this.root.userData.actor = true
    this.root.userData.noCollision = true
    // Each independently loaded guard starts its idle cycle at a different phase.
    this.idlePhase = (this.root.id * 0.61803398875 % 1) * 6.4
    this.player = new Player(this.root)
    this.hitVolumes = new AnimatedHitVolumes(rig)
    this.upperBody = [rig.bones.head, rig.bones.chest, rig.bones.spine]
    this.arms = lib.poses.armBones.map(name => rig.bones[name])
    const original = rig.mesh.material as THREE.MeshBasicMaterial
    this.material = original.clone()
    // Material.clone does not preserve callbacks. Keep the original dual-quaternion shader setup.
    this.material.onBeforeCompile = original.onBeforeCompile
    this.material.customProgramCacheKey = original.customProgramCacheKey.bind(original)
    this.material.color.setHex(penPalette.character)
    this.material.toneMapped = false
    this.material.depthTest = this.material.depthWrite = true
    rig.mesh.material = this.material
    this.root.traverse(object => {
      if (object instanceof THREE.SkinnedMesh && object !== rig.mesh) {
        // The opaque black body already supplies a clean silhouette.
        object.visible = false
      }
    })
    this.gun = createMissionGun(weapon)
    this.gun.position.copy(lib.poses.mountPosition)
    this.gun.quaternion.copy(lib.poses.mountQuaternion)
    rig.bones['hand.R'].add(this.gun)
    const flashMaterial = applyPenMaterial(new THREE.MeshBasicMaterial({ color: penPalette.ink, toneMapped: false }), { density: 0.5, scale: 90, seed: 617 })
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), flashMaterial)
    this.flash.position.copy(this.gun.userData.muzzle)
    this.flash.scale.set(0.65, 0.65, 1.7)
    this.flash.visible = false
    this.gun.add(this.flash)
    this.outlineMaterials.push(flashMaterial)
    this.update(0, 'guard', false)
  }

  static async create(weapon: WeaponName) {
    const rig = await loadStickman()
    return new EnemyActor(rig, await animations(rig), weapon)
  }

  update(dt: number, state: EnemyState, moving: boolean, aim?: THREE.Vector3, speed = moving ? 1.4 : 0) {
    const aimOrigin = aim && this.bodyPosture !== 'stand' ? this.muzzle() : null
    const yawDelta = Math.atan2(Math.sin(this.root.rotation.y - this.previousYaw), Math.cos(this.root.rotation.y - this.previousYaw))
    this.previousYaw = this.root.rotation.y
    if (state === 'dead') {
      if (!this.dead) {
        this.dead = true
        this.gun.visible = false
        this.mode = this.deathClip
        this.reacting = 0
        this.postureTransition = null
        void this.player.play(this.deathAnimation ?? this.lib.clips[this.deathClip] ?? this.lib.clips.dieBody, { once: true, fade: this.deathAnimation ? 0 : 0.06 })
      }
      this.player.update(dt)
      return
    }
    if (this.dead) {
      this.dead = false
      this.mode = ''
      this.gun.visible = true
      this.rig.resetPose()
    }
    // Navigation requests an upright recovery before restarting the shared gait.
    if (moving && this.bodyPosture !== 'stand') this.setPosture('stand')
    if (this.postureTransition && this.postureTransitionRemaining <= 0) {
      this.postureTransition = null
      this.mode = ''
      this.lastPitch = Infinity
    }
    let transitioning = !!this.postureTransition
    const turning = !moving && dt > 0 && Math.abs(yawDelta) > 0.001
    const scan = this.root.userData.alertScan
    const scanning = state === 'suspicious' && typeof scan === 'number' && Number.isFinite(scan)
    if (scanning) this.scanProgress = THREE.MathUtils.clamp(scan, 0, 1)
    this.scanBlend = THREE.MathUtils.lerp(this.scanBlend, scanning ? 1 : 0, 1 - Math.exp(-Math.max(0, dt) / 0.1))
    // Tracking a target requires small turns; keep the gun raised through them.
    // Otherwise every steering correction toggles the arms between aim and carry.
    const aimed = !moving && (state === 'combat' || this.bodyPosture === 'prone' || state === 'suspicious' && !scanning)
    const ready = !aimed && (scanning || state === 'search' || state === 'investigate')
    const looking = !scanning && ['guard', 'idle', 'patrol', 'search', 'investigate'].includes(state)
    const mode = this.bodyPosture !== 'stand' ? `posture_${this.bodyPosture}` : moving ? (speed >= 1.8 ? 'run' : 'walk') : turning ? (yawDelta > 0 ? 'turnL' : 'turnR') : looking ? 'lookRelaxed' : 'idle'
    if (this.reacting > 0) {
      this.reacting -= dt
      if (this.reacting <= 0) {
        this.mode = ''
        if (this.bodyPosture !== 'stand') { this.setPosture(this.bodyPosture); transitioning = true }
      }
    } else if (!transitioning && mode !== this.mode) {
      this.mode = mode
      void this.player.play(this.bodyPosture !== 'stand' ? this.lib.postures.postureClips[this.bodyPosture] : this.lib.clips[mode],
        { fade: 0.22, poseFade: true })
      if (mode === 'lookRelaxed' && (state === 'guard' || state === 'patrol' || state === 'idle')) this.player.current!.time = this.idlePhase
    }
    if (this.reacting <= 0 && this.player.current) this.player.setActionSpeed(transitioning || this.bodyPosture !== 'stand' ? 1 : moving ? THREE.MathUtils.clamp(speed / GAIT_SPEED[mode === 'run' ? 'run' : 'walk'], 0.35, 1.8) : turning ? THREE.MathUtils.clamp(Math.abs(yawDelta) / dt / 2.1, 0.6, 1.8) : 1)
    this.player.update(dt)
    if (this.reacting <= 0 && !transitioning) {
      // Frame-local upper-body motion leaves authored feet and navigation untouched.
      // adjustBones restores the mixer pose before the next frame, preventing drift.
      const { head, chest, spine } = this.rig.bones
      this.player.adjustBones(this.upperBody, () => {
        const t = this.player.current?.time ?? 0
        if (moving && !aimed) {
          head.rotation.y += Math.sin(t * 1.3 + this.idlePhase) * (ready ? 0.12 : 0.055)
          head.rotation.z += Math.sin(t * 0.85 + this.idlePhase) * 0.02
        }
        if (this.scanBlend > 0.001) {
          const sweep = Math.sin(this.scanProgress * Math.PI * 2), weight = this.scanBlend
          const startle = Math.sin(Math.min(1, this.scanProgress / 0.22) * Math.PI)
          head.rotation.y += sweep * 0.48 * weight
          head.rotation.z += sweep * 0.07 * weight
          head.rotation.x += (0.06 + startle * 0.08) * weight
          chest.rotation.y += sweep * 0.16 * weight
          chest.rotation.x -= startle * 0.045 * weight
          spine.rotation.x += weight * 0.025
        }
      })
    }
    let pitch = 0
    if (aim && aimed) {
      const origin = aimOrigin ?? this.root.localToWorld(new THREE.Vector3(0, 1.22, 0))
      const delta = aim.clone().sub(origin)
      pitch = THREE.MathUtils.clamp(-Math.atan2(delta.y, Math.hypot(delta.x, delta.z)), -0.6, 0.6)
    }
    if (aimed !== this.lastAim || ready !== this.lastReady || Math.abs(pitch - this.lastPitch) > 0.03) {
      this.lastAim = aimed
      this.lastReady = ready
      this.lastPitch = pitch
      const long = this.weapon !== 'pistol'
      // Keep lowered rifles within support-arm reach throughout the chest's scan turn.
      const hold = aimed ? { position: (long ? [-0.185, 1.22, 0.27] : [-0.13, 1.22, 0.55]) as [number, number, number], pitch: pitch * THREE.MathUtils.RAD2DEG } : ready ?
        { position: (long ? [-0.11, 1.10, 0.18] : [-0.16, 1.00, 0.32]) as [number, number, number], pitch: long ? 18 : 32 } :
        { position: (long ? [-0.11, 1.05, 0.18] : [-0.20, 0.705, 0.10]) as [number, number, number], pitch: long ? 24 : 65 }
      const pose = this.lib.poses.heldPose(this.lib.hang, hold, this.gun.userData.support?.toArray() as [number, number, number] | undefined)
      if (this.bodyPosture === 'stand') for (const name of this.lib.poses.armBones) this.armPose.set(name, poseQuat(name, pose[name] ?? [0, 0, 0]))
      else {
        const body = this.lib.postures.postureClips[this.bodyPosture]
        const fitted = this.lib.postures.weaponPosture(makeClip('mission_hold', [{ t: 0, pose }], { duration: 0.001 }), body, 0.001, this.gun.userData.twoHanded)
        for (const name of this.lib.poses.armBones) {
          const track = fitted.tracks.find(track => track.name === `${this.rig.bones[name].name}.quaternion`)!
          this.armPose.set(name, new THREE.Quaternion().fromArray(track.values))
        }
      }
    }
    // A flinch owns the arms for its duration; the held-weapon solve resumes afterwards.
    if (this.reacting <= 0 && !transitioning) this.player.adjustBones(this.arms, () => {
      const blend = 1 - Math.exp(-Math.max(0, dt) / 0.12)
      for (const name of this.lib.poses.armBones) {
        // A pistol occupies only the right hand. Keep the free arm's shared
        // walk/run swing, and remember it for a smooth return to a standing hold.
        if (moving && !this.gun.userData.twoHanded && name.endsWith('.L')) {
          const displayed = this.displayedArmPose.get(name), animated = this.rig.bones[name].quaternion
          if (displayed) displayed.copy(animated)
          else this.displayedArmPose.set(name, animated.clone())
          continue
        }
        const quaternion = this.armPose.get(name)
        if (!quaternion) continue
        let displayed = this.displayedArmPose.get(name)
        if (!displayed) {
          displayed = quaternion.clone()
          this.displayedArmPose.set(name, displayed)
        } else displayed.slerp(quaternion, blend)
        this.rig.bones[name].quaternion.copy(displayed)
      }
      supportHand(this.rig, this.gun)
    })
    else {
      if (transitioning) this.player.adjustBones(this.arms, () => supportHand(this.rig, this.gun))
      // Resume the hold from the flinch's actual arm pose instead of snapping back.
      for (const name of this.lib.poses.armBones) {
        this.displayedArmPose.set(name, this.rig.bones[name].quaternion.clone())
      }
    }
    this.kick = Math.max(0, this.kick - dt)
    this.flash.visible = this.kick > 0.065
    if (this.kick > 0) this.player.adjustBones([this.rig.bones.chest], () => { this.rig.bones.chest.rotation.x -= this.kick * 0.17 })
    this.player.blendPose(this.bodyPosture === 'stand')
    // No world-matrix pass here: every reader (eye, muzzle, hit volumes, blood, the renderer) refreshes what it reads.
  }

  // localToWorld refreshes the ancestor chain itself; a whole-rig pass per query was 50 nodes instead of 8.
  muzzle(out = new THREE.Vector3()) {
    return this.gun.localToWorld(out.copy(this.gun.userData.muzzle))
  }

  /** Sight and hit tests use the rendered skeleton, including the whole prone drop. */
  eye(out = new THREE.Vector3()) {
    return this.rig.bones.head.localToWorld(out.set(0, 0.205, 0.10))
  }

  private visiblePose(): Pose {
    const pose: Pose = {}
    for (const name of BONE_NAMES) {
      const relative = this.rig.rest[name].quat.clone().invert().multiply(this.rig.bones[name].quaternion)
      const euler = new THREE.Euler().setFromQuaternion(relative, 'ZYX')
      pose[name] = [euler.x, euler.y, euler.z].map(value => value * THREE.MathUtils.RAD2DEG) as [number, number, number]
    }
    return pose
  }

  /** Bake the rendered start pose into an interruptible action instead of snapping to its authored first frame. */
  private fromVisiblePose(source: THREE.AnimationClip, duration: number) {
    const clip = source.clone()
    for (const track of clip.tracks) {
      const name = BONE_NAMES.find(name => track.name.startsWith(`${this.rig.bones[name].name}.`))
      if (!name) continue
      const quaternion = track instanceof THREE.QuaternionKeyframeTrack
      const start = quaternion ? this.rig.bones[name].quaternion : this.rig.bones[name].position
      if (track.times.length === 1) {
        track.times = new Float32Array([0, duration])
        track.values = new Float32Array([...start.toArray(), ...track.values])
      }
      for (let i = 0; i < track.times.length && track.times[i] < duration; i++) {
        const weight = THREE.MathUtils.smoothstep(track.times[i], 0, duration)
        if (quaternion) new THREE.Quaternion().fromArray(track.values, i * 4).slerp(start as THREE.Quaternion, 1 - weight).toArray(track.values, i * 4)
        else new THREE.Vector3().fromArray(track.values, i * 3).lerp(start as THREE.Vector3, 1 - weight).toArray(track.values, i * 3)
      }
    }
    this.transientClips.add(clip)
    return clip
  }

  setPosture(posture: Posture, scan = false) {
    if (this.dead || !(posture in this.lib.postures.postures)) return
    if (posture === this.bodyPosture && !scan && !this.postureTransition && this.reacting <= 0 && this.mode === `posture_${posture}`) return
    const transition = this.lib.postures.enterPosture(this.rig, posture, scan)
    const long = this.gun.userData.twoHanded
    const aim = this.lib.poses.heldPose(this.lib.hang, {
      position: long ? [-0.185, 1.22, 0.27] : [-0.13, 1.22, 0.55],
      pitch: Number.isFinite(this.lastPitch) ? this.lastPitch * THREE.MathUtils.RAD2DEG : 0,
    }, this.gun.userData.support?.toArray() as [number, number, number] | undefined)
    const source = makeClip('mission_posture_hold', [{ t: 0, pose: aim }], { duration: transition.duration })
    const fitted = this.lib.postures.weaponPosture(source, transition, transition.duration, long)
    fitted.name = transition.name
    this.postureTransition = this.fromVisiblePose(fitted, Math.min(0.12, fitted.duration))
    this.bodyPosture = posture
    this.reacting = 0
    this.mode = this.postureTransition.name
    this.lastPitch = Infinity
    void this.player.play(this.postureTransition, { once: true, fade: 0 })
    this.player.update(0)
    this.root.updateMatrixWorld(true)
    this.releaseTransientClips()
  }

  get posture() { return this.bodyPosture }
  get postureTransitionRemaining() {
    return this.postureTransition && this.player.current?.getClip() === this.postureTransition
      ? Math.max(0, this.postureTransition.duration - this.player.current.time) : 0
  }

  postureSnapshot(): ActorPostureSnapshot {
    return {
      posture: this.bodyPosture,
      ...(this.postureTransition ? { transition: THREE.AnimationClip.toJSON(this.postureTransition), transitionTime: this.player.current?.time ?? 0 } : {}),
      ...(this.deathDirection ? { deathDirection: [...this.deathDirection] as [number, number, number], deathTravelScale: this.deathTravelScale } : {}),
      ...(this.deathAnimation ? { deathClip: THREE.AnimationClip.toJSON(this.deathAnimation) } : {}),
    }
  }

  private releaseTransientClips() {
    for (const clip of this.transientClips) {
      if (clip === this.player.current?.getClip() || clip === this.deathAnimation || clip === this.postureTransition) continue
      this.player.mixer.uncacheClip(clip)
      this.transientClips.delete(clip)
    }
  }

  shoot() { this.kick = 0.11 }

  /** A non-lethal flinch interrupts locomotion for the clip's length; a lethal clip name is used by the next dead update. */
  react(clip: string, lethal: boolean, direction?: THREE.Vector3, travelScale = 1) {
    if (this.dead) return
    if (lethal) {
      this.deathClip = clip in this.lib.clips ? clip : 'dieBody'
      let animation = this.lib.clips[this.deathClip]
      if (this.deathClip === 'dieShotgun') {
        const travel = direction?.clone() ?? new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()))
        travel.y = 0
        if (travel.lengthSq() < 1e-8) travel.set(0, 0, -1).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()))
        travel.normalize()
        this.deathDirection = travel.toArray() as [number, number, number]
        this.deathTravelScale = THREE.MathUtils.clamp(travelScale, 0, 1)
        travel.applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()).invert())
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-travel.x, -travel.z))
        animation = animation.clone()
        for (const track of animation.tracks) {
          if (track.name === `${this.rig.bones.hips.name}.position`) for (let i = 0; i < track.values.length; i += 3) {
            const offset = new THREE.Vector3().fromArray(track.values, i).sub(this.rig.rest.hips.pos).applyQuaternion(rotation)
            offset.x *= this.deathTravelScale; offset.z *= this.deathTravelScale
            offset.add(this.rig.rest.hips.pos).toArray(track.values, i)
          }
          // Preserve the authored tumble and grounded contact points. Rotating only
          // the hip's fall axis would drive side/rear-hit arms and legs through the floor.
        }
      } else {
        this.deathDirection = undefined
        this.deathTravelScale = 1
      }
      this.deathAnimation = this.fromVisiblePose(animation, this.deathClip === 'dieShotgun' ? 0.17 : 0.12)
      this.postureTransition = null
      return
    }
    let animation = this.lib.clips[clip]
    if (!animation || this.dead) return
    if (this.bodyPosture !== 'stand' || this.postureTransition) {
      const body = makeClip('mission_hit_posture', [{ t: 0, pose: this.visiblePose(),
        root: this.rig.bones.hips.position.clone().sub(this.rig.rest.hips.pos).toArray() }], { duration: animation.duration })
      const fitted = this.lib.postures.weaponPosture(animation, body, animation.duration, this.gun.userData.twoHanded)
      // Preserve the head/chest impact above the planted lower body, including headshots.
      for (const name of ['spine', 'chest', 'neck', 'head'] as const) {
        const path = `${this.rig.bones[name].name}.quaternion`
        const source = animation.tracks.find(track => track.name === path)!
        const track = source.clone(), first = new THREE.Quaternion().fromArray(source.values).invert()
        for (let i = 0; i < track.values.length; i += 4) {
          const impact = new THREE.Quaternion().fromArray(track.values, i).premultiply(first)
          const pose = this.rig.bones[name].quaternion.clone()
          pose.slerp(pose.clone().multiply(impact), this.bodyPosture === 'prone' ? 0.45 : 0.75).toArray(track.values, i)
        }
        fitted.tracks[fitted.tracks.findIndex(track => track.name === path)] = track
      }
      animation = this.fromVisiblePose(fitted, 0.06)
    }
    this.postureTransition = null
    this.reacting = animation.duration
    this.mode = clip
    void this.player.play(animation, { once: true, fade: 0.05 })
    // Advance into the impact immediately. Repeated same-region hits reset this cached action too.
    this.player.current!.time = Math.min(0.035, animation.duration * 0.1)
    this.player.update(0)
    this.root.updateMatrixWorld(true)
    this.releaseTransientClips()
  }

  /** Set a corpse immediately during a checkpoint restore, without creating a second dropped item. */
  restore(state: EnemyState, animationTime = 0, deathClip = 'dieBody', posture?: ActorPostureSnapshot) {
    // Parsed clips retain their UUIDs. Evict the previous actions before parsing a
    // checkpoint, or the mixer can return an old action for the new clip object.
    this.player.stop(0)
    this.player.mixer.stopAllAction()
    for (const clip of this.transientClips) this.player.mixer.uncacheClip(clip)
    this.transientClips.clear()
    this.dead = false
    this.gun.visible = state !== 'dead'
    this.mode = ''
    this.kick = 0
    this.reacting = 0
    this.previousYaw = this.root.rotation.y
    this.lastAim = false
    this.lastReady = false
    this.scanBlend = 0
    this.scanProgress = 0
    this.lastPitch = Infinity
    this.armPose.clear()
    this.displayedArmPose.clear()
    this.bodyPosture = posture && posture.posture in this.lib.postures.postures ? posture.posture : 'stand'
    this.postureTransition = null
    this.deathDirection = posture?.deathDirection
    this.deathTravelScale = posture?.deathTravelScale ?? 1
    this.deathAnimation = posture?.deathClip ? THREE.AnimationClip.parse(posture.deathClip) : null
    if (this.deathAnimation) this.transientClips.add(this.deathAnimation)
    this.deathClip = deathClip
    this.flash.visible = false
    this.rig.resetPose()
    this.update(0, state, false)
    if (state !== 'dead' && posture?.transition) {
      this.postureTransition = THREE.AnimationClip.parse(posture.transition)
      this.transientClips.add(this.postureTransition)
      this.mode = this.postureTransition.name
      void this.player.play(this.postureTransition, { once: true, fade: 0 })
      animationTime = posture.transitionTime ?? animationTime
    }
    if (this.player.current) this.player.current.time = animationTime
    this.update(0, state, false)
    this.root.updateMatrixWorld(true)
    this.releaseTransientClips()
  }

  get animationTime() { return this.player.current?.time ?? 0 }
  get reactionRemaining() { return Math.max(0, this.reacting) }

  dispose() {
    this.player.mixer.stopAllAction()
    this.player.mixer.uncacheRoot(this.root)
    disposeGun(this.gun)
    this.material.dispose()
    this.outlineMaterials.forEach(material => material.dispose())
    const geometries = new Set<THREE.BufferGeometry>()
    this.root.traverse(object => { if (object instanceof THREE.Mesh) geometries.add(object.geometry) })
    geometries.forEach(geometry => geometry.dispose())
    for (const name of BONE_NAMES) this.rig.bones[name].removeFromParent()
    this.root.removeFromParent()
  }
}
