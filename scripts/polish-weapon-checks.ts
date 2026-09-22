import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CollisionWorld } from '../src/player/collision'
import { FirstPersonWeapons, WEAPON_RULES } from '../src/game/weapons'
import { createMissionGun } from '../src/game/weapon-models'
import { disposeGun } from '../src/lab/weapons/models'
import type { Shot, SoundEvent, WeaponFrame } from '../src/game/types'

function setup(initialFov = 75) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(initialFov, 16 / 9, 0.06, 300)
  camera.position.set(0, 1.7, 0)
  scene.add(camera)
  const shots: Shot[] = [], sounds: SoundEvent[] = []
  const weapons = new FirstPersonWeapons({ scene, camera, world: new CollisionWorld(scene), onShot: shot => shots.push(shot), emit: sound => sounds.push(sound) })
  const frame: WeaponFrame = { active: true, climbing: false, moving: 0, aiming: false, reducedMotion: false, feet: new THREE.Vector3() }
  const step = (seconds: number, patch: Partial<WeaponFrame> = {}) => {
    Object.assign(frame, patch)
    for (let i = 0; i < Math.ceil(seconds * 60); i++) weapons.update(1 / 60, frame)
  }
  const snapshot = weapons.snapshot()
  snapshot.slots[1] = { id: 'test-sniper', name: 'sniper', magazine: 5, reserve: 10 }
  snapshot.selected = 1
  weapons.restore(snapshot)
  step(1 / 60)
  return { scene, camera, weapons, frame, shots, sounds, step }
}

{
  const { camera, weapons, step } = setup(38)
  camera.fov = 75; camera.updateProjectionMatrix()
  step(0.1)
  assert.equal(camera.fov, 75, 'Entering walk after weapon construction owns the unscoped FOV')
  step(0.1, { aiming: true })
  assert(camera.fov < 25)
  weapons.adjustScopeZoom(1)
  weapons.adjustScopeZoom(1)
  weapons.cancel()
  assert.equal(camera.fov, 75, 'Scope captures actual walk FOV, not construction overview FOV')
  camera.fov = 38; camera.updateProjectionMatrix()
  step(0.1, { active: false, aiming: false })
  weapons.cancel(); weapons.dispose()
  assert.equal(camera.fov, 38, 'Inactive weapon cleanup must preserve inspection FOV')
  console.log('PASS Construction before walk camera setup preserves walk and inspection FOV ownership')
}

{
  const rifle = createMissionGun('sniper')
  assert(rifle.userData.twoHanded)
  assert(rifle.userData.parts.magazine && rifle.userData.parts.bolt)
  assert(rifle.userData.support)
  assert(rifle.userData.muzzle.z > 0.7)
  disposeGun(rifle)
  console.log('PASS Mission sniper preserves original procedural scope, bolt, magazine and grip anchors')
}

{
  const { camera, scene, weapons, step, shots, sounds } = setup()
  step(0.2, { aiming: true })
  assert(weapons.scoped)
  const magnification = Math.tan(THREE.MathUtils.degToRad(75) / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  assert(Math.abs(magnification - 4) < 1e-10)
  assert.equal(weapons.lookSensitivity, 0.25)
  assert.equal(scene.getObjectByName('First-person stickman arms')!.visible, false)
  weapons.trigger(true); step(2)
  assert.equal(shots.length, 1, 'Held bolt rifle must not become automatic')
  assert.equal(shots[0].weapon, 'sniper')
  assert.equal(shots[0].damage, WEAPON_RULES.sniper.damage)
  assert.equal(shots[0].range, WEAPON_RULES.sniper.range)
  assert.equal(weapons.ammo, '4 / 10')
  assert.equal(sounds.filter(sound => sound.kind === 'shot-sniper').length, 1)
  step(1 / 60, { aiming: false })
  assert.equal(camera.fov, 75)
  assert.equal(weapons.lookSensitivity, 1)
  assert(scene.getObjectByName('First-person stickman arms')!.visible)
  weapons.dispose()
  console.log('PASS Scoped shot uses 4× optical zoom, sensitivity and authoritative semi-auto ammunition/damage/sound pipeline')
}

{
  const { camera, weapons, step, shots } = setup()
  step(0.1, { aiming: true })
  weapons.trigger(true); step(0.02); weapons.trigger(false)
  assert(weapons.reload())
  assert.equal(camera.fov, 75, 'Reload immediately exits zoom')
  assert(!weapons.scoped)
  step(1)
  assert.equal(weapons.ammo, '4 / 10')
  assert(!weapons.scoped)
  step(2.2) // Includes the short lowering phase before the 2.9-second reload.
  assert.equal(weapons.ammo, '5 / 9')
  assert(weapons.scoped, 'Held aim resumes after magazine is seated')
  assert.equal(shots.length, 1)
  weapons.dispose()
  console.log('PASS Sniper reload exits scope and transfers cartridges only once at completion')
}

{
  const { camera, weapons, step } = setup()
  const magnification = () => Math.tan(THREE.MathUtils.degToRad(75) / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  assert(!weapons.adjustScopeZoom(1), 'Unscoped input must not change the camera')
  assert.equal(camera.fov, 75)
  step(0.1, { aiming: true })
  assert.equal(weapons.scopeMagnification, 4)
  for (const expected of [5, 6, 7, 8, 8]) {
    assert(weapons.adjustScopeZoom(1))
    assert.equal(weapons.scopeMagnification, expected)
    assert(Math.abs(magnification() - expected) < 1e-10, 'Zoom must use optical magnification, not linear FOV')
    assert.equal(weapons.lookSensitivity, 1 / expected)
  }
  for (let i = 0; i < 10; i++) weapons.adjustScopeZoom(-1)
  assert.equal(weapons.scopeMagnification, 2)
  assert(Math.abs(magnification() - 2) < 1e-10)
  for (const invalid of [0, NaN, Infinity, -Infinity]) assert(!weapons.adjustScopeZoom(invalid))
  assert.equal(weapons.scopeMagnification, 2)
  step(1 / 60, { aiming: false })
  assert.equal(camera.fov, 75); assert.equal(weapons.lookSensitivity, 1)
  assert(!weapons.adjustScopeZoom(-1))
  step(1 / 60, { aiming: true })
  assert(Math.abs(magnification() - 2) < 1e-10, 'Re-entering aim keeps the equipped scope setting')
  weapons.current!.magazine = 4
  assert(weapons.reload())
  assert(!weapons.adjustScopeZoom(1), 'Reloading disables zoom input')
  step(3.2) // Lower out of aim before starting the magazine reload.
  assert(weapons.scoped)
  assert(Math.abs(magnification() - 2) < 1e-10)
  assert(weapons.switchSlot(2)); step(0.3)
  assert.equal(weapons.current?.name, 'ak')
  assert(!weapons.adjustScopeZoom(1), 'Other weapons cannot zoom the camera')
  assert.equal(camera.fov, 75)
  assert(weapons.switchSlot(1)); step(0.3)
  assert.equal(weapons.scopeMagnification, 4, 'Equipping a sniper resets to its default magnification')
  assert(Math.abs(magnification() - 4) < 1e-10)
  weapons.dispose()
  console.log('PASS Scope zoom steps from 2× to 8×, scales sensitivity, ignores inactive input and preserves the camera baseline')
}

for (const interruption of ['cancel', 'pause', 'climb', 'switch', 'restore', 'dispose'] as const) {
  const { camera, weapons, step, shots } = setup()
  step(0.1, { aiming: true })
  assert(weapons.scoped)
  weapons.adjustScopeZoom(1); weapons.adjustScopeZoom(1)
  weapons.trigger(true)
  if (interruption === 'cancel') weapons.cancel()
  if (interruption === 'pause') step(0.02, { active: false })
  if (interruption === 'climb') step(0.02, { climbing: true })
  if (interruption === 'switch') weapons.switchSlot(0)
  if (interruption === 'restore') weapons.restore(weapons.snapshot())
  if (interruption === 'dispose') weapons.dispose()
  assert.equal(camera.fov, 75, interruption)
  assert.equal(weapons.lookSensitivity, 1, interruption)
  assert(!weapons.scoped, interruption)
  step(2, { active: true, climbing: false, aiming: false })
  assert.equal(shots.length, 0, `${interruption} retained a queued trigger`)
  weapons.dispose()
  console.log(`PASS ${interruption} restores FOV/sensitivity and removes queued sniper fire`)
}

{
  const { camera, scene, weapons, step } = setup()
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.1), new THREE.MeshBasicMaterial())
  wall.position.set(0, 1.5, -0.7)
  scene.add(wall)
  // Rebuild the world through a fresh weapon instance so cover is part of the collision cache.
  weapons.dispose()
  const blockedShots: Shot[] = []
  const blocked = new FirstPersonWeapons({ scene, camera, world: new CollisionWorld(scene), onShot: shot => blockedShots.push(shot), emit: () => {} })
  const snapshot = blocked.snapshot()
  snapshot.slots[0] = { id: 'blocked-sniper', name: 'sniper', magazine: 5, reserve: 0 }
  snapshot.selected = 0
  blocked.restore(snapshot)
  const frame: WeaponFrame = { active: true, climbing: false, moving: 0, aiming: true, reducedMotion: false, feet: new THREE.Vector3() }
  blocked.update(1 / 60, frame)
  blocked.trigger(true)
  blocked.update(1 / 60, frame)
  assert(blocked.blocked)
  assert(!blocked.scoped)
  assert.equal(camera.fov, 75)
  assert.equal(blocked.ammo, '5 / 0')
  assert.equal(blockedShots.length, 0)
  blocked.dispose()
  step(0)
  console.log('PASS Cover blocks the long sniper muzzle and zoom without consuming ammunition')
}

console.log('All gameplay polish weapon checks passed.')
