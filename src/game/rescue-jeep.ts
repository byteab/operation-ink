import * as THREE from 'three'
import { Draft, type Point } from '../render/ink'
import { RESCUE_LAYOUT } from './rescue-layout'

const WHEEL_RADIUS = 0.49

function circle(draft: Draft, radius: number, z: number, x = 0, y = 0) {
  draft.line(Array.from({ length: 40 }, (_, index): Point => {
    const angle = index / 40 * Math.PI * 2
    return [x + Math.sin(angle) * radius, y + Math.cos(angle) * radius, z]
  }), 'detail', true)
}

/** White paper surfaces and ink contours, matching the rest of the compound. */
export function createRescueJeep() {
  const root = new THREE.Group()
  root.name = 'Armored rescue transport'
  root.position.set(...RESCUE_LAYOUT.escapeRoute[0])
  root.userData = { dynamicCollision: true, kind: 'rescue-jeep', forward: [1, 0, 0],
    passengerSeat: [-0.35, 0.34, 0.46], driverSeat: [-0.35, 0.34, -0.46] }

  // Closed body volumes prevent walking through the thin decorative panels or
  // stepping into the cabin. The visible meshes still supply sight/shot cover.
  const barrierMaterial = new THREE.MeshBasicMaterial({ visible: false })
  for (const [width, height, depth, x, y] of [[4.64, 1.13, 2.04, 0, 0.565],
    [1.88, 0.93, 1.94, -0.525, 1.595]]) {
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), barrierMaterial)
    barrier.name = 'Transport body collision'
    barrier.position.set(x, y, 0)
    barrier.userData = { blocksSight: false, blocksShots: false }
    root.add(barrier)
  }

  // Use Draft's shared white paper for every panel, tire and fitting. Window
  // apertures retain their ink frames but no fill, so the driver can see out.
  const finish = (draft: Draft) => {
    draft.finish()
    for (const object of [...draft.children]) {
      if (object instanceof THREE.Mesh && object.name.endsWith(': glass surfaces')) {
        object.geometry.dispose()
        object.removeFromParent()
      }
    }
    return draft
  }

  const chassis = new Draft('Transport chassis and cabin floor')
  chassis.box(4.4, 0.18, 1.7, 0, 0.52, 0, 'green', 'detail')
  // Recessed footwell retains the seated hostage's existing feet/cushion alignment.
  chassis.box(0.64, 0.05, 1.8, 0.06, 0.275, 0, 'concrete', false)
  chassis.box(1.8, 0.09, 1.8, -1.14, 0.53, 0, 'concrete', false)
  chassis.box(1.5, 0.09, 1.8, 1.25, 0.53, 0, 'concrete', false)
  root.add(finish(chassis))

  const steps = new Draft('Front door side steps')
  // Only span the front doors: both ends clear the tires by over 0.43 m.
  for (const side of [-1, 1]) {
    steps.box(1.34, 0.09, 0.22, -0.02, 0.48, side * 1.08, 'paper', 'detail')
    steps.line([[-0.6, 0.53, side * 1.16], [0.56, 0.53, side * 1.16]], 'mesh')
    for (const x of [-0.43, 0.35]) {
      steps.beam([x, 0.48, side * 0.8], [x, 0.45, side * 1.09], 0.055, 'paper', 'detail')
    }
  }
  root.add(finish(steps))

  const body = new Draft('Armored hood, sloping rear and hardtop')
  // Low, wide nose and sloping hood are the Humvee's defining silhouette.
  body.face([[0.58, 1.35, -1.02], [2.32, 1.13, -1.02], [2.32, 1.13, 1.02], [0.58, 1.35, 1.02]], 'roof')
  body.face([[2.32, 0.7, -1.02], [2.32, 1.13, -1.02], [2.32, 1.13, 1.02], [2.32, 0.7, 1.02]], 'paper')
  body.face([[-1.35, 2.06, -0.97], [0.3, 2.06, -0.97], [0.3, 2.06, 0.97], [-1.35, 2.06, 0.97]], 'roof')
  body.box(1.7, 0.06, 2.02, -0.525, 2.07, 0, 'roof', 'detail')
  for (const side of [-1, 1]) body.box(1.78, 0.065, 0.08, -0.47, 2.014, side * 1.005, 'paper', 'detail')
  body.face([[-2.32, 1.2, -1.02], [-1.35, 2.06, -0.97], [-1.35, 2.06, 0.97], [-2.32, 1.2, 1.02]], 'paper')
  body.face([[-2.32, 0.62, -1.02], [-2.32, 1.2, -1.02], [-2.32, 1.2, 1.02], [-2.32, 0.62, 1.02]], 'concrete')
  for (const side of [-1, 1]) {
    const z = side * 1.025
    body.face([[0.54, 0.69, z], [0.54, 1.35, z], [2.32, 1.13, z], [2.32, 0.69, z]], 'paper', 'detail')
    // Continuous rear quarter panel: only the two front seats have doors.
    body.face([[-2.32, 0.62, z], [-2.32, 1.2, z], [-1.35, 2.06, side * 0.97],
      [-0.56, 2.015, z], [-0.56, 0.61, z]], 'paper', 'detail')
    body.line([[0.7, 1.325, side * 0.9], [2.21, 1.133, side * 0.9]], 'detail')
    body.line([[-2.23, 1.21, side * 0.89], [-1.38, 1.97, side * 0.85]], 'detail')
    // Wide angular wheel-arch brows, kept above the rotating tread.
    for (const x of [-1.62, 1.58]) {
      const arch = [[x - 0.68, 0.74], [x - 0.55, 1.13], [x + 0.5, 1.13], [x + 0.68, 0.77]]
      for (let i = 1; i < arch.length; i++) {
        const [ax, ay] = arch[i - 1], [bx, by] = arch[i]
        body.face([[ax, ay, z], [bx, by, z], [bx, by, side * 1.19], [ax, ay, side * 1.19]], 'paper', false)
      }
      body.line([[x - 0.68, 0.74, side * 1.19], [x - 0.55, 1.13, side * 1.19],
        [x + 0.5, 1.13, side * 1.19], [x + 0.68, 0.77, side * 1.19]], 'edge')
    }
    // Sparse rivets keep the large white panels readable.
    for (let x = -2.18; x < 2.2; x += 0.26) {
      if (Math.abs(x - 1.58) < 0.67 || Math.abs(x + 1.62) < 0.67) continue
      body.line([[x, 0.68, z * 1.003], [x + 0.018, 0.68, z * 1.003]], 'detail')
    }
  }
  // A plain sealed roof: no weapon, pedestal, turret or gun mount.
  body.line([[-1.22, 2.105, -0.84], [0.18, 2.105, -0.84]], 'mesh')
  body.line([[-1.2, 2.105, 0.83], [-0.69, 2.105, 0.83]], 'mesh')
  body.face([[-2.19, 1.327, -0.76], [-1.48, 1.956, -0.73], [-1.48, 1.956, 0.73], [-2.19, 1.327, 0.76]], 'paper', 'detail')
  body.box(0.045, 0.12, 0.2, -2.23, 1.3, 0, 'roof', 'detail', [0, 0, -0.72])
  root.add(finish(body))

  const front = new Draft('Split windshield, hood louvers and grille')
  const screen = (y: number, z: number): Point => [0.58 - (y - 1.35) * 0.28 / 0.71, y, z]
  front.face([screen(1.35, -0.97), screen(2.06, -0.97), screen(2.06, 0.97), screen(1.35, 0.97)], 'glass', false)
  for (const side of [-1, 1]) {
    front.line([screen(1.37, side * 0.95), screen(2.025, side * 0.95), screen(2.025, side * 0.045), screen(1.37, side * 0.045)], 'edge', true)
    front.line([screen(1.405, side * 0.83), screen(1.69, side * 0.52)], 'detail')
    front.box(0.1, 0.67, 0.07, 0.44, 1.7, side * 0.98, 'paper', 'detail', [0, 0, 0.375])
  }
  front.beam(screen(1.35, 0), screen(2.06, 0), 0.05, 'paper', 'detail')
  front.box(0.17, 0.09, 1.95, 0.57, 1.345, 0, 'paper', 'detail')
  // Raised hood vent drawn directly on the sloping surface.
  const hood = (x: number, z: number): Point => [x, 1.35 - (x - 0.58) * 0.22 / 1.74 + 0.008, z]
  front.face([hood(1.17, -0.47), hood(1.96, -0.47), hood(1.96, 0.47), hood(1.17, 0.47)], 'concrete', 'detail')
  for (let i = 0; i < 10; i++) front.line([hood(1.21 + i * 0.077, -0.43), hood(1.21 + i * 0.077, 0.43)], 'detail')
  front.box(0.04, 0.34, 1.41, 2.342, 0.92, 0, 'concrete', 'detail')
  for (let slot = -4; slot <= 4; slot++) front.box(0.015, 0.26, 0.052, 2.368, 0.92, slot * 0.14, 'paper', 'detail')
  for (const side of [-1, 1]) {
    front.solid(new THREE.CylinderGeometry(0.132, 0.132, 0.035, 32), [2.35, 0.96, side * 0.85], 'roof', 'detail', [0, 0, Math.PI / 2])
    front.box(0.04, 0.095, 0.12, 2.35, 1.1, side * 0.85, 'concrete', 'detail')
    front.beam([0.5, 1.37, side * 1.0], [0.51, 1.57, side * 1.29], 0.045, 'concrete', 'detail')
    front.box(0.095, 0.22, 0.18, 0.51, 1.67, side * 1.29, 'concrete', 'detail')
    front.box(0.018, 0.165, 0.13, 0.455, 1.67, side * 1.29, 'roof', 'detail')
  }
  root.add(finish(front))

  const makeDoor = (side: number) => {
    const frontX = 0.53, backX = -0.56
    const top = 1.98
    const door = new Draft(`Front ${side > 0 ? 'passenger' : 'driver'} armored door`)
    const p = (x: number, y: number, outward = 0): Point => [x - frontX, y, side * outward]
    door.position.set(frontX, 0, side * 1.032)
    // Separate lower door and window surround leave a real view out from the seats.
    door.face([p(backX, 0.61), p(frontX, 0.61), p(frontX, 1.35), p(backX, 1.35)], 'paper')
    const a = backX + 0.115, b = frontX - 0.115, low = 1.43, high = top - 0.12
    door.face([p(backX, 1.35), p(frontX, 1.35), p(b, low), p(a, low)], 'paper', 'detail')
    door.face([p(backX, 1.35), p(a, low), p(a, high), p(backX, top)], 'paper', 'detail')
    door.face([p(frontX, 1.35), p(frontX - 0.22, top), p(b - 0.12, high), p(b, low)], 'paper', 'detail')
    door.face([p(backX, top), p(a, high), p(b - 0.12, high), p(frontX - 0.22, top)], 'roof', 'detail')
    door.face([p(a, low), p(b, low), p(b - 0.12, high), p(a, high)], 'glass', 'detail')
    // Recessed X bracing and visible external hinges echo the reference.
    door.line([p(backX + 0.12, 0.7, 0.01), p(frontX - 0.11, 1.25, 0.01)], 'detail')
    door.line([p(backX + 0.12, 1.25, 0.01), p(frontX - 0.11, 0.7, 0.01)], 'detail')
    door.line([p(backX + 0.13, 0.66, 0.01), p(frontX - 0.1, 0.66, 0.01)], 'mesh')
    door.box(0.055, 0.14, 0.045, backX - frontX + 0.095, 1.24, side * 0.03, 'concrete', 'detail')
    for (const y of [0.76, 1.28]) door.box(0.105, 0.065, 0.065, -0.035, y, side * 0.025, 'roof', 'detail')
    return finish(door)
  }
  const passengerDoor = makeDoor(1)
  root.add(passengerDoor, makeDoor(-1))
  root.userData.passengerDoor = passengerDoor

  const interior = new Draft('Transport seats, dashboard and rear bench')
  for (const side of [-1, 1]) {
    const z = side * 0.46
    interior.box(0.59, 0.12, 0.57, -0.35, 0.72, z, 'rock', 'detail')
    interior.box(0.12, 0.5, 0.57, -0.67, 1.035, z, 'rock', 'detail', [0, 0, -0.1])
    interior.box(0.13, 0.2, 0.34, -0.715, 1.38, z, 'rock', 'detail')
    interior.line([[-0.55, 0.786, z - 0.21], [-0.14, 0.786, z - 0.21]], 'mesh')
  }
  interior.box(0.5, 0.12, 1.57, -1.24, 0.76, 0, 'rock', 'detail')
  interior.box(0.14, 0.48, 1.57, -1.5, 1.04, 0, 'rock', 'detail')
  interior.box(0.28, 0.19, 1.89, 0.42, 1.19, 0, 'concrete', 'detail')
  interior.box(0.12, 0.12, 0.16, 0.425, 1.115, -0.46, 'paper', 'detail')
  interior.box(0.9, 0.22, 0.28, -0.1, 0.61, 0, 'paper', 'detail')
  root.add(finish(interior))
  const steering = new Draft('Driver steering wheel and dashboard column')
  // A round grip, solid spokes and a raised hub have thickness from every angle.
  steering.solid(new THREE.TorusGeometry(0.2, 0.019, 12, 48),
    [0, 0, 0], 'paper', false, [0, 0, 0], true)
  for (const angle of [Math.PI / 6, 5 * Math.PI / 6, 3 * Math.PI / 2]) {
    steering.beam([Math.cos(angle) * 0.045, Math.sin(angle) * 0.045, 0.008],
      [Math.cos(angle) * 0.194, Math.sin(angle) * 0.194, 0], 0.032, 'paper', 'detail')
  }
  steering.solid(new THREE.CylinderGeometry(0.063, 0.063, 0.065, 32),
    [0, 0, 0], 'paper', false, [Math.PI / 2, 0, 0], true)
  circle(steering, 0.063, 0.033)
  circle(steering, 0.043, 0.034)
  // Local -Z runs from the hub into the bracket below the dashboard.
  steering.solid(new THREE.CylinderGeometry(0.028, 0.028, 0.43, 24),
    [0, 0, -0.2475], 'paper', false, [Math.PI / 2, 0, 0], true)
  steering.solid(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 24),
    [0, 0, -0.425], 'paper', false, [Math.PI / 2, 0, 0], true)
  circle(steering, 0.045, -0.395)
  steering.position.set(0.02, 1.3, -0.46)
  steering.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-0.9, 0.435, 0).normalize())
  root.add(finish(steering))

  const trim = new Draft('Transport bumpers, tow loops and tail lights')
  for (const end of [-1, 1]) {
    trim.box(0.18, 0.2, 2.22, end * 2.4, 0.64, 0, 'concrete', 'detail')
    for (const side of [-1, 1]) {
      trim.line([[end * 2.51, 0.68, side * 0.76], [end * 2.53, 0.55, side * 0.76],
        [end * 2.53, 0.53, side * 0.64], [end * 2.51, 0.68, side * 0.64]], 'detail')
      if (end < 0) {
        trim.box(0.035, 0.25, 0.14, -2.344, 0.94, side * 0.86, 'rock', 'detail')
        trim.line([[-2.367, 0.94, side * 0.8], [-2.367, 0.94, side * 0.92]], 'detail')
      }
    }
  }
  trim.face([[-2.332, 0.75, -0.63], [-2.332, 1.12, -0.63], [-2.332, 1.12, 0.63], [-2.332, 0.75, 0.63]], 'paper', 'detail')
  trim.line([[-2.344, 0.84, -0.55], [-2.344, 0.84, 0.55]], 'mesh')
  // Short intake beside the windshield, not a roof weapon.
  trim.cylinder(0.065, 0.51, 0.75, 1.59, -0.89, 'concrete')
  trim.cylinder(0.097, 0.035, 0.75, 1.86, -0.89, 'roof')
  root.add(finish(trim))

  const wheels: THREE.Group[] = []
  for (const x of [-1.62, 1.58]) for (const side of [-1, 1]) {
    const wheel = new Draft(`${x > 0 ? 'Front' : 'Rear'} ${side > 0 ? 'passenger' : 'driver'} all-terrain wheel`)
    wheel.solid(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.33, 40),
      [0, 0, 0], 'green', false, [Math.PI / 2, 0, 0])
    for (const s of [-1, 1]) circle(wheel, WHEEL_RADIUS, s * 0.166)
    wheel.solid(new THREE.CylinderGeometry(0.265, 0.265, 0.024, 32),
      [0, 0, side * 0.18], 'concrete', 'detail', [Math.PI / 2, 0, 0])
    circle(wheel, 0.218, side * 0.195)
    wheel.solid(new THREE.CylinderGeometry(0.082, 0.082, 0.038, 20),
      [0, 0, side * 0.207], 'rock', 'detail', [Math.PI / 2, 0, 0])
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2
      wheel.box(0.031, 0.031, 0.015, Math.sin(a) * 0.17, Math.cos(a) * 0.17, side * 0.204, 'paper', 'detail')
    }
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2
      const tread = (angle: number, radius: number, z: number): Point => [Math.sin(angle) * radius, Math.cos(angle) * radius, z]
      for (const s of [-1, 1]) {
        wheel.face([tread(a, 0.493, s * 0.025), tread(a + 0.07, 0.493, s * 0.16),
          tread(a + 0.145, 0.493, s * 0.16), tread(a + 0.075, 0.493, s * 0.025)], 'rock', 'mesh')
        wheel.line([tread(a + 0.07, 0.49, s * 0.168), tread(a + 0.11, 0.405, s * 0.168)], 'mesh')
      }
    }
    wheel.position.set(x, 0.495, side * 1.02)
    wheels.push(finish(wheel))
    root.add(wheel)
  }
  root.userData.wheels = wheels
  root.userData.wheelRadius = WHEEL_RADIUS
  root.userData.wheelAxis = 'z'
  return root
}

/** Open before the approach; close only once the hostage has settled inside. */
export function updateRescueJeepDoor(jeep: THREE.Group, hostagePosition: readonly number[], loaded: boolean, dt: number) {
  const door = jeep.userData.passengerDoor as THREE.Group
  const local = new THREE.Vector3(...hostagePosition).sub(jeep.position).applyQuaternion(jeep.quaternion.clone().invert())
  const localX = local.x
  const localZ = local.z
  const boarding = loaded && localZ > 0.57
  const approaching = !loaded && Math.hypot(localX, localZ - 1.25) < 3
  const target = approaching || boarding ? 1.12 : 0
  door.rotation.y = THREE.MathUtils.damp(door.rotation.y, target, 12, dt)
}
