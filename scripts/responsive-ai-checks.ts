import assert from 'node:assert/strict'
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EnemyDirector } from '../src/game/ai'
import { EnemyActor } from '../src/game/actors'
import { ENEMY_COMBAT } from '../src/game/balance'
import { CollisionWorld } from '../src/player/collision'
import type { PlayerSense, SoundEvent, WeaponName } from '../src/game/types'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
async function fixture(weapon: WeaponName = 'ak', count = 1, real = false) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(80, 1, 0.5), new THREE.MeshBasicMaterial())
  barrier.userData.doorHinge = true; barrier.position.set(500, 0, 6); scene.add(barrier)
  const world = new CollisionWorld(scene), events: SoundEvent[] = []
  let damage = 0
  const ai = new EnemyDirector({ scene, world, doors: [], specs: Array.from({ length: count }, (_, i) => ({ id: `${i}`, name: `${i}`, position: [i * 3, 0, 0], patrol: [], weapon, role: weapon === 'sniper' ? 'sniper' : 'guard' })), emit: e => events.push(e), damagePlayer: n => { damage += n }, dropWeapon() {} }, real ? undefined : async () => {
    const root = new THREE.Group()
    return { root, reactionRemaining: 0, animationTime: 0, update() {}, shoot() {}, restore() {}, dispose() {}, muzzle: () => root.position.clone().add(v(0, 1.4, 0.3)) } as unknown as EnemyActor
  })
  await ai.init()
  const player: PlayerSense = { feet: v(0, 0, 12), eye: v(0, 1.65, 12), velocity: v(), alive: true, radioEnabled: false }
  const step = (seconds: number, dt = 1 / 60) => { for (let t = 0; t < seconds - 1e-8; t += dt) ai.update(dt, player) }
  const wall = (height: number, z = 6) => { barrier.scale.y = height; barrier.position.set(0, height / 2, z); world.refresh(); return barrier }
  return { ai, enemy: ai.enemies[0], player, scene, world, events, step, wall, damage: () => damage, dispose() { ai.dispose(); world.dispose() } }
}

for (const weapon of ['pistol', 'ak', 'smg', 'sniper'] as const) {
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    const f = await fixture(weapon)
    f.enemy.senseTimer = 0.08
    let time = 0
    while (!f.enemy.shots && time < 1.5) { f.ai.update(dt, f.player); time += dt }
    assert(time >= 0.8 && time <= 1.3, `${weapon} first shot: ${time}s at ${1 / dt}fps`)
    assert.equal(f.enemy.state, 'combat')
    assert.equal(f.enemy.distanceWalked, 0, 'engage before repositioning')
    assert(f.enemy.settledFor >= ENEMY_COMBAT.settle)
    f.dispose()
  }
}
console.log('PASS All weapons acquire and shoot after at least 800ms and within 1.3s at 30/60/144fps')
for (const weapon of ['pistol', 'ak', 'smg', 'shotgun', 'sniper'] as const) {
  const f = await fixture(weapon)
  const range = weapon === 'sniper' ? ENEMY_COMBAT.sniperEngagedRange : ENEMY_COMBAT.engagedRange
  f.player.feet.z = f.player.eye.z = range
  f.ai.hear({ kind: 'shot-ak', position: f.player.eye.clone(), radius: 8 })
  f.step(1.35)
  const reports = f.events.filter(event => event.kind === `enemy-shot-${weapon}`)
  assert(reports.length > 0, `${weapon} returns fire at its maximum engagement range`)
  assert.equal(reports.length, f.enemy.shots, 'Every fired round emits its own weapon report')
  for (const report of reports) {
    assert(report.position!.distanceTo(f.player.eye) < report.radius!, 'The muzzle report reaches the player receiving its bullets')
    assert(report.radius! >= range + 10, 'Audio range leaves room for elevated or offset muzzles')
  }
  f.dispose()
}
console.log('PASS Every enemy weapon reports each shot throughout its full engagement range, including 60 m ordinary guards and 110 m snipers')
{
  const f = await fixture('ak', 44)
  const e = f.ai.enemies[43]
  f.player.feet.x = f.player.eye.x = e.position.x
  f.step(1.2)
  assert(e.shots > 0, 'late roster entries must not have a multi-frame startup disadvantage')
  f.dispose()
}
console.log('PASS Last guard in a 44-enemy roster reacts as promptly as the first')
{
  const f = await fixture()
  f.step(1.2); const before = f.enemy.shots
  f.enemy.tacticTimer = 20
  f.player.velocity.set(3, 0, 0)
  for (let i = 0; i < 180; i++) { f.player.feet.x += 0.05; f.player.eye.x += 0.05; f.ai.update(1 / 60, f.player) }
  assert(f.enemy.shots - before >= 8, `tracking only fired ${f.enemy.shots - before}`)
  assert.equal(f.enemy.moveSpeed, 0)
  assert(f.damage() >= 27, 'standing exposed must be dangerous')
  f.dispose()
}
console.log('PASS Continuous lateral tracking retains sustained fire and meaningful accuracy')
{
  const f = await fixture()
  f.player.feet.z = f.player.eye.z = 5
  Object.assign(f.enemy, { state: 'combat', lastKnown: f.player.feet.clone(), tactic: 'flank', tacticPoint: v(8, 0, 5), tacticTimer: 7 })
  f.step(1.05)
  assert.equal(f.enemy.tactic, 'hold')
  assert(f.enemy.shots > 0, 'A close exposed threat must interrupt an ongoing flank')
  assert.equal(f.enemy.moveSpeed, 0)
  f.dispose()
}
console.log('PASS Close contact interrupts repositioning, plants the guard and aims before firing')
{
  const f = await fixture()
  f.wall(4); f.step(1)
  assert.equal(f.enemy.shots, 0); assert.equal(f.enemy.lastKnown, null); assert.equal(f.damage(), 0)
  assert(!f.events.some(e => e.kind === 'enemy-bullet-whiz'))
  f.dispose()
  const g = await fixture()
  g.wall(1.4); g.step(1.2)
  assert(g.enemy.shots > 0, 'low cover must not make an exposed head untargetable')
  g.dispose()
}
console.log('PASS Solid walls block contact and damage; exposed heads over low cover are targetable')
{
  const f = await fixture('ak', 2)
  const ally = f.ai.enemies[1]
  ally.position.set(0, 0, 6); ally.actor.root.position.copy(ally.position)
  // Keep the teammate stationary while testing its physical firing-lane obstruction.
  ally.hitPause = 10; ally.senseTimer = 10; ally.canSee = false
  f.step(1.05)
  assert.equal(f.enemy.shots, 0); assert.equal(f.enemy.burst, 0); assert.equal(f.enemy.magazine, 30)
  ally.position.x = 4; ally.actor.root.position.copy(ally.position)
  f.step(0.1)
  assert(f.enemy.shots > 0, 'cleared lane must not wait through a phantom burst cooldown')
  f.dispose()
  const g = await fixture('ak', 2)
  const blocker = g.ai.enemies[1]
  blocker.position.set(0, 0, 6); blocker.actor.root.position.copy(blocker.position); blocker.hitPause = 10; blocker.senseTimer = 10
  g.step(1.5)
  assert.equal(g.enemy.tactic, 'peek', 'persistent teammate obstruction must trigger lateral repositioning')
  assert(g.enemy.tacticPoint && Math.abs(g.enemy.tacticPoint.x) > 0.5)
  g.dispose()
}
console.log('PASS Friendly blockers consume no rounds and trigger prompt retry or a separate firing lane')
{
  const f = await fixture()
  f.step(1.05)
  f.enemy.tacticTimer = 50
  const wall = f.wall(4)
  const shots = f.enemy.shots, damage = f.damage()
  f.step(0.5)
  assert.equal(f.enemy.shots, shots); assert.equal(f.damage(), damage)
  const known = f.enemy.lastKnown!.clone()
  f.player.feet.x = f.player.eye.x = 10; f.step(0.2)
  assert(f.enemy.lastKnown!.equals(known), 'hidden player motion cannot update remembered contact')
  wall.position.x = 500; f.world.refresh(); f.player.feet.x = f.player.eye.x = 0
  f.step(0.75); assert.equal(f.enemy.shots, shots, 'reacquisition must include a fresh aim delay')
  f.step(0.4); assert(f.enemy.shots > shots)
  const saved = f.ai.snapshot(); f.ai.restore(saved); assert.deepEqual(f.ai.snapshot(), saved)
  f.dispose()
}
console.log('PASS Fresh shot occlusion, last-seen memory, fast reacquisition and checkpoint restoration')
{
  const f = await fixture()
  Object.assign(f.ai, { random: () => 0.85 })
  f.step(1.2)
  assert.equal(f.damage(), 0)
  assert(f.events.some(e => e.kind === 'enemy-bullet-whiz'), 'close real misses should provide audible pressure')
  f.dispose()
}
console.log('PASS A close miss produces bullet flyby feedback without damage')

const originalLoad = GLTFLoader.prototype.loadAsync
const bytes = readFileSync('public/models/stickman.glb')
GLTFLoader.prototype.loadAsync = async function () { return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '') }
try {
  for (const weapon of ['pistol', 'ak', 'smg', 'sniper'] as const) {
    const f = await fixture(weapon, 1, true)
    let time = 0
    while (!f.enemy.shots && time < 1.5) { f.ai.update(1 / 60, f.player); time += 1 / 60 }
    assert(time >= 0.8 && time < 1.3, `Real ${weapon} muzzle delayed first shot until ${time}`)
    console.log(`PASS Loaded ${weapon} actor first shot ${(time * 1000).toFixed(0)}ms`)
    f.dispose()
  }
} finally { GLTFLoader.prototype.loadAsync = originalLoad }
