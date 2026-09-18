import * as THREE from 'three'
import { loadStickman, BONE_NAMES, type Rig } from '../lab/rig'
import { Player } from '../lab/player'
import { poseQuat } from '../lab/clip'
import { disposeGun, type Gun } from '../lab/weapons/models'
import { createMissionGun } from './weapon-models'
import { supportHand } from '../lab/weapons/support'
import { AnimatedHitVolumes, mirrorReactionClip } from './hit-reactions'
import type { EnemyState, WeaponName } from './types'

type Library = {
  clips: Record<string, THREE.AnimationClip>
  poses: typeof import('../lab/weapons/poses')
  hang: import('../lab/clip').Pose
}
let library: Promise<Library> | undefined

/** The lab builds clips from the loaded rest skeleton, so imports intentionally follow loadStickman. */
async function animations(rig: Rig): Promise<Library> {
  return library ??= Promise.all([
    import('../lab/clips/idle'), import('../lab/clips/locomotion'),
    import('../lab/clips/behavior'), import('../lab/clips/damage'), import('../lab/weapons/poses'),
  ]).then(([idle, motion, behavior, damage, poses]) => {
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
    return { clips, poses, hang: idle.hang }
  })
}

/** A real independently loaded lab skeleton, with isolated opaque black materials. */
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
  readonly hitVolumes: AnimatedHitVolumes
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
    const original = rig.mesh.material as THREE.MeshBasicMaterial
    this.material = original.clone()
    // Material.clone does not preserve callbacks. Keep the original dual-quaternion shader setup.
    this.material.onBeforeCompile = original.onBeforeCompile
    this.material.customProgramCacheKey = original.customProgramCacheKey.bind(original)
    this.material.color.setHex(0x000000)
    this.material.toneMapped = false
    this.material.depthTest = this.material.depthWrite = true
    rig.mesh.material = this.material
    this.root.traverse(object => {
      if (object instanceof THREE.SkinnedMesh && object !== rig.mesh) {
        // A flat silhouette needs no inverted hull: keeping it would add a grey rim to solid black.
        object.visible = false
      }
    })
    this.gun = createMissionGun(weapon)
    this.gun.position.copy(lib.poses.mountPosition)
    this.gun.quaternion.copy(lib.poses.mountQuaternion)
    rig.bones['hand.R'].add(this.gun)
    const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xf4c65a, toneMapped: false })
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
    const yawDelta = Math.atan2(Math.sin(this.root.rotation.y - this.previousYaw), Math.cos(this.root.rotation.y - this.previousYaw))
    this.previousYaw = this.root.rotation.y
    if (state === 'dead') {
      if (!this.dead) {
        this.dead = true
        this.gun.visible = false
        this.mode = this.deathClip
        this.reacting = 0
        void this.player.play(this.lib.clips[this.deathClip] ?? this.lib.clips.dieBody, { once: true, fade: 0.06 })
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
    const turning = !moving && dt > 0 && Math.abs(yawDelta) > 0.001
    const scan = this.root.userData.alertScan
    const scanning = state === 'suspicious' && typeof scan === 'number' && Number.isFinite(scan)
    if (scanning) this.scanProgress = THREE.MathUtils.clamp(scan, 0, 1)
    this.scanBlend = THREE.MathUtils.lerp(this.scanBlend, scanning ? 1 : 0, 1 - Math.exp(-Math.max(0, dt) / 0.1))
    // Tracking a target requires small turns; keep the gun raised through them.
    // Otherwise every steering correction toggles the arms between aim and carry.
    const aimed = !moving && (state === 'combat' || state === 'suspicious' && !scanning)
    const ready = !aimed && (scanning || state === 'search' || state === 'investigate')
    const looking = !scanning && ['guard', 'idle', 'patrol', 'search', 'investigate'].includes(state)
    const mode = moving ? (speed >= 1.8 ? 'run' : 'walk') : turning ? (yawDelta > 0 ? 'turnL' : 'turnR') : looking ? 'lookRelaxed' : 'idle'
    if (this.reacting > 0) {
      this.reacting -= dt
      if (this.reacting <= 0) this.mode = ''
    } else if (mode !== this.mode) {
      this.mode = mode
      // Match the lab's grounded gait transitions; crossfading absolute hips tracks sinks the feet.
      void this.player.play(this.lib.clips[mode], { fade: moving || turning || ['walk', 'run', 'turnL', 'turnR'].includes(this.player.current?.getClip().name ?? '') ? 0 : 0.12 })
      if (mode === 'lookRelaxed' && (state === 'guard' || state === 'patrol' || state === 'idle')) this.player.current!.time = this.idlePhase
    }
    if (this.reacting <= 0 && this.player.current) this.player.current.timeScale = moving ? THREE.MathUtils.clamp(speed / (mode === 'run' ? 2.8 : 1.4), 0.35, 1.8) : turning ? THREE.MathUtils.clamp(Math.abs(yawDelta) / dt / 2.1, 0.6, 1.8) : 1
    this.player.update(dt)
    if (this.reacting <= 0) {
      // Frame-local upper-body motion leaves authored feet and navigation untouched.
      // adjustBones restores the mixer pose before the next frame, preventing drift.
      const { head, chest, spine } = this.rig.bones
      this.player.adjustBones([head, chest, spine], () => {
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
      const delta = aim.clone().sub(this.root.position)
      pitch = THREE.MathUtils.clamp(-Math.atan2(delta.y - 1.22, Math.hypot(delta.x, delta.z)), -0.6, 0.6)
    }
    if (aimed !== this.lastAim || ready !== this.lastReady || Math.abs(pitch - this.lastPitch) > 0.03) {
      this.lastAim = aimed
      this.lastReady = ready
      this.lastPitch = pitch
      const long = this.weapon !== 'pistol'
      const hold = aimed ? { position: (long ? [-0.185, 1.22, 0.27] : [-0.13, 1.22, 0.55]) as [number, number, number], pitch: pitch * THREE.MathUtils.RAD2DEG } : ready ?
        { position: (long ? [-0.19, 1.08, 0.25] : [-0.16, 1.00, 0.32]) as [number, number, number], pitch: long ? 18 : 32 } :
        { position: (long ? [-0.19, 1.03, 0.22] : [-0.20, 0.655, 0.10]) as [number, number, number], pitch: long ? 24 : 65 }
      const pose = this.lib.poses.heldPose(this.lib.hang, hold, this.gun.userData.support?.toArray() as [number, number, number] | undefined)
      for (const name of this.lib.poses.armBones) this.armPose.set(name, poseQuat(name, pose[name] ?? [0, 0, 0]))
    }
    // A flinch owns the arms for its duration; the held-weapon solve resumes afterwards.
    if (this.reacting <= 0) this.player.adjustBones(this.lib.poses.armBones.map(name => this.rig.bones[name]), () => {
      const blend = 1 - Math.exp(-Math.max(0, dt) / 0.12)
      for (const name of this.lib.poses.armBones) {
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
      // Resume the hold from the flinch's actual arm pose instead of snapping back.
      for (const name of this.lib.poses.armBones) {
        this.displayedArmPose.set(name, this.rig.bones[name].quaternion.clone())
      }
    }
    this.kick = Math.max(0, this.kick - dt)
    this.flash.visible = this.kick > 0.065
    if (this.kick > 0) this.player.adjustBones([this.rig.bones.chest], () => { this.rig.bones.chest.rotation.x -= this.kick * 0.17 })
    this.root.updateMatrixWorld(true)
  }

  muzzle(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true)
    return this.gun.localToWorld(out.copy(this.gun.userData.muzzle))
  }

  shoot() { this.kick = 0.11 }

  /** A non-lethal flinch interrupts locomotion for the clip's length; a lethal clip name is used by the next dead update. */
  react(clip: string, lethal: boolean) {
    if (lethal) { this.deathClip = clip in this.lib.clips ? clip : 'dieBody'; return }
    const animation = this.lib.clips[clip]
    if (!animation || this.dead) return
    this.reacting = animation.duration
    this.mode = clip
    void this.player.play(animation, { once: true, fade: 0.05 })
    // Advance into the impact immediately. Repeated same-region hits reset this cached action too.
    this.player.current!.time = Math.min(0.035, animation.duration * 0.1)
    this.player.update(0)
    this.root.updateMatrixWorld(true)
  }

  /** Set a corpse immediately during a checkpoint restore, without creating a second dropped item. */
  restore(state: EnemyState, animationTime = 0, deathClip = 'dieBody') {
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
    this.deathClip = deathClip
    this.flash.visible = false
    this.rig.resetPose()
    this.update(0, state, false)
    if (this.player.current) this.player.current.time = animationTime
    this.player.update(0)
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
