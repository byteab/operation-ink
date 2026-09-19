import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EnemyActor } from '../src/game/actors'

const bytes = readFileSync('public/models/stickman.glb'), load = GLTFLoader.prototype.loadAsync
GLTFLoader.prototype.loadAsync = async function () {
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}
const v = () => new THREE.Vector3()
try {
  for (const weapon of ['pistol', 'ak', 'smg', 'sniper'] as const) {
    const actor = await EnemyActor.create(weapon)
    try {
      const rootPosition = actor.root.position.clone(), initialHead = actor.rig.bones.head.getWorldQuaternion(new THREE.Quaternion())
      const hips = actor.rig.bones.hips.getWorldPosition(v())
      const feet = (['L', 'R'] as const).map(side => actor.rig.bones[`shin.${side}`].localToWorld(new THREE.Vector3(0, Math.hypot(.36, .05), 0)))
      let variation = 0
      for (let i = 0; i < 600; i++) {
        actor.update(1 / 60, 'guard', false)
        // The neck shares the turn with the head; evaluate the visible gaze.
        variation = Math.max(variation, initialHead.angleTo(actor.rig.bones.head.getWorldQuaternion(new THREE.Quaternion())))
        assert(actor.root.position.equals(rootPosition), 'Idle motion must not displace navigation root')
        assert(actor.rig.bones.hips.getWorldPosition(v()).distanceTo(hips) < 1e-5, 'Relaxed look sways the pelvis')
        for (const [index, side] of (['L', 'R'] as const).entries()) {
          const foot = actor.rig.bones[`shin.${side}`].localToWorld(new THREE.Vector3(0, Math.hypot(.36, .05), 0))
          assert(foot.distanceTo(feet[index]) < 1e-5, 'Relaxed look slides or lifts a planted foot')
        }
      }
      assert(variation > 0.5, `${weapon}: guard actually checks different directions`)
      const heldHead = actor.rig.bones.head.quaternion.clone()
      for (let i = 0; i < 500; i++) actor.update(0, 'guard', false)
      assert(heldHead.angleTo(actor.rig.bones.head.quaternion) < 1e-6, 'Repeated stationary evaluation does not accumulate pose')

      actor.root.userData.alertScan = 0
      actor.restore('suspicious')
      for (let i = 0; i < 40; i++) actor.update(1 / 60, 'suspicious', false)
      const readyArm = actor.rig.bones['upper_arm.R'].quaternion.clone()
      let previous = actor.rig.bones['hand.R'].getWorldPosition(v()), maxStep = 0
      const headSamples: THREE.Quaternion[] = []
      const revision = actor.player.revision
      for (let i = 0; i <= 100; i++) {
        actor.root.userData.alertScan = i / 100
        actor.update(1 / 60, 'suspicious', false)
        const current = actor.rig.bones['hand.R'].getWorldPosition(v())
        maxStep = Math.max(maxStep, previous.distanceTo(current)); previous = current
        if (i === 25 || i === 75) headSamples.push(actor.rig.bones.head.quaternion.clone())
        assert(actor.root.position.equals(rootPosition), 'Scan must not displace navigation root')
        for (const name of ['thigh.L', 'thigh.R', 'shin.L', 'shin.R'] as const) {
          assert(actor.rig.bones[name].quaternion.angleTo(actor.rig.rest[name].quat) < 0.01, 'Planted scan leaves leg pose untouched')
        }
        if (actor.gun.userData.support) {
          const anchor = actor.gun.localToWorld(actor.gun.userData.support.clone())
          const fist = actor.rig.bones['hand.L'].localToWorld(new THREE.Vector3(0, 0.035, 0))
          assert(anchor.distanceTo(fist) < 0.06, `${weapon}: support hand left gun by ${anchor.distanceTo(fist)}m`)
        }
      }
      assert.equal(actor.player.revision, revision, 'Scan progress does not restart the clip each frame')
      assert(headSamples[0].angleTo(headSamples[1]) > 0.7, `${weapon}: near miss visibly checks both sides`)
      assert(maxStep < 0.07, `${weapon}: scan hand discontinuity ${maxStep}`)
      actor.root.userData.alertScan = undefined
      for (let i = 0; i < 120; i++) actor.update(1 / 60, 'combat', false, new THREE.Vector3(0, 1.65, 10))
      assert(readyArm.angleTo(actor.rig.bones['upper_arm.R'].quaternion) > 0.06, 'Scan at progress zero uses a distinct lowered ready hold')
      const aimArm = actor.rig.bones['upper_arm.R'].quaternion.clone()
      for (let i = 0; i < 120; i++) {
        actor.root.rotation.y = i % 2 ? 0.004 : 0
        actor.update(1 / 60, 'combat', false, new THREE.Vector3(0, 1.65, 10))
        assert(aimArm.angleTo(actor.rig.bones['upper_arm.R'].quaternion) < 0.01, 'Combat micro-turns keep gun raised')
      }
      actor.root.userData.alertScan = 0.3
      actor.react('flinchBody', false)
      actor.update(1 / 60, 'suspicious', false)
      assert.equal(actor.player.current!.getClip().name, 'flinchBody', 'Scan does not replace hit reaction')
      actor.root.userData.alertScan = undefined
      actor.restore('guard')
      actor.update(1 / 60, 'guard', false)
      assert.equal(actor.reactionRemaining, 0)
      assert.equal(actor.player.current!.getClip().name, 'lookRelaxed')
      actor.react('dieBody', true); actor.update(1 / 60, 'dead', false)
      assert(!actor.gun.visible)
      assert.equal(actor.player.current!.getClip().name, 'dieBody')
      console.log(`PASS ${weapon}: varied idle, planted scan at 0, stable hands/support contact, no pose drift, stable combat aim, hit/death priority and restore`)
    } finally { actor.dispose() }
  }
} finally { GLTFLoader.prototype.loadAsync = load }
