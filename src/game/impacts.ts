import * as THREE from 'three'
import { penPalette } from '../render/ballpoint'

type Chip = { position: THREE.Vector3; velocity: THREE.Vector3; life: number; size: number }

/** Bounded paper/ink chips. Origins come from the authoritative world raycast. */
export class MissionImpacts {
  readonly mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ color: penPalette.ink, toneMapped: false }), 80)
  private chips: Chip[] = []
  private matrix = new THREE.Matrix4()
  private rotation = new THREE.Quaternion()
  private scale = new THREE.Vector3()

  constructor(scene: THREE.Scene) {
    this.mesh.name = 'Surface impact ink chips'
    this.mesh.userData.noCollision = true
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.count = 0
    scene.add(this.mesh)
  }

  emit(point: THREE.Vector3, direction: THREE.Vector3) {
    for (let index = 0; index < 7; index++) {
      const angle = index * 2.399
      const velocity = new THREE.Vector3(Math.sin(angle), 0.4 + index * 0.1, Math.cos(angle))
        .addScaledVector(direction, -1.8).multiplyScalar(0.7)
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
    this.render()
  }

  private render() {
    this.mesh.count = this.chips.length
    this.chips.forEach((chip, index) => {
      this.scale.setScalar(chip.size * Math.min(1, chip.life * 12))
      this.mesh.setMatrixAt(index, this.matrix.compose(chip.position, this.rotation, this.scale))
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
  clear() { this.chips = []; this.render() }
  dispose() { this.clear(); this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose() }
}
