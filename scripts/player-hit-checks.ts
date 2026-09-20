import assert from 'node:assert/strict'
import * as THREE from 'three'
import { PlayerHitReactions, playerHitTarget, type PlayerBulletHit, type PlayerHitPose } from '../src/game/player-hit-reactions'
import { FirstPersonWeapons } from '../src/game/weapons'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { CollisionWorld } from '../src/player/collision'
import type { PlayerSense, Shot, WeaponFrame, WeaponName } from '../src/game/types'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const clearWorld = { rayDistance: (_origin: THREE.Vector3, _direction: THREE.Vector3, range: number) => range }
const hit = (region: PlayerBulletHit['region'], side: -1 | 0 | 1 = 1, direction = v(0, 0, 1)): PlayerBulletHit => ({
  region, side, point: v(side * 0.2, region === 'leg' ? 0.6 : 1.3), direction, weapon: 'ak',
})
const values = (pose: PlayerHitPose) => [pose.cameraPosition, pose.cameraRotation, pose.weaponPosition,
  pose.weaponRotation, pose.leftHand, ...pose.shoulders].flatMap(vector => vector.toArray())
const near = (actual: number, expected: number, tolerance = 1e-9) => assert(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`)
const reaction = (region: PlayerBulletHit['region'], side: -1 | 0 | 1 = 1, direction = v(0, 0, 1), grounded = true) => {
  const result = new PlayerHitReactions(); result.hit(hit(region, side, direction), 12, grounded); return result
}

{
  const player = { feet: v(12, 3, -8), yaw: 0 }
  const seen = new Set<string>()
  for (let i = 0; i < 1000; i++) {
    const a = playerHitTarget(player, (i + 0.5) / 1000)
    const b = playerHitTarget({ ...player, yaw: Math.PI / 2 }, (i + 0.5) / 1000)
    const local = a.point.clone().sub(player.feet)
    assert(local.y > 0.5 && local.y <= 1.65 + 1e-9 && Math.abs(local.x) <= 0.28 + 1e-9)
    assert(b.point.distanceTo(local.applyAxisAngle(v(0, 1), Math.PI / 2).add(player.feet)) < 1e-9)
    seen.add(`${a.region}:${a.side}`)
  }
  assert.equal(seen.size, 11, 'Both sides of five regions plus the head are reachable')
  console.log('PASS Anatomical hit targets include both hands/arms/shoulders/legs and rotate with the player')
}

{
  const left = reaction('leg', -1), right = reaction('leg', 1)
  left.update(0.13, 0); right.update(0.13, 0)
  near(left.pose.cameraRotation.z, -right.pose.cameraRotation.z)
  near(left.pose.cameraPosition.y, right.pose.cameraPosition.y)
  assert(right.pose.cameraPosition.y < -0.05, 'A planted knee buckles through eye height')
  const airborne = reaction('leg', 1, v(0, 0, 1), false)
  airborne.update(0.13, 0)
  near(airborne.pose.cameraPosition.y / right.pose.cameraPosition.y, 0.25)
  const arm = reaction('arm'); arm.update(0.045, 0)
  assert(arm.pose.shoulders[0].length() > 0 && arm.pose.shoulders[1].length() === 0)
  assert(arm.pose.weaponPosition.z > 0.05)
  assert(arm.pose.cameraRotation.length() < 0.015, 'The limb leads the head')
  const support = reaction('hand', -1); support.update(0.045, 0)
  assert(support.pose.leftHand.x < -0.04 && support.pose.shoulders[0].length() === 0)
  const poses = ['head', 'torso', 'shoulder', 'arm', 'hand', 'leg'].map(region => {
    const r = reaction(region as PlayerBulletHit['region']); r.update(0.09, 0); return JSON.stringify(values(r.pose))
  })
  assert.equal(new Set(poses).size, 6)
  for (const direction of [v(1), v(-1), v(0, 0, 1), v(0, 0, -1)]) {
    const r = reaction('torso', 0, direction); r.update(0.1, 0)
    assert(r.pose.cameraPosition.dot(direction) > 0, 'Head displacement follows bullet travel')
    r.update(0, Math.PI)
    assert(r.pose.cameraPosition.dot(direction) < 0, 'Turning preserves the force in world space')
  }
  console.log('PASS Distinct regions, mirrored balance, isolated injured limbs, delayed head motion and directional force')
}

{
  const samples = [30, 60, 144].map(fps => {
    const r = reaction('shoulder')
    for (let i = 0; i < fps / 2; i++) r.update(1 / fps, 0)
    return values(r.pose)
  })
  samples[0].forEach((value, i) => { near(value, samples[1][i]); near(value, samples[2][i]) })
  const r = reaction('leg'); r.update(0.13, 0)
  const paused = values(r.pose); r.update(0, 0); assert.deepEqual(values(r.pose), paused)
  r.update(0.57, 0); assert(values(r.pose).every(value => value === 0))
  r.hit(hit('arm'), 18, true); r.update(0.08, 0, true)
  assert(values(r.pose).every(value => value === 0)); r.update(0.01, 0)
  assert(values(r.pose).every(value => value === 0), 'Reduced motion discards pending impulses')
  for (let frame = 0; frame < 1200; frame++) {
    r.hit(hit(frame % 2 ? 'leg' : 'arm'), 90, true); r.update(1 / 144, 0)
    assert(r.pose.cameraPosition.length() <= 0.065 + 1e-9 && r.pose.cameraRotation.length() <= 0.065 + 1e-9)
    assert(r.pose.weaponPosition.length() <= 0.095 + 1e-9 && r.pose.weaponRotation.length() <= 0.19 + 1e-9)
    assert((r as any).impulses.length <= 8)
  }
  r.clear(); assert(values(r.pose).every(value => value === 0))
  console.log('PASS Frame-rate independent recovery, pause, reduced motion, exact reset and bounded sustained fire')
}

{
  const camera = new THREE.PerspectiveCamera(75, 1.5, 0.06, 300)
  camera.position.set(125, 8, -32); camera.rotation.set(-0.8, 0.75, 0, 'YXZ')
  const position = camera.position.clone(), quaternion = camera.quaternion.clone()
  const r = reaction('leg'); r.update(0.13, 0.75)
  for (let i = 0; i < 2000; i++) { r.applyCamera(camera, clearWorld); r.removeCamera() }
  assert.deepEqual(camera.position, position); assert.deepEqual(camera.quaternion.toArray(), quaternion.toArray())
  r.applyCamera(camera, clearWorld)
  near(camera.position.y - position.y, r.pose.cameraPosition.y, 1e-8)
  const full = camera.quaternion.angleTo(quaternion); r.removeCamera()
  r.applyCamera(camera, clearWorld, 1 / 8)
  assert(camera.quaternion.angleTo(quaternion) < full / 7.8)
  r.removeCamera()
  r.applyCamera(camera, { rayDistance: () => 0.01 })
  assert.deepEqual(camera.position, position, 'Cover cancels eye translation')
  r.removeCamera(); r.applyCamera(camera, clearWorld)
  const kick = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
  kick.x += 0.06; kick.y += 0.015; camera.quaternion.setFromEuler(kick)
  r.removeCamera()
  const after = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
  near(after.x, -0.74); near(after.y, 0.765); near(after.z, 0)
  assert.deepEqual(camera.position, position)
  r.applyCamera(camera, clearWorld); r.clear(); near(camera.rotation.z, 0)
  console.log('PASS Camera overlay never drifts, keeps world-vertical knee dip, limits scope/cover, preserves deliberate recoil and clears safely')
}

for (const name of ['pistol', 'ak', 'smg', 'shotgun', 'sniper'] as WeaponName[]) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 1.5, 0.06, 300)
  camera.position.set(0, 1.65, 0); scene.add(camera)
  const world = new CollisionWorld(scene), shots: Shot[] = []
  const weapons = new FirstPersonWeapons({ scene, camera, world, emit() {}, onShot: shot => shots.push(shot) })
  const w = weapons as any, r = new PlayerHitReactions()
  const frame: WeaponFrame = { active: true, climbing: false, moving: 0, aiming: false, reducedMotion: false, feet: v(), hitPose: r.pose }
  const reset = () => weapons.restore({ slots: [{ id: 'test', name, magazine: name === 'shotgun' ? 5 : 4, reserve: 50 }], selected: 0, nextId: 1, pickups: [] })
  reset(); weapons.update(0, frame)
  for (const aiming of [false, true]) {
    frame.aiming = aiming
    for (const reloading of [false, true]) {
      reset(); weapons.update(0, frame)
      if (reloading) assert(weapons.reload())
      for (let i = 0; i < 120; i++) {
        if (i % 7 === 0) r.hit(hit(i % 2 ? 'shoulder' : 'hand', i % 3 ? 1 : -1), 22, true)
        r.update(1 / 60, 0)
        r.applyCamera(camera, world, weapons.scoped ? 1 / weapons.scopeMagnification : 1)
        weapons.update(1 / 60, frame)
        for (const arm of w.arms) { near(arm.upper.scale.y, 0.34, 1e-7); near(arm.fore.scale.y, 0.36, 1e-7) }
        const wrist = w.root.worldToLocal(w.mount.localToWorld(v(-0.029, -0.02, -0.033)))
        const foreEnd = v(0, 0.5, 0).applyQuaternion(w.arms[0].fore.quaternion).multiplyScalar(w.arms[0].fore.scale.y).add(w.arms[0].fore.position)
        assert(wrist.distanceTo(foreEnd) < 1e-7, `${name} firing hand stays connected`)
        r.removeCamera()
      }
      if (reloading) {
        const before = weapons.current!.magazine + weapons.current!.reserve
        for (let i = 0; i < 240; i++) weapons.update(1 / 60, frame)
        assert(!weapons.reloading)
        assert.equal(weapons.current!.magazine + weapons.current!.reserve, before)
      }
    }
  }
  reset(); frame.aiming = true; r.clear(); weapons.update(0.3, frame)
  r.hit(hit('shoulder'), 12, true); r.update(0.08, 0)
  r.applyCamera(camera, world); camera.updateMatrixWorld(true)
  const expectedSight = camera.getWorldDirection(v()), eye = camera.position.clone()
  weapons.trigger(true); weapons.trigger(false); weapons.update(0.01, frame)
  assert(shots.length > 0)
  // Every weapon converges from its real muzzle to the currently displaced sight.
  const shot = shots[0], aimPoint = eye.clone().addScaledVector(expectedSight, name === 'sniper' ? 180 : 80)
  assert(shot.direction.dot(aimPoint.sub(shot.origin).normalize()) > 0.999, `${name} fires along the presented sight`)
  r.removeCamera()
  r.clear(); weapons.dispose(); world.dispose()
}
console.log('PASS All five weapons keep connected fixed-length arms during overlapping hits, aim and reload; firing remains aligned and ammunition conserved')

{
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.BoxGeometry(50, 0.2, 50), new THREE.MeshBasicMaterial()); floor.position.y = -0.1; scene.add(floor)
  const cover = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 0.25), new THREE.MeshBasicMaterial())
  cover.position.set(100, 0.5, 9); cover.userData.doorHinge = true; scene.add(cover)
  const world = new CollisionWorld(scene), hits: PlayerBulletHit[] = []
  const actor = async () => {
    const root = new THREE.Group()
    return { root, reactionRemaining: 0, update() {}, shoot() {}, dispose() {}, restore() {},
      muzzle: () => root.position.clone().add(v(0, 1.4, 0.3)) } as unknown as EnemyActor
  }
  const ai = new EnemyDirector({ scene, world, doors: [], specs: [{ id: 'test', name: 'Test', position: [0, 0, 0], patrol: [], weapon: 'ak', facing: 0 }],
    emit() {}, damagePlayer(_amount, _source, impact) { assert(impact); hits.push(impact) }, dropWeapon() {},
  }, actor)
  await ai.init()
  const enemy = ai.enemies[0], a = ai as any
  const player: PlayerSense = { feet: v(0, 0, 10), eye: v(0, 1.65, 10), velocity: v(), alive: true, radioEnabled: false, yaw: Math.PI }
  const fire = (regionRoll: number) => {
    Object.assign(enemy, { state: 'combat', moveSpeed: 0, hitPause: 0, settledFor: 1, aimTime: 2, reloadTimer: 0, magazine: 30, yaw: 0, burst: 0 })
    let roll = 0
    a.random = () => roll++ === 0 ? 0 : regionRoll
    assert(a.shoot(enemy, player))
  }
  for (const roll of [0.1, 0.3, 0.45, 0.55, 0.6, 0.7, 0.735, 0.765, 0.8, 0.92, 0.98]) fire(roll)
  assert.equal(new Set(hits.map(h => `${h.region}:${h.side}`)).size, 11)
  for (const impact of hits) {
    const muzzle = enemy.actor.muzzle()
    assert(impact.direction.distanceTo(impact.point.clone().sub(muzzle).normalize()) < 1e-8)
    const round = (ai.bulletTrails as any).rounds[hits.indexOf(impact)]
    assert(round.origin.distanceTo(muzzle) < 1e-8, 'Moving round starts at the actual muzzle')
    assert(round.origin.clone().addScaledVector(round.direction, round.distance).distanceTo(impact.point) < 1e-8,
      'Moving round terminates at the reported body part')
  }
  cover.position.x = 0; world.refresh(); fire(0.8)
  assert.notEqual(hits.at(-1)!.region, 'leg', 'Low cover prevents reporting a hidden leg hit')
  cover.scale.y = 2.8; cover.position.y = 1.4; world.refresh()
  const before = hits.length
  Object.assign(enemy, { aimTime: 2, settledFor: 1 })
  assert.equal(a.shoot(enemy, player), false); assert.equal(hits.length, before)
  ai.dispose(); world.dispose()
  console.log('PASS Real enemy fire reports exact traced anatomy/direction and never damages a covered limb or fires through full cover')
}
