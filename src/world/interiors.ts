import { Draft, type Point } from '../render/ink'

type Counts = Record<string, number>

/** Furniture is built at human scale, leaving the centre of each room as a circulation aisle. */
class Furnishing extends Draft {
  counts: Counts = {}

  item(kind: string, x: number, z: number, floor: number, angle = 0) {
    this.counts[kind] = (this.counts[kind] ?? 0) + 1
    const item = new Draft(`${this.name} · ${kind} ${this.counts[kind]}`, x, z, angle)
    item.position.y = floor
    item.userData.furniture = kind
    this.add(item)
    return item
  }

  chair(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('chair', x, z, floor, angle)
    g.box(0.56, 0.1, 0.56, 0, 0.49, 0, 'green', 'detail')
    for (const sx of [-0.23, 0.23]) for (const sz of [-0.23, 0.23]) {
      g.beam([sx, 0.04, sz], [sx, sz < 0 ? 1.03 : 0.47, sz], 0.055, 'paper', 'detail')
    }
    g.box(0.56, 0.34, 0.065, 0, 0.89, -0.23, 'green', 'detail')
    g.finish()
  }

  desk(x: number, z: number, floor: number, angle = 0, radio = false) {
    const g = this.item('desk', x, z, floor, angle)
    g.box(1.8, 0.12, 0.84, 0, 0.84, 0, 'paper', 'detail')
    g.box(0.45, 0.75, 0.73, -0.61, 0.405, 0, 'roof', 'detail')
    for (const sz of [-0.32, 0.32]) g.beam([0.73, 0.03, sz], [0.73, 0.81, sz], 0.06, 'paper', 'detail')
    for (const y of [0.22, 0.45, 0.67]) {
      g.line([[-0.78, y, 0.375], [-0.44, y, 0.375]], 'detail')
      g.box(0.15, 0.025, 0.035, -0.61, y + 0.07, 0.38, 'paper', 'detail')
    }
    // Field paperwork and a desk lamp, with a compact radio on communications desks.
    g.box(0.38, 0.025, 0.27, 0.33, 0.915, 0.11, 'paper', 'detail', [0, 0.12, 0])
    g.beam([-0.65, 0.9, -0.24], [-0.65, 1.35, -0.24], 0.035, 'paper', 'detail')
    g.box(0.27, 0.1, 0.18, -0.55, 1.34, -0.24, 'roof', 'detail')
    if (radio) {
      this.counts.radio = (this.counts.radio ?? 0) + 1
      g.box(0.7, 0.32, 0.32, 0.1, 1.06, -0.2, 'green', 'detail')
      g.box(0.25, 0.13, 0.02, -0.04, 1.09, -0.029, 'glass', 'detail')
      for (const sx of [0.19, 0.29, 0.39]) g.box(0.045, 0.045, 0.04, sx, 1.07, -0.014, 'paper', 'detail')
      g.beam([0.37, 1.2, -0.27], [0.45, 1.85, -0.27], 0.025, 'paper', 'detail')
    }
    g.finish()
  }

  bunk(x: number, z: number, floor: number, angle = 0, single = false) {
    const g = this.item(single ? 'medical-cot' : 'bunk-bed', x, z, floor, angle)
    for (const sx of [-0.51, 0.51]) for (const sz of [-1.06, 1.06]) {
      g.beam([sx, 0.02, sz], [sx, single ? 0.95 : 2.08, sz], 0.07, 'paper', 'detail')
    }
    for (const y of single ? [0.62] : [0.5, 1.6]) {
      g.box(1.12, 0.13, 2.2, 0, y, 0, 'roof', 'detail')
      g.box(1.04, 0.18, 2.09, 0, y + 0.13, 0, 'paper', 'detail')
      g.box(1.035, 0.025, 1.35, 0, y + 0.235, 0.3, 'green', 'detail')
      g.hatch([-0.46, y + 0.262, -0.29], [0.32, 0, 0], [0, 0, 0.7],
        { spacing: 0.095, inset: 0.025 })
      g.box(0.7, 0.12, 0.39, 0, y + 0.26, -0.72, 'paper', 'detail')
      g.beam([-0.51, y + 0.36, -1.06], [0.51, y + 0.36, -1.06], 0.065, 'paper', 'detail')
    }
    if (!single) {
      for (const sx of [-0.41, 0.41]) g.beam([sx, 0.03, 1.12], [sx, 1.93, 1.12], 0.055, 'paper', 'detail')
      for (let y = 0.31; y < 1.8; y += 0.31) g.beam([-0.41, y, 1.12], [0.41, y, 1.12], 0.055, 'paper', 'detail')
      g.beam([-0.51, 2.02, 0.45], [-0.51, 2.02, -1.06], 0.055, 'paper', 'detail')
      g.beam([0.51, 2.02, 0.45], [0.51, 2.02, -1.06], 0.055, 'paper', 'detail')
    }
    g.finish()
  }

  lockers(x: number, z: number, floor: number, count = 3, angle = 0) {
    const g = this.item('locker-bank', x, z, floor, angle)
    for (let i = 0; i < count; i++) {
      const sx = (i - (count - 1) / 2) * 0.59
      g.box(0.57, 1.92, 0.55, sx, 1.01, 0, 'green', 'detail')
      g.line([[sx - 0.23, 0.14, 0.281], [sx - 0.23, 1.89, 0.281], [sx + 0.23, 1.89, 0.281], [sx + 0.23, 0.14, 0.281]], 'detail', true)
      g.box(0.04, 0.18, 0.055, sx + 0.14, 1.03, 0.31, 'paper', 'detail')
      for (let v = 0; v < 3; v++) g.line([[sx - 0.16, 1.63 + v * 0.07, 0.286], [sx + 0.16, 1.63 + v * 0.07, 0.286]], 'mesh')
    }
    g.finish()
  }

  table(x: number, z: number, floor: number, width = 3.3) {
    const g = this.item('briefing-table', x, z, floor)
    g.box(width, 0.14, 1.35, 0, 0.86, 0, 'roof', 'detail')
    for (const sx of [-width / 2 + 0.18, width / 2 - 0.18]) for (const sz of [-0.48, 0.48]) {
      g.beam([sx, 0.02, sz], [sx, 0.79, sz], 0.09, 'paper', 'detail')
    }
    g.box(width * 0.58, 0.018, 0.91, 0, 0.94, 0, 'green', 'detail')
    g.line([[-0.8, 0.952, -0.25], [-0.32, 0.952, 0.12], [0.11, 0.952, -0.16], [0.63, 0.952, 0.18]], 'detail')
    g.finish()
  }

  shelf(x: number, z: number, floor: number, angle = 0) {
    const g = this.item('supply-shelf', x, z, floor, angle)
    for (const sx of [-1.08, 1.08]) for (const sz of [-0.34, 0.34]) {
      g.beam([sx, 0.02, sz], [sx, 2.22, sz], 0.065, 'paper', 'detail')
    }
    for (const y of [0.18, 0.94, 1.71]) {
      g.box(2.3, 0.075, 0.82, 0, y, 0, 'roof', 'detail')
      for (const sx of [-0.69, 0.05, 0.72]) {
        g.box(0.52, 0.45, 0.6, sx, y + 0.27, 0, 'green', 'detail')
        g.box(0.22, 0.12, 0.014, sx, y + 0.31, 0.307, 'paper', 'detail')
        g.line([[sx - 0.26, y + 0.14, 0.309], [sx + 0.26, y + 0.14, 0.309]], 'mesh')
      }
    }
    g.finish()
  }

  pallet(x: number, z: number, floor: number, double = false) {
    const g = this.item('supply-pallet', x, z, floor)
    for (const sx of [-0.57, 0, 0.57]) g.box(0.16, 0.15, 1.4, sx, 0.075, 0, 'roof', 'detail')
    for (let i = 0; i < 5; i++) g.box(1.4, 0.07, 0.2, 0, 0.19, -0.58 + i * 0.29, 'paper', 'detail')
    for (let level = 0; level < (double ? 2 : 1); level++) {
      const y = 0.68 + level * 0.92
      g.box(1.22, 0.88, 1.2, 0, y, 0, 'green', 'detail')
      for (const sx of [-0.39, 0.39]) g.box(0.08, 0.91, 1.23, sx, y, 0, 'roof', 'detail')
      g.box(0.34, 0.18, 0.015, 0, y + 0.08, 0.61, 'paper', 'detail')
    }
    g.finish()
  }

  wallMap(x: number, z: number, floor: number) {
    const g = this.item('operations-map', x, z, floor)
    g.box(2.4, 1.3, 0.08, 0, 1.91, 0, 'roof', 'detail')
    g.box(2.18, 1.09, 0.016, 0, 1.91, 0.049, 'green', 'detail')
    const route: Point[] = [[-0.87, 1.58, 0.062], [-0.49, 1.94, 0.062], [-0.05, 1.79, 0.062], [0.32, 2.23, 0.062], [0.87, 2.17, 0.062]]
    g.line(route, 'detail')
    for (const [sx, sy] of [[-0.49, 1.94], [0.32, 2.23], [0.6, 1.68]]) g.box(0.18, 0.14, 0.024, sx, sy, 0.067, 'paper', 'detail')
    g.finish()
  }

  workbench(x: number, z: number, floor: number) {
    const g = this.item('maintenance-workbench', x, z, floor)
    g.box(3.4, 0.14, 0.95, 0, 0.98, 0, 'roof', 'detail')
    for (const sx of [-1.47, 1.47]) for (const sz of [-0.34, 0.34]) g.beam([sx, 0.02, sz], [sx, 0.91, sz], 0.09, 'paper', 'detail')
    g.box(3.1, 0.09, 0.76, 0, 0.25, 0, 'paper', 'detail')
    g.box(2.7, 1.15, 0.08, 0, 1.82, -0.43, 'green', 'detail')
    for (const sx of [-0.98, -0.49, 0, 0.49, 0.98]) {
      g.beam([sx, 1.52, -0.37], [sx, 2.12, -0.37], 0.045, 'paper', 'detail')
      g.box(0.2, 0.1, 0.065, sx, 2.12, -0.37, 'paper', 'detail')
    }
    g.box(0.67, 0.27, 0.4, -0.8, 1.185, 0, 'green', 'detail')
    g.beam([-1.02, 1.34, 0], [-0.59, 1.34, 0], 0.05, 'paper', 'detail')
    g.box(0.25, 0.21, 0.27, 1.04, 1.14, 0.35, 'concrete', 'detail')
    g.beam([0.91, 1.18, 0.54], [1.3, 1.18, 0.54], 0.045, 'paper', 'detail')
    g.finish()
  }
}

export function militaryInterior(name: string, type: string, w: number, d: number, floor: number) {
  const g = new Furnishing(`${name} · furnished interior`)
  const back = -d / 2 + 0.7
  const left = -w / 2 + 1.5, right = w / 2 - 1.5
  let variant: string

  if (type === 'warehouse') {
    variant = 'quartermaster stores'
    const count = Math.max(2, Math.min(8, Math.floor((w - 4) / 6)))
    for (let i = 0; i < count; i++) {
      const x = -w / 2 + 2.5 + (w - 5) * i / (count - 1)
      g.shelf(x, back, floor)
      g.pallet(x, -d / 2 + 3.1, floor, i % 2 === 0)
    }
    g.desk(left + 0.5, d / 2 - 1.3, floor, Math.PI)
    g.chair(left + 0.5, d / 2 - 2.3, floor)
    g.lockers(right, d / 2 - 0.75, floor, 3, Math.PI)
  } else if (/administration|service/i.test(name) && type !== 'utility') {
    variant = 'administration and briefing room'
    for (const x of [left + 1, right - 1]) {
      g.desk(x, back + 0.3, floor, 0, true)
      g.chair(x, back + 1.35, floor, Math.PI)
    }
    g.table(0, -0.5, floor, 4.2)
    for (const x of [-1.3, 0, 1.3]) {
      g.chair(x, -1.75, floor)
      g.chair(x, 0.8, floor, Math.PI)
    }
    g.wallMap(0, -d / 2 + 0.28, floor)
    g.lockers(left + 0.2, d / 2 - 0.7, floor, 4, Math.PI)
    g.shelf(right - 0.2, d / 2 - 0.8, floor, Math.PI)
  } else if (/gatehouse/i.test(name)) {
    variant = 'guard room and radio post'
    g.desk(left + 0.7, back + 0.1, floor, 0, true)
    g.chair(left + 0.7, back + 1.2, floor, Math.PI)
    g.wallMap(1, -d / 2 + 0.28, floor)
    g.lockers(right - 0.2, back, floor, 3)
    g.shelf(right - 0.2, d / 2 - 0.8, floor, Math.PI)
    g.bunk(left - 0.1, d / 2 - 2, floor, Math.PI / 2, true)
  } else if (/hut B/i.test(name)) {
    variant = 'field medical station'
    g.bunk(left, 0, floor, 0, true)
    g.bunk(left + 2.25, 0, floor, 0, true)
    g.desk(right - 0.5, back + 0.3, floor, 0, true)
    g.chair(right - 0.5, back + 1.4, floor, Math.PI)
    g.lockers(right - 0.3, d / 2 - 0.7, floor, 3, Math.PI)
    const cabinet = g.item('medical-cabinet', 0, back, floor)
    cabinet.box(1.5, 1.7, 0.55, 0, 0.9, 0, 'paper', 'detail')
    cabinet.box(0.45, 0.13, 0.03, 0, 1.19, 0.29, 'green', 'detail')
    cabinet.box(0.13, 0.45, 0.035, 0, 1.19, 0.293, 'green', 'detail')
    cabinet.finish()
  } else if (type === 'utility') {
    variant = /hut A/i.test(name) ? 'signals equipment and repair' : 'maintenance and equipment room'
    g.workbench(left + 1, back + 0.25, floor)
    g.shelf(right - 0.3, back + 0.1, floor)
    g.lockers(left, d / 2 - 0.75, floor, 3, Math.PI)
    if (w > 12) {
      g.desk(right - 0.3, d / 2 - 1.1, floor, Math.PI, true)
      g.chair(right - 0.3, d / 2 - 2.2, floor)
    } else {
      g.pallet(right, d / 2 - 1.1, floor)
    }
  } else {
    variant = 'barracks sleeping quarters'
    const count = Math.max(2, Math.min(5, Math.floor((w - 3) / 3.3)))
    const rowZ = -d / 2 + 1.65
    for (let i = 0; i < count; i++) {
      const x = left + (right - left) * i / (count - 1)
      g.bunk(x, rowZ, floor)
    }
    g.lockers(left + 0.6, d / 2 - 0.7, floor, Math.min(5, count), Math.PI)
    g.shelf(right - 0.7, d / 2 - 0.8, floor, Math.PI)
    if (d > 9) {
      g.table(0, 0.5, floor, 2.8)
      for (const x of [-0.85, 0.85]) {
        g.chair(x, -0.7, floor)
        g.chair(x, 1.7, floor, Math.PI)
      }
    }
  }

  g.userData.interiorVariant = variant
  g.userData.furnitureCounts = g.counts
  g.userData.roomBounds = { min: [-w / 2 + 0.2, floor, -d / 2 + 0.2], max: [w / 2 - 0.2, floor + 2.7, d / 2 - 0.2] }
  g.userData.clearEntryAisle = 1.6
  return g.finish()
}
