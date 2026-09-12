import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export type ViewName = 'overview' | 'yard' | 'rail' | 'tanks' | 'plan'
export const views: Record<ViewName, { position: [number, number, number]; target: [number, number, number] }> = {
  overview: { position: [-151, 155, 201], target: [-7, 0, 8] },
  yard: { position: [-39, 2.4, 4], target: [3, 2.1, -30] },
  rail: { position: [114, 3.5, -35.5], target: [26, 3, -32] },
  tanks: { position: [-62, 3.2, 26], target: [-91, 2.9, -17] },
  plan: { position: [-1, 240, 2], target: [-1, 0, 1.999] },
}

/** Inspection camera only: no player object, physics body, or gameplay state. */
export class EnvironmentCamera {
  readonly perspective = new THREE.PerspectiveCamera(38, 1, 0.15, 1600)
  readonly orthographic = new THREE.OrthographicCamera(-120, 120, 80, -80, 0.15, 1600)
  readonly orbit: OrbitControls
  active: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.perspective
  view: ViewName = 'overview'
  free = false
  private pressed = new Set<string>()
  private dragging = false
  private dragId = -1
  private width = 1
  private height = 1
  private abort = new AbortController()
  private direction = new THREE.Vector3()
  private sideways = new THREE.Vector3()
  private delta = new THREE.Vector3()

  constructor(private canvas: HTMLCanvasElement, private invalidate: () => void) {
    this.orbit = new OrbitControls(this.active, canvas)
    this.orbit.enableDamping = false
    this.orbit.minDistance = 1.2
    this.orbit.maxDistance = 1200
    this.orbit.minPolarAngle = 0.001
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.004
    this.orbit.minZoom = 0.35
    this.orbit.maxZoom = 30
    this.orbit.zoomSpeed = 0.85
    this.orbit.rotateSpeed = 0.65
    this.orbit.screenSpacePanning = true
    this.orbit.addEventListener('change', invalidate)
    const options = { signal: this.abort.signal }
    window.addEventListener('keydown', this.keyDown, options)
    window.addEventListener('keyup', this.keyUp, options)
    window.addEventListener('blur', this.clearInput, options)
    document.addEventListener('visibilitychange', this.clearInput, options)
    canvas.addEventListener('pointerdown', this.pointerDown, options)
    canvas.addEventListener('pointermove', this.pointerMove, options)
    canvas.addEventListener('pointerup', this.pointerUp, options)
    canvas.addEventListener('pointercancel', this.pointerUp, options)
    canvas.addEventListener('contextmenu', event => event.preventDefault(), options)
    this.setView('overview')
  }

  resize(width: number, height: number) {
    this.width = width; this.height = height
    this.perspective.aspect = width / height
    this.perspective.updateProjectionMatrix()
    const halfHeight = Math.max(86, 122 / this.perspective.aspect)
    this.orthographic.left = -halfHeight * this.perspective.aspect
    this.orthographic.right = halfHeight * this.perspective.aspect
    this.orthographic.top = halfHeight
    this.orthographic.bottom = -halfHeight
    this.orthographic.updateProjectionMatrix()
  }

  setView(name: ViewName) {
    this.pressed.clear()
    this.free = false
    this.canvas.dataset.camera = 'orbit'
    this.orbit.enabled = true
    this.view = name
    this.active = name === 'plan' ? this.orthographic : this.perspective
    this.orbit.object = this.active
    const preset = views[name]
    this.active.position.fromArray(preset.position)
    if (name === 'overview' && this.width / this.height < 1.3) {
      this.active.position.sub(new THREE.Vector3(...preset.target)).multiplyScalar(1.3 / (this.width / this.height)).add(new THREE.Vector3(...preset.target))
    }
    this.active.up.set(0, 1, 0)
    if (this.active === this.orthographic) this.orthographic.zoom = 1
    this.perspective.fov = name === 'overview' ? 38 : 58
    this.resize(this.width, this.height)
    this.orbit.target.fromArray(preset.target)
    this.orbit.update()
    this.invalidate()
  }

  private toggleFree() {
    if (this.active === this.orthographic) this.setView('overview')
    this.free = !this.free
    this.orbit.enabled = !this.free
    this.canvas.dataset.camera = this.free ? 'free' : 'orbit'
    if (!this.free) {
      this.active.getWorldDirection(this.direction)
      this.orbit.target.copy(this.active.position).addScaledVector(this.direction, 25)
      this.orbit.update()
    }
    this.invalidate()
  }

  private keyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const keys: Record<string, ViewName> = { Digit1: 'overview', Digit2: 'yard', Digit3: 'rail', Digit4: 'tanks', Digit5: 'plan' }
    if (keys[event.code]) { event.preventDefault(); this.setView(keys[event.code]); return }
    if (event.code === 'KeyR') { this.setView(this.view); return }
    if (event.code === 'KeyF' && !event.repeat) { this.toggleFree(); return }
    if (event.code === 'Escape' && this.free) { this.toggleFree(); return }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault()
      this.pressed.add(event.code)
      this.invalidate()
    }
  }
  private keyUp = (event: KeyboardEvent) => { this.pressed.delete(event.code) }
  private clearInput = () => { this.pressed.clear(); this.dragging = false }

  private pointerDown = (event: PointerEvent) => {
    this.canvas.focus({ preventScroll: true })
    if (!this.free || event.button !== 0) return
    this.dragging = true
    this.dragId = event.pointerId
    this.canvas.setPointerCapture(event.pointerId)
  }
  private pointerMove = (event: PointerEvent) => {
    if (!this.free || !this.dragging || event.pointerId !== this.dragId) return
    const rotation = new THREE.Euler().setFromQuaternion(this.active.quaternion, 'YXZ')
    rotation.y -= event.movementX * 0.003
    rotation.x = THREE.MathUtils.clamp(rotation.x - event.movementY * 0.003, -1.55, 1.55)
    this.active.quaternion.setFromEuler(rotation)
    this.invalidate()
  }
  private pointerUp = (event: PointerEvent) => {
    if (event.pointerId === this.dragId) {
      this.dragging = false
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
    }
  }

  update(dt: number) {
    if (this.active.position.y < 0.3) {
      const lift = 0.3 - this.active.position.y
      this.active.position.y += lift
      if (!this.free) this.orbit.target.y += lift
    }
    const x = Number(this.pressed.has('KeyD')) - Number(this.pressed.has('KeyA'))
    const z = Number(this.pressed.has('KeyW')) - Number(this.pressed.has('KeyS'))
    const y = Number(this.pressed.has('KeyE')) - Number(this.pressed.has('KeyQ'))
    if (!x && !y && !z) return false
    this.active.getWorldDirection(this.direction)
    if (!this.free) {
      this.direction.y = 0
      if (this.direction.lengthSq() < 0.0001) this.direction.set(0, 0, -1)
      this.direction.normalize()
    }
    this.sideways.crossVectors(this.direction, this.active.up).normalize()
    this.delta.copy(this.direction).multiplyScalar(z).addScaledVector(this.sideways, x)
    this.delta.y += y
    this.delta.normalize()
    const fast = this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight')
    this.delta.multiplyScalar(dt * (fast ? 28 : 9))
    if (this.active.position.y + this.delta.y < 0.3) this.delta.y = 0.3 - this.active.position.y
    this.active.position.add(this.delta)
    if (!this.free) { this.orbit.target.add(this.delta); this.orbit.update() }
    return true
  }

  dispose() {
    this.abort.abort()
    this.orbit.removeEventListener('change', this.invalidate)
    this.orbit.dispose()
  }
}
