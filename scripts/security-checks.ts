import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { advanceMission, initialMission, useStation, SIGNALS_COMPUTER_ID } from '../src/game/mission'
import { RESCUE_LAYOUT } from '../src/game/rescue-layout'
import { SecuritySystem, SECURITY_RULES, CAMERA_LIGHTS, CAMERA_PATROL, cameraPatrolYaw } from '../src/game/security'
import { CollisionWorld } from '../src/player/collision'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import { updateDoors } from '../src/world/doors'
import type { MissionWorld, PlayerSense, SoundEvent } from '../src/game/types'

const actor = async () => {
  const root = new THREE.Group()
  return { root, reactionRemaining: 0, animationTime: 0, update() {}, shoot() {}, restore() {}, react() {}, dispose() {}, muzzle: () => root.position.clone().add(new THREE.Vector3(0, 1.4, 0.3)) } as unknown as EnemyActor
}

async function fixture() {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.BoxGeometry(600, 0.5, 600), new THREE.MeshBasicMaterial())
  floor.position.y = -0.25
  scene.add(floor)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 8, 0.5), new THREE.MeshBasicMaterial())
  wall.userData.doorHinge = true
  wall.position.set(500, 3, 0)
  scene.add(wall)
  const spec = RESCUE_LAYOUT.cameras[0]
  const pivot = new THREE.Group()
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial())
  pivot.add(lamp)
  const missionWorld = { rescue: { cameras: [{ id: spec.id, pivot, lamp }] } } as unknown as MissionWorld
  const world = new CollisionWorld(scene)
  const events: SoundEvent[] = []
  const ai = new EnemyDirector({ scene, world, doors: [], specs: Array.from({ length: 5 }, (_, i) => ({
    id: `guard-${i}`, name: 'Guard', position: [140 + i * 2, 0.01, -30] as [number, number, number], patrol: [], weapon: 'ak' as const, reserve: i > 0,
  })), emit: event => events.push(event), damagePlayer() {}, dropWeapon() {} }, actor)
  await ai.init()
  const state = initialMission()
  const security = new SecuritySystem(world, missionWorld, ai, event => events.push(event))
  const eye = new THREE.Vector3(spec.position[0] + Math.sin(spec.yaw) * 8, 1.65, spec.position[2] + Math.cos(spec.yaw) * 8)
  const hidden: PlayerSense = { eye: new THREE.Vector3(-100, 1.65, -100), feet: new THREE.Vector3(-100, 0, -100), velocity: new THREE.Vector3(), alive: true, radioEnabled: true }
  const step = (seconds: number, updateAI = false) => {
    for (let i = 0; i < Math.ceil(seconds / 0.05); i++) {
      advanceMission(state, 0.05)
      security.update(0.05, state, eye)
      if (updateAI) ai.update(0.05, hidden)
    }
  }
  return { scene, world, wall, ai, state, security, events, eye, lamp, pivot, step, dispose() { ai.dispose(); world.dispose() } }
}

{
  const f = await fixture()
  f.step(0.35)
  assert.equal(f.state.alarm, 'inactive', 'a brief sweep is not an instant alarm')
  f.wall.position.set(f.eye.x, 3, (RESCUE_LAYOUT.cameras[0].position[2] + f.eye.z) / 2)
  f.world.refresh()
  f.step(2)
  assert.equal(f.state.alarm, 'inactive', 'walls break sight and clear partial detection')
  f.wall.position.x = 500; f.world.refresh()
  f.state.elapsed = 0
  f.step(0.35)
  assert.equal(f.state.alarm, 'inactive', 'reacquisition needs a fresh dwell')
  f.step(0.5)
  assert.equal(f.state.alarm, 'active')
  assert.equal((f.lamp.material as THREE.MeshBasicMaterial).color.getHex(), CAMERA_LIGHTS.alarm)
  assert.equal(f.state.detections, 1)
  assert.equal(f.state.reservesDispatched, 2, 'only the first reserve pair responds initially')
  assert.equal(f.ai.enemies.filter(enemy => enemy.state === 'reserve').length, 2)
  assert(f.ai.enemies[0].lastKnown?.distanceTo(f.eye.clone().setY(0))! < 0.01)
  assert.equal(f.ai.enemies[0].canSee, false, 'camera reports grant investigation, not guard vision')
  assert(f.events.some(event => event.kind === 'horn'))
  const reported = f.ai.enemies[0].lastKnown!.clone()
  f.eye.set(-100, 1.65, -100)
  f.step(SECURITY_RULES.secondWaveDelay + 0.1)
  assert.equal(f.state.reservesDispatched, 4)
  assert.equal(f.ai.enemies.filter(enemy => enemy.state === 'reserve').length, 0)
  assert(f.ai.enemies[0].lastKnown!.equals(reported), 'moving out of view never updates the report')
  assert.equal(f.state.detections, 1)
  f.dispose()
}
console.log('PASS Camera dwell, wall occlusion, reacquisition, frozen last-known report and staggered finite reserves')

{
  const f = await fixture()
  f.security.sync(f.state)
  assert.equal((f.lamp.material as THREE.MeshBasicMaterial).color.getHex(), CAMERA_LIGHTS.watching)
  f.state.camerasActive = false
  const yaw = f.pivot.rotation.y
  f.step(3)
  assert.equal(f.state.alarm, 'inactive')
  assert.equal(f.pivot.rotation.y, yaw, 'disabled cameras stop sweeping')
  assert.equal((f.lamp.material as THREE.MeshBasicMaterial).color.getHex(), CAMERA_LIGHTS.offline)
  f.security.trigger(f.state, f.eye.clone().setY(0))
  f.state.alarm = 'silenced'; f.state.silencedElapsed = 0; f.security.sync(f.state)
  assert(f.ai.enemies.filter(enemy => enemy.state !== 'reserve').every(enemy => enemy.state === 'search'))
  f.step(SECURITY_RULES.searchCooldown + 0.1, true)
  assert.equal(f.state.alarm, 'inactive')
  assert.equal(f.state.reservesDispatched, 2, 'silencing before the delay cancels the second wave')
  assert(f.ai.enemies.every(enemy => ['reserve', 'guard', 'patrol'].includes(enemy.state)), 'uncontacted responders finish searching and resume routines')
  for (let i = 0; i < 4; i++) {
    f.security.trigger(f.state, f.eye.clone().setY(0))
    f.state.alarm = 'silenced'; f.security.sync(f.state)
  }
  assert.equal(f.state.reservesDispatched, 4, 'repeated alarms cannot create additional reserves')
  assert.equal(f.ai.enemies.length, 5)
  const snapshot = f.ai.snapshot(); f.ai.restore(snapshot)
  assert.deepEqual(f.ai.snapshot(), snapshot, 'alarm response ownership survives checkpoint snapshots')
  f.security.reset()
  const initial = initialMission(); f.security.sync(initial)
  assert.equal((f.lamp.material as THREE.MeshBasicMaterial).color.getHex(), CAMERA_LIGHTS.watching)
  assert.equal(initial.alarm, 'inactive')
  assert.equal(initial.reservesDispatched, 0)
  f.dispose()
}
console.log('PASS Disabled lights and detection, cancelled wave, finite silence recovery, repeated alarm cap, restart visuals and snapshots')

{
  const f = await fixture()
  f.security.trigger(f.state, f.eye.clone().setY(0))
  const guard = f.ai.enemies[0]
  guard.state = 'combat'; guard.canSee = true
  f.state.alarm = 'silenced'; f.security.sync(f.state)
  assert.equal(guard.state, 'combat', 'a silenced alarm does not erase confirmed visual contact')
  f.dispose()
}
console.log('PASS Alarm panels preserve legitimate combat contact')

{
  const hold = CAMERA_PATROL.holdSeconds, turn = CAMERA_PATROL.turnSeconds, segment = hold + turn
  const spec = RESCUE_LAYOUT.cameras[0]
  const yaw = (t: number) => cameraPatrolYaw(t, 0, spec.yaw, spec.arc)
  assert.equal(yaw(0), yaw(hold - 0.01), 'Camera holds its first heading for several seconds')
  assert(yaw(hold + turn / 2) > yaw(hold), 'Camera rotates between lookout positions')
  assert.equal(yaw(segment), yaw(segment + hold - 0.01), 'Camera holds the next heading')
  assert(Math.abs(yaw(segment) - (spec.yaw + spec.arc)) < 1e-9)
  assert(Math.abs(yaw(segment * 3) - (spec.yaw - spec.arc)) < 1e-9)
  assert.equal(yaw(segment * 4), yaw(0), 'The full patrol repeats without a jump')
  const f = await fixture()
  f.step(0.4)
  useStation(f.state, 'cameras', SIGNALS_COMPUTER_ID)
  f.security.sync(f.state)
  f.step(59.5)
  assert.equal(f.state.alarm, 'inactive', 'Disabled cameras cannot detect')
  f.step(0.55)
  assert(f.state.camerasActive)
  assert.equal((f.lamp.material as THREE.MeshBasicMaterial).color.getHex(), CAMERA_LIGHTS.watching)
  assert.equal(f.state.alarm, 'inactive', 'Reactivation clears the old partial detection')
  f.security.trigger(f.state, f.eye)
  f.state.alarm = 'silenced'; f.security.sync(f.state)
  assert.equal((f.lamp.material as THREE.MeshBasicMaterial).color.getHex(), CAMERA_LIGHTS.watching)
  f.dispose()
}
console.log('PASS Camera holds/turns, bounded patrol, timed recovery, fresh detection dwell and green light after silencing')

{
  const scene = new THREE.Scene(), compound = createCompound(), mission = createMissionWorld()
  prepareCompound(compound); scene.add(compound, mission.root); scene.updateMatrixWorld(true)
  const world = new CollisionWorld(scene), doors: THREE.Group[] = []
  scene.traverse(object => { if (object.userData.kind === 'door') doors.push(object as THREE.Group) })
  const ai = new EnemyDirector({ scene, world, doors, specs: mission.enemies.filter(enemy => enemy.reserve), emit() {}, damagePlayer() {}, dropWeapon() {} }, actor)
  await ai.init()
  for (const camera of mission.rescue!.cameras) {
    const state = initialMission()
    const localWorld = { ...mission, rescue: { ...mission.rescue!, cameras: [camera] } }
    const security = new SecuritySystem(world, localWorld, ai, () => {})
    security.sync(state)
    const spec = RESCUE_LAYOUT.cameras.find(candidate => candidate.id === camera.id)!
    const origin = new THREE.Vector3(...spec.position)
    const eye = [4, 8, 12].map(distance => origin.clone().add(new THREE.Vector3(Math.sin(camera.pivot.rotation.y) * distance, 0, Math.cos(camera.pivot.rotation.y) * distance)).setY(1.65))
      .find(point => world.visible(origin, point, camera.pivot))
    assert(eye, `${camera.id} needs an unblocked view onto its real monitored route`)
    for (let i = 0; i < 20; i++) { state.elapsed += 0.05; security.update(0.05, state, eye) }
    assert.equal(state.alarm, 'active', `${camera.id} must detect with actual level geometry`)
  }
  ai.dispose()
  const responders = new EnemyDirector({ scene, world, doors, specs: mission.enemies.filter(enemy => enemy.reserve), emit() {}, damagePlayer() {}, dropWeapon() {} }, actor)
  await responders.init()
  const report = new THREE.Vector3(132, 0, 11)
  assert.equal(responders.respondToAlarm(report, 2), 2)
  const responseSnapshot = responders.snapshot()
  responders.restore(responseSnapshot)
  assert.deepEqual(responders.snapshot(), responseSnapshot, 'authored barracks egress survives a checkpoint')
  const outside = new Set<string>()
  const hidden: PlayerSense = { feet: new THREE.Vector3(-100, 0, -100), eye: new THREE.Vector3(-100, 1.65, -100), velocity: new THREE.Vector3(), alive: true, radioEnabled: true }
  for (let i = 0; i < 700; i++) {
    if (i === 280) assert.equal(responders.respondToAlarm(report, 2, false), 2)
    updateDoors(doors, 0.05); world.refresh(); responders.update(0.05, hidden)
    for (const enemy of responders.enemies) if (enemy.position.z < -2.5 || enemy.position.z > 8.5 || enemy.position.x < 135.5 || enemy.position.x > 150.5) outside.add(enemy.spec.id)
  }
  assert.equal(outside.size, 4, `all four reserves must physically leave their barracks: ${responders.enemies.map(enemy => `${enemy.spec.id}:${enemy.position.toArray()}:${enemy.state}`).join('; ')}`)
  responders.dispose(); world.dispose()
}
console.log('PASS Every real camera sees its monitored route and all four alarm reserves physically exit the barracks')
