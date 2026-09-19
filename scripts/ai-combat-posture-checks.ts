import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { ActorPostureSnapshot, EnemyActor } from '../src/game/actors'
import type { Posture } from '../src/lab/postures'
import type { PlayerSense, Shot, SoundEvent, Vec3 } from '../src/game/types'
import type { HitReaction } from '../src/game/hit-reactions'
import { CollisionWorld } from '../src/player/collision'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const miss: Shot = { origin: v(0.65, 1.1, -20), direction: v(0, 0, 1), range: 40, damage: 10, weapon: 'pistol' }
async function fixture(options: { wall?: { position: Vec3; size: Vec3 }; floorSize?: number; floorOffset?: number; weapon?: 'shotgun' | 'ak'; protectedArea?: 'house' | 'tower' } = {}) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.BoxGeometry(options.floorSize ?? 200, 0.2, 200), new THREE.MeshBasicMaterial())
  floor.position.set(options.floorOffset ?? 0, -0.1, 0); scene.add(floor)
  if (options.wall) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(...options.wall.size), new THREE.MeshBasicMaterial())
    wall.position.set(...options.wall.position); scene.add(wall)
  }
  if (options.protectedArea) {
    const area = new THREE.Group()
    area.userData = options.protectedArea === 'house' ? { enterable: true, footprint: [12, 12] } :
      { kind: 'water-tower', deckHeight: 0, deckRadius: 5 }
    scene.add(area)
  }
  const world = new CollisionWorld(scene), events: SoundEvent[] = [], hits: HitReaction[] = []
  const fired: Posture[] = [], reactions: { clip: string; lethal: boolean; direction?: THREE.Vector3; scale?: number }[] = []
  let posture: Posture = 'stand', transition = 0, scan = false, drops = 0
  const root = new THREE.Group()
  const actor = {
    root, reactionRemaining: 0, animationTime: 0, deathClip: 'dieBody',
    get posture() { return posture }, get postureTransitionRemaining() { return transition },
    setPosture(next: Posture, scanning = false) {
      if (next === posture && !scan && !scanning && transition === 0) return
      transition = (posture === 'prone' && next !== 'prone' ? 0.76 : next === 'prone' ? 0.56 : next === 'kneel' ? 0.34 : 0.24) + (scanning ? 1.65 : 0)
      posture = next; scan = scanning
    },
    postureSnapshot() { return { posture, testTransition: transition, testScan: scan } },
    restore(_state: string, _time: number, death: string, saved?: ActorPostureSnapshot & { testTransition?: number; testScan?: boolean }) {
      posture = saved?.posture ?? 'stand'; transition = saved?.testTransition ?? 0; scan = saved?.testScan ?? false; actor.deathClip = death
    },
    update(dt: number) { transition = Math.max(0, transition - dt); actor.reactionRemaining = Math.max(0, actor.reactionRemaining - dt) },
    shoot() { assert.equal(transition, 0, 'No round fires during a posture transition'); fired.push(posture) },
    react(clip: string, lethal: boolean, direction?: THREE.Vector3, scale?: number) {
      reactions.push({ clip, lethal, direction: direction?.clone(), scale }); transition = 0
      actor.reactionRemaining = lethal ? 0 : 0.6
      if (lethal) actor.deathClip = clip
    },
    dispose() {}, eye: () => root.position.clone().add(v(0, posture === 'prone' ? 0.36 : posture === 'kneel' ? 1.06 : 1.5)),
    muzzle: () => root.position.clone().add(v(0, posture === 'prone' ? 0.31 : posture === 'kneel' ? 0.9 : 1.3, 0.3)),
  }
  const director = new EnemyDirector({ scene, world, doors: [], specs: [{ id: 'posture-guard', name: 'Posture guard', position: [0, 0, 0], patrol: [], weapon: options.weapon ?? 'ak', facing: 0 }],
    emit: event => events.push(event), damagePlayer() {}, dropWeapon() { drops++ }, onHit: hit => hits.push(hit) }, async () => actor as unknown as EnemyActor)
  await director.init()
  const enemy = director.enemies[0]
  const player: PlayerSense = { feet: v(-80, 0, -80), eye: v(-80, 1.65, -80), velocity: v(), alive: true, radioEnabled: false }
  const step = (seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) director.update(1 / 60, player) }
  const combat = (seed: number) => {
    player.feet.set(0, 0, 15); player.eye.set(0, 1.65, 15)
    Object.assign(enemy, { state: 'combat', lastKnown: player.feet.clone(), canSee: true, senseTimer: 0, tactic: 'hold', tacticTimer: 10,
      settledFor: 1, aimTime: 1, shotTimer: 0.7, burst: 2, random: seed })
  }
  return { director, enemy, player, actor, fired, reactions, hits, events, world, step, combat, drops: () => drops, dispose() { director.dispose(); world.dispose() } }
}

for (const [seed, expected] of [[0, 'crouch'], [700, 'prone'], [1200, 'kneel']] as const) {
  const f = await fixture(), e = f.enemy
  e.random = seed
  assert.equal(f.director.nearMiss(miss, 40), 1)
  assert.equal(f.actor.posture, expected)
  assert.equal(e.state, 'suspicious')
  assert(e.lastKnown!.distanceTo(miss.origin) > 9, 'A near miss only reveals its local passage')
  const initial = e.position.clone(), saved = f.director.snapshot()
  f.step(0.3); f.director.restore(saved)
  assert.deepEqual(f.director.snapshot(), saved, 'Active posture transitions and cooldown restore exactly')
  f.step(1)
  assert(e.position.equals(initial), 'Defensive reactions stay planted')
  for (let i = 0; i < 180; i++) { f.director.nearMiss(miss, 40); f.step(1 / 60) }
  assert.notEqual(e.state, 'suspicious')
  assert.equal(e.scanTimer, 0)
  if (expected === 'prone') assert.equal(f.actor.posture, 'prone', 'Investigation cannot cancel the prone hold after a short scan')
  // Let the finite defensive hold expire, without another round extending it.
  f.step(6)
  assert.equal(f.actor.posture, 'stand', 'Repeated missed rounds cannot hold a low stance indefinitely')
  f.dispose()
}
console.log('PASS All three near-miss reactions select deterministically, stay local, restore and recover under repeated fire')

for (const [seed, expected] of [[0, 'crouch'], [700, 'prone'], [1200, 'kneel']] as const) {
  const f = await fixture(); f.combat(seed)
  const e = f.enemy, known = e.lastKnown!.clone(), pause = e.shotTimer, aim = e.aimTime, burst = e.burst
  assert.equal(f.director.nearMiss(miss, 40), 1)
  assert.equal(e.state, 'combat'); assert.equal(e.scanTimer, 0)
  assert(e.lastKnown!.equals(known)); assert.equal(e.shotTimer, pause); assert.equal(e.aimTime, aim); assert.equal(e.burst, burst)
  f.step(0.2); assert.equal(e.shots, 0)
  f.step(1.1)
  assert(f.fired.includes(expected), `${expected} must support real AI shots after transition and settle`)
  assert.equal(f.actor.posture, expected)
  if (expected === 'prone') {
    f.step(3.7)
    assert.equal(f.actor.posture, 'prone', 'Prone survives beyond the former three-second pop-up')
    assert(f.fired.filter(posture => posture === 'prone').length >= 4, 'Prone must return sustained fire')
  }
  f.step(8); assert.equal(f.actor.posture, 'stand')
  f.dispose()
}
console.log('PASS Crouch, prone and kneeling combat retain reaction/burst fairness and return fire from the settled stance')

{
  const f = await fixture(); f.combat(700); f.director.nearMiss(miss, 40); f.step(0.9)
  const start = f.enemy.position.clone()
  f.player.feet.set(-80, 0, -80); f.player.eye.set(-80, 1.65, -80)
  Object.assign(f.enemy, { state: 'investigate', canSee: false, senseTimer: 100, lastKnown: v(0, 0, 8) })
  f.step(0.3)
  assert(f.enemy.position.equals(start), 'Investigation cannot cancel the minimum prone hold')
  assert.equal(f.actor.posture, 'prone')
  const remaining = f.enemy.defensiveTimer
  f.step(remaining + 0.1)
  assert.equal(f.actor.posture, 'stand')
  assert(f.enemy.position.equals(start), 'Standing transition blocks navigation without prone sliding')
  f.step(1.5); assert(f.enemy.position.distanceTo(start) > 0.5, 'Navigation resumes after rising')
  f.dispose()
}
console.log('PASS Movement rises from prone, waits for transition and resumes without sliding')

for (const options of [
  { wall: { position: [-0.9, 1, 0] as Vec3, size: [0.2, 2, 8] as Vec3 } },
  { floorSize: 20, floorOffset: 9.4 },
]) {
  const f = await fixture(options); f.enemy.random = 700
  assert.equal(f.director.nearMiss(miss, 40), 1)
  assert.notEqual(f.actor.posture, 'prone', 'A wall or unsupported edge prohibits sprawling')
  f.dispose()
}
console.log('PASS Narrow spaces and platform edges choose a supported compact defensive stance')

for (const protectedArea of ['house', 'tower'] as const) {
  const f = await fixture({ protectedArea }); f.enemy.random = 700
  assert.equal(f.director.nearMiss(miss, 40), 1)
  assert.notEqual(f.actor.posture, 'prone', 'A spacious indoor room or tower must never choose prone')
  f.dispose()
}
for (const distance of [2, 8, 13]) {
  const f = await fixture(); f.enemy.random = 700
  assert.equal(f.director.nearMiss({ ...miss, origin: v(0.65, 1.1, -distance) }, 40), 1)
  assert.notEqual(f.actor.posture, 'prone', `A near miss from ${distance}m cannot trigger prone`)
  f.dispose()
}
{
  const f = await fixture({ wall: { position: [0, 3, 0], size: [12, 0.2, 12] } }); f.enemy.random = 700
  f.director.nearMiss(miss, 40)
  assert.notEqual(f.actor.posture, 'prone', 'A ceiling excludes rooms without area metadata')
  f.dispose()
}
{
  const f = await fixture(); f.combat(700); f.director.nearMiss(miss, 40); f.step(1)
  f.player.feet.set(15, 0, 15); f.player.eye.set(15, 1.65, 15)
  f.step(0.5)
  assert.equal(f.actor.posture, 'prone', 'A large tracking turn cannot force an immediate stand-up')
  f.dispose()
}
console.log('PASS Close threats, indoor rooms and towers exclude prone; large turns respect its minimum hold')

{
  const f = await fixture({ wall: { position: [0, 0.6, 6], size: [8, 1.2, 0.3] } }); f.combat(700)
  f.director.nearMiss(miss, 40); f.step(1.1)
  assert.equal(f.actor.posture, 'prone'); assert(!f.enemy.canSee, 'Prone sight must originate at the animated head below cover')
  assert.equal(f.enemy.shots, 0, 'Low pose cannot see or fire from the old standing eye')
  f.dispose()
}
console.log('PASS Low cover blocks prone perception and shooting at the actual head and muzzle height')

for (const wall of [false, true]) {
  const f = await fixture(wall ? { wall: { position: [0, 1, 1.1], size: [8, 2, 0.2] } } : {})
  const shot: Shot = { origin: v(0, 1.1, -4), direction: v(0, 0, 1), range: 20, damage: 500, weapon: 'shotgun', pelletIndex: 0 }
  assert(f.director.hit(shot, 20))
  assert.equal(f.reactions[0].clip, 'dieShotgun'); assert(f.reactions[0].direction!.equals(shot.direction))
  assert.equal(f.hits[0].weapon, 'shotgun'); assert.equal(f.hits[0].targetId, f.enemy.spec.id)
  assert.equal(f.reactions[0].scale! < 1, wall, 'Shotgun travel is limited before solid cover')
  for (let i = 1; i < 8; i++) assert.equal(f.director.hit({ ...shot, pelletIndex: i }, 20), false)
  assert.equal(f.reactions.length, 1); assert.equal(f.drops(), 1)
  assert.equal(f.events.filter(event => event.kind === 'enemy-down').length, 1)
  f.dispose()
}
console.log('PASS Shotgun deaths carry direction and weapon, stop before walls and emit one death/drop across pellets')

{
  const f = await fixture({ weapon: 'shotgun' }); f.combat(1200); f.director.nearMiss(miss, 40)
  f.enemy.magazine = 0; f.step(0.5)
  assert.equal(f.events.find(event => event.kind === 'enemy-reload')?.weapon, 'shotgun')
  assert.equal(f.enemy.shots, 0)
  f.dispose()
}
console.log('PASS Low-stance shotgun reloads preserve firing lockout and emit weapon-specific sound metadata')
