import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { createCompound } from '../src/world/compound'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody } from '../src/player/body'
import { PlayerActions } from '../src/player/actions'
import { fallDamage } from '../src/game/balance'

const scene = createCompound(), world = new CollisionWorld(scene), body = new PlayerBody(world)
const actions = new PlayerActions(scene, body), camera = new THREE.PerspectiveCamera(75, 1, 0.06, 1600)
const zipline = actions.ziplines[0]
assert(zipline, 'The tower cable is registered as an interaction')
assert.equal(actions.ziplines.length, 1)
assert.equal(zipline.userData.direction, 'water-to-observation')
const stand = (end: boolean) => {
  actions.reset()
  body.teleport(actions.ziplinePoint(zipline, end))
  for (let i = 0; i < 30; i++) body.update(1 / 60, new THREE.Vector3(), false)
  assert(body.grounded, 'Cable landing has a solid floor')
  actions.syncCamera(camera)
  camera.lookAt(actions.ziplinePoint(zipline, end).add(new THREE.Vector3(0, 1.3, 0)))
  camera.updateMatrixWorld(true)
  if (end) assert.notEqual(actions.findTarget(camera)?.kind, 'zipline', 'Arrival landing never offers a reverse ride')
  else assert.equal(actions.findTarget(camera)?.kind, 'zipline', 'F prompt reachable at the water tower launch')
}

{
  stand(false)
  assert(actions.activate(camera))
  assert(actions.traversing && actions.riding)
  assert.equal(actions.findTarget(camera), null, 'Cannot retrigger or open doors in midair')
  const paused = body.position.clone(), remaining = actions.riding.remaining
  actions.updateTraversal(0)
  assert(body.position.equals(paused) && actions.riding.remaining === remaining, 'Zero time does not advance a paused ride')
  let frames = 0
  while (actions.riding && frames++ < 1000) {
    actions.updateTraversal(1 / 60)
    const capsule = new Capsule(body.position.clone().add(new THREE.Vector3(0, 0.28, 0)),
      body.position.clone().add(new THREE.Vector3(0, 1.52, 0)), 0.28)
    assert(world.fits(capsule), `Cable route clips geometry at ${body.position.toArray()}`)
    assert.equal(body.velocity.lengthSq(), 0, 'Normal movement cannot accumulate during the ride')
  }
  assert(!actions.traversing, 'Ride finishes in finite time')
  assert(body.position.distanceTo(actions.ziplinePoint(zipline, true)) < 0.001)
  for (let i = 0; i < 60; i++) {
    body.update(1 / 60, new THREE.Vector3(), false)
    assert.equal(fallDamage(body.landingSpeed), 0, 'Zipline dismount must remain safe')
  }
  assert(body.grounded && Math.abs(body.position.y - actions.ziplinePoint(zipline, true).y) < 0.05, 'Dismount remains safely on the opposite tower')
  console.log('PASS water → observation F prompt, path clearance, grounded dismount')
}

for (const progress of [0.15, 0.85]) {
  stand(false)
  assert(actions.activate(camera))
  while (actions.riding && 1 - actions.riding.remaining / actions.riding.distance < progress) actions.updateTraversal(0.05)
  actions.reset()
  assert(!actions.traversing)
  assert(body.position.distanceTo(actions.ziplinePoint(zipline, progress > 0.5)) < 0.001, 'Cancellation places player at the nearest safe landing')
}
console.log('PASS transit cancellation returns to a safe tower')

{
  stand(false)
  const orientation = camera.quaternion.clone()
  assert(actions.activate(camera, 'instant'))
  assert(!actions.traversing)
  assert(body.position.distanceTo(actions.ziplinePoint(zipline, true)) < 0.001)
  assert(camera.quaternion.equals(orientation), 'VR transit does not rotate the headset')
}
console.log('PASS VR blink reaches the observation tower without camera rotation')

for (const mode of ['animated', 'instant'] as const) {
  stand(true)
  const position = body.position.clone()
  assert(!actions.activate(camera, mode), 'Observation tower cannot activate a return ride')
  assert(!actions.traversing && body.position.equals(position), 'Rejected reverse ride cannot move the player')
}
console.log('PASS reverse boarding is disabled for desktop and VR')

actions.reset()
body.teleport(actions.ziplinePoint(zipline, false).setY(0))
actions.syncCamera(camera)
camera.lookAt(actions.ziplinePoint(zipline, false))
camera.updateMatrixWorld(true)
assert.notEqual(actions.findTarget(camera)?.kind, 'zipline', 'Cannot board the cable from the ground')
console.log('PASS cable cannot be activated from below its landing')

// Eye-level lines clear these rails, but a standing capsule cannot cross them.
// Fixtures follow the landing orientation when the destination tower moves.
const launch = scene.getObjectByName('Water tower launch landing')!
for (const [across, along] of [[-2.072381986878163, 4.462295710057219], [-1.3391621042891835, 4.757911345259764]]) {
  const point = launch.localToWorld(new THREE.Vector3(across, launch.userData.floorHeight + 0.019, along))
  actions.reset(); body.teleport(point); actions.syncCamera(camera)
  camera.lookAt(actions.ziplinePoint(zipline, false).add(new THREE.Vector3(0, 1.3, 0))); camera.updateMatrixWorld(true)
  assert(world.fits(new Capsule(body.position.clone().add(new THREE.Vector3(0, 0.28, 0)),
    body.position.clone().add(new THREE.Vector3(0, 1.52, 0)), 0.28)), 'Regression fixture starts in clear space')
  assert.notEqual(actions.findTarget(camera)?.kind, 'zipline', 'No boarding prompt across a railing')
  assert(!actions.activate(camera), 'Activation rechecks body clearance')
}
let boarded = 0
for (const reverse of [false, true]) {
  const endpoint = actions.ziplinePoint(zipline, reverse)
  for (let x = -2.2; x <= 2.2; x += 0.25) for (let z = -2.2; z <= 2.2; z += 0.25) {
    actions.reset()
    if (Math.hypot(x, z) > 2.3) continue
    const start = endpoint.clone().add(new THREE.Vector3(x, 0, z))
    const floor = world.floor(start, 0.1, 0.2, 0.28)
    if (!Number.isFinite(floor)) continue
    start.y = floor + 0.025
    const capsuleAt = (point: THREE.Vector3) => new Capsule(point.clone().add(new THREE.Vector3(0, 0.28, 0)),
      point.clone().add(new THREE.Vector3(0, 1.52, 0)), 0.28)
    if (!world.fits(capsuleAt(start))) continue
    body.teleport(start); actions.syncCamera(camera)
    camera.lookAt(endpoint.clone().add(new THREE.Vector3(0, 1.3, 0))); camera.updateMatrixWorld(true)
    const target = actions.findTarget(camera)
    if (reverse) {
      assert.notEqual(target?.kind, 'zipline', 'No reverse prompt anywhere on the observation landing')
      continue
    }
    if (target?.kind !== 'zipline') continue
    assert(actions.activate(camera)); boarded++
    // The full flight was tested above; sweep the newly authored approach from
    // every accepted standing position until the first anchor is reached.
    while (actions.riding && actions.riding.points[0]!.equals(endpoint)) {
      actions.updateTraversal(1 / 60)
      assert(world.fits(capsuleAt(body.position)), `Boarding crosses geometry from ${start.toArray()}`)
    }
  }
}
assert(boarded > 100, 'Clear areas of the water tower launch retain useful boarding reach')
console.log(`PASS ${boarded} boarding positions clear the complete capsule approach; rail-obstructed prompts are rejected`)
world.dispose()
