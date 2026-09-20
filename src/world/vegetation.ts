import * as THREE from 'three'
import { Draft, type Point } from '../render/ink'
import { penRandom, penSeed } from '../render/ballpoint'

export const treeSeed = (x: number, z: number) => penSeed(`pine:${x}:${z}`)
export const treeRadius = (height: number) => height * .30

/** The original three-tier pine, with small, repeatable variations in its proportions. */
export function drawPine(g: Draft, x: number, z: number, maxHeight: number, seed: number) {
  const random = penRandom(seed)
  const range = (low: number, high: number) => low + random() * (high - low)
  const height = maxHeight * range(.88, 1)
  const width = range(.78, 1)
  const leanX = range(-.018, .018), leanZ = range(-.018, .018)
  const point = (px: number, py: number, pz: number): Point =>
    [x + height * (px + leanX * py), height * py, z + height * (pz + leanZ * py)]

  const trunkRadius = range(.015, .021)
  const trunk = new THREE.CylinderGeometry(trunkRadius * .68, trunkRadius, .43, 20)
  const trunkVertices = trunk.getAttribute('position')
  for (let i = 0; i < trunkVertices.count; i++) {
    trunkVertices.setXYZ(i, ...point(trunkVertices.getX(i), trunkVertices.getY(i) + .215, trunkVertices.getZ(i)))
  }
  trunk.computeVertexNormals()
  g.solid(trunk, [0, 0, 0], 'paper', false, [0, 0, 0], true)
  g.ring(trunkRadius * height, 0, x, z, 'landscape', 24)

  for (let tier = 0; tier < 3; tier++) {
    const radius = (.255 - tier * .052) * width * range(.93, 1.04)
    const bottom = [.125, .3475, .57][tier] + range(-.016, .016)
    const top = tier === 2 ? 1 : [.635, .79][tier] + range(-.022, .022)
    const phase = range(0, Math.PI * 2)
    const oval = range(.91, 1)
    // Broad, gentle asymmetry keeps the familiar conical silhouette.
    const spread = (angle: number) => 1 + .026 * Math.sin(angle * 3 + phase) + .012 * Math.sin(angle * 7 - phase)
    const rimY = (angle: number) => .006 * Math.sin(angle * 5 + phase)
    const surface = (angle: number, t: number, lift = 0): Point => {
      const r = radius * t * spread(angle) + lift
      return point(Math.cos(angle) * r, top + (bottom - top) * t + rimY(angle) * t,
        Math.sin(angle) * r * oval)
    }

    const cone = new THREE.ConeGeometry(1, 1, 40)
    const vertices = cone.getAttribute('position')
    for (let i = 0; i < vertices.count; i++) {
      const px = vertices.getX(i), pz = vertices.getZ(i)
      const t = .5 - vertices.getY(i)
      // Keep the cap centre on the trunk axis while deforming its perimeter.
      const p = Math.hypot(px, pz) < .001 && t > .5
        ? point(0, bottom, 0) : surface(Math.atan2(pz, px), t)
      vertices.setXYZ(i, ...p)
    }
    cone.computeVertexNormals()
    g.solid(cone, [0, 0, 0], 'green', false, [0, 0, 0], true)

    // Preserve the original loose downward branch marks and scalloped tier rims.
    const count = 7 + Math.floor(random() * 3)
    for (let branch = 0; branch < count; branch++) {
      const angle = branch / count * Math.PI * 2 + phase
      const trail: Point[] = []
      for (let step = 0; step < 5; step++) {
        const t = .14 + step * .205
        trail.push(surface(angle + (step % 2 ? .075 : -.055), t, .003))
      }
      g.line(trail, 'landscape')
      const tip = trail[trail.length - 1]
      const end = surface(angle, 1.025, .002)
      g.line([tip, end], 'landscape')
    }
    g.line(Array.from({ length: 40 }, (_, i) => surface(i / 40 * Math.PI * 2, 1, .001)), 'landscape', true)
  }
  return height
}
