import * as THREE from 'three'
import { loadStickman, type Rig } from '../lab/rig'
import { GAIT_SPEED } from '../lab/gait'
import { makeClip, type Key, type Pose } from '../lab/clip'
import { Player } from '../lab/player'
import { HOSTAGE_RUN_SPEED } from './balance'

export const HOSTAGE_INK = 0x2878d0
export const STAND_UP_SECONDS = 1.65
export const BOARD_SECONDS = 0.9

/** Same GLB, skeleton and skinning shader as EnemyActor, without a weapon or hit volumes. */
export class HostageActor {
  readonly root: THREE.Group
  readonly player: Player
  private material: THREE.MeshBasicMaterial
  private mode = ''
  private standingFor = 0
  private boardingFor = 0

  private constructor(readonly rig: Rig, private clips: Record<string, THREE.AnimationClip>) {
    this.root = rig.root
    this.root.name = 'Blue stickman hostage'
    this.root.userData = { actor: true, hostage: true, noCollision: true, model: 'stickman.glb' }
    const original = rig.mesh.material as THREE.MeshBasicMaterial
    this.material = original.clone()
    this.material.onBeforeCompile = original.onBeforeCompile
    this.material.customProgramCacheKey = original.customProgramCacheKey.bind(original)
    this.material.color.setHex(HOSTAGE_INK)
    this.material.toneMapped = false
    rig.mesh.material = this.material
    this.root.traverse(object => {
      if (object instanceof THREE.SkinnedMesh && object !== rig.mesh) object.visible = false
    })
    this.player = new Player(this.root)
  }

  static async create() {
    const rig = await loadStickman()
    const [idle, motion, behavior] = await Promise.all([
      import('../lab/clips/idle'), import('../lab/clips/locomotion'), import('../lab/clips/behavior'),
    ])
    const seated: Pose = {
      ...idle.hang, hips: [0, 0, 0], spine: [5, 0, 0], chest: [3, 0, 0], head: [12, 0, 0],
      'thigh.L': [-90, 0, 0], 'thigh.R': [-90, 0, 0], 'shin.L': [90, 0, 0], 'shin.R': [90, 0, 0],
      'upper_arm.L': [-78, -12, 0], 'upper_arm.R': [-78, 12, 0],
      'forearm.L': [0, 0, -72], 'forearm.R': [0, 0, 72],
    }
    // The root remains the navigation/feet anchor. Move the hips back over the chair,
    // then forward over planted feet before extending the knees.
    const rise = (t: number, thigh: number, knee: number, lean: number, arms: number) => {
      const a = -thigh * Math.PI / 180, b = knee * Math.PI / 180
      return { t, root: [0, 0.371 * Math.cos(a) + 0.42 * Math.cos(a + b) - 0.791,
        0.371 * Math.sin(a) + 0.42 * Math.sin(a + b)] as [number, number, number],
      pose: { ...seated, hips: [lean, 0, 0], spine: [4, 0, 0], chest: [0, 0, 0], head: [-lean * 0.65, 0, 0],
        'thigh.L': [-thigh - lean, 0, 0], 'thigh.R': [-thigh - lean, 0, 0],
        'shin.L': [knee, 0, 0], 'shin.R': [knee, 0, 0],
        'forearm.L': [0, 0, -arms], 'forearm.R': [0, 0, arms],
      } as Pose }
    }
    const chairIdle = makeClip('hostage-seated', [
      { t: 0, pose: seated, root: [0, -0.371, -0.371] },
      { t: 1.8, pose: { ...seated, chest: [1, 0, 0], head: [9, 5, 0] } },
      { t: 3.6, pose: seated },
    ], { loop: true })
    const standKeys: Key[] = [
      { t: 0, pose: seated, root: [0, -0.371, -0.371] },
      // Start lifting while leaning forward so the rounded pelvis clears the seat.
      rise(0.4, 78, 110, 24, 62), rise(0.85, 54, 108, 28, 38),
      rise(1.3, 20, 40, 12, 18), rise(STAND_UP_SECONDS, 0, 0, 0, 10),
    ]
    const stand = makeClip('hostage-stand-up', standKeys)
    const board = makeClip('hostage-sit-down', [...standKeys].reverse().map(key => ({
      ...key, t: (STAND_UP_SECONDS - key.t) / STAND_UP_SECONDS * BOARD_SECONDS,
    })))
    return new HostageActor(rig, { ...idle.clips, ...motion.clips, cower: behavior.clips.cowerHold, seated: chairIdle, stand, board })
  }

  get canWalk() { return this.standingFor >= STAND_UP_SECONDS }

  advanceRelease(dt: number, captive: boolean) {
    this.standingFor = captive ? 0 : Math.min(STAND_UP_SECONDS, this.standingFor + dt)
  }

  restore(captive: boolean, loaded = false) {
    this.player.stop(0)
    this.rig.resetPose()
    this.mode = ''
    this.standingFor = captive ? 0 : STAND_UP_SECONDS
    this.boardingFor = loaded ? BOARD_SECONDS : 0
  }

  animate(dt: number, moving: boolean, cowering: boolean, seated: boolean, captive: boolean, speed = HOSTAGE_RUN_SPEED) {
    if (seated) this.boardingFor = Math.min(BOARD_SECONDS, this.boardingFor + dt)
    // Keep the shared running stride in sync with actual escort travel.
    const mode = captive ? 'seated' : seated ? this.boardingFor < BOARD_SECONDS ? 'board' : 'seated' : !this.canWalk ? 'stand' : cowering ? 'cower' : moving ? 'run' : 'idle'
    if (mode !== this.mode) {
      const initialized = this.mode !== ''
      this.mode = mode
      void this.player.play(this.clips[mode], { fade: initialized ? 0.22 : 0, poseFade: true, once: mode === 'stand' || mode === 'board' })
    }
    if (mode === 'stand' || mode === 'board') {
      this.player.current!.time = Math.max(0, (mode === 'stand' ? this.standingFor : this.boardingFor) - dt)
      this.player.update(dt)
    } else {
      this.player.setActionSpeed(mode === 'run' ? speed / GAIT_SPEED.run : 1)
      this.player.update(dt)
    }
    this.player.blendPose(!seated && !captive && this.canWalk)
    this.root.userData.animation = this.clips[mode].name
  }

  dispose() {
    this.player.stop(0)
    this.player.mixer.uncacheRoot(this.root)
    this.root.removeFromParent()
    this.rig.mesh.geometry.dispose()
    this.rig.mesh.skeleton.dispose()
    this.material.dispose()
  }
}
