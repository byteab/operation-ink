import * as THREE from 'three'
import { Draft, palette, type Point } from '../render/ink'
import { building, container, crates, platform, truck, workshop, type BuildingSpec } from './architecture'
import { messHall } from './messHall'
import { drawPine, treeRadius, treeSeed } from './vegetation'
import { fence, fuelTank, gate, lamp, railway, watchTower, waterTower, towerZipline,
  WATER_TOWER_POSITION, OBSERVATION_TOWER_POSITION, type PlanPoint } from './industrial'

// Coordinates are traced from the supplied 1448 × 1086 plan, not randomly placed.
// North is -Z, east is +X. One world unit is approximately one metre.
export const MAP_SCALE = 0.15
export const mapPoint = (x: number, y: number): PlanPoint => [(x - 750) * MAP_SCALE, (y - 540) * MAP_SCALE]
const plan = (points: PlanPoint[]) => points.map(([x, y]) => mapPoint(x, y))

const buildingPlan: (Omit<BuildingSpec, 'x' | 'z' | 'width' | 'depth'> & {
  at: PlanPoint; size: PlanPoint
})[] = [
  { name: 'Northwest service building', at: [522, 229], size: [185, 142], height: 5.8, type: 'service' },
  { name: 'Central long warehouse', at: [920, 496], size: [373, 85], height: 5.0, type: 'warehouse' },
  { name: 'South barracks A', at: [854, 785], size: [136, 92], height: 3.45 },
  { name: 'South barracks B · long wing', at: [1116, 773], size: [74, 115], height: 3.45 },
  { name: 'South barracks B · west wing', at: [1044, 743], size: [70, 55], height: 3.45 },
  { name: 'West administration wing', at: [549, 738], size: [185, 51], height: 3.45 },
  { name: 'West utility building', at: [531, 648], size: [46, 76], height: 3.3, type: 'utility' },
  { name: 'Inner gatehouse', at: [709, 695], size: [66, 102], height: 3.6, type: 'utility' },
  { name: 'Southwest service shed', at: [186, 889], size: [58, 132], height: 3.5, type: 'utility' },
  { name: 'Southwest stores', at: [363, 970], size: [166, 74], height: 4.6, type: 'warehouse' },
  { name: 'East utility hut A', at: [1325, 734], size: [101, 42], height: 2.85, type: 'utility' },
  { name: 'East utility hut B', at: [1325, 801], size: [101, 42], height: 2.85, type: 'utility' },
  { name: 'West equipment shed A', at: [333, 466], size: [91, 43], height: 2.9, type: 'utility' },
  { name: 'West equipment shed B', at: [333, 550], size: [91, 44], height: 2.9, type: 'utility' },
]

const outerBoundary: PlanPoint[] = [
  [280, 110], [732, 128], [732, 220], [915, 220], [915, 290], [1410, 290],
  [1410, 868], [614, 868], [614, 1030], [125, 1030], [125, 777], [245, 777], [245, 138], [280, 110],
]

function yard() {
  const g = new Draft('Compound ground and concrete aprons')
  const shape = new THREE.Shape()
  const boundary = plan(outerBoundary)
  boundary.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z))
  shape.closePath()
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.rotateX(-Math.PI / 2)
  g.solid(geometry, [0, 0.005, 0], 'paper', false)
  // Sparse slab joints only on the loading court; open yards remain quiet.
  const [cx, cz] = mapPoint(924, 583)
  g.box(54, 0.045, 10, cx, 0.02, cz, 'concrete', false)
  for (const x of [cx - 24, cx - 12, cx, cx + 12, cx + 24]) g.line([[x, 0.05, cz - 5], [x, 0.05, cz + 5]], 'detail')
  for (const [x, z, width] of [[cx - 22, cz - 4.7, 3.8], [cx + 5, cz + 2.8, 2.4], [cx + 19, cz - 4.3, 2.8]]) {
    g.hatch([x, 0.052, z], [width, 0, 0.3], [0.7, 0, 1.1], { spacing: 0.28, inset: 0.06 })
  }
  return g.finish()
}

function accessRoad() {
  const g = new Draft('Northern access road')
  const route = [[-160, 52], [200, 67], [580, 87], [815, 115], [1070, 175], [1450, 188], [1650, 179]]
  const curve = new THREE.CatmullRomCurve3(route.map(([x, y]) => {
    const [wx, wz] = mapPoint(x, y)
    return new THREE.Vector3(wx, 0.025, wz)
  }))
  const count = 160, left: Point[] = [], right: Point[] = [], shoulderA: Point[] = [], shoulderB: Point[] = []
  for (let i = 0; i <= count; i++) {
    const t = i / count, p = curve.getPoint(t), tangent = curve.getTangent(t)
    const n = new THREE.Vector3(-tangent.z, 0, tangent.x)
    left.push(p.clone().addScaledVector(n, -3.4).toArray())
    right.push(p.clone().addScaledVector(n, 3.4).toArray())
    shoulderA.push(p.clone().addScaledVector(n, -3.95).toArray())
    shoulderB.push(p.clone().addScaledVector(n, 3.95).toArray())
    if (i < count && i % 5 === 0) {
      const end = curve.getPoint(Math.min(1, (i + 1.7) / count))
      g.line([[p.x, 0.045, p.z], [end.x, 0.045, end.z]], 'detail')
    }
    if (i > 0 && i < count && i % 13 === 0) {
      const start = p.clone().addScaledVector(n, i % 2 ? -3.15 : 2.65)
      const end = start.clone().addScaledVector(tangent, 1.8 + i % 3).addScaledVector(n, -0.5)
      g.line([[start.x, 0.048, start.z], [end.x, 0.048, end.z]], 'landscape')
      g.line([[start.x + n.x * 0.2, 0.048, start.z + n.z * 0.2],
        [end.x - tangent.x * 0.45, 0.048, end.z - tangent.z * 0.45]], 'landscape')
    }
  }
  const vertices: Point[] = [], indices: number[] = []
  for (let i = 0; i <= count; i++) vertices.push(left[i], right[i])
  for (let i = 0; i < count; i++) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3))
  geo.setIndex(indices); geo.computeVertexNormals()
  g.solid(geo, [0, 0, 0], 'concrete', false)
  g.line(left, 'edge'); g.line(right, 'edge')
  g.line(shoulderA, 'landscape'); g.line(shoulderB, 'landscape')

  // The roadside forecourt is open; the inner service-yard gate stays closed.
  const drive = new THREE.CatmullRomCurve3([[370, 87], [370, 114], [350, 175], [338, 220], [342, 278]].map(([x, z]) => {
    const [wx, wz] = mapPoint(x, z)
    return new THREE.Vector3(wx, 0.04, wz)
  }))
  const driveLeft: Point[] = [], driveRight: Point[] = []
  for (let i = 0; i <= 36; i++) {
    const p = drive.getPoint(i / 36), tangent = drive.getTangent(i / 36)
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x)
    driveLeft.push(p.clone().addScaledVector(normal, -2.7).toArray())
    driveRight.push(p.clone().addScaledVector(normal, 2.7).toArray())
    if (i > 0) g.face([driveLeft[i - 1], driveRight[i - 1], driveRight[i], driveLeft[i]], 'concrete', false)
  }
  g.line(driveLeft, 'edge'); g.line(driveRight, 'edge')
  return g.finish()
}

function landscaping() {
  const g = new Draft('Perimeter trees and low vegetation')
  // Deliberate clusters from the reference: west tank belt, northern roadside,
  // southwest clearing and southeast rocks. Working yards stay unobstructed.
  const trees = [
    [105, 209, 9], [57, 251, 7], [70, 640, 8], [155, 684, 10], [176, 730, 7],
    [304, 825, 8.5], [447, 815, 9], [503, 800, 7], [569, 843, 8.5], [583, 899, 7.5],
    [386, 580, 5], [671, 397, 6.5], [803, 612, 4.5],
    [358, 410, 5], [270, 414, 4.5], [968, 183, 7], [853, 192, 5],
    [276, 27, 8.5], [653, 34, 9], [931, 73, 8], [990, 55, 6], [1210, 103, 8], [1390, 22, 11],
    [1445, 403, 9], [1436, 705, 7.5], [1409, 914, 8.5], [1346, 934, 7],
    [1304, 962, 8], [1067, 902, 7.5], [1001, 960, 8], [946, 927, 6.5],
    [729, 942, 7], [696, 989, 6], [537, 1080, 7], [116, 1074, 8],
    [32, 877, 9], [22, 941, 7], [57, 980, 6], [1190, 570, 4.5], [1287, 686, 6],
  ]
  g.userData.trees = trees.map(([px, pz, h]) => {
    const [x, z] = mapPoint(px, pz)
    const seed = treeSeed(px, pz)
    const height = drawPine(g, x, z, h, seed)
    return { x, z, height, species: 'pine', seed, radius: treeRadius(height) }
  })
  const rocks = [[1120, 971, 3.1], [1152, 947, 2.5], [1171, 976, 2], [1223, 86, 2.8], [1270, 79, 2],
    [55, 560, 1.6], [60, 790, 2.1], [684, 1047, 1.6], [670, 953, 2.2]]
  for (const [px, pz, size] of rocks) {
    const [x, z] = mapPoint(px, pz)
    const shape = new THREE.DodecahedronGeometry(size, 0)
    shape.scale(1.3, 0.48, 0.8)
    g.solid(shape, [x, size * 0.21, z], 'rock', 'landscape', [0, px * 0.07, 0])
  }
  // Small, placed grass clumps; no ground texture, scatter noise, or blanket grid.
  const clumps = [[313, 409], [389, 576], [527, 598], [608, 795], [778, 623], [1013, 655], [1191, 516],
    [1208, 583], [971, 865], [913, 914], [825, 902], [666, 910], [633, 981], [515, 843], [304, 817],
    [164, 749], [82, 680], [58, 594], [145, 216], [365, 134], [668, 162], [784, 202], [967, 244], [1260, 253]]
  for (const [px, pz] of clumps) {
    const [x, z] = mapPoint(px, pz)
    g.line([[x - 0.35, 0.03, z], [x - 0.55, 0.53, z + 0.1], [x, 0.03, z], [x + 0.05, 0.72, z], [x + 0.22, 0.03, z], [x + 0.5, 0.45, z - 0.1]], 'landscape')
  }
  return g.finish()
}

export function createCompound() {
  const root = new THREE.Group()
  root.name = 'Rail supply compound'
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshBasicMaterial({ color: palette.paper }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.035
  ground.name = 'Unlit paper ground'
  root.add(ground, yard(), accessRoad())

  for (const spec of buildingPlan) {
    const [x, z] = mapPoint(...spec.at)
    // Ridge lines follow each building's long axis; the rotated footprint remains
    // exactly the same as the plan and long-side entries face the adjoining yard.
    const vertical = spec.size[1] > spec.size[0]
    const build = spec.name === 'Northwest service building' ? messHall : building
    root.add(build({ ...spec, x, z,
      width: spec.size[vertical ? 1 : 0] * MAP_SCALE,
      depth: spec.size[vertical ? 0 : 1] * MAP_SCALE,
      angle: vertical ? Math.PI / 2 : 0,
    }))
  }
  root.add(platform('Northwest building apron', ...mapPoint(522, 237), 36, 27, 0.12))
  root.add(workshop(...mapPoint(1302, 481)), truck(...mapPoint(1305, 504)))
  for (const [i, y] of [319, 432, 548].entries()) root.add(fuelTank(i + 1, ...mapPoint(147, y)))
  root.add(waterTower(...WATER_TOWER_POSITION), watchTower(...OBSERVATION_TOWER_POSITION))
  root.add(towerZipline(WATER_TOWER_POSITION, OBSERVATION_TOWER_POSITION))
  root.add(railway(mapPoint(927, 0)[0], mapPoint(1530, 0)[0], mapPoint(0, 324)[1], 98.4))

  // The rail spur passes through a deliberate opening in the eastern fence.
  // Remove the redundant outer fence around the roadside mess-hall forecourt.
  // The service enclosure remains the boundary across the building's front.
  root.add(fence('Perimeter · north and northeast', plan(outerBoundary.slice(3, 6))))
  root.add(fence('Perimeter · northeast rail entrance north', plan([[1410, 290], [1410, 307]])))
  root.add(fence('Perimeter · east, south and west', plan([[1410, 344], ...outerBoundary.slice(6, 12), [245, 220]])))
  root.add(fence('Fuel annex · west', plan([[91, 274], [91, 727], [111, 727]])))
  root.add(fence('Fuel annex · north', plan([[91, 274], [115, 274]])))
  root.add(fence('North service enclosure · west', plan([[245, 220], [313, 220]])))
  // Set the terminal post just outside the thick wall so its shaft stays visible.
  root.add(fence('North service enclosure · entry return', plan([[363, 220], [428.25, 220]])))
  const serviceGate = gate('North service yard gate · closed', ...mapPoint(338, 220), 7.5, 0, false)
  serviceGate.userData = { ...serviceGate.userData, kind: 'fence-gate', open: false, interactive: false, permanentlyClosed: true }
  root.add(serviceGate)
  root.add(fence('North service enclosure · east', plan([[614.5, 220], [915, 220]])))
  // Close the shortcut around the loading platform's western end by the water tower.
  root.add(fence('Rail yard · water tower return', plan([[915, 290], [915, 415]])))
  root.add(fence('Inner yard · railway separation and west return', plan([[1410, 415], [730, 415], [730, 460], [667, 460], [667, 529]])))
  // Entry now faces the open yard instead of the narrow gatehouse passage.
  root.add(fence('Inner yard · south gate return', plan([[667, 581], [667, 700], [447, 700]])))
  // The tower sits forward of one continuous cross fence; the open gate is the
  // only break. The return meets the existing inner-yard fence at (447, 700).
  root.add(fence('Observation tower · yard closure', plan([[383, 681], [447, 681], [447, 700]])))
  root.add(fence('West cross fence', plan([[245, 681], [311, 681]])))
  root.add(gate('West service gate · open', ...mapPoint(347, 681), 10.8))
  root.add(gate('Inner yard gate · open', ...mapPoint(667, 555), 7.8, -Math.PI / 2))

  const storage = [[321, 326, 5.6], [321, 372, 5.6], [535, 600, 4.8], [874, 390, 4.8], [1360, 845, 4.8]]
  for (const [i, [px, pz, w]] of storage.entries()) root.add(container(`Equipment container ${i + 1}`, ...mapPoint(px, pz), w))
  const props = new Draft('Service yard supplies')
  for (const [px, pz, n] of [[315, 293, 3], [1173, 799, 2], [1199, 838, 3], [783, 571, 2], [604, 757, 2]]) crates(props, ...mapPoint(px, pz), n)
  for (const [px, pz] of [[594, 769], [625, 774], [764, 755], [928, 799]]) {
    const [x, z] = mapPoint(px, pz)
    props.cylinder(0.38, 1.0, x, 0.5, z, 'roof')
    for (const y of [0.2, 0.8]) props.ring(0.385, y, x, z, 'detail', 32)
  }
  const [pipeX, pipeZ] = mapPoint(211, 315)
  props.beam([pipeX, 0.6, pipeZ], [pipeX, 0.6, pipeZ + 37], 0.22, 'paper', 'detail')
  for (let i = 0; i <= 6; i++) props.box(0.55, 0.5, 0.65, pipeX, 0.25, pipeZ + i * 6, 'concrete', 'detail')
  root.add(props.finish())
  for (const [i, [px, pz]] of [[648, 542], [1154, 589], [1356, 651], [763, 839], [335, 612], [395, 337]].entries()) root.add(lamp(`Yard light ${i + 1}`, ...mapPoint(px, pz)))
  root.add(landscaping())
  root.updateMatrixWorld(true)
  return root
}
