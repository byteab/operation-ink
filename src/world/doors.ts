import { Group } from 'three'
import { Draft } from '../render/ink'

const swings = new WeakMap<Group, { from: number; target: number; elapsed: number; duration: number }>()

export interface DoorOptions {
  name: string
  x: number
  z: number
  floor: number
  width?: number
  height?: number
  angle?: number
  open?: boolean
  industrial?: boolean
  barred?: boolean
}

/** A separate hinged leaf, mounted in an opening supplied by the building. */
export function createDoor({ name, x, z, floor, width = 1.35, height = 2.35,
  angle = 0, open = false, industrial = false, barred = false }: DoorOptions) {
  const root = new Group()
  root.name = name
  root.position.set(x, floor, z)
  root.rotation.y = angle
  root.userData = { kind: 'door', open, width, height, interactive: true }
  const frame = new Draft(`${name} frame`)
  const frameWidth = 0.05, frameDepth = 0.14, inkOffset = 0.006
  root.userData.frameDepth = frameDepth
  for (const side of [-1, 1]) frame.box(frameWidth, height + frameWidth, frameDepth,
    side * (width / 2 + frameWidth / 2), height / 2, 0, 'roof', 'detail')
  frame.box(width + frameWidth * 2, frameWidth, frameDepth, 0, height + frameWidth / 2, 0, 'roof', 'detail')
  // Trace the aperture on both faces and along its reveals. A contour only on
  // the front trim disappears behind the jamb when viewed from inside or side-on.
  const reveal = width / 2 - inkOffset, top = height - inkOffset
  for (const depth of [-frameDepth / 2 - inkOffset, frameDepth / 2 + inkOffset]) {
    frame.line([[-reveal, 0, depth], [-reveal, top, depth],
      [reveal, top, depth], [reveal, 0, depth]], 'edge')
  }
  for (const x of [-reveal, reveal]) for (const y of [0, top]) {
    frame.line([[x, y, -frameDepth / 2 - inkOffset], [x, y, frameDepth / 2 + inkOffset]], 'detail')
  }
  root.add(frame.finish())

  const hinge = new Group()
  hinge.name = `${name} hinge`
  hinge.position.x = -width / 2
  hinge.userData.doorHinge = true
  const leaf = new Draft(`${name} leaf`)
  if (barred) {
    for (let x = 0.08; x < width; x += 0.18) leaf.box(0.045, height - 0.035, 0.06, x, height / 2, 0, 'roof', 'detail')
    for (const y of [0.08, 1.05, height - 0.08]) leaf.box(width - 0.045, 0.07, 0.075, width / 2, y, 0, 'roof', 'detail')
    leaf.box(0.23, 0.24, 0.1, width - 0.22, 1.05, 0, 'concrete', 'detail')
  } else leaf.box(width - 0.045, height - 0.035, 0.085, width / 2, height / 2, 0, 'roof')
  for (const side of barred ? [] : [-1, 1]) {
    const z = side * 0.055
    leaf.line([[0.12, 0.16, z], [width - 0.12, 0.16, z],
      [width - 0.12, height - 0.16, z], [0.12, height - 0.16, z]], 'detail', true)
    leaf.hatch([0.16, 0.2, side * 0.061], [Math.min(width * 0.27, 0.48), 0, 0], [0, 0.6, 0],
      { spacing: 0.095, inset: 0.025 })
    leaf.beam([width - 0.3, 1.05, side * 0.11], [width - 0.13, 1.05, side * 0.11], 0.045, 'paper', 'detail')
    if (industrial) for (const y of [0.55, height - 0.55]) {
      leaf.box(width - 0.15, 0.055, 0.035, width / 2, y, z, 'concrete', 'detail')
    }
  }
  for (const y of [0.3, height - 0.3]) leaf.box(0.09, 0.16, 0.14, 0.025, y, 0, 'paper', 'detail')
  hinge.add(leaf.finish())
  hinge.rotation.y = open ? -Math.PI / 2 : 0
  root.add(hinge)
  return root
}

export function setDoorOpen(door: Group, open: boolean, instant = false) {
  door.userData.open = open
  if (instant) {
    swings.delete(door)
    const hinge = door.children.find(child => child.userData.doorHinge)
    if (hinge) hinge.rotation.y = open ? -Math.PI / 2 : 0
  }
}

export function isDoorFullyOpen(door: Group) {
  const hinge = door.children.find(child => child.userData.doorHinge)
  return Boolean(door.userData.open && hinge && Math.abs(hinge.rotation.y + Math.PI / 2) < 0.000001)
}

export function updateDoors(doors: Group[], dt: number, reducedMotion = false) {
  let moving = false
  for (const door of doors) {
    const hinge = door.children.find(child => child.userData.doorHinge)
    if (!hinge) continue
    const target = door.userData.open ? -Math.PI / 2 : 0
    const distance = target - hinge.rotation.y
    if (door.userData.swingSeconds > 0) {
      let swing = swings.get(door)
      if (!swing || swing.target !== target) {
        if (Math.abs(distance) < 0.000001) { hinge.rotation.y = target; swings.delete(door); continue }
        swing = { from: hinge.rotation.y, target, elapsed: 0,
          duration: door.userData.swingSeconds * Math.abs(distance) / (Math.PI / 2) }
        swings.set(door, swing)
      }
      swing.elapsed = Math.min(swing.duration, swing.elapsed + Math.max(0, dt))
      const t = swing.elapsed / swing.duration
      // Physical gate travel keeps its duration with Reduced Motion too.
      const eased = t * t * (3 - 2 * t)
      hinge.rotation.y = swing.from + (target - swing.from) * eased
      if (t === 1) swings.delete(door)
      moving = true
      continue
    }
    if (Math.abs(distance) < 0.001) { hinge.rotation.y = target; continue }
    hinge.rotation.y += reducedMotion ? distance : distance * (1 - Math.exp(-16 * dt))
    moving = true
  }
  return moving
}
