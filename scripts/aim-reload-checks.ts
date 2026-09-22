import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CollisionWorld } from '../src/player/collision'
import { FirstPersonWeapons, WEAPON_RULES } from '../src/game/weapons'
import type { WeaponFrame, WeaponName } from '../src/game/types'

for (const name of ['pistol', 'shotgun', 'ak', 'smg', 'sniper'] as WeaponName[]) {
  for (const fps of [30, 60, 144]) for (const reducedMotion of [false, true]) {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 16 / 9, .06, 100)
    scene.add(camera)
    const world = new CollisionWorld(scene)
    const weapons = new FirstPersonWeapons({ scene, camera, world, onShot() {}, emit() {} })
    weapons.restore({ slots: [{ id: name, name, magazine: 2, reserve: 20 }], selected: 0, pickups: [], nextId: 1 })
    const frame: WeaponFrame = { active: true, climbing: false, moving: 0, aiming: true, reducedMotion, feet: new THREE.Vector3() }
    const step = (seconds: number) => { for (let i = 0; i < Math.round(seconds * fps); i++) weapons.update(1 / fps, frame) }
    step(2)
    const mount = scene.getObjectByName('Firing hand grip mount')!
    const gun = scene.getObjectByName(`gun:${name}`)!
    if (name === 'pistol' || name === 'shotgun') {
      assert(!weapons.canAim)
      assert(Math.abs(mount.position.x - (name === 'pistol' ? .16 : .17)) < 1e-8, `${name} ignores aim and keeps its hip-fire pose`)
      assert.equal(mount.rotation.x, 0, `${name} does not gain the aimed barrel tilt`)
    } else if (name !== 'sniper') {
      for (const moving of [0, 4]) {
        frame.moving = moving; step(1)
        const muzzle = gun.localToWorld(gun.userData.muzzle.clone()).project(camera)
        assert(Math.abs(muzzle.x) < .0001, `${name}: aimed barrel must be horizontally centered, also when moving`)
        const bounds = new THREE.Box3().setFromObject(gun)
        assert(bounds.max.y < -.005, `${name}: gun must leave clear space below the center dot`)
      }
    }
    frame.moving = 0; step(1)
    const aimed = mount.position.clone()
    const magazine = gun.userData.parts.magazine
    const magazineRest = magazine?.position.clone()
    assert(weapons.reload())
    frame.aiming = false
    assert.equal(mount.position.distanceTo(aimed), 0, 'reload request must not teleport the mount')
    weapons.update(1 / fps, frame)
    assert(mount.position.distanceTo(aimed) < .04, `${name} ${fps}fps: first reload frame must not snap out of aim`)
    if (weapons.canAim) assert(mount.position.x > aimed.x, 'lowering begins toward the hip pose')
    step(.1)
    assert.equal(weapons.current!.magazine, 2)
    if (magazine) assert(magazine.position.distanceTo(magazineRest) < 1e-8, 'magazine stays seated while lowering')
    step(WEAPON_RULES[name].reload + .25)
    assert(weapons.current!.magazine > 2, 'ammo transfer still completes after lowering and reload')
    assert(!weapons.scoped, 'reload with released aim stays unscoped')
    // Cancelling the lowering phase cannot leave a delayed ammo transfer.
    frame.aiming = true; step(1)
    weapons.cancel(); weapons.current!.magazine = 1; weapons.current!.reserve = 10
    step(1); assert(weapons.reload()); weapons.cancel()
    frame.aiming = false; step(4)
    assert.equal(weapons.current!.magazine, 1)
    weapons.dispose(); world.dispose()
  }
  console.log(`PASS ${name}: aim alignment, clear reticle, smooth lowering and reload cancellation at 30/60/144 FPS with reduced motion on/off`)
}
