import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EnemyDirector, type Enemy } from '../src/game/ai'
import { ENEMY_RUN_SPEED } from '../src/game/balance'
import { CollisionWorld } from '../src/player/collision'
import type { EnemySpec, PlayerSense, Vec3 } from '../src/game/types'

// Exercise navigation, perception, weapon presentation and the loaded run clip together.
const originalLoad = GLTFLoader.prototype.loadAsync
const bytes = readFileSync('public/models/stickman.glb')
GLTFLoader.prototype.loadAsync = async function () {
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const dt = 1 / 60
const failures: string[] = []

async function fixture(positions: Vec3[] = [[0, 0, 0]], options: {
  target?: Vec3; sniper?: boolean; indoor?: 'metadata' | 'roof'
} = {}) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(90, 4, 0.5), new THREE.MeshBasicMaterial())
  barrier.position.set(500, 2, 20)
  barrier.userData.doorHinge = true
  scene.add(barrier)
  if (options.indoor === 'metadata') {
    const house = new THREE.Group()
    house.rotation.y = Math.PI / 3
    house.userData = { enterable: true, footprint: [8, 10], floor: 0, roofHeight: 3 }
    scene.add(house)
  } else if (options.indoor === 'roof') {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 8), new THREE.MeshBasicMaterial())
    roof.position.set(0, 3, 0)
    scene.add(roof)
  }
  const world = new CollisionWorld(scene)
  const specs: EnemySpec[] = positions.map((position, i) => ({ id: `reposition-${i}`, name: `Guard ${i}`,
    position, patrol: [], weapon: options.sniper ? 'sniper' : 'ak', role: options.sniper ? 'sniper' : 'guard' }))
  const director = new EnemyDirector({ scene, world, specs, doors: [], emit() {}, damagePlayer() {}, dropWeapon() {} })
  await director.init()
  const target = options.target ?? [0, 0, 22]
  const player: PlayerSense = { feet: v(...target), eye: v(...target).add(v(0, 1.65)), velocity: v(), alive: true, radioEnabled: false }
  const confirm = () => director.enemies.forEach(enemy => {
    Object.assign(enemy, { state: 'combat', lastKnown: player.feet.clone(), canSee: true, senseTimer: 0,
      contactMemory: 8, tactic: 'hold', tacticTimer: 0, settledFor: 1, aimTime: 1, shotTimer: 0,
      // Seed the existing PRNG rather than replacing any tactic or navigation method.
      random: 0, communicationTimer: 100 })
    enemy.yaw = Math.atan2(player.feet.x - enemy.position.x, player.feet.z - enemy.position.z)
    enemy.actor.root.rotation.y = enemy.yaw
  })
  const frame = () => director.update(dt, player)
  const step = (seconds: number, observe?: () => void) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) { frame(); observe?.() }
  }
  return { director, world, player, confirm, frame, step,
    hidePlayer() { barrier.position.x = 0; world.refresh() },
    dispose() {
      director.dispose(); world.dispose()
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
        }
      })
    } }
}

async function check(name: string, run: () => Promise<void>) {
  try { await run(); console.log(`PASS ${name}`) }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`${name}: ${message}`)
    console.error(`FAIL ${name}: ${message}`)
  }
}

function assertRun(enemy: Enemy) {
  assert(Math.abs(enemy.moveSpeed - ENEMY_RUN_SPEED) < 0.01, `offensive run speed was ${enemy.moveSpeed}`)
  assert.equal(enemy.actor.player.current?.getClip().name, 'run', 'navigation must visibly play the loaded running animation')
}

function watchArrival(f: Awaited<ReturnType<typeof fixture>>, enemy: Enemy, point: THREE.Vector3, beforeFrame?: (time: number) => void) {
  let ran = false, arrived = false
  for (let i = 0; i < 7 / dt; i++) {
    beforeFrame?.(i * dt)
    f.frame()
    if (enemy.moveSpeed > 0) { assertRun(enemy); ran = true }
    if (enemy.tacticPoint) assert(enemy.tacticPoint.distanceTo(point) < 0.01, 'run destination must not follow moving player coordinates')
    if (enemy.tactic === 'hold' && enemy.position.distanceTo(point) <= 0.5) { arrived = true; break }
  }
  assert(ran, 'guard must actually travel with its run clip')
  assert(arrived, `guard never planted at its firing point; state=${enemy.state}, tactic=${enemy.tactic}, distance=${enemy.position.distanceTo(point).toFixed(2)}`)
  assert(enemy.tacticTimer >= 3.5 - dt, `arrival hold must last at least 3.5s, got ${enemy.tacticTimer}`)
  const planted = enemy.position.clone(), shots = enemy.shots
  f.step(3.5 - dt, () => {
    assert(enemy.position.distanceTo(planted) < 0.001, 'guard must finish its firing window before repositioning again')
    assert.equal(enemy.moveSpeed, 0)
  })
  assert(enemy.shots > shots, 'guard must fire from the new position during its planted window')
}

try {
  await check('One squad member runs to a flank while its teammates remain planted and shoot', async () => {
    const f = await fixture([[0, 0, 0], [8, 0, 0], [-8, 0, 0]])
    try {
      f.confirm(); f.frame()
      const flankers = f.director.enemies.filter(enemy => enemy.tactic === 'flank')
      assert.equal(flankers.length, 1, 'only one nearby guard should leave the firing line')
      const flanker = flankers[0], point = flanker.tacticPoint!.clone()
      const holders = f.director.enemies.filter(enemy => enemy !== flanker)
      const positions = holders.map(enemy => enemy.position.clone())
      watchArrival(f, flanker, point, () => {
        holders.forEach((enemy, i) => assert(enemy.position.distanceTo(positions[i]) < 0.001, 'teammates must cover the active flank'))
        assert(f.director.enemies.filter(enemy => ['flank', 'charge'].includes(enemy.tactic)).length <= 1)
      })
      assert(holders.every(enemy => enemy.shots > 0), 'covering teammates must shoot instead of all rushing the player')
    } finally { f.dispose() }
  })

  for (const kind of ['sniper', 'metadata', 'roof'] as const) {
    await check(`${kind} protected post retains its position and fires`, async () => {
      const f = await fixture([[0, 0, 0]], { target: [0, 0, 35], sniper: kind === 'sniper', indoor: kind === 'sniper' ? undefined : kind })
      try {
        f.confirm()
        const enemy = f.director.enemies[0], post = enemy.position.clone()
        f.step(8, () => {
          assert.equal(enemy.tactic, 'hold', 'a useful protected post should not be abandoned for an offensive run')
          assert(enemy.position.distanceTo(post) < 0.001)
          assert.equal(enemy.moveSpeed, 0)
        })
        assert(enemy.shots > 0, 'holding a protected post must still permit fire')
      } finally { f.dispose() }
    })
  }

  await check('A lone confirmed distant guard runs to a bounded point, stops and fires without a homing chase', async () => {
    const f = await fixture([[0, 0, 0]], { target: [0, 0, 40] })
    try {
      f.confirm(); f.frame()
      const enemy = f.director.enemies[0], start = enemy.position.clone()
      assert.equal(enemy.tactic, 'charge')
      const point = enemy.tacticPoint!.clone()
      assert(point.distanceTo(start) <= 11, 'advance must be a short reposition, not a route across the entire gap')
      assert(point.distanceTo(f.player.feet) > 15, 'destination must retain fighting distance from the player')
      watchArrival(f, enemy, point, time => {
        f.player.feet.x = f.player.eye.x = time * 0.8
        f.player.velocity.set(0.8, 0, 0)
      })
    } finally { f.dispose() }
  })

  await check('Losing sight during a run preserves the fixed destination and last-seen memory', async () => {
    const f = await fixture([[0, 0, 0]], { target: [0, 0, 40] })
    try {
      f.confirm(); f.frame()
      const enemy = f.director.enemies[0], point = enemy.tacticPoint!.clone()
      f.step(0.75)
      assertRun(enemy)
      const remembered = enemy.lastKnown!.clone(), shots = enemy.shots
      f.hidePlayer()
      let arrived = false
      for (let i = 0; i < 7 / dt; i++) {
        f.player.feet.x = f.player.eye.x = 10 + i * dt
        f.frame()
        assert(enemy.lastKnown!.distanceTo(remembered) < 0.001, 'an occluded player must never update last-seen coordinates')
        assert.equal(enemy.shots, shots, 'running and turning cannot authorize a shot through the wall')
        if (enemy.tactic === 'hold' && enemy.position.distanceTo(point) <= 0.5) { arrived = true; break }
        assert.equal(enemy.tactic, 'charge', 'temporary lost sight must not abandon the bounded route for a chase')
        assert(enemy.tacticPoint && enemy.tacticPoint.distanceTo(point) < 0.001, 'hidden player movement must not alter the committed firing point')
      }
      assert(arrived, 'guard should finish its existing short run before trying to reacquire contact')
      f.step(1.25, () => {
        assert(enemy.lastKnown!.distanceTo(remembered) < 0.001)
        assert.equal(enemy.shots, shots)
      })
    } finally { f.dispose() }
  })

  await check('An uncertain sound prompts a walking investigation, not an offensive sprint', async () => {
    const f = await fixture([[0, 0, 0]], { target: [90, 0, 90] })
    try {
      const enemy = f.director.enemies[0]
      enemy.random = 0
      f.director.hear({ kind: 'shot-ak', position: v(0, 1.5, 16), radius: 45 })
      assert.equal(enemy.state, 'investigate')
      const heard = enemy.lastKnown!.clone()
      let walked = false
      f.step(3, () => {
        assert(!enemy.canSee)
        assert.notEqual(enemy.tactic, 'charge'); assert.notEqual(enemy.tactic, 'flank')
        assert(enemy.moveSpeed <= 1.4 + 0.01, 'hearing alone must not trigger the full-speed run')
        if (enemy.moveSpeed > 0) {
          walked = true
          assert.equal(enemy.actor.player.current?.getClip().name, 'walk')
        }
        assert(enemy.lastKnown!.distanceTo(heard) < 0.001, 'a sound must not reveal the hidden player')
      })
      assert(walked, 'guard should still investigate the sound location')
      assert.equal(enemy.shots, 0)
    } finally { f.dispose() }
  })

  await check('A wounded leg prevents offensive sprinting while preserving stationary fire', async () => {
    const f = await fixture([[0, 0, 0]], { target: [0, 0, 40] })
    try {
      f.confirm()
      const enemy = f.director.enemies[0], post = enemy.position.clone()
      enemy.woundLeg = true
      f.step(8, () => {
        assert.notEqual(enemy.tactic, 'charge'); assert.notEqual(enemy.tactic, 'flank')
        assert(enemy.position.distanceTo(post) < 0.001)
        assert.notEqual(enemy.actor.player.current?.getClip().name, 'run')
      })
      assert(enemy.shots > 0)
    } finally { f.dispose() }
  })
} finally { GLTFLoader.prototype.loadAsync = originalLoad }

assert.deepEqual(failures, [], 'Reposition regressions must pass with real actors and normal perception')
