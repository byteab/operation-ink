import * as THREE from 'three'
import { Draft, type Point } from '../render/ink'
import { crates, roof } from './architecture'
import { pipe, pipeLadder } from './ladders'

export type PlanPoint = [number, number]

/** Connected fence panels; endpoints are shared exactly, with no random offsets. */
export function fence(name: string, points: PlanPoint[], height = 2.5) {
  const g = new Draft(name)
  g.userData.kind = 'fence'
  // Wire blocks walking, not sight or shots. The solid posts remain ordinary cover.
  g.userData.collisionPanels = points.slice(1).map((b, i) => ({
    a: points[i], b, height, blocksSight: false, blocksShots: false,
  }))
  const posted = new Set<string>()
  for (let n = 1; n < points.length; n++) {
    const [ax, az] = points[n - 1], [bx, bz] = points[n]
    const length = Math.hypot(bx - ax, bz - az), count = Math.ceil(length / 3.6)
    const dx = (bx - ax) / length, dz = (bz - az) / length
    const point = (u: number, y: number, offset = 0): Point => [ax + dx * u - dz * offset, y, az + dz * u + dx * offset]
    for (let i = 0; i <= count; i++) {
      const u = i / count * length, p = point(u, 0), key = `${p[0].toFixed(3)},${p[2].toFixed(3)}`
      if (posted.has(key)) continue
      posted.add(key)
      g.box(0.36, 0.18, 0.36, p[0], 0.09, p[2], 'concrete', 'detail')
      g.beam(point(u, 0.08), point(u, height + 0.05), 0.11)
      g.line([point(u, height), point(u, height + 0.38, 0.24)], 'detail')
      if (i % 2 === 0) for (const y of [0.22, height - 0.14]) {
        g.line([point(u - 0.07, y - 0.06, 0.075), point(u + 0.08, y + 0.05, 0.075)], 'detail')
      }
    }
    for (const y of [0.2, height - 0.12]) g.line([point(0, y), point(length, y)], 'detail')
    for (const t of [0.5, 1]) g.line([point(0, height + 0.38 * t, 0.24 * t), point(length, height + 0.38 * t, 0.24 * t)], 'mesh')
    // Analytically clip each diagonal to its panel, so the mesh ends at its rails.
    const bottom = 0.25, top = height - 0.16, pitch = 0.88
    for (const slope of [-1, 1]) for (let offset = -top; offset < length + top; offset += pitch) {
      let u0 = offset, u1 = offset + slope * (top - bottom)
      let y0 = bottom, y1 = top
      if (u0 < 0) { y0 += -u0 / slope; u0 = 0 }
      if (u0 > length) { y0 += (length - u0) / slope; u0 = length }
      if (u1 < 0) { y1 += -u1 / slope; u1 = 0 }
      if (u1 > length) { y1 += (length - u1) / slope; u1 = length }
      if (y0 >= bottom && y1 <= top && y1 > y0) g.line([point(u0, y0), point(u1, y1)], 'mesh')
    }
  }
  return g.finish()
}

export function gate(name: string, x: number, z: number, width: number, angle = 0, opened = true) {
  const g = new Draft(name, x, z, angle)
  const panels: { a: PlanPoint; b: PlanPoint; height: number; blocksSight: boolean; blocksShots: boolean }[] = []
  g.userData.collisionPanels = panels
  for (const side of [-1, 1]) {
    g.box(0.26, 3.15, 0.26, side * width / 2, 1.575, 0)
    const hinge = new THREE.Vector3(side * width / 2, 0, 0)
    const direction = new THREE.Vector3(-side, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), opened ? side * 1.3 : 0)
    const at = (u: number, y: number): Point => hinge.clone().addScaledVector(direction, u).setY(y).toArray()
    const w = width / 2 - 0.07
    const end = at(w, 0)
    panels.push({ a: [hinge.x, hinge.z], b: [end[0], end[2]], height: 2.65, blocksSight: false, blocksShots: false })
    g.line([at(0, 0.22), at(w, 0.22), at(w, 2.65), at(0, 2.65)], 'edge', true)
    g.line([at(0, 0.22), at(w, 2.65)], 'detail')
    for (let u = 0.35; u < w; u += 0.42) g.line([at(u, 0.22), at(u, 2.65)], 'mesh')
  }
  return g.finish()
}

function ladder(g: Draft, x: number, z: number, bottom: number, top: number, width = 0.95, landingDepth = 0.6) {
  const access = pipeLadder({ name: `${g.name} · solid access ladder`, x, z, bottom,
    landingHeight: top, width, landingDepth })
  g.add(access.finish())
}

export function fuelTank(index: number, x: number, z: number) {
  const g = new Draft(`West fuel storage ${index}`, x, z)
  g.userData.kind = 'fuel-tank'
  const r = 4.45, h = 9.6, floor = 0.38
  g.box(13.5, floor, 14.3, 0, floor / 2, 0, 'concrete', 'detail')
  // The low containment wall remains a ring with a clear interior.
  for (const side of [-1, 1]) {
    g.box(13.8, 0.58, 0.2, 0, 0.57, side * 7.15, 'paper', 'detail')
    g.box(0.2, 0.58, 14.1, side * 6.8, 0.57, 0, 'paper', 'detail')
  }
  g.cylinder(r, h, 0, floor + h / 2, 0)
  g.cylinder(r, 0.8, 0, floor + h + 0.4, 0, 'paper', 0.6)
  for (const y of [floor + 0.23, floor + h * 0.45]) g.ring(r + 0.012, y, 0, 0, 'detail')
  // Curved hatch trails follow the tank's surface instead of filling it with flat grey.
  for (const sector of [0.3, 2.7, 4.5]) for (let mark = 0; mark < 7; mark++) {
    const angle = sector + mark * 0.043
    g.line(Array.from({ length: 4 }, (_, i): Point => {
      const a = angle + i * 0.032
      return [Math.cos(a) * (r + 0.019), floor + 0.34 + i * 0.22, Math.sin(a) * (r + 0.019)]
    }), 'mesh')
  }
  g.cylinder(0.48, 0.22, 0, floor + h + 0.9, 0, 'paper')
  g.cylinder(0.09, 0.9, 1.3, floor + h + 0.8, -0.2, 'paper')
  ladder(g, 0, r + 0.35, floor, h + floor)
  // Radial roof seams carry just enough information to read the shallow cone.
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3
    g.line([[Math.cos(a) * 0.6, floor + h + 0.805, Math.sin(a) * 0.6],
      [Math.cos(a) * r, floor + h + 0.012, Math.sin(a) * r]], 'mesh')
  }
  g.beam([r, 1.1, 0], [9.6, 1.1, 0], 0.16, 'paper', 'detail')
  g.beam([9.6, 1.1, 0], [9.6, 0.6, 0], 0.16, 'paper', 'detail')
  g.box(0.55, 0.6, 0.55, 5.7, 0.3, 4.6, 'concrete', 'detail')
  return g.finish()
}

const WATER_DECK = 12.5
const WATER_RADIUS = 4.7
const WATER_TANK_RADIUS = 2.75
const WATER_RAIL_HEIGHT = 0.8
const WATCH_DECK = 6.6
const WATCH_HALF_WIDTH = 2.8
const ZIP_PAD_HALF_WIDTH = 1.0
export const WATER_TOWER_POSITION: PlanPoint = [10.95, -34.05]
export const OBSERVATION_TOWER_POSITION: PlanPoint = [-50.4, 15.15]

function directionBetween(from: PlanPoint, to: PlanPoint): PlanPoint {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length]
}

function guardrail(g: Draft, a: PlanPoint, b: PlanPoint, floor: number, height = 1.1) {
  for (const y of [floor + 0.12, floor + (height + 0.1) / 2, floor + height]) {
    g.beam([a[0], y, a[1]], [b[0], y, b[1]], y < floor + 0.2 ? 0.1 : 0.065, 'paper', 'detail')
  }
  const sections = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.2)
  for (let i = 0; i <= sections; i++) {
    const t = i / sections, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t
    g.beam([x, floor, z], [x, floor + height + 0.03, z], 0.075, 'paper', 'detail')
  }
}

export function waterTower(x: number, z: number, ziplineTarget: PlanPoint = OBSERVATION_TOWER_POSITION) {
  const g = new Draft('North water tower', x, z)
  const floor = WATER_DECK + 0.11, railRadius = WATER_RADIUS - 0.1
  const zipDirection = directionBetween([x, z], ziplineTarget)
  g.userData = { environment: true, kind: 'water-tower', deckHeight: floor,
    tankRadius: WATER_TANK_RADIUS, deckRadius: WATER_RADIUS, walkwayClearWidth: railRadius - 0.0375 - WATER_TANK_RADIUS,
    ladderOpeningWidth: 1.2, ziplineDirection: zipDirection }
  g.box(15, 0.22, 14, 0, 0.11, 0, 'concrete', 'detail')
  const foot = 2.75, top = 2.05, deck = WATER_DECK
  const corners: PlanPoint[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  const at = (c: PlanPoint, y: number): Point => {
    const r = foot + (top - foot) * y / deck
    return [c[0] * r, y, c[1] * r]
  }
  for (const corner of corners) {
    g.box(0.85, 0.5, 0.85, corner[0] * foot, 0.36, corner[1] * foot, 'concrete', 'detail')
    g.beam(at(corner, 0.4), at(corner, deck), 0.19)
  }
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4]
    for (const y of [0.7, 4.4, 8.3]) {
      const next = y === 8.3 ? deck : y + 3.75
      g.beam(at(a, y), at(b, next), 0.085, 'paper', 'detail')
      g.beam(at(b, y), at(a, next), 0.085, 'paper', 'detail')
      g.beam(at(a, next), at(b, next), 0.1, 'paper', 'detail')
    }
  }
  // The entire ring is a load-bearing solid deck; its clear width is over 1.8 m.
  const walkway = new Draft('Water tower · wide continuous catwalk')
  walkway.userData = { environment: true, kind: 'walkway', continuous: true, floorHeight: floor,
    outerRadius: WATER_RADIUS, innerRadius: WATER_TANK_RADIUS, clearWidth: g.userData.walkwayClearWidth }
  walkway.cylinder(WATER_RADIUS, 0.22, 0, deck, 0, 'paper')
  walkway.box(1.2, 0.22, 0.65, 0, deck, WATER_RADIUS - 0.05, 'paper', 'detail')
  // Radial under-deck brackets support the wider overhang without crossing the path.
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2
    walkway.beam([Math.cos(a) * 2, deck - 1.15, Math.sin(a) * 2],
      [Math.cos(a) * 4.35, deck - 0.13, Math.sin(a) * 4.35], 0.12, 'paper', 'detail')
  }
  const normalize = (a: number) => (a + Math.PI * 2) % (Math.PI * 2)
  const openings = [
    { angle: Math.PI / 2, half: Math.asin(0.6 / railRadius) },
    { angle: normalize(Math.atan2(zipDirection[1], zipDirection[0])), half: Math.asin(ZIP_PAD_HALF_WIDTH / railRadius) },
  ]
  const angles = Array.from({ length: 65 }, (_, i) => i / 64 * Math.PI * 2)
  for (const opening of openings) angles.push(normalize(opening.angle - opening.half), normalize(opening.angle + opening.half))
  angles.sort((a, b) => a - b)
  const inOpening = (a: number) => openings.some(opening => Math.abs(Math.atan2(Math.sin(a - opening.angle), Math.cos(a - opening.angle))) < opening.half)
  for (let i = 1; i < angles.length; i++) {
    const a = angles[i - 1], b = angles[i]
    if (inOpening((a + b) / 2)) continue
    const start: PlanPoint = [Math.cos(a) * railRadius, Math.sin(a) * railRadius]
    const end: PlanPoint = [Math.cos(b) * railRadius, Math.sin(b) * railRadius]
    for (const y of [floor + 0.12, floor + (WATER_RAIL_HEIGHT + 0.1) / 2, floor + WATER_RAIL_HEIGHT]) {
      walkway.beam([start[0], y, start[1]], [end[0], y, end[1]], y < floor + 0.2 ? 0.1 : 0.065, 'paper', 'detail')
    }
    // One post per two arc segments keeps the widened ring visually quiet.
    if (i % 2 === 0 || openings.some(opening => Math.abs(normalize(opening.angle + opening.half) - a) < 0.001)) {
      walkway.beam([start[0], floor, start[1]], [start[0], floor + WATER_RAIL_HEIGHT + 0.03, start[1]], 0.075, 'paper', 'detail')
    }
  }
  for (const opening of openings) for (const side of [-1, 1]) {
    const a = opening.angle + side * opening.half
    walkway.beam([Math.cos(a) * railRadius, floor, Math.sin(a) * railRadius],
      [Math.cos(a) * railRadius, floor + WATER_RAIL_HEIGHT + 0.03, Math.sin(a) * railRadius], 0.09, 'paper', 'detail')
  }
  g.add(walkway.finish())
  g.cylinder(WATER_TANK_RADIUS, 4.3, 0, deck + 2.26, 0, 'paper')
  g.cylinder(WATER_TANK_RADIUS, 0.65, 0, deck + 4.735, 0, 'paper', 0.35)
  g.cylinder(0.2, 0.35, 0, deck + 5.16, 0)
  g.ring(WATER_TANK_RADIUS + 0.015, deck + 0.56, 0, 0, 'detail')
  for (const sector of [0.5, 2.9, 4.7]) for (let mark = 0; mark < 6; mark++) {
    g.line(Array.from({ length: 4 }, (_, i): Point => {
      const a = sector + mark * 0.05 + i * 0.035
      return [Math.cos(a) * (WATER_TANK_RADIUS + 0.022), deck + 0.63 + i * 0.19,
        Math.sin(a) * (WATER_TANK_RADIUS + 0.022)]
    }), 'mesh')
  }
  g.beam([0.7, 0.22, -0.7], [0.7, deck + 0.1, -0.7], 0.18, 'paper', 'detail')
  ladder(g, 0, WATER_RADIUS + 0.4, 0.22, floor, 0.95, 0.9)
  // Stand-off brackets reach the support frame behind the ladder, never its rungs.
  for (const y of [3.5, 7.3, 10.9]) for (const side of [-1, 1]) {
    pipe(g, [side * 0.475, y, WATER_RADIUS + 0.4], at([side, 1], y), 0.065)
  }
  return g.finish()
}

export function watchTower(x: number, z: number, ziplineTarget: PlanPoint = WATER_TOWER_POSITION) {
  const g = new Draft('West observation tower', x, z)
  const foot = 2.7, top = 1.95, deck = WATCH_DECK, floor = deck + 0.13
  const zipDirection = directionBetween([x, z], ziplineTarget)
  g.userData = { environment: true, kind: 'observation-tower', deckHeight: floor,
    deckWidth: WATCH_HALF_WIDTH * 2, ladderOpeningWidth: 1.2, ziplineDirection: zipDirection }
  const corners: PlanPoint[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  const at = (c: PlanPoint, y: number): Point => [c[0] * (foot + (top - foot) * y / deck), y, c[1] * (foot + (top - foot) * y / deck)]
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4]
    g.box(0.7, 0.3, 0.7, a[0] * foot, 0.15, a[1] * foot, 'concrete', 'detail')
    g.beam(at(a, 0.2), at(a, deck), 0.22)
    for (const y of [0.4, 3.45]) {
      g.beam(at(a, y), at(b, y + 3), 0.15, 'paper', 'detail')
      g.beam(at(b, y), at(a, y + 3), 0.15, 'paper', 'detail')
    }
  }
  g.box(WATCH_HALF_WIDTH * 2, 0.26, WATCH_HALF_WIDTH * 2, 0, deck, 0)
  for (const side of [-1, 1]) {
    g.hatch([-WATCH_HALF_WIDTH + 0.12, deck - 0.1, side * (WATCH_HALF_WIDTH + 0.016)],
      [2.6, 0, 0], [0, 0.2, 0], { spacing: 0.12, inset: 0.015 })
  }
  g.box(1.2, 0.26, 0.6, 0, deck, WATCH_HALF_WIDTH - 0.02, 'paper', 'detail')
  const rails = new Draft('Observation tower · open deck and parapets')
  rails.userData = { environment: true, kind: 'walkway', floorHeight: floor, ladderOpeningWidth: 1.2, ziplineOpeningWidth: 2 }
  const edge = WATCH_HALF_WIDTH - 0.1
  // Clip the parapets where the diagonal zipline landing meets the square deck.
  const perp: PlanPoint = [zipDirection[1], -zipDirection[0]]
  const inZipCorridor = ([px, pz]: PlanPoint) => px * zipDirection[0] + pz * zipDirection[1] > 0
    && Math.abs(px * perp[0] + pz * perp[1]) < ZIP_PAD_HALF_WIDTH + 0.01
  for (const [a, b] of [
    [[-edge, -edge], [edge, -edge]], [[edge, -edge], [edge, edge]],
    [[edge, edge], [-edge, edge]], [[-edge, edge], [-edge, -edge]],
  ] as [PlanPoint, PlanPoint][]) {
    const cuts = [0, 1]
    const va = a[0] * perp[0] + a[1] * perp[1], vb = b[0] * perp[0] + b[1] * perp[1]
    if (Math.abs(vb - va) > 0.001) for (const limit of [-ZIP_PAD_HALF_WIDTH, ZIP_PAD_HALF_WIDTH]) {
      const t = (limit - va) / (vb - va)
      if (t > 0 && t < 1) cuts.push(t)
    }
    if (a[1] === edge && b[1] === edge) for (const limit of [-0.6, 0.6]) cuts.push((limit - a[0]) / (b[0] - a[0]))
    cuts.sort((left, right) => left - right)
    for (let i = 1; i < cuts.length; i++) {
      const point = (t: number): PlanPoint => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      const mid = point((cuts[i - 1] + cuts[i]) / 2)
      if (inZipCorridor(mid) || (mid[1] === edge && Math.abs(mid[0]) < 0.6)) continue
      const start = point(cuts[i - 1]), end = point(cuts[i])
      // Low perimeter panels enclose a genuinely empty observation cabin.
      rails.beam([start[0], floor + 0.44, start[1]], [end[0], floor + 0.44, end[1]], 0.12, 'paper', 'detail')
      const length = Math.hypot(end[0] - start[0], end[1] - start[1])
      rails.box(length, 0.72, 0.12, (start[0] + end[0]) / 2, floor + 0.36, (start[1] + end[1]) / 2,
        'paper', 'detail', [0, -Math.atan2(end[1] - start[1], end[0] - start[0]), 0])
      guardrail(rails, start, end, floor)
    }
  }
  g.add(rails.finish())
  // Keep the northeast passage clear; the roof is supported to either side of it.
  for (const [sx, sz] of [[-1.75, -1.75], [-1.75, 1.75], [1.75, 1.75], [0.25, -1.75], [1.75, 0.2]]) {
    g.beam([sx, floor, sz], [sx, deck + 2.85, sz], 0.13)
  }
  roof(g, 4.3, 4.3, deck + 2.85, 0.8, 0, 0, false)
  ladder(g, 0, WATCH_HALF_WIDTH + 0.4, 0.1, floor, 0.95, 0.9)
  for (const y of [2.4, 5.4]) for (const side of [-1, 1]) {
    pipe(g, [side * 0.475, y, WATCH_HALF_WIDTH + 0.4], at([side, 1], y), 0.065)
  }
  return g.finish()
}

/** A powered cable shuttle with accessible landings on both towers. */
export function towerZipline(water: PlanPoint, watch: PlanPoint): THREE.Group {
  const root = new THREE.Group()
  root.name = 'Tower-to-tower zipline'
  const waterDirection = directionBetween(water, watch), watchDirection = directionBetween(watch, water)
  const heightAboveDeck = 2.65, waterAnchor = 5.4, watchAnchor = 4.65
  const from = new THREE.Vector3(water[0] + waterDirection[0] * waterAnchor, WATER_DECK + 0.11 + heightAboveDeck, water[1] + waterDirection[1] * waterAnchor)
  const to = new THREE.Vector3(watch[0] + watchDirection[0] * watchAnchor, WATCH_DECK + 0.13 + heightAboveDeck, watch[1] + watchDirection[1] * watchAnchor)
  const sag = 0.65, cableRadius = 0.045
  const pointAt = (t: number) => from.clone().lerp(to, t).add(new THREE.Vector3(0, -4 * sag * t * (1 - t), 0))
  const landingAt = (anchor: THREE.Vector3, direction: PlanPoint) => anchor.clone()
    .add(new THREE.Vector3(-direction[0] * 0.75, -heightAboveDeck + 0.031, -direction[1] * 0.75)).toArray()
  root.userData = { environment: true, kind: 'zipline', start: from.toArray(), end: to.toArray(),
    horizontalSpan: Math.hypot(to.x - from.x, to.z - from.z), sag, cableRadius, landingWidth: 2,
    startLanding: landingAt(from, waterDirection), endLanding: landingAt(to, watchDirection),
    anchorHeightAboveDeck: heightAboveDeck, direction: 'water-to-observation', gameplay: true }
  for (const [name, center, direction, floor, anchor, waterSide] of [
    ['Water tower launch landing', water, waterDirection, WATER_DECK + 0.11, waterAnchor, true],
    ['Observation tower arrival landing', watch, watchDirection, WATCH_DECK + 0.13, watchAnchor, false],
  ] as [string, PlanPoint, PlanPoint, number, number, boolean][]) {
    const landing = new Draft(name, center[0], center[1], Math.atan2(direction[0], direction[1]))
    const inner = waterSide ? 3.3 : 1.8, outer = anchor + 0.4
    landing.userData = { environment: true, kind: 'zipline-landing', clearWidth: 1.8, floorHeight: floor + 0.006, anchorDistance: anchor }
    // A 6 mm landing plate overlaps the deck without coplanar surface flicker.
    landing.box(2, 0.206, outer - inner, 0, floor - 0.097, (inner + outer) / 2, 'paper', 'detail')
    for (const side of [-1, 1]) {
      const v = side * ZIP_PAD_HALF_WIDTH
      let railStart: number
      if (waterSide) railStart = Math.sqrt((WATER_RADIUS - 0.1) ** 2 - v * v)
      else {
        const perpendicular: PlanPoint = [direction[1], -direction[0]]
        const candidates = [0, 1].map(axis => ((WATCH_HALF_WIDTH - 0.1) * Math.sign(direction[axis]) - perpendicular[axis] * v) / direction[axis])
        railStart = Math.min(...candidates)
      }
      guardrail(landing, [v, railStart], [v, outer], floor, waterSide ? WATER_RAIL_HEIGHT : 1.1)
      landing.beam([v, floor - 1.15, inner], [v, floor - 0.12, outer], 0.15, 'paper', 'detail')
      landing.beam([v, floor - 1.15, inner], [v, floor - 0.12, inner], 0.15, 'paper', 'detail')
      landing.box(0.32, 0.1, 0.32, v, floor + 0.05, anchor, 'concrete', 'detail')
      landing.beam([v, floor, anchor], [v, floor + heightAboveDeck + 0.16, anchor], 0.15)
      landing.beam([v, floor + 0.1, anchor - 0.65], [v, floor + heightAboveDeck + 0.12, anchor], 0.1, 'paper', 'detail')
    }
    landing.beam([-1.08, floor + heightAboveDeck + 0.12, anchor], [1.08, floor + heightAboveDeck + 0.12, anchor], 0.18)
    // Short hanging eye secures the cable beneath the steel crossbar.
    landing.beam([0, floor + heightAboveDeck + 0.12, anchor], [0, floor + heightAboveDeck, anchor], 0.1, 'paper', 'detail')
    root.add(landing.finish())
  }
  const cable = new Draft('Zipline · solid steel cable and trolley')
  cable.userData = { environment: true, kind: 'zipline-cable', radius: cableRadius, start: from.toArray(), end: to.toArray() }
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 25 }, (_, i) => pointAt(i / 24)))
  cable.solid(new THREE.TubeGeometry(curve, 128, cableRadius, 8, false), [0, 0, 0], 'roof', false, [0, 0, 0], true)
  cable.line(Array.from({ length: 65 }, (_, i) => pointAt(i / 64).toArray()), 'edge')
  root.add(cable.finish())
  const trolley = new Draft('Zipline · downhill trolley grip')
  trolley.userData = { environment: true, kind: 'zipline-trolley', noCollision: true }
  const trolleyPoint = pointAt(0.003), transverse = new THREE.Vector3(waterDirection[1], 0, -waterDirection[0])
  trolley.userData.origin = trolleyPoint.toArray()
  trolley.box(0.3, 0.18, 0.27, trolleyPoint.x, trolleyPoint.y + 0.02, trolleyPoint.z, 'concrete', 'detail')
  const handle = trolleyPoint.clone().add(new THREE.Vector3(0, -0.86, 0))
  trolley.beam(trolleyPoint.toArray(), handle.toArray(), 0.065, 'paper', 'detail')
  trolley.beam(handle.clone().addScaledVector(transverse, -0.32).toArray(), handle.clone().addScaledVector(transverse, 0.32).toArray(), 0.085, 'paper', 'detail')
  root.add(trolley.finish())
  return root
}

export function railway(startX: number, endX: number, z: number, loadingEndX = endX - 3) {
  const g = new Draft('Northeast railway and loading platform')
  g.userData.kind = 'railway'
  const length = endX - startX, center = (startX + endX) / 2
  g.box(length, 0.1, 4.6, center, 0.08, z, 'concrete', 'detail')
  // Standard-gauge rails, individual sleepers, and explicit rail head / web / foot.
  for (let x = startX + 0.45; x < endX; x += 0.92) g.box(0.24, 0.15, 2.6, x, 0.205, z, 'paper', 'detail')
  for (const side of [-1, 1]) {
    const rz = z + side * 1.435 / 2
    g.box(length, 0.045, 0.18, center, 0.30, rz, 'paper', 'detail')
    g.box(length, 0.15, 0.055, center, 0.38, rz, 'paper', false)
    g.box(length, 0.065, 0.09, center, 0.47, rz, 'paper', 'edge')
  }
  // The loading area stops inside the compound fence while the rails continue
  // through to the annex. Keep its end independent of the full track length.
  const px = startX + 8, platformEnd = Math.min(loadingEndX, endX - 3), pl = platformEnd - px
  g.box(pl, 1.05, 5.8, px + pl / 2, 0.525, z + 5.3, 'concrete')
  for (let x = px + 2; x < platformEnd - 1; x += 4) g.line([[x, 1.065, z + 2.5], [x, 1.065, z + 3.1]], 'detail')
  for (let i = 0; i < 5; i++) g.box(2.4, (5 - i) * 0.21, 0.32, px + 2, (5 - i) * 0.105, z + 8.36 + i * 0.32, 'concrete', 'detail')
  // The canopy overhang also stays within the shortened platform footprint.
  const roofStart = px + 1, roofEnd = platformEnd - 2
  const underside = (offset: number) => 5.35 + Math.tan(0.04) * (offset - 5.35) - 0.07 / Math.cos(0.04)
  const canopyBays = Math.ceil((roofEnd - roofStart) / 9)
  for (let i = 0; i <= canopyBays; i++) {
    const x = roofStart + (roofEnd - roofStart) * i / canopyBays
    g.beam([x, 1.05, z + 7.2], [x, underside(7.2), z + 7.2], 0.13)
    g.beam([x, 4.5, z + 7.2], [x, underside(4.1), z + 4.1], 0.09, 'paper', 'detail')
  }
  const rx = (roofStart + roofEnd) / 2
  g.box(roofEnd - roofStart + 2, 0.14, 6.8, rx, 5.35, z + 5.35, 'roof', 'edge', [-0.04, 0, 0])
  for (let x = roofStart; x < roofEnd; x += 3.1) g.line([[x, underside(2) + 0.153, z + 2], [x, underside(8.7) + 0.153, z + 8.7]], 'mesh')
  crates(g, px + 3, z + 6, 3, 'paper', 1.05)
  return g.finish()
}

export function railShelter(x: number, z: number) {
  const g = new Draft('Rail entrance shelter', x, z)
  for (const sx of [-2.55, 2.55]) for (const sz of [-3.5, 3.5]) {
    g.box(0.5, 0.3, 0.5, sx, 0.15, sz, 'concrete', 'detail')
    g.beam([sx, 0.3, sz], [sx, 5.6, sz], 0.14)
  }
  roof(g, 5.8, 8, 5.6, 0.75)
  return g.finish()
}

export function lamp(name: string, x: number, z: number, height = 6) {
  const g = new Draft(name, x, z)
  g.box(0.4, 0.25, 0.4, 0, 0.125, 0, 'concrete', 'detail')
  g.beam([0, 0.2, 0], [0, height, 0], 0.12)
  g.beam([0, height, 0], [1.3, height, 0], 0.085, 'paper', 'detail')
  g.box(0.75, 0.14, 0.35, 1.24, height - 0.06, 0, 'paper', 'detail')
  return g.finish()
}
