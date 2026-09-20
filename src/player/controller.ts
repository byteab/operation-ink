import * as THREE from 'three'
import { EnvironmentCamera } from '../camera'
import { EnvironmentInteractions } from '../interactions'
import { CollisionWorld } from './collision'
import { PlayerBody } from './body'
import { PlayerActions } from './actions'

const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space']

export class FirstPersonController {
  readonly world: CollisionWorld
  readonly body: PlayerBody
  readonly actions: PlayerActions
  enabled = false
  playing = false
  immersive = false
  missionMode = false
  movementLocked = false
  canPlay: () => boolean = () => true
  onPlayingChange: (playing: boolean) => void = () => {}
  lookSensitivity: () => number = () => 1
  private fallback = false
  private dragging = false
  private started = false
  private walkRotation = new THREE.Quaternion()
  private pressed = new Set<string>()
  private abort = new AbortController()
  private direction = new THREE.Vector3()
  private forward = new THREE.Vector3()
  private rotation = new THREE.Euler(0, 0, 0, 'YXZ')
  private projected = new THREE.Vector3()
  private hud = document.querySelector<HTMLElement>('#walk-hud')!
  private panel = document.querySelector<HTMLElement>('#walk-pause')!
  private startButton = document.querySelector<HTMLButtonElement>('#walk-start')!
  private walkButton = document.querySelector<HTMLButtonElement>('#walk-mode')!
  private prompt = document.querySelector<HTMLElement>('#action-prompt')!
  private actionLabel = document.querySelector<HTMLElement>('#action-label')!
  private marker = document.querySelector<HTMLElement>('#action-marker')!
  private status = document.querySelector<HTMLElement>('#walk-status')!

  constructor(private canvas: HTMLCanvasElement, scene: THREE.Scene, private camera: EnvironmentCamera,
    private interactions: EnvironmentInteractions, private invalidate: () => void) {
    this.world = new CollisionWorld(scene)
    this.body = new PlayerBody(this.world)
    this.actions = new PlayerActions(scene, this.body)
    const options = { signal: this.abort.signal }
    this.camera.onInspect = () => { this.walkRotation.copy(camera.active.quaternion); this.stop() }
    this.startButton.addEventListener('click', () => this.requestControl(), options)
    this.walkButton.addEventListener('click', () => { this.enable(); this.requestControl() }, options)
    document.querySelector('#inspect-mode')!.addEventListener('click', () => camera.setView('overview'), options)
    canvas.addEventListener('pointerdown', event => {
      if (!this.enabled || this.immersive || event.button !== 0) return
      if (!this.playing) this.requestControl()
      this.dragging = true
      if (this.fallback) canvas.setPointerCapture(event.pointerId)
    }, options)
    window.addEventListener('pointerup', () => { this.dragging = false }, options)
    window.addEventListener('pointercancel', () => { this.dragging = false }, options)
    document.addEventListener('mousemove', this.look, options)
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === canvas && this.enabled) this.resume()
      else if (this.playing && !this.fallback) this.pause()
    }, options)
    document.addEventListener('pointerlockerror', this.useFallback, options)
    window.addEventListener('keydown', this.keyDown, options)
    window.addEventListener('keyup', event => { this.pressed.delete(event.code) }, options)
    window.addEventListener('blur', this.pause, options)
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause() }, options)
  }

  enable() {
    this.enabled = true
    this.interactions.setCutaway(false)
    this.camera.enterWalk()
    document.body.dataset.mode = 'walk'
    this.hud.hidden = false
    this.walkButton.hidden = true
    if (this.missionMode && this.started) {
      this.actions.syncCamera(this.camera.active)
      this.camera.active.quaternion.copy(this.walkRotation)
    } else this.respawn()
    this.pause()
  }

  respawn() {
    this.actions.reset()
    const ladder = this.actions.ladders.find(object => object.name.includes('west exterior')) ?? this.actions.ladders[0]
    const spawn = ladder ? this.actions.ladderPoint(ladder, false) : new THREE.Vector3(-39, 0.1, 4)
    if (ladder) {
      const outward = new THREE.Vector3(0, 0, 1).transformDirection(ladder.matrixWorld)
      spawn.addScaledVector(outward, 2.8)
    }
    const floor = this.world.floor(spawn, 1, 2)
    if (Number.isFinite(floor)) spawn.y = floor + 0.005
    this.body.teleport(spawn)
    this.world.refresh()
    this.body.update(1 / 60, new THREE.Vector3(), false)
    this.actions.syncCamera(this.camera.active)
    const target = ladder ? this.actions.ladderPoint(ladder, false).add(new THREE.Vector3(0, 1.5, 0)) : spawn.clone().add(new THREE.Vector3(0, 1.5, -5))
    this.camera.active.lookAt(target)
    this.pressed.clear()
    this.invalidate()
  }

  requestControl() {
    if (!this.enabled || this.immersive || !this.canPlay()) return
    this.canvas.focus({ preventScroll: true })
    if (!this.canvas.requestPointerLock || this.fallback) { this.useFallback(); return }
    try {
      const request = this.canvas.requestPointerLock() as Promise<void> | undefined
      request?.catch(this.useFallback)
    } catch { this.useFallback() }
  }

  private useFallback = () => {
    if (!this.enabled || this.immersive) return
    this.fallback = true
    this.resume()
  }

  private resume() {
    if (this.immersive || !this.canPlay()) return
    this.playing = true
    this.started = true
    this.panel.hidden = true
    this.hud.dataset.playing = 'true'
    this.onPlayingChange(true)
    this.canvas.focus({ preventScroll: true })
    this.invalidate()
  }

  pause = () => {
    this.pressed.clear()
    this.dragging = false
    this.playing = false
    this.body.velocity.x = 0
    this.body.velocity.z = 0
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
    this.prompt.hidden = true
    this.marker.hidden = true
    this.hud.dataset.playing = 'false'
    this.panel.hidden = !this.enabled
    this.startButton.textContent = this.missionMode ? (this.started ? 'Resume mission' : 'Begin mission') : this.started ? 'Resume walk' : 'Start walking'
    this.onPlayingChange(false)
    this.invalidate()
  }

  private look = (event: MouseEvent) => {
    if (!this.enabled || !this.playing || (document.pointerLockElement !== this.canvas && !(this.fallback && this.dragging))) return
    this.rotation.setFromQuaternion(this.camera.active.quaternion, 'YXZ')
    const sensitivity = 0.0022 * this.lookSensitivity()
    this.rotation.y -= event.movementX * sensitivity
    this.rotation.x = THREE.MathUtils.clamp(this.rotation.x - event.movementY * sensitivity, -1.5, 1.5)
    this.camera.active.quaternion.setFromEuler(this.rotation)
    this.invalidate()
  }

  private keyDown = (event: KeyboardEvent) => {
    if (!this.enabled || this.immersive || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.target instanceof HTMLElement && event.target.closest('button, summary, input, textarea, select, [contenteditable="true"]')) return
    if (event.code === 'Escape') { this.pause(); return }
    if (!this.playing) return
    if (this.movementLocked) return
    if (movementKeys.includes(event.code)) {
      event.preventDefault()
      this.pressed.add(event.code)
      if (event.code === 'Space' && !event.repeat && !this.actions.traversing) this.body.jump()
    }
    if (event.code === 'KeyF' && !event.repeat) { event.preventDefault(); this.actions.activate(this.camera.active) }
    if (event.code === 'KeyR' && !event.repeat && !this.missionMode) { event.preventDefault(); this.respawn() }
    this.invalidate()
  }

  update(dt: number) {
    if (!this.enabled || this.immersive || !this.playing) return false
    if (this.movementLocked) {
      this.prompt.hidden = true; this.marker.hidden = true; this.status.textContent = 'Escaping by jeep'
      return true
    }
    this.world.refresh()
    if (!this.actions.updateTraversal(dt)) {
      const x = Number(this.pressed.has('KeyD') || this.pressed.has('ArrowRight')) - Number(this.pressed.has('KeyA') || this.pressed.has('ArrowLeft'))
      const z = Number(this.pressed.has('KeyW') || this.pressed.has('ArrowUp')) - Number(this.pressed.has('KeyS') || this.pressed.has('ArrowDown'))
      this.camera.active.getWorldDirection(this.forward)
      this.forward.y = 0
      this.forward.normalize()
      this.direction.set(-this.forward.z, 0, this.forward.x).multiplyScalar(x).addScaledVector(this.forward, z).normalize()
      this.body.update(dt, this.direction, this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight'))
    }
    if (this.body.position.y < -20 || Math.max(Math.abs(this.body.position.x), Math.abs(this.body.position.z)) > 1150) this.respawn()
    this.actions.syncCamera(this.camera.active, dt)
    const target = this.actions.findTarget(this.camera.active)
    this.prompt.hidden = !target
    this.marker.hidden = !target
    if (target) {
      this.actionLabel.textContent = target.label
      this.marker.textContent = target.kind === 'door' ? '▯' : target.kind === 'ladder' ? '☷' : target.kind === 'zipline' ? '↘' : target.kind === 'pickup' ? '+' : '⚙'
      this.prompt.dataset.kind = target.kind
      this.projected.copy(target.point).project(this.camera.active)
      this.marker.hidden = Math.abs(this.projected.x) > 0.95 || Math.abs(this.projected.y) > 0.9 || this.projected.z > 1
      this.marker.style.left = `${(this.projected.x + 1) * 50}%`
      this.marker.style.top = `${(1 - this.projected.y) * 50}%`
    }
    const ride = this.actions.riding
    const state = ride ? `Riding to ${ride.destination} · ${Math.round((1 - ride.remaining / ride.distance) * 100)}%` :
      this.actions.climbing ? (this.actions.climbing.descending ? 'Climbing down' : 'Climbing up') :
      !this.body.grounded ? 'In the air' : this.direction.lengthSq() > 0 ?
        (this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight') ? 'Sprinting' : 'Walking') : 'On foot'
    this.status.textContent = this.fallback ? `${state} · drag to look` : state
    return true
  }

  setImmersive(active: boolean) {
    if (active && !this.enabled) this.enable()
    this.immersive = active
    this.camera.immersive = active
    this.actions.reset()
    this.body.velocity.set(0, 0, 0)
    this.pause()
    this.actions.syncCamera(this.camera.active)
  }

  stop() {
    this.enabled = false
    this.pause()
    this.actions.reset()
    this.hud.hidden = true
    this.walkButton.hidden = false
    document.body.dataset.mode = 'inspect'
  }

  dispose() {
    this.stop()
    this.abort.abort()
    this.camera.onInspect = () => {}
    this.world.dispose()
  }
}
