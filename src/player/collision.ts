import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { Octree } from 'three/addons/math/Octree.js'

type Collider = {
  mesh: THREE.Mesh
  bounds: THREE.Box3
  inverse: THREE.Matrix4
  tree?: Octree
  dynamic: boolean
  blocksSight: boolean
  blocksShots: boolean
}

const up = new THREE.Vector3(0, 1, 0)

/** Partition triangles without duplicating large coplanar slabs into many octants. */
function collisionTree(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position'), index = geometry.index
  const triangles: THREE.Triangle[] = []
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const vertices = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i + offset) : i + offset))
    const triangle = new THREE.Triangle(vertices[0], vertices[1], vertices[2])
    if (triangle.getArea() > 1e-10) triangles.push(triangle)
  }
  const build = (faces: THREE.Triangle[]): Octree => {
    const box = new THREE.Box3()
    for (const face of faces) box.expandByPoint(face.a).expandByPoint(face.b).expandByPoint(face.c)
    box.expandByScalar(0.00001)
    const tree = new Octree(box)
    if (faces.length <= 24) tree.triangles = faces
    else {
      const size = box.getSize(new THREE.Vector3())
      const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z'
      faces.sort((a, b) => (a.a[axis] + a.b[axis] + a.c[axis]) - (b.a[axis] + b.b[axis] + b.c[axis]))
      const middle = Math.floor(faces.length / 2)
      tree.subTrees = [build(faces.slice(0, middle)), build(faces.slice(middle))]
    }
    return tree
  }
  const root = new Octree()
  root.subTrees = [build(triangles)]
  return root
}

/** Local-space trees are built only for nearby meshes. Door trees move with their hinges. */
export class CollisionWorld {
  private colliders: Collider[] = []
  private proxies: THREE.Mesh[] = []
  private capsule = new Capsule()
  private bounds = new THREE.Box3()
  private offset = new THREE.Vector3()
  private ray = new THREE.Raycaster()
  private groundRay = new THREE.Ray()
  private normal = new THREE.Vector3()
  private spatialRays = false
  private rayCandidates: THREE.Triangle[] = []
  private rayPoint = new THREE.Vector3()

  constructor(scene: THREE.Object3D) {
    scene.updateWorldMatrix(true, true)
    scene.traverse(object => {
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
        if (parent.userData.noCollision) return
      }
      if (object instanceof THREE.Mesh && !(object.material instanceof THREE.ShaderMaterial)) {
        let dynamic = false
        for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
          if (parent.userData.doorHinge) dynamic = true
        }
        this.add(object, dynamic, object.userData.blocksSight !== false, object.userData.blocksShots !== false)
      }
      for (const panel of object.userData.collisionPanels ?? []) {
        const [ax, az] = panel.a, [bx, bz] = panel.b
        const geometry = new THREE.BoxGeometry(Math.hypot(bx - ax, bz - az), panel.height, 0.06)
        geometry.rotateY(-Math.atan2(bz - az, bx - ax))
        geometry.translate((ax + bx) / 2, panel.height / 2, (az + bz) / 2)
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
        mesh.matrixAutoUpdate = false
        mesh.matrixWorld.copy(object.matrixWorld)
        this.proxies.push(mesh)
        this.add(mesh, false, panel.blocksSight !== false, panel.blocksShots !== false)
      }
    })
  }

  private add(mesh: THREE.Mesh, dynamic: boolean, blocksSight = true, blocksShots = true) {
    mesh.geometry.computeBoundingBox()
    this.colliders.push({ mesh, dynamic, blocksSight, blocksShots,
      bounds: mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld),
      inverse: mesh.matrixWorld.clone().invert() })
  }

  refresh() {
    for (const collider of this.colliders) if (collider.dynamic) {
      collider.mesh.updateWorldMatrix(true, false)
      collider.bounds.copy(collider.mesh.geometry.boundingBox!).applyMatrix4(collider.mesh.matrixWorld)
      collider.inverse.copy(collider.mesh.matrixWorld).invert()
    }
  }

  private tree(collider: Collider) {
    return collider.tree ??= collisionTree(collider.mesh.geometry)
  }

  private collision(collider: Collider, capsule: Capsule) {
    this.capsule.copy(capsule)
    this.capsule.start.applyMatrix4(collider.inverse)
    this.capsule.end.applyMatrix4(collider.inverse)
    const hit = this.tree(collider).capsuleIntersect(this.capsule)
    if (!hit || hit.depth < 0.00001) return null
    hit.normal.transformDirection(collider.mesh.matrixWorld)
    return hit
  }

  private capsuleBounds(capsule: Capsule) {
    this.bounds.set(capsule.start, capsule.end).expandByScalar(capsule.radius)
    return this.bounds
  }

  fits(capsule: Capsule, ignored: readonly THREE.Object3D[] = []) {
    const bounds = this.capsuleBounds(capsule)
    for (const collider of this.colliders) if (bounds.intersectsBox(collider.bounds)) {
      let skip = false
      for (let object: THREE.Object3D | null = collider.mesh; object; object = object.parent) {
        if (ignored.includes(object)) { skip = true; break }
      }
      if (skip) continue
      const hit = this.collision(collider, capsule)
      if (hit && hit.depth > 0.008) return false
    }
    return true
  }

  resolve(capsule: Capsule, velocity: THREE.Vector3) {
    let grounded = false
    for (let pass = 0; pass < 3; pass++) {
      let touched = false
      for (const collider of this.colliders) {
        if (!this.capsuleBounds(capsule).intersectsBox(collider.bounds)) continue
        const hit = this.collision(collider, capsule)
        if (!hit) continue
        touched = true
        if (hit.normal.y > 0.55) grounded = true
        capsule.translate(this.offset.copy(hit.normal).multiplyScalar(hit.depth + 0.00001))
        const intoSurface = velocity.dot(hit.normal)
        if (intoSurface < 0) velocity.addScaledVector(hit.normal, -intoSurface)
      }
      if (!touched) break
    }
    return grounded
  }

  /** Small support footprint handles stair treads and the edges of platforms. */
  floor(position: THREE.Vector3, above: number, below: number, radius = 0) {
    let height = -Infinity
    for (const [x, z] of radius ? [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]] : [[0, 0]]) {
      this.ray.ray.origin.set(position.x + x, position.y + above, position.z + z)
      this.ray.ray.direction.set(0, -1, 0)
      this.ray.near = 0
      this.ray.far = above + below
      for (const collider of this.colliders) {
        if (collider.bounds.max.y < this.ray.ray.origin.y - this.ray.far || collider.bounds.min.y > this.ray.ray.origin.y) continue
        if (!this.ray.ray.intersectsBox(collider.bounds)) continue
        this.groundRay.copy(this.ray.ray).applyMatrix4(collider.inverse)
        const hit = this.tree(collider).rayIntersect(this.groundRay)
        if (!hit || hit.distance > this.ray.far) continue
        hit.triangle.getNormal(this.normal).transformDirection(collider.mesh.matrixWorld)
        if (this.normal.dot(up) > 0.55) height = Math.max(height, hit.position.applyMatrix4(collider.mesh.matrixWorld).y)
      }
    }
    return height
  }

  visible(from: THREE.Vector3, to: THREE.Vector3, target: THREE.Object3D) {
    this.ray.ray.origin.copy(from)
    this.ray.ray.direction.copy(to).sub(from).normalize()
    this.ray.near = 0.02
    this.ray.far = Math.max(0.02, from.distanceTo(to) - 0.06)
    for (const collider of this.colliders) {
      if (!collider.blocksSight) continue
      let ignored = false
      for (let object: THREE.Object3D | null = collider.mesh; object; object = object.parent) {
        if (object === target) { ignored = true; break }
      }
      if (!ignored && this.ray.ray.intersectsBox(collider.bounds) && this.ray.intersectObject(collider.mesh, false).length) return false
    }
    return true
  }

  /** Nearest ballistic surface. Wire panels block bodies, but let shots pass. */
  rayDistance(origin: THREE.Vector3, direction: THREE.Vector3, range: number) {
    this.ray.set(origin, direction)
    this.ray.near = 0.01
    this.ray.far = range
    let distance = range
    for (const collider of this.colliders) {
      if (!collider.blocksShots) continue
      if (!this.ray.ray.intersectsBox(collider.bounds)) continue
      if (this.spatialRays && !Array.isArray(collider.mesh.material)) {
        this.groundRay.copy(this.ray.ray).applyMatrix4(collider.inverse)
        this.rayCandidates.length = 0
        this.tree(collider).getRayTriangles(this.groundRay, this.rayCandidates)
        const side = collider.mesh.material.side
        for (const face of this.rayCandidates) {
          const hit = side === THREE.BackSide ? this.groundRay.intersectTriangle(face.c, face.b, face.a, true, this.rayPoint) :
            this.groundRay.intersectTriangle(face.a, face.b, face.c, side !== THREE.DoubleSide, this.rayPoint)
          if (!hit) continue
          const along = hit.applyMatrix4(collider.mesh.matrixWorld).distanceTo(origin)
          if (along >= this.ray.near && along < distance) distance = along
        }
        continue
      }
      const hit = this.ray.intersectObject(collider.mesh, false)[0]
      if (hit && hit.distance < distance) distance = hit.distance
    }
    return distance
  }

  /** A local query view shares geometry/trees, but never owns their resources.
   * Dynamic leaves stay enrolled even outside the region because doors can swing in.
   * Callers must keep their entire query inside bounds; the main world's refresh
   * updates the shared dynamic matrices before any view is used. */
  region(bounds: THREE.Box3) {
    const view = new CollisionWorld(new THREE.Group())
    view.spatialRays = true
    view.colliders = this.colliders.filter(collider => collider.dynamic || bounds.intersectsBox(collider.bounds))
    return view
  }

  dispose() {
    for (const mesh of this.proxies) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.colliders = []
    this.proxies = []
  }
}
