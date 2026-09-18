import assert from 'node:assert/strict'
import * as THREE from 'three'
import { thumbstick, SnapTurn, VRRig } from '../src/vr/locomotion'
import { createCompound } from '../src/world/compound'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody } from '../src/player/body'
import { PlayerActions } from '../src/player/actions'

const near = (a: number, b: number) => assert(Math.abs(a - b) < 0.00001, `${a} != ${b}`)
assert.deepEqual(thumbstick(undefined), [0, 0])
assert.deepEqual(thumbstick({ mapping: '', axes: [0, 0, 1, 1] }), [0, 0])
assert.deepEqual(thumbstick({ mapping: 'xr-standard', axes: [1, 1, 0.05, -0.05] }), [0, 0])
assert.deepEqual(thumbstick({ mapping: 'xr-standard', axes: [1, 1, 0, -1] }), [0, -1])
near(Math.hypot(...thumbstick({ mapping: 'xr-standard', axes: [0, 0, 1, 1] })), 1)
console.log('PASS Quest axes, dead zone, missing controllers, and diagonal speed cap')

const snap = new SnapTurn()
near(snap.update(1), -Math.PI / 6)
for (let i = 0; i < 120; i++) assert.equal(snap.update(1), 0)
assert.equal(snap.update(-1), 0)
assert.equal(snap.update(0), 0)
near(snap.update(-1), Math.PI / 6)
console.log('PASS Snap turn requires stick release, including direction changes')

const rig = new VRRig(), feet = new THREE.Vector3(20, 5, -30)
const heading = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.2, 0))
rig.camera.position.set(2, 1.7, 3)
rig.camera.quaternion.setFromEuler(new THREE.Euler(0, -0.4, 0))
rig.place(feet, heading)
near(rig.head.position.x, feet.x); near(rig.head.position.z, feet.z)
near(rig.head.position.y, 6.7)
near(rig.head.quaternion.angleTo(heading), 0)
rig.camera.position.x += 0.25
rig.camera.position.y -= 0.4
rig.sync(feet)
const beforeTurn = rig.head.position.clone()
rig.turn(Math.PI / 6, feet)
near(rig.head.position.distanceTo(beforeTurn), 0)
feet.add(new THREE.Vector3(0, 3, 2)); rig.sync(feet)
near(rig.head.position.distanceTo(beforeTurn.clone().add(new THREE.Vector3(0, 3, 2))), 0)
const direction = rig.direction(0, -1, new THREE.Vector3())
near(direction.y, 0); near(direction.length() * 4.2, 1.8)
const viewDirection = rig.head.getWorldDirection(new THREE.Vector3()).setY(0).normalize()
near(direction.clone().normalize().dot(viewDirection), 1)
console.log('PASS Floor height, initial heading, crouching, snap pivot, and head-relative movement')

const scene = createCompound(), world = new CollisionWorld(scene), body = new PlayerBody(world)
const actions = new PlayerActions(scene, body), camera = new THREE.PerspectiveCamera()
for (const ladder of actions.ladders) {
  const bottom = actions.ladderPoint(ladder, false)
  const outward = new THREE.Vector3(0, 0, 1).transformDirection(ladder.matrixWorld)
  body.teleport(bottom.clone().addScaledVector(outward, 0.8))
  for (const descending of [false, true]) {
    actions.syncCamera(camera)
    camera.lookAt(actions.ladderPoint(ladder, descending).add(new THREE.Vector3(0, descending ? 0.85 : 1.25, 0)))
    const rotation = camera.quaternion.clone()
    assert.equal(actions.findTarget(camera)?.object, ladder)
    assert(actions.activate(camera, 'instant'))
    assert.equal(actions.climbing, null)
    near(camera.quaternion.angleTo(rotation), 0)
    for (let i = 0; i < 60; i++) body.update(1 / 120, new THREE.Vector3(), false)
    assert(body.grounded, `${ladder.name}: unsupported landing`)
    assert(Math.abs(body.position.y - actions.ladderPoint(ladder, !descending).y) < 0.3)
  }
}
world.dispose()
console.log('PASS All six ladders blink up/down onto supported landings without rotating the camera')
