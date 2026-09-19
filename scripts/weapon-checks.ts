import assert from 'node:assert/strict'
import * as THREE from 'three'
import { penPalette } from '../src/render/ballpoint'
import { CollisionWorld } from '../src/player/collision'
import { FirstPersonWeapons, WEAPON_RULES } from '../src/game/weapons'
import { rayCapsuleDistance } from '../src/game/hit-reactions'
import type { Shot, SoundEvent, WeaponFrame, WeaponContext } from '../src/game/types'

function setup(wall: boolean | number = false, aimDistance?: WeaponContext['aimDistance']) {
  const scene = new THREE.Scene()
  if (wall) {
    const cover = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.1), new THREE.MeshBasicMaterial())
    cover.position.set(0, 1.5, typeof wall === 'number' ? -wall : -0.5)
    scene.add(cover)
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 10), new THREE.MeshBasicMaterial())
  floor.position.y = -0.05
  scene.add(floor)
  const world = new CollisionWorld(scene)
  const camera = new THREE.PerspectiveCamera(75, 1.7, 0.06, 100)
  camera.position.set(0, 1.7, 0)
  scene.add(camera)
  const shots: Shot[] = [], sounds: SoundEvent[] = []
  const weapons = new FirstPersonWeapons({ scene, camera, world, aimDistance, onShot: shot => shots.push(shot), emit: sound => sounds.push(sound) })
  const frame: WeaponFrame = { active: true, climbing: false, moving: 0, aiming: false, reducedMotion: false, feet: new THREE.Vector3() }
  const step = (seconds: number, patch: Partial<WeaponFrame> = {}) => {
    Object.assign(frame, patch)
    for (let time = 0; time < seconds - 1e-8; time += 1 / 60) weapons.update(1 / 60, frame)
  }
  const aimPickup = (id: string) => {
    camera.lookAt(weapons.pickupTargets().find(target => target.id === id)!.point)
    camera.updateMatrixWorld(true)
  }
  weapons.restore({ slots: [{ id: 'player-pistol', name: 'pistol', magazine: 12, reserve: 36 }, null], selected: 0, pickups: [], nextId: 1 })
  weapons.update(0, frame)
  return { scene, camera, world, weapons, shots, sounds, step, frame, aimPickup }
}

let failures = 0
function test(name: string, run: () => void) {
  try { run(); console.log(`PASS ${name}`) }
  catch (error) { failures++; console.error(`FAIL ${name}`, error) }
}

test('A trigger consumes one cartridge, emits one sound and resolves one synchronous muzzle shot', () => {
  const { weapons, shots, sounds, step } = setup()
  assert.equal(weapons.ammo, '12 / 36')
  weapons.trigger(true); step(0.5)
  assert.equal(weapons.current!.magazine, 11)
  assert.equal(shots.length, 1)
  assert.equal(sounds.filter(sound => sound.kind === 'shot-pistol').length, 1)
  assert(shots[0].origin.z < -0.5)
  assert(shots[0].direction.z < -0.99)
  weapons.trigger(false); weapons.trigger(true); step(0.02)
  assert.equal(weapons.current!.magazine, 10)
  weapons.dispose()
})

test('Reload transfer conserves cartridges and commits only at completion', () => {
  const { weapons, step } = setup()
  const snapshot = weapons.snapshot()
  snapshot.slots[0]!.magazine = 3; snapshot.slots[0]!.reserve = 4
  weapons.restore(snapshot)
  assert(weapons.reload()); step(1)
  assert.equal(weapons.ammo, '3 / 4')
  step(1)
  assert.equal(weapons.ammo, '7 / 0')
  assert(!weapons.reload())
  weapons.dispose()
})

test('A complete trigger click between animation frames fires once and leaves no repeated shot', () => {
  const { weapons, shots, step } = setup()
  weapons.trigger(true)
  weapons.trigger(false)
  step(1 / 60)
  assert.equal(shots.length, 1)
  assert.equal(weapons.current!.magazine, 11)
  step(1)
  assert.equal(shots.length, 1)
  weapons.trigger(true)
  weapons.trigger(false)
  weapons.cancel()
  step(0.5)
  assert.equal(shots.length, 1)
  weapons.dispose()
})

test('Pause, climbing and restore cancel reloads and held automatic fire without delayed actions', () => {
  const { weapons, step, shots, aimPickup } = setup()
  weapons.addPickup({ id: 'enemy-ak', name: 'ak', magazine: 4, reserve: 6, position: [0, 0, -1] })
  aimPickup('enemy-ak'); assert(weapons.pickup('enemy-ak')); step(0.3)
  weapons.trigger(true); step(0.02); const shotCount = shots.length
  step(2, { active: false }); step(0.8, { active: true })
  assert.equal(shots.length, shotCount)
  assert(weapons.reload()); step(0.8); step(0.2, { climbing: true }); step(3, { climbing: false })
  assert.equal(weapons.ammo, '3 / 6')
  assert(!weapons.reloading)
  assert(weapons.reload()); step(0.5)
  const snapshot = weapons.snapshot(); weapons.restore(snapshot); step(3)
  assert.equal(weapons.ammo, '3 / 6')
  weapons.dispose()
})

test('Two-slot swap, explicit drop and repeated pickup preserve every item and its ammunition', () => {
  const { weapons, step, aimPickup } = setup()
  weapons.addPickup({ id: 'ak-1', name: 'ak', magazine: 7, reserve: 9, position: [0, 0, -1] })
  aimPickup('ak-1'); assert(weapons.pickup('ak-1'))
  assert(!weapons.pickup('ak-1'))
  assert.equal(weapons.selected, 1)
  weapons.addPickup({ id: 'smg-2', name: 'smg', magazine: 2, reserve: 8, position: [0, 0, -1] })
  aimPickup('smg-2'); assert(weapons.pickup('smg-2'))
  assert.equal(weapons.current!.name, 'smg')
  assert.equal(weapons.pickupTargets().length, 1)
  assert(weapons.snapshot().pickups.some(item => item.id === 'ak-1' && item.magazine === 7 && item.reserve === 9))
  step(0.3); assert(weapons.drop(new THREE.Vector3()))
  aimPickup('smg-2'); assert(weapons.pickup('smg-2'))
  assert.equal(weapons.ammo, '2 / 8')
  weapons.addPickup({ id: 'smg-2', name: 'smg', magazine: 24, reserve: 999, position: [0, 0, -1] })
  assert.equal(weapons.pickupTargets().length, 1)
  const total = [...weapons.snapshot().slots, ...weapons.snapshot().pickups].reduce((sum, item) => sum + (item ? item.magazine + item.reserve : 0), 0)
  assert.equal(total, 48 + 16 + 10)
  const checkpoint = JSON.parse(JSON.stringify(weapons.snapshot()))
  weapons.restore(checkpoint)
  assert.deepEqual(weapons.snapshot(), checkpoint)
  weapons.dispose()
})

test('Nearby cover blocks actual muzzle fire without consuming ammunition', () => {
  const { weapons, shots, step, camera } = setup(true)
  weapons.trigger(true); step(0.3)
  assert(weapons.blocked)
  assert.equal(shots.length, 0)
  assert.equal(weapons.ammo, '12 / 36')
  camera.position.z = 1
  weapons.trigger(false); weapons.trigger(true); step(0.3)
  assert(!weapons.blocked)
  assert.equal(shots.length, 1)
  weapons.dispose()
})

test('Pickup validates live distance, facing and solid cover at activation', () => {
  const { weapons, aimPickup, camera } = setup(true)
  weapons.addPickup({ id: 'hidden', name: 'ak', magazine: 7, reserve: 9, position: [0, 0, -1] })
  aimPickup('hidden'); assert(!weapons.pickup('hidden'))
  weapons.addPickup({ id: 'near', name: 'ak', magazine: 7, reserve: 9, position: [1, 0, 0] })
  camera.lookAt(-1, 1.7, 0); assert(!weapons.pickup('near'))
  camera.position.z = 5; aimPickup('near'); assert(!weapons.pickup('near'))
  camera.position.z = 0; aimPickup('near'); assert(weapons.pickup('near'))
  weapons.dispose()
})

test('Pickup accepts the action selector facing edge and rejects targets beyond it', () => {
  const { weapons, camera } = setup()
  weapons.addPickup({ id: 'edge', name: 'smg', magazine: 9, reserve: 5, position: [0, 0, -1] })
  const point = weapons.pickupTargets()[0].point
  const toward = point.clone().sub(camera.position).normalize()
  const side = toward.clone().cross(new THREE.Vector3(1, 0, 0)).normalize()
  const face = (dot: number) => camera.lookAt(camera.position.clone().add(toward.clone().multiplyScalar(dot)).addScaledVector(side, Math.sqrt(1 - dot * dot)))
  face(0.24)
  assert(!weapons.pickup('edge'))
  face(0.32)
  assert(weapons.pickup('edge'))
  assert.equal(weapons.ammo, '9 / 5')
  weapons.dispose()
})

test('First-person pistols use one hand while aiming and firing, with a left hand only for reloads', () => {
  const { weapons, scene, shots, step } = setup()
  const rig = scene.getObjectByName('First-person stickman arms')!
  const leftHand = rig.getObjectByName('Left reload and support hand')!
  const limbs = rig.children.filter(object => object instanceof THREE.Mesh && object.geometry.type === 'CylinderGeometry')
  const elbows = rig.children.filter(object => object instanceof THREE.Mesh && object.geometry.type === 'SphereGeometry')
  const expectSupport = (visible: boolean) => {
    for (const part of [leftHand, ...limbs.slice(2), elbows[1]]) assert.equal(part.visible, visible)
    for (const part of [...limbs.slice(0, 2), elbows[0]]) assert(part.visible, 'Firing arm stays visible')
  }
  expectSupport(false)
  for (const reducedMotion of [false, true]) {
    step(0.4, { moving: 1, aiming: true, reducedMotion })
    expectSupport(false)
    weapons.trigger(true); step(1 / 60); weapons.trigger(false)
    expectSupport(false)
  }
  assert.equal(shots.length, 2)
  assert(weapons.reload()); step(0.4)
  expectSupport(true)
  step(2)
  assert(!weapons.reloading)
  expectSupport(false)
  const saved = weapons.snapshot()
  saved.slots[1] = { id: 'support-rifle', name: 'ak', magazine: 4, reserve: 9 }
  weapons.restore(saved)
  assert(weapons.switchSlot(1)); step(0.3)
  expectSupport(true)
  assert(weapons.switchSlot(0)); step(0.3)
  expectSupport(false)
  weapons.dispose()
})

test('All weapon poses retain fixed bone lengths and outlined paper arms', () => {
  const { weapons, scene, step, aimPickup, camera } = setup()
  // Inspect implementation geometry as a regression check, not a substitute for viewport review.
  const rig = scene.getObjectByName('First-person stickman arms')!
  const limbs = rig.children.filter(object => object instanceof THREE.Mesh && object.geometry.type === 'CylinderGeometry') as THREE.Mesh[]
  for (const name of ['pistol', 'ak', 'smg', 'shotgun', 'sniper'] as const) {
    if (name !== 'pistol') {
      weapons.addPickup({ id: `pose-${name}`, name, magazine: 4, reserve: 9, position: [0, 0, -1] })
      aimPickup(`pose-${name}`); assert(weapons.pickup(`pose-${name}`))
    }
    camera.lookAt(0, 1.7, -10)
    step(0.4, { moving: 1, aiming: true })
    weapons.trigger(true); step(0.02); weapons.trigger(false)
    assert(weapons.reload())
    for (let index = 0; index < 180; index++) {
      step(1 / 60)
      for (const [i, limb] of limbs.entries()) {
        assert(Math.abs(limb.scale.y - (i % 2 ? 0.36 : 0.34)) < 0.0001, `${name} limb ${i} changed to ${limb.scale.y}`)
        const material = limb.material as THREE.MeshBasicMaterial
        assert.equal(material.color.getHex(), penPalette.paper)
        assert.equal(material.type, 'MeshBasicMaterial')
        assert(material.depthTest)
      }
    }
  }
  weapons.dispose()
  assert.equal(scene.getObjectByName('First-person stickman arms'), undefined)
})

test('Crosshair hits converge on thin bodies and heads at close, middle and long distances', () => {
  for (const name of ['pistol', 'ak', 'smg', 'sniper'] as const) {
    for (const distance of [2, 10, 45, 85]) for (const radius of [0.095, 0.205]) for (const aiming of [false, true]) for (const offset of [0, 0.65]) {
      const center = new THREE.Vector3(0, 1.7, -distance)
      const raycast = (origin: THREE.Vector3, direction: THREE.Vector3) => rayCapsuleDistance(origin, direction, center, center, radius)
      const { weapons, camera, shots, step } = setup(false, (origin, direction, max) => Math.min(max, raycast(origin, direction)))
      const saved = weapons.snapshot()
      saved.slots[0] = { id: 'accuracy', name, magazine: 5, reserve: 0 }
      weapons.restore(saved)
      // Both center and an off-center sight on the silhouette must register.
      camera.lookAt(center.clone().add(new THREE.Vector3(radius * offset, 0, 0)))
      step(0.4, { aiming })
      weapons.trigger(true); step(1 / 60); weapons.trigger(false)
      assert.equal(shots.length, 1)
      assert(raycast(shots[0].origin, shots[0].direction) < shots[0].range, `${name} missed at ${distance}m, radius=${radius}, aiming=${aiming}`)
      weapons.dispose()
    }
  }
})

test('Convergence cannot bypass scenery between the muzzle and the target', () => {
  const center = new THREE.Vector3(0, 1.7, -10)
  const { weapons, world, shots, step } = setup(4, (origin, direction, max) => Math.min(max, rayCapsuleDistance(origin, direction, center, center, 0.1)))
  weapons.trigger(true); step(1 / 60)
  assert.equal(shots.length, 1)
  const shot = shots[0]
  assert(world.rayDistance(shot.origin, shot.direction, shot.range) < rayCapsuleDistance(shot.origin, shot.direction, center, center, 0.1))
  weapons.dispose()
})

test('Pistol recoil settles with variable persistent displacement; the next shot follows the visible sight', () => {
  const random = Math.random
  try {
    for (const variation of [0.1, 0.9]) {
      Math.random = () => variation
      const { weapons, camera, shots, step } = setup()
      const before = camera.quaternion.clone()
      weapons.trigger(true); step(1 / 60); weapons.trigger(false)
      const peak = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
      step(1)
      const settled = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
      assert(settled.x > 0.01 && settled.x < peak.x, 'pistol should recover partially and retain noticeable climb')
      assert(Math.abs(settled.y) > 0.005 && Math.sign(settled.y) === Math.sign(variation - 0.5))
      assert(camera.quaternion.angleTo(before) > 0.01)
      const rest = camera.quaternion.clone()
      step(1)
      assert(camera.quaternion.angleTo(rest) < 0.00001, 'settled aim must stop drifting')
      weapons.trigger(true); step(1 / 60); weapons.trigger(false)
      step(0.25)
      const visibleTarget = camera.position.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 110)
      weapons.trigger(true); step(1 / 60); weapons.trigger(false)
      assert(new THREE.Ray(shots[2].origin, shots[2].direction).distanceToPoint(visibleTarget) < 1e-8, 'recovery must not move aim before resolving a queued shot')
      weapons.dispose()
    }
  } finally { Math.random = random }
})

test('Shotgun blasts kick harder than AK shots, recover smoothly and preserve sight alignment', () => {
  const random = Math.random
  const measure = (name: 'shotgun' | 'ak', variation: number, aiming: boolean, fps = 60, reducedMotion = false) => {
    Math.random = () => variation
    const { weapons, camera, world, scene, frame, shots } = setup()
    try {
      weapons.restore({ slots: [{ id: 'recoil-check', name, magazine: 6, reserve: 0 }], selected: 0, pickups: [], nextId: 1 })
      Object.assign(frame, { aiming, reducedMotion })
      const advance = (seconds: number) => {
        for (let t = 0; t < seconds - 1e-8; t += 1 / fps) weapons.update(Math.min(1 / fps, seconds - t), frame)
      }
      advance(0.4)
      const mount = scene.getObjectByName('Firing hand grip mount')!
      const before = camera.quaternion.clone(), gunRest = mount.position.z
      const target = () => camera.position.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()), WEAPON_RULES[name].range)
      const fire = () => {
        const visibleTarget = target(), firstRay = shots.length
        weapons.trigger(true); weapons.trigger(false); weapons.update(1 / fps, frame)
        assert.equal(shots.length - firstRay, name === 'shotgun' ? 8 : 1)
        assert(new THREE.Ray(shots[firstRay].origin, shots[firstRay].direction).distanceToPoint(visibleTarget) < 1e-8,
          'Kick must follow the shot; central pellets still follow the displayed sight')
      }
      fire()
      const pitch = () => new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ').x
      const peak = pitch(), gunTravel = mount.position.z - gunRest
      let previous = peak
      for (let i = 0; i < 5; i++) {
        advance(0.1)
        assert(pitch() >= -1e-8 && pitch() <= previous + 1e-8, 'Recovery must not overshoot or add a second kick')
        previous = pitch()
      }
      const afterHalfSecond = pitch()
      advance(1)
      const settled = pitch(), rest = camera.quaternion.clone()
      advance(1)
      assert(camera.quaternion.angleTo(rest) < 0.00001, 'Camera must stop drifting before another blast')
      if (reducedMotion) {
        assert(camera.quaternion.angleTo(before) < 1e-8, 'Reduced motion must suppress camera kick and recovery')
        assert.equal(gunTravel, 0, 'Reduced motion must suppress the larger gun kick')
      } else {
        assert(settled > 0 && settled < peak * 0.5)
        assert(Math.abs(mount.position.z - gunRest) < 1e-8, 'Gun must return to rest before the next shot')
      }
      fire()
      assert.equal(weapons.current!.magazine, 4, 'Two blasts still consume exactly two shells')
      return { peak, afterHalfSecond, settled, gunTravel }
    } finally { weapons.dispose(); world.dispose() }
  }
  try {
    for (const aiming of [false, true]) {
      const ak = measure('ak', 0.95, aiming)
      const shotgun = measure('shotgun', 0.05, aiming)
      assert(shotgun.peak > ak.peak * 3, 'Even the weakest shotgun kick must clearly exceed the strongest AK kick')
      assert(shotgun.gunTravel > ak.gunTravel * 1.5, 'The visible gun must support the heavier camera kick')
      assert(shotgun.peak > 0.08 && shotgun.peak < 0.14, 'Shotgun kick stays strong but bounded')
      assert(shotgun.settled < 0.025, 'The larger transient must not leave excessive permanent climb')
      const lowRate = measure('shotgun', 0.5, aiming, 30)
      const highRate = measure('shotgun', 0.5, aiming, 144)
      assert(Math.abs(lowRate.afterHalfSecond - highRate.afterHalfSecond) < 1e-6, 'Recovery must be frame-rate independent')
      measure('shotgun', 0.95, aiming, 60, true)
    }
  } finally { Math.random = random }
})

if (failures) throw new Error(`${failures} weapon checks failed`)
console.log('All weapon checks passed.')
