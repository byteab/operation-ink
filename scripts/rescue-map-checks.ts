import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import { RESCUE_LAYOUT } from '../src/game/rescue-layout'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody } from '../src/player/body'
import { PlayerActions } from '../src/player/actions'
import { setDoorOpen, updateDoors } from '../src/world/doors'

const compound = createCompound()
prepareCompound(compound)
const mission = createMissionWorld(), scene = new THREE.Group()
scene.add(compound, mission.root)
const world = new CollisionWorld(scene), body = new PlayerBody(world)
const actions = new PlayerActions(scene, body)

function walk(target: THREE.Vector3) {
  const budget = Math.ceil(body.position.distanceTo(target) / 4.2 * 60) + 300
  for (let frame = 0; frame < budget; frame++) {
    const direction = target.clone().sub(body.position).setY(0)
    if (direction.length() < 0.14) return
    body.update(1 / 60, direction.normalize(), false)
  }
  assert.fail(`Player stuck ${body.position.toArray()} toward ${target.toArray()}`)
}

body.teleport(new THREE.Vector3(...mission.spawn))
for (const [x, z] of [[-53, -62.3], [-61.8, -52]]) walk(new THREE.Vector3(x, 0, z))
const serviceEntry = compound.getObjectByName('North service yard gate · closed')!
assert(serviceEntry && !serviceEntry.userData.open && serviceEntry.userData.permanentlyClosed)
assert(!actions.doors.includes(serviceEntry as THREE.Group), 'Permanent fence gate must not register as an interactive door')
for (let frame = 0; frame < 120; frame++) body.update(1 / 60, new THREE.Vector3(0, 0, 1), false)
assert(body.position.z < -48.2, 'Closed service entrance must block the player')
walk(new THREE.Vector3(-61.8, 0, -49.5))
const camera = new THREE.PerspectiveCamera()
camera.position.copy(body.position).y += 1.65
camera.lookAt(-60.3, 1.2, -48)
camera.updateMatrixWorld(true)
assert.equal(actions.findTarget(camera), null, 'Permanent service gate must not offer an F interaction')
assert(!actions.activate(camera), 'F must not open the permanent service gate')
assert(!serviceEntry.userData.open)
console.log('PASS permanent service fence gate blocks walking and cannot be opened with F')

const hall = compound.getObjectByName('Northwest service building')!
const ladder = actions.ladders.find(object => object.name === 'Mess hall · west exterior roof ladder')!
const bottom = actions.ladderPoint(ladder, false)
const outward = new THREE.Vector3(0, 0, 1).transformDirection(ladder.matrixWorld)
for (const [x, z] of [[-51.5, -49.5], [-51.5, bottom.z]]) walk(new THREE.Vector3(x, 0, z))
walk(bottom.clone().addScaledVector(outward, 0.8))
actions.syncCamera(camera)
camera.lookAt(bottom.clone().add(new THREE.Vector3(0, 1.25, 0)))
camera.updateMatrixWorld(true)
assert.equal(actions.findTarget(camera)?.object, ladder)
assert(actions.activate(camera), 'Spawn route must reach the exterior roof ladder')
for (let frame = 0; frame < 600 && actions.climbing; frame++) actions.updateClimb(1 / 60)
assert(!actions.climbing)
assert(Math.abs(body.position.y - hall.userData.roofHeight) < 0.06)
const hallPoint = (x: number, z: number, y = hall.userData.roofHeight) => hall.localToWorld(new THREE.Vector3(x, y, z))
const openDoor = (name: string) => {
  const door = actions.doors.find(object => object.name === name)!
  const hinge = door.children.find(child => child.userData.doorHinge)!
  actions.syncCamera(camera)
  camera.lookAt(hinge.localToWorld(new THREE.Vector3(door.userData.width * 0.7, 1.2, 0)))
  camera.updateMatrixWorld(true)
  assert.equal(actions.findTarget(camera)?.object, door, `${name} must be reachable on the continuous route`)
  assert(actions.activate(camera), `F must open ${name}`)
  for (let frame = 0; frame < 60; frame++) updateDoors(actions.doors, 1 / 60)
  world.refresh()
}
walk(hallPoint(0, 6.3))
walk(hallPoint(9.2, 6.3))
openDoor('Rooftop access door')
walk(hallPoint(9.2, 3.25))
walk(hallPoint(9.2, -8.25, hall.userData.floor))
assert(Math.abs(body.position.y - hall.userData.floor) < 0.06, 'Roof route must descend the interior staircase')
walk(hallPoint(8.15, -8.25, hall.userData.floor))
openDoor('Vestibule to mess hall door')
for (const [x, z] of [[5.3, -8.25], [5.3, -6.2], [0, -6.2], [0, 8.9]]) walk(hallPoint(x, z, hall.userData.floor))
openDoor('Mess hall yard exit')
walk(hallPoint(0, 18, 0))
for (const [x, z] of [[-20, -29], [-20, 2.25], [-11, 2.25], [-8, 13], [0, 13], [55, 16],
  [99, 11], [110, 5], [117, -3]]) walk(new THREE.Vector3(x, 0, z))
console.log('PASS continuous spawn route climbs the roof ladder, descends the mess hall stairs and reaches the detention annex')

walk(new THREE.Vector3(117, 0.12, -8.4))
walk(new THREE.Vector3(117, -4.2, -22))
assert(Math.abs(body.position.y + 4.2) < 0.06, `Basement unreachable: ${body.position.toArray()}`)
console.log('PASS player descends the actual ground opening and all 18 stairs')

for (const door of mission.rescue!.cellDoors) setDoorOpen(door, true, true)
world.refresh()
for (const spawn of RESCUE_LAYOUT.hostageSpawns) {
  walk(new THREE.Vector3(117, -4.2, spawn[2]))
  walk(new THREE.Vector3(...spawn))
  walk(new THREE.Vector3(117, -4.2, spawn[2]))
}
console.log('PASS player enters and leaves every opened holding cell')

walk(new THREE.Vector3(117, -4.2, -21))
walk(new THREE.Vector3(117, 0.12, -8.4))
assert(Math.abs(body.position.y - 0.12) < 0.06, `Stair ascent failed: ${body.position.toArray()}`)
walk(new THREE.Vector3(117, 0.12, -3))
walk(new THREE.Vector3(127, 0.05, 11))
walk(new THREE.Vector3(...RESCUE_LAYOUT.jeepBoardPoint))
console.log('PASS player climbs out and follows the same clear escort lane to jeep')

body.teleport(new THREE.Vector3(161, 0.05, 11))
for (let frame = 0; frame < 120; frame++) body.update(1 / 60, new THREE.Vector3(1, 0, 0), false)
assert(body.position.x < 163.8, 'Closed exit gate must block player')
setDoorOpen(mission.rescue!.gate, true, true)
world.refresh()
walk(new THREE.Vector3(175, 0.05, 11))
console.log('PASS closed gate blocks and opened gate admits the entire escape route')

for (let x = 155; x <= 175; x += 0.5) {
  for (const dx of [-3.4, -1.7, 0, 1.7, 3.4]) for (const dz of [-1.7, 0, 1.7]) {
    const capsule = new Capsule(new THREE.Vector3(x + dx, 0.45, 11 + dz),
      new THREE.Vector3(x + dx, 2.6, 11 + dz), 0.15)
    assert(world.fits(capsule, [mission.rescue!.jeep]), `Vehicle envelope blocked at ${x + dx},${11 + dz}`)
  }
}
console.log('PASS full 7.1 by 3.7 metre vehicle envelope clears gate, fence and exterior lane')

for (const station of mission.stations) {
  const outward = new THREE.Vector3(0, 0, 1).transformDirection(station.object.matrixWorld)
  const eye = station.point.clone().addScaledVector(outward, 1.3)
  eye.y += 0.35
  assert(world.visible(eye, station.point, station.object), `${station.id} interaction hidden behind geometry`)
}
console.log('PASS mission controls have unobstructed nearby interaction sightlines')
world.dispose()
