import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { CollisionWorld } from '../src/player/collision'
import { PlayerDeathSequence, DEATH_TIMING } from '../src/game/player-death'
import { FirstPersonWeapons } from '../src/game/weapons'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const scene = new THREE.Scene()
const platform = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 12), new THREE.MeshBasicMaterial())
platform.position.y = 2.85; scene.add(platform)
const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.06), new THREE.MeshBasicMaterial())
wall.position.set(0, 5, 0.48); scene.add(wall)
const world = new CollisionWorld(scene)
const setup = (x = 3, z = 0, pitch = 0, reduced = false) => {
  const camera = new THREE.PerspectiveCamera(75, 1.5, 0.06, 500)
  camera.position.set(x, 4.68, z); camera.rotation.set(pitch, 0, 0, 'YXZ')
  const sequence = new PlayerDeathSequence()
  sequence.begin(camera, v(x, 3.005, z), world, reduced)
  return { camera, sequence }
}

const poses = [30, 60, 144].map(fps => {
  const { camera, sequence } = setup()
  let contacts = 0, previous = camera.position.clone(), previousQ = camera.quaternion.clone()
  const start = camera.position.clone()
  sequence.update(0, camera, world)
  assert.deepEqual(camera.position, start, 'Death begins at the exact current eye position')
  for (let frame = 0; frame < fps * 5; frame++) {
    contacts += Number(sequence.update(1 / fps, camera, world))
    assert(camera.position.distanceTo(previous) <= 2.6 / fps, 'No position snap during the fall or settle')
    assert(camera.quaternion.angleTo(previousQ) < 2.1 / fps, 'Skyward turn remains smooth')
    assert(camera.position.y >= 3.21999, 'The head remains above the elevated floor')
    assert(world.fits(new Capsule(camera.position.clone(), camera.position.clone(), 0.13)))
    previous.copy(camera.position); previousQ.copy(camera.quaternion)
    if (sequence.elapsed < DEATH_TIMING.menu) assert(!sequence.menuVisible)
    if (sequence.menuVisible) assert.equal(sequence.visionLoss, 1, 'Background fade finishes before the menu')
  }
  assert.equal(contacts, 1)
  assert(!sequence.running && sequence.menuVisible && sequence.menuOpacity === 1)
  assert(camera.getWorldDirection(v()).y > 0.99, 'Resting on the back looks toward the sky')
  assert(camera.position.z > 0.5, 'The fall includes backward travel')
  return [...camera.position.toArray(), ...camera.quaternion.toArray()]
})
poses[0].forEach((value, index) => poses.slice(1).forEach(pose => assert(Math.abs(value - pose[index]) < 1e-9)))
console.log('PASS Continuous backward fall, delayed skyward head turn, ground contact and menu timing at 30/60/144 fps')

for (const [x, z, pitch] of [[0, 0, 0], [3, 5.85, 0], [3, 0, -1.5], [3, 0, 1.5]]) {
  const { camera, sequence } = setup(x, z, pitch)
  for (let frame = 0; frame < 180; frame++) {
    sequence.update(1 / 30, camera, world)
    assert(world.fits(new Capsule(camera.position.clone(), camera.position.clone(), 0.13)), 'Head never enters cover')
    assert(camera.position.z < 6, 'Fall cannot travel off the platform')
  }
  assert(Math.abs(camera.position.y - 3.22) < 1e-8)
  assert(camera.getWorldDirection(v()).y > 0.99)
}
console.log('PASS Walls, platform edges and extreme starting aim retain a safe resting pose')

// Lethal gunfire gets one strong impulse before the same collision-safe fall.
for (const fps of [30, 60, 144]) {
  for (const [x, z, pitch] of [[3, 0, 0], [0, 0, 0], [3, 5.85, 0], [3, 0, -1.5], [3, 0, 1.5]]) {
    for (const direction of [v(0, 0, 1), v(1, 0, 0), v(-1, 0, 0)]) {
      const { camera, sequence } = setup(x, z, pitch)
      sequence.begin(camera, v(x, 3.005, z), world, false, direction)
      const previous = camera.quaternion.clone()
      let peak = 0
      for (let frame = 0; frame < fps * 2; frame++) {
        sequence.update(1 / fps, camera, world)
        peak = Math.max(peak, sequence.hitKick)
        assert(camera.quaternion.angleTo(previous) < 7 / fps, 'Fatal impact remains continuous across frame rates')
        previous.copy(camera.quaternion)
        assert(world.fits(new Capsule(camera.position.clone(), camera.position.clone(), 0.13)), 'Fatal impulse cannot penetrate cover')
        assert(camera.position.z < 6 && camera.position.y >= 3.21999, 'Fatal impulse stays on its platform')
      }
      assert(peak > 0.95 && sequence.hitKick === 0, 'One fast impact fully settles into the collapse')
      assert(camera.getWorldDirection(v()).y > 0.99)
    }
  }
}
{
  const ordinary = setup(), fatal = setup()
  fatal.sequence.begin(fatal.camera, v(3, 3.005), world, false, v(0, 0, 1))
  ordinary.sequence.update(0.065, ordinary.camera, world)
  fatal.sequence.update(0.065, fatal.camera, world)
  assert(fatal.camera.quaternion.angleTo(ordinary.camera.quaternion) > 0.17, 'Final bullet visibly snaps the head before the fall')
  assert(fatal.camera.position.z - ordinary.camera.position.z > 0.07, 'Heavy hit immediately pushes the body backward')
  fatal.sequence.reset(); assert.equal(fatal.sequence.hitKick, 0)
  for (const side of [-1, 1]) {
    const { camera, sequence } = setup()
    sequence.begin(camera, v(3, 3.005), world, false, v(side, 0, 0))
    assert.equal(Math.sign(sequence.hitSide), -side, 'Fatal roll responds to the incoming bullet direction')
  }
}
console.log('PASS Strong directional fatal impulse at 30/60/144 fps, wall/ledge safety and smooth handoff into the fall')

{
  const { camera, sequence } = setup(3, 0, -0.8, true)
  const position = camera.position.clone(), rotation = camera.quaternion.clone()
  sequence.begin(camera, v(3, 3.005), world, true, v(1, 0, 1))
  assert.equal(sequence.hitKick, 0)
  sequence.update(0.8, camera, world)
  const elapsed = sequence.elapsed
  sequence.update(0, camera, world); sequence.update(NaN, camera, world)
  assert.equal(sequence.elapsed, elapsed, 'Hidden/paused frames and invalid deltas do not advance time')
  sequence.update(5, camera, world)
  assert.deepEqual(camera.position, position); assert.deepEqual(camera.quaternion.toArray(), rotation.toArray())
  assert(sequence.menuVisible && sequence.visionLoss === 1)
  sequence.reset(); assert(!sequence.active && !sequence.menuVisible && !sequence.running)
  sequence.begin(camera, v(3, 3.005), world, false)
  assert.equal(sequence.elapsed, 0); assert.equal(sequence.visionLoss, 0)
}
console.log('PASS Reduced Motion uses a stationary view, and reset starts the next death with clear vision')

{
  const camera = new THREE.PerspectiveCamera(75)
  const weapons = new FirstPersonWeapons({ scene, camera, world, aimDistance: () => 100, emit() {}, onShot() {} })
  const frame = { active: true, climbing: false, moving: 0, aiming: false, reducedMotion: false, feet: v(3, 3) }
  camera.position.set(3, 4.68, 0)
  weapons.update(0.1, frame)
  const root = camera.children.find(object => object.name === 'First-person stickman arms')!
  const ammo = weapons.ammo
  weapons.reload(); weapons.beginDeath(); weapons.trigger(true)
  weapons.updateDeath(0.065, false, 1, 1)
  assert(root.position.z > 0.1 && root.position.y > 0.04 && root.rotation.x < -0.2, 'Arms and weapon recoil together from the fatal impact')
  weapons.updateDeath(0.2, false)
  assert(root.visible && root.position.y < 0, 'Weapon and arms lower together')
  assert(!weapons.reloading); assert.equal(weapons.ammo, ammo)
  weapons.updateDeath(0.65, false); assert(!root.visible)
  weapons.resetDeath(); weapons.update(0.1, frame)
  assert.deepEqual(root.position, v()); assert(root.visible)
  weapons.restore({ slots: [{ id: 'death-scope', name: 'sniper', magazine: 5, reserve: 10 }], selected: 0, pickups: [], nextId: 2 })
  weapons.update(0.1, { ...frame, aiming: true }); assert(weapons.scoped && camera.fov < 75)
  weapons.beginDeath(); weapons.updateDeath(0, false)
  assert(!weapons.scoped && camera.fov === 75 && !root.visible, 'Scope exits without popping a hidden rifle into view')
  weapons.dispose()
}
world.dispose()
console.log('PASS Lowered weapons cannot shoot/reload, scope FOV is restored and restart removes the death pose')
