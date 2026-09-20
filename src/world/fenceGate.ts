import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { Draft, type Point } from '../render/ink'

/** A hinged wire gate with solid frame rails and a moving body-only barrier. */
export function createFenceGate({ name, x, z, width, height = 2.65, angle = 0 }: {
  name: string; x: number; z: number; width: number; height?: number; angle?: number
}) {
  const root = new Group()
  root.name = name
  root.position.set(x, 0, z)
  root.rotation.y = angle
  root.userData = { kind: 'door', style: 'wire-gate', open: false, width, height, interactive: true }
  const posts = new Draft(`${name} · posts`)
  for (const side of [-1, 1]) {
    posts.box(0.26, height + 0.2, 0.26, side * width / 2, (height + 0.2) / 2, 0)
    posts.box(0.4, 0.16, 0.4, side * width / 2, 0.08, 0, 'concrete', 'detail')
  }
  root.add(posts.finish())

  const hinge = new Group()
  hinge.name = `${name} hinge`
  hinge.position.x = -width / 2
  hinge.userData.doorHinge = true
  const leaf = new Draft(`${name} · wire leaf`)
  const left = 0.16, right = width - 0.16, bottom = 0.16, top = height - 0.06
  const point = (u: number, y: number): Point => [u, y, 0]
  const corners: Point[] = [point(left, bottom), point(right, bottom), point(right, top), point(left, top)]
  for (let i = 0; i < corners.length; i++) leaf.beam(corners[i], corners[(i + 1) % corners.length], 0.085, 'roof', 'detail')
  leaf.beam(point(left, bottom), point(right, top), 0.055, 'roof', 'detail')
  // Clip both wire diagonals to the leaf frame, using the same mesh pitch as fences.
  for (const slope of [-1, 1]) for (let intercept = left - (top - bottom); intercept < right + top - bottom; intercept += 0.88) {
    const y0 = Math.max(bottom, bottom + Math.min((left - intercept) / slope, (right - intercept) / slope))
    const y1 = Math.min(top, bottom + Math.max((left - intercept) / slope, (right - intercept) / slope))
    if (y1 > y0) leaf.line([point(intercept + slope * (y0 - bottom), y0),
      point(intercept + slope * (y1 - bottom), y1)], 'mesh')
  }
  leaf.box(0.2, 0.24, 0.12, right - 0.1, 1.15, 0, 'concrete', 'detail')
  hinge.add(leaf.finish())

  // This invisible physical panel moves with the hinge. Wire passes sight and
  // gunfire; the visible frame and latch still provide their actual solid cover.
  const barrier = new Mesh(new BoxGeometry(right - left, height, 0.06),
    new MeshBasicMaterial({ visible: false }))
  barrier.name = `${name} · wire collision`
  barrier.position.set(width / 2, height / 2, 0)
  barrier.userData = { blocksSight: false, blocksShots: false }
  hinge.add(barrier)
  root.add(hinge)
  return root
}
