import assert from 'node:assert/strict'
import * as THREE from 'three'
import { TouchAimAssist } from '../src/game/touch-aim-assist'
import { TOUCH_AIM_ASSIST } from '../src/game/balance'
import type { Enemy } from '../src/game/ai'
import type { HitVolume } from '../src/game/hit-reactions'
import { CollisionWorld } from '../src/player/collision'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const volume = (bone: HitVolume['bone'], point: THREE.Vector3, zone: HitVolume['zone']): HitVolume =>
  ({ a: point, b: point.clone(), radius: 0.1, bone, zone })
const enemy = (volumes: HitVolume[], position = v(0, 0, -10)) => ({
  health: 100, state: 'idle', position, actor: { root: new THREE.Group(), hitVolumes: { volumes: () => volumes } },
}) as unknown as Enemy
const options = { enabled: true, strength: 0, range: 110, reducedMotion: false }
const clear = { visible: () => true, rayDistance: (_o: THREE.Vector3, _d: THREE.Vector3, range: number) => range }
const setup = (aspect = 844 / 390, fov = 60) => {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.01, 400)
  camera.position.set(0, 1.6, 0)
  camera.updateMatrixWorld(true)
  return { camera, assist: new TouchAimAssist() }
}
const error = (camera: THREE.PerspectiveCamera, point: THREE.Vector3) =>
  camera.getWorldDirection(new THREE.Vector3()).angleTo(point.clone().sub(camera.position))
const head = volume('head', v(0.4, 1.65, -10), 'head')
const torso = volume('chest', v(0.4, 1.16, -10), 'torso')
const leg = volume('thigh.L', v(0.4, 0.55, -10), 'leg')

for (const target of [head, torso, leg]) {
  const { camera, assist } = setup()
  camera.lookAt(target.a.clone().add(v(-0.3, 0, 0)))
  const before = error(camera, target.a)
  for (let i = 0; i < 30; i++) assist.update(1 / 60, camera, [enemy([head, torso, leg])], clear, options)
  assert(error(camera, target.a) < before * 0.01, `Magnet follows the ${target.zone} nearest the crosshair`)
}
console.log('PASS nearest head, torso and leg attraction without forcing headshots')

const rotations = [30, 60, 144].map(fps => {
  const { camera, assist } = setup()
  for (let i = 0; i < fps / 2; i++) assist.update(1 / fps, camera, [enemy([head])], clear, options)
  assert(error(camera, head.a) < 0.001)
  return camera.quaternion.clone()
})
assert(rotations[0].angleTo(rotations[1]) < 1e-7 && rotations[0].angleTo(rotations[2]) < 1e-7)
console.log('PASS matching convergence at 30, 60 and 144 fps')

for (const blocked of [
  { ...clear, visible: () => false },
  { ...clear, rayDistance: () => 2 },
]) {
  const { camera, assist } = setup(), before = camera.quaternion.clone()
  assist.update(1 / 60, camera, [enemy([head])], blocked, options)
  assert(before.angleTo(camera.quaternion) < 1e-7, 'Cover prevents attraction')
}
{
  const scene = new THREE.Scene()
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 1.3, 0.2), new THREE.MeshBasicMaterial())
  wall.position.set(0, 0.65, -8); scene.add(wall)
  const world = new CollisionWorld(scene)
  const { camera, assist } = setup()
  camera.lookAt(torso.a)
  for (let i = 0; i < 40; i++) assist.update(1 / 60, camera, [enemy([head, torso])], world, options)
  assert(error(camera, head.a) < 0.001, 'The visible head wins over the closer torso hidden behind a real wall')
}
console.log('PASS sight and ballistic occlusion, including a head exposed above real cover')

for (const [label, change] of [
  ['dead', (e: Enemy) => { e.health = 0 }],
  ['reserve', (e: Enemy) => { e.state = 'reserve' }],
  ['hidden', (e: Enemy) => { e.actor.root.visible = false }],
] as const) {
  const { camera, assist } = setup(), before = camera.quaternion.clone(), target = enemy([head])
  change(target)
  assist.update(1 / 60, camera, [target], clear, options)
  assert(before.angleTo(camera.quaternion) < 1e-7, `${label} enemies are excluded`)
}
for (const point of [v(8, 1.6, -10), v(0.4, 1.6, 10), v(0.4, 1.6, -120)]) {
  const { camera, assist } = setup(), before = camera.quaternion.clone()
  assist.update(1 / 60, camera, [enemy([volume('head', point, 'head')], point)], clear, options)
  assert(before.angleTo(camera.quaternion) < 1e-7, 'No attraction outside the capture area, behind the camera or beyond weapon range')
}
console.log('PASS dead, inactive, hidden, distant and off-crosshair targets are excluded')

{
  const { camera, assist } = setup(), target = enemy([head])
  assist.update(1 / 60, camera, [target], clear, options)
  for (const inactive of [{ ...options, enabled: false }, { ...options, strength: 1 }]) {
    const before = camera.quaternion.clone()
    assist.update(1 / 60, camera, [target], clear, inactive)
    assert(before.angleTo(camera.quaternion) < 1e-7, 'Release/disabled state and strong steering never move the view')
    assert.equal((assist as any).locked, null, 'No stale lock survives release or a deliberate turn')
  }
  assist.update(1 / 60, camera, [target], clear, options)
  target.health = 0
  const before = camera.quaternion.clone()
  assist.update(1 / 60, camera, [target], clear, options)
  assert(before.angleTo(camera.quaternion) < 1e-7)
  assert.equal((assist as any).locked, null)
  assist.reset()
  assert.equal((assist as any).locked, null)
}
console.log('PASS release, deliberate steering, death and reset clear the lock')

{
  const { camera, assist } = setup()
  const target = enemy([head]), neighbour = enemy([volume('head', v(-0.42, 1.65, -10), 'head')])
  assist.update(1 / 144, camera, [target, neighbour], clear, options)
  assert.equal((assist as any).locked.enemy, target)
  neighbour.actor.hitVolumes.volumes()[0].a.x = -0.39
  assist.update(1 / 144, camera, [target, neighbour], clear, options)
  assert.equal((assist as any).locked.enemy, target, 'Small target ordering changes do not flicker the lock')
  const moving = volume('head', v(0.3, 1.65, -10), 'head'), mover = enemy([moving])
  assist.reset()
  for (let i = 0; i < 60; i++) {
    moving.a.x = moving.b.x = 0.3 + i * 0.004
    assist.update(1 / 60, camera, [mover], clear, options)
  }
  assert(error(camera, moving.a) < 0.003, 'The lock follows the animated part as it moves')
}
console.log('PASS stable target retention and moving body-part tracking')

for (const aspect of [390 / 844, 844 / 390]) {
  for (const fov of [60, 15]) {
    const { camera, assist } = setup(aspect, fov)
    const x = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * Math.min(1, aspect) * 10 * TOUCH_AIM_ASSIST.acquireRadius
    const target = enemy([volume('head', v(x * 0.8, 1.6, -10), 'head')])
    assist.update(1 / 60, camera, [target], clear, options)
    assert(camera.quaternion.angleTo(new THREE.Quaternion()) > 0, 'Same relative capture area in portrait, landscape and scope')
    camera.quaternion.identity(); assist.reset()
    const outside = enemy([volume('head', v(x * 1.2, 1.6, -10), 'head')])
    assist.update(1 / 60, camera, [outside], clear, options)
    assert(camera.quaternion.angleTo(new THREE.Quaternion()) < 1e-7)
  }
}
{
  const normal = setup(), reduced = setup()
  normal.assist.update(1 / 60, normal.camera, [enemy([head])], clear, options)
  reduced.assist.update(1 / 60, reduced.camera, [enemy([head])], clear, { ...options, reducedMotion: true })
  const angle = (camera: THREE.PerspectiveCamera) => camera.quaternion.angleTo(new THREE.Quaternion())
  assert(angle(reduced.camera) > 0 && angle(reduced.camera) < angle(normal.camera))
  const { camera, assist } = setup()
  assist.update(10, camera, [enemy([head])], clear, options)
  assert(angle(camera) <= TOUCH_AIM_ASSIST.maxRadiansPerSecond * 0.05 + 1e-7, 'Long frames cannot snap the view')
}
console.log('PASS portrait/landscape and scope capture bounds, reduced motion and bounded long frames')
