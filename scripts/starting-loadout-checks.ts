import assert from 'node:assert/strict'
import * as THREE from 'three'
import { FirstPersonWeapons } from '../src/game/weapons'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { SHOTGUN_PELLETS, WEAPON_RULES, shotgunDamageMultiplier } from '../src/game/balance'
import { CollisionWorld } from '../src/player/collision'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import type { Shot, SoundEvent, WeaponFrame } from '../src/game/types'
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
function fixture(wall = false) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.06, 200)
  camera.position.set(0, 1.7, 0); scene.add(camera)
  if (wall) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 0.2), new THREE.MeshBasicMaterial()); mesh.position.set(0, 1.5, -0.6); scene.add(mesh) }
  const world = new CollisionWorld(scene), shots: Shot[] = [], sounds: SoundEvent[] = []
  const weapons = new FirstPersonWeapons({ scene, camera, world, onShot: s => shots.push(s), emit: e => sounds.push(e) })
  const frame: WeaponFrame = { active: true, climbing: false, moving: 0, aiming: false, reducedMotion: false, feet: v() }
  const step = (seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) weapons.update(1 / 60, frame) }
  step(1 / 60)
  return { scene, camera, world, weapons, shots, sounds, frame, step, dispose() { weapons.dispose(); world.dispose() } }
}
{
  const f = fixture()
  const fresh = f.weapons.snapshot()
  assert.deepEqual(fresh.slots.map(w => w?.name), ['pistol', 'shotgun', 'ak', 'smg'])
  assert.equal(fresh.selected, 2)
  assert.equal(f.weapons.current?.name, 'ak', 'Fresh missions equip the AK-47')
  assert.equal(f.weapons.ammo, '30 / 90')
  assert(!fresh.slots.some(w => w?.name === 'sniper'))
  for (let i = 0; i < 4; i++) { f.weapons.switchSlot(i); f.step(0.3); assert.equal(f.weapons.current?.name, fresh.slots[i]?.name) }
  assert(!f.weapons.switchSlot(4)); assert(!f.weapons.switchSlot(-1)); assert(!f.weapons.switchSlot(1.5))
  const snapshot = f.weapons.snapshot(); f.weapons.restore(snapshot); assert.deepEqual(f.weapons.snapshot(), snapshot)
  assert.equal(f.weapons.selected, 3)
  const second = fixture(); f.weapons.current!.magazine = 1
  assert.equal(second.weapons.slots[3]?.magazine, 24, 'starting inventories cannot share mutable ammo')
  f.weapons.restore(fresh)
  assert.equal(f.weapons.current?.name, 'ak', 'Restoring the insertion checkpoint equips the AK-47')
  f.dispose(); second.dispose()
}
console.log('PASS AK-47 starts equipped; four independent guns keep their slots and checkpoint selection')
{
  const f = fixture(); f.weapons.switchSlot(1); f.step(0.3)
  f.weapons.trigger(true); f.weapons.trigger(false); f.step(1 / 60)
  assert.equal(f.shots.length, SHOTGUN_PELLETS); assert.equal(f.weapons.current!.magazine, 5)
  assert.equal(f.sounds.filter(e => e.kind === 'shot-shotgun').length, 1)
  assert.equal(new Set(f.shots.map(s => s.direction.toArray().join(','))).size, SHOTGUN_PELLETS)
  assert(f.shots.every(s => Math.abs(s.direction.length() - 1) < 1e-8 && s.range === 32 && s.damage === WEAPON_RULES.shotgun.damage))
  assert.deepEqual(f.shots.map(s => s.pelletIndex), [0, 1, 2, 3, 4, 5, 6, 7])
  f.step(0.24)
  const model = f.scene.getObjectByName('Firing hand grip mount')!.children.find(o => o.userData.parts)!
  const pump = model.userData.parts.pump as THREE.Object3D
  assert(pump.position.z < 0.24, 'pump actually travels after firing')
  assert(f.sounds.some(e => e.kind === 'weapon-pump'))
  f.step(1)
  assert.equal(f.shots.length, 8, 'shotgun remains semi-automatic')
  assert(Math.abs(pump.position.z - 0.26) < 1e-8)
  f.dispose()
}
console.log('PASS Shotgun emits eight spread pellets per shell, one report and a visible pump cycle')
{
  const f = fixture(); f.weapons.switchSlot(1); f.step(0.3)
  f.weapons.current!.magazine = 2; f.weapons.current!.reserve = 4
  assert(f.weapons.reload()); f.step(0.5); assert.equal(f.weapons.current!.magazine, 2)
  f.step(0.2); assert.equal(f.weapons.current!.magazine, 3); assert.equal(f.weapons.current!.reserve, 3)
  f.weapons.trigger(true); f.weapons.trigger(false); f.step(1 / 60)
  assert(!f.weapons.reloading); assert.equal(f.weapons.current!.magazine, 2); assert.equal(f.weapons.current!.reserve, 3)
  f.step(1); assert(f.weapons.reload()); f.step(3)
  assert.equal(f.weapons.ammo, '5 / 0'); assert(!f.weapons.reloading)
  const saved = f.weapons.snapshot(); f.weapons.restore(saved); assert.deepEqual(f.weapons.snapshot(), saved)
  f.dispose()
}
console.log('PASS Shell-by-shell reload conserves ammo and can be interrupted to fire')
{
  const f = fixture(true); f.weapons.switchSlot(1); f.step(0.3)
  f.weapons.trigger(true); f.step(0.2)
  assert.equal(f.shots.length, 0); assert.equal(f.weapons.current!.magazine, 6); assert(f.weapons.blocked)
  f.dispose()
}
console.log('PASS Solid cover blocks the shotgun muzzle without spending a shell')
{
  const f = fixture(); f.weapons.switchSlot(3); f.step(0.3)
  f.weapons.addPickup({ id: 'found-sniper', name: 'sniper', magazine: 5, reserve: 10, position: [0, 0, -1] })
  f.camera.lookAt(f.weapons.pickupTargets().find(p => p.id === 'found-sniper')!.point)
  assert(f.weapons.pickup('found-sniper'))
  assert.deepEqual(f.weapons.slots.map(w => w?.name), ['pistol', 'shotgun', 'ak', 'sniper'])
  assert(f.weapons.snapshot().pickups.some(w => w.id === 'player-smg' && w.magazine === 24 && w.reserve === 72))
  f.frame.aiming = true; f.step(0.3)
  assert(f.weapons.scoped, 'A picked-up sniper can enter its scope')
  assert(f.weapons.adjustScopeZoom(1))
  assert.equal(f.weapons.scopeMagnification, 5)
  f.dispose()
}
console.log('PASS A picked-up sniper swaps only the selected gun, preserves ammunition and supports adjustable zoom')
for (const distance of [3, 28]) {
  const scene = new THREE.Scene(), world = new CollisionWorld(scene)
  const ai = new EnemyDirector({ scene, world, doors: [], specs: [{ id: 'target', name: 'Target', position: [0, 0, -distance], patrol: [], weapon: 'pistol' }], emit() {}, damagePlayer() {}, dropWeapon() {} }, async () => {
    const root = new THREE.Group()
    return { root, reactionRemaining: 0, animationTime: 0, update() {}, react() {}, restore() {}, dispose() {}, muzzle: () => root.position.clone() } as unknown as EnemyActor
  })
  await ai.init()
  assert(ai.hit({ origin: v(0, 1.1), direction: v(0, 0, -1), range: 32, damage: WEAPON_RULES.shotgun.damage, weapon: 'shotgun' }, 32))
  const damage = 100 - ai.enemies[0].health
  if (distance === 3) assert.equal(damage, WEAPON_RULES.shotgun.damage)
  else assert(damage < WEAPON_RULES.shotgun.damage * shotgunDamageMultiplier(26), 'individual shotgun pellets lose energy at long range')
  ai.dispose(); world.dispose()
}
console.log('PASS Shotgun damage falls off from close to long range')

const scene = new THREE.Scene(), compound = createCompound(), mission = createMissionWorld()
prepareCompound(compound); scene.add(compound, mission.root); scene.updateMatrixWorld(true)
const ladder = v(-48.665, 0, -51.35)
for (const enemy of mission.enemies) {
  const points = enemy.patrol.length ? enemy.patrol : [enemy.position]
  for (let i = 0; i < points.length; i++) {
    const a = new THREE.Vector3(...points[i]).setY(0), b = new THREE.Vector3(...points[(i + 1) % points.length]).setY(0)
    const closest = new THREE.Line3(a, b).closestPointToPoint(ladder, true, v())
    assert(closest.distanceTo(ladder) >= 12, `${enemy.id} route enters the clear ladder area`)
  }
}
assert(!mission.enemies.some(e => ['signals-operator', 'signals-records', 'mess-west-aisle'].includes(e.id)))
console.log('PASS No enemy spawn or authored patrol segment enters the 12m ladder approach')
