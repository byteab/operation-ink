import * as THREE from 'three'

const CAPACITY = 128
type Puff = { position: THREE.Vector3; velocity: THREE.Vector3; age: number; life: number; size: number }

/** A bounded, single-draw cloud; emitted dust stays behind when the jeep turns. */
export class EscapeDust {
  private readonly puffs: Puff[] = Array.from({ length: CAPACITY }, () => ({
    position: new THREE.Vector3(), velocity: new THREE.Vector3(), age: 2, life: 1, size: 1,
  }))
  private readonly alpha = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1)
  private readonly matrix = new THREE.Matrix4()
  private readonly scale = new THREE.Vector3()
  private readonly rotation = new THREE.Quaternion()
  private readonly previousPosition = new THREE.Vector3()
  private readonly previousRotation = new THREE.Quaternion()
  private readonly emissionPosition = new THREE.Vector3()
  private readonly emissionRotation = new THREE.Quaternion()
  private hasPrevious = false
  private cursor = 0
  private pending = 0
  private seed = 17
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(1, 1)
    geometry.setAttribute('puffOpacity', this.alpha)
    this.alpha.setUsage(THREE.DynamicDrawUsage)
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: `
        attribute float puffOpacity;
        varying vec2 dustUv;
        varying float dustAlpha;
        void main() {
          dustUv = uv; dustAlpha = puffOpacity;
          vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          center.xy += position.xy * length(instanceMatrix[0].xyz);
          gl_Position = projectionMatrix * center;
        }`,
      fragmentShader: `
        varying vec2 dustUv;
        varying float dustAlpha;
        void main() {
          vec2 p = dustUv * 2.0 - 1.0;
          float edge = 1.0 - smoothstep(0.25, 1.0, length(p));
          float grain = 0.86 + 0.14 * sin(p.x * 31.0 + sin(p.y * 19.0)) * sin(p.y * 27.0);
          gl_FragColor = vec4(vec3(0.0), edge * grain * dustAlpha);
          #include <colorspace_fragment>
        }`,
    })
    this.mesh = new THREE.InstancedMesh(geometry, material, CAPACITY)
    this.mesh.name = 'Getaway rear-wheel dust'
    this.mesh.userData.noCollision = true
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.count = 0
    scene.add(this.mesh)
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    return this.seed / 0x100000000
  }

  update(dt: number, position: THREE.Vector3, rotation: THREE.Quaternion, speed: number) {
    if (dt <= 0) return
    if (!this.hasPrevious) {
      this.previousPosition.copy(position); this.previousRotation.copy(rotation)
      this.hasPrevious = true
    }
    for (const puff of this.puffs) {
      puff.age += dt
      if (puff.age >= puff.life) continue
      puff.position.addScaledVector(puff.velocity, dt)
      puff.velocity.multiplyScalar(Math.exp(-1.8 * dt))
    }
    if (speed > 0.1) {
      const rate = 12 + Math.min(speed, 15) * 1.4
      this.pending = Math.min(CAPACITY / 2, this.pending + dt * rate)
      while (this.pending >= 1) {
        this.pending--
        const age = this.pending / rate
        // Spread emissions along this frame's travel even at a low frame rate.
        const fraction = Math.max(0, 1 - age / dt)
        this.emissionPosition.lerpVectors(this.previousPosition, position, fraction)
        this.emissionRotation.slerpQuaternions(this.previousRotation, rotation, fraction)
        for (const side of [-1, 1]) {
          const puff = this.puffs[this.cursor++ % CAPACITY]
          puff.position.set(-1.62 + (this.random() - 0.5) * 0.3, 0.12, side * 1.02)
            .applyQuaternion(this.emissionRotation).add(this.emissionPosition)
          puff.velocity.set(-0.6 - speed * 0.07, 0.3 + this.random() * 0.35, side * (0.2 + this.random() * 0.4))
            .applyQuaternion(this.emissionRotation)
          puff.position.addScaledVector(puff.velocity, age)
          puff.age = age; puff.life = 0.45 + this.random() * 0.35
          puff.size = 0.6 + this.random() * 0.35
        }
      }
    } else this.pending = 0
    let count = 0
    for (const puff of this.puffs) {
      if (puff.age >= puff.life) continue
      const t = puff.age / puff.life
      this.scale.setScalar(puff.size * (0.25 + t * 1.25))
      this.mesh.setMatrixAt(count, this.matrix.compose(puff.position, this.rotation, this.scale))
      this.alpha.setX(count++, 0.1 * Math.min(1, (t + 0.03) / 0.12) * (1 - t) ** 1.5)
    }
    this.mesh.count = count
    this.mesh.instanceMatrix.needsUpdate = this.alpha.needsUpdate = true
    this.previousPosition.copy(position); this.previousRotation.copy(rotation)
  }

  clear() {
    for (const puff of this.puffs) puff.age = puff.life
    this.mesh.count = 0; this.pending = 0; this.cursor = 0; this.seed = 17
    this.hasPrevious = false
  }

  dispose() {
    this.clear(); this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose()
  }
}
