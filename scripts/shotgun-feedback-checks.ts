import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CollisionWorld } from '../src/player/collision'
import { MissionBlood, reactionClipName, type HitReaction } from '../src/game/hit-reactions'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
for (const zone of ['head', 'torso', 'arm', 'leg'] as const) for (const behind of [false, true]) {
  assert.equal(reactionClipName({ zone, lethal: true, weapon: 'shotgun', bone: 'thigh.L' }, behind), 'dieShotgun')
  assert(reactionClipName({ zone, lethal: false, weapon: 'shotgun' }, behind).startsWith('flinch'))
}
assert.equal(reactionClipName({ zone: 'torso', lethal: true, weapon: 'ak' }, true), 'dieBack')
assert.equal(reactionClipName({ zone: 'leg', lethal: true, bone: 'shin.L' }, false), 'dieLegLeft')
console.log('PASS Fatal shotgun selects airborne reaction; nonfatal and other weapons retain regional reactions')

const scene = new THREE.Scene()
const floor = new THREE.Mesh(new THREE.BoxGeometry(40, .2, 40), new THREE.MeshBasicMaterial())
floor.position.y = -.1; scene.add(floor)
const world = new CollisionWorld(scene)
let body: THREE.Vector3 | null = v(0, 1.2, 0)
const blood = new MissionBlood(scene, world, () => body?.clone() ?? null)
const hit: HitReaction = { zone: 'torso', point: v(0, 1.2, 0), direction: v(0, 0, 1), lethal: true, weapon: 'shotgun', targetId: 'guard' }
blood.emitHit(hit)
assert.equal(blood.snapshot().droplets.length, 144)
assert.equal(blood.snapshot().shotgunBursts!.length, 1)
assert(!blood.snapshot().stains.some(stain => stain.grow), 'Growing pool waits for the moving body to land')
const initial = blood.snapshot(); blood.update(0); assert.deepEqual(blood.snapshot(), initial)
body = v(.1, 1, 1)
for (let i = 0; i < 8; i++) blood.update(1 / 60)
assert(blood.snapshot().droplets.some(drop => drop.position[2] > .8 && drop.age < .04), 'Blood trail follows the actual chest position')
const midway = blood.snapshot()
const advance = () => { for (let i = 0; i < 42; i++) blood.update(1 / 60) }
body = v(.2, .2, 1.7)
advance(); const settled = blood.snapshot()
const pool = settled.stains.find(stain => stain.grow)
assert(pool && Math.abs(pool.position[0] - .2) < .001 && Math.abs(pool.position[2] - 1.7) < .001)
assert.equal(settled.shotgunBursts!.length, 0)
blood.restore(midway); advance(); assert.deepEqual(blood.snapshot(), settled, 'Restore resumes the same delayed events and RNG state')
console.log('PASS Shotgun blood follows airborne body, pauses, pools at landing, and restores deterministically')

blood.clear(); body = v(0, 1.2, 0)
blood.emitHit(hit); body = null
for (let i = 0; i < 180; i++) blood.update(1 / 60)
assert.equal(blood.snapshot().shotgunBursts!.length, 0)
assert(!blood.snapshot().stains.some(stain => stain.grow), 'Removed/reset target cannot emit a late impact pool')
blood.clear(); body = v(0, 1.2, 0)
for (let i = 0; i < 40; i++) blood.emitHit({ ...hit, targetId: `guard-${i}` })
assert.equal(blood.snapshot().droplets.length, 192)
assert(blood.snapshot().stains.length <= 512)
assert.equal(blood.snapshot().shotgunBursts!.length, 16)
blood.clear(); blood.update(.05)
assert.equal(blood.snapshot().droplets.length + blood.snapshot().stains.length + blood.snapshot().shotgunBursts!.length, 0)
blood.emitHit(hit); blood.dispose(); blood.update(.05)
assert.equal(blood.snapshot().shotgunBursts!.length, 0)
world.dispose()
console.log('PASS Reset/dispose cancels delayed blood; multiple shotgun deaths keep existing particle/decal limits and bounded event storage')
