import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EnemyActor } from '../src/game/actors'

const bytes = readFileSync('public/models/stickman.glb'), load = GLTFLoader.prototype.loadAsync
GLTFLoader.prototype.loadAsync = async function () {
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}
const vector = () => new THREE.Vector3()
const update = (actor: EnemyActor, seconds = 1, aim = new THREE.Vector3(0, 1.65, 10)) => {
  for (let i = 0; i < Math.ceil(seconds * 120); i++) actor.update(1 / 120, 'combat', false, aim)
}
try {
  for (const weapon of ['pistol', 'ak', 'smg', 'shotgun', 'sniper'] as const) {
    const actor = await EnemyActor.create(weapon)
    try {
      actor.root.position.y = 4
      const target = new THREE.Vector3(0, 5.65, 10)
      update(actor, 1, target)
      const height = actor.eye().y
      for (const posture of ['crouch', 'kneel', 'prone'] as const) {
        actor.setPosture(posture, posture === 'crouch')
        assert(actor.postureTransitionRemaining > 0)
        const before = actor.rig.bones.hips.position.clone()
        actor.update(0, 'combat', false, target)
        assert(actor.rig.bones.hips.position.distanceTo(before) < 1e-6, `${weapon}: transition moves at dt=0`)
        update(actor, 2.3, target)
        assert.equal(actor.posture, posture)
        assert.equal(actor.postureTransitionRemaining, 0)
        assert(actor.eye().y < height - (posture === 'crouch' ? 0.035 : posture === 'kneel' ? 0.3 : 0.9))
        const muzzle = actor.muzzle()
        const barrel = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.gun.getWorldQuaternion(new THREE.Quaternion()))
        const desiredPitch = Math.atan2(target.y - muzzle.y, Math.hypot(target.x - muzzle.x, target.z - muzzle.z))
        const actualPitch = Math.atan2(barrel.y, Math.hypot(barrel.x, barrel.z))
        assert(Math.abs(desiredPitch - actualPitch) < 0.045, `${weapon}/${posture}: barrel pitch ${actualPitch} misses target pitch ${desiredPitch}`)
        if (actor.gun.userData.support) {
          const support = actor.gun.localToWorld(actor.gun.userData.support.clone())
          const hand = actor.rig.bones['hand.L'].localToWorld(new THREE.Vector3(0, 0.035, 0))
          assert(support.distanceTo(hand) < 0.065, `${weapon}/${posture}: support hand floats ${support.distanceTo(hand)}m`)
        }
        assert(muzzle.y > actor.root.position.y + 0.15, `${weapon}/${posture}: muzzle enters ground`)
        const initialChest = actor.rig.bones.chest.quaternion.clone()
        actor.shoot(); actor.update(0, 'combat', false, target)
        assert(actor.rig.bones.chest.quaternion.angleTo(initialChest) > 0.01, `${weapon}/${posture}: no recoil`)
        update(actor, 0.5, target)
        assert.equal(actor.posture, posture, 'Firing stood the enemy up')
        assert(actor.root.position.distanceTo(new THREE.Vector3(0, 4, 0)) < 1e-9, 'Posture moved navigation root')
        if (posture === 'kneel' || posture === 'prone') {
          const plantedHeight = actor.rig.bones.hips.position.y
          for (let shot = 0; shot < 8; shot++) {
            actor.shoot()
            update(actor, 0.75, target)
            assert.equal(actor.posture, posture, `${weapon}: repeated fire lost ${posture}`)
            assert.equal(actor.postureTransitionRemaining, 0, `${weapon}: firing requested an upright recovery`)
            assert(Math.abs(actor.rig.bones.hips.position.y - plantedHeight) < 0.001, `${weapon}: sustained ${posture} fire raised the pelvis`)
          }
        }
      }
      assert(!actor.hitVolumes.raycast(new THREE.Vector3(0, 5.55, -3), new THREE.Vector3(0, 0, 1), 6), 'Prone actor retains standing head volume')
      const head = actor.hitVolumes.volumes().find(volume => volume.zone === 'head')!.a
      assert(actor.hitVolumes.raycast(head.clone().add(new THREE.Vector3(0, 0, -3)), new THREE.Vector3(0, 0, 1), 6), 'Prone head is not hittable')
      const low = actor.rig.bones.hips.position.y
      actor.react('flinchBody', false)
      actor.update(1 / 60, 'combat', false, target)
      assert(Math.abs(actor.rig.bones.hips.position.y - low) < 0.02, 'Low hit reaction snaps upright')
      update(actor, 1.8, target)
      assert.equal(actor.posture, 'prone')
      actor.setPosture('stand')
      assert(actor.postureTransitionRemaining >= 0.7)
      update(actor, 1, target)
      actor.update(1 / 60, 'patrol', true, undefined, 1.4)
      assert.equal(actor.player.current!.getClip().name, 'walk')
      console.log(`PASS ${weapon}: persistent crouch/kneel/prone, six-second low firing, ground-relative aim, support contact, recoil, animated eye/hit volumes, low flinch and upright gait recovery`)
    } finally { actor.dispose() }
  }

  const actor = await EnemyActor.create('ak'), restored = await EnemyActor.create('ak')
  try {
    const compare = (label: string) => {
      for (const name of Object.keys(actor.rig.bones) as (keyof typeof actor.rig.bones)[]) {
        assert(actor.rig.bones[name].position.distanceTo(restored.rig.bones[name].position) < 1e-5, `${label}: ${name} position changed`)
        assert(actor.rig.bones[name].quaternion.clone().normalize().angleTo(restored.rig.bones[name].quaternion.clone().normalize()) < 0.0003, `${label}: ${name} angle changed ${actor.rig.bones[name].quaternion.clone().normalize().angleTo(restored.rig.bones[name].quaternion.clone().normalize())}`)
      }
    }
    update(actor)
    actor.setPosture('prone'); update(actor, 0.22)
    const dropSnapshot = JSON.parse(JSON.stringify(actor.postureSnapshot())), dropTime = actor.animationTime
    restored.restore('combat', dropTime, actor.deathClip, dropSnapshot)
    compare('Mid-drop restore')
    update(actor, 0.15)
    actor.restore('combat', dropTime, actor.deathClip, dropSnapshot)
    assert(actor.postureTransitionRemaining > 0.2, 'Rewinding the same actor discarded the drop transition')
    assert.equal(actor.animationTime, dropTime, 'Same-actor drop rewind lost elapsed time')
    compare('Same-actor mid-drop rewind')

    actor.restore('suspicious')
    actor.setPosture('crouch', true)
    update(actor, 0.7)
    const scanSnapshot = JSON.parse(JSON.stringify(actor.postureSnapshot())), scanTime = actor.animationTime
    restored.restore('suspicious', scanTime, actor.deathClip, scanSnapshot)
    update(actor, 0.2)
    actor.restore('suspicious', scanTime, actor.deathClip, scanSnapshot)
    assert(actor.postureSnapshot().transition, 'Same-actor scan rewind discarded the active transition')
    assert(actor.postureTransitionRemaining > 1, 'Same-actor scan rewind prematurely completed the scan')
    assert.equal(actor.animationTime, scanTime, 'Same-actor scan rewind reset elapsed time')
    compare('Same-actor mid-scan rewind')
    actor.setPosture('crouch', true); update(actor, 0.1)
    actor.setPosture('crouch', false)
    assert(actor.postureTransitionRemaining <= 0.25, 'Contact cannot interrupt curious scan')

    for (const yaw of [0, 1.1]) for (const direction of [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)]) {
      actor.root.rotation.y = yaw; actor.restore('combat'); update(actor)
      const start = actor.rig.bones.hips.getWorldPosition(vector()), rotation = actor.rig.bones.hips.quaternion.clone()
      actor.react('dieShotgun', true, direction, 0.45)
      actor.update(0, 'dead', false)
      assert(actor.rig.bones.hips.quaternion.angleTo(rotation) < 0.0001, 'Shotgun turns enemy at instant of impact')
      actor.update(0.32, 'dead', false)
      const airborne = actor.rig.bones.hips.getWorldPosition(vector())
      assert(airborne.y > start.y + 0.28, 'Shotgun lacks airborne lift')
      const travel = airborne.clone().sub(start); travel.y = 0
      assert(travel.clone().normalize().dot(direction) > 0.98, 'Shotgun fall does not follow incoming shot')
      assert(travel.length() > 0.35 && travel.length() < 0.4, 'Collision travel scale was not applied')
      restored.root.rotation.y = yaw
      const airborneSnapshot = JSON.parse(JSON.stringify(actor.postureSnapshot())), airborneTime = actor.animationTime
      restored.restore('dead', airborneTime, actor.deathClip, airborneSnapshot)
      compare('Airborne death restore')
      actor.update(1.08, 'dead', false)
      actor.restore('dead', airborneTime, actor.deathClip, airborneSnapshot)
      assert.equal(actor.animationTime, airborneTime, 'Same-actor airborne rewind lost elapsed time')
      compare('Same-actor airborne death rewind')
      actor.update(1.08, 'dead', false); restored.update(1.08, 'dead', false)
      compare('Settled death restore')
      actor.restore('dead', actor.animationTime, actor.deathClip, JSON.parse(JSON.stringify(actor.postureSnapshot())))
      compare('Same-actor settled death restore')
      assert(Math.min(...actor.hitVolumes.volumes().map(v => Math.min(v.a.y, v.b.y) - v.radius)) > -0.005, 'Directional landing drives limbs through floor')
      assert(!actor.gun.visible && !restored.gun.visible, 'Death resurrected held weapon')
      assert(actor.root.position.length() === 0 && actor.root.rotation.y === yaw, 'Shotgun changed navigation root/facing')
    }
    actor.restore('guard')
    assert.equal(actor.posture, 'stand')
    assert(!actor.postureSnapshot().deathClip && !actor.postureSnapshot().deathDirection)
    assert(actor.gun.visible)
    console.log('PASS new/same-actor drop and scan checkpoints, curious-scan interruption, directional shotgun launch/landing, collision scale, airborne/corpse rewind and restart')
  } finally { actor.dispose(); restored.dispose() }
} finally { GLTFLoader.prototype.loadAsync = load }
