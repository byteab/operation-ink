import * as THREE from 'three'
import { Draft, type Point } from '../render/ink'

export type TreeSpecies = 'pine' | 'broadleaf' | 'poplar'
export const treeRadius = (height: number, species: TreeSpecies) => height * (species === 'pine' ? 0.30 : species === 'broadleaf' ? 0.29 : 0.17)

/** Batched white crowns and ink branches match the compound's paper scenery. */
export function drawTree(g: Draft, x: number, z: number, h: number, species: TreeSpecies, seed: number) {
  if (species === 'pine') {
    g.cylinder(0.13, h * 0.43, x, h * 0.215, z, 'paper', 0.09)
    for (let i = 0; i < 3; i++) {
      const radius = h * (0.255 - i * 0.052), height = h * (0.51 - i * 0.045)
      const y = h * (0.38 + i * 0.20)
      const cone = new THREE.ConeGeometry(radius, height, 40)
      g.solid(cone, [x, y, z], 'green', false, [0, 0, 0], true)
      // Loose downward branch marks sit on the original cone: tree collision stays exact.
      // Each short trail resembles a student drawing a pine one branch at a time.
      const bottom = y - height / 2
      for (let branch = 0; branch < 8; branch++) {
        const angle = branch / 8 * Math.PI * 2 + i * 0.39 + seed * 0.013
        const trail: Point[] = []
        for (let step = 0; step < 5; step++) {
          const t = 0.14 + step * 0.205
          const turn = angle + (step % 2 ? 0.075 : -0.055)
          const r = radius * t + 0.028
          trail.push([x + Math.cos(turn) * r, bottom + height * (1 - t), z + Math.sin(turn) * r])
        }
        g.line(trail, 'landscape')
        const tip = trail[trail.length - 1]
        g.line([tip, [tip[0] + Math.cos(angle) * h * 0.035, tip[1] - h * 0.055,
          tip[2] + Math.sin(angle) * h * 0.035]], 'landscape')
      }
      const rim: Point[] = Array.from({ length: 24 }, (_, branch) => {
        const a = branch / 24 * Math.PI * 2
        const r = radius * (branch % 2 ? 1.04 : 0.97)
        return [x + Math.cos(a) * r, bottom + (branch % 2 ? -0.025 : 0.085), z + Math.sin(a) * r]
      })
      g.line(rim, 'landscape', true)
    }
    return
  }
  g.cylinder(h * 0.025, h * 0.57, x, h * 0.285, z, 'paper', h * 0.012)
  const crown = (dx: number, y: number, dz: number, rx: number, ry: number, rz: number) => {
    const geometry = new THREE.SphereGeometry(1, 20, 14)
    geometry.scale(h * rx, h * ry, h * rz)
    g.solid(geometry, [x + h * dx, h * y, z + h * dz], 'green', false, [0, seed * 0.27, 0], true)
  }
  if (species === 'broadleaf') {
    // Forked trunk and a broad, irregular crown instead of stacked cones.
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + seed * 0.43
      const dx = Math.cos(a) * 0.11, dz = Math.sin(a) * 0.11
      g.beam([x, h * 0.34, z], [x + h * dx, h * 0.64, z + h * dz], h * 0.026, 'paper', 'detail')
      crown(dx, 0.66 + (i % 2) * 0.04, dz, 0.17, 0.22, 0.17)
    }
    crown(-0.02, 0.80, 0.01, 0.19, 0.20, 0.18)
  } else {
    // Narrow upright poplar with offset foliage lobes and an exposed lower trunk.
    for (let i = 0; i < 4; i++) {
      const a = i * 2.4 + seed * 0.31
      const dx = Math.cos(a) * 0.055, dz = Math.sin(a) * 0.055
      g.beam([x, h * (0.28 + i * 0.10), z], [x + h * dx, h * (0.45 + i * 0.10), z + h * dz], h * 0.018, 'paper', 'detail')
      crown(dx, 0.49 + i * 0.085, dz, 0.10 - i * 0.009, 0.22, 0.10 - i * 0.009)
    }
    crown(0, 0.80, 0, 0.073, 0.20, 0.075)
  }
  // Sparse bark contours stay on the trunk, leaving foliage surfaces quiet.
  for (const a of [0.4, 2.5, 4.6]) {
    const r = h * 0.023
    g.line([[x + Math.cos(a) * r, h * 0.05, z + Math.sin(a) * r],
      [x + Math.cos(a + 0.12) * r * 0.85, h * 0.27, z + Math.sin(a + 0.12) * r * 0.85]], 'landscape')
  }
}
