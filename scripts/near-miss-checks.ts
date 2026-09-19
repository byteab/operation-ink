import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import type { PlayerSense, Shot, Vec3 } from '../src/game/types'
import { CollisionWorld } from '../src/player/collision'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const shot: Shot = { origin: v(0, 1.1, 0), direction: v(0, 0, 1), range: 50, damage: 10, weapon: 'pistol' }
async function fixture(positions: Vec3[], wall?: { position: Vec3; size: Vec3 }) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.BoxGeometry(200, 0.2, 200), new THREE.MeshBasicMaterial())
  floor.position.y = -0.1; scene.add(floor)
  if (wall) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...wall.size), new THREE.MeshBasicMaterial())
    mesh.position.set(...wall.position); scene.add(mesh)
  }
  const world = new CollisionWorld(scene)
  let damage = 0
  const director = new EnemyDirector({ scene, world, doors: [], specs: positions.map((position, i) => ({
    id: `near-${i}`, name: `Near guard ${i}`, position, weapon: 'ak', patrol: [], facing: 0,
  })), emit() {}, damagePlayer() { damage++ }, dropWeapon() {} }, async () => {
    const root = new THREE.Group()
    return { root, update() {}, restore() {}, dispose() {}, react() {}, shoot() {}, reactionRemaining: 0, animationTime: 0,
      muzzle: () => root.position.clone().add(v(0, 1.3, 0)) } as unknown as EnemyActor
  })
  await director.init()
  const player: PlayerSense = { feet: v(-80, 0, -80), eye: v(-80, 1.65, -80), velocity: v(), alive: true, radioEnabled: false }
  const step = (seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) director.update(1 / 60, player) }
  return { director, world, player, step, damage: () => damage, dispose() { director.dispose(); world.dispose() } }
}

{
  const f = await fixture([[0.65, 0, 10]])
  const e = f.director.enemies[0], health = e.health
  assert.equal(f.director.nearMiss(shot, 50), 1)
  assert.equal(e.state, 'suspicious'); assert.equal(e.actor.root.userData.alertScan, 0)
  assert(e.lastKnown!.distanceTo(v(0, e.position.y, 10)) < 0.001)
  assert(e.lastKnown!.distanceTo(shot.origin) > 9, 'Near miss does not supply muzzle coordinates')
  f.director.hear({ kind: 'shot-pistol', position: shot.origin, radius: 38 })
  assert.equal(e.state, 'suspicious', 'Following shot audio must not skip scan')
  assert(e.lastKnown!.distanceTo(shot.origin) > 9)
  const initial = e.position.clone(), timer = e.scanTimer
  f.step(0.5)
  assert(e.position.equals(initial), 'Guard scans in place before investigating')
  assert(Math.abs(e.yaw) > 0.1, 'Suspicious guard visibly looks around')
  assert(e.scanTimer < timer && e.scanTimer > 0)
  const saved = f.director.snapshot()
  f.step(0.2); f.director.restore(saved)
  assert.deepEqual(f.director.snapshot(), saved, 'Checkpoint includes suspicion scan and cooldown state')
  assert.equal(e.actor.root.userData.alertScan, 1 - e.scanTimer / e.scanDuration)
  for (let i = 0; i < 130; i++) { f.director.nearMiss(shot, 50); f.step(1 / 60) }
  assert.equal(e.scanTimer, 0, 'Repeated rounds do not indefinitely pin the guard in scan')
  assert.notEqual(e.state, 'suspicious')
  assert.equal(e.health, health); assert.equal(f.damage(), 0)
  f.dispose()
  console.log('PASS local near miss scans before investigation, audio ordering, no damage, repeated-shot cooldown, checkpoint restore')
}
for (const [label, positions, wall] of [
  ['distant shot', [[2, 0, 10]], undefined],
  ['wall stops bullet first', [[0.65, 0, 10]], { position: [0, 1.5, 6], size: [4, 3, 0.3] }],
  ['nearby bullet separated by wall', [[0.65, 0, 10]], { position: [0.32, 1.5, 10], size: [0.12, 3, 3] }],
  ['bullet stops in earlier enemy', [[0, 0, 6], [0.65, 0, 10]], undefined],
] as [string, Vec3[], { position: Vec3; size: Vec3 } | undefined][]) {
  const f = await fixture(positions, wall)
  assert.equal(f.director.nearMiss(shot, 50), 0, label)
  assert(f.director.enemies.every(e => e.scanTimer === 0 && e.state === 'guard'))
  f.dispose(); console.log(`PASS ${label}`)
}
{
  const f = await fixture([[0.65, 0, 4], [0.65, 0, 8], [0.65, 0, 12]])
  f.director.enemies[0].health = 0; f.director.enemies[0].state = 'dead'
  f.director.enemies[1].state = 'reserve'
  f.director.enemies[2].state = 'combat'
  assert.equal(f.director.nearMiss(shot, 50), 1)
  const combatant = f.director.enemies[2]
  assert.equal(combatant.state, 'combat')
  assert.equal(combatant.scanTimer, 0)
  assert(combatant.defensiveTimer > 0, 'Combatants may take a defensive stance without restarting suspicion')
  f.dispose(); console.log('PASS dead guards and reserves ignore misses; combatants defend without suspicion scans')
}
{
  const f = await fixture([[0.65, 0, 10]])
  const e = f.director.enemies[0]
  f.director.nearMiss(shot, 50)
  f.player.feet.set(0.65, 0, 15); f.player.eye.set(0.65, 1.65, 15)
  e.senseTimer = 0; f.step(1 / 60)
  assert(e.canSee && e.scanTimer === 0, 'Actual sight interrupts scan')
  assert(e.lastKnown!.distanceTo(f.player.feet) < 0.001)
  f.dispose(); console.log('PASS real line of sight can identify the player and end the scan')
}
