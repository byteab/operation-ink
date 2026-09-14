import * as THREE from 'three'
import { Draft, type Point } from '../render/ink'

const RUNG_DIAMETER = 0.06
const RAIL_DIAMETER = 0.085
const RUNG_SPACING = 0.35
const HANDHOLD_HEIGHT = 1.1

/** A round pipe with smooth silhouette ink, without cylinder tessellation lines. */
export function pipe(g: Draft, a: Point, b: Point, diameter: number) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b)
  const direction = end.clone().sub(start)
  const geometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, direction.length(), 24)
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()))
  g.solid(geometry, start.add(end).multiplyScalar(0.5).toArray(), 'paper', false, [0, 0, 0], true)
}

interface LadderSpec {
  name: string
  x: number
  z: number
  bottom: number
  landingHeight: number
  angle?: number
  width?: number
  landingDepth?: number
}

/** Climb in the local XY plane and step toward -Z through two bent grab rails. */
export function pipeLadder({ name, x, z, bottom, landingHeight, angle = 0,
  width = 0.95, landingDepth = 0.9 }: LadderSpec) {
  const ladder = new Draft(name, x, z, angle)
  const rungLevels: number[] = []
  // Leave one full step to the landing and never place a rung across the exit.
  for (let y = landingHeight - RUNG_SPACING; y > bottom + 0.12; y -= RUNG_SPACING) rungLevels.push(y)
  rungLevels.reverse()
  ladder.userData = {
    environment: true, kind: 'ladder', climbable: true, construction: 'round-pipe',
    width, clearWidth: width - RAIL_DIAMETER, rungDiameter: RUNG_DIAMETER,
    railDiameter: RAIL_DIAMETER, rungThickness: RUNG_DIAMETER, railThickness: RAIL_DIAMETER,
    rungSpacing: RUNG_SPACING, rungCount: rungLevels.length, rungLevels,
    bottom, bottomHeight: bottom, deckHeight: landingHeight, landingHeight, position: [x, z],
    handholdHeight: HANDHOLD_HEIGHT, landingDepth, topStepGap: RUNG_SPACING,
  }

  const rails = new Draft(`${name} · round rails and bent grab handles`)
  rails.userData = { environment: true, kind: 'ladder-rails', crossSection: 'circular',
    diameter: RAIL_DIAMETER, railCount: 2, bendRadius: 0.18 }
  const high = landingHeight + HANDHOLD_HEIGHT, bend = 0.18
  for (const side of [-1, 1]) {
    const sx = side * width / 2
    pipe(rails, [sx, bottom, 0], [sx, high - bend, 0], RAIL_DIAMETER)
    const path = new THREE.CurvePath<THREE.Vector3>()
    path.add(new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(sx, high - bend, 0), new THREE.Vector3(sx, high, 0), new THREE.Vector3(sx, high, -bend)))
    path.add(new THREE.LineCurve3(new THREE.Vector3(sx, high, -bend), new THREE.Vector3(sx, high, -landingDepth + bend)))
    path.add(new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(sx, high, -landingDepth + bend), new THREE.Vector3(sx, high, -landingDepth),
      new THREE.Vector3(sx, high - bend, -landingDepth)))
    rails.solid(new THREE.TubeGeometry(path, 40, RAIL_DIAMETER / 2, 24, false),
      [0, 0, 0], 'paper', false, [0, 0, 0], true)
    pipe(rails, [sx, high - bend, -landingDepth], [sx, landingHeight, -landingDepth], RAIL_DIAMETER)
  }

  const rungs = new Draft(`${name} · spaced cylindrical rungs`)
  rungs.userData = { environment: true, kind: 'ladder-rungs', crossSection: 'circular',
    diameter: RUNG_DIAMETER, spacing: RUNG_SPACING, count: rungLevels.length, levels: rungLevels }
  for (const y of rungLevels) pipe(rungs, [-width / 2, y, 0], [width / 2, y, 0], RUNG_DIAMETER)
  ladder.add(rails.finish(), rungs.finish())
  // Keep the enclosing Draft open so a caller can add its landing and wall mounts.
  return ladder
}
