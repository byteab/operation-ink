import { BoxGeometry, CylinderGeometry, Shape, ExtrudeGeometry } from 'three'
import { Draft, type Fill, type Point } from '../render/ink'

export interface BuildingSpec {
  name: string
  x: number
  z: number
  width: number
  depth: number
  height: number
  angle?: number
  type?: 'barracks' | 'warehouse' | 'utility' | 'service'
}

function windowFrame(g: Draft, x: number, y: number, z: number, w = 1.4, h = 1.35, side = false) {
  const point = (u: number, v: number, out = 0): Point => side ? [x + out, v, z + u] : [x + u, v, z + out]
  const a = -w / 2, b = w / 2
  g.face([point(a, y), point(b, y), point(b, y + h), point(a, y + h)], 'glass', 'detail')
  g.line([point(a + 0.09, y + 0.09, 0.008), point(b - 0.09, y + 0.09, 0.008),
    point(b - 0.09, y + h - 0.09, 0.008), point(a + 0.09, y + h - 0.09, 0.008)], 'detail', true)
  g.line([point(0, y + 0.08, 0.01), point(0, y + h - 0.08, 0.01)], 'detail')
  if (side) g.box(0.12, 0.09, w + 0.15, x, y - 0.025, z, 'paper', 'detail')
  else g.box(w + 0.15, 0.09, 0.12, x, y - 0.025, z, 'paper', 'detail')
}

function door(g: Draft, x: number, floor: number, z: number, w = 1.05, h = 2.3, industrial = false) {
  g.face([[x - w / 2, floor, z], [x + w / 2, floor, z],
    [x + w / 2, floor + h, z], [x - w / 2, floor + h, z]], 'paper')
  if (industrial) {
    g.line([[x, floor, z + 0.01], [x, floor + h, z + 0.01]], 'detail')
    for (let y = floor + 0.7; y < floor + h; y += 0.85) g.line([[x - w / 2 + 0.1, y, z + 0.01], [x + w / 2 - 0.1, y, z + 0.01]], 'detail')
  } else {
    g.line([[x + w * 0.23, floor + 1.05, z + 0.02], [x + w * 0.4, floor + 1.05, z + 0.02]], 'edge')
    g.line([[x - w / 2 + 0.1, floor + 0.13, z + 0.01], [x - w / 2 + 0.1, floor + h - 0.1, z + 0.01],
      [x + w / 2 - 0.1, floor + h - 0.1, z + 0.01]], 'detail')
  }
}

/** Solid gable ends, two roof planes with real thickness, overhangs and a ridge cap. */
export function roof(g: Draft, w: number, d: number, eave: number, rise: number, x = 0, z = 0, seams = true) {
  for (const end of [-1, 1]) {
    g.face([[x + end * w / 2, eave, z - d / 2], [x + end * w / 2, eave + rise, z],
      [x + end * w / 2, eave, z + d / 2]], 'paper')
  }
  const W = w / 2 + 0.4, D = d / 2 + 0.4, top = eave + rise + 0.14
  const edgeY = eave - rise * 0.4 / (d / 2) + 0.14
  for (const side of [-1, 1]) {
    const points: Point[] = [[x - W, edgeY, z + side * D], [x + W, edgeY, z + side * D],
      [x + W, top, z], [x - W, top, z]]
    g.face(points, 'roof')
    g.face([points[0], points[1], [x + W, edgeY - 0.14, z + side * D],
      [x - W, edgeY - 0.14, z + side * D]], 'paper', 'detail')
    for (const end of [-1, 1]) g.face([[x + end * W, edgeY, z + side * D], [x + end * W, top, z],
      [x + end * W, top - 0.14, z], [x + end * W, edgeY - 0.14, z + side * D]], 'paper', 'detail')
    if (seams) {
      // Widely spaced standing seams suggest sheet roofing without dense corrugation.
      const count = Math.max(2, Math.floor(w / 3.1))
      for (let i = 1; i < count; i++) {
        const sx = x - W + 2 * W * i / count
        g.line([[sx, edgeY + 0.015, z + side * D], [sx, top + 0.015, z]], 'mesh')
      }
    }
  }
  g.line([[x - W, top + 0.015, z], [x + W, top + 0.015, z]])
}

export function building(spec: BuildingSpec) {
  const { width: w, depth: d, height: h, type = 'barracks' } = spec
  const g = new Draft(spec.name, spec.x, spec.z, spec.angle)
  g.userData.footprint = [w, d]
  g.userData.kind = type
  const floor = type === 'warehouse' ? 0.65 : 0.28
  g.box(w + 0.3, floor, d + 0.3, 0, floor / 2, 0, 'concrete', 'detail')
  g.box(w, h, d, 0, floor + h / 2, 0)
  roof(g, w, d, h + floor, Math.min(2.15, d * 0.17))
  const front = d / 2 + 0.025
  if (type === 'warehouse') {
    for (const x of [-w * 0.31, 0, w * 0.31]) {
      door(g, x, floor, front, 3.8, Math.min(3.8, h - 0.45), true)
      g.box(4.35, 0.15, 0.5, x, floor + h - 0.15, front + 0.18, 'paper', 'detail')
    }
    g.box(w - 1.0, floor, 1.8, 0, floor / 2, front + 0.88, 'concrete')
    steps(g, -w / 2 + 1.7, front + 1.94, 2, floor, 3)
    for (let x = -w / 2 + 1; x < w / 2; x += 4.5) {
      windowFrame(g, x, floor + h - 1.35, -front, 2.2, 0.75)
    }
  } else {
    const entry = type === 'service' ? -w * 0.16 : 0
    door(g, entry, floor, front, type === 'service' ? 1.8 : 1.05, 2.35, type === 'service')
    steps(g, entry, front + 0.29, 1.8, floor, 2)
    if (type === 'service') {
      g.box(3.5, 0.15, 1.5, entry, 3.2, front + 0.65, 'roof')
      for (const x of [entry - 1.5, entry + 1.5]) g.beam([x, 0.28, front + 1.15], [x, 3.14, front + 1.15], 0.1)
    }
    const count = Math.max(2, Math.floor(w / 3.5))
    for (const side of [-1, 1]) for (let i = 0; i < count; i++) {
      const x = -w / 2 + w / count * (i + 0.5)
      if (side === 1 && Math.abs(x - entry) < 1.7) continue
      windowFrame(g, x, floor + 1.3, side * front, type === 'utility' ? 1.15 : 1.65, 1.3)
    }
  }
  for (const side of [-1, 1]) {
    const count = Math.max(1, Math.floor(d / 3.8))
    for (let i = 0; i < count; i++) windowFrame(g, side * (w / 2 + 0.035), floor + 1.4,
      -d / 2 + d / count * (i + 0.5), type === 'warehouse' ? 1.75 : 1.3, 1.25, true)
  }
  if (type !== 'warehouse') {
    const x = w * 0.29, z = -d * 0.19, y = floor + h + Math.min(2.15, d * 0.17) * 0.62
    g.box(0.55, 1.25, 0.65, x, y + 0.5, z, 'paper', 'detail')
    g.box(0.75, 0.13, 0.82, x, y + 1.18, z, 'paper', 'detail')
  }
  // Gutters and downpipes terminate at the plinth, all on the building's actual faces.
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) {
    g.line([[x, floor + h - 0.04, front + 0.32], [x, floor + h - 0.22, front + 0.12], [x, floor + 0.1, front + 0.12]], 'detail')
  }
  return g.finish()
}

export function steps(g: Draft, x: number, z: number, width: number, height: number, count: number) {
  for (let i = 0; i < count; i++) {
    const h = height * (count - i) / count
    g.box(width, h, 0.32, x, h / 2, z + i * 0.32, 'concrete', 'detail')
  }
}

export function container(name: string, x: number, z: number, w = 6.1, d = 2.45, angle = 0) {
  const g = new Draft(name, x, z, angle)
  g.box(w, 2.42, d, 0, 1.32, 0, 'roof')
  for (const side of [-1, 1]) {
    for (let u = -w / 2 + 0.45; u < w / 2; u += 0.62) g.line([[u, 0.3, side * (d / 2 + 0.015)], [u, 2.4, side * (d / 2 + 0.015)]], 'mesh')
    for (const y of [0.2, 2.46]) g.line([[-w / 2, y, side * (d / 2 + 0.02)], [w / 2, y, side * (d / 2 + 0.02)]], 'detail')
  }
  const end = w / 2 + 0.02
  g.line([[end, 0.17, 0], [end, 2.48, 0]], 'detail')
  for (const z of [-d * 0.3, d * 0.3]) g.line([[end + 0.02, 0.4, z], [end + 0.02, 2.3, z]], 'detail')
  return g.finish()
}

export function workshop(x: number, z: number) {
  const g = new Draft('East workshop · open garage bay', x, z)
  const w = 23, d = 13, h = 5.5
  g.userData.kind = 'workshop'
  g.box(w + 0.8, 0.22, d + 3.5, 0, 0.11, 0.8, 'concrete', 'detail')
  g.box(w, h, 0.3, 0, h / 2 + 0.22, -d / 2)
  g.box(0.3, h, d, -w / 2, h / 2 + 0.22, 0)
  g.box(0.3, h, d, w / 2, h / 2 + 0.22, 0)
  g.box(w, 1.1, 0.45, 0, h - 0.33, d / 2)
  for (const sx of [-w / 2 + 0.35, w / 2 - 0.35]) g.box(0.65, h, 0.65, sx, h / 2 + 0.22, d / 2)
  roof(g, w + 0.2, d, h + 0.22, 1.4)
  for (const sx of [-w / 2 + 0.65, w / 2 - 0.65]) g.beam([sx, h - 0.6, d / 2], [sx + Math.sign(sx) * -2, h - 0.6, d / 2 - 2], 0.14, 'paper', 'detail')
  // A real interior and service bench remain visible through the wide opening.
  g.box(5, 0.2, 1.1, -6.5, 1.4, -5.5, 'paper', 'detail')
  for (const sx of [-8.6, -4.4]) g.box(0.1, 1.2, 0.9, sx, 0.82, -5.5, 'paper', 'detail')
  for (let i = 0; i < 3; i++) g.box(1.3, 1.6, 0.7, 5 + i * 1.5, 1.02, -5.7, 'roof', 'detail')
  return g.finish()
}

/** Static, unoccupied service truck. Profiled cabin and wheel arches, no simulation. */
export function truck(x: number, z: number) {
  const g = new Draft('Workshop service truck · static prop', x, z, -0.12)
  g.position.y = 0.22
  g.userData.kind = 'static-prop'
  const section = new Shape()
  section.moveTo(-1.18, 0.85)
  section.lineTo(-1.18, 2.2)
  section.lineTo(-0.95, 2.85)
  section.lineTo(0.6, 2.85)
  section.lineTo(1.2, 2.18)
  section.lineTo(1.72, 2.05)
  section.lineTo(1.72, 0.85)
  // The wheel cutout is part of the profile, not a wheel sunk into a solid cube.
  section.lineTo(1.12, 0.85)
  section.absarc(0.44, 0.85, 0.68, 0, Math.PI, false)
  section.lineTo(-1.18, 0.85)
  const cabin = new ExtrudeGeometry(section, { depth: 2.5, bevelEnabled: false, curveSegments: 16 })
  cabin.rotateY(-Math.PI / 2)
  cabin.translate(1.25, 0, 1.8)
  g.solid(cabin)
  g.box(2.4, 0.23, 6.8, 0, 0.94, -0.3, 'paper', 'detail')
  g.box(2.65, 1.4, 3.65, 0, 1.77, -1.77, 'roof')
  g.face([[-1.08, 2.27, 2.938], [1.08, 2.27, 2.938], [1.08, 2.76, 2.498], [-1.08, 2.76, 2.498]], 'glass', 'detail')
  g.line([[0, 2.27, 2.95], [0, 2.76, 2.51]], 'detail')
  g.face([[-0.64, 1.25, 3.535], [0.64, 1.25, 3.535], [0.64, 1.78, 3.535], [-0.64, 1.78, 3.535]], 'glass', 'detail')
  for (const y of [1.37, 1.5, 1.63]) g.line([[-0.56, y, 3.548], [0.56, y, 3.548]], 'detail')
  for (const side of [-1, 1]) {
    g.face(Array.from({ length: 24 }, (_, i) => [side * 0.94 + Math.cos(i / 24 * Math.PI * 2) * 0.16,
      1.57 + Math.sin(i / 24 * Math.PI * 2) * 0.16, 3.54]), 'paper', 'detail')
    g.beam([side * 1.24, 2.22, 2.5], [side * 1.59, 2.22, 2.5], 0.045, 'paper', 'detail')
    g.box(0.16, 0.28, 0.17, side * 1.59, 2.34, 2.5, 'paper', 'detail')
  }
  for (const sx of [-1, 1]) {
    g.face([[sx * 1.265, 1.95, 1.0], [sx * 1.265, 2.7, 0.95], [sx * 1.265, 2.7, 2.33], [sx * 1.265, 2.15, 2.85]], 'glass', 'detail')
    g.line([[sx * 1.275, 1.1, 0.9], [sx * 1.275, 1.85, 0.9], [sx * 1.275, 2.68, 0.98]], 'detail')
    for (let p = -3.25; p < 0; p += 0.8) g.line([[sx * 1.335, 1.15, p], [sx * 1.335, 2.45, p]], 'detail')
    for (const axle of [-2.7, -1.2, 2.24]) {
      const segments = 48, r = 0.64
      g.solid(new CylinderGeometry(r, r, 0.38, segments), [sx * 1.23, 0.64, axle], 'concrete', false, [0, 0, Math.PI / 2], true)
      const face = sx * 1.43
      const disk: Point[] = Array.from({ length: segments }, (_, i) => [face, 0.64 + Math.sin(i / segments * Math.PI * 2) * r, axle + Math.cos(i / segments * Math.PI * 2) * r])
      g.face(disk, 'concrete')
      g.line(disk.map(([x, y, z]) => [x + sx * 0.006, 0.64 + (y - 0.64) * 0.54, axle + (z - axle) * 0.54]), 'detail', true)
    }
  }
  g.box(2.8, 0.25, 0.3, 0, 0.88, 3.6, 'paper', 'detail')
  return g.finish()
}

export function crates(g: Draft, x: number, z: number, count = 3, fill: Fill = 'paper', floor = 0) {
  for (let i = 0; i < count; i++) {
    const sx = x + i * 1.1, h = i === 1 ? 1.65 : 0.85
    g.box(1, h, 0.95, sx, floor + h / 2 + 0.1, z, fill, 'detail')
    for (const y of [floor + 0.28, floor + h - 0.04]) g.line([[sx - 0.48, y, z + 0.48], [sx + 0.48, y, z + 0.48]], 'detail')
    g.box(1.05, 0.1, 1.05, sx, floor + 0.05, z, 'concrete', 'detail')
  }
}

// Keep box construction explicit for future geometry consumers; this is a useful simple plinth.
export function platform(name: string, x: number, z: number, w: number, d: number, h = 0.2) {
  const g = new Draft(name, x, z)
  g.solid(new BoxGeometry(w, h, d), [0, h / 2, 0], 'concrete', 'detail')
  return g.finish()
}
