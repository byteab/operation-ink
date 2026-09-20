import * as THREE from 'three'
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js'
import type { CollisionWorld, SurfaceHit } from '../player/collision'
import { penPalette, penRandom } from '../render/ballpoint'
import type { WeaponName } from './types'

const CAPACITY = 128, VERTICES = 384, LIFETIME = 45, FADE = 5
const TILE = 128, COLUMNS = 4, ROWS = 2
const FORWARD = new THREE.Vector3(0, 0, 1)
type Stain = { geometry: number; instance: number; target: THREE.Mesh; age: number }

/** Eight filled ink blots: unequal lobes, liquid fingers and scattered beads. */
function splashAtlas() {
  const width = TILE * COLUMNS, height = TILE * ROWS
  const pixels = new Uint8Array(width * height * 4)
  for (let tile = 0; tile < COLUMNS * ROWS; tile++) {
    const random = penRandom(7919 + tile * 1013)
    const range = (a: number, b: number) => a + random() * (b - a)
    const blob = (x: number, y: number, rx: number, ry = rx, angle = 0) => {
      const reach = Math.max(rx, ry) + 0.025, cos = Math.cos(angle), sin = Math.sin(angle)
      for (let py = Math.max(4, Math.floor((y - reach + 1) * TILE / 2)); py < Math.min(TILE - 4, (y + reach + 1) * TILE / 2); py++) {
        for (let px = Math.max(4, Math.floor((x - reach + 1) * TILE / 2)); px < Math.min(TILE - 4, (x + reach + 1) * TILE / 2); px++) {
          const dx = (px + 0.5) * 2 / TILE - 1 - x, dy = (py + 0.5) * 2 / TILE - 1 - y
          const distance = (Math.hypot((dx * cos + dy * sin) / rx, (-dx * sin + dy * cos) / ry) - 1) * Math.min(rx, ry)
          const alpha = THREE.MathUtils.clamp(0.5 - distance * TILE / 2, 0, 1) * 255
          const i = ((Math.floor(tile / COLUMNS) * TILE + py) * width + tile % COLUMNS * TILE + px) * 4
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 255
          pixels[i + 3] = Math.max(pixels[i + 3], Math.round(alpha))
        }
      }
    }
    blob(0, 0, 0.24, 0.29)
    for (let i = 0; i < 9; i++) {
      const angle = range(0, Math.PI * 2), distance = range(0.12, 0.26)
      blob(Math.cos(angle) * distance, Math.sin(angle) * distance, range(0.09, 0.17), range(0.08, 0.16), angle)
    }
    for (let i = 0; i < 11; i++) {
      const angle = range(0, Math.PI * 2), length = range(0.3, 0.79), bend = range(-0.14, 0.14)
      for (let j = 0; j <= 12; j++) {
        const t = j / 12, distance = 0.14 + t * (length - 0.14)
        const a = angle + bend * t
        blob(Math.cos(a) * distance, Math.sin(a) * distance, 0.045 * (1 - t) + 0.008)
      }
      blob(Math.cos(angle + bend) * (length + 0.08), Math.sin(angle + bend) * (length + 0.08), range(0.014, 0.03))
    }
    for (let i = 0; i < 17; i++) {
      const angle = range(0, Math.PI * 2), distance = range(0.4, 0.88)
      blob(Math.cos(angle) * distance, Math.sin(angle) * distance, range(0.009, 0.024))
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height)
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true
  return texture
}

/** Clipped to real surfaces, attached in object space, bounded and drawn in one batch. */
export class InkSplashes {
  readonly mesh: THREE.BatchedMesh
  private stains: Stain[] = []
  private next = 0
  private serial = 0
  private opacity = new THREE.Vector4(1, 1, 1, 1)

  constructor(scene: THREE.Scene, private world: CollisionWorld) {
    const material = new THREE.MeshBasicMaterial({ color: penPalette.ink, map: splashAtlas(),
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      polygonOffsetUnits: -2, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false })
    this.mesh = new THREE.BatchedMesh(CAPACITY, CAPACITY * VERTICES, 0, material)
    this.mesh.name = 'Persistent surface ink splashes'
    this.mesh.userData.noCollision = true
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    scene.add(this.mesh)
  }

  emit(hit: SurfaceHit, weapon: WeaponName) {
    const serial = this.serial++, random = penRandom(serial * 7919 + 31)()
    const size = (weapon === 'shotgun' ? 0.08 : weapon === 'sniper' ? 0.22 : 0.16) * (0.85 + random * 0.3)
    const rotation = new THREE.Quaternion().setFromUnitVectors(FORWARD, hit.normal)
      .multiply(new THREE.Quaternion().setFromAxisAngle(FORWARD, random * Math.PI * 2))
    const patch = this.world.surfacePatch(hit, size)
    const source = new THREE.Mesh(patch)
    source.matrixWorld.copy(hit.mesh.matrixWorld)
    // Shallow projection cannot bleed onto a wall's reverse face; clipping also
    // keeps scattered droplets on crate edges, curved tanks and narrow props.
    const geometry = new DecalGeometry(source, hit.point, new THREE.Euler().setFromQuaternion(rotation),
      new THREE.Vector3(size, size * (0.9 + penRandom(serial + 811)() * 0.25), Math.min(size * 0.45, 0.22)))
    patch.dispose(); (source.material as THREE.Material).dispose()
    geometry.deleteAttribute('normal')
    const count = geometry.getAttribute('position').count
    if (!count || count > VERTICES) { geometry.dispose(); return }
    geometry.applyMatrix4(hit.mesh.matrixWorld.clone().invert())
    const uv = geometry.getAttribute('uv'), tile = serial % (COLUMNS * ROWS)
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + tile % COLUMNS) / COLUMNS,
      (uv.getY(i) + Math.floor(tile / COLUMNS)) / ROWS)
    const slot = this.next
    let stain = this.stains[slot]
    if (stain) {
      this.mesh.setGeometryAt(stain.geometry, geometry)
      stain.target = hit.mesh; stain.age = 0
    } else {
      const id = this.mesh.addGeometry(geometry, VERTICES)
      stain = { geometry: id, instance: this.mesh.addInstance(id), target: hit.mesh, age: 0 }
      this.stains.push(stain)
    }
    this.mesh.setMatrixAt(stain.instance, hit.mesh.matrixWorld)
    this.mesh.setColorAt(stain.instance, this.opacity.set(1, 1, 1, 1))
    this.mesh.setVisibleAt(stain.instance, true)
    this.next = (slot + 1) % CAPACITY
    geometry.dispose()
  }

  update(dt: number) {
    if (dt <= 0) return
    for (const stain of this.stains) {
      if (stain.age >= LIFETIME) continue
      stain.age += dt
      if (stain.age >= LIFETIME) { this.mesh.setVisibleAt(stain.instance, false); continue }
      stain.target.updateWorldMatrix(true, false)
      this.mesh.setMatrixAt(stain.instance, stain.target.matrixWorld)
      if (stain.age > LIFETIME - FADE) {
        this.mesh.setColorAt(stain.instance, this.opacity.set(1, 1, 1, (LIFETIME - stain.age) / FADE))
      }
    }
  }

  get count() { return this.stains.filter(stain => stain.age < LIFETIME).length }
  clear() {
    for (const stain of this.stains) { stain.age = LIFETIME; this.mesh.setVisibleAt(stain.instance, false) }
    this.next = 0
  }
  dispose() {
    this.clear(); this.mesh.removeFromParent(); this.mesh.dispose()
    const material = this.mesh.material as THREE.MeshBasicMaterial
    material.map!.dispose(); material.dispose()
  }
}
