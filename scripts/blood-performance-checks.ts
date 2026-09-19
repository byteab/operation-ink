import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CollisionWorld } from '../src/player/collision'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import { MissionBlood } from '../src/game/hit-reactions'
import { fence } from '../src/world/industrial'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
{
  const scene = new THREE.Scene()
  const solid = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  solid.position.set(0, 1, 0); solid.rotation.y = 0.4; solid.scale.set(1.1, 1, 0.8); scene.add(solid)
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.2), new THREE.MeshBasicMaterial())
  door.userData.doorHinge = true; door.position.set(20, 1, 1); scene.add(door)
  scene.add(fence('Region wire', [[-3, 2], [3, 2]]))
  const world = new CollisionWorld(scene), region = world.region(new THREE.Box3(v(-4, -1, -4), v(4, 4, 4)))
  for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
    solid.material.side = side
    for (let i = -8; i <= 8; i++) for (const sign of [-1, 1]) {
      const origin = v(i * 0.1, 1, -sign * 3), direction = v(0.08, 0, sign).normalize()
      assert(Math.abs(world.rayDistance(origin, direction, 6) - region.rayDistance(origin, direction, 6)) < 1e-6, 'Regional ray preserves transforms, near/far and material sidedness')
    }
  }
  door.position.set(1.5, 1, 0); world.refresh()
  assert(region.rayDistance(v(1.5, 1, -3), v(0, 0, 1), 6) < 3, 'Door moving into cached region remains collision-active')
  let disposed = 0
  solid.geometry.addEventListener('dispose', () => disposed++)
  region.dispose()
  assert.equal(disposed, 0, 'Query view never disposes shared world geometry')
  assert(world.rayDistance(v(1.5, 1, -3), v(0, 0, 1), 6) < 3, 'Disposing region does not clear main-world colliders')
  world.dispose()
}
console.log('PASS Regional ray parity across transforms/materials/fences; moving doors remain included and view disposal leaves shared resources intact')

const scene = new THREE.Scene(), compound = createCompound(), mission = createMissionWorld()
prepareCompound(compound); scene.add(compound, mission.root)
const world = new CollisionWorld(scene), blood = new MissionBlood(scene, world)
const point = v(-40.2, 1.4, -53.15), direction = v(0, 0, 1)
const profile = (count: number) => {
  blood.clear()
  const emissionStart = performance.now()
  for (let i = 0; i < count; i++) blood.emitHit({ zone: 'torso', point, direction, lethal: true })
  const emissionMs = performance.now() - emissionStart
  assert.equal(blood.snapshot().droplets.length, Math.min(72 * count, 192))
  const times: number[] = []
  for (let i = 0; i < 160; i++) { const start = performance.now(); blood.update(1 / 60); times.push(performance.now() - start) }
  times.sort((a, b) => a - b)
  assert.equal(blood.snapshot().droplets.length, 0)
  return { emissionMs, p95Ms: times[Math.floor(times.length * 0.95)], maxMs: times.at(-1), meanMs: times.reduce((a, b) => a + b, 0) / times.length }
}
console.log('Full-map blood timing', JSON.stringify({ normal: profile(1), capped: profile(120) }))

// A second implementation path using the complete world must produce the same
// particles/stamps when effects cross a regional boundary or fall from a tower.
const reference = new MissionBlood(scene, { floor: (...args) => world.floor(...args), rayDistance: (...args) => world.rayDistance(...args) })
for (const position of [v(11.99, 1.4, -42), v(14.65, 13.8, -34.05)]) {
  blood.clear(); reference.clear()
  for (const effect of [blood, reference]) effect.emitHit({ zone: 'torso', point: position, direction: v(1, 0, 0), lethal: false })
  for (let i = 0; i < 160; i++) { blood.update(1 / 60); reference.update(1 / 60) }
  const actual = blood.snapshot(), expected = reference.snapshot()
  assert.equal(actual.seed, expected.seed)
  assert.equal(actual.stains.length, expected.stains.length)
  for (let i = 0; i < actual.stains.length; i++) {
    assert(v(...actual.stains[i].position).distanceTo(v(...expected.stains[i].position)) < 1e-6)
    assert(Math.abs(actual.stains[i].size - expected.stains[i].size) < 1e-6)
  }
}
console.log('PASS Cached regional blood matches full-world collision results across tile boundaries and on raised tower decks')
blood.dispose(); reference.dispose(); world.dispose()
