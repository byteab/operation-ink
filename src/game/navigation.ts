import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import type { CollisionWorld } from '../player/collision'
import { setDoorOpen } from '../world/doors'
import type { EmitSound } from './types'

export type GridPoint = { x: number; z: number }
const key = (x: number, z: number) => `${x},${z}`
const none: THREE.Object3D[] = []

/** Bounded A*, also used by deterministic obstacle/doorway regression checks. */
export function gridPath(start: GridPoint, goal: GridPoint, traversable: (x: number, z: number) => boolean,
  edge: (a: GridPoint, b: GridPoint) => boolean = () => true, limit = 1800): GridPoint[] {
  return finish(gridPathJob(start, goal, traversable, edge, limit))
}

function finish<T>(job: Generator<void, T>): T {
  let result = job.next()
  while (!result.done) result = job.next()
  return result.value
}

function* gridPathJob(start: GridPoint, goal: GridPoint, traversable: (x: number, z: number) => boolean,
  edge: (a: GridPoint, b: GridPoint) => boolean, limit: number): Generator<void, GridPoint[]> {
  type Node = GridPoint & { g: number; f: number; parent: Node | null }
  const heap: Node[] = []
  const push = (node: Node) => {
    heap.push(node)
    let i = heap.length - 1
    while (i) {
      const parent = (i - 1) >> 1
      if (heap[parent].f <= node.f) break
      heap[i] = heap[parent]; i = parent
    }
    heap[i] = node
  }
  const pop = () => {
    const first = heap[0], end = heap.pop()!
    if (heap.length) {
      let i = 0
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1
        if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child++
        if (heap[child].f >= end.f) break
        heap[i] = heap[child]; i = child
      }
      heap[i] = end
    }
    return first
  }
  const cost = new Map<string, number>([[key(start.x, start.z), 0]])
  push({ ...start, g: 0, f: Math.hypot(goal.x - start.x, goal.z - start.z), parent: null })
  for (let visited = 0; heap.length && visited < limit; visited++) {
    const node = pop()
    if (node.g !== cost.get(key(node.x, node.z))) continue
    if (node.x === goal.x && node.z === goal.z) {
      const route: GridPoint[] = []
      for (let cursor: Node | null = node; cursor; cursor = cursor.parent) route.push({ x: cursor.x, z: cursor.z })
      return route.reverse()
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      yield
      const x = node.x + dx, z = node.z + dz
      const g = node.g + Math.hypot(dx, dz)
      if (g >= (cost.get(key(x, z)) ?? Infinity) || !traversable(x, z)) continue
      // A diagonal cannot cut the corner of a wall, a furnishing or another blocked cell.
      if (dx && dz && (!traversable(node.x + dx, node.z) || !traversable(node.x, node.z + dz))) continue
      if (!edge(node, { x, z })) continue
      cost.set(key(x, z), g)
      push({ x, z, g, f: g + Math.hypot(goal.x - x, goal.z - z), parent: node })
    }
  }
  return []
}

/** A low-resolution shared navigation cache built from the real player collision geometry. */
export class EnemyNavigation {
  private capsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.27)
  private samples = new Map<string, THREE.Vector3 | null>()
  private routes = new Map<string, THREE.Vector3[]>()
  private doorPositions: { door: THREE.Group; position: THREE.Vector3 }[]
  private doorState = ''
  private ignored: THREE.Object3D[] = []
  private operable: boolean[] = []
  private doorRevision = 0
  readonly cellSize = 0.8
  constructor(private world: CollisionWorld, private doors: THREE.Group[], private emit: EmitSound) {
    this.doorPositions = doors.map(door => ({ door, position: door.getWorldPosition(new THREE.Vector3()) }))
  }

  private fits(position: THREE.Vector3, planning: boolean) {
    // A little planning clearance keeps interpolated steps clear of leaf tips.
    this.capsule.radius = planning ? 0.3 : 0.27
    this.capsule.start.copy(position).y += this.capsule.radius
    this.capsule.end.copy(position).y += 1.74 - this.capsule.radius
    // Only a closed, operable leaf can be removed from a planned route. An open
    // leaf is a real obstacle beside the threshold, as are frames and locked doors.
    return this.world.fits(this.capsule, planning ? this.operableLeaves() : none)
  }

  /** Hinges of closed, unlocked doors; rebuilt only when a door's flags change, because every planning probe asks. */
  private operableLeaves() {
    let changed = false
    for (let i = 0; i < this.doors.length; i++) {
      const operable = !this.doors[i].userData.open && !this.doors[i].userData.missionLocked
      if (operable !== this.operable[i]) { this.operable[i] = operable; changed = true }
    }
    if (changed) this.ignored = this.doors.filter((_, i) => this.operable[i]).flatMap(door => door.children.filter(child => child.userData.doorHinge))
    return this.ignored
  }

  private refreshDoorState() {
    const state = this.doors.map(door => `${!!door.userData.open}:${!!door.userData.missionLocked}:${door.children.find(child => child.userData.doorHinge)?.rotation.y}`).join('|')
    if (state !== this.doorState) {
      this.doorState = state
      this.doorRevision++
      this.clear()
    }
    return this.doorRevision
  }

  floor(position: THREE.Vector3, planning = true) {
    // Like PlayerBody, keep the whole foot footprint above a plinth while crossing its edge.
    const height = this.world.floor(position, 0.38, 0.65, 0.29)
    if (!Number.isFinite(height) || Math.abs(height - position.y) > 0.38) return null
    const candidate = new THREE.Vector3(position.x, height + 0.024, position.z)
    return this.fits(candidate, planning) ? candidate : null
  }

  /** Samples the swept capsule, including floor continuity; never authorizes crossing a wall. */
  segment(from: THREE.Vector3, to: THREE.Vector3, planning = true) {
    return finish(this.segmentJob(from, to, planning))
  }

  private *segmentJob(from: THREE.Vector3, to: THREE.Vector3, planning = true): Generator<void, boolean> {
    const distance = Math.hypot(to.x - from.x, to.z - from.z)
    const steps = Math.max(1, Math.ceil(distance / 0.16))
    let y = from.y
    for (let i = 1; i <= steps; i++) {
      yield
      const t = i / steps
      const point = this.floor(new THREE.Vector3(THREE.MathUtils.lerp(from.x, to.x, t), y, THREE.MathUtils.lerp(from.z, to.z, t)), planning)
      if (!point) return false
      y = point.y
    }
    return Math.abs(y - to.y) < 0.45
  }

  plan(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    return finish(this.createPlan(from, to))
  }

  /** A resumable job; the director advances these within a shared per-frame wall-clock budget. */
  *createPlan(from: THREE.Vector3, to: THREE.Vector3): Generator<void, THREE.Vector3[]> {
    // A door can move while this job is yielded, and another guard can then
    // invalidate the shared samples. Restart BEFORE resuming the old search:
    // its accepted cells may now sample as null, including during string-pulling.
    while (true) {
      const revision = this.refreshDoorState()
      const job = this.buildPlan(from, to)
      while (revision === this.refreshDoorState()) {
        const result = job.next()
        if (result.done) return result.value
        yield
      }
    }
  }

  private *buildPlan(from: THREE.Vector3, to: THREE.Vector3): Generator<void, THREE.Vector3[]> {
    from = from.clone(); to = to.clone()
    if (yield* this.segmentJob(from, to)) return [to.clone()]
    const cell = this.cellSize
    const level = Math.round(from.y * 2) / 2
    const sample = (x: number, z: number) => {
      const id = `${x},${z},${level}`
      if (!this.samples.has(id)) this.samples.set(id, this.floor(new THREE.Vector3(x * cell, level, z * cell)))
      return this.samples.get(id) ?? null
    }
    const nearest = function* (this: EnemyNavigation, position: THREE.Vector3): Generator<void, GridPoint | undefined> {
      const x = Math.round(position.x / cell), z = Math.round(position.z / cell)
      const options: GridPoint[] = []
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) options.push({ x: x + dx, z: z + dz })
      options.sort((a, b) => Math.hypot(a.x * cell - position.x, a.z * cell - position.z) - Math.hypot(b.x * cell - position.x, b.z * cell - position.z))
      for (const option of options) {
        yield
        const point = sample(option.x, option.z)
        if (point && (yield* this.segmentJob(position, point))) return option
      }
      return undefined
    }
    const start = yield* nearest.call(this, from), goal = yield* nearest.call(this, to)
    if (!start || !goal) return []
    const routeKey = `${key(start.x, start.z)}:${key(goal.x, goal.z)}:${level}`
    const existing = this.routes.get(routeKey)
    // An empty entry is a search that already exhausted its budget for this door state.
    if (existing) return existing.length ? existing.map(point => point.clone()).concat(to.clone()) : []
    const bounds = { minX: Math.min(start.x, goal.x) - 19, maxX: Math.max(start.x, goal.x) + 19,
      minZ: Math.min(start.z, goal.z) - 19, maxZ: Math.max(start.z, goal.z) + 19 }
    const route = yield* gridPathJob(start, goal, (x, z) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ && !!sample(x, z),
      (a, b) => this.segment(sample(a.x, a.z)!, sample(b.x, b.z)!), 2200)
    if (!route.length) { this.routes.set(routeKey, []); return [] }
    // String-pull only a few cells at a time, keeping all wall/door clearance checks.
    const points: THREE.Vector3[] = []
    for (let i = 0; i < route.length;) {
      points.push(sample(route[i].x, route[i].z)!.clone())
      let next = Math.min(route.length - 1, i + 8)
      while (next > i + 1 && !(yield* this.segmentJob(points[points.length - 1], sample(route[next].x, route[next].z)!))) next--
      if (next === i) break
      i = next
    }
    this.routes.set(routeKey, points.map(point => point.clone()))
    return points.concat(to.clone())
  }

  /** Open a threshold only when the planned direction crosses it; physical clearance still gates movement. */
  prepareDoor(position: THREE.Vector3, next: THREE.Vector3) {
    const segment = new THREE.Line3(position, next)
    for (const entry of this.doorPositions) {
      if (entry.door.userData.missionLocked) continue
      if (Math.hypot(position.x - entry.position.x, position.z - entry.position.z) > 2.2) continue
      const closest = segment.closestPointToPoint(entry.position, true, new THREE.Vector3())
      if (Math.hypot(closest.x - entry.position.x, closest.z - entry.position.z) > 0.85) continue
      if (!entry.door.userData.open) {
        setDoorOpen(entry.door, true)
        this.emit({ kind: 'door', position: entry.position.clone(), radius: 4 })
      }
    }
  }

  /** Resolve only a leaf that swung into a guard; never relocate through static geometry. */
  recoverDoorOverlap(position: THREE.Vector3) {
    const leaves = this.doorPositions.filter(({ door, position: center }) => door.userData.open &&
      Math.abs(center.y - position.y) < 0.5 && Math.hypot(center.x - position.x, center.z - position.z) < door.userData.width + 0.4)
      .flatMap(({ door }) => door.children.filter(child => child.userData.doorHinge))
    if (!leaves.length || this.fits(position, false) || !this.world.fits(this.capsule, leaves)) return null
    this.world.resolve(this.capsule, new THREE.Vector3())
    const resolved = this.capsule.start.clone().add(new THREE.Vector3(0, -this.capsule.radius, 0))
    if (resolved.distanceTo(position) > 0.6) return null
    return this.floor(resolved, false)
  }

  step(position: THREE.Vector3, destination: THREE.Vector3, distance: number) {
    const direction = destination.clone().sub(position).setY(0)
    const travel = Math.min(distance, direction.length())
    if (!travel) return position.clone()
    const next = position.clone().addScaledVector(direction.normalize(), travel)
    this.prepareDoor(position, position.clone().addScaledVector(direction, 1.8))
    return this.floor(next, false)
  }

  clear() { this.samples.clear(); this.routes.clear() }
}
