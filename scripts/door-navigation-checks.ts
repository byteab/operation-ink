import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CollisionWorld } from '../src/player/collision'
import { EnemyNavigation } from '../src/game/navigation'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { createDoor, setDoorOpen, updateDoors } from '../src/world/doors'

const v = (x: number, z: number) => new THREE.Vector3(x, 0.024, z)
const scene = new THREE.Scene()
function box(width: number, height: number, depth: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshBasicMaterial())
  mesh.position.set(x, y, z); scene.add(mesh)
}
box(16, 0.2, 16, 0, -0.1, 0)
for (const side of [-1, 1]) box(3.25, 3, 0.2, side * 2.425, 1.5, 0)
const door = createDoor({ name: 'Regression door', x: 0, z: 0, floor: 0, width: 1.5 })
scene.add(door)
const world = new CollisionWorld(scene)
const navigation = new EnemyNavigation(world, [door], () => {})
function open(value: boolean) { setDoorOpen(door, value, true); world.refresh() }
function walk(start: THREE.Vector3, destination: THREE.Vector3) {
  let position = start.clone()
  const route = navigation.plan(position, destination)
  assert(route.length, 'a path must exist around the open leaf')
  let previous = position
  for (const point of route) {
    assert(navigation.segment(previous, point, false), 'planned route must clear the real open leaf and frame')
    previous = point
  }
  for (let frame = 0; frame < 1000 && position.distanceTo(destination) > 0.08; frame++) {
    while (route.length > 1 && position.distanceTo(route[0]) < 0.08) route.shift()
    const next = navigation.step(position, route[0], 1.4 / 60)
    assert(next, `guard stuck behind open leaf at ${position.toArray()}`)
    position = next
  }
  assert(position.distanceTo(destination) < 0.08, 'guard must reach the other side of the leaf')
}

// Warm the shared grid/route caches in the closed-door configuration.
const start = v(-2.4, -1.6), end = v(2.4, 1.6)
assert(navigation.plan(start, end).length)
open(true)
assert(!navigation.segment(v(-1.3, 0.7), v(0.5, 0.7)), 'open leaf must block a direct planned segment')
walk(v(-1.3, 0.7), v(0.5, 0.7))
walk(v(0.5, 0.7), v(-1.3, 0.7))
walk(start, end)
console.log('PASS open-door paths clear the swung leaf in both directions, including after cached closed-door routes')

open(false)
assert(navigation.segment(v(0, -1), v(0, 1)), 'an unlocked closed door may be opened along a route')
assert(!navigation.segment(v(0, -1), v(0, 1), false), 'physical movement must still wait for the leaf')
door.userData.missionLocked = true
assert(!navigation.segment(v(0, -1), v(0, 1)), 'locked leaves must remain solid during planning')
navigation.prepareDoor(v(0, -1), v(0, 1))
assert(!door.userData.open, 'guards must not unlock mission doors')
console.log('PASS closed-door planning preserves physical clearance and mission locks')

door.userData.missionLocked = false
const job = navigation.createPlan(start, end)
assert.equal(job.next().done, false)
setDoorOpen(door, true)
updateDoors([door], 1, true); world.refresh()
let result = job.next()
while (!result.done) result = job.next()
let previous = start
assert(result.value.length)
for (const point of result.value) {
  assert(navigation.segment(previous, point, false), 'a yielded job must replan when a door moves')
  previous = point
}
console.log('PASS a door opening during a yielded planning job cannot publish stale geometry')

const overlapping = v(-0.82, 0.7)
assert(!navigation.floor(overlapping, false), 'fixture must start intersecting the open leaf')
const recovered = navigation.recoverDoorOverlap(overlapping)
assert(recovered && navigation.floor(recovered, false), 'an opening leaf must push a trapped guard onto clear ground')
assert(recovered.distanceTo(overlapping) < 0.6, 'overlap recovery must stay local')
assert.equal(navigation.recoverDoorOverlap(v(-2, 0)), null, 'door recovery must never move a guard through a wall')
console.log('PASS a leaf swinging into a guard resolves locally without bypassing solid walls')

const director = new EnemyDirector({ scene, world, doors: [door],
  specs: [{ id: 'door-guard', name: 'Door guard', position: [-1.3, 0, 0.7],
    patrol: [[-1.3, 0, 0.7], [0.5, 0, 0.7]], weapon: 'ak', facing: Math.PI / 2 }],
  emit: () => {}, damagePlayer: () => {}, dropWeapon: () => {} }, async () => {
  const root = new THREE.Group()
  return { root, update() {}, shoot() {}, react() {}, restore() {}, dispose() { root.removeFromParent() },
    muzzle: () => root.position.clone(), animationTime: 0 } as unknown as EnemyActor
})
await director.init()
const guard = director.enemies[0]
// Simulate a route issued before the leaf swung into the guard's approach.
guard.path = [v(0.5, 0.7)]; guard.pathTarget = v(0.5, 0.7); guard.wait = 0
const player = { feet: v(100, 100), eye: new THREE.Vector3(100, 1.7, 100), velocity: new THREE.Vector3(), alive: true, radioEnabled: false }
for (let frame = 0; frame < 900 && !guard.visitedWaypoints; frame++) director.update(1 / 60, player)
assert(guard.visitedWaypoints > 0, `director must recover a stale route around an open door: ${guard.position.toArray()}`)
assert(navigation.floor(guard.position, false), 'recovering guard must not overlap the leaf or wall')
console.log('PASS the live director recovers a stale route blocked by a swung door')
director.dispose()
world.dispose()
