import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EscapeDust } from '../src/game/escape-dust'
import { EscapeCinematic, ESCAPE_TIMING } from '../src/game/escape-cinematic'
import { MissionRuntime } from '../src/game/runtime'
import { initialMission, useStation } from '../src/game/mission'
import { RESCUE_LAYOUT } from '../src/game/rescue-layout'
import { PlayerHitReactions } from '../src/game/player-hit-reactions'

assert(ESCAPE_TIMING.black < ESCAPE_TIMING.departure + ESCAPE_TIMING.drive, 'Car stops before the shot fades out')
for (const fps of [10, 15, 30, 60, 144]) for (const aspect of [16 / 9, 390 / 844]) {
  const camera = new THREE.PerspectiveCamera(75, aspect)
  camera.position.set(154.65, 1.7, 8.25); camera.lookAt(154.65, 1.05, 9.95)
  const original = camera.position.clone(), rotation = camera.quaternion.clone()
  const escape = new EscapeCinematic()
  escape.begin(camera)
  const fixed = camera.position.clone(), fixedRotation = camera.quaternion.clone()
  const previousPosition = escape.position.clone(), previousForward = new THREE.Vector3(1, 0, 0)
  let previous = 0, sawFade = false, sawBlackBeforeMenu = false, maxSpeed = 0, maxYaw = 0
  for (let frame = 0; frame <= Math.ceil(ESCAPE_TIMING.end * fps); frame++) {
    escape.update(1 / fps); escape.applyCamera(camera); camera.updateMatrixWorld(true)
    assert(camera.position.distanceTo(fixed) < 1e-9 && camera.quaternion.angleTo(fixedRotation) < 1e-6, 'Camera follows the jeep')
    assert(camera.position.distanceTo(escape.position) > 8, 'Camera enters the vehicle')
    assert(escape.progress >= previous && escape.progress - previous <= 15 / fps, 'Jeep travel jumps or reverses')
    previous = escape.progress
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(escape.rotation)
    const travel = escape.position.clone().sub(previousPosition)
    if (travel.length() > 0.001) {
      assert(travel.normalize().dot(forward.clone().add(previousForward).normalize()) > .999, 'Car body slides sideways instead of following the road')
    }
    previousPosition.copy(escape.position); previousForward.copy(forward)
    maxSpeed = Math.max(maxSpeed, escape.speed); maxYaw = Math.max(maxYaw, Math.abs(escape.yaw))
    for (const x of [-2.55, 2.55]) for (const y of [0, 2.2]) for (const z of [-1.25, 1.25]) {
      const corner = new THREE.Vector3(x, y, z).applyQuaternion(escape.rotation).add(escape.position)
      assert(corner.z > 7 && corner.z < 15, 'Skid leaves the gate lane')
      const point = corner.project(camera)
      assert(Math.abs(point.x) < 1 && Math.abs(point.y) < 1, `Jeep leaves frame at ${aspect}: ${point.toArray()}`)
    }
    if (escape.fade > 0 && escape.fade < 1) sawFade = true
    if (escape.fade === 1 && !escape.menuVisible) sawBlackBeforeMenu = true
    if (escape.menuVisible) assert(escape.crossedGate && escape.fade === 1, 'Menu appears before escape and full fade')
  }
  assert(sawFade && sawBlackBeforeMenu && escape.menuVisible && !escape.running)
  assert(maxSpeed > 13.8 && maxYaw > 0.06 && maxYaw < 0.12, 'Getaway speed or steering is outside its intended range')
  assert.equal(escape.yaw, 0)
  assert.equal(escape.menuOpacity, 1)
  assert.deepEqual(escape.position.toArray(), RESCUE_LAYOUT.escapeRoute.at(-1))
  escape.reset(camera)
  assert(!escape.active && escape.elapsed === 0)
  assert.equal(camera.fov, 75)
  assert(camera.position.distanceTo(original) < 1e-9 && camera.quaternion.angleTo(rotation) < 1e-6)
}
console.log('PASS exterior fixed camera, whole-vehicle framing on desktop/portrait, smooth travel, black-before-menu timing and camera reset at 10/15/30/60/144 fps')

// Exercise the actual runtime branch with small collaborators, including pause/restore.
const noop = () => {}
Object.assign(globalThis, { document: { hidden: false } })
const m = Object.create(MissionRuntime.prototype) as any
const camera = new THREE.PerspectiveCamera(75, 16 / 9)
camera.position.set(154.65, 1.7, 8.25)
const jeep = new THREE.Group(), wheel = new THREE.Group()
jeep.userData = { wheels: [wheel], wheelRadius: .5, passengerDoor: new THREE.Group() }
let worldTime = 0, hudFade = 0, hudMenu = false, audioActive = false, weaponVisible = true, updates = 0
const player = {
  enabled: true, immersive: false, playing: true, movementLocked: false,
  body: { position: new THREE.Vector3(), velocity: new THREE.Vector3(), teleport(position: THREE.Vector3) { this.position.copy(position) } },
  actions: { reset: noop, doors: [], syncCamera: noop }, world: { refresh: noop },
  pause() { this.playing = false },
}
Object.assign(m, {
  state: initialMission(), escape: new EscapeCinematic(), escapeDust: new EscapeDust(new THREE.Scene()), playerHits: new PlayerHitReactions(), camera: { perspective: camera },
  player, ready: true, deaths: 0, invincible: false, aiming: false, invalidate: noop,
  world: { rescue: { jeep, gate: new THREE.Group(), cellDoors: [] } },
  weapons: { cancel: noop, update: () => weaponVisible = false, resetDeath: noop, restore: noop },
  hud: { reducedMotion: false, setScoped: noop, clearThreat: noop, notify: noop, reset: noop,
    clearEscape: noop, update: () => updates++, setEscape: (sequence: EscapeCinematic) => { hudFade = sequence.fade; hudMenu = sequence.menuVisible } },
  audio: { setAlarm: noop, update: noop, reset: noop, setActive: (active: boolean) => audioActive = active },
  ai: { update: (dt: number, sense: { alive: boolean }) => { assert(!sense.alive, 'Guards can target the cinematic camera'); worldTime += dt },
    bulletTrails: { clear: noop }, restore: noop },
  escort: { jeepOffset: new THREE.Vector3(), jeepRotation: new THREE.Quaternion(), update: noop, sync: noop },
  blood: { update: noop, restore: noop }, impacts: { update: noop, clear: noop }, bulletTrails: { update: noop, clear: noop },
  security: { sync: noop, reset: noop }, death: { reset: noop }, safePosition: new THREE.Vector3(), safeQuaternion: new THREE.Quaternion(),
})
const initial = { mission: initialMission(), weapons: {}, enemies: [], doors: [], position: [1, 0, 2], quaternion: [0, 0, 0, 1] }
m.initial = initial
m.state.hostages[0].status = 'loaded'; m.state.gateOpen = true
assert(useStation(m.state, 'jeep', 'rescue-jeep').changed)
m.beginEscape()
assert(m.escape.active && !player.playing && player.movementLocked && !weaponVisible)
m.damage(1000); assert.equal(m.state.health, 100, 'Cinematic can be interrupted by lethal damage')
// The renderer caps physics at 50 ms, but a 10 fps cinematic must still run in real time.
for (let frame = 0; frame < 10; frame++) assert(m.update(.05, .1))
assert(Math.abs(m.escape.elapsed - 1) < 1e-9 && Math.abs(worldTime - .5) < 1e-9)
assert(m.state.escapeProgress > 7 && !hudMenu && audioActive)
assert(m.escapeDust.mesh.count > 20 && m.escapeDust.mesh.count <= 128)
assert(jeep.quaternion.angleTo(m.escape.rotation) < 1e-6)
assert(m.escort.jeepRotation.angleTo(jeep.quaternion) < 1e-6)
const driverLocal = player.body.position.clone().sub(jeep.position).applyQuaternion(jeep.quaternion.clone().invert())
assert(driverLocal.distanceTo(new THREE.Vector3(-.35, -.12, -.46)) < 1e-6)
const held = [m.escape.elapsed, m.state.escapeProgress, worldTime, m.state.elapsed]
document.hidden = true
assert(!m.update(.05, 30)); assert(!audioActive)
assert.deepEqual([m.escape.elapsed, m.state.escapeProgress, worldTime, m.state.elapsed], held)
document.hidden = false
while (m.escape.running) m.update(1 / 60)
assert.equal(m.state.phase, 'complete'); assert.equal(m.state.jeep, 'escaped')
assert(hudFade === 1 && hudMenu && !audioActive && updates > 60)
assert(!m.update(1 / 60), 'Completed menu keeps rendering forever')
assert.equal(wheel.rotation.z, -m.escape.length / .5)
m.restart()
assert(!m.escape.active && !player.movementLocked && camera.fov === 75)
assert.equal(m.escapeDust.mesh.count, 0)
assert(jeep.quaternion.equals(new THREE.Quaternion()))
assert.equal(m.state.phase, 'active'); assert.equal(m.state.jeep, 'waiting')
assert.deepEqual(player.body.position.toArray(), initial.position)
console.log('PASS real runtime boarding handoff, damage/input lock, moving world/wheels, hidden-tab freeze, completion/menu handoff and restart cleanup')

// Acceleration starts continuously; pooled dust freezes, expires and disposes cleanly.
const launch = new EscapeCinematic()
launch.begin(camera); launch.update(ESCAPE_TIMING.departure)
assert.equal(launch.speed, 0)
launch.update(.2); const earlySpeed = launch.speed
launch.update(.2); assert(launch.speed > earlySpeed * 1.9)
const dustScene = new THREE.Scene(), dust = new EscapeDust(dustScene)
for (let i = 0; i < 180; i++) dust.update(1 / 60, new THREE.Vector3(i / 10, 0, 0), new THREE.Quaternion(), 9)
assert(dust.mesh.count > 20 && dust.mesh.count <= 128)
const matrices = dust.mesh.instanceMatrix.array.slice(), count = dust.mesh.count
dust.update(0, new THREE.Vector3(30, 0, 0), new THREE.Quaternion(), 9)
assert.equal(dust.mesh.count, count); assert.deepEqual(dust.mesh.instanceMatrix.array, matrices)
for (let i = 0; i < 75; i++) dust.update(1 / 60, new THREE.Vector3(), new THREE.Quaternion(), 0)
assert.equal(dust.mesh.count, 0)
dust.dispose(); assert.equal(dustScene.children.length, 0)
console.log('PASS fast continuous acceleration, road-aligned steering and real-time travel at low FPS, attached driver and bounded dust lifecycle')
