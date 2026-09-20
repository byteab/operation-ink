import * as THREE from 'three'
import { penPalette } from '../render/ballpoint'
import { followSurface, type CollisionWorld, type SurfaceHit } from '../player/collision'
import type { WeaponName } from './types'
import { InkSplashes } from './ink-splashes'

type Chip = { position: THREE.Vector3; velocity: THREE.Vector3; life: number; size: number }
type Burst = { point: THREE.Vector3; rotation: THREE.Quaternion; life: number }

function impactBlot() {
  const shape = new THREE.Shape()
  const points = Array.from({ length: 32 }, (_, i) => {
    const angle = i * Math.PI / 16
    const radius = 0.65 + Math.sin(angle * 5 + 0.7) * 0.18 + Math.cos(angle * 3) * 0.13
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius)
  })
  const start = points.at(-1)!.clone().lerp(points[0], 0.5)
  shape.moveTo(start.x, start.y)
  for (let i = 0; i < points.length; i++) {
    const point = points[i], next = points[(i + 1) % points.length]
    shape.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2)
  }
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

/** A brief wet blot, outward droplets and a lasting stain on the hit surface. */
export class MissionImpacts {
  readonly mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4),
    new THREE.MeshBasicMaterial({ color: penPalette.ink, toneMapped: false }), 80)
  readonly bursts = new THREE.InstancedMesh(impactBlot(),
    new THREE.MeshBasicMaterial({ color: penPalette.ink, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }), 24)
  private chips: Chip[] = []
  private flashes: Burst[] = []
  private matrix = new THREE.Matrix4()
  private rotation = new THREE.Quaternion()
  private scale = new THREE.Vector3()
  readonly splashes?: InkSplashes

  constructor(scene: THREE.Scene, world?: CollisionWorld) {
    if (world) this.splashes = new InkSplashes(scene, world)
    this.mesh.name = 'Surface impact ink droplets'
    this.mesh.userData.noCollision = true
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.count = 0
    this.bursts.name = 'Surface impact ink bursts'
    this.bursts.userData.noCollision = true
    this.bursts.frustumCulled = false
    this.bursts.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.bursts.count = 0
    scene.add(this.mesh, this.bursts)
  }

  emit(point: THREE.Vector3, direction: THREE.Vector3, surface?: SurfaceHit, weapon: WeaponName = 'ak') {
    if (surface) { surface = followSurface(surface); point = surface.point }
    const normal = surface?.normal ?? direction.clone().normalize().negate()
    if (surface) this.splashes?.emit(surface, weapon)
    this.flashes.push({ point: point.clone().addScaledVector(normal, 0.025), life: 0.085,
      rotation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal) })
    this.flashes = this.flashes.slice(-24)
    const basis = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    for (let index = 0; index < 7; index++) {
      const angle = index * 2.399
      const velocity = new THREE.Vector3(Math.sin(angle) * 0.9, Math.cos(angle) * 0.9, 0.55 + index * 0.1).applyQuaternion(basis)
      this.chips.push({ position: point.clone().addScaledVector(normal, 0.015), velocity,
        life: 0.24 + index * 0.015, size: 0.006 + (index % 3) * 0.002 })
    }
    this.chips = this.chips.slice(-80)
    this.render()
  }

  update(dt: number) {
    this.splashes?.update(dt)
    const delta = Math.max(0, Math.min(dt, 0.05))
    for (const chip of this.chips) {
      chip.life -= delta
      chip.velocity.y -= delta * 5
      chip.position.addScaledVector(chip.velocity, delta)
    }
    this.chips = this.chips.filter(chip => chip.life > 0)
    for (const flash of this.flashes) flash.life -= delta
    this.flashes = this.flashes.filter(flash => flash.life > 0)
    this.render()
  }

  private render() {
    this.mesh.count = this.chips.length
    this.chips.forEach((chip, index) => {
      this.scale.setScalar(chip.size * Math.min(1, chip.life * 12))
      this.scale.y *= 1.8
      this.rotation.setFromUnitVectors(new THREE.Vector3(0, 1, 0), chip.velocity.clone().normalize())
      this.mesh.setMatrixAt(index, this.matrix.compose(chip.position, this.rotation, this.scale))
    })
    this.mesh.instanceMatrix.needsUpdate = true
    this.bursts.count = this.flashes.length
    this.flashes.forEach((flash, index) => {
      this.scale.setScalar(0.038 * Math.sqrt(flash.life / 0.085))
      this.bursts.setMatrixAt(index, this.matrix.compose(flash.point, flash.rotation, this.scale))
    })
    this.bursts.instanceMatrix.needsUpdate = true
  }
  clear() { this.chips = []; this.flashes = []; this.splashes?.clear(); this.render() }
  dispose() {
    this.clear()
    this.splashes?.dispose()
    for (const mesh of [this.mesh, this.bursts]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose() }
  }
}
