import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CollisionWorld } from '../src/player/collision'
import { BulletTrails, bulletFlightTime } from '../src/game/bullet-trails'
import { MissionImpacts } from '../src/game/impacts'
import { MissionRuntime } from '../src/game/runtime'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import type { PlayerSense, WeaponName } from '../src/game/types'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
function fixture() {
  const scene = new THREE.Scene(), hinge = new THREE.Group()
  hinge.userData.doorHinge = true
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.14), new THREE.MeshBasicMaterial())
  wall.position.set(0, 1.5, 0); hinge.add(wall); scene.add(hinge)
  const world = new CollisionWorld(scene), impacts = new MissionImpacts(scene, world)
  return { scene, hinge, wall, world, impacts, dispose() {
    impacts.dispose(); world.dispose(); wall.geometry.dispose(); wall.material.dispose()
  } }
}

{
  const f = fixture(), marks = f.impacts.splashes!
  // A grazing shot at an edge still paints the wall plane, not a floating plane
  // perpendicular to travel, and never reaches the wall's reverse side.
  const origin = v(1.8, 1.5, -2), direction = v(-0.82, 0, 1.93).normalize()
  const hit = f.world.raySurface(origin, direction, 10)!
  assert(hit && hit.mesh === f.wall && hit.normal.equals(v(0, 0, -1)))
  assert(Math.abs(hit.distance - f.world.rayDistance(origin, direction, 10)) < 1e-8)
  const contact = hit.point.clone()
  f.impacts.emit(hit.point, direction, hit, 'ak')
  assert(hit.point.equals(contact), 'Projection preserves the authoritative world contact')
  assert.equal(marks.count, 1)
  const range = marks.mesh.getGeometryRangeAt(0)!, positions = marks.mesh.geometry.getAttribute('position')
  const matrix = new THREE.Matrix4(); marks.mesh.getMatrixAt(0, matrix)
  for (let i = range.vertexStart; i < range.vertexStart + range.vertexCount; i++) {
    const p = v().fromBufferAttribute(positions, i).applyMatrix4(matrix)
    assert(Math.abs(p.z + 0.07) < 1e-6, 'All ink geometry hugs the struck face')
    assert(p.x <= 1.000001 && p.x >= -1.000001, 'Splashes clip to the object edge')
  }
  f.hinge.rotation.y = 0.9; f.world.refresh(); marks.update(0.1)
  marks.mesh.getMatrixAt(0, matrix)
  assert(matrix.elements.every((value, i) => Math.abs(value - f.wall.matrixWorld.elements[i]) < 1e-6), 'Ink follows a swinging door')
  f.impacts.emit(hit.point, direction, hit, 'ak')
  assert.equal(marks.count, 2, 'A door swinging during bullet flight still receives its pending contact')
  f.hinge.scale.set(1.5, 0.8, 0.4); f.world.refresh()
  const target = v(0, 0, -0.07).applyMatrix4(f.wall.matrixWorld)
  const toward = v(0.4, 0.2, 1).normalize(), source = target.clone().addScaledVector(toward, -3)
  const rotatedHit = f.world.raySurface(source, toward, 10)!
  const expectedNormal = v(0, 0, -1).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(f.wall.matrixWorld))
  assert(rotatedHit && rotatedHit.normal.distanceTo(expectedNormal) < 1e-7)
  const frozen = marks.count
  marks.update(0); marks.update(-1); assert.equal(marks.count, frozen)
  marks.update(41)
  const opacity = new THREE.Vector4(); marks.mesh.getColorAt(0, opacity)
  assert(opacity.w > 0 && opacity.w < 1, 'Old stains fade instead of popping away')
  marks.update(5); assert.equal(marks.count, 0); assert(!marks.mesh.getVisibleAt(0))
  f.dispose()
}
console.log('PASS Oblique splashes clip at edges, stay on the correct face, follow moving/scaled doors, pause and fade')

{
  const f = fixture(), marks = f.impacts.splashes!, originalGeometry = marks.mesh.geometry
  const hit = f.world.raySurface(v(0, 1.5, -2), v(0, 0, 1), 10)!
  for (let i = 0; i < 500; i++) f.impacts.emit(hit.point, v(0, 0, 1), hit, i % 2 ? 'shotgun' : 'ak')
  assert.equal(marks.count, 128); assert.equal(marks.mesh.geometry, originalGeometry)
  assert.equal(marks.mesh.instanceCount, 128)
  assert.equal(f.scene.children.filter(o => o.userData.noCollision).length, 3, 'All impacts use three reusable render objects')
  const rebuilt = new CollisionWorld(f.scene)
  assert.equal(rebuilt.raySurface(v(0, 1.5, -2), v(0, 0, 1), 10)?.mesh, f.wall, 'Ink never intercepts subsequent bullets')
  rebuilt.dispose()
  f.impacts.clear(); assert.equal(marks.count, 0)
  f.impacts.emit(hit.point, v(0, 0, 1), hit); assert.equal(marks.count, 1)
  let disposed = 0
  const material = marks.mesh.material as THREE.MeshBasicMaterial
  for (const resource of [marks.mesh.geometry, material, material.map!]) resource.addEventListener('dispose', () => disposed++)
  f.dispose(); assert.equal(disposed, 3); assert.equal(f.scene.children.length, 1)
}
console.log('PASS Sustained fire caps stains at 128, reuses buffers, excludes ink from ballistics and disposes textures/geometry')

{
  const trails = new BulletTrails(new THREE.Scene()), end = v(0, 0, 70)
  let arrivals = 0
  trails.emit(v(), end, 'ak', undefined, () => arrivals++)
  trails.update(0.099); assert.equal(arrivals, 0)
  trails.update(0); assert.equal(arrivals, 0)
  trails.update(0.002); assert.equal(arrivals, 1)
  trails.update(1); assert.equal(arrivals, 1)
  trails.emit(v(), end, 'ak', undefined, () => arrivals++)
  trails.clear(); trails.update(1); assert.equal(arrivals, 1, 'Reset discards pending splashes')
  trails.emit(v(), end, 'ak', undefined, () => arrivals++)
  trails.update(1); assert.equal(arrivals, 2, 'A skipped flight still impacts exactly once')
  trails.dispose()
}

{
  const f = fixture(), trails = new BulletTrails(f.scene)
  const runtime = Object.create(MissionRuntime.prototype) as any
  let bodyHit = false, sounds = 0
  Object.assign(runtime, { isActive: () => true, state: { shots: 0 }, player: { world: f.world },
    ai: { nearMiss() {}, hit: () => bodyHit }, audio: { play() { sounds++ } }, impacts: f.impacts, bulletTrails: trails })
  const shot = { origin: v(0, 1.5, -2), direction: v(0, 0, 1), range: 100, weapon: 'ak', damage: 34 }
  runtime.shot(shot)
  assert.equal(runtime.state.shots, 1); assert.equal(f.impacts.splashes!.count, 0)
  trails.update(bulletFlightTime(1.93))
  assert.equal(f.impacts.splashes!.count, 1); assert.equal(sounds, 1)
  f.impacts.clear(); bodyHit = true; runtime.shot(shot); trails.update(1)
  assert.equal(f.impacts.splashes!.count, 0, 'A body stops the shot before the wall')
  bodyHit = false; runtime.shot({ ...shot, direction: v(0, 1, 0) }); trails.update(1)
  assert.equal(f.impacts.splashes!.count, 0, 'Sky shots never invent a surface')
  trails.dispose(); f.dispose()
}
console.log('PASS Actual player shot path delays sound/splash until arrival; body hits and open-air shots leave no wall stains')

for (const weapon of ['pistol', 'ak', 'smg', 'shotgun', 'sniper'] as WeaponName[]) {
  const f = fixture()
  f.wall.scale.set(15, 2, 1); f.hinge.position.z = 30; f.world.refresh()
  const ai = new EnemyDirector({ scene: f.scene, world: f.world, doors: [],
    specs: [{ id: 'ink-check', name: 'Guard', position: [0, 0, 0], patrol: [], weapon, facing: 0 }],
    emit() {}, damagePlayer() { throw new Error('A miss must not deal damage') }, dropWeapon() {},
    onSurfaceHit: (point, direction, surface, name) => f.impacts.emit(point, direction, surface, name),
  }, async () => {
    const root = new THREE.Group()
    return { root, reactionRemaining: 0, update() {}, shoot() {}, restore() {}, dispose() {},
      muzzle: () => v(0, 1.4, 0.3) } as unknown as EnemyActor
  })
  await ai.init()
  const player: PlayerSense = { feet: v(0, 0, 10), eye: v(0, 1.65, 10), velocity: v(), alive: true, radioEnabled: false }
  const internals = ai as any, enemy = ai.enemies[0]
  internals.random = () => 0.99; internals.lastPlayer = player
  Object.assign(enemy, { state: 'combat', moveSpeed: 0, settledFor: 1, aimTime: 2, hitPause: 0, yaw: 0 })
  assert(internals.shoot(enemy, player)); assert.equal(f.impacts.splashes!.count, 0)
  ai.bulletTrails.update(0.16)
  assert.equal(f.impacts.splashes!.count, 1, `${weapon} miss reaches a wall 20 m behind the player`)
  ai.dispose(); f.dispose()
}
console.log('PASS All five enemy weapons paint actual cover beyond the player on visible arrival, without damage')

{
  const scene = new THREE.Scene(), compound = createCompound(), mission = createMissionWorld()
  prepareCompound(compound); scene.add(compound, mission.root)
  const world = new CollisionWorld(scene), impacts = new MissionImpacts(scene, world)
  const origins = [v(-40, 1.6, -53), v(11, 1.6, -42), v(110, 1.6, -12), v(-49, 2.5, 5)]
  const durations: number[] = []; let hits = 0
  for (const origin of origins) for (let i = 0; i < 32; i++) {
    const direction = v(Math.cos(i * Math.PI / 16), i % 3 === 0 ? -0.3 : 0, Math.sin(i * Math.PI / 16)).normalize()
    const start = performance.now(), hit = world.raySurface(origin, direction, 80)
    if (hit) {
      impacts.emit(hit.point, direction, hit, 'ak'); hits++
      assert.equal(impacts.splashes!.count, Math.min(128, hits), 'Actual map surfaces all accept a clipped splash')
    }
    durations.push(performance.now() - start)
  }
  assert(hits > 80)
  durations.sort((a, b) => a - b)
  console.log(`PASS Full-map ${hits} real contacts; CPU cast + projection p95 ${durations[Math.floor(durations.length * 0.95)].toFixed(2)} ms, max ${durations.at(-1)!.toFixed(2)} ms`)
  impacts.dispose(); world.dispose()
}
