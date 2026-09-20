import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EnemyDirector } from '../src/game/ai'
import { EnemyActor } from '../src/game/actors'
import { ENEMY_COMBAT, ENEMY_HEALTH, hitDamage, WEAPON_RULES } from '../src/game/balance'
import { Player } from '../src/lab/player'
import { CollisionWorld } from '../src/player/collision'
import type { EnemySpec, PlayerSense, SoundEvent } from '../src/game/types'
import type { HitZone } from '../src/game/hit-reactions'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
let failures = 0
async function check(name: string, test: () => void | Promise<void>) {
  try { await test(); console.log(`PASS ${name}`) }
  catch (error) { failures++; console.error(`FAIL ${name}`, error) }
}

async function fixture(spec: Partial<EnemySpec> = {}, wall: boolean | number = false) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  if (wall) {
    const cover = new THREE.Mesh(new THREE.BoxGeometry(60, 20, 0.5), new THREE.MeshBasicMaterial())
    cover.position.set(0, 10, typeof wall === 'number' ? wall : 20); scene.add(cover)
  }
  const world = new CollisionWorld(scene)
  const events: SoundEvent[] = [], reactions: string[] = [], surfaces: THREE.Vector3[] = []
  let damage = 0, zone: HitZone = 'torso'
  const root = new THREE.Group()
  const actor = {
    root, reactionRemaining: 0, animationTime: 0, deathClip: 'dieBody',
    hitVolumes: { raycast: () => ({ distance: 5, point: root.position.clone().add(v(0, 1.2)), zone, bone: zone === 'arm' ? 'upper_arm.L' : undefined }) },
    update() {}, shoot() {}, react(clip: string) { reactions.push(clip) }, restore() {}, dispose() {},
    muzzle: () => root.position.clone().add(v(0, 1.4, 0.3)),
  } as unknown as EnemyActor
  const director = new EnemyDirector({ scene, world, doors: [], specs: [{ id: 'test', name: 'Test', position: [0, 0, 0], patrol: [], weapon: 'pistol', facing: 0, ...spec }],
    emit: event => events.push(event), damagePlayer: amount => { damage += amount }, dropWeapon() {}, onSurfaceHit: point => surfaces.push(point.clone()) }, async () => actor)
  await director.init()
  const player: PlayerSense = { feet: v(0, 0, 30), eye: v(0, 1.65, 30), velocity: v(), alive: true, radioEnabled: false }
  const advance = (seconds: number, inspect?: () => void) => { for (let i = 0; i < seconds * 60; i++) { director.update(1 / 60, player); inspect?.() } }
  return { director, enemy: director.enemies[0], player, events, reactions, actor, scene, world, surfaces, advance, setZone: (value: HitZone) => { zone = value }, damage: () => damage,
    dispose() { director.dispose(); world.dispose() } }
}

await check('Sight queries share damage volumes without hurting enemies and respect cover, dead and reserve states', async () => {
  const f = await fixture()
  const origin = v(0, 1.2, 10), direction = v(0, 0, -1)
  const before = f.director.snapshot()
  assert.equal(f.director.aimDistance(origin, direction, 20), 5)
  assert.deepEqual(f.director.snapshot(), before)
  assert.equal(f.events.length, 0)
  assert.equal(f.reactions.length, 0)
  assert.equal(f.director.aimDistance(origin, direction, 3), 3, 'nearer scenery must bound the sight query')
  f.enemy.health = 0
  assert.equal(f.director.aimDistance(origin, direction, 20), 20)
  f.enemy.health = 100; f.enemy.state = 'reserve'
  assert.equal(f.director.aimDistance(origin, direction, 20), 20)
  f.dispose()
})

await check('Every ordinary headshot survives at full health; sniper is the deliberate exception', () => {
  for (const weapon of ['pistol', 'smg', 'ak'] as const) {
    assert(hitDamage(weapon, 'head', WEAPON_RULES[weapon].damage) < ENEMY_HEALTH)
    assert(hitDamage(weapon, 'head', WEAPON_RULES[weapon].damage) > hitDamage(weapon, 'torso', WEAPON_RULES[weapon].damage) * 2)
  }
  assert(hitDamage('sniper', 'head', WEAPON_RULES.sniper.damage) >= ENEMY_HEALTH)
})

await check('Close-distance movement faces forward, runs, plants feet, then fires', async () => {
  const f = await fixture()
  f.director.hear({ kind: 'shot-pistol', position: f.player.eye, radius: 38 })
  let moved = 0, fired = 0
  f.advance(14, () => {
    const enemy = f.enemy
    if (enemy.moveSpeed > 0) {
      moved++
      assert(enemy.moveSpeed >= 1.8)
      const target = enemy.path[0]
      if (target) assert(Math.cos(Math.atan2(target.x - enemy.position.x, target.z - enemy.position.z) - enemy.yaw) > 0.99)
    }
    if (enemy.shots > fired) {
      assert.equal(enemy.moveSpeed, 0)
      assert(enemy.settledFor >= ENEMY_COMBAT.settle)
      assert(enemy.position.distanceTo(f.player.feet) >= 17)
      fired = enemy.shots
    }
  })
  assert(moved > 0); assert(fired > 0)
  assert(!f.director.snapshot().some(snapshot => snapshot.tactic === 'strafe'))
  f.dispose()
})

await check('Missed shots behind a guard provoke a turn and fair acquisition; visual distant muzzle events alert snipers', async () => {
  const f = await fixture({ facing: Math.PI })
  f.advance(0.2)
  assert.equal(f.enemy.state, 'guard')
  f.director.hear({ kind: 'shot-pistol', position: f.player.eye, radius: 38 })
  assert.equal(f.enemy.state, 'investigate'); assert.equal(f.enemy.shots, 0)
  f.advance(0.3); assert.equal(f.enemy.shots, 0)
  f.advance(9); assert(f.enemy.shots > 0)
  f.dispose()
  const sniper = await fixture({ role: 'sniper', weapon: 'sniper' })
  sniper.player.feet.z = sniper.player.eye.z = 85
  sniper.director.hear({ kind: 'shot-pistol', position: sniper.player.eye, radius: 38 })
  assert.equal(sniper.enemy.state, 'investigate'); assert.equal(sniper.enemy.shots, 0)
  sniper.dispose()
})

await check('Snipers fire at long range, stay on post when contact moves, and cannot shoot through cover', async () => {
  const f = await fixture({ role: 'sniper', weapon: 'sniper' })
  const post = f.enemy.position.clone()
  f.player.feet.z = f.player.eye.z = 85
  f.advance(1); assert.equal(f.enemy.shots, 0, 'distant idle sniper needs a confirmed threat')
  f.director.hear({ kind: 'shot-pistol', position: f.player.eye, radius: 38 })
  f.advance(1.3); assert(f.enemy.shots > 0, 'sniper must engage promptly')
  f.advance(9); assert(f.enemy.shots >= 4); assert(f.enemy.shots <= 5)
  assert(f.events.some(event => event.kind === 'enemy-shot-sniper' && event.radius === 130), 'a long-range sniper round must remain audible to the player')
  f.player.feet.z = f.player.eye.z = -125
  f.advance(20)
  assert(f.enemy.position.distanceTo(post) < 0.00001)
  assert.equal(f.enemy.state, 'guard')
  f.dispose()
  const covered = await fixture({ role: 'sniper', weapon: 'sniper' }, true)
  covered.player.feet.z = covered.player.eye.z = 85
  covered.advance(12)
  assert.equal(covered.enemy.shots, 0); assert.equal(covered.damage(), 0)
  covered.dispose()
})

await check('Unseen player movement cannot alter combat destination or orientation', async () => {
  const f = await fixture()
  Object.assign(f.enemy, { state: 'combat', lastKnown: v(0, 0, 30), canSee: false, senseTimer: 1, tacticTimer: 0 })
  const saved = f.director.snapshot()
  f.player.feet.set(80, 0, 80); f.player.eye.set(80, 1.65, 80)
  f.advance(1 / 60)
  const first = f.director.snapshot()[0]
  f.director.restore(saved)
  f.player.feet.set(-80, 0, -80); f.player.eye.set(-80, 1.65, -80)
  f.advance(1 / 60)
  const second = f.director.snapshot()[0]
  for (const field of ['tactic', 'tacticPoint', 'pathTarget', 'position', 'yaw', 'lastKnown']) assert.deepEqual(first[field], second[field], field)
  f.dispose()
})

await check('Enemy misses hit real surfaces with sound and callback at the obstruction', async () => {
  const f = await fixture({}, 13.25)
  f.player.feet.z = f.player.eye.z = 12
  Object.assign(f.enemy, { state: 'combat', lastKnown: f.player.feet.clone(), canSee: true, senseTimer: 1, tactic: 'hold', tacticTimer: 999, shotTimer: 0, settledFor: 1, aimTime: 1 })
  Object.assign(f.director, { random: () => 0.99 })
  f.advance(1 / 60)
  assert.equal(f.enemy.shots, 1); assert.equal(f.damage(), 0)
  assert.equal(f.surfaces.length, 0, 'Surface feedback waits for the visible round')
  f.director.bulletTrails.update(0.16)
  assert.equal(f.surfaces.length, 1); assert(Math.abs(f.surfaces[0].z - 13) < 0.0001)
  const impact = f.events.find(event => event.kind === 'impact')
  assert(impact); assert.equal(impact.radius, 18); assert(impact.position!.distanceTo(f.surfaces[0]) < 0.00001)
  f.dispose()
})

await check('Every region emits its own sound and flinch on repeated hits; reactions stop root movement', async () => {
  for (const zone of ['head', 'torso', 'arm', 'leg'] as const) {
    const f = await fixture()
    f.setZone(zone)
    const shot = { origin: v(0, 1.2, -5), direction: v(0, 0, 1), range: 20, damage: 2, weapon: 'pistol' as const }
    assert(f.director.hit(shot, 20)); assert(f.director.hit(shot, 20))
    assert.equal(f.reactions.length, 2); assert.equal(f.reactions[0], f.reactions[1])
    assert.equal(f.events.filter(event => event.kind === 'enemy-hit' && event.zone === zone).length, 2)
    const before = f.enemy.position.clone()
    f.advance(0.25)
    assert.equal(f.enemy.position.distanceTo(before), 0)
    assert.equal(f.enemy.shots, 0)
    f.dispose()
  }
})

await check('Real actor reaction replay restarts the same cached action immediately', () => {
  const root = new THREE.Group()
  const player = new Player(root)
  const clip = new THREE.AnimationClip('flinchHead', 0.5, [new THREE.NumberKeyframeTrack('.position[y]', [0, 0.1, 0.5], [0, 0.1, 0])])
  // Exercise the actor method with a real mixer without requiring browser GLB loading.
  const actor = Object.create(EnemyActor.prototype) as EnemyActor
  Object.assign(actor, { root, player, lib: { clips: { flinchHead: clip } }, dead: false, reacting: 0,
    bodyPosture: 'stand', postureTransition: null, transientClips: new Set<THREE.AnimationClip>() })
  actor.react('flinchHead', false)
  player.update(0.25)
  const revision = player.revision
  actor.react('flinchHead', false)
  assert.equal(player.revision, revision + 1)
  assert.equal(player.current!.time, 0.035)
  assert(actor.reactionRemaining > 0)
  player.mixer.stopAllAction(); player.mixer.uncacheRoot(root)
})

await check('Loaded enemy arms ease into aim and stay raised during repeated tracking turns', async () => {
  const load = GLTFLoader.prototype.loadAsync
  const bytes = readFileSync('public/models/stickman.glb')
  GLTFLoader.prototype.loadAsync = async function () {
    return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  }
  try {
    for (const weapon of ['pistol', 'ak', 'smg', 'sniper'] as const) {
      const actor = await EnemyActor.create(weapon)
      try {
        const arm = actor.rig.bones['upper_arm.R']
        const low = arm.quaternion.clone()
        const target = v(0, 1.65, 10)
        actor.update(1 / 60, 'combat', false, target)
        const first = arm.quaternion.clone()
        for (let i = 0; i < 120; i++) actor.update(1 / 60, 'combat', false, target)
        const aimed = arm.quaternion.clone()
        assert(low.angleTo(aimed) > 0.1, `${weapon}: aim must actually raise the arm`)
        assert(low.angleTo(first) < low.angleTo(aimed) * 0.25, `${weapon}: first frame must ease into aim`)
        let previous = actor.rig.bones['hand.L'].getWorldPosition(v())
        let maxHandStep = 0
        for (let i = 0; i < 240; i++) {
          // Alternating small corrections and planted frames previously snapped aim off/on.
          actor.root.rotation.y = Math.floor(i / 2) % 2 ? 0.004 : 0
          actor.update(1 / 60, 'combat', false, target)
          assert(arm.quaternion.angleTo(aimed) < 0.01, `${weapon}: tracking lowered the firing arm`)
          const hand = actor.rig.bones['hand.L'].getWorldPosition(v())
          maxHandStep = Math.max(maxHandStep, hand.distanceTo(previous)); previous = hand
        }
        assert(maxHandStep < 0.08, `${weapon}: support hand jumped ${maxHandStep}m`)
        actor.update(1 / 60, 'combat', true, target, 2.8)
        assert(arm.quaternion.angleTo(aimed) < low.angleTo(aimed) * 0.25, `${weapon}: lowering must also ease`)
        actor.restore('guard')
        actor.update(1 / 60, 'guard', false)
        assert(arm.quaternion.angleTo(low) < 1e-6, `${weapon}: restore retained a stale aim blend`)
      } finally { actor.dispose() }
    }
  } finally { GLTFLoader.prototype.loadAsync = load }
})

if (failures) process.exitCode = 1
