import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCompound } from '../src/world/compound'
import { createDoor, setDoorOpen, updateDoors } from '../src/world/doors'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody } from '../src/player/body'
import { PlayerActions } from '../src/player/actions'
import { fallDamage } from '../src/game/balance'

const scene = createCompound(), world = new CollisionWorld(scene), body = new PlayerBody(world)
const actions = new PlayerActions(scene, body), camera = new THREE.PerspectiveCamera(75, 1, 0.06, 1600)
const zero = new THREE.Vector3()
let landingDamage = 0
let failures = 0
const test = (name: string, run: () => void) => {
  try { run(); console.log(`PASS ${name}`) }
  catch (error) { failures++; console.error(`FAIL ${name}`, error) }
}
const simulate = (seconds: number, direction = zero, sprint = false, dt = 1 / 60) => {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += dt) {
    body.update(dt, direction, sprint)
    landingDamage += fallDamage(body.landingSpeed)
  }
}
const stand = (position: THREE.Vector3) => { body.teleport(position); simulate(0.4) }
const near = (actual: number, expected: number, tolerance = 0.08) => assert(Math.abs(actual - expected) < tolerance, `${actual} expected near ${expected}`)

test('Walk, sprint, diagonal speed, and frame-rate independence', () => {
  const start = new THREE.Vector3(-180, 0.05, 0), distances: number[] = []
  for (const [direction, sprint, dt] of [
    [new THREE.Vector3(1, 0, 0), false, 1 / 60], [new THREE.Vector3(1, 0, 0), true, 1 / 60],
    [new THREE.Vector3(1, 0, 1).normalize(), false, 1 / 60], [new THREE.Vector3(1, 0, 0), false, 1 / 20],
  ] as const) {
    stand(start); const before = body.position.clone(); simulate(2, direction, sprint, dt)
    distances.push(body.position.distanceTo(before)); assert(body.grounded)
  }
  assert(distances[0] > 8 && distances[0] < 8.5)
  assert(distances[1] > distances[0] * 1.7)
  near(distances[2], distances[0], 0.01); near(distances[3], distances[0], 0.01)
})

test('Jump rises, cannot double-jump, and lands on the same ground', () => {
  stand(new THREE.Vector3(-180, 0.05, 0)); const floor = body.position.y
  assert(body.jump()); assert(!body.jump())
  let peak = floor
  for (let i = 0; i < 120; i++) { simulate(1 / 60); peak = Math.max(peak, body.position.y) }
  assert(peak - floor > 1 && peak - floor < 1.2)
  assert(body.grounded); near(body.position.y, floor)
})

test('Exterior walls and wire fence panels stop sprinting', () => {
  stand(new THREE.Vector3(-51.9, 0.14, -53.5)); simulate(2, new THREE.Vector3(1, 0, 0), true)
  assert(body.position.x < -48.45, `Crossed west wall: ${body.position.x}`)
  const fence = scene.children.find(object => object.name === 'North service enclosure · west')!
  const panel = fence.userData.collisionPanels[0]
  const middle = new THREE.Vector3((panel.a[0] + panel.b[0]) / 2, 0.05, (panel.a[1] + panel.b[1]) / 2)
  stand(middle.clone().add(new THREE.Vector3(0, 0, -2))); simulate(1, new THREE.Vector3(0, 0, 1), true)
  assert(body.position.z < middle.z - 0.2, 'Crossed fence wire')
})

test('The mess hall staircase can be walked up and down', () => {
  const hall = scene.children.find(object => object.userData.kind === 'mess-hall')!
  stand(hall.localToWorld(new THREE.Vector3(9.2, 0.3, -7.5)))
  landingDamage = 0
  simulate(2.8, new THREE.Vector3(0, 0, 1))
  near(body.position.y, hall.userData.roofHeight)
  assert(body.grounded)
  simulate(3, new THREE.Vector3(0, 0, -1))
  near(body.position.y, 0.28)
  assert(body.grounded)
  assert.equal(landingDamage, 0, 'Stair travel never causes fall damage')
})

for (const ladder of actions.ladders) test(`${ladder.name}: climb up, stand on landing, climb down`, () => {
  actions.reset()
  const bottom = actions.ladderPoint(ladder, false)
  const outward = new THREE.Vector3(0, 0, 1).transformDirection(ladder.matrixWorld)
  stand(bottom.clone().addScaledVector(outward, 0.8))
  landingDamage = 0
  actions.syncCamera(camera); camera.lookAt(bottom.clone().add(new THREE.Vector3(0, 1.25, 0)))
  assert.equal(actions.findTarget(camera)?.object, ladder)
  assert(actions.activate(camera))
  for (let i = 0; i < 300 && actions.climbing; i++) actions.updateClimb(0.05)
  assert(!actions.climbing); simulate(0.5)
  near(body.position.y, actions.ladderPoint(ladder, true).y, 0.3); assert(body.grounded)
  const landing = actions.ladderPoint(ladder, true)
  actions.syncCamera(camera); camera.lookAt(landing.clone().add(new THREE.Vector3(0, 0.85, 0)))
  assert(actions.findTarget(camera)?.descending)
  assert(actions.activate(camera))
  for (let i = 0; i < 300 && actions.climbing; i++) actions.updateClimb(0.05)
  simulate(0.5); near(body.position.y, bottom.y, 0.2); assert(body.grounded)
  assert.equal(landingDamage, 0, 'Ladder travel and dismounts never cause fall damage')
})

test('F opens a closed door and the animated leaf permits passage', () => {
  const door = actions.doors.find(object => object.name === 'Rooftop access door')!
  setDoorOpen(door, false, true); world.refresh()
  stand(door.localToWorld(new THREE.Vector3(0, 0.03, 1.6)))
  simulate(0.6, new THREE.Vector3(0, 0, -1))
  assert(door.worldToLocal(body.position.clone()).z > 0.3, 'Crossed closed door')
  actions.syncCamera(camera); camera.lookAt(door.localToWorld(new THREE.Vector3(0, 1.2, 0)))
  assert.equal(actions.findTarget(camera)?.object, door)
  actions.activate(camera); assert(door.userData.open)
  for (let i = 0; i < 60; i++) updateDoors(actions.doors, 1 / 60)
  world.refresh(); simulate(0.55, new THREE.Vector3(0, 0, -1))
  assert(door.worldToLocal(body.position.clone()).z < -0.6, 'Open door blocked passage')
})

test('The mess hall yard exit opens from inside, reaches the yard, and permits re-entry', () => {
  const hall = scene.children.find(object => object.userData.kind === 'mess-hall')!
  const door = actions.doors.find(object => object.name === 'Mess hall yard exit')!
  const south = new THREE.Vector3(0, 0, 1).transformDirection(hall.matrixWorld)
  const localPosition = () => door.worldToLocal(body.position.clone())
  const useDoor = () => {
    actions.syncCamera(camera)
    const hinge = door.children.find(child => child.userData.doorHinge)!
    camera.lookAt(hinge.localToWorld(new THREE.Vector3(door.userData.width * 0.7, 1.2, 0)))
    assert.equal(actions.findTarget(camera)?.object, door)
    assert(actions.activate(camera))
    for (let i = 0; i < 60; i++) updateDoors(actions.doors, 1 / 60)
    world.refresh()
  }
  setDoorOpen(door, false, true); world.refresh()
  stand(hall.localToWorld(new THREE.Vector3(0, hall.userData.floor + 0.03, 0)))
  simulate(3, south)
  assert(localPosition().z < -0.3 && localPosition().z > -0.5, 'Aisle blocked or closed exit crossed')
  useDoor(); assert(door.userData.open)
  simulate(2.5, south)
  assert(localPosition().z > 8, 'Could not reach the compound beyond the exterior landing and apron')
  assert(body.grounded); near(body.position.y, 0.005)
  simulate(2.1, south.clone().negate())
  useDoor(); assert(!door.userData.open)
  simulate(0.6, south.clone().negate())
  assert(localPosition().z > 0.3, 'Crossed closed exit from the yard')
  useDoor(); assert(door.userData.open)
  simulate(1, south.clone().negate())
  assert(localPosition().z < -2, 'Open exit blocked re-entry')
  assert(body.grounded); near(body.position.y, hall.userData.floor)
  setDoorOpen(door, false, true); world.refresh()
})

test('Door interactions reject distance, facing away, and an occluding wall', () => {
  const testScene = new THREE.Group(), door = createDoor({ name: 'Test door', x: 0, z: 0, floor: 0 })
  const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.1), new THREE.MeshBasicMaterial())
  wall.position.set(0, 1.5, 1); testScene.add(door)
  const clearWorld = new CollisionWorld(testScene), clearBody = new PlayerBody(clearWorld), clearActions = new PlayerActions(testScene, clearBody)
  for (const [distance, away, expected] of [[4, false, false], [2, true, false], [2, false, true]] as const) {
    clearBody.teleport(new THREE.Vector3(0, 0, distance)); clearActions.syncCamera(camera)
    camera.lookAt(0, 1.2, away ? distance + 1 : 0)
    assert.equal(!!clearActions.findTarget(camera), expected)
  }
  testScene.add(wall)
  const blockedWorld = new CollisionWorld(testScene), blockedBody = new PlayerBody(blockedWorld), blockedActions = new PlayerActions(testScene, blockedBody)
  blockedBody.teleport(new THREE.Vector3(0, 0, 2)); blockedActions.syncCamera(camera); camera.lookAt(0, 1.2, 0)
  assert.equal(blockedActions.findTarget(camera), null); assert(!blockedActions.activate(camera)); assert(!door.userData.open)
  clearWorld.dispose(); blockedWorld.dispose()
})

world.dispose()
if (failures) throw new Error(`${failures} player checks failed`)
console.log('All player checks passed.')
