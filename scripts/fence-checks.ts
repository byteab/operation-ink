import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { CollisionWorld } from '../src/player/collision'
import { fence, gate } from '../src/world/industrial'
import { createDoor, setDoorOpen } from '../src/world/doors'
import { createFenceGate } from '../src/world/fenceGate'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import type { PlayerSense } from '../src/game/types'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const ignored = new THREE.Object3D()
const capsule = (position: THREE.Vector3) => new Capsule(position.clone().add(v(0, 0.35)), position.clone().add(v(0, 1.4)), 0.3)

// Test local coordinates as well as transformed panels: proxies have no parent,
// so transparency must survive construction rather than rely on ancestry.
for (const rotated of [false, true]) {
  const scene = new THREE.Scene(), panel = fence('Test wire', [[-3, 0], [3, 0]])
  if (rotated) { panel.position.set(11, 2, -7); panel.rotation.y = 0.7 }
  scene.add(panel)
  const world = new CollisionWorld(scene)
  const at = (point: THREE.Vector3) => point.applyMatrix4(panel.matrixWorld)
  const a = at(v(1.5, 1.3, -2)), b = at(v(1.5, 1.3, 2))
  for (const [from, to] of [[a, b], [b, a]]) {
    assert(world.visible(from, to, ignored), 'wire must not block enemy/player sight')
    assert.equal(world.rayDistance(from, to.clone().sub(from).normalize(), 4), 4, 'wire must pass shots both ways')
  }
  const body = capsule(at(v(1.5, 0, -0.1)))
  assert(!world.fits(body), 'wire still blocks actor capsules')
  const before = body.start.clone()
  world.resolve(body, b.clone().sub(a).normalize())
  assert(before.distanceTo(body.start) > 0.1, 'movement resolution pushes actors away from wire')
  const postA = at(v(0, 1.3, -2)), postB = at(v(0, 1.3, 2))
  assert(!world.visible(postA, postB, ignored), 'solid steel post remains cover')
  assert(world.rayDistance(postA, postB.clone().sub(postA).normalize(), 4) < 2, 'solid steel post stops shots')
  world.dispose()
}
console.log('PASS Wire panels pass sight and shots in both directions while blocking bodies, including transformed fences; solid posts remain cover')

{
  const scene = new THREE.Scene()
  scene.add(gate('Closed wire gate', 0, 0, 6, 0, false))
  const door = createDoor({ name: 'Solid door', x: 1.5, z: 2, floor: 0, width: 2 })
  scene.add(door)
  const world = new CollisionWorld(scene), from = v(1.5, 1.3, -2), throughGate = v(1.5, 1.3, 1), behindDoor = v(1.5, 1.3, 4)
  assert(world.visible(from, throughGate, ignored))
  assert.equal(world.rayDistance(from, v(0, 0, 1), 3), 3)
  assert(!world.fits(capsule(v(1.5, 0, -0.1))))
  assert(!world.visible(from, behindDoor, ignored), 'closed solid door behind wire still blocks sight')
  assert(Math.abs(world.rayDistance(from, v(0, 0, 1), 6) - 3.9575) < 0.01)
  setDoorOpen(door, true, true); world.refresh()
  assert(world.visible(from, behindDoor, ignored), 'opened solid door exposes the sightline through wire')
  assert.equal(world.rayDistance(from, v(0, 0, 1), 6), 6)
  world.dispose()
}
console.log('PASS Wire gates pass gunfire and sight; a closed solid door behind them blocks both until opened')

for (const angle of [0, Math.PI / 2]) {
  const scene = new THREE.Scene()
  const door = createFenceGate({ name: 'Hinged wire gate', x: 8, z: -4, width: 8, height: 3.1, angle })
  scene.add(door)
  const world = new CollisionWorld(scene)
  const at = (point: THREE.Vector3) => door.localToWorld(point)
  const from = at(v(1, 1.3, -2)), to = at(v(1, 1.3, 2))
  const direction = to.clone().sub(from).normalize()
  assert(!world.fits(capsule(at(v(1, 0, 0)))), 'closed hinged wire gate blocks bodies')
  assert(world.visible(from, to, ignored), 'closed hinged wire gate passes sight through its wire')
  assert.equal(world.rayDistance(from, direction, 4), 4, 'closed hinged wire gate passes gunfire')
  setDoorOpen(door, true, true); world.refresh()
  assert(world.fits(capsule(at(v(1, 0, 0)))), 'opening the wire gate clears its former collision panel')
  const hinge = door.children.find(child => child.userData.doorHinge)!
  const leafPoint = hinge.localToWorld(v(4, 0, 0))
  assert(!world.fits(capsule(leafPoint)), 'the open wire leaf still blocks bodies at its swung position')
  setDoorOpen(door, false, true); world.refresh()
  assert(!world.fits(capsule(at(v(1, 0, 0)))), 'closing restores the wire gate barrier')
  world.dispose()
}
console.log('PASS Hinged wire gates move body collision with their leaf while passing sight and gunfire')

{
  const scene = new THREE.Scene(), panel = new THREE.Group()
  panel.userData.collisionPanels = [{ a: [-3, 0], b: [3, 0], height: 3 }]
  scene.add(panel)
  const world = new CollisionWorld(scene)
  assert(!world.visible(v(1, 1, -2), v(1, 1, 2), ignored), 'unmarked collision panels remain opaque')
  assert(world.rayDistance(v(1, 1, -2), v(0, 0, 1), 4) < 2)
  world.dispose()
}
console.log('PASS Unmarked solid collision panels preserve sight and ballistic blocking')

{
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2
  scene.add(floor, fence('Combat fence', [[-12, 0], [12, 0]]))
  const world = new CollisionWorld(scene)
  let damage = 0
  const director = new EnemyDirector({ scene, world, doors: [],
    specs: [{ id: 'wire-guard', name: 'Wire guard', weapon: 'pistol', position: [0, 0, 4], patrol: [], facing: Math.PI }],
    emit() {}, damagePlayer(amount) { damage += amount }, dropWeapon() {},
  }, async () => {
    const root = new THREE.Group()
    return { root, update() {}, shoot() {}, react() {}, restore() {}, dispose() {}, reactionRemaining: 0,
      muzzle: () => root.position.clone().add(v(0, 1.3, -0.5)) } as unknown as EnemyActor
  })
  await director.init()
  const player: PlayerSense = { feet: v(0, 0, -4), eye: v(0, 1.65, -4), velocity: v(), alive: true, radioEnabled: false }
  for (let frame = 0; frame < 720; frame++) {
    const enemy = director.enemies[0]
    enemy.tactic = 'hold'; enemy.tacticTimer = 100
    director.update(1 / 60, player)
  }
  assert.equal(director.enemies[0].state, 'combat', 'enemy must acquire the player through wire')
  assert(director.enemies[0].shots > 0, 'enemy must fire through wire')
  assert(damage > 0, 'enemy shots must damage the player through wire')
  const origin = v(0, 1.2, -4), direction = director.enemies[0].position.clone().setY(1.2).sub(origin).normalize()
  assert(director.hit({ origin, direction, range: 20, damage: 34, weapon: 'pistol' }, world.rayDistance(origin, direction, 20)),
    'world-clipped player shot must hit the guard through wire')
  director.dispose(); world.dispose()
}
console.log('PASS Enemy director sees and damages the player through wire; player ballistics also damage the enemy through wire')
