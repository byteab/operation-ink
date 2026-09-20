import * as THREE from 'three'
import { Draft, type Point } from '../render/ink'
import { groundOutline } from '../world/architecture'
import type { Station, StationKind } from './types'

/** The shape of a control identifies its job before the interaction prompt appears. */
export function createMissionControl(kind: StationKind, id: string, label: string, position: Point, angle = 0): Station {
  const object = new Draft(label, position[0], position[2], angle)
  object.position.y = position[1]
  object.userData = { environment: true, kind: 'mission-station', stationKind: kind, stationId: id }
  let target: Point = [0, 1.3, 0.24]

  if (kind === 'cameras') {
    object.name = 'Security cabin · surveillance workstation'
    // Desk, separate tower, keyboard and mouse give this a computer silhouette.
    object.box(1.8, 0.12, 0.94, 0, 0.84, 0, 'roof', 'detail')
    for (const x of [-0.78, 0.78]) for (const z of [-0.35, 0.35]) {
      object.box(0.075, 0.78, 0.075, x, 0.39, z, 'paper', 'detail')
    }
    object.box(0.3, 0.63, 0.56, 0.58, 0.315, -0.04, 'paper', 'detail')
    object.box(0.21, 0.04, 0.025, 0.58, 0.49, 0.25, 'paper', 'detail')
    for (const y of [0.13, 0.18, 0.23]) object.line([[0.49, y, 0.247], [0.67, y, 0.247]], 'mesh')
    object.box(0.34, 0.04, 0.25, -0.12, 0.92, -0.2, 'paper', 'detail')
    object.box(0.065, 0.2, 0.07, -0.12, 1.03, -0.23, 'paper', 'detail')
    object.box(1.04, 0.65, 0.1, -0.12, 1.38, -0.24, 'paper', 'detail')
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.91, 0.52),
      new THREE.MeshBasicMaterial({ color: 0x146bff, toneMapped: false }))
    screen.name = 'Security cabin · surveillance screen'
    screen.position.set(-0.12, 1.38, -0.184)
    screen.userData.noCollision = true
    object.add(screen)
    // Four camera feeds, drawn directly on the monitor rather than on a signboard.
    object.line([[-0.12, 1.12, -0.178], [-0.12, 1.64, -0.178]], 'detail')
    object.line([[-0.575, 1.38, -0.178], [0.335, 1.38, -0.178]], 'detail')
    for (const x of [-0.54, -0.085]) for (const y of [1.16, 1.42]) {
      object.line([[x, y, -0.177], [x + 0.11, y + 0.04, -0.177],
        [x + 0.11, y + 0.15, -0.177], [x + 0.28, y + 0.15, -0.177],
        [x + 0.28, y + 0.04, -0.177], [x + 0.39, y, -0.177]], 'detail')
    }
    object.box(0.66, 0.045, 0.24, -0.12, 0.9225, 0.23, 'paper', 'detail')
    for (let row = 0; row < 3; row++) {
      const z = 0.16 + row * 0.06
      object.line([[-0.4, 0.951, z], [0.16, 0.951, z]], 'detail')
      for (let col = 0; col < 9; col++) object.line([[-0.4 + col * 0.07, 0.951, z], [-0.4 + col * 0.07, 0.951, z + 0.05]], 'mesh')
    }
    object.box(0.12, 0.055, 0.18, 0.45, 0.9275, 0.23, 'paper', 'detail')
    target = [-0.12, 1.38, -0.16]
  } else if (kind === 'gate') {
    object.name = 'Exit gate · lever and keypad'
    object.box(0.72, 0.1, 0.62, 0, 0.05, 0, 'concrete', 'detail')
    groundOutline(object, 0, 0, 0.72, 0.62)
    object.box(0.18, 0.82, 0.18, 0, 0.46, 0, 'roof', 'detail')
    object.box(0.92, 0.52, 0.36, 0, 1.1, 0, 'paper', 'edge')
    // A mechanical throw lever and numeric keypad replace the alarm's display/buttons.
    object.box(0.16, 0.33, 0.04, 0.25, 1.11, 0.2, 'roof', 'detail')
    object.beam([0.25, 0.99, 0.23], [0.25, 1.4, 0.38], 0.055, 'paper', 'detail')
    object.box(0.24, 0.085, 0.09, 0.25, 1.4, 0.38, 'paper', 'edge')
    object.box(0.28, 0.28, 0.03, -0.23, 1.03, 0.2, 'roof', 'detail')
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      object.box(0.052, 0.052, 0.02, -0.315 + col * 0.085, 0.945 + row * 0.085, 0.225, 'paper', 'detail')
    }
    // A small gate pictogram above the keypad reads as access hardware.
    object.line([[-0.38, 1.21, 0.19], [-0.38, 1.31, 0.19], [-0.08, 1.31, 0.19], [-0.08, 1.21, 0.19]], 'detail')
    for (const x of [-0.3, -0.23, -0.16]) object.line([[x, 1.21, 0.19], [x, 1.31, 0.19]], 'detail')
    target = [0.25, 1.3, 0.38]
  } else {
    const isSupply = kind === 'supply', isBell = kind === 'distraction'
    object.box(isSupply ? 0.85 : 0.56, isSupply ? 0.6 : 0.86, 0.28, 0,
      isSupply ? 0.7 : 1.15, 0, 'concrete', 'detail')
    object.box(0.12, 0.74, 0.12, 0, 0.37, 0, 'roof', 'detail')
    object.box(0.8, 0.1, 0.65, 0, 0.05, 0, 'concrete', 'detail')
    if (position[1] === 0) groundOutline(object, 0, 0, 0.8, 0.65)
    if (isBell) {
      object.beam([0, 1.56, 0], [0, 2.3, 0], 0.08)
      object.cylinder(0.25, 0.34, 0, 2.13, 0, 'roof', 0.1)
    } else if (kind === 'brake') {
      object.beam([0, 0.98, 0.18], [0.12, 1.64, 0.26], 0.085)
      object.beam([-0.13, 1.64, 0.26], [0.37, 1.64, 0.26], 0.08)
    } else if (isSupply) {
      object.box(0.34, 0.08, 0.015, 0, 0.7, 0.15, 'paper', false)
      object.box(0.08, 0.34, 0.015, 0, 0.7, 0.16, 'paper', false)
      target = [0, 0.8, 0.24]
    } else {
      object.box(0.37, 0.24, 0.035, 0, 1.29, 0.15, 'roof', 'detail')
      for (const x of [-0.14, 0.14]) object.box(0.07, 0.07, 0.04, x, 0.94, 0.15, 'paper', 'detail')
    }
  }
  object.finish()
  const point = new THREE.Vector3(...target)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(new THREE.Vector3(...position))
  return { id, kind, object, point, label }
}
