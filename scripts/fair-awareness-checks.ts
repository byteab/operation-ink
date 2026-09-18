import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { ENEMY_COMBAT } from '../src/game/balance'
import { CollisionWorld } from '../src/player/collision'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import { PlayerBody } from '../src/player/body'
import type { PlayerSense, SoundEvent } from '../src/game/types'
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const actor = async () => {
  const root = new THREE.Group()
  return { root, reactionRemaining: 0, animationTime: 0, update() {}, shoot() {}, restore() {}, react() {}, dispose() {}, muzzle: () => root.position.clone().add(v(0, 1.4, 0.3)) } as unknown as EnemyActor
}
async function fixture(sniper = false, facing = 0) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(100, 8, 0.5), new THREE.MeshBasicMaterial())
  wall.userData.doorHinge = true; wall.position.set(500, 4, 6); scene.add(wall)
  const world = new CollisionWorld(scene), events: SoundEvent[] = []
  const ai = new EnemyDirector({ scene, world, doors: [], specs: [{ id: 'test', name: 'Test', position: [0, 0, 0], patrol: [], weapon: sniper ? 'sniper' : 'ak', role: sniper ? 'sniper' : 'guard', facing }], emit: e => events.push(e), damagePlayer() {}, dropWeapon() {} }, actor)
  await ai.init()
  const distance = sniper ? 85 : 45
  const player: PlayerSense = { feet: v(0, 0, distance), eye: v(0, 1.65, distance), velocity: v(), alive: true, radioEnabled: false }
  const step = (seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) ai.update(1 / 60, player) }
  return { ai, enemy: ai.enemies[0], world, wall, events, player, step, dispose() { ai.dispose(); world.dispose() } }
}
for (const sniper of [false, true]) {
  const f = await fixture(sniper)
  f.step(3)
  assert.equal(f.enemy.shots, 0); assert.equal(f.enemy.state, 'guard'); assert.equal(f.enemy.lastKnown, null)
  f.player.feet.x = f.player.eye.x = 0.65
  assert.equal(f.ai.nearMiss({ origin: f.player.eye.clone(), direction: v(0, 0, -1), range: 100, damage: 10 }, 100), 1)
  assert(f.enemy.scanTimer > 0, 'actual missed bullet triggers a local scan first')
  assert(!f.events.some(e => e.voice === 'spot' || e.voice === 'contact'))
  f.ai.hear({ kind: 'shot-pistol', position: f.player.eye.clone(), radius: 8 })
  assert.equal(f.enemy.scanTimer, 0, 'visible muzzle overrides the local scan')
  assert(f.enemy.contactMemory > 0, 'visible distant muzzle grants personal contact even outside audio range')
  f.step(1.3)
  assert(f.enemy.shots > 0, 'a visible missed shot lets a distant guard return fire')
  const saved = f.ai.snapshot(); f.ai.restore(saved); assert.deepEqual(f.ai.snapshot(), saved)
  f.wall.position.x = 0; f.world.refresh()
  const shots = f.enemy.shots; f.step(0.5)
  assert.equal(f.enemy.shots, shots, 'provocation never bypasses walls')
  f.dispose()
}
console.log('PASS Distant guards/snipers ignore an unprovoked player, respond to visible missed shots, respect cover and restore awareness')
{
  const f = await fixture(true)
  f.step(0.1)
  const shot = { origin: f.player.eye.clone(), direction: v(0, -0.005, -1).normalize(), range: 100, damage: 1 }
  assert(f.ai.hit(shot, 100))
  assert(f.enemy.contactMemory > 0)
  f.step(1.3)
  assert(f.enemy.shots > 0, 'a wounded distant sniper can acquire the shooter after reacting')
  f.wall.position.x = 0; f.world.refresh(); f.step(ENEMY_COMBAT.contactMemory + 1)
  assert.equal(f.enemy.contactMemory, 0)
  const shots = f.enemy.shots
  f.wall.position.x = 500; f.world.refresh(); f.step(1)
  assert.equal(f.enemy.shots, shots, 'expired long-range knowledge does not grant permanent awareness')
  f.dispose()
}
console.log('PASS Hits enable long-range retaliation; breaking sight expires contact instead of granting permanent tracking')
for (const facing of [0, Math.PI]) {
  const f = await fixture(true, facing)
  if (facing === 0) { f.wall.position.x = 0; f.world.refresh() }
  f.step(0.1)
  f.ai.hear({ kind: 'shot-pistol', position: f.player.eye.clone(), radius: 240 })
  assert.equal(f.enemy.contactMemory, 0, 'unseen shot is hearing, not visual confirmation')
  assert(!f.events.some(e => e.voice === 'spot' || e.voice === 'contact'))
  f.step(1)
  assert.equal(f.enemy.shots, 0)
  f.dispose()
}
console.log('PASS Hearing shots through a wall or behind the guard grants no distant sight and no detection bark')
{
  const f = await fixture()
  f.player.feet.z = f.player.eye.z = 8
  f.wall.position.x = 0; f.world.refresh()
  f.step(0.1)
  f.ai.hear({ kind: 'footstep', position: f.player.feet.clone(), radius: 24 })
  assert.equal(f.enemy.state, 'investigate')
  assert(!f.enemy.canSee && f.enemy.contactMemory === 0)
  assert(!f.events.some(e => e.voice === 'spot' || e.voice === 'contact'))
  assert(f.events.some(e => e.voice === 'search'), 'hearing retains investigation captions')
  f.dispose()
}
console.log('PASS Indoor hearing can investigate footsteps without claiming to see the player')
{
  const f = await fixture()
  f.enemy.state = 'investigate'; f.enemy.suspicion = 0.8; f.enemy.lastKnown = f.player.feet.clone()
  f.step(0.1)
  assert(!f.enemy.canSee && f.enemy.contactMemory === 0, 'a radio report alone cannot extend sight range')
  f.dispose()
}
console.log('PASS Shared or investigated locations do not grant personal long-range target confirmation')

const scene = new THREE.Scene(), compound = createCompound(), mission = createMissionWorld()
prepareCompound(compound); scene.add(compound, mission.root); scene.updateMatrixWorld(true)
const world = new CollisionWorld(scene), doors: THREE.Group[] = [], events: SoundEvent[] = []
scene.traverse(object => { if (object.userData.kind === 'door') doors.push(object as THREE.Group) })
const ai = new EnemyDirector({ scene, world, doors, specs: mission.enemies, emit: e => events.push(e), damagePlayer() {}, dropWeapon() {} }, actor)
await ai.init()
const player: PlayerSense = { feet: new THREE.Vector3(...mission.spawn), eye: new THREE.Vector3(...mission.spawn).add(v(0, 1.65)), velocity: v(), alive: true, radioEnabled: true }
assert(player.feet.z < -60 && player.feet.x > -47, 'insertion belongs behind the north wall of the mess hall')
const body = new PlayerBody(world)
body.teleport(player.feet)
for (let i = 0; i < 30 * 20; i++) { body.update(0.05, v(), false); ai.update(0.05, player) }
assert(Math.abs(body.position.y) < 0.2 && body.position.distanceTo(player.feet) < 0.3, 'spawn is supported and clear')
assert(ai.enemies.every(e => e.shots === 0 && e.state !== 'combat'), 'standing still at insertion must not expose the player')
assert(!events.some(e => e.voice === 'spot' || e.voice === 'contact'))
// Walk from the rear wall around its west corner to the old ladder forecourt.
for (const destination of [v(-50, 0, -61), v(-52.1, 0, -51.35)]) {
  for (let i = 0; i < 700 && Math.hypot(body.position.x - destination.x, body.position.z - destination.z) > 0.2; i++) {
    body.update(1 / 60, destination.clone().sub(body.position).setY(0).normalize(), false)
  }
  assert(Math.hypot(body.position.x - destination.x, body.position.z - destination.z) < 0.3, 'rear insertion must have a clear walking exit')
}
console.log('PASS Actual-map rear insertion stays unspotted for 30 seconds and has a walkable route to the ladder')
// Check actual wall occlusion, with each indoor observer deliberately facing an outside passerby.
const initial = ai.snapshot()
let checks = 0
for (const id of ['mess-kitchen', 'mess-vestibule', 'mess-east-aisle', 'warehouse-west-aisle', 'warehouse-east-aisle']) {
  for (const point of (id.startsWith('warehouse') ? [[10, 0.03, -17], [40, 0.03, -17]] : [[-50, 0.03, -55], [-50, 0.03, -50], [-40, 0.03, -60]])) {
    ai.restore(initial)
    const enemy = ai.enemies.find(e => e.spec.id === id)!
    const eye = enemy.position.clone().add(v(0, 1.5))
    player.feet.fromArray(point); player.eye.copy(player.feet).add(v(0, 1.65))
    if (world.visible(eye, player.eye, new THREE.Object3D()) || world.visible(eye, player.feet.clone().add(v(0, 0.95)), new THREE.Object3D())) continue
    for (const other of ai.enemies) other.state = 'reserve'
    Object.assign(enemy, { state: 'guard', senseTimer: 0, contactMemory: 0, shots: 0, yaw: Math.atan2(player.feet.x - enemy.position.x, player.feet.z - enemy.position.z) })
    events.length = 0
    ai.update(1 / 60, player)
    assert(!enemy.canSee && enemy.state !== 'combat' && enemy.shots === 0)
    assert(!events.some(e => e.voice === 'spot' || e.voice === 'contact'))
    checks++
  }
}
assert(checks >= 10, `only ${checks} blocked exterior sightlines exercised`)
console.log(`PASS ${checks} actual mess-hall/warehouse wall sightlines reject outside passersby and detection barks`)
ai.dispose(); world.dispose()
