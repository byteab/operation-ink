import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { createRescueJeep } from '../src/game/rescue-jeep'
import { createMissionWorld } from '../src/game/world'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody } from '../src/player/body'
import { isDoorFullyOpen, setDoorOpen, updateDoors } from '../src/world/doors'

const scene = new THREE.Group(), jeep = createRescueJeep()
const floor = new THREE.Mesh(new THREE.BoxGeometry(80, 0.2, 80), new THREE.MeshBasicMaterial())
floor.position.set(155, -0.1, 11)
scene.add(floor, jeep)
const world = new CollisionWorld(scene), body = new PlayerBody(world)
const origin = jeep.position.clone()
for (const fps of [30, 60, 144]) for (const sprint of [false, true]) {
  for (const [x, z] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const outward = new THREE.Vector3(x, 0, z)
    body.teleport(origin.clone().addScaledVector(outward, 5))
    for (let frame = 0; frame < fps * 3; frame++) body.update(1 / fps, outward.clone().negate(), sprint)
    const local = body.position.clone().sub(origin)
    assert(local.dot(outward) > (x ? 2.5 : 1.25), `Walked through transport at ${fps}fps: ${local.toArray()}`)
    assert(body.position.y < 0.15, 'Walking automatically climbed onto the transport')
  }
}
console.log('PASS walking and sprinting into all four vehicle sides at 30/60/144 fps')

const nearSide = new Capsule(origin.clone().add(new THREE.Vector3(0, 0.28, -1.15)),
  origin.clone().add(new THREE.Vector3(0, 1.52, -1.15)), 0.28)
assert(!world.fits(nearSide))
jeep.position.x += 15
jeep.rotation.y = Math.PI / 3
world.refresh()
assert(world.fits(nearSide), 'Old car position retains a ghost collider')
const moved = nearSide.clone()
for (const point of [moved.start, moved.end]) point.sub(origin).applyQuaternion(jeep.quaternion).add(jeep.position)
assert(!world.fits(moved), 'Collision failed to follow car translation and rotation')
jeep.position.copy(origin); jeep.quaternion.identity(); world.refresh()
assert(!world.fits(nearSide) && world.fits(moved), 'Reset did not restore collision to the parked car')
world.dispose()
console.log('PASS transport colliders follow getaway translation, rotation and reset')

const gate = createMissionWorld().rescue!.gate
const hinge = gate.children.find(child => child.userData.doorHinge)!
const gateWorld = new CollisionWorld(gate)
assert.equal(gate.userData.swingSeconds, 3)
for (const fps of [10, 30, 60, 144]) for (const reducedMotion of [false, true]) {
  setDoorOpen(gate, false, true)
  setDoorOpen(gate, true)
  assert.equal(hinge.rotation.y, 0, 'Opening command snaps the gate')
  let previous = 0
  for (let frame = 1; frame <= fps * 3; frame++) {
    setDoorOpen(gate, true) // Runtime sync must not restart the swing.
    updateDoors([gate], 1 / fps, reducedMotion)
    const progress = -hinge.rotation.y / (Math.PI / 2)
    assert(progress >= previous && progress - previous <= 0.501 / fps)
    if (frame === fps / 2) assert(progress > 0 && progress < 0.1, 'Gate lacks a gentle start')
    if (frame === fps * 1.5) {
      assert(Math.abs(progress - 0.5) < 1e-8, 'Gate must be halfway open at 1.5 seconds')
      gateWorld.refresh()
      const point = hinge.localToWorld(new THREE.Vector3(4, 0, 0))
      const capsule = new Capsule(point.clone().add(new THREE.Vector3(0, 0.3, 0)),
        point.clone().add(new THREE.Vector3(0, 1.5, 0)), 0.28)
      assert(!gateWorld.fits(capsule), 'Swinging gate lost its body collision')
    }
    if (frame < fps * 3) assert(!isDoorFullyOpen(gate), 'Gate finished before three seconds')
    previous = progress
  }
  assert(isDoorFullyOpen(gate), `Gate unfinished after three seconds at ${fps}fps`)
}
setDoorOpen(gate, false, true)
setDoorOpen(gate, true); updateDoors([gate], 1)
setDoorOpen(gate, false, true)
updateDoors([gate], 0.5)
assert.equal(hinge.rotation.y, 0, 'Restart retained an in-flight gate animation')
setDoorOpen(gate, true); updateDoors([gate], 1.5)
assert(Math.abs(hinge.rotation.y + Math.PI / 4) < 1e-8)
setDoorOpen(gate, false)
const interrupted = hinge.rotation.y
updateDoors([gate], 0)
assert.equal(hinge.rotation.y, interrupted, 'Reversing a swing jumps the leaf')
updateDoors([gate], 1.5)
assert.equal(hinge.rotation.y, 0)
gateWorld.dispose()
console.log('PASS three-second eased gate, live collision, repeated commands, reduced motion, reset and reversal at 10/30/60/144 fps')
