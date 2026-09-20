import * as THREE from 'three'
import { Draft, type Point } from '../render/ink'
import { interiorRoomOutline, WALL_THICKNESS, wallOutline, type BuildingSpec } from './architecture'
import { createDoor } from './doors'
import { pipe, pipeLadder } from './ladders'

interface Opening { center: number; width: number; bottom: number; height: number; window?: boolean }

/** A segmented wall: doorways and windows are holes, never panels over a solid box. */
function wall(name: string, length: number, height: number, x: number, z: number,
  floor: number, angle = 0, openings: Opening[] = [], cutaway = false) {
  const g = new Draft(name, x, z, angle)
  g.userData.cutaway = cutaway
  g.userData.kind = 'wall'
  g.userData.openings = openings
  g.userData.wallThickness = WALL_THICKNESS
  const stops = [...new Set([-length / 2, length / 2,
    ...openings.flatMap(o => [o.center - o.width / 2, o.center + o.width / 2])])].sort((a, b) => a - b)
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i], center = (a + b) / 2
    const opening = openings.find(o => center > o.center - o.width / 2 && center < o.center + o.width / 2)
    if (!opening) g.box(b - a, height, WALL_THICKNESS, center, floor + height / 2, 0, 'paper', false)
    else {
      if (opening.bottom > 0) g.box(b - a, opening.bottom, WALL_THICKNESS, center, floor + opening.bottom / 2, 0, 'paper', false)
      const upper = height - opening.bottom - opening.height
      if (upper > 0) g.box(b - a, upper, WALL_THICKNESS, center, floor + height - upper / 2, 0, 'paper', false)
    }
  }
  // Outline the wall's boundary and real opening reveals, not the construction
  // boxes: their coplanar joints would create unwanted full-height facade stripes.
  wallOutline(g, length, height, floor, 0, openings.map(o => ({ ...o, centre: o.center })))
  for (const depth of [-WALL_THICKNESS / 2, WALL_THICKNESS / 2]) {
    if (cutaway) g.hatch([-length / 2 + 0.15, floor + height - 0.34, depth + Math.sign(depth) * 0.015],
      [Math.min(length * 0.25, 2.8), 0, 0], [0, 0.24, 0], { spacing: 0.19, inset: 0.025 })
  }
  for (const o of openings.filter(o => o.window)) {
    const glass = new Draft(`${name} · window ${o.center}`)
    glass.userData.kind = 'window'
    // Fill the opening behind the frame so the sill and header leave no exposed gaps.
    glass.box(o.width, o.height, 0.025, o.center, floor + o.bottom + o.height / 2, 0, 'glass', 'detail')
    for (const side of [-1, 1]) glass.hatch([o.center - o.width / 2 + 0.14, floor + o.bottom + 0.12, side * 0.029],
      [o.width * 0.26, 0, 0], [0, o.height * 0.46, 0], { spacing: 0.12, inset: 0.025 })
    for (const u of [o.center - o.width / 2 + 0.035, o.center + o.width / 2 - 0.035, o.center]) {
      glass.box(0.07, o.height, 0.16, u, floor + o.bottom + o.height / 2, 0, 'paper', 'detail')
    }
    for (const y of [floor + o.bottom, floor + o.bottom + o.height]) {
      glass.box(o.width + 0.12, 0.075, 0.3, o.center, y, 0, 'paper', 'detail')
    }
    g.add(glass.finish())
  }
  return g.finish()
}

function chair(name: string, x: number, z: number, floor: number, angle = 0) {
  const g = new Draft(name, x, z, angle)
  g.userData.kind = 'chair'
  g.box(0.6, 0.1, 0.6, 0, floor + 0.48, 0, 'green', 'detail')
  for (const sx of [-0.24, 0.24]) for (const sz of [-0.24, 0.24]) {
    g.box(0.055, 0.44, 0.055, sx, floor + 0.22, sz, 'paper', 'detail')
  }
  for (const sx of [-0.24, 0.24]) g.box(0.055, 0.54, 0.055, sx, floor + 0.78, -0.25, 'paper', 'detail')
  g.box(0.6, 0.32, 0.09, 0, floor + 0.88, -0.25, 'green', 'detail')
  return g.finish()
}

function diningTable(index: number, x: number, z: number, floor: number) {
  const g = new Draft(`Mess hall · dining table ${index}`, x, z)
  g.userData.kind = 'dining-table'
  g.box(2.65, 0.12, 1.3, 0, floor + 0.78, 0, 'roof', 'detail')
  for (const sx of [-1.12, 1.12]) for (const sz of [-0.48, 0.48]) {
    g.box(0.07, 0.72, 0.07, sx, floor + 0.36, sz, 'paper', 'detail')
  }
  // Field trays and mugs give the otherwise quiet furnishings a military mess character.
  for (const sx of [-0.76, 0.76]) {
    g.box(0.46, 0.035, 0.3, sx, floor + 0.86, 0.22, 'concrete', 'detail')
    g.cylinder(0.065, 0.12, sx + 0.28, floor + 0.92, -0.12, 'paper')
  }
  for (const [seat, sx, sz] of [[1, -0.76, -1.15], [2, 0.76, -1.15], [3, -0.76, 1.15], [4, 0.76, 1.15]]) {
    g.add(chair(`Dining table ${index} · chair ${seat}`, sx, sz, floor, sz > 0 ? Math.PI : 0))
  }
  return g.finish()
}

function workstation(index: number, x: number, z: number, floor: number) {
  const station = new THREE.Group()
  station.name = `Signals office · workstation ${index}`
  station.position.set(x, 0, z)
  // A workstation faces west; the chair has an unobstructed approach from the office door.
  station.rotation.y = Math.PI / 2
  station.userData.kind = 'workstation'
  const desk = new Draft(`Signals office · desk ${index}`)
  desk.userData.kind = 'desk'
  desk.box(2, 0.12, 0.95, 0, floor + 0.8, 0, 'roof', 'detail')
  desk.box(0.43, 0.72, 0.78, -0.67, floor + 0.36, 0, 'concrete', 'detail')
  for (const y of [0.27, 0.5]) desk.line([[-0.86, floor + y, 0.397], [-0.48, floor + y, 0.397]], 'detail')
  for (const sz of [-0.36, 0.36]) desk.box(0.07, 0.74, 0.07, 0.83, floor + 0.37, sz, 'paper', 'detail')
  desk.box(0.62, 0.04, 0.22, 0.05, floor + 0.88, 0.2, 'concrete', 'detail')
  for (let row = 0; row < 3; row++) desk.line([[-0.2, floor + 0.902, 0.14 + row * 0.06], [0.3, floor + 0.902, 0.14 + row * 0.06]], 'mesh')
  desk.box(0.11, 0.05, 0.17, 0.58, floor + 0.89, 0.18, 'paper', 'detail')
  const monitor = new Draft(`Signals office · monitor ${index}`)
  monitor.userData.kind = 'monitor'
  monitor.box(0.3, 0.035, 0.22, 0, floor + 0.89, -0.22, 'concrete', 'detail')
  monitor.box(0.055, 0.2, 0.06, 0, floor + 1, -0.22, 'paper', 'detail')
  monitor.box(0.94, 0.57, 0.075, 0, floor + 1.33, -0.25, 'paper', 'detail')
  monitor.box(0.84, 0.46, 0.008, 0, floor + 1.33, -0.207, 'glass', 'detail')
  if (index === 1) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.44),
      new THREE.MeshBasicMaterial({ color: 0x146bff, toneMapped: false }))
    screen.name = 'Signals office · powered surveillance screen'
    screen.position.set(0, floor + 1.33, -0.201)
    screen.userData.noCollision = true
    monitor.add(screen)
    monitor.userData.cameraTerminal = true
    monitor.userData.interactionPoint = [0, floor + 1.33, -0.18]
  } else {
    monitor.line([[-0.34, floor + 1.44, -0.2], [-0.18, floor + 1.44, -0.2], [-0.18, floor + 1.25, -0.2], [0.3, floor + 1.25, -0.2]], 'landscape')
  }
  const desktop = new Draft(`Signals office · desktop computer ${index}`)
  desktop.userData.kind = 'desktop-computer'
  desktop.box(0.27, 0.53, 0.5, 0.63, floor + 0.29, -0.02, 'concrete', 'detail')
  desktop.box(0.18, 0.045, 0.018, 0.63, floor + 0.44, 0.242, 'paper', 'detail')
  for (const y of [0.12, 0.17, 0.22]) desktop.line([[0.54, floor + y, 0.245], [0.72, floor + y, 0.245]], 'mesh')
  station.add(desk.finish(), monitor.finish(), desktop.finish(),
    chair(`Signals office · chair ${index}`, index === 1 ? 1.1 : 0, index === 1 ? 1.35 : 1.05, floor, Math.PI))
  return station
}

function vendingMachine(x: number, z: number, floor: number) {
  const g = new Draft('Mess hall · single ration vending machine', x, z, -Math.PI / 2)
  g.userData.kind = 'vending-machine'
  g.box(1.35, 2.12, 0.85, 0, floor + 1.06, 0, 'green')
  g.box(0.88, 1.24, 0.03, -0.14, floor + 1.32, 0.446, 'glass', 'detail')
  for (let row = 0; row < 3; row++) {
    const y = floor + 0.85 + row * 0.34
    g.box(0.79, 0.045, 0.075, -0.14, y, 0.47, 'paper', 'detail')
    for (let col = 0; col < 3; col++) g.box(0.16, 0.23, 0.025, -0.4 + col * 0.27, y + 0.14, 0.47, 'concrete', 'detail')
  }
  g.box(0.16, 0.19, 0.03, 0.49, floor + 1.55, 0.46, 'glass', 'detail')
  for (let row = 0; row < 3; row++) for (const x of [0.445, 0.535]) {
    g.box(0.055, 0.055, 0.035, x, floor + 1.34 - row * 0.12, 0.46, 'paper', 'detail')
  }
  g.box(0.94, 0.27, 0.035, -0.08, floor + 0.35, 0.448, 'concrete', 'detail')
  return g.finish()
}

/** Starting building: roof arrival, traversable rooms and a ground-level yard exit. */
export function messHall(spec: BuildingSpec): THREE.Group {
  const { width: w, depth: d, height: h } = spec
  const floor = 0.28, eave = floor + h, roofY = eave + 0.3
  const halfW = w / 2, halfD = d / 2
  const exitX = 0, exitWidth = 1.8, exitHeight = 2.5
  const g = new THREE.Group()
  g.name = spec.name
  g.position.set(spec.x, 0, spec.z)
  g.rotation.y = spec.angle ?? 0
  g.userData = {
    environment: true, kind: 'mess-hall', footprint: [w, d], floor, roofHeight: roofY,
    accessible: true, flatRoof: true, roofWalkable: true, access: 'roof-and-yard', groundEntrances: 1,
    rooms: [
      { name: 'Main mess hall', kind: 'restaurant', min: [-7.28, floor, -halfD + 0.12], max: [6.48, eave, halfD - 0.12] },
      { name: 'Signals office', kind: 'office', min: [-halfW + 0.12, floor, -3.88], max: [-7.52, eave, 3.88], workstations: 2 },
      { name: 'Entry vestibule', kind: 'vestibule', min: [6.72, floor, -halfD + 0.12], max: [halfW - 0.12, eave, -7.1] },
    ],
    route: ['West exterior ladder', 'Flat roof', 'Rooftop access door', 'Interior stairs', 'Entry vestibule', 'Vestibule to mess hall door', 'Main mess hall', 'Mess hall yard exit', 'Compound yard'],
    inspection: { ladder: [-halfW - 0.59, floor + 1.7, -4.7], roof: [0, roofY + 1.7, 6], hall: [0, floor + 1.7, 5], office: [-9, floor + 1.7, 0], vestibule: [11.5, floor + 1.7, -8.6] },
  }

  const foundation = new Draft('Mess hall · continuous interior floor')
  foundation.userData.kind = 'interior-floor'
  foundation.box(w + 0.3, floor, d + 0.3, 0, floor / 2, 0, 'concrete', 'detail')
  g.add(foundation.finish())
  const windowOpening = (center: number): Opening => ({ center, width: 1.7, bottom: 1.4, height: 1.45, window: true })
  const roomCorners = new Draft('Mess hall · interior wall and ceiling corners')
  roomCorners.userData.cutaway = true
  interiorRoomOutline(roomCorners, w - WALL_THICKNESS, d - WALL_THICKNESS, floor, eave)
  g.add(roomCorners.finish())
  g.add(
    wall('Mess hall · south exterior wall', w, h, 0, halfD, floor, 0,
      [...[-10.2, -5.2, 4.8, 10.2].map(windowOpening),
        { center: exitX, width: exitWidth, bottom: 0, height: exitHeight }], true),
    wall('Mess hall · north exterior wall', w, h, 0, -halfD, floor, 0, [-10.2, -3.6, 3.5, 10.2].map(windowOpening), true),
    wall('Mess hall · west exterior wall', d, h, -halfW, 0, floor, Math.PI / 2, [-7.4, 6.8].map(windowOpening), true),
    wall('Mess hall · east exterior wall', d, h, halfW, 0, floor, Math.PI / 2,
      [-7.4, 2.4].map(windowOpening), true),
  )

  // The central aisle leads south, beyond the service fence, into the compound.
  // The leaf swings outward over a landing flush with the interior floor.
  g.add(createDoor({ name: 'Mess hall yard exit', x: exitX, z: halfD, floor,
    width: exitWidth, height: exitHeight }))
  const exitLanding = new Draft('Mess hall · yard exit landing')
  exitLanding.box(2.4, floor, 2.1, exitX, floor / 2, halfD + 1.05, 'concrete')
  g.add(exitLanding.finish())

  // Letter strokes keep the EXIT plaques in the scene's untextured ink style.
  const exitLetters: [number, number][][] = [
    [[-0.31, 0.13], [-0.51, 0.13], [-0.51, -0.13], [-0.31, -0.13]],
    [[-0.51, 0], [-0.34, 0]],
    [[-0.23, 0.13], [-0.03, -0.13]], [[-0.23, -0.13], [-0.03, 0.13]],
    [[0.05, 0.13], [0.25, 0.13]], [[0.15, 0.13], [0.15, -0.13]], [[0.05, -0.13], [0.25, -0.13]],
    [[0.33, 0.13], [0.53, 0.13]], [[0.43, 0.13], [0.43, -0.13]],
  ]
  for (const side of [-1, 1]) {
    const sign = new Draft(`Mess hall · ${side < 0 ? 'interior' : 'exterior'} EXIT sign`,
      exitX, halfD + side * 0.145, side < 0 ? Math.PI : 0)
    sign.userData.cutaway = true
    const y = floor + exitHeight + 0.42
    sign.box(1.35, 0.5, 0.03, 0, y, 0, 'green', 'detail')
    for (const stroke of exitLetters) sign.line(stroke.map(([x, dy]): Point => [x, y + dy, 0.025]))
    g.add(sign.finish())
  }

  // The left-hand office is a real enclosed room, with its door in the hall-facing wall.
  const officeWallX = -7.4, officeWidth = halfW + officeWallX
  g.add(
    wall('Signals office · east partition', 8, h, officeWallX, 0, floor, Math.PI / 2,
      [{ center: 0, width: 1.4, bottom: 0, height: 2.4 }]),
    wall('Signals office · north partition', officeWidth, h, (-halfW + officeWallX) / 2, -4, floor),
    wall('Signals office · south partition', officeWidth, h, (-halfW + officeWallX) / 2, 4, floor),
    createDoor({ name: 'Signals office door', x: officeWallX, z: 0, floor, width: 1.4, height: 2.4, angle: Math.PI / 2 }),
    workstation(1, -halfW + 1.05, -2.2, floor),
    workstation(2, -halfW + 1.05, 2.2, floor),
  )
  const office = new Draft('Signals office · filing cabinet and briefing board')
  office.box(1.25, 1.4, 0.6, -8.4, floor + 0.7, -3.4, 'green', 'detail')
  for (const y of [0.28, 0.64, 1]) {
    office.line([[-8.99, floor + y, -3.088], [-7.81, floor + y, -3.088]], 'detail')
    office.box(0.22, 0.045, 0.035, -8.4, floor + y + 0.15, -3.073, 'paper', 'detail')
  }
  office.box(2.25, 1.25, 0.06, -10.9, floor + 1.95, -3.84, 'green', 'detail')
  for (const sx of [-11.5, -10.8, -10.2]) office.box(0.42, 0.56, 0.015, sx, floor + 1.95, -3.80, 'paper', 'detail')
  g.add(office.finish())

  // Ground arrival room and isolated stair lane. The vestibule door opens into a clear hall aisle.
  g.add(
    wall('Mess hall · stair annex partition', halfD + 3.2, h, 6.6, (3.2 - halfD) / 2, floor, Math.PI / 2,
      [{ center: (3.2 - halfD) / 2 + 8.25, width: 1.6, bottom: 0, height: 2.5 }]),
    wall('Mess hall · stair annex south partition', halfW - 6.6, h, (halfW + 6.6) / 2, 3.2, floor),
    createDoor({ name: 'Vestibule to mess hall door', x: 6.6, z: -8.25, floor, width: 1.6, height: 2.5, angle: -Math.PI / 2 }),
  )
  const stairX = 9.2, stairWidth = 2.2, stairStart = -7.0, stairRun = 9.3, count = 31
  const stairEnd = stairStart + stairRun, tread = stairRun / count, rise = (roofY - floor) / count
  const stairs = new Draft('Mess hall · solid roof access staircase')
  stairs.userData = { environment: true, kind: 'stairs', walkable: true, width: stairWidth, stepCount: count,
    rise, tread, bottom: [stairX, floor, stairStart], top: [stairX, roofY, stairEnd], minimumHeadroom: 2.35 }
  for (let i = 0; i < count; i++) {
    const stepHeight = rise * (i + 1), z = stairStart + (i + 0.5) * tread
    stairs.box(stairWidth, stepHeight, tread, stairX, floor + stepHeight / 2, z, 'concrete', false)
    stairs.line([[stairX - stairWidth / 2, floor + stepHeight, stairStart + i * tread],
      [stairX + stairWidth / 2, floor + stepHeight, stairStart + i * tread]], 'detail')
  }
  // The solid steps share coplanar side faces. Trace only the real perimeter,
  // so construction joints never turn the staircase sides into vertical stripes.
  for (const x of [stairX - stairWidth / 2, stairX + stairWidth / 2]) {
    const profile: Point[] = [[x, floor, stairStart]]
    for (let i = 0; i < count; i++) {
      const y = floor + (i + 1) * rise
      profile.push([x, y, stairStart + i * tread], [x, y, stairStart + (i + 1) * tread])
    }
    profile.push([x, floor, stairEnd])
    stairs.line(profile, 'detail', true)
  }
  stairs.line([[stairX - stairWidth / 2, floor, stairStart], [stairX + stairWidth / 2, floor, stairStart]], 'detail')
  stairs.line([[stairX - stairWidth / 2, roofY, stairEnd], [stairX + stairWidth / 2, roofY, stairEnd]], 'detail')
  for (const x of [stairX - stairWidth / 2 - 0.055, stairX + stairWidth / 2 + 0.055]) {
    for (let i = 0; i <= count; i += 3) {
      const stepY = floor + Math.min(count, i + 1) * rise, z = stairStart + Math.min(count, i + 0.5) * tread
      stairs.beam([x, stepY, z], [x, stepY + 1, z], 0.065, 'paper', 'detail')
    }
    stairs.beam([x, floor + rise + 1, stairStart + tread / 2], [x, roofY + 1, stairEnd - tread / 2], 0.075)
  }
  g.add(stairs.finish())
  const vestibuleProps = new Draft('Mess hall · vestibule duty lockers')
  for (let i = 0; i < 2; i++) {
    const x = 12 + i * 0.7
    vestibuleProps.box(0.62, 1.9, 0.55, x, floor + 0.95, -halfD + 0.55, 'green', 'detail')
    vestibuleProps.box(0.06, 0.2, 0.03, x + 0.19, floor + 1.02, -halfD + 0.841, 'paper', 'detail')
    for (const y of [1.55, 1.66]) vestibuleProps.line([[x - 0.2, floor + y, -halfD + 0.831], [x + 0.2, floor + y, -halfD + 0.831]], 'mesh')
  }
  g.add(vestibuleProps.finish())

  let tableIndex = 0
  for (const z of [-4.1, 1.25, 6.6]) for (const x of [-3.8, 2.3]) g.add(diningTable(++tableIndex, x, z, floor))
  g.add(vendingMachine(halfW - 0.65, 7, floor))
  const service = new Draft('Mess hall · field kitchen serving counter and supplies')
  service.userData.kind = 'mess-service-counter'
  service.box(8.4, 0.88, 0.95, -0.5, floor + 0.44, -8.6, 'green', 'detail')
  service.box(8.65, 0.11, 1.15, -0.5, floor + 0.935, -8.6, 'paper', 'detail')
  for (const x of [-3.6, -2.2, -0.8]) {
    service.box(0.9, 0.09, 0.64, x, floor + 1.02, -8.6, 'concrete', 'detail')
    service.box(0.79, 0.045, 0.53, x, floor + 1.08, -8.6, 'roof', 'detail')
  }
  for (const x of [1.8, 2.7]) {
    service.cylinder(0.22, 0.6, x, floor + 1.29, -8.65, 'paper')
    service.box(0.08, 0.07, 0.13, x, floor + 1.15, -8.38, 'paper', 'detail')
  }
  service.box(2.3, 1.7, 0.58, -10.5, floor + 0.85, -9.9, 'roof', 'detail')
  for (const x of [-11.05, -9.95]) service.line([[x, floor + 0.12, -9.6], [x, floor + 1.58, -9.6]], 'detail')
  g.add(service.finish())

  // Four separate slabs leave an actual aperture over the upper flight. At the north
  // edge of this aperture, clearance over the last covered tread exceeds 2.35 metres.
  const hole = { minX: 7.82, maxX: 10.58, minZ: -2.15, maxZ: stairEnd }
  const roof = new Draft('Mess hall · flat walkable roof and parapet')
  roof.userData = { environment: true, kind: 'flat-roof', cutaway: true, walkable: true,
    walkingHeight: roofY, thickness: 0.3, stairwellOpening: hole, parapetHeight: 0.9, ladderGapWidth: 1.6 }
  const slab = (a: number, b: number, c: number, e: number) => roof.box(b - a, 0.3, e - c, (a + b) / 2, roofY - 0.15, (c + e) / 2, 'roof')
  slab(-halfW - 0.12, hole.minX, -halfD - 0.12, halfD + 0.12)
  slab(hole.maxX, halfW + 0.12, -halfD - 0.12, halfD + 0.12)
  slab(hole.minX, hole.maxX, -halfD - 0.12, hole.minZ)
  slab(hole.minX, hole.maxX, hole.maxZ, halfD + 0.12)
  for (const z of [-halfD, halfD]) roof.box(w + 0.3, 0.9, 0.24, 0, roofY + 0.45, z, 'paper')
  roof.box(0.24, 0.9, d, halfW, roofY + 0.45, 0, 'paper')
  // The west facade faces the entrance drive. Keep the ladder north of the
  // service crossfence at z=-1.35 and clear of the window ending at z=-5.95.
  const ladderZ = -4.7, gap = 1.6
  for (const [a, b] of [[-halfD, ladderZ - gap / 2], [ladderZ + gap / 2, halfD]]) {
    roof.box(0.24, 0.9, b - a, -halfW, roofY + 0.45, (a + b) / 2, 'paper')
  }
  // Restrained expansion joints read as concrete roof, while the broad route stays clear.
  for (const x of [-7, 0]) roof.line([[x, roofY + 0.014, -halfD + 0.2], [x, roofY + 0.014, halfD - 0.2]], 'mesh')
  roof.line([[-halfW + 0.2, roofY + 0.014, 0], [7.45, roofY + 0.014, 0]], 'mesh')
  for (const [x, z, width, depth] of [[-halfW + 0.25, -halfD + 0.4, 3.7, 1.3],
    [-3.8, halfD - 1.4, 2.6, 0.95], [2.5, -halfD + 0.3, 2.2, 0.8]]) {
    roof.hatch([x, roofY + 0.018, z], [width, 0, 0], [0, 0, depth], { spacing: 0.23, inset: 0.04 })
  }
  roof.hatch([-halfW + 0.3, roofY + 0.18, halfD - 0.137], [3, 0, 0], [0, 0.49, 0],
    { spacing: 0.18, inset: 0.035 })
  g.add(roof.finish())

  const headhouse = new THREE.Group()
  headhouse.name = 'Mess hall · rooftop stair access enclosure'
  headhouse.userData = { kind: 'roof-entry', cutaway: true, doorLandingDepth: 1.92 }
  const hutMinX = 7.56, hutMaxX = 10.84, hutMinZ = -2.4, hutMaxZ = 4.55, hutH = 2.75
  const hutX = (hutMinX + hutMaxX) / 2, hutZ = (hutMinZ + hutMaxZ) / 2
  headhouse.add(
    wall('Rooftop stair enclosure · west wall', hutMaxZ - hutMinZ, hutH, hutMinX, hutZ, roofY, Math.PI / 2),
    wall('Rooftop stair enclosure · east wall', hutMaxZ - hutMinZ, hutH, hutMaxX, hutZ, roofY, Math.PI / 2),
    wall('Rooftop stair enclosure · north wall', hutMaxX - hutMinX, hutH, hutX, hutMinZ, roofY),
    wall('Rooftop stair enclosure · doorway', hutMaxX - hutMinX, hutH, hutX, hutMaxZ, roofY, 0,
      [{ center: 0, width: 1.5, bottom: 0, height: 2.4 }]),
    createDoor({ name: 'Rooftop access door', x: hutX, z: hutMaxZ, floor: roofY, width: 1.5, height: 2.4 }),
  )
  const hutRoof = new Draft('Rooftop stair enclosure · cap')
  hutRoof.box(hutMaxX - hutMinX + 0.25, 0.18, hutMaxZ - hutMinZ + 0.25, hutX, roofY + hutH + 0.09, hutZ, 'roof')
  hutRoof.hatch([hutMinX + 0.05, roofY + hutH + 0.196, hutMinZ + 0.15], [1.15, 0, 0], [0, 0, 1.8],
    { spacing: 0.18, inset: 0.035 })
  headhouse.add(hutRoof.finish())
  g.add(headhouse)

  const ladderX = -halfW - 0.59, ladderWidth = 0.95, bottomY = 0.14
  const ladder = pipeLadder({ name: 'Mess hall · west exterior roof ladder', x: ladderX, z: ladderZ,
    angle: -Math.PI / 2, bottom: bottomY, landingHeight: roofY, width: ladderWidth, landingDepth: 0.99 })
  Object.assign(ladder.userData, { wallStandoff: 0.47, side: 'west',
    bottom: [ladderX, bottomY, ladderZ], top: [ladderX, roofY, ladderZ] })
  const mounts = new Draft('Mess hall · round ladder wall mounts')
  mounts.userData = { kind: 'ladder-mounts', crossSection: 'circular', diameter: 0.065 }
  for (const side of [-1, 1]) for (const y of [0.7, 2.6, 4.5, roofY - 0.35]) {
    pipe(mounts, [side * ladderWidth / 2, y, 0], [side * ladderWidth / 2, y, -0.46], 0.065)
  }
  ladder.add(mounts.finish())
  // The final rung is below this plate; its surface joins the roof through the parapet gap.
  ladder.box(1.26, 0.12, 0.84, 0, roofY - 0.06, -0.42, 'concrete')
  g.add(ladder.finish())
  return g
}
