import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EnemyDirector } from '../src/game/ai'
import { ENEMY_HEALTH, SHOTGUN_BALLISTICS, SHOTGUN_PELLETS } from '../src/game/balance'
import { FirstPersonWeapons } from '../src/game/weapons'
import { CollisionWorld } from '../src/player/collision'
import type { Shot, SoundEvent, WeaponFrame } from '../src/game/types'

const bytes = readFileSync('public/models/stickman.glb'), load = GLTFLoader.prototype.loadAsync
GLTFLoader.prototype.loadAsync = async function () {
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const random = Math.random
try {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.06, 200)
  camera.position.set(0, 1.65, 0); scene.add(camera)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(100, 0.2, 100), new THREE.MeshBasicMaterial())
  floor.position.y = -0.1; scene.add(floor)
  const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 0.2), new THREE.MeshBasicMaterial())
  wall.position.set(50, 1.5, -2); wall.userData.doorHinge = true; scene.add(wall)
  const world = new CollisionWorld(scene), shots: Shot[] = [], sounds: SoundEvent[] = []
  const director = new EnemyDirector({ scene, world, doors: [],
    specs: [{ id: 'target', name: 'Target', position: [0, 0, -4], patrol: [], weapon: 'ak', facing: 0 }],
    emit: event => sounds.push(event), damagePlayer() {}, dropWeapon() {},
  })
  await director.init()
  const enemy = director.enemies[0]
  const weapons = new FirstPersonWeapons({ scene, camera, world,
    aimDistance: (origin, direction, range) => director.aimDistance(origin, direction, range),
    onShot: shot => { shots.push(shot); director.hit(shot, world.rayDistance(shot.origin, shot.direction, shot.range)) },
    emit: event => sounds.push(event),
  })
  const frame: WeaponFrame = { active: true, climbing: false, moving: 0, aiming: false, reducedMotion: true, feet: v() }
  const fire = (distance: number, rotation: number, aiming: boolean, yaw = 0, offset = 0) => {
    Math.random = () => rotation
    enemy.position.set(0, 0, -distance); enemy.actor.root.position.copy(enemy.position)
    enemy.yaw = yaw; enemy.actor.root.rotation.y = yaw
    enemy.health = ENEMY_HEALTH; enemy.state = 'combat'; enemy.dropped = false
    enemy.actor.restore('combat')
    for (let i = 0; i < 60; i++) enemy.actor.update(1 / 60, 'combat', false, camera.position)
    const torso = enemy.actor.hitVolumes.volumes().find(volume => volume.bone === 'spine')!
    const target = torso.a.clone().add(torso.b).multiplyScalar(0.5)
    target.x += offset
    camera.lookAt(target); camera.updateMatrixWorld(true)
    weapons.restore({ slots: [{ id: 'test-shotgun', name: 'shotgun', magazine: 6, reserve: 0 }], selected: 0, pickups: [], nextId: 1 })
    frame.aiming = aiming
    for (let i = 0; i < 24; i++) weapons.update(1 / 60, frame)
    shots.length = 0; sounds.length = 0
    weapons.trigger(true); weapons.trigger(false); weapons.update(1 / 60, frame)
    return ENEMY_HEALTH - enemy.health
  }
  try {
    const table: Record<number, number[]> = {}
    for (const distance of [2, 3, 6, 8, 16, 28]) {
      table[distance] = []
      for (const yaw of [0, Math.PI / 2, Math.PI]) for (const aiming of [false, true]) for (const rotation of [0, 0.25, 0.5, 0.75]) {
        const damage = fire(distance, rotation, aiming, yaw)
        table[distance].push(damage)
        assert.equal(shots.length, SHOTGUN_PELLETS)
        assert.equal(weapons.current!.magazine, 5)
        assert.equal(sounds.filter(event => event.kind === 'shot-shotgun').length, 1)
      }
    }
    console.log(Object.fromEntries(Object.entries(table).map(([distance, damage]) => [distance, { min: Math.min(...damage), max: Math.max(...damage), mean: damage.reduce((a, b) => a + b, 0) / damage.length }])))
    const meanDamage = (distance: number) => table[distance].reduce((sum, damage) => sum + damage, 0) / table[distance].length
    assert(table[2].every(damage => damage === ENEMY_HEALTH), 'Centered 2m shots remain lethal from any facing, with hip fire or ADS')
    assert(table[3].every(damage => damage === ENEMY_HEALTH), 'Centered 3m shots reliably kill with the stronger shell')
    for (const distance of [6, 8]) {
      assert(table[distance].some(damage => damage < ENEMY_HEALTH), `${distance}m spread no longer guarantees every shell kills`)
      assert(meanDamage(distance) > ENEMY_HEALTH / 4, `${distance}m shots still land a useful portion of the shell`)
    }
    // Sampled hit regions vary, and lethal shots cap recorded damage at 100.
    // Compare range bands rather than require a strict ordering within one band.
    assert(meanDamage(3) > Math.max(meanDamage(6), meanDamage(8)) && Math.min(meanDamage(6), meanDamage(8)) > meanDamage(16), 'Pellet separation reduces effectiveness from close to medium to distant targets')
    assert(table[16].every(damage => damage < ENEMY_HEALTH), 'Middle-distance torso shots must not remain guaranteed instant kills')
    assert(meanDamage(16) < meanDamage(3) / 2, 'Midrange spread lands less than half the close-range damage on average')
    assert(table[28].every(damage => damage < ENEMY_HEALTH / 4), 'Distant body hits must lose most shell damage through sparse pellet impacts')
    assert.equal(fire(3, 0.5, false, 0, 0.9), 0, 'A close target outside the entire spread cone must still be missed')
    console.log('PASS Actual animated targets die from centered close shells; distant targets receive sparse pellet hits and off-target shots miss')

    fire(16, 0.125, false)
    const central = shots[0].direction.clone(), hipAngles = shots.map(shot => central.angleTo(shot.direction))
    fire(16, 0.125, true)
    const aimCentral = shots[0].direction.clone(), aimAngles = shots.map(shot => aimCentral.angleTo(shot.direction))
    for (let i = 0; i < shots.length; i++) {
      assert(Math.abs(hipAngles[i] - aimAngles[i]) < 1e-7, 'ADS must not change the physical pellet cone')
      assert(Math.abs(shots[i].direction.length() - 1) < 1e-8)
      assert(aimAngles[i] <= SHOTGUN_BALLISTICS.halfAngle + 1e-8)
      assert(shots[i].origin.distanceTo(shots[0].origin) < 1e-8, 'All pellets originate at the same actual muzzle')
    }
    const edge = shots[shots.length - 1].direction
    const planeDistance = (distance: number) => edge.clone().multiplyScalar(distance / edge.dot(aimCentral)).addScaledVector(aimCentral, -distance).length()
    assert(Math.abs(planeDistance(20) - planeDistance(10) * 2) < 1e-8, 'Pattern radius must grow with actual projectile travel')
    assert(planeDistance(10) > 0.7 && planeDistance(10) < 0.85, '10m spread reaches roughly 0.8 metres from the centre line')
    assert(planeDistance(3) < 0.25, 'Pellets remain close together just beyond the muzzle')
    console.log('PASS Hip fire and ADS share the same normalized, muzzle-origin pellet cone')

    wall.position.x = 0; world.refresh()
    assert.equal(fire(6, 0.5, false), 0, 'Every pellet must stop at intervening solid cover')
    console.log('PASS Cover blocks every pellet before a close target')
  } finally { weapons.dispose(); director.dispose(); world.dispose() }
} finally { GLTFLoader.prototype.loadAsync = load; Math.random = random }
