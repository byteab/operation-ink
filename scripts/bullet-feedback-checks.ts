import assert from 'node:assert/strict'
import * as THREE from 'three'
import { BulletTrails, bulletFlightTime, bulletNearMiss } from '../src/game/bullet-trails'
import { IncomingFire } from '../src/game/incoming-fire'
import { MissionImpacts } from '../src/game/impacts'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { CollisionWorld } from '../src/player/collision'
import type { PlayerSense, SoundEvent, WeaponName } from '../src/game/types'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const near = (actual: number, expected: number, tolerance = 2e-5) =>
  assert(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`)
const matrixAt = (mesh: THREE.InstancedMesh, index = 0) => {
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix)
  assert(matrix.elements.every(Number.isFinite), 'All rendered transforms are finite')
  return matrix
}
// Inspect the actual rendered geometry, including every vertex of each dart, rim and wake.
function bounds(mesh: THREE.InstancedMesh, origin: THREE.Vector3, direction: THREE.Vector3, index = 0) {
  const matrix = matrixAt(mesh, index), positions = mesh.geometry.getAttribute('position')
  let min = Infinity, max = -Infinity, radius = 0
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const local = v().fromBufferAttribute(positions, vertex).applyMatrix4(matrix).sub(origin)
    const projection = local.dot(direction)
    min = Math.min(min, projection); max = Math.max(max, projection)
    radius = Math.max(radius, local.addScaledVector(direction, -projection).length())
  }
  return { min, max, radius }
}
function advance(trails: BulletTrails, time: number, fps: number) {
  for (let elapsed = 0; elapsed < time - 1e-10; elapsed += 1 / fps) trails.update(Math.min(1 / fps, time - elapsed))
}

{
  const times = [0, 0.025, 5, 35, 70, 140, 1000].map(bulletFlightTime)
  assert(times.every(time => time >= 0.055 && time <= 0.15))
  assert(times.every((time, index) => !index || time >= times[index - 1]))
  assert(bulletFlightTime(70) > bulletFlightTime(5), 'Longer shots visibly take longer to travel')
  const scene = new THREE.Scene(), trails = new BulletTrails(scene)
  const origin = v(3, 1.6, -4)
  for (const name of ['pistol', 'ak', 'smg', 'shotgun', 'sniper'] as WeaponName[]) {
    for (const direction of [v(1), v(0, -1), v(0, 0, 1), v(-1, 2, -3).normalize()]) {
      for (const distance of [0.03, 0.08, 1, 25, 150]) {
        trails.clear()
        const end = origin.clone().addScaledVector(direction, distance)
        const original = origin.clone(), endpoint = end.clone()
        trails.emit(origin, end, name)
        assert.equal(trails.count, 1)
        for (const time of [0, bulletFlightTime(distance) * 0.4, bulletFlightTime(distance) * 0.4]) {
          trails.update(time)
          const head = bounds(trails.heads, original, direction), tail = bounds(trails.tails, original, direction)
          const rim = bounds(trails.rims, original, direction)
          for (const geometry of [head, tail, rim]) {
            assert(geometry.min >= -2e-5, 'Geometry never protrudes behind the muzzle')
            assert(geometry.max <= distance + 2e-5, 'Geometry never extends through contact')
          }
          assert(head.max - tail.min <= 3.08, 'The visible dart and wake stay short at every range')
          near(rim.min, head.min); near(rim.max, head.max)
          assert(rim.radius > head.radius, 'Paper contrast extends around the dart without extending its path')
          assert(head.radius <= 0.145 && tail.radius <= 0.102 && rim.radius <= 0.26, 'Camera scaling never produces oversized rounds')
        }
        assert(origin.equals(original) && end.equals(endpoint), 'Emission preserves authoritative shot vectors')
      }
    }
  }
  trails.clear(); trails.emit(origin, origin); trails.emit(origin, origin.clone().add(v(0.001)))
  assert.equal(trails.count, 0, 'Degenerate rays produce no invalid geometry')
  assert.equal(scene.children.length, 3, 'Every shot shares three instanced draw calls')
  assert([trails.heads, trails.tails, trails.rims].every(mesh => mesh.userData.noCollision))
  trails.dispose()
  console.log('PASS All five weapons render short finite geometry inside the real segment, including close contacts and arbitrary directions')
}

{
  const samples = [30, 60, 144].map(fps => {
    const trails = new BulletTrails(new THREE.Scene())
    trails.emit(v(), v(0, 0, 140))
    const start = bounds(trails.heads, v(), v(0, 0, 1)).max
    advance(trails, 0.05, fps)
    const middle = bounds(trails.heads, v(), v(0, 0, 1)).max
    advance(trails, 0.05, fps)
    const end = bounds(trails.heads, v(), v(0, 0, 1)).max
    assert(start < middle && middle < end && end < 140, 'A round moves along the path across successive frames')
    const paused = matrixAt(trails.heads).toArray()
    trails.update(0); trails.update(-0.1)
    assert.deepEqual(matrixAt(trails.heads).toArray(), paused)
    trails.dispose()
    return [start, middle, end]
  })
  samples[0].forEach((sample, index) => { near(sample, samples[1][index]); near(sample, samples[2][index]) })
  const trails = new BulletTrails(new THREE.Scene())
  let passes = 0
  trails.emit(v(), v(0, 0, 70), 'ak', { fraction: 0.5, fire() { passes++ } })
  trails.update(0.049); assert.equal(passes, 0)
  trails.update(0); assert.equal(passes, 0)
  trails.update(0.002); assert.equal(passes, 1)
  trails.update(1); assert.equal(passes, 1); assert.equal(trails.count, 0)
  trails.emit(v(), v(0, 0, 70), 'ak', { fraction: 0.5, fire() { passes++ } })
  trails.update(1)
  assert.equal(passes, 2, 'Skipping the entire flight still triggers the pass exactly once')
  trails.emit(v(), v(0, 0, 70), 'ak', { fraction: 0.5, fire() { passes++ } })
  trails.clear(); trails.update(1); assert.equal(passes, 2)
  assert.equal(trails.heads.count, 0); assert.equal(trails.tails.count, 0); assert.equal(trails.rims.count, 0)
  const origin = v(), end = v(0, 0, 70)
  trails.emit(origin, end)
  origin.set(500, 500, 500); end.set(-500, -500, -500)
  trails.update(bulletFlightTime(70))
  near(bounds(trails.heads, v(), v(0, 0, 1)).max, 70)
  const radius = bounds(trails.heads, v(), v(0, 0, 1)).radius
  trails.update(0.02)
  const faded = bounds(trails.heads, v(), v(0, 0, 1))
  near(faded.max, 70)
  assert(faded.radius < radius && faded.radius > 0, 'Contact fades at the endpoint without advancing through it')
  trails.update(0.016); assert.equal(trails.count, 0)
  trails.dispose()
  console.log('PASS Visible travel matches at 30/60/144 FPS; pause freezes rounds and callbacks fire once even after skipped frames')
}

{
  const scene = new THREE.Scene(), trails = new BulletTrails(scene)
  const heads = trails.heads, tails = trails.tails, rims = trails.rims
  let discarded = 0, surviving = 0, geometries = 0, materials = 0
  for (let index = 0; index < 300; index++) {
    trails.emit(v(index), v(index, 0, 20), 'ak', { fraction: 0.5, fire() { index < 204 ? discarded++ : surviving++ } })
    assert(trails.count <= 96 && heads.count <= 96 && tails.count <= 96 && rims.count <= 96)
  }
  assert.equal(trails.count, 96)
  trails.update(1)
  assert.equal(discarded, 0, 'Evicted rounds discard their pending proximity events')
  assert.equal(surviving, 96); assert.equal(trails.count, 0)
  let disposedPass = 0
  trails.emit(v(), v(0, 0, 20), 'ak', { fraction: 0.5, fire() { disposedPass++ } })
  for (const mesh of [heads, tails, rims]) {
    mesh.geometry.addEventListener('dispose', () => geometries++)
    mesh.material.addEventListener('dispose', () => materials++)
  }
  trails.dispose(); trails.update(1)
  assert.equal(disposedPass, 0); assert.equal(scene.children.length, 0)
  assert.equal(geometries, 3); assert.equal(materials, 3)
  assert.equal(trails.heads, heads); assert.equal(trails.tails, tails); assert.equal(trails.rims, rims)
  console.log('PASS Sustained fire stays capped at 96 with reused meshes, drops stale callbacks, and releases GPU resources on disposal')
}

{
  const origin = v(), end = v(0, 0, 20), eye = v(0.8, 0.2, 10)
  const nearMiss = bulletNearMiss(origin, end, eye)!
  near(nearMiss.fraction, 0.5); assert(nearMiss.point.equals(v(0, 0, 10)))
  near(nearMiss.distance, Math.hypot(0.8, 0.2))
  assert(nearMiss.intensity > 0 && nearMiss.intensity <= 1)
  assert(bulletNearMiss(origin, end, v(0.1, 0, 10))!.intensity > nearMiss.intensity)
  assert.equal(bulletNearMiss(origin, end, v(2.4, 0, 10)), null)
  assert.equal(bulletNearMiss(origin, end, v(0, 0, -1)), null)
  assert.equal(bulletNearMiss(origin, end, v(0, 0, 1)), null, 'Muzzle vicinity is not a pass-by')
  assert.equal(bulletNearMiss(origin, origin, eye), null)
  assert.equal(bulletNearMiss(origin, v(0, 0, 1), eye), null)
  assert.equal(bulletNearMiss(origin, v(0, 0, 6), eye), null, 'Cover-clipped segment does not use its infinite ray')
  const endpoint = bulletNearMiss(origin, v(0, 0, 9), eye)!
  near(endpoint.fraction, 1); assert(endpoint.point.equals(v(0, 0, 9)), 'End-of-path proximity clamps to the actual contact')
  console.log('PASS Proximity uses the finite clipped segment, radius, distance weighting, and muzzle exclusion')
}

async function enemyFixture(sideWall = false) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.BoxGeometry(50, 0.2, 50), new THREE.MeshBasicMaterial())
  floor.position.y = -0.1; scene.add(floor)
  if (sideWall) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3, 1), new THREE.MeshBasicMaterial())
    wall.position.set(0.35, 1.5, 10); scene.add(wall)
  }
  const world = new CollisionWorld(scene), events: SoundEvent[] = []
  let damage = 0
  const ai = new EnemyDirector({ scene, world, doors: [], specs: [
    { id: 'near-player', name: 'Guard', position: [0, 0, 0], weapon: 'ak', patrol: [], facing: 0 },
  ], emit(event) { events.push(event) }, damagePlayer() { damage++ }, dropWeapon() {} }, async () => {
    const root = new THREE.Group()
    return { root, reactionRemaining: 0, update() {}, shoot() {}, dispose() {}, restore() {},
      muzzle: () => root.position.clone().add(v(0, 1.4, 0.3)) } as unknown as EnemyActor
  })
  await ai.init()
  const player: PlayerSense = { feet: v(0, 0, 10), eye: v(0, 1.65, 10), velocity: v(), alive: true, radioEnabled: false }
  const enemy = ai.enemies[0], internals = ai as any
  internals.lastPlayer = player
  const fire = () => {
    Object.assign(enemy, { state: 'combat', moveSpeed: 0, hitPause: 0, settledFor: 1, aimTime: 2, reloadTimer: 0, magazine: 30, yaw: 0, burst: 0 })
    const rolls = [0.99, 0.99, 0, 0]
    internals.random = () => rolls.shift() ?? 0
    assert(internals.shoot(enemy, player), 'Exposed player permits a real missed enemy shot')
  }
  return { ai, player, fire, muzzle: () => enemy.actor.muzzle(), whizzes: () => events.filter(event => event.kind === 'enemy-bullet-whiz'), damage: () => damage,
    dispose() { ai.dispose(); world.dispose(); floor.geometry.dispose(); floor.material.dispose() } }
}

{
  const f = await enemyFixture()
  f.fire(); assert.equal(f.ai.bulletTrails.count, 1)
  assert.equal(f.whizzes().length, 0, 'A whiz waits for the visible projectile')
  f.ai.bulletTrails.update(0.001); assert.equal(f.whizzes().length, 0)
  f.ai.bulletTrails.update(0.1)
  assert.equal(f.whizzes().length, 1)
  const event = f.whizzes()[0]
  assert(event.position!.distanceTo(f.player.eye) < 2.4)
  assert(event.source!.equals(f.muzzle()), 'Incoming direction retains the actual firing muzzle')
  assert(event.intensity! > 0 && event.intensity! <= 1)
  f.ai.bulletTrails.update(1); assert.equal(f.whizzes().length, 1)
  assert.equal(f.damage(), 0, 'Near-miss feedback never damages the player')
  f.dispose()
}
for (const mode of ['side wall', 'moved listener', 'dead listener', 'reset'] as const) {
  const f = await enemyFixture(mode === 'side wall')
  f.fire()
  if (mode === 'moved listener') f.player.eye.set(20, 1.65, 10)
  if (mode === 'dead listener') f.player.alive = false
  if (mode === 'reset') f.ai.restore(f.ai.snapshot())
  f.ai.bulletTrails.update(1)
  assert.equal(f.whizzes().length, 0, `${mode} cancels pending near-miss feedback`)
  assert.equal(f.damage(), 0)
  f.dispose()
}
console.log('PASS Real enemy misses time the whiz to passage, deal no damage, and recheck the listener, side cover, death and reset')

{
  const scene = new THREE.Scene(), impacts = new MissionImpacts(scene)
  const point = v(3, 2, -5), direction = v(-1, 2, 3).normalize()
  impacts.emit(point, direction)
  assert.equal(impacts.bursts.count, 1); assert.equal(impacts.mesh.count, 7)
  const initial = matrixAt(impacts.bursts), center = v().setFromMatrixPosition(initial)
  assert(center.distanceTo(point.clone().addScaledVector(direction, -0.025)) < 1e-6,
    'Impact burst sits just in front of the authoritative surface contact')
  const plane = bounds(impacts.bursts, center, direction)
  near(plane.min, 0); near(plane.max, 0)
  assert(plane.radius > 0.02 && plane.radius < 0.04, 'Contact blot stays smaller than eight centimetres across')
  assert(impacts.bursts.userData.noCollision && impacts.mesh.userData.noCollision)
  impacts.update(0); impacts.update(-0.1)
  assert.deepEqual(matrixAt(impacts.bursts).toArray(), initial.toArray(), 'Pause freezes the impact mark')
  impacts.update(0.04); impacts.update(0.044)
  assert.equal(impacts.bursts.count, 1, 'Starburst survives until 85 ms')
  assert(v().setFromMatrixPosition(matrixAt(impacts.bursts)).distanceTo(center) < 1e-7, 'Burst stays attached to contact as it shrinks')
  impacts.update(0.002); assert.equal(impacts.bursts.count, 0, 'Starburst expires after 85 ms')
  const bursts = impacts.bursts
  for (let index = 0; index < 300; index++) {
    impacts.emit(point, direction)
    assert(impacts.bursts.count <= 24 && impacts.mesh.count <= 80, 'Sustained surface fire has bounded GPU instances')
  }
  assert.equal(impacts.bursts.count, 24); assert.equal(impacts.bursts, bursts)
  impacts.clear(); assert.equal(impacts.bursts.count, 0); assert.equal(impacts.mesh.count, 0)
  impacts.emit(point, direction)
  let geometries = 0, materials = 0
  for (const mesh of [impacts.mesh, impacts.bursts]) {
    mesh.geometry.addEventListener('dispose', () => geometries++)
    mesh.material.addEventListener('dispose', () => materials++)
  }
  impacts.dispose()
  assert.equal(scene.children.length, 0); assert.equal(impacts.bursts.count, 0); assert.equal(impacts.mesh.count, 0)
  assert.equal(geometries, 2); assert.equal(materials, 2)
  console.log('PASS Surface impact bursts preserve exact contact, freeze on pause, expire at 85 ms, cap at 24 and release GPU resources')
}

{
  const samples = [30, 60, 144].map(fps => {
    const incoming = new IncomingFire()
    incoming.pulse(0.8, 'Left')
    for (let elapsed = 0; elapsed < 0.5 - 1e-10; elapsed += 1 / fps) incoming.update(Math.min(1 / fps, 0.5 - elapsed))
    const strength = incoming.strength
    assert(incoming.visible && strength > 0 && strength < 0.1)
    incoming.update(0); incoming.update(-1); assert.equal(incoming.strength, strength)
    incoming.update(0.2); assert(!incoming.visible); assert.equal(incoming.strength, 0)
    return strength
  })
  near(samples[0], samples[1], 1e-12); near(samples[0], samples[2], 1e-12)
  const incoming = new IncomingFire()
  incoming.pulse(-4, 'Behind'); assert(!incoming.visible); assert.equal(incoming.strength, 0)
  incoming.pulse(0.9, 'Left'); incoming.pulse(0.1, 'Right'); assert.equal(incoming.direction, 'Left')
  incoming.pulse(1, 'Right'); assert.equal(incoming.direction, 'Right')
  for (let frame = 0; frame < 10000; frame++) {
    incoming.pulse(frame % 2 ? 0.05 : 4, frame % 2 ? 'Left' : 'Right')
    incoming.update(1 / 144)
    assert(Number.isFinite(incoming.strength) && incoming.strength >= 0 && incoming.strength <= 1)
  }
  incoming.update(1); assert.equal(incoming.strength, 0); assert(!incoming.visible)
  incoming.pulse(1, 'Behind'); incoming.clear()
  assert.equal(incoming.strength, 0); assert(!incoming.visible); assert.equal(incoming.direction, 'Ahead')
  console.log('PASS Incoming-fire pressure stays finite and bounded under sustained fire, prioritizes stronger directions, pauses, recovers and clears')
}
