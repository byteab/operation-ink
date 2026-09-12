import * as THREE from 'three'
import { Draft, type Point } from '../render/ink'
import { crates, roof } from './architecture'

export type PlanPoint = [number, number]

/** Connected fence panels; endpoints are shared exactly, with no random offsets. */
export function fence(name: string, points: PlanPoint[], height = 2.5) {
  const g = new Draft(name)
  g.userData.kind = 'fence'
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
  for (const side of [-1, 1]) {
    g.box(0.26, 3.15, 0.26, side * width / 2, 1.575, 0)
    const hinge = new THREE.Vector3(side * width / 2, 0, 0)
    const direction = new THREE.Vector3(-side, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), opened ? side * 1.3 : 0)
    const at = (u: number, y: number): Point => hinge.clone().addScaledVector(direction, u).setY(y).toArray()
    const w = width / 2 - 0.07
    g.line([at(0, 0.22), at(w, 0.22), at(w, 2.65), at(0, 2.65)], 'edge', true)
    g.line([at(0, 0.22), at(w, 2.65)], 'detail')
    for (let u = 0.35; u < w; u += 0.42) g.line([at(u, 0.22), at(u, 2.65)], 'mesh')
  }
  return g.finish()
}

function ladder(g: Draft, x: number, z: number, bottom: number, top: number, width = 0.62) {
  for (const side of [-1, 1]) g.beam([x + side * width / 2, bottom, z], [x + side * width / 2, top + 0.5, z], 0.065, 'paper', 'detail')
  for (let y = bottom + 0.3; y < top; y += 0.32) g.line([[x - width / 2, y, z], [x + width / 2, y, z]], 'detail')
  for (let y = bottom + 0.6; y < top; y += 2.2) for (const side of [-1, 1]) g.line([[x + side * width / 2, y, z], [x + side * width / 2, y, z - 0.3]], 'detail')
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
  g.cylinder(0.48, 0.22, 0, floor + h + 0.9, 0, 'paper')
  g.cylinder(0.09, 0.9, 1.3, floor + h + 0.8, -0.2, 'paper')
  ladder(g, 0, r + 0.35, floor, h + floor)
  // Radial roof seams carry just enough information to read the shallow cone.
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3
    g.line([[Math.cos(a) * 0.6, floor + h + 0.805, Math.sin(a) * 0.6],
      [Math.cos(a) * r, floor + h + 0.012, Math.sin(a) * r]], 'mesh')
  }
  for (const side of [-1, 1]) {
    g.line([[side * 0.31, h + floor, r + 0.35], [side * 0.31, h + floor + 0.6, r + 0.35],
      [side * 0.31, h + floor + 0.6, r - 0.3]], 'detail')
  }
  g.beam([r, 1.1, 0], [9.6, 1.1, 0], 0.16, 'paper', 'detail')
  g.beam([9.6, 1.1, 0], [9.6, 0.6, 0], 0.16, 'paper', 'detail')
  g.box(0.55, 0.6, 0.55, 5.7, 0.3, 4.6, 'concrete', 'detail')
  return g.finish()
}

export function waterTower(x: number, z: number) {
  const g = new Draft('North water tower', x, z)
  g.userData.kind = 'water-tower'
  g.box(15, 0.22, 14, 0, 0.11, 0, 'concrete', 'detail')
  const foot = 2.75, top = 2.05, deck = 12.5
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
  g.cylinder(3.15, 0.2, 0, deck, 0, 'paper')
  g.cylinder(2.75, 4.3, 0, deck + 2.25, 0, 'paper')
  g.cylinder(2.75, 0.65, 0, deck + 4.725, 0, 'paper', 0.35)
  g.cylinder(0.2, 0.35, 0, deck + 5.15, 0)
  g.ring(2.765, deck + 0.55, 0, 0, 'detail')
  // Ring catwalk and guardrail wrap the vessel as actual 3D geometry.
  for (const y of [deck + 0.15, deck + 1.0]) g.ring(3.15, y, 0, 0, 'detail')
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, sx = Math.cos(a) * 3.15, sz = Math.sin(a) * 3.15
    g.line([[sx, deck + 0.1, sz], [sx, deck + 1, sz]], 'detail')
  }
  g.beam([0.7, 0.22, -0.7], [0.7, deck + 0.1, -0.7], 0.18, 'paper', 'detail')
  ladder(g, 0, 3.08, 0.22, deck, 0.7)
  return g.finish()
}

export function watchTower(x: number, z: number) {
  const g = new Draft('West observation tower', x, z)
  g.userData.kind = 'observation-tower'
  const foot = 2.7, top = 1.95, deck = 6.6
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
  g.box(4.7, 0.26, 4.7, 0, deck, 0)
  g.box(3.65, 0.9, 3.65, 0, deck + 0.58, 0)
  for (const sx of [-1.75, 1.75]) for (const sz of [-1.75, 1.75]) g.beam([sx, deck + 0.9, sz], [sx, deck + 2.85, sz], 0.13)
  roof(g, 4.3, 4.3, deck + 2.85, 0.8, 0, 0, false)
  for (let y = deck + 0.24; y < deck + 0.95; y += 0.28) for (const side of [-1, 1]) g.line([[-1.82, y, side * 1.84], [1.82, y, side * 1.84]], 'detail')
  ladder(g, 0, 2.6, 0.1, deck, 0.85)
  return g.finish()
}

export function railway(startX: number, endX: number, z: number) {
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
  const px = startX + 8, pl = endX - px - 3
  g.box(pl, 1.05, 5.8, px + pl / 2, 0.525, z + 5.3, 'concrete')
  for (let x = px + 2; x < endX - 4; x += 4) g.line([[x, 1.065, z + 2.5], [x, 1.065, z + 3.1]], 'detail')
  for (let i = 0; i < 5; i++) g.box(2.4, (5 - i) * 0.21, 0.32, px + 2, (5 - i) * 0.105, z + 8.36 + i * 0.32, 'concrete', 'detail')
  // Fixed canopy on platform; tracks remain open underneath its independent end shelter.
  const roofStart = px + 1, roofEnd = endX - 5
  const underside = (offset: number) => 5.35 + Math.tan(0.04) * (offset - 5.35) - 0.07 / Math.cos(0.04)
  for (let x = roofStart; x <= roofEnd; x += 9) {
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
