import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCompound } from '../src/world/compound'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody } from '../src/player/body'
import { PlayerActions } from '../src/player/actions'
import { fallDamage } from '../src/game/balance'

const scene = createCompound(), world = new CollisionWorld(scene), body = new PlayerBody(world)
const actions = new PlayerActions(scene, body), zero = new THREE.Vector3()
const landings: number[] = []
function step(dt: number, direction = zero) {
  body.update(dt, direction, false)
  if (body.landingSpeed > 0) landings.push(body.landingSpeed)
}
function settle(point: THREE.Vector3) {
  body.teleport(point)
  for (let i = 0; i < 60; i++) step(1 / 60)
  assert(body.grounded)
  landings.length = 0
}

for (const fps of [20, 30, 60, 144]) {
  settle(new THREE.Vector3(-180, 0.05, 0))
  assert(body.jump())
  for (let i = 0; i < fps * 2; i++) step(1 / fps)
  assert.equal(landings.length, 1)
  assert.equal(fallDamage(landings[0]), 0, 'Ordinary jumps must remain safe')
  for (const [height, min, max] of [[2, 0, 0], [4, 20, 25], [7, 59, 65], [13, 100, 100]]) {
    body.teleport(new THREE.Vector3(-180, height, 0)); landings.length = 0
    for (let i = 0; i < fps * 3; i++) step(1 / fps)
    assert.equal(landings.length, 1, `One contact event for ${height} m at ${fps} fps`)
    const damage = fallDamage(landings[0])
    assert(damage >= min && damage <= max, `${height} m at ${fps} fps: ${damage} damage`)
    assert(body.grounded && body.velocity.y === 0)
    assert.equal(body.landingSpeed, 0, 'Grounded frames clear the contact event')
  }
}
console.log('PASS Safe ordinary jumps, increasing fall damage, lethal high falls and one contact at 20/30/60/144 fps')

// Use the actual roof/tower access openings: both walking off and jumping off
// must reach real map collision and register damage there, not in midair.
const heights: number[] = []
for (const ladder of actions.ladders.filter(ladder => /west exterior|tower/i.test(ladder.name))) {
  for (const jump of [false, true]) {
    settle(actions.ladderPoint(ladder, true))
    const height = body.position.y
    const outward = new THREE.Vector3(0, 0, 1).transformDirection(ladder.matrixWorld)
    if (jump) assert(body.jump())
    for (let i = 0; i < 300; i++) step(1 / 60, outward)
    const damaging = landings.filter(speed => fallDamage(speed) > 0)
    assert(body.grounded && body.position.y < height - 2, `${ladder.name}: reached the ground`)
    // The observation route can hit the 2.5 m fence before reaching the yard.
    assert(damaging.length >= 1 && damaging.length <= 2, `${ladder.name}: damaging contacts`)
    for (let i = 0; i < 60; i++) step(1 / 60)
    assert.equal(landings.filter(speed => fallDamage(speed) > 0).length, damaging.length,
      'Standing after landing cannot repeat damage')
    console.log(`PASS ${ladder.name}: ${jump ? 'jump' : 'walk off'}, ${damaging.map(speed => fallDamage(speed).toFixed(1)).join(' + ')} damage`)
    heights.push(height)
  }
}
assert.equal(heights.length, 6, 'Starting building and both towers are covered')

// Landing on an intermediate surface stops the fall; a later drop starts fresh.
const platformScene = new THREE.Group()
const floor = new THREE.Mesh(new THREE.BoxGeometry(100, 1, 100), new THREE.MeshBasicMaterial())
floor.position.y = -0.5; platformScene.add(floor)
const platform = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 3), new THREE.MeshBasicMaterial())
platform.position.y = 3.9; platformScene.add(platform)
const platformWorld = new CollisionWorld(platformScene), platformBody = new PlayerBody(platformWorld)
platformBody.teleport(new THREE.Vector3(0, 6, 0))
let firstDamage = 0, secondDamage = 0
for (let i = 0; i < 120; i++) {
  platformBody.update(1 / 60, zero, false)
  firstDamage += fallDamage(platformBody.landingSpeed)
}
assert.equal(firstDamage, 0); assert(Math.abs(platformBody.position.y - 4) < 0.01)
for (let i = 0; i < 180; i++) {
  platformBody.update(1 / 60, new THREE.Vector3(1, 0, 0), false)
  secondDamage += fallDamage(platformBody.landingSpeed)
}
assert(secondDamage > 20 && secondDamage < 26, 'Only the second, four-metre drop hurts')
platformBody.teleport(new THREE.Vector3(10, 12, 0))
for (let i = 0; i < 45; i++) platformBody.update(1 / 60, zero, false)
assert(platformBody.velocity.y < -10)
platformBody.teleport(new THREE.Vector3(10, 0.02, 0))
assert.equal(platformBody.landingSpeed, 0)
platformBody.update(1 / 30, zero, false)
assert.equal(fallDamage(platformBody.landingSpeed), 0, 'Teleport/reset discards old falling momentum')
console.log('PASS Intermediate landings and teleport reset cannot inherit an earlier fall')
platformWorld.dispose(); world.dispose()
