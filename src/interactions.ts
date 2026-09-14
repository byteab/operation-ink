import * as THREE from 'three'
import { setDoorOpen, updateDoors } from './world/doors'

/** Door picking respects solid occluders; orbit drags never activate a door. */
export class EnvironmentInteractions {
  readonly doors: THREE.Group[] = []
  cutaway = false
  private cutaways: THREE.Object3D[] = []
  private solids: THREE.Mesh[] = []
  private ray = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private gesture: { pointerId: number; x: number; y: number; moved: boolean } | null = null
  private activePointers = new Set<number>()
  private abort = new AbortController()
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  private hint = document.createElement('div')
  private lastCamera: THREE.Camera | null = null
  private lastCameraWorld = new THREE.Matrix4()
  private lastProjection = new THREE.Matrix4()

  constructor(private canvas: HTMLCanvasElement, scene: THREE.Scene,
    private camera: () => THREE.Camera, private invalidate: () => void,
    private walking: () => boolean = () => false) {
    scene.traverse(object => {
      if (object.userData.kind === 'door') this.doors.push(object as THREE.Group)
      if (object.userData.cutaway) this.cutaways.push(object)
      if (object instanceof THREE.Mesh && !(object.material instanceof THREE.ShaderMaterial)) this.solids.push(object)
    })
    this.hint.className = 'door-hint'
    this.hint.setAttribute('role', 'status')
    this.hint.hidden = true
    document.body.append(this.hint)
    const options = { signal: this.abort.signal }
    window.addEventListener('pointerdown', event => {
      this.activePointers.add(event.pointerId)
      this.gesture = this.activePointers.size === 1 && event.isPrimary && event.button === 0 && event.target === canvas
        ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
        : null
    }, options)
    window.addEventListener('pointermove', event => {
      const gesture = this.gesture
      if (gesture && event.pointerId === gesture.pointerId &&
        Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 5) gesture.moved = true
    }, options)
    window.addEventListener('pointerup', event => {
      const gesture = this.gesture
      this.activePointers.delete(event.pointerId)
      this.gesture = null
      // A drag stays a drag even when it returns to its starting position.
      if (!this.walking() && gesture && event.pointerId === gesture.pointerId && !gesture.moved &&
        event.button === 0 && event.target === canvas &&
        Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5) {
        const door = this.pick(event.clientX, event.clientY)
        if (door) this.toggleDoor(door)
      }
    }, options)
    window.addEventListener('pointercancel', event => {
      this.activePointers.delete(event.pointerId)
      this.gesture = null
    }, options)
    const clearGesture = () => { this.gesture = null; this.activePointers.clear() }
    window.addEventListener('blur', clearGesture, options)
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearGesture() }, options)
    canvas.addEventListener('pointermove', event => {
      if (this.walking()) { this.clearDoorHint(); return }
      if (event.buttons) { this.clearDoorHint(); return }
      const door = this.pick(event.clientX, event.clientY)
      canvas.dataset.door = String(!!door)
      this.hint.hidden = !door
      if (door) this.hint.textContent = `Click to ${door.userData.open ? 'close' : 'open'} ${door.name}`
    }, options)
    canvas.addEventListener('pointerleave', () => this.clearDoorHint(), options)
    window.addEventListener('keydown', event => {
      if (this.walking()) return
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat ||
        (event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select'))) return
      if (event.code === 'KeyI') { event.preventDefault(); this.setCutaway(!this.cutaway) }
      if (event.code === 'KeyO') {
        event.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const door = this.pick(rect.left + rect.width / 2, rect.top + rect.height / 2)
        if (door) this.toggleDoor(door)
      }
    }, options)
  }

  private clearDoorHint() {
    this.hint.hidden = true
    this.canvas.dataset.door = 'false'
  }

  private pick(x: number, y: number) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1)
    this.ray.setFromCamera(this.pointer, this.camera())
    // Mesh raycasting doesn't inherit visibility checks from its parents.
    const visible = this.solids.filter(mesh => {
      for (let object: THREE.Object3D | null = mesh; object; object = object.parent) if (!object.visible) return false
      return true
    })
    const hit = this.ray.intersectObjects(visible, false)[0]
    if (!hit) return null
    for (let object: THREE.Object3D | null = hit.object; object; object = object.parent) {
      if (object.userData.kind === 'door') return object as THREE.Group
    }
    return null
  }

  toggleDoor(door: THREE.Group) {
    setDoorOpen(door, !door.userData.open)
    this.hint.textContent = `${door.name} ${door.userData.open ? 'open' : 'closed'}`
    this.invalidate()
  }

  setCutaway(enabled: boolean) {
    this.cutaway = enabled
    this.cutaways.forEach(object => { object.visible = !enabled })
    this.canvas.dataset.cutaway = String(enabled)
    this.clearDoorHint()
    this.invalidate()
  }

  update(dt: number) {
    const camera = this.camera()
    // Movement is applied before rendering, so refresh the world pose here.
    camera.updateWorldMatrix(true, false)
    if (camera !== this.lastCamera || !camera.matrixWorld.equals(this.lastCameraWorld) ||
      !camera.projectionMatrix.equals(this.lastProjection)) {
      this.clearDoorHint()
      this.lastCamera = camera
      this.lastCameraWorld.copy(camera.matrixWorld)
      this.lastProjection.copy(camera.projectionMatrix)
    }
    return updateDoors(this.doors, dt, this.reducedMotion.matches)
  }

  dispose() { this.abort.abort(); this.hint.remove() }
}
