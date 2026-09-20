import assert from 'node:assert/strict'
import * as THREE from 'three'
import { advanceMission, completeEscape, damageMission, initialMission, missionObjective, stationLabel, useStation, SIGNALS_COMPUTER_ID } from '../src/game/mission'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody } from '../src/player/body'
import { PlayerActions } from '../src/player/actions'

let passed = 0
function test(name: string, check: () => void) { check(); console.log(`PASS ${name}`); passed++ }

test('independent fresh states and insertion snapshot restore every rescue flag', () => {
  const a = initialMission(), saved = structuredClone(a), b = initialMission()
  assert.equal(a.hostages.length, 1)
  useStation(a, 'hostage', 'hostage-1'); useStation(a, 'cameras', 'computer'); useStation(a, 'gate', 'gate')
  a.hostages[0].position[0] += 10; a.alarm = 'active'; a.reservesDispatched = 2
  damageMission(a, 100)
  assert.deepEqual(b, saved)
  assert.deepEqual(structuredClone(saved), initialMission())
})

for (const prepareFirst of [true, false]) test(`rescue supports preparation ${prepareFirst ? 'before' : 'after'} release and requires physical escape`, () => {
  const state = initialMission()
  assert(!useStation(state, 'jeep', 'jeep').changed)
  if (prepareFirst) { useStation(state, 'gate', 'gate'); useStation(state, 'cameras', 'computer') }
  for (const hostage of state.hostages) {
    assert(useStation(state, 'hostage', hostage.id).changed)
    assert(!useStation(state, 'hostage', hostage.id).changed)
  }
  assert.match(missionObjective(state), /Escort/)
  assert(!useStation(state, 'jeep', 'jeep').changed)
  state.hostages[0].status = 'loaded'
  if (!prepareFirst) {
    assert(!useStation(state, 'jeep', 'jeep').changed)
    useStation(state, 'gate', 'gate')
  }
  assert(useStation(state, 'jeep', 'jeep').changed)
  assert(!useStation(state, 'jeep', 'jeep').changed)
  assert(!completeEscape(state, false)); assert.equal(state.phase, 'active')
  assert(completeEscape(state, true)); assert.equal(state.phase, 'complete')
  assert.equal(state.kills, 0)
  const saved = structuredClone(state)
  assert(!advanceMission(state, 100)); assert(!damageMission(state, 100))
  assert(!useStation(state, 'supply', 'field').changed); assert(!completeEscape(state, true))
  assert.deepEqual(state, saved)
})

test('cameras and gate are idempotent; camera shutdown does not silently cancel alarm', () => {
  const state = initialMission(); state.alarm = 'active'
  assert(useStation(state, 'cameras', 'computer').changed)
  assert.equal(state.alarm, 'active')
  assert(!useStation(state, 'cameras', 'computer').changed)
  assert(useStation(state, 'alarm', 'panel').changed)
  assert.equal(state.alarm, 'silenced'); assert(!useStation(state, 'alarm', 'panel').changed)
  assert(useStation(state, 'gate', 'gate').changed); assert(!useStation(state, 'gate', 'gate').changed)
  assert(!useStation(state, 'hostage', 'unknown').changed)
})

test('office computer disables for exactly one active minute; checkpoints and permanent shutdown preserve their semantics', () => {
  const state = initialMission()
  advanceMission(state, 17)
  assert(useStation(state, 'cameras', SIGNALS_COMPUTER_ID).changed)
  assert.equal(state.camerasDisabledUntil, 77)
  assert(!useStation(state, 'cameras', SIGNALS_COMPUTER_ID).changed, 'Repeated use cannot extend the timer')
  advanceMission(state, 30)
  const restored = structuredClone(state)
  advanceMission(restored, 29.99)
  assert(!restored.camerasActive)
  advanceMission(restored, 0.02)
  assert(restored.camerasActive)
  assert.equal(restored.camerasDisabledUntil, null)
  assert(useStation(restored, 'cameras', SIGNALS_COMPUTER_ID).changed, 'Computer is reusable after recovery')
  assert(useStation(restored, 'cameras', 'security-computer').changed, 'Security cabin can permanently override a timed shutdown')
  advanceMission(restored, 120)
  assert(!restored.camerasActive)
  assert.equal(restored.camerasDisabledUntil, null)
  assert(!useStation(restored, 'cameras', SIGNALS_COMPUTER_ID).changed, 'Office cannot re-enable permanently disabled cameras')
  state.phase = 'dead'
  advanceMission(state, 120)
  assert.equal(state.elapsed, 47)
  assert(!state.camerasActive)
})

test('objectives follow actual hostage progress despite optional work performed first', () => {
  const state = initialMission()
  useStation(state, 'gate', 'gate'); useStation(state, 'cameras', 'computer')
  assert.match(missionObjective(state), /Find the detention/)
  state.detentionFound = true; assert.match(missionObjective(state), /underground/)
  state.cellsReached = true; assert.match(missionObjective(state), /cell 01/)
  useStation(state, 'hostage', 'hostage-1'); assert.match(missionObjective(state), /Escort the hostage/)
})

test('death freezes timers, supplies, rescue and damage', () => {
  const state = initialMission(); useStation(state, 'hostage', 'hostage-1'); advanceMission(state, 4)
  damageMission(state, 150); const dead = structuredClone(state)
  assert.equal(state.health, 0); assert(!advanceMission(state, 100)); assert(!damageMission(state, 10))
  for (const kind of ['hostage', 'cameras', 'alarm', 'gate', 'jeep', 'rally', 'supply', 'distraction'] as const) {
    assert.equal(stationLabel(state, kind, 'hostage-2'), null)
    assert(!useStation(state, kind, 'hostage-2').changed)
  }
  assert.deepEqual(state, dead)
})

test('medical supplies and distraction cooldown remain finite', () => {
  const state = initialMission()
  assert(!useStation(state, 'supply', 'a').changed); damageMission(state, 60)
  assert(useStation(state, 'supply', 'a').changed); assert.equal(state.health, 100)
  damageMission(state, 20); assert(!useStation(state, 'supply', 'a').changed)
  assert(useStation(state, 'distraction', 'bell').changed); assert(!useStation(state, 'distraction', 'bell').changed)
  advanceMission(state, 25); assert(useStation(state, 'distraction', 'bell').changed)
})

test('interaction rechecks distance and solid occlusion on every activation', () => {
  const scene = new THREE.Group()
  const target = new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.1), new THREE.MeshBasicMaterial())
  target.position.set(0, 1.3, -1.8); scene.add(target)
  const world = new CollisionWorld(scene), actions = new PlayerActions(scene, new PlayerBody(world))
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0,1.65,0); camera.lookAt(target.position); camera.updateMatrixWorld(true)
  const state = initialMission()
  actions.extraTargets = () => state.gateOpen ? [] : [{ object: target, kind: 'mission', point: target.position, descending: false, label: 'Open gate', use: () => useStation(state, 'gate', 'gate').changed }]
  assert.equal(actions.findTarget(camera)?.object, target)
  camera.position.z = 5; camera.updateMatrixWorld(true); assert(!actions.activate(camera)); assert(!state.gateOpen)
  camera.position.z = 0; camera.updateMatrixWorld(true)
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(4,3,.15),new THREE.MeshBasicMaterial()); blocker.position.set(0,1.5,-.9); scene.add(blocker)
  const blockedWorld = new CollisionWorld(scene), blocked = new PlayerActions(scene,new PlayerBody(blockedWorld)); blocked.extraTargets = actions.extraTargets
  assert(!blocked.activate(camera)); assert(!state.gateOpen)
  assert(actions.activate(camera)); assert(state.gateOpen); assert(!actions.activate(camera))
  world.dispose(); blockedWorld.dispose()
})
console.log(`${passed} rescue mission checks passed.`)
