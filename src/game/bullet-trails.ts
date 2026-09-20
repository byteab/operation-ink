import * as THREE from 'three'
import { penPalette } from '../render/ballpoint'
import type { WeaponName } from './types'

const CAPACITY = 96
const UP = new THREE.Vector3(0, 1, 0)
type Round = {
  origin: THREE.Vector3; direction: THREE.Vector3; distance: number; age: number; duration: number
  length: number; width: number; pass?: { fraction: number; fire: () => void }; impact?: () => void
}

function inkDrop() {
  const geometry = new THREE.SphereGeometry(1, 10, 8)
  const positions = geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const taper = 0.35 + 0.65 * (positions.getY(i) + 1) / 2
    positions.setXYZ(i, positions.getX(i) * taper, positions.getY(i), positions.getZ(i) * taper)
  }
  return geometry
}

/** Presentation only: hit tests and weapon balance remain authoritative and immediate. */
export function bulletFlightTime(distance: number) {
  return THREE.MathUtils.clamp(distance / 700, 0.055, 0.15)
}

/** Work from the clipped segment, never an infinite ray beyond a wall or a body. */
export function bulletNearMiss(origin: THREE.Vector3, end: THREE.Vector3, eye: THREE.Vector3) {
  const segment = new THREE.Line3(origin, end)
  if (segment.distance() < 2) return null
  const fraction = segment.closestPointToPointParameter(eye, true)
  const point = segment.at(fraction, new THREE.Vector3())
  const distance = point.distanceTo(eye)
  if (distance >= 2.4 || point.distanceTo(origin) <= 2) return null
  return { point, fraction, distance, intensity: (1 - distance / 2.4) ** 0.65 }
}

/** Rounded liquid ink heads, paper contrast rims and short tapered ink wakes. */
export class BulletTrails {
  readonly rims = new THREE.InstancedMesh(inkDrop(),
    new THREE.MeshBasicMaterial({ color: penPalette.paper, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }), CAPACITY)
  readonly heads = new THREE.InstancedMesh(inkDrop(),
    new THREE.MeshBasicMaterial({ color: penPalette.ink, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }), CAPACITY)
  readonly tails = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8).rotateX(Math.PI),
    new THREE.MeshBasicMaterial({ color: penPalette.ink, transparent: true, opacity: 0.52, depthWrite: false, toneMapped: false }), CAPACITY)
  private rounds: Round[] = []
  private eye = new THREE.Vector3()
  private point = new THREE.Vector3()
  private scale = new THREE.Vector3()
  private rotation = new THREE.Quaternion()
  private matrix = new THREE.Matrix4()

  constructor(scene: THREE.Scene, label = 'Bullet') {
    this.heads.name = `${label} traveling ink heads`
    this.rims.name = `${label} paper contrast rims`
    this.tails.name = `${label} tapered wakes`
    this.rims.renderOrder = 1; this.tails.renderOrder = 2; this.heads.renderOrder = 3
    for (const mesh of [this.rims, this.heads, this.tails]) {
      mesh.userData.noCollision = true
      mesh.frustumCulled = false
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.count = 0
      scene.add(mesh)
      mesh.onBeforeRender = (_renderer, _scene, camera) => {
        camera.getWorldPosition(this.eye)
        this.render()
      }
    }
  }

  emit(origin: THREE.Vector3, end: THREE.Vector3, weapon: WeaponName = 'ak', pass?: Round['pass'], impact?: () => void) {
    const distance = origin.distanceTo(end)
    if (distance < 0.025) { impact?.(); return }
    if (this.rounds.length === CAPACITY) this.rounds.shift()
    this.rounds.push({ origin: origin.clone(), direction: end.clone().sub(origin).normalize(), distance,
      age: 0, duration: bulletFlightTime(distance), length: weapon === 'sniper' ? 2.4 : weapon === 'shotgun' ? 0.85 : 1.65,
      width: weapon === 'shotgun' ? 0.65 : weapon === 'sniper' ? 1.2 : 1, pass, impact })
    this.render()
  }

  update(dt: number) {
    if (dt <= 0) return
    for (const round of this.rounds) {
      round.age += dt
      if (round.pass && round.age >= round.duration * round.pass.fraction) {
        const pass = round.pass
        round.pass = undefined
        pass.fire()
      }
      if (round.impact && round.age >= round.duration) {
        const impact = round.impact
        round.impact = undefined
        impact()
      }
    }
    this.rounds = this.rounds.filter(round => round.age < round.duration + 0.035)
    this.render()
  }

  private render() {
    this.rims.count = this.heads.count = this.tails.count = this.rounds.length
    this.rounds.forEach((round, index) => {
      // Give even a close-range round a readable first frame, without extending past contact.
      const progress = Math.min(1, Math.max(0.035, round.age / round.duration))
      const travelled = round.distance * progress
      const fade = Math.max(0, 1 - Math.max(0, round.age - round.duration) / 0.035)
      const headLength = Math.min(travelled, round.length * 0.28) * fade
      const tailLength = Math.min(Math.max(0, travelled - headLength), round.length) * fade
      this.point.copy(round.origin).addScaledVector(round.direction, travelled - headLength / 2)
      const radius = THREE.MathUtils.clamp(this.point.distanceTo(this.eye) * 0.003, 0.022, 0.12) * round.width * fade
      this.rotation.setFromUnitVectors(UP, round.direction)
      this.scale.set(radius * 1.8, headLength / 2, radius * 1.8)
      this.rims.setMatrixAt(index, this.matrix.compose(this.point, this.rotation, this.scale))
      this.scale.set(radius, headLength / 2, radius)
      this.heads.setMatrixAt(index, this.matrix.compose(this.point, this.rotation, this.scale))
      this.point.copy(round.origin).addScaledVector(round.direction, travelled - headLength - tailLength / 2)
      this.scale.set(radius * 0.7, tailLength, radius * 0.7)
      this.tails.setMatrixAt(index, this.matrix.compose(this.point, this.rotation, this.scale))
    })
    this.rims.instanceMatrix.needsUpdate = this.heads.instanceMatrix.needsUpdate = this.tails.instanceMatrix.needsUpdate = true
  }

  get count() { return this.rounds.length }
  clear() { this.rounds = []; this.render() }
  dispose() {
    this.clear()
    for (const mesh of [this.rims, this.heads, this.tails]) {
      mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose()
    }
  }
}
