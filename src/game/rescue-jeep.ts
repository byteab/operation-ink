import * as THREE from 'three'
import { Draft, type Point } from '../render/ink'
import { RESCUE_LAYOUT } from './rescue-layout'

function circle(draft: Draft, radius: number, z: number, x = 0, y = 0) {
  draft.line(Array.from({ length: 32 }, (_, index): Point => {
    const angle = index / 32 * Math.PI * 2
    return [x + Math.sin(angle) * radius, y + Math.cos(angle) * radius, z]
  }), 'detail', true)
}

function roadWheel(outside = 1) {
  const wheel = new Draft('Jeep tire and wheel contours')
  wheel.solid(new THREE.CylinderGeometry(0.411, 0.411, 0.25, 48),
    [0, 0, 0], 'paper', false, [Math.PI / 2, 0, 0])
  for (const side of [-1, 1]) circle(wheel, 0.411, side * 0.125)
  circle(wheel, 0.218, outside * 0.15)
  circle(wheel, 0.079, outside * 0.15)
  for (let mark = 0; mark < 22; mark++) {
    const angle = mark / 22 * Math.PI * 2
    wheel.line([[Math.sin(angle) * 0.25, Math.cos(angle) * 0.25, outside * 0.144],
      [Math.sin(angle + 0.12) * 0.397, Math.cos(angle + 0.12) * 0.397, outside * 0.144]], 'mesh')
    if (mark % 3 === 0) wheel.line([[Math.sin(angle + 0.19) * 0.26, Math.cos(angle + 0.19) * 0.26, outside * 0.147],
      [Math.sin(angle + 0.04) * 0.39, Math.cos(angle + 0.04) * 0.39, outside * 0.147]], 'mesh')
  }
  for (let tread = 0; tread < 4; tread++) {
    const angle = tread / 4 * Math.PI * 2
    const x = Math.sin(angle) * 0.411, y = Math.cos(angle) * 0.411
    wheel.line([[x, y, -0.125], [x, y, 0.125]], 'detail')
  }
  return wheel.finish()
}

/** Warm paper panels with sparse pen contours. Local +X is forward. */
export function createRescueJeep() {
  const root = new THREE.Group()
  root.name = 'Willys rescue utility jeep'
  root.position.set(...RESCUE_LAYOUT.escapeRoute[0])
  root.userData = { noCollision: true, kind: 'rescue-jeep', forward: [1, 0, 0],
    passengerSeat: [-0.35, 0.34, 0.46], driverSeat: [-0.35, 0.34, -0.46] }

  const floor = new Draft('Jeep cabin floor and recessed footwells')
  floor.box(1.56, 0.11, 1.5, -0.98, 0.53, 0, 'paper', false)
  floor.box(1.39, 0.11, 1.5, 1.025, 0.53, 0, 'paper', false)
  floor.box(0.53, 0.05, 1.4, 0.065, 0.275, 0, 'paper', false)
  root.add(floor.finish())

  const body = new Draft('Jeep body, hood and fender contours')
  // Opaque paper surfaces hide rear contours while keeping the simple pen drawing.
  body.face([[0.43, 1.13, -0.735], [1.79, 1.13, -0.735], [1.79, 1.13, 0.735],
    [0.43, 1.13, 0.735]], 'paper', 'detail')
  body.face([[1.79, 1.13, -0.735], [1.79, 0.44, -0.735], [1.79, 0.44, 0.735],
    [1.79, 1.13, 0.735]], 'paper', 'detail')
  body.face([[0.43, 0.585, -0.79], [0.43, 1.13, -0.79], [0.43, 1.13, 0.79],
    [0.43, 0.585, 0.79]], 'paper', 'detail')
  body.hatch([0.5, 1.147, -0.67], [0.55, 0, 0], [0, 0, 0.38],
    { spacing: 0.085, inset: 0.025 })
  for (const side of [-1, 1]) {
    const z = side * 0.79
    body.face([[-1.785, 0.585, z], [-1.785, 1.06, z], [-0.625, 1.06, z],
      [-0.625, 0.585, z]], 'paper', false)
    body.face([[0.43, 0.585, side * 0.735], [0.43, 1.13, side * 0.735],
      [1.79, 1.13, side * 0.735], [1.79, 0.585, side * 0.735]], 'paper', false)
    body.line([[-1.785, 0.585, z], [-1.785, 1.06, z], [-0.625, 1.06, z],
      [-0.625, 0.585, z], [0.43, 0.585, z], [0.43, 1.13, z]], 'detail')
    // One flat fender over each tire, and a single door sill below the opening.
    body.line([[0.61, 0.635, z], [0.61, 0.97, z], [1.65, 0.97, z]], 'detail')
    body.face([[0.61, 0.97, side * 0.735], [0.61, 0.97, side * 0.965],
      [1.65, 0.97, side * 0.965], [1.65, 0.97, side * 0.735]], 'paper', 'detail')
    body.face([[-1.63, 1.06, z], [-1.63, 1.06, side * 0.95],
      [-0.61, 1.06, side * 0.95], [-0.61, 1.06, z]], 'paper', 'detail')
    body.line([[-0.56, 0.53, z], [0.32, 0.53, z]], 'detail')
    body.hatch([-1.7, 0.65, side * 0.807], [0.61, 0, 0], [0, 0.3, 0],
      { spacing: 0.09, inset: 0.025 })
  }
  body.face([[-1.785, 0.585, -0.79], [-1.785, 0.585, 0.79],
    [-1.785, 1.06, 0.79], [-1.785, 1.06, -0.79]], 'paper', 'detail')
  body.face([[1.96, 0.41, -0.955], [1.96, 0.55, -0.955], [1.96, 0.55, 0.955],
    [1.96, 0.41, 0.955]], 'paper', 'detail')
  root.add(body.finish())

  const grille = new Draft('Jeep grille and headlight outlines')
  for (let slot = -3; slot <= 3; slot++) {
    grille.line([[1.8, 0.58, slot * 0.11], [1.8, 0.995, slot * 0.11]], 'detail')
  }
  for (const side of [-1, 1]) {
    grille.line(Array.from({ length: 24 }, (_, index): Point => {
      const angle = index / 24 * Math.PI * 2
      return [1.81, 0.89 + Math.sin(angle) * 0.12, side * 0.585 + Math.cos(angle) * 0.12]
    }), 'detail', true)
  }
  root.add(grille.finish())

  const cabin = new Draft('Jeep windshield and seat outlines')
  cabin.face([[0.31, 1.1, -0.75], [0.215, 1.86, -0.75], [0.215, 1.86, 0.75],
    [0.31, 1.1, 0.75]], 'paper', 'detail')
  cabin.line([[0.31, 1.1, 0], [0.215, 1.86, 0]], 'detail')
  for (const side of [-1, 1]) {
    cabin.line([[0.296, 1.21, side * 0.16], [0.252, 1.57, side * 0.34]], 'detail')
    const z = side * 0.46
    cabin.face([[-0.645, 0.77, z - 0.285], [-0.055, 0.77, z - 0.285],
      [-0.055, 0.77, z + 0.285], [-0.645, 0.77, z + 0.285]], 'paper', 'detail')
    cabin.face([[-0.645, 0.77, z - 0.285], [-0.72, 1.27, z - 0.285],
      [-0.72, 1.27, z + 0.285], [-0.645, 0.77, z + 0.285]], 'paper', 'detail')
    cabin.hatch([-0.57, 0.787, z - 0.23], [0.25, 0, 0], [0, 0, 0.43],
      { spacing: 0.075, inset: 0.02 })
  }
  cabin.face([[-1.6, 0.795, -0.62], [-1.075, 0.795, -0.62],
    [-1.075, 0.795, 0.62], [-1.6, 0.795, 0.62]], 'paper', 'detail')
  cabin.face([[-1.6, 0.795, -0.62], [-1.65, 1.175, -0.62],
    [-1.65, 1.175, 0.62], [-1.6, 0.795, 0.62]], 'paper', 'detail')
  root.add(cabin.finish())

  const steering = new Draft('Driver steering wheel')
  circle(steering, 0.19, 0)
  for (let i = 0; i < 3; i++) {
    const angle = i / 3 * Math.PI * 2
    steering.line([[0, 0, 0], [Math.sin(angle) * 0.19, Math.cos(angle) * 0.19, 0]], 'detail')
  }
  steering.position.set(-0.04, 1.13, -0.46)
  steering.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.8, 0.6, 0))
  root.add(steering.finish())

  const wheels: THREE.Group[] = []
  for (const x of [-1.12, 1.14]) for (const z of [-0.77, 0.77]) {
    const wheel = roadWheel(Math.sign(z))
    wheel.name = `${x > 0 ? 'Front' : 'Rear'} ${z > 0 ? 'passenger' : 'driver'} wheel`
    wheel.position.set(x, 0.415, z)
    wheels.push(wheel)
    root.add(wheel)
  }
  root.userData.wheels = wheels
  root.userData.wheelRadius = 0.411
  root.userData.wheelAxis = 'z'

  const spare = roadWheel()
  spare.name = 'Rear mounted spare wheel'
  spare.position.set(-1.9, 1.13, 0.25)
  spare.rotation.y = -Math.PI / 2
  root.add(spare)
  return root
}
