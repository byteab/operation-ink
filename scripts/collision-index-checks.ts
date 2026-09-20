// The cell index, triangle-tree rays and range culling in CollisionWorld are optimizations only: every query must
// equal the original whole-world scan (kept below as the reference) bit for bit, in three door states.
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { CollisionWorld } from '../src/player/collision'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import { setDoorOpen, updateDoors } from '../src/world/doors'

const scene = new THREE.Scene(), compound = createCompound(), mission = createMissionWorld(compound)
prepareCompound(compound); scene.add(compound, mission.root); scene.updateMatrixWorld(true)
const world = new CollisionWorld(scene) as any, doors: THREE.Group[] = []
scene.traverse(object => { if (object.userData.kind === 'door') doors.push(object as THREE.Group) })
const up = new THREE.Vector3(0, 1, 0)

// The original implementations, verbatim, against the same collider records and trees.
function floorReference(position: THREE.Vector3, above: number, below: number, radius = 0) {
  let height = -Infinity
  for (const [x, z] of radius ? [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]] : [[0, 0]]) {
    world.ray.ray.origin.set(position.x + x, position.y + above, position.z + z)
    world.ray.ray.direction.set(0, -1, 0)
    world.ray.near = 0
    world.ray.far = above + below
    for (const collider of world.colliders) {
      if (collider.bounds.max.y < world.ray.ray.origin.y - world.ray.far || collider.bounds.min.y > world.ray.ray.origin.y) continue
      if (!world.ray.ray.intersectsBox(collider.bounds)) continue
      world.groundRay.copy(world.ray.ray).applyMatrix4(collider.inverse)
      const hit = world.tree(collider).rayIntersect(world.groundRay)
      if (!hit || hit.distance > world.ray.far) continue
      hit.triangle.getNormal(world.normal).transformDirection(collider.mesh.matrixWorld)
      if (world.normal.dot(up) > 0.55) height = Math.max(height, hit.position.applyMatrix4(collider.mesh.matrixWorld).y)
    }
  }
  return height
}
function fitsReference(capsule: Capsule) {
  const bounds = world.capsuleBounds(capsule)
  for (const collider of world.colliders) if (bounds.intersectsBox(collider.bounds)) {
    const hit = world.collision(collider, capsule)
    if (hit && hit.depth > 0.008) return false
  }
  return true
}

function visibleReference(from: THREE.Vector3, to: THREE.Vector3) {
  world.ray.ray.origin.copy(from)
  world.ray.ray.direction.copy(to).sub(from).normalize()
  world.ray.near = 0.02
  world.ray.far = Math.max(0.02, from.distanceTo(to) - 0.06)
  for (const collider of world.colliders) {
    if (!collider.blocksSight) continue
    if (world.ray.ray.intersectsBox(collider.bounds) && world.ray.intersectObject(collider.mesh, false).length) return false
  }
  return true
}
function rayDistanceReference(origin: THREE.Vector3, direction: THREE.Vector3, range: number) {
  world.ray.set(origin, direction); world.ray.near = 0.01; world.ray.far = range
  let distance = range
  for (const collider of world.colliders) {
    if (!collider.blocksShots || !world.ray.ray.intersectsBox(collider.bounds)) continue
    const hit = world.ray.intersectObject(collider.mesh, false)[0]
    if (hit && hit.distance < distance) distance = hit.distance
  }
  return distance
}
function raySurfaceReference(origin: THREE.Vector3, direction: THREE.Vector3, range: number) {
  world.ray.set(origin, direction); world.ray.near = 0.01; world.ray.far = range
  let closest: { distance: number; mesh: THREE.Mesh } | null = null
  for (const collider of world.colliders) {
    if (!collider.blocksShots || !world.ray.ray.intersectsBox(collider.bounds)) continue
    const hit = world.ray.intersectObject(collider.mesh, false)[0]
    if (!hit?.face || hit.distance >= (closest?.distance ?? range)) continue
    closest = { distance: hit.distance, mesh: collider.mesh }
  }
  return closest
}
const nobody = new THREE.Object3D()
let seed = 12345
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
const anchors: THREE.Vector3[] = []
for (const enemy of mission.enemies) { anchors.push(new THREE.Vector3(...enemy.position)); for (const point of enemy.patrol) anchors.push(new THREE.Vector3(...point)) }
for (const door of doors) anchors.push(door.getWorldPosition(new THREE.Vector3()))
const probes: [number, number, number][] = [[0.38, 0.65, 0.29], [0.15, 0.25, 0], [0.1, 2, 0], [1, 2, 0], [0.38, 2.2, 0.1], [0.16, 0.26, 0]]
const capsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.3)
let floors = 0, fits = 0, finite = 0, blocked = 0, rays = 0, clear = 0, shots = 0, struck = 0
for (let round = 0; round < 3; round++) {
  // Round 1 swings every door half open, round 2 fully open: dynamic bounds move between rounds.
  if (round) { for (const door of doors) setDoorOpen(door, true, round === 2); updateDoors(doors, 0.2); scene.updateMatrixWorld(true); world.refresh() }
  for (let i = 0; i < 6000; i++) {
    const anchor = anchors[Math.floor(random() * anchors.length)]
    const spread = i % 3 === 0 ? 0.6 : i % 3 === 1 ? 6 : 60
    const point = new THREE.Vector3(anchor.x + (random() - 0.5) * spread, anchor.y + (random() - 0.5) * (i % 5 ? 0.3 : 6), anchor.z + (random() - 0.5) * spread)
    // Exercise exact cell borders too.
    if (i % 11 === 0) point.x = Math.round(point.x / 8) * 8
    if (i % 13 === 0) point.z = Math.round(point.z / 8) * 8
    const [above, below, radius] = probes[i % probes.length]
    const expected = floorReference(point, above, below, radius), actual = world.floor(point, above, below, radius)
    assert(Object.is(expected, actual), `floor mismatch at ${point.toArray()} (${above}, ${below}, ${radius}): ${expected} vs ${actual}`)
    floors++; if (Number.isFinite(actual)) finite++
    capsule.radius = i % 2 ? 0.3 : 0.27
    capsule.start.copy(point).y += capsule.radius; capsule.end.copy(point).y += 1.74 - capsule.radius
    const expectedFit = fitsReference(capsule), actualFit = world.fits(capsule)
    assert.equal(actualFit, expectedFit, `fits mismatch at ${point.toArray()}`)
    fits++; if (!actualFit) blocked++
    if (i % 4 === 0) {
      // Eye-height sight lines of 1-80 m, as sensing, hearing and shooting use.
      const other = anchors[Math.floor(random() * anchors.length)]
      const from = point.clone().setY(anchor.y + 1.5), reach = 1 + random() * 80
      const to = i % 8 ? new THREE.Vector3(from.x + (random() - 0.5) * reach, from.y + (random() - 0.5) * 6, from.z + (random() - 0.5) * reach) : other.clone().setY(other.y + 1.5)
      const expectedSight = visibleReference(from, to), actualSight = world.visible(from, to, nobody)
      assert.equal(actualSight, expectedSight, `visible mismatch ${from.toArray()} -> ${to.toArray()}`)
      rays++; if (actualSight) clear++
      // Ballistic rays: 0.24-0.9 m muzzle probes and full-range shots.
      const direction = to.clone().sub(from).normalize(), range = i % 3 ? 0.24 + random() * 0.7 : 40 + random() * 300
      const expectedDistance = rayDistanceReference(from, direction, range), actualDistance = world.rayDistance(from, direction, range)
      assert(Object.is(expectedDistance, actualDistance), `rayDistance mismatch ${from.toArray()} ${direction.toArray()} ${range}: ${expectedDistance} vs ${actualDistance}`)
      const expectedSurface = raySurfaceReference(from, direction, range), actualSurface = world.raySurface(from, direction, range)
      assert(expectedSurface?.mesh === actualSurface?.mesh && Object.is(expectedSurface?.distance, actualSurface?.distance), 'raySurface mismatch')
      shots++; if (actualDistance < range) struck++
    }
  }
}
console.log(`identical: ${floors} floor probes (${finite} on a surface), ${fits} capsule fits (${blocked} blocked), ${rays} sight lines (${clear} clear), ${shots} ballistic rays x2 (${struck} struck)`)
