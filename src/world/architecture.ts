import { BoxGeometry, CylinderGeometry, Shape, ExtrudeGeometry } from 'three'
import { Draft, type Fill, type Point } from '../render/ink'
import { createDoor } from './doors'
import { militaryInterior } from './interiors'

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

export const WALL_THICKNESS = 0.14
const WALL_INK_OFFSET = 0.006

/** Ground-contact ink must sit above the paving, which rises as high as 4.25cm. */
export function groundOutline(g: Draft, x: number, z: number, width: number, depth: number) {
  const y = 0.055
  g.line([[x - width / 2, y, z - depth / 2], [x + width / 2, y, z - depth / 2],
    [x + width / 2, y, z + depth / 2], [x - width / 2, y, z + depth / 2]], 'detail', true)
}

/** Trace inside corners on the room-facing surfaces, clear of adjoining walls. */
export function interiorRoomOutline(g: Draft, clearWidth: number, clearDepth: number,
  floor: number, ceiling: number, x = 0, z = 0, ceilingShape: 'flat' | 'gable' = 'flat') {
  const halfW = clearWidth / 2 - WALL_INK_OFFSET
  const halfD = clearDepth / 2 - WALL_INK_OFFSET
  const top = ceiling - WALL_INK_OFFSET
  const corners: Point[] = [[x - halfW, top, z - halfD], [x + halfW, top, z - halfD],
    [x + halfW, top, z + halfD], [x - halfW, top, z + halfD]]
  if (ceilingShape === 'gable') {
    // The end walls continue up to the roof slopes, without a horizontal seam.
    g.line([corners[0], corners[1]], 'edge')
    g.line([corners[2], corners[3]], 'edge')
  } else g.line(corners, 'edge', true)
  for (const [cx, , cz] of corners) g.line([[cx, floor + WALL_INK_OFFSET, cz], [cx, top, cz]], 'edge')
}

function windowFrame(g: Draft, x: number, y: number, z: number, w = 1.4, h = 1.35, side = false) {
  const point = (u: number, v: number, out = 0): Point => side ? [x + out, v, z + u] : [x + u, v, z + out]
  const a = -w / 2, b = w / 2
  g.face([point(a, y), point(b, y), point(b, y + h), point(a, y + h)], 'glass', 'detail')
  g.line([point(a + 0.09, y + 0.09, 0.008), point(b - 0.09, y + 0.09, 0.008),
    point(b - 0.09, y + h - 0.09, 0.008), point(a + 0.09, y + h - 0.09, 0.008)], 'detail', true)
  g.line([point(0, y + 0.08, 0.01), point(0, y + h - 0.08, 0.01)], 'detail')
  // A few diagonal pen strokes darken one corner; the rest remains bare paper.
  for (const sign of [-1, 1]) {
    const origin = point(sign < 0 ? a + 0.16 : 0.16, y + 0.15, 0.02)
    g.hatch(origin, side ? [0, 0, w * 0.25] : [w * 0.25, 0, 0], [0, h * 0.45, 0],
      { spacing: 0.12, inset: 0.03 })
  }
  if (side) g.box(0.12, 0.09, w + 0.15, x, y - 0.025, z, 'paper', 'detail')
  else g.box(w + 0.15, 0.09, 0.12, x, y - 0.025, z, 'paper', 'detail')
}

export type WallOpening = { centre: number; width: number; bottom: number; height: number }

/** Both wall faces and the short reveal edges stay readable from either side. */
export function wallOutline(g: Draft, length: number, h: number, floor: number, offset: number,
  openings: WallOpening[], side = false, thickness = WALL_THICKNESS, topEdge = true) {
  const point = (x: number, y: number, depth: number): Point => side
    ? [offset + depth, floor + y, x] : [x, floor + y, offset + depth]
  const halfDepth = thickness / 2 + WALL_INK_OFFSET
  const floorCuts = openings.filter(o => o.bottom === 0).sort((a, b) => a.centre - b.centre)
  for (const depth of [-halfDepth, halfDepth]) {
    // Only architectural boundaries are drawn, never the panels' construction grid.
    for (const x of [-length / 2, length / 2]) {
      g.line([point(x, 0, depth), point(x, h, depth)], 'edge')
    }
    if (topEdge) g.line([point(-length / 2, h, depth), point(length / 2, h, depth)], 'edge')
    let start = -length / 2
    for (const o of floorCuts) {
      g.line([point(start, 0, depth), point(o.centre - o.width / 2, 0, depth)], 'edge')
      start = o.centre + o.width / 2
    }
    g.line([point(start, 0, depth), point(length / 2, 0, depth)], 'edge')
    for (const o of openings) {
      g.line([point(o.centre - o.width / 2, o.bottom, depth), point(o.centre - o.width / 2, o.bottom + o.height, depth),
        point(o.centre + o.width / 2, o.bottom + o.height, depth), point(o.centre + o.width / 2, o.bottom, depth)], 'detail', o.bottom > 0)
    }
  }
  for (const x of [-length / 2, length / 2]) for (const y of [0, h]) {
    g.line([point(x, y, -halfDepth), point(x, y, halfDepth)], 'detail')
  }
  for (const o of openings) for (const x of [o.centre - o.width / 2, o.centre + o.width / 2]) {
    for (const y of [o.bottom, o.bottom + o.height]) {
      g.line([point(x, y, -halfDepth), point(x, y, halfDepth)], 'detail')
    }
  }
}

/** Wall panels are omitted at openings, so entryways have real traversable space. */
export function piercedWall(g: Draft, length: number, h: number, floor: number, offset: number,
  openings: WallOpening[], side = false, topEdge = true) {
  const thickness = WALL_THICKNESS
  const xs = [...new Set([-length / 2, length / 2, ...openings.flatMap(o => [o.centre - o.width / 2, o.centre + o.width / 2])])].sort((a, b) => a - b)
  const ys = [...new Set([0, h, ...openings.flatMap(o => [o.bottom, o.bottom + o.height])])].sort((a, b) => a - b)
  for (let xi = 1; xi < xs.length; xi++) for (let yi = 1; yi < ys.length; yi++) {
    const x = (xs[xi - 1] + xs[xi]) / 2, y = (ys[yi - 1] + ys[yi]) / 2
    if (openings.some(o => x > o.centre - o.width / 2 && x < o.centre + o.width / 2 && y > o.bottom && y < o.bottom + o.height)) continue
    const width = xs[xi] - xs[xi - 1], height = ys[yi] - ys[yi - 1]
    if (width <= 0 || height <= 0) continue
    if (side) g.box(thickness, height, width, offset, floor + y, x, 'paper', false)
    else g.box(width, height, thickness, x, floor + y, offset, 'paper', false)
  }
  wallOutline(g, length, h, floor, offset, openings, side, thickness, topEdge)
}

/** Solid gable ends, two roof planes with real thickness, overhangs and a ridge cap. */
export function roof(g: Draft, w: number, d: number, eave: number, rise: number, x = 0, z = 0, seams = true) {
  for (const end of [-1, 1]) {
    const outside = x + end * w / 2
    const inside = outside - end * WALL_THICKNESS
    for (const faceX of [outside, inside]) {
      const gable: Point[] = [[faceX, eave, z - d / 2], [faceX, eave + rise, z],
        [faceX, eave, z + d / 2]]
      g.face(gable, 'paper', false)
      g.line(gable, 'edge')
    }
    // Give the gable a room-facing contour instead of hiding all ink on its outer face.
    const inkX = inside - end * WALL_INK_OFFSET
    const innerEave = eave + rise * WALL_THICKNESS / (d / 2) - WALL_INK_OFFSET
    g.line([[inkX, innerEave, z - d / 2 + WALL_THICKNESS],
      [inkX, eave + rise - WALL_INK_OFFSET, z],
      [inkX, innerEave, z + d / 2 - WALL_THICKNESS]], 'edge')
    for (const side of [-1, 1]) g.face([[outside, eave, z + side * d / 2], [outside, eave + rise, z],
      [inside, eave + rise, z], [inside, eave, z + side * d / 2]], 'paper', 'detail')
  }
  const W = w / 2 + 0.4, D = d / 2 + 0.4, top = eave + rise + 0.14
  const edgeY = eave - rise * 0.4 / (d / 2) + 0.14
  for (const side of [-1, 1]) {
    const points: Point[] = [[x - W, edgeY, z + side * D], [x + W, edgeY, z + side * D],
      [x + W, top, z], [x - W, top, z]]
    g.face(points, 'roof')
    g.face(points.map(([px, py, pz]): Point => [px, py - 0.14, pz]), 'roof', false)
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
    // Small, separated shading patches follow the roof pitch, leaving broad white areas.
    const patchCount = Math.max(1, Math.min(5, Math.ceil(w / 8)))
    for (let i = 0; i < patchCount; i++) {
      const patchWidth = Math.min(2.8, w * 0.38)
      const sx = x - W + 0.3 + (2 * W - patchWidth - 0.6) * (i + 0.2) / patchCount
      const reach = i % 2 ? 0.23 : 0.38
      g.hatch([sx, edgeY + 0.018, z + side * D], [patchWidth, 0, 0],
        [0, (top - edgeY) * reach, -side * D * reach], { spacing: 0.21, inset: 0.04, seed: i + 11 })
    }
    g.hatch([x - W + 0.18, edgeY - 0.12, z + side * (D + 0.016)], [Math.min(w, 3.4), 0, 0],
      [0, 0.1, 0], { spacing: 0.16, inset: 0.01 })
  }
  g.line([[x - W, top + 0.015, z], [x + W, top + 0.015, z]])
  // The ceiling needs its own ridge stroke; exterior roof ink is depth-hidden indoors.
  const insideEnd = w / 2 - WALL_THICKNESS - WALL_INK_OFFSET
  g.line([[x - insideEnd, top - 0.14 - WALL_INK_OFFSET, z],
    [x + insideEnd, top - 0.14 - WALL_INK_OFFSET, z]], 'edge')
}

export function building(spec: BuildingSpec) {
  const { width: w, depth: d, height: h, type = 'barracks' } = spec
  const g = new Draft(spec.name, spec.x, spec.z, spec.angle)
  g.userData.footprint = [w, d]
  g.userData.kind = type
  g.userData.enterable = true
  const floor = type === 'warehouse' ? 0.65 : 0.28
  g.box(w + 0.3, floor, d + 0.3, 0, floor / 2, 0, 'concrete', 'detail')
  groundOutline(g, 0, 0, w + 0.3, d + 0.3)
  const walls = new Draft(`${spec.name} · exterior walls`)
  walls.userData.cutaway = true
  walls.userData.kind = 'exterior-walls'
  const covering = new Draft(`${spec.name} · roof`)
  covering.userData.cutaway = true
  covering.userData.kind = 'roof'
  roof(covering, w, d, h + floor, Math.min(2.15, d * 0.17))
  const front = d / 2 + 0.025
  const frontOpenings: WallOpening[] = [], backOpenings: WallOpening[] = []
  const sideOpenings: WallOpening[] = []
  const windows = { front: 0, rear: 0, left: 0, right: 0 }
  const entrances: { x: number; z: number; width: number; height: number; floor: number }[] = []
  const addEntry = (x: number, width: number, height: number, industrial = false) => {
    frontOpenings.push({ centre: x, width, bottom: 0, height })
    entrances.push({ x, z: front, width, height, floor })
    g.add(createDoor({ name: `${spec.name} · entry ${entrances.length}`, x, z: front + 0.02,
      floor, width, height, industrial }))
  }
  if (type === 'warehouse') {
    const entries = w > 30 ? [-w * 0.31, 0, w * 0.31] : [-w * 0.22, w * 0.22]
    for (const x of entries) {
      addEntry(x, 3.4, Math.min(3.8, h - 0.45), true)
      walls.box(3.85, 0.15, 0.5, x, floor + h - 0.15, front + 0.18, 'paper', 'detail')
    }
    g.box(w - 1.0, floor, 1.8, 0, floor / 2, front + 0.88, 'concrete')
    groundOutline(g, 0, front + 0.88, w - 1, 1.8)
    steps(g, -w / 2 + 1.7, front + 1.94, 2, floor, 3)
    const count = w > 30 ? 3 : 2
    for (let i = 0; i < count; i++) {
      const x = -w / 2 + w / count * (i + 0.5)
      backOpenings.push({ centre: x, width: 2.2, bottom: h - 1.3, height: 0.75 })
      windowFrame(walls, x, floor + h - 1.3, -front, 2.2, 0.75)
      windows.rear++
    }
  } else {
    const entry = type === 'service' ? -w * 0.16 : 0
    addEntry(entry, type === 'service' ? 1.8 : 1.45, 2.35, type === 'service')
    steps(g, entry, front + 0.29, 1.8, floor, 2)
    if (type === 'service') {
      covering.box(3.5, 0.15, 1.5, entry, 3.2, front + 0.65, 'roof')
      for (const x of [entry - 1.5, entry + 1.5]) walls.beam([x, 0.28, front + 1.15], [x, 3.14, front + 1.15], 0.1)
    }
    const count = w >= 22 ? 4 : w >= 14 ? 3 : 2
    for (const side of [-1, 1]) for (let i = 0; i < count; i++) {
      const x = -w / 2 + w / count * (i + 0.5)
      if (side === 1 && Math.abs(x - entry) < 1.7) continue
      const width = type === 'utility' ? 1.15 : 1.65
      const bottom = type === 'utility' ? 1.15 : 1.3, height = type === 'utility' ? 1.15 : 1.3
      ;(side > 0 ? frontOpenings : backOpenings).push({ centre: x, width, bottom, height })
      windowFrame(walls, x, floor + bottom, side * front, width, height)
      windows[side > 0 ? 'front' : 'rear']++
    }
  }
  piercedWall(walls, w, h, floor, d / 2 - WALL_THICKNESS / 2, frontOpenings)
  piercedWall(walls, w, h, floor, -d / 2 + WALL_THICKNESS / 2, backOpenings)
  const sideCount = type === 'warehouse' ? 1 : d > 11 ? 2 : 1
  for (let i = 0; i < sideCount; i++) {
    sideOpenings.push({ centre: -d / 2 + d / sideCount * (i + 0.5),
      width: type === 'warehouse' ? 1.75 : 1.3,
      bottom: type === 'warehouse' ? h - 1.3 : 1.25,
      height: type === 'warehouse' ? 0.75 : 1.15 })
  }
  for (const side of [-1, 1]) {
    piercedWall(walls, d - 2 * WALL_THICKNESS, h, floor, side * (w / 2 - WALL_THICKNESS / 2), sideOpenings, true, false)
    for (const o of sideOpenings) windowFrame(walls, side * (w / 2 + 0.025), floor + o.bottom, o.centre, o.width, o.height, true)
    windows[side > 0 ? 'right' : 'left'] = sideCount
  }
  interiorRoomOutline(walls, w - 2 * WALL_THICKNESS, d - 2 * WALL_THICKNESS, floor, floor + h, 0, 0, 'gable')
  if (type !== 'warehouse') {
    const x = w * 0.29, z = -d * 0.19, y = floor + h + Math.min(2.15, d * 0.17) * 0.62
    covering.box(0.55, 1.25, 0.65, x, y + 0.5, z, 'paper', 'detail')
    covering.box(0.75, 0.13, 0.82, x, y + 1.18, z, 'paper', 'detail')
  }
  // Gutters and downpipes terminate at the plinth, all on the building's actual faces.
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) {
    walls.line([[x, floor + h - 0.04, front + 0.32], [x, floor + h - 0.22, front + 0.12], [x, floor + 0.1, front + 0.12]], 'detail')
  }
  const interior = militaryInterior(spec.name, type, w, d, floor)
  g.userData.windowCounts = windows
  g.userData.entrances = entrances
  g.userData.interiorVariant = interior.userData.interiorVariant
  g.userData.furnitureCounts = interior.userData.furnitureCounts
  g.userData.wallThickness = WALL_THICKNESS
  g.userData.walkableInterior = { width: w - 2 * WALL_THICKNESS, depth: d - 2 * WALL_THICKNESS, floor }
  g.add(walls.finish(), covering.finish(), interior)
  return g.finish()
}

export function steps(g: Draft, x: number, z: number, width: number, height: number, count: number) {
  for (let i = 0; i < count; i++) {
    const h = height * (count - i) / count
    g.box(width, h, 0.32, x, h / 2, z + i * 0.32, 'concrete', 'detail')
  }
  // One continuous footprint avoids breaks where individual risers meet the apron.
  groundOutline(g, x, z + (count - 1) * 0.16, width, count * 0.32)
}

export function container(name: string, x: number, z: number, w = 6.1, d = 2.45, angle = 0) {
  const g = new Draft(name, x, z, angle)
  g.box(w, 2.42, d, 0, 1.32, 0, 'roof')
  for (const side of [-1, 1]) {
    for (let u = -w / 2 + 0.45; u < w / 2; u += 0.62) g.line([[u, 0.3, side * (d / 2 + 0.015)], [u, 2.4, side * (d / 2 + 0.015)]], 'mesh')
    for (const y of [0.2, 2.46]) g.line([[-w / 2, y, side * (d / 2 + 0.02)], [w / 2, y, side * (d / 2 + 0.02)]], 'detail')
    g.hatch([-w / 2 + 0.15, 0.25, side * (d / 2 + 0.023)], [Math.min(1.6, w * 0.35), 0, 0],
      [0, 0.7, 0], { spacing: 0.16, inset: 0.025 })
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
    g.hatch([sx - 0.46, floor + 0.15, z + 0.49], [0.37, 0, 0], [0, Math.min(0.48, h - 0.1), 0],
      { spacing: 0.085, inset: 0.025, seed: i + 7 })
    g.box(1.05, 0.1, 1.05, sx, floor + 0.05, z, 'concrete', 'detail')
  }
}

// Keep box construction explicit for future geometry consumers; this is a useful simple plinth.
export function platform(name: string, x: number, z: number, w: number, d: number, h = 0.2) {
  const g = new Draft(name, x, z)
  g.solid(new BoxGeometry(w, h, d), [0, h / 2, 0], 'concrete', 'detail')
  return g.finish()
}
