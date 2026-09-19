import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EnemyDirector } from '../src/game/ai'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import { createCompound } from '../src/world/compound'
import { CollisionWorld } from '../src/player/collision'
import type { PlayerSense } from '../src/game/types'

const originalLoad = GLTFLoader.prototype.loadAsync
const bytes = readFileSync('public/models/stickman.glb')
GLTFLoader.prototype.loadAsync = async function () {
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const scene = new THREE.Scene(), compound = createCompound(), mission = createMissionWorld()
prepareCompound(compound); scene.add(compound, mission.root); scene.updateMatrixWorld(true)
const world = new CollisionWorld(scene)
const director = new EnemyDirector({ scene, world, specs: mission.enemies.filter(e => e.role === 'sniper'),
  doors: [], emit() {}, damagePlayer() {}, dropWeapon() {} })
const player: PlayerSense = { feet: v(-200, 0, -200), eye: v(-200, 1.65, -200), velocity: v(), alive: true, radioEnabled: false }
const dt = 1 / 60, failures: string[] = []
function check(name: string, run: () => void) {
  try { run(); console.log('PASS', name) }
  catch (error) { failures.push(`${name}: ${error}`); console.error('FAIL', name, String(error)) }
}
function step(seconds: number, observe?: () => void) {
  for (let i = 0; i < Math.round(seconds / dt); i++) { director.update(dt, player); observe?.() }
}

try {
  await director.init()
  const water = director.enemies.find(e => e.spec.id === 'water-sniper')!
  const watch = director.enemies.find(e => e.spec.id === 'watch-sniper')!
  const initial = director.snapshot(), watchPost = watch.position.clone()
  const tower = compound.getObjectByName('North water tower')!
  const center = tower.getWorldPosition(v())
  const radius = () => Math.hypot(water.position.x - center.x, water.position.z - center.z)

  check('Every perimeter segment has real floor and capsule clearance, including the loop closure', () => {
    const route = water.spec.patrol
    assert.equal(water.spec.patrolMode, 'perimeter')
    for (let i = 0; i < route.length; i++) {
      assert(director.navigation.segment(v(...route[i]), v(...route[(i + 1) % route.length])), `blocked segment ${i}`)
    }
  })

  check('The marksman walks full circuits, pauses at varied points and looks outward while standing', () => {
    const stops: number[] = [], durations: number[] = [], sectors = new Set<number>()
    let walked = 0, relaxed = 0, previousWait = water.wait, planted = water.position.clone()
    step(120, () => {
      assert.equal(water.state, 'patrol')
      assert(radius() > 3.3 && radius() < 3.85, `left safe catwalk ring: ${radius()}`)
      assert(Math.abs(water.position.y - tower.userData.deckHeight - 0.024) < 0.03, 'must stay supported on upper deck')
      if (water.moveSpeed > 0) {
        walked++
        assert.equal(water.actor.player.current?.getClip().name, 'walk')
        // Small height changes at deck seams contribute to the measured 3D speed.
        assert(water.moveSpeed < 1.8, `walk speed ${water.moveSpeed} at ${water.position.toArray()}`)
        sectors.add(Math.floor((Math.atan2(water.position.z - center.z, water.position.x - center.x) + Math.PI) / (Math.PI / 4)) % 8)
      }
      if (water.wait > previousWait) {
        stops.push((water.waypoint + water.spec.patrol.length - 1) % water.spec.patrol.length)
        durations.push(water.wait); planted = water.position.clone()
      } else if (water.wait > 0 && water.visitedWaypoints > 0) {
        assert(water.position.distanceTo(planted) < 1e-8, 'lookout pause must remain planted')
        if (water.actor.player.current?.getClip().name === 'lookRelaxed') {
          relaxed++
          const outward = water.position.clone().sub(center).setY(0).normalize()
          assert(v(Math.sin(water.yaw), 0, Math.cos(water.yaw)).dot(outward) > 0.99, 'look away from the tank')
        }
      }
      previousWait = water.wait
      assert(watch.position.distanceTo(watchPost) < 1e-8, 'observation-tower post remains fixed')
    })
    assert(walked > 1500 && relaxed > 300)
    assert.equal(sectors.size, 8, 'visit every side of the tower')
    assert(water.visitedWaypoints >= 32, 'complete at least two full laps')
    assert(new Set(stops).size >= 5 && new Set(durations).size >= 5, 'vary both stopping location and duration')
    assert(durations.every(n => n >= 3 && n <= 7))
    assert.equal(water.pathFailures, 0)
    console.log(JSON.stringify({ distance: water.distanceWalked, waypoints: water.visitedWaypoints, stops, durations }))
  })

  check('Checkpoint restore preserves the next lookout and subsequent random choices', () => {
    for (let i = 0; i < 1200 && (water.wait < 2 || water.visitedWaypoints === 0); i++) step(dt)
    assert(water.wait >= 2 && water.visitedWaypoints > 0, 'reach a lookout before saving')
    const checkpoint = director.snapshot()
    const trace = () => {
      const frames: unknown[] = []
      step(25, () => frames.push([water.position.toArray(), water.yaw, water.waypoint, water.patrolStop, water.wait, water.random]))
      return frames
    }
    const first = trace(); director.restore(checkpoint)
    assert.deepEqual(trace(), first)
  })

  check('Visual contact holds position and fires; losing contact resumes the catwalk patrol', () => {
    director.restore(initial)
    // Elevated target outside the west rail isolates sniper combat from ground cover.
    player.feet.copy(water.position).add(v(-22, 0, 0)); player.eye.copy(player.feet).add(v(0, 1.65))
    water.yaw = -Math.PI / 2
    const post = water.position.clone()
    step(8, () => {
      assert.equal(water.state, 'combat')
      assert.equal(water.tactic, 'hold')
      assert(water.position.distanceTo(post) < 1e-8)
      assert.equal(water.moveSpeed, 0)
    })
    assert(water.shots > 0, 'must still fire as a sniper')
    player.feet.set(-200, 0, -200); player.eye.copy(player.feet).add(v(0, 1.65))
    step(22)
    assert.equal(water.state, 'patrol')
    assert(water.distanceWalked > 3, 'resume walking after losing contact')
    assert(radius() > 3.3 && radius() < 3.85)
  })

  check('A ground-level alarm cannot pull the sniper off the tower', () => {
    director.restore(initial)
    const post = water.position.clone()
    director.respondToAlarm(v(35, 0, 15))
    step(5, () => assert(water.position.distanceTo(post) < 1e-8))
    step(20)
    assert.equal(water.state, 'patrol'); assert(water.distanceWalked > 3)
    assert(radius() > 3.3 && radius() < 3.85)
  })

  check('An older stationary-guard checkpoint gains the patrol without resetting the mission', () => {
    const legacy = structuredClone(initial), saved = legacy.find(e => e.id === water.spec.id)!
    delete saved.patrolStop; saved.state = 'guard'; saved.waypoint = 0
    director.restore(legacy)
    assert.equal(water.state, 'patrol')
    step(15)
    assert(water.distanceWalked > 3)
  })
} finally {
  director.dispose(); world.dispose(); GLTFLoader.prototype.loadAsync = originalLoad
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1 }
