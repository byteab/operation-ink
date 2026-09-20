import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EnemyActor } from '../src/game/actors'
import { HostageActor } from '../src/game/hostage-actor'
import { ENEMY_RUN_SPEED } from '../src/game/balance'
import { BONE_NAMES, type Rig } from '../src/lab/rig'
import { SHIN_LENGTH } from '../src/lab/gait'

const bytes = readFileSync('public/models/stickman.glb'), load = GLTFLoader.prototype.loadAsync
GLTFLoader.prototype.loadAsync = async function () {
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}
type Pose = ReturnType<typeof snapshot>
const snapshot = (rig: Rig) => BONE_NAMES.map(name => ({
  position: rig.bones[name].position.clone(), quaternion: rig.bones[name].quaternion.clone().normalize(),
}))
const continuous = (rig: Rig, before: Pose, label: string) => {
  BONE_NAMES.forEach((name, index) => {
    assert(rig.bones[name].position.distanceTo(before[index].position) < 1e-5, `${label}: ${name} jumps at transition start`)
    assert(rig.bones[name].quaternion.clone().normalize().angleTo(before[index].quaternion) < 1e-5,
      `${label}: ${name} snaps at transition start`)
  })
}
const grounded = (rig: Rig) => {
  rig.root.updateMatrixWorld(true)
  for (const side of ['L', 'R'] as const) {
    const foot = rig.bones[`shin.${side}`].localToWorld(new THREE.Vector3(0, SHIN_LENGTH, 0))
    assert(foot.y >= 0.045, `Blended foot sinks into the floor: ${foot.y}`)
    assert(rig.bones[`shin.${side}`].position.distanceTo(rig.rest[`shin.${side}`].pos) < 1e-5, 'Blend stretches a leg')
  }
  assert.equal(rig.root.position.length(), 0, 'Animation moves the navigation anchor')
}

try {
  const hostage = await HostageActor.create()
  const guards = []
  for (const weapon of ['pistol', 'ak', 'shotgun', 'smg', 'sniper'] as const) guards.push(await EnemyActor.create(weapon))
  try {
    for (const fps of [30, 60, 144]) for (const phase of [0.03, 0.17, 0.31, 0.48]) {
      const subjects = [
        { label: 'hostage', rig: hostage.rig, player: hostage.player, reset: () => hostage.restore(false),
          tick: (dt: number, mode: string) => hostage.animate(dt, mode === 'run', mode === 'cower', false, false) },
        ...guards.map(actor => ({ label: actor.weapon, rig: actor.rig, player: actor.player, reset: () => actor.restore('guard'),
          tick: (dt: number, mode: string) => actor.update(dt, mode === 'idle' ? 'guard' : 'combat', mode === 'run' || mode === 'walk',
            undefined, mode === 'run' ? ENEMY_RUN_SPEED : mode === 'walk' ? 1.4 : 0) })),
      ]
      for (const subject of subjects) {
        subject.reset()
        for (let t = 0; t < 1 + phase; t += 1 / fps) subject.tick(1 / fps, 'run')
        for (const mode of subject.label === 'hostage' ? ['idle', 'run', 'idle', 'run', 'idle'] : ['idle', 'walk', 'run', 'aim', 'idle']) {
          const before = snapshot(subject.rig)
          subject.tick(0, mode)
          continuous(subject.rig, before, `${subject.label}/${mode}/${fps}`)
          // Interrupt each fade before it finishes; the next one must use the visible pose.
          for (let t = 0; t < 0.09; t += 1 / fps) { subject.tick(1 / fps, mode); grounded(subject.rig) }
        }
        for (let t = 0; t < 0.5; t += 1 / fps) { subject.tick(1 / fps, 'idle'); grounded(subject.rig) }
        const held = snapshot(subject.rig)
        for (let i = 0; i < 5; i++) subject.tick(0, 'idle')
        continuous(subject.rig, held, `${subject.label}/paused`)
        assert(subject.rig.bones.hips.position.y > 0.8, 'Character never finishes rising into idle')
      }
    }
    console.log('PASS hostage and all five enemy weapons: continuous and interrupted run/walk/idle/aim transitions, grounded fixed-length legs, pause and settling at 30/60/144 fps')
    for (let i = 0; i < 60; i++) hostage.animate(1 / 60, true, false, false, false)
    for (const cower of [true, false, true, false]) {
      const before = snapshot(hostage.rig)
      hostage.animate(0, !cower, cower, false, false)
      continuous(hostage.rig, before, 'hostage/cower')
      for (let i = 0; i < 5; i++) hostage.animate(1 / 60, !cower, cower, false, false)
    }
    console.log('PASS hostage can interrupt running/cowering without snapping')
  } finally { hostage.dispose(); guards.forEach(actor => actor.dispose()) }
} finally { GLTFLoader.prototype.loadAsync = load }
