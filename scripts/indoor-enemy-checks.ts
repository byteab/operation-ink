import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { CollisionWorld } from '../src/player/collision'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import { EnemyNavigation } from '../src/game/navigation'
import { insideVisionCone } from '../src/game/ai'

const scene = new THREE.Scene(), compound = createCompound(), mission = createMissionWorld()
prepareCompound(compound); scene.add(compound, mission.root); scene.updateMatrixWorld(true)
const world = new CollisionWorld(scene), doors: THREE.Group[] = []
scene.traverse(object => { if (object.userData.kind === 'door') doors.push(object as THREE.Group) })
const navigation = new EnemyNavigation(world, doors, () => {})
const roomAssignments: [string, string, string?][] = [
  ['mess-kitchen', 'Northwest service building', 'Main mess hall'],
  ['mess-east-aisle', 'Northwest service building', 'Main mess hall'],
  ['mess-vestibule', 'Northwest service building', 'Entry vestibule'],
  ['relay-backroom', 'Detention block and underground cells'], ['relay-equipment', 'Detention block and underground cells'],
  ['crew-north-room', 'Crew house'], ['crew-south-room', 'Crew house'],
  ['dispatch-records', 'Security cabin'], ['maintenance-stores', 'Maintenance shelter'],
  ['barracks-a-room', 'South barracks A'], ['barracks-b-room', 'South barracks B · long wing'],
  ['warehouse-west-aisle', 'Central long warehouse'], ['warehouse-east-aisle', 'Central long warehouse'],
  ['administration-room', 'West administration wing'], ['medical-room', 'East utility hut B'],
  ['southwest-stores-room', 'Southwest stores'], ['gatehouse-room', 'Inner gatehouse'],
]
assert.equal(mission.enemies.length, 41)
assert.equal(mission.enemies.filter(enemy => !enemy.reserve).length, 37)
assert.equal(mission.enemies.filter(enemy => enemy.reserve).length, 4)
assert.equal(new Set(mission.enemies.map(enemy => enemy.id)).size, 41)
const failures: string[] = []
for (const [id, buildingName, roomName] of roomAssignments) {
  try {
    const enemy = mission.enemies.find(enemy => enemy.id === id)!
    assert(enemy && !enemy.reserve)
    const building = scene.getObjectByName(buildingName)!
    assert(building)
    const footprint = building.userData.footprint as [number, number]
    const floor = building.userData.floor ?? building.userData.walkableInterior?.floor
    const room = roomName && building.userData.rooms.find((room: { name: string }) => room.name === roomName)
    for (let i = 0; i < enemy.patrol.length; i++) {
      const raw = new THREE.Vector3(...enemy.patrol[i]), local = building.worldToLocal(raw.clone())
      assert(Math.abs(local.x) < footprint[0] / 2 - 0.4 && Math.abs(local.z) < footprint[1] / 2 - 0.4, 'point must be genuinely inside building')
      const floors = building.userData.floors ?? [floor]
      assert(floors.some((height: number) => Math.abs(raw.y - height) < 0.03), 'point must use an interior floor, not roof')
      if (room) assert(local.x > room.min[0] && local.x < room.max[0] && local.z > room.min[2] && local.z < room.max[2], 'point must be inside the named room')
      const position = navigation.floor(raw, false)
      assert(position, `blocked or unsupported patrol point ${i}: ${raw.toArray()}`)
      const capsule = new Capsule(position.clone().add(new THREE.Vector3(0, 0.3, 0)), position.clone().add(new THREE.Vector3(0, 1.44, 0)), 0.3)
      assert(world.fits(capsule), 'capsule must clear furniture and closed doors')
      const next = navigation.floor(new THREE.Vector3(...enemy.patrol[(i + 1) % enemy.patrol.length]), false)
      assert(next && navigation.segment(position, next, false), 'short indoor patrol must clear furniture in both directions')
      for (const door of doors) {
        const p = door.getWorldPosition(new THREE.Vector3())
        if (Math.abs(p.y - position.y) < 1) assert(Math.hypot(p.x - position.x, p.z - position.z) > 1.4, `keep door ${door.name} clear`)
      }
    }
    const position = new THREE.Vector3(...enemy.position)
    for (const other of mission.enemies) if (other !== enemy) {
      assert(position.distanceTo(new THREE.Vector3(...other.position)) > 1.05, `overlaps another guard/reserve: ${other.id}`)
    }
    const eye = position.clone().add(new THREE.Vector3(0, 1.5, 0)), spawnEye = new THREE.Vector3(...mission.spawn).add(new THREE.Vector3(0, 1.65, 0))
    assert(position.distanceTo(new THREE.Vector3(...mission.spawn)) > 8, 'keep insertion space safe')
    assert(!insideVisionCone(eye, enemy.facing ?? 0, spawnEye, 36) || !world.visible(eye, spawnEye, new THREE.Object3D()), 'new guards must not spot the insertion immediately')
    console.log(`PASS ${id}: supported interior, clear capsule, doors and patrol loop`)
  } catch (error) { failures.push(`${id}: ${error instanceof Error ? error.message : error}`) }
}
world.dispose()
assert.deepEqual(failures, [])
console.log('PASS 37 active guards plus four reserves; all 17 remaining additions occupy supported rooms with safe patrols and protected insertion')
