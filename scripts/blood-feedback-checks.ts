import assert from 'node:assert/strict'
import * as THREE from 'three'
import { MissionBlood, type HitReaction } from '../src/game/hit-reactions'
import { CollisionWorld } from '../src/player/collision'

const scene = new THREE.Scene()
const floor = new THREE.Mesh(new THREE.BoxGeometry(30, 0.2, 30), new THREE.MeshBasicMaterial())
floor.position.y = -0.1
scene.add(floor)
let world = new CollisionWorld(scene)
const blood = new MissionBlood(scene, {
  floor: (...args) => world.floor(...args), rayDistance: (...args) => world.rayDistance(...args),
})
const hit: HitReaction = { zone: 'torso', point: new THREE.Vector3(0, 1.2, 0), direction: new THREE.Vector3(0, 0, 1), lethal: false }
const droplets = blood.root.getObjectByName('Impact blood droplets') as THREE.InstancedMesh
const marks = blood.root.getObjectByName('Blood pigment stains') as THREE.InstancedMesh
assert.equal(droplets.count, 0); assert.equal(marks.count, 0)
blood.update(1 / 60)
assert.equal(blood.snapshot().stains.length, 0, 'no effects without a confirmed hit')
blood.emitHit(hit)
const normal = blood.snapshot()
assert.equal(normal.droplets.length, 24)
assert.equal(normal.stains.length, 3)
assert(normal.droplets.every(drop => drop.radius >= 0.028 && drop.radius < 0.058))
assert(normal.droplets.some(drop => drop.velocity[2] < 0) && normal.droplets.some(drop => drop.velocity[2] > 0), 'forward spray and backscatter')
assert(new Set(normal.droplets.map(drop => drop.radius)).size > 20)
assert(normal.stains.every(stain => Math.abs(stain.position[1] - 0.006) < 0.002))
assert.equal(droplets.count, normal.droplets.length)
assert.equal(marks.count, normal.stains.length)
console.log('PASS Confirmed hits create 24 varied larger droplets and three pigment splashes; no idle/miss emission')

blood.clear(); blood.emitHit({ ...hit, lethal: true })
const lethal = blood.snapshot()
assert.equal(lethal.droplets.length, 42)
assert.equal(lethal.stains.length, 6)
const pool = lethal.stains.find(stain => stain.grow)!
assert(pool && pool.size === 0.3 && pool.grow! >= 0.55 && pool.grow! <= 0.7)
for (let i = 0; i < 300; i++) blood.update(1 / 60)
const settled = blood.snapshot()
assert.equal(settled.droplets.length, 0)
assert(settled.stains.length > lethal.stains.length, 'falling spray deposits visible splatter')
assert(settled.stains.find(stain => stain.grow)!.size > pool.size, 'fatal pool spreads over time')
assert(settled.stains.every(stain => Math.abs(stain.position[1] - 0.006) < 0.002))
console.log('PASS Fatal hits create 42 droplets and six immediate marks; a larger pool spreads and all airborne particles expire')

blood.restore(lethal)
assert.deepEqual(blood.snapshot(), lethal)
blood.update(0.05); const next = blood.snapshot()
blood.restore(lethal); blood.update(0.05)
assert.deepEqual(blood.snapshot(), next, 'checkpoint restore resumes the same trajectories and random state')
blood.clear()
for (let i = 0; i < 120; i++) blood.emitHit({ ...hit, lethal: true })
assert.equal(blood.snapshot().droplets.length, 192)
assert.equal(blood.snapshot().stains.length, 512)
assert.equal(droplets.count, 192); assert.equal(marks.count, 512)
const full = blood.snapshot()
blood.restore({ ...full, droplets: [...full.droplets, ...full.droplets], stains: [...full.stains, ...full.stains] })
assert.equal(droplets.count, 192); assert.equal(marks.count, 512)
blood.clear(); assert.equal(droplets.count, 0); assert.equal(marks.count, 0)
console.log('PASS Sustained firefights and oversized restored checkpoints remain capped at 192 droplets and 512 stamps; clear resets both meshes')

const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 0.1), new THREE.MeshBasicMaterial())
wall.position.set(0, 2, 0.5); scene.add(wall)
world.dispose(); world = new CollisionWorld(scene)
blood.emitHit({ ...hit, lethal: true })
for (let i = 0; i < 150; i++) {
  blood.update(1 / 60)
  assert(blood.snapshot().droplets.every(drop => drop.position[2] < 0.451), 'airborne blood may not tunnel through the wall')
}
assert(blood.snapshot().stains.every(stain => stain.position[2] < 0.451), 'blood must not appear on the far side of solid cover')
const constrainedPool = blood.snapshot().stains.find(stain => stain.grow)!
assert(constrainedPool.grow! * 2.3 < 0.451, 'pool growth respects nearby walls')
console.log('PASS Droplets and immediate splatter stop at solid walls; fatal pool growth is constrained to its side of cover')

blood.clear(); wall.removeFromParent(); floor.removeFromParent()
const deck = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 3), new THREE.MeshBasicMaterial())
deck.position.y = 4.9; scene.add(deck)
world.dispose(); world = new CollisionWorld(scene)
blood.emitHit({ ...hit, point: new THREE.Vector3(0, 6.2, 0), lethal: true })
for (let i = 0; i < 200; i++) blood.update(1 / 60)
assert(blood.snapshot().stains.length > 0)
assert(blood.snapshot().stains.every(stain => Math.abs(stain.position[1] - 5.006) < 0.002), 'raised floor marks stay on their actual surface')
blood.clear(); blood.emitHit({ ...hit, point: new THREE.Vector3(20, 6.2, 20), lethal: true })
assert.equal(blood.snapshot().stains.length, 0, 'unsupported hit must not create a floating pool')
for (let i = 0; i < 160; i++) blood.update(1 / 60)
assert.equal(blood.snapshot().droplets.length, 0, 'airborne droplets expire even with no supporting floor')
console.log('PASS Raised decks receive blood on the correct floor; unsupported hits create no floating stains and droplets still expire')

let disposedResources = 0
for (const resource of [droplets.geometry, droplets.material as THREE.Material, marks.geometry, marks.material as THREE.Material,
  (marks.material as THREE.ShaderMaterial).uniforms.atlas.value as THREE.Texture]) resource.addEventListener('dispose', () => disposedResources++)
blood.dispose(); blood.dispose(); blood.restore(lethal); blood.emitHit(hit); blood.update(0.05)
assert.equal(disposedResources, 5)
assert(!scene.children.includes(blood.root))
assert.equal(droplets.count, 0); assert.equal(marks.count, 0)
assert.equal(blood.snapshot().droplets.length + blood.snapshot().stains.length, 0)
world.dispose()
console.log('PASS Dispose releases both geometries/materials and the atlas exactly once; later restore/hit/update cannot revive resources')
