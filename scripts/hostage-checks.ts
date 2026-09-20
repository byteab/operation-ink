import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { HostageEscort, type EscortMissionState } from '../src/game/hostages'
import { RESCUE_LAYOUT } from '../src/game/rescue-layout'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import { createCompound } from '../src/world/compound'
import { CollisionWorld } from '../src/player/collision'
import { setDoorOpen, updateDoors } from '../src/world/doors'
import type { Vec3 } from '../src/game/types'
import { HOSTAGE_INK, STAND_UP_SECONDS } from '../src/game/hostage-actor'
import { HOSTAGE_RUN_SPEED } from '../src/game/balance'
import { updateRescueJeepDoor } from '../src/game/rescue-jeep'

const bytes = readFileSync('public/models/stickman.glb'), load = GLTFLoader.prototype.loadAsync
GLTFLoader.prototype.loadAsync = async function () {
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}

const scene = new THREE.Scene(), compound = createCompound()
prepareCompound(compound)
const mission = createMissionWorld()
scene.add(compound, mission.root)
const doors: THREE.Group[] = []
scene.traverse(object => { if (object instanceof THREE.Group && object.userData.kind === 'door') doors.push(object) })
const world = new CollisionWorld(scene), escort = new HostageEscort(scene, world, doors)
await escort.init()
GLTFLoader.prototype.loadAsync = load
const player = new THREE.Vector3(...RESCUE_LAYOUT.jeepBoardPoint)
const fresh = (): EscortMissionState => ({ hostages: RESCUE_LAYOUT.hostageSpawns.map((position, index) => ({
  id: `hostage-${index + 1}`, status: 'captive', position: [...position] as Vec3, routeIndex: index < 2 ? 1 : 0,
})), jeep: 'waiting', escapeProgress: 0 })
const capsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.27)
const errors: string[] = []
function check(name: string, test: () => void) {
  try { test(); console.log('PASS', name) }
  catch (error) { errors.push(`${name}: ${error}`); console.error('FAIL', name, error) }
}
function tick(state: EscortMissionState, seconds: number, danger = false, verifyMovement = false) {
  for (let frame = 0; frame < seconds * 60; frame++) {
    const before = state.hostages.map(hostage => [...hostage.position] as Vec3)
    updateDoors(doors, 1 / 60)
    world.refresh()
    escort.update(1 / 60, state, player, danger)
    const hostage = state.hostages[0]
    updateRescueJeepDoor(mission.rescue!.jeep, hostage.position, hostage.status === 'loaded', 1 / 60)
    if (verifyMovement) state.hostages.forEach((hostage, index) => {
      if (hostage.status !== 'following') return
      const position = new THREE.Vector3(...hostage.position), previous = new THREE.Vector3(...before[index])
      assert(Math.hypot(position.x - previous.x, position.z - previous.z) <= HOSTAGE_RUN_SPEED / 60 + 0.002, `hostage ${index} teleported`)
      assert(Math.abs(position.y - previous.y) <= 0.3, `hostage ${index} skipped a stair`)
      capsule.start.copy(position).y += 0.27
      capsule.end.copy(position).y += 1.47
      assert(world.fits(capsule), `hostage ${index} intersects collision at ${position.toArray()}`)
    })
  }
}
function release(state: EscortMissionState) {
  for (const hostage of state.hostages) hostage.status = 'following'
  for (const door of doors.filter(door => door.name.toLowerCase().includes('cell'))) {
    door.userData.missionLocked = false
    setDoorOpen(door, true, true)
  }
  world.refresh()
}

// Match the rig's dual-quaternion shader: linear skinning understates the
// rounded pelvis at a 90-degree bend, which hid the original seat intersection.
function skinnedPoints(mesh: THREE.SkinnedMesh, frame: THREE.Object3D) {
  mesh.updateWorldMatrix(true, false)
  const real = mesh.skeleton.bones.map((bone, i) => new THREE.Quaternion().setFromRotationMatrix(
    bone.matrixWorld.clone().multiply(mesh.skeleton.boneInverses[i])))
  const dual = mesh.skeleton.bones.map((bone, i) => {
    const translation = new THREE.Vector3().setFromMatrixPosition(
      bone.matrixWorld.clone().multiply(mesh.skeleton.boneInverses[i]))
    return new THREE.Quaternion(translation.x, translation.y, translation.z, 0).multiply(real[i]).toArray().map(v => v * 0.5)
  })
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes
  const transform = frame.matrixWorld.clone().invert().multiply(mesh.matrixWorld).multiply(mesh.bindMatrixInverse)
  return Array.from({ length: position.count }, (_, i) => {
    const r = new THREE.Vector4(0, 0, 0, 0), d = new THREE.Vector4(0, 0, 0, 0)
    const reference = real[skinIndex.getX(i)]
    for (let j = 0; j < 4; j++) {
      const index = skinIndex.getComponent(i, j), q = real[index]
      const weight = skinWeight.getComponent(i, j) * (q.dot(reference) < 0 ? -1 : 1)
      r.addScaledVector(new THREE.Vector4(q.x, q.y, q.z, q.w), weight)
      d.addScaledVector(new THREE.Vector4(...dual[index]), weight)
    }
    const length = r.length()
    r.divideScalar(length); d.divideScalar(length)
    const rotation = new THREE.Quaternion(r.x, r.y, r.z, r.w)
    const translation = new THREE.Quaternion(d.x, d.y, d.z, d.w).multiply(rotation.clone().conjugate())
    return new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix).applyQuaternion(rotation)
      .add(new THREE.Vector3(translation.x, translation.y, translation.z).multiplyScalar(2)).applyMatrix4(transform)
  })
}

check('one blue hostage uses the real enemy skinned GLB and remains seated in jail', () => {
  const state = fresh(); escort.sync(state)
  const before = structuredClone(state)
  tick(state, 2)
  assert.deepEqual(state, before)
  assert.equal(escort.actors.length, 1)
  assert.equal(mission.stations.filter(station => station.kind === 'hostage').length, 1)
  assert.equal(mission.rescue!.cellDoors.length, 1)
  for (const actor of escort.actors) {
    assert(actor.root.userData.hostage && actor.root.userData.noCollision)
    assert(!actor.root.getObjectByName('gun'))
    assert(actor.rig.mesh.isSkinnedMesh)
    assert.equal((actor.rig.mesh.material as THREE.MeshBasicMaterial).color.getHex(), HOSTAGE_INK)
    const color = (actor.rig.mesh.material as THREE.MeshBasicMaterial).color
    assert(color.b > color.r * 2 && color.b > color.g * 2, 'Hostage must be visibly blue')
    assert.equal(actor.root.userData.animation, 'hostage-seated')
    const hip = actor.rig.bones.hips.getWorldPosition(new THREE.Vector3())
    assert(Math.abs(hip.y - (RESCUE_LAYOUT.hostageSpawns[0][1] + 0.449)) < 0.025, `Seated hip ${hip.y}`)
  }
})

check('the chair supports the skinned body without clipping during seated idle or standing up', () => {
  const state = fresh(); escort.sync(state)
  const actor = escort.actors[0], chair = mission.root.getObjectByName('Hostage chair')!
  const surfaces = chair.getObjectByName('Hostage chair: concrete surfaces') as THREE.Mesh
  const position = surfaces.geometry.attributes.position, seat = new THREE.Box3()
  for (let i = 0; i < position.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(position, i)
    if (point.y < 0.5) seat.expandByPoint(point)
  }
  const clearance = () => {
    scene.updateMatrixWorld(true)
    const overSeat = skinnedPoints(actor.rig.mesh, chair).filter(point =>
      point.x >= seat.min.x && point.x <= seat.max.x && point.z >= seat.min.z && point.z <= seat.max.z)
    return Math.min(...overSeat.map(point => point.y)) - seat.max.y
  }
  for (let sample = 0; sample <= 12; sample++) {
    actor.animate(sample ? 0.3 : 0, false, false, false, true)
    const gap = clearance()
    assert(gap >= 0.001 && gap < 0.015, `Seated skin must rest just above the chair, gap ${gap} m`)
  }
  const riseGaps: number[] = []
  for (let frame = 0; frame < STAND_UP_SECONDS * 60 - 1; frame++) {
    actor.advanceRelease(1 / 60, false)
    actor.animate(1 / 60, false, false, false, false)
    riseGaps.push(clearance())
  }
  assert(Math.min(...riseGaps) >= 0.001, `Chair clips standing-up skin: minimum gap ${Math.min(...riseGaps)} m`)
})

check('release plants the feet, shifts weight, stands fully and only then starts escort', () => {
  const state = fresh(); escort.sync(state); release(state)
  const actor = escort.actors[0], before = [...state.hostages[0].position]
  tick(state, 0.5)
  assert.deepEqual(state.hostages[0].position, before)
  assert.equal(actor.root.userData.animation, 'hostage-stand-up')
  const middleHip = actor.rig.bones.hips.getWorldPosition(new THREE.Vector3()).y
  assert(middleHip > before[1] + 0.4 && middleHip < before[1] + 0.7)
  tick(state, STAND_UP_SECONDS - 0.55)
  assert.deepEqual(state.hostages[0].position, before)
  tick(state, 0.2)
  assert(actor.canWalk)
  assert.notDeepEqual(state.hostages[0].position, before)
})

check('active gunfire pauses escort, rally cannot teleport, and calm resumes movement', () => {
  const state = fresh(); escort.sync(state); release(state)
  const before = structuredClone(state.hostages)
  tick(state, 3, true)
  assert.deepEqual(state.hostages, before)
  escort.rally(state)
  assert.deepEqual(state.hostages, before)
  tick(state, 2, false, true)
  assert(state.hostages.some((hostage, index) => hostage.position[0] !== before[index].position[0]))
})

check('the hostage traverses his cell, corridor, stairs and surface route before boarding', () => {
  const state = fresh(); escort.sync(state); release(state)
  tick(state, 90, false, true)
  assert(state.hostages.every(hostage => hostage.status === 'loaded'), JSON.stringify(state.hostages))
  assert.equal(state.jeep, 'boarding')
  state.hostages.forEach((hostage, index) => assert.deepEqual(hostage.position, RESCUE_LAYOUT.jeepSeats[index]))
  escort.jeepOffset.set(20, 0, 0)
  state.jeep = 'escaping'; state.escapeProgress = 0.8
  tick(state, 0.1)
  state.hostages.forEach((hostage, index) => {
    assert.equal(hostage.position[0], RESCUE_LAYOUT.jeepSeats[index][0] + 20)
    assert.deepEqual(escort.actors[index].root.position.toArray(), hostage.position)
  })
  const origin = new THREE.Vector3(...RESCUE_LAYOUT.escapeRoute[0])
  for (const yaw of [0.28, -0.28, 0]) {
    escort.jeepRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    tick(state, 0.1)
    state.hostages.forEach((hostage, index) => {
      const seat = new THREE.Vector3(...RESCUE_LAYOUT.jeepSeats[index]).sub(origin)
        .applyQuaternion(escort.jeepRotation).add(origin).add(escort.jeepOffset)
      assert(seat.distanceTo(new THREE.Vector3(...hostage.position)) < 1e-9, 'Passenger slips during getaway turn')
      assert(escort.actors[index].root.quaternion.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 + yaw, 0))) < 1e-6)
    })
  }
})

check('boarding reaches the passenger side and settles continuously with feet above the footwell', () => {
  const state = fresh(); escort.sync(state); release(state)
  let boarded = false, settled = 0
  for (let frame = 0; frame < 90 * 60 && settled < 120; frame++) {
    const previous = new THREE.Vector3(...state.hostages[0].position), wasLoaded = state.hostages[0].status === 'loaded'
    tick(state, 1 / 60)
    if (state.hostages[0].status === 'loaded') {
      const current = new THREE.Vector3(...state.hostages[0].position)
      assert(current.distanceTo(previous) < 0.08, `Boarding snapped ${current.distanceTo(previous)}m`)
      if (!wasLoaded) {
        assert(current.distanceTo(new THREE.Vector3(...RESCUE_LAYOUT.jeepBoardPoint)) < 0.25)
        assert(current.distanceTo(new THREE.Vector3(...RESCUE_LAYOUT.jeepSeats[0])) < 1.4)
        boarded = true
      }
      settled++
    }
  }
  assert(boarded)
  const actor = escort.actors[0], jeep = mission.rescue!.jeep
  actor.root.updateMatrixWorld(true); jeep.updateMatrixWorld(true)
  for (const side of ['L', 'R'] as const) {
    const foot = actor.rig.bones[`shin.${side}`].localToWorld(new THREE.Vector3(0, 0.42, 0))
    const ray = new THREE.Raycaster(foot.clone().add(new THREE.Vector3(0, 0.01, 0)), new THREE.Vector3(0, -1, 0), 0, 0.2)
    const meshes: THREE.Mesh[] = []
    jeep.traverse(object => { if (object instanceof THREE.Mesh && object.type === 'Mesh') meshes.push(object) })
    const hit = ray.intersectObjects(meshes, false)[0]
    assert(hit && hit.point.y <= foot.y && foot.y - hit.point.y < 0.1, `Foot ${foot.toArray()} does not clear the cabin floor`)
  }
})

check('hostages wait when the player falls behind, then resume with a leader ahead', () => {
  const state = fresh(); escort.sync(state); release(state)
  tick(state, 12)
  player.fromArray(RESCUE_LAYOUT.hostageSpawns[0])
  tick(state, 1)
  const paused = state.hostages.map(hostage => [...hostage.position])
  tick(state, 2)
  assert.deepEqual(state.hostages.map(hostage => hostage.position), paused)
  player.fromArray(RESCUE_LAYOUT.jeepBoardPoint)
  tick(state, 90)
  assert(state.hostages.every(hostage => hostage.status === 'loaded'))
})

check('restart restores captive mesh positions, cell routes and vehicle offset', () => {
  const state = fresh(); escort.sync(state)
  assert.deepEqual(escort.jeepOffset.toArray(), [0, 0, 0])
  assert(escort.jeepRotation.equals(new THREE.Quaternion()))
  state.hostages.forEach((hostage, index) => {
    assert.equal(hostage.status, 'captive')
    assert.deepEqual(escort.actors[index].root.position.toArray(), RESCUE_LAYOUT.hostageSpawns[index])
    assert.equal(hostage.routeIndex, index < 2 ? 1 : 0)
  })
})

escort.dispose(); world.dispose()
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
}
