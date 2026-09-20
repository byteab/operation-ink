import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BONE_NAMES, loadStickman } from '../src/lab/rig'
import { Player } from '../src/lab/player'
import { SHIN_LENGTH } from '../src/lab/gait'
import { EnemyActor } from '../src/game/actors'

const bytes = readFileSync('public/models/stickman.glb'), original = GLTFLoader.prototype.loadAsync
GLTFLoader.prototype.loadAsync = async function () {
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}
try {
  const rig = await loadStickman(), player = new Player(rig.root)
  const { clips } = await import('../src/lab/clips/damage')
  const point = (name: keyof typeof rig.bones) => rig.bones[name].getWorldPosition(new THREE.Vector3())
  const foot = (side: 'L' | 'R') => rig.bones[`shin.${side}`].localToWorld(new THREE.Vector3(0, SHIN_LENGTH, 0))
  // Rigid surface vertices are identical under linear and dual-quaternion skinning.
  const surface = new Map<string, THREE.Vector3[]>()
  const { position, skinIndex, skinWeight } = rig.mesh.geometry.attributes
  for (let i = 0; i < position.count; i++) for (let j = 0; j < 4; j++) {
    if (skinWeight.getComponent(i, j) < 0.999) continue
    const index = skinIndex.getComponent(i, j), bone = rig.mesh.skeleton.bones[index]
    const local = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(rig.mesh.bindMatrix).applyMatrix4(rig.mesh.skeleton.boneInverses[index])
    if (!surface.has(bone.name)) surface.set(bone.name, [])
    surface.get(bone.name)!.push(local)
  }
  for (const [name, clip] of Object.entries(clips).filter(([name]) => name.startsWith('die'))) {
    void player.play(clip, { fade: 0, once: true })
    let previous: THREE.Vector3[] | undefined, maxStep = 0, minEndHeight = Infinity, stepAt = '', lowAt = ''
    const frames = Math.ceil(clip.duration * 240)
    for (let i = 0; i <= frames; i++) {
      player.current!.time = i / frames * clip.duration; player.update(0); rig.root.updateMatrixWorld(true)
      const current = [...BONE_NAMES.map(point), foot('L'), foot('R')]
      // The rig stands at the origin here, so world space is the root space of its fixed culling sphere.
      for (const p of current) assert(p.distanceTo(rig.mesh.boundingSphere!.center) < rig.mesh.boundingSphere!.radius - 0.3, `${name}: body leaves its culling bounds`)
      if (previous) current.forEach((p, j) => {
        const distance = p.distanceTo(previous![j])
        if (distance > maxStep) { maxStep = distance; stepAt = `${i / frames * clip.duration}:${BONE_NAMES[j] ?? j}` }
      })
      previous = current
      for (const side of ['L', 'R'] as const) {
        assert(Math.abs(point(`upper_arm.${side}`).distanceTo(point(`forearm.${side}`)) - rig.rest[`forearm.${side}`].pos.length()) < 1e-5, `${name}: upper arm stretches`)
        assert(Math.abs(point(`forearm.${side}`).distanceTo(point(`hand.${side}`)) - rig.rest[`hand.${side}`].pos.length()) < 1e-5, `${name}: forearm stretches`)
        assert(Math.abs(point(`thigh.${side}`).distanceTo(point(`shin.${side}`)) - rig.rest[`shin.${side}`].pos.length()) < 1e-5, `${name}: thigh stretches`)
        const end = foot(side)
        assert(Math.abs(point(`shin.${side}`).distanceTo(end) - SHIN_LENGTH) < 1e-5, `${name}: shin stretches`)
        if (Math.min(point(`hand.${side}`).y, end.y) < minEndHeight) lowAt = `${i / frames * clip.duration}:${side}`
        minEndHeight = Math.min(minEndHeight, point(`hand.${side}`).y, end.y)
      }
    }
    const final = [...BONE_NAMES.map(point), foot('L'), foot('R')]
    const gaps = Object.fromEntries(BONE_NAMES.filter(name => surface.has(rig.bones[name].name)).map(name => [name,
      Math.min(...surface.get(rig.bones[name].name)!.map(p => rig.bones[name].localToWorld(p.clone()).y))]))
    for (const side of ['L', 'R'] as const) {
      for (const bone of [`forearm.${side}`, `hand.${side}`, `shin.${side}`] as const) assert(point(bone).y < 0.085, `${name}: ${bone} remains raised`)
      assert(Math.abs(foot(side).y - 0.06) < 0.005, `${name}: foot must rest on the floor`)
      assert(gaps[`hand.${side}`] > -0.003 && gaps[`hand.${side}`] < 0.025, `${name}: hand surface is unsupported`)
      assert(gaps[`shin.${side}`] > -0.003 && gaps[`shin.${side}`] < 0.012, `${name}: shin surface is unsupported`)
    }
    assert(gaps.head > -0.003 && gaps.head < 0.006, `${name}: head must rest on the floor`)
    assert(minEndHeight > 0.049, `${name}: hand or foot goes through the floor at ${lowAt}: ${minEndHeight}`)
    assert(maxStep < 0.075, `${name}: joint snaps ${maxStep} m between frames at ${stepAt}`)
    player.setSpeed(0); player.update(1); rig.root.updateMatrixWorld(true)
    assert(final.every((p, i) => p.distanceTo([...BONE_NAMES.map(point), foot('L'), foot('R')][i]) < 1e-6), `${name}: paused corpse moves`)
    player.setSpeed(1); player.update(5); rig.root.updateMatrixWorld(true)
    assert(final.every((p, i) => p.distanceTo([...BONE_NAMES.map(point), foot('L'), foot('R')][i]) < 1e-6), `${name}: finished corpse moves`)
    assert.equal(rig.root.position.length(), 0, 'Death moved the navigation root')
    console.log(JSON.stringify({ name, duration: clip.duration, maxStep, minEndHeight, gaps }))
  }
  for (const name of ['dieArm', 'dieLeg', 'dieArmLeft', 'dieLegLeft']) {
    const actor = await EnemyActor.create('ak'), restored = await EnemyActor.create('ak')
    try {
      actor.root.position.set(2, 4, 3); restored.root.position.copy(actor.root.position)
      actor.root.rotation.y = restored.root.rotation.y = 1.1
      actor.react(name, true); actor.update(0.6, 'dead', false)
      restored.restore('dead', actor.animationTime, actor.deathClip, actor.postureSnapshot())
      for (const bone of BONE_NAMES) assert(actor.rig.bones[bone].getWorldPosition(new THREE.Vector3()).distanceTo(restored.rig.bones[bone].getWorldPosition(new THREE.Vector3())) < 1e-5, `${name}: checkpoint pose changed`)
      actor.update(3, 'dead', false)
      for (const side of ['L', 'R'] as const) {
        const wrist = actor.rig.bones[`hand.${side}`].getWorldPosition(new THREE.Vector3())
        const end = actor.rig.bones[`shin.${side}`].localToWorld(new THREE.Vector3(0, SHIN_LENGTH, 0))
        assert(wrist.y < 4.085 && wrist.y > 4.045 && end.y < 4.075 && end.y > 4.045, `${name}: mission corpse has floating limbs`)
      }
      console.log(`PASS ${name}: shared mission clip, mirrored contacts, elevated floor and mid-fall restore`)
    } finally { actor.dispose(); restored.dispose() }
  }
  console.log('PASS six death clips: grounded limbs, fixed lengths, continuous motion, pause and final hold')
} finally { GLTFLoader.prototype.loadAsync = original }
