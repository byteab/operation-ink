import * as THREE from 'three'
import { penPalette } from '../render/ballpoint'

type Chip = { position: THREE.Vector3; velocity: THREE.Vector3; life: number; size: number }
type Burst = { point: THREE.Vector3; rotation: THREE.Quaternion; life: number }

function impactStar() {
  const shape = new THREE.Shape()
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8
    const radius = i % 2 ? 0.25 : 0.75 + (i % 3) * 0.13
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

/** Bounded paper/ink chips. Origins come from the authoritative world raycast. */
export class MissionImpacts {
  readonly mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ color: penPalette.ink, toneMapped: false }), 80)
  readonly bursts = new THREE.InstancedMesh(impactStar(),
    new THREE.MeshBasicMaterial({ color: penPalette.ink, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }), 24)
  private chips: Chip[] = []
  private flashes: Burst[] = []
  private matrix = new THREE.Matrix4()
  private rotation = new THREE.Quaternion()
  private scale = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this.mesh.name = 'Surface impact ink chips'
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

  emit(point: THREE.Vector3, direction: THREE.Vector3) {
    this.flashes.push({ point: point.clone().addScaledVector(direction, -0.025), life: 0.085,
      rotation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().normalize()) })
    this.flashes = this.flashes.slice(-24)
    for (let index = 0; index < 7; index++) {
      const angle = index * 2.399
      const velocity = new THREE.Vector3(Math.sin(angle), 0.4 + index * 0.1, Math.cos(angle))
        .addScaledVector(direction, -2.3).multiplyScalar(0.8)
      this.chips.push({ position: point.clone().addScaledVector(direction, -0.015), velocity,
        life: 0.24 + index * 0.015, size: 0.014 + (index % 3) * 0.006 })
    }
    this.chips = this.chips.slice(-80)
    this.render()
  }

  update(dt: number) {
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
      this.mesh.setMatrixAt(index, this.matrix.compose(chip.position, this.rotation, this.scale))
    })
    this.mesh.instanceMatrix.needsUpdate = true
    this.bursts.count = this.flashes.length
    this.flashes.forEach((flash, index) => {
      this.scale.setScalar(0.12 * Math.sqrt(flash.life / 0.085))
      this.bursts.setMatrixAt(index, this.matrix.compose(flash.point, flash.rotation, this.scale))
    })
    this.bursts.instanceMatrix.needsUpdate = true
  }
  clear() { this.chips = []; this.flashes = []; this.render() }
  dispose() {
    this.clear()
    for (const mesh of [this.mesh, this.bursts]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose() }
  }
}
