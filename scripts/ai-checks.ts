import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector, insideVisionCone, audible, rayBodyDistance } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { gridPath, EnemyNavigation } from '../src/game/navigation'
import { CollisionWorld } from '../src/player/collision'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import { setDoorOpen, updateDoors } from '../src/world/doors'
import type { EnemySpec, PlayerSense, SoundEvent, WeaponItem } from '../src/game/types'

const v = (x: number, y = 0, z = 0) => new THREE.Vector3(x, y, z)
let failures = 0
async function check(name: string, run: () => void | Promise<void>) {
  try { await run(); console.log(`PASS ${name}`) }
  catch (error) { failures++; console.error(`FAIL ${name}`, error) }
}

await check('Vision cone, range and vertical limits are explicit; obstruction dampens hearing', () => {
  assert(insideVisionCone(v(0, 1.5), 0, v(0, 1.5, 20)))
  assert(!insideVisionCone(v(0, 1.5), 0, v(0, 1.5, -3)))
  assert(!insideVisionCone(v(0, 1.5), 0, v(31, 1.5, 2)))
  assert(!insideVisionCone(v(0, 1.5), 0, v(0, 1.5, 37)))
  assert(!insideVisionCone(v(0, 1.5), 0, v(0, 30, 5)))
  assert(audible(15, 20, true)); assert(!audible(15, 20, false)); assert(audible(7, 20, false))
})

await check('Ray hits the nearest upright body and rejects shots above/beside it', () => {
  assert(Math.abs(rayBodyDistance(v(0, 1.2, -10), v(0, 0, 1), v(0)) - 9.7) < 1e-6)
  assert.equal(rayBodyDistance(v(0, 3, -10), v(0, 0, 1), v(0)), Infinity)
  assert.equal(rayBodyDistance(v(1, 1, -10), v(0, 0, 1), v(0)), Infinity)
  assert(rayBodyDistance(v(0, 1.6, -10), v(0, 0, 1), v(0)) < 10)
})

await check('A* routes through a doorway, avoids corner cutting, and reports sealed goals', () => {
  const can = (x: number, z: number) => x >= 0 && x <= 8 && z >= 0 && z <= 8 && (x !== 4 || z === 6)
  const path = gridPath({ x: 1, z: 2 }, { x: 7, z: 2 }, can)
  assert(path.length > 0)
  assert(path.some(point => point.x === 4 && point.z === 6))
  assert.equal(gridPath({ x: 0, z: 0 }, { x: 1, z: 1 }, (x, z) => x === z && x >= 0 && x <= 1).length, 0)
  assert.equal(gridPath({ x: 1, z: 2 }, { x: 7, z: 2 }, (x, z) => can(x, z) && x !== 4).length, 0)
})

const scene = new THREE.Scene()
const compound = createCompound()
prepareCompound(compound)
const mission = createMissionWorld()
scene.add(compound, mission.root)
scene.updateMatrixWorld(true)
const world = new CollisionWorld(scene)
const doors: THREE.Group[] = []
scene.traverse(object => { if (object.userData.kind === 'door') doors.push(object as THREE.Group) })
const navigation = new EnemyNavigation(world, doors, () => {})

await check('Every authored NPC patrol segment has a collision-checked path on the actual map', () => {
  const errors: string[] = []
  const started = performance.now()
  for (const spec of mission.enemies) {
    // Reserve arrival route is intentionally one way; ordinary guards must close their loop.
    const count = spec.reserve ? spec.patrol.length - 1 : spec.patrol.length
    for (let i = 0; i < count; i++) {
      const start = new THREE.Vector3(...spec.patrol[i]), end = new THREE.Vector3(...spec.patrol[(i + 1) % spec.patrol.length])
      const a = navigation.floor(start), b = navigation.floor(end)
      if (!a || !b) { errors.push(`${spec.id} segment ${i}: invalid ${!a ? 'start' : 'end'} ${(!a ? start : end).toArray()}`); continue }
      const route = navigation.plan(a, b)
      if (!route.length) errors.push(`${spec.id} segment ${i}: no path`)
      let previous = a
      for (const point of route) { assert(navigation.segment(previous, point), `${spec.id}: route crossed geometry`); previous = point }
    }
  }
  console.log(`Patrol planning check ${(performance.now() - started).toFixed(0)} ms; ${navigation.cellSize} m grid`)
  assert.deepEqual(errors, [])
})

await check('NPC door traversal opens the real hinge and waits for physical clearance', () => {
  const door = doors.find(object => object.name === 'Detention entrance')!
  assert(door)
  setDoorOpen(door, false, true); world.refresh()
  let position = navigation.floor(v(117, 0.12, -7))!
  const destination = navigation.floor(v(117, 0, -2))!
  const path = navigation.plan(position, destination)
  assert(path.length)
  for (let i = 0; i < 260 && position.distanceTo(destination) > 0.1; i++) {
    updateDoors(doors, 1 / 60); world.refresh()
    while (path.length > 1 && position.distanceTo(path[0]) < 0.16) path.shift()
    const next = navigation.step(position, path[0] ?? destination, 1.4 / 60)
    if (next) position = next
  }
  assert(door.userData.open)
  assert(position.distanceTo(destination) < 0.14, `stopped at ${position.toArray()}`)
})

const fakeActor = async () => {
  const root = new THREE.Group()
  return { root, update() {}, shoot() {}, react() {}, restore() {}, dispose() { root.removeFromParent() },
    muzzle: () => root.position.clone().add(v(0, 1.3, 0.5)), animationTime: 0 } as unknown as EnemyActor
}

await check('Solid cover blocks live detection and shots while hearing uses the obstructed radius', async () => {
  const room = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2
  const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 4, 0.4), new THREE.MeshBasicMaterial())
  wall.position.set(0, 2, 5)
  room.add(floor, wall)
  const collision = new CollisionWorld(room)
  let damage = 0
  const director = new EnemyDirector({ scene: room, world: collision, doors: [],
    specs: [{ id: 'covered', name: 'Covered guard', position: [0, 0, 0], patrol: [], weapon: 'ak' }],
    emit: () => {}, damagePlayer: amount => { damage += amount }, dropWeapon: () => {} }, fakeActor)
  await director.init()
  const player: PlayerSense = { feet: v(0, 0, 10), eye: v(0, 1.65, 10), velocity: v(0), alive: true, radioEnabled: true }
  for (let frame = 0; frame < 180; frame++) director.update(1 / 60, player)
  assert.equal(director.enemies[0].state, 'guard'); assert.equal(damage, 0)
  director.hear({ kind: 'footstep', position: player.feet, radius: 15 })
  assert.equal(director.enemies[0].state, 'guard')
  director.hear({ kind: 'shot', position: player.feet, radius: 30 })
  assert.equal(director.enemies[0].state, 'investigate')
  assert.equal(director.enemies[0].suspicion, 0.25)
  const prior = director.snapshot()
  director.hear({ kind: 'enemy-reload', position: player.feet, radius: 30 })
  assert.deepEqual(director.snapshot(), prior, 'enemy events cannot recursively trigger hearing')
  director.dispose(); collision.dispose()
})

await check('All ordinary guards complete real patrol loops; the reserve detail exits the crew-house doors', async () => {
  const director = new EnemyDirector({ scene, world, doors, specs: mission.enemies, emit: () => {}, damagePlayer: () => {}, dropWeapon: () => {} }, fakeActor)
  await director.init()
  const player: PlayerSense = { feet: v(-240, 0, -140), eye: v(-240, 1.65, -140), velocity: v(0), alive: true, radioEnabled: false }
  const initial = director.snapshot()
  director.hear({ kind: 'shot', position: v(-7, 0, -46), radius: 120 })
  director.update(0.05, player)
  const pending = director.snapshot()
  assert(pending.some(enemy => enemy.planning), 'complex investigations must queue resumable work')
  director.restore(pending)
  assert.deepEqual(director.snapshot(), pending, 'pending requests restart from checkpoint without stale results')
  director.restore(initial)
  assert(director.snapshot().every(enemy => !enemy.planning), 'restoring an earlier checkpoint discards later navigation jobs')
  const started = performance.now()
  for (let frame = 0; frame < 280 * 20; frame++) {
    if (frame === 20 * 60) director.activateReserves(true, v(149, 0.12, -45.8))
    updateDoors(doors, 0.05); world.refresh(); director.update(0.05, player)
  }
  console.log(`280 s patrol simulation ${(performance.now() - started).toFixed(0)} ms`, director.enemies.map(enemy => `${enemy.spec.id}:${enemy.visitedWaypoints}/${enemy.pathFailures}`).join(' '))
  const failed = director.enemies.filter(enemy => enemy.spec.role !== 'sniper' && enemy.visitedWaypoints < enemy.spec.patrol.length).map(enemy => ({ id: enemy.spec.id, visited: enemy.visitedWaypoints, position: enemy.position.toArray(), waypoint: enemy.waypoint, stuck: enemy.stuck, pathFailures: enemy.pathFailures }))
  assert.deepEqual(failed, [])
  director.dispose()
})

await check('Live director reacts immediately and obeys last-known search, bounded communication, death/drop and restore', async () => {
  const sandbox = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2; sandbox.add(floor)
  const testWorld = new CollisionWorld(sandbox)
  const specs: EnemySpec[] = [
    { id: 'a', name: 'A', position: [0, 0, 0], patrol: [], weapon: 'pistol', facing: 0 },
    { id: 'b', name: 'B', position: [15, 0, 0], patrol: [], weapon: 'pistol', facing: Math.PI },
    { id: 'c', name: 'C', position: [90, 0, 0], patrol: [], weapon: 'pistol', facing: Math.PI },
    { id: 'r', name: 'R', position: [-10, 0, 0], patrol: [[-10, 0, 0], [-10, 0, 5]], weapon: 'ak', reserve: true },
  ]
  const events: SoundEvent[] = [], drops: WeaponItem[] = []
  let damage = 0
  const director = new EnemyDirector({ scene: sandbox, world: testWorld, doors: [], specs,
    emit: event => events.push(event), damagePlayer: amount => { damage += amount }, dropWeapon: item => drops.push(item) }, fakeActor)
  await director.init()
  const player: PlayerSense = { feet: v(0, 0, 12), eye: v(0, 1.65, 12), velocity: v(0), alive: true, radioEnabled: false }
  const advance = (seconds: number) => { for (let i = 0; i < seconds * 60; i++) director.update(1 / 60, player) }
  advance(0.75)
  assert.equal(director.enemies[0].shots, 0, 'visual acquisition must allow time to aim')
  advance(0.5)
  assert.equal(director.enemies[0].state, 'combat'); assert(director.enemies[0].shots > 0, 'clear sight must produce prompt fire')
  assert(['investigate', 'suspicious', 'combat'].includes(director.enemies[1].state), 'near ally investigates communicated contact and may then see it')
  assert.equal(director.enemies[2].state, 'guard', 'far guard must not receive a magical global alert')
  const saved = director.snapshot()
  player.feet.set(0, 0, -50); player.eye.set(0, 1.65, -50)
  advance(1.8)
  assert.equal(director.enemies[0].state, 'investigate')
  assert(director.enemies[0].lastKnown!.z > 0, 'lost guard may only pursue observed contact')
  advance(20)
  assert(['guard', 'patrol'].includes(director.enemies[0].state), 'search must expire')
  director.restore(saved)
  assert.deepEqual(director.snapshot(), saved, 'checkpoint restores meaningful clocks, PRNG and routes')
  // Combat tactics move the guard off its post; aim at where it actually stands.
  const origin = v(0, 1.2, -5)
  const shot = { origin, direction: director.enemies[0].position.clone().setY(1.2).sub(origin).normalize(), range: 20, damage: 34 }
  assert(!director.hit(shot, 2), 'world-clipped ray must reject a body behind cover')
  assert(director.hit(shot, 20)); assert(director.hit(shot, 20)); assert(director.hit(shot, 20))
  assert.equal(director.enemies[0].state, 'dead'); assert.equal(drops.length, 1)
  director.hit(shot, 20); assert.equal(drops.length, 1)
  const dead = director.snapshot(); director.restore(dead); assert.equal(drops.length, 1)
  director.activateReserves(false, v(0, 0, 10)); assert.notEqual(director.enemies[3].state, 'reserve')
  assert(events.some(event => event.kind === 'callout'))
  director.dispose(); testWorld.dispose()
})

world.dispose()
if (failures) process.exitCode = 1
