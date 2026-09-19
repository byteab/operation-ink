import * as THREE from 'three'
import { penPalette } from '../render/ballpoint'
import { EnvironmentCamera } from '../camera'
import { FirstPersonController } from '../player/controller'
import { SnapTurn, thumbstick, VRRig } from './locomotion'

export class VRWalkthrough {
  readonly rig = new VRRig()
  active = false
  private session: XRSession | null = null
  private referenceSpace: XRReferenceSpace | null = null
  private disposed = false
  private calibrated = false
  private pendingAction = false
  private resetHeld = false
  private blink = 0
  private snap = new SnapTurn()
  private direction = new THREE.Vector3()
  private abort = new AbortController()
  private button = document.querySelector<HTMLButtonElement>('#vr-enter')!
  private status = document.querySelector<HTMLElement>('#vr-status')!
  private panel = document.querySelector<HTMLElement>('#vr-panel')!
  private labelCanvas = document.createElement('canvas')
  private labelTexture = new THREE.CanvasTexture(this.labelCanvas)
  private label = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.15),
    new THREE.MeshBasicMaterial({ map: this.labelTexture, transparent: true, depthTest: false, depthWrite: false }))
  private curtain = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: penPalette.dark, side: THREE.BackSide, depthTest: false, depthWrite: false }))
  private lastLabel = ''

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene,
    private camera: EnvironmentCamera, private player: FirstPersonController, private invalidate: () => void) {
    renderer.xr.enabled = true
    renderer.xr.setReferenceSpaceType('local-floor')
    // Avoid desktop supersampling; the runtime chooses eye-buffer dimensions.
    const quality = new URLSearchParams(location.search).get('vrQuality')
    renderer.xr.setFramebufferScaleFactor(quality === 'low' ? 0.7 : 1)
    renderer.xr.setFoveation(1)
    this.labelCanvas.width = 1536
    this.labelCanvas.height = 240
    this.labelTexture.colorSpace = THREE.SRGBColorSpace
    this.label.position.set(0, -0.38, -1.25)
    this.label.renderOrder = 100
    this.label.frustumCulled = false
    this.curtain.renderOrder = 101
    this.curtain.frustumCulled = false
    this.rig.camera.add(this.label, this.curtain)
    this.rig.visible = false
    scene.add(this.rig)
    this.button.addEventListener('click', this.enter, { signal: this.abort.signal })
    renderer.xr.addEventListener('sessionstart', this.start)
    renderer.xr.addEventListener('sessionend', this.end)
    navigator.xr?.addEventListener('devicechange', this.checkSupport, { signal: this.abort.signal })
    void this.checkSupport()
  }

  private checkSupport = async () => {
    if (this.session || this.disposed) return
    this.button.disabled = true
    if (!window.isSecureContext) {
      this.button.textContent = 'VR needs a secure connection'
      this.status.textContent = 'Use HTTPS, or USB port forwarding and http://localhost:5173 on your Quest. A plain Wi-Fi IP address cannot start VR.'
      return
    }
    try {
      const supported = await navigator.xr?.isSessionSupported('immersive-vr')
      if (this.disposed || this.session) return
      this.button.disabled = !supported
      this.button.textContent = supported ? 'Enter VR' : 'Open on Meta Quest to enter VR'
      this.status.textContent = supported ? 'Use your Touch controllers. Enter VR to explore from the current walking position.' :
        'This browser has no immersive VR headset available. Open this page in Meta Quest Browser.'
    } catch {
      this.button.textContent = 'VR unavailable'
      this.status.textContent = 'The browser could not check VR support. Open this page directly in Meta Quest Browser and reload.'
    }
  }

  private enter = async () => {
    if (this.session || this.disposed || !navigator.xr || this.button.disabled) return
    this.button.disabled = true
    this.button.textContent = 'Starting VR…'
    let session: XRSession | undefined
    try {
      // Called directly from the click so the browser retains user activation.
      session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] })
      if (this.disposed) { await session.end(); return }
      this.session = session
      session.addEventListener('selectstart', this.select)
      session.addEventListener('visibilitychange', this.visibility)
      await this.renderer.xr.setSession(session)
      if (this.disposed) await session.end()
    } catch (error) {
      if (session) {
        session.removeEventListener('selectstart', this.select)
        session.removeEventListener('visibilitychange', this.visibility)
        await session.end().catch(() => {})
      }
      this.session = null
      if (this.active) this.end()
      if (this.disposed) return
      this.button.disabled = false
      this.button.textContent = 'Try entering VR again'
      this.status.textContent = `Could not start VR: ${error instanceof Error ? error.message : String(error)}. Check site permissions and your Quest floor boundary, then retry.`
    }
  }

  private start = () => {
    if (this.disposed) return
    this.player.setImmersive(true)
    this.active = true
    this.calibrated = false
    this.rig.visible = true
    this.curtain.visible = true
    this.panel.hidden = true
    document.body.dataset.vr = 'active'
    this.resetInput()
    this.referenceSpace = this.renderer.xr.getReferenceSpace()
    this.referenceSpace?.addEventListener('reset', this.recenter)
  }

  private end = () => {
    this.referenceSpace?.removeEventListener('reset', this.recenter)
    this.referenceSpace = null
    this.session?.removeEventListener('selectstart', this.select)
    this.session?.removeEventListener('visibilitychange', this.visibility)
    this.session = null
    if (this.active) {
      this.player.setImmersive(false)
      if (this.calibrated) this.camera.active.quaternion.copy(this.rig.head.quaternion)
    }
    this.active = false
    this.rig.visible = false
    this.calibrated = false
    this.resetInput()
    delete document.body.dataset.vr
    this.panel.hidden = false
    if (!this.disposed) { void this.checkSupport(); this.invalidate() }
  }

  private select = (event: XRInputSourceEvent) => {
    if (event.inputSource.targetRayMode === 'tracked-pointer' && this.session?.visibilityState === 'visible') this.pendingAction = true
  }

  private resetInput() {
    this.pendingAction = false
    this.resetHeld = false
    this.snap.reset()
    this.player.body.velocity.set(0, 0, 0)
  }

  private visibility = () => { this.resetInput() }

  private recenter = () => {
    if (this.calibrated) this.camera.active.quaternion.copy(this.rig.head.quaternion)
    this.calibrated = false
    this.resetInput()
  }

  private setLabel(text: string) {
    if (text === this.lastLabel) return
    this.lastLabel = text
    const context = this.labelCanvas.getContext('2d')!
    context.clearRect(0, 0, 1536, 240)
    context.fillStyle = '#fffffff0'
    context.fillRect(0, 0, 1536, 240)
    context.fillStyle = `#${penPalette.ink.toString(16).padStart(6, '0')}`
    context.font = '44px system-ui, sans-serif'
    context.textAlign = 'center'
    context.fillText(text, 768, 94, 1450)
    context.font = '30px system-ui, sans-serif'
    context.fillText('Left stick: walk   •   Right stick: turn   •   B: entrance', 768, 163, 1450)
    this.labelTexture.needsUpdate = true
  }

  update(dt: number, frame: XRFrame) {
    const referenceSpace = this.renderer.xr.getReferenceSpace()
    const pose = referenceSpace && frame.getViewerPose(referenceSpace)
    if (!pose || this.session?.visibilityState !== 'visible') {
      this.resetInput()
      this.curtain.visible = true
      return
    }
    this.rig.camera.position.copy(pose.transform.position)
    this.rig.camera.quaternion.copy(pose.transform.orientation)
    const { body, actions, world } = this.player
    if (!this.calibrated) {
      this.rig.place(body.position, this.camera.active.quaternion)
      this.calibrated = true
      this.blink = 0.12
    }
    this.rig.sync(body.position)
    let x = 0, y = 0, turn = 0, reset = false
    for (const source of this.session.inputSources) {
      if (source.handedness === 'left') [x, y] = thumbstick(source.gamepad)
      if (source.handedness === 'right') {
        ;[turn] = thumbstick(source.gamepad)
        reset = source.gamepad?.mapping === 'xr-standard' && !!source.gamepad.buttons[5]?.pressed
      }
    }
    world.refresh()
    if ((reset && !this.resetHeld) || body.position.y < -20) {
      this.player.respawn()
      this.rig.place(body.position, this.camera.active.quaternion)
      this.blink = 0.12
      this.pendingAction = false
    }
    this.resetHeld = reset
    this.rig.turn(this.snap.update(turn), body.position)
    if (this.pendingAction) {
      const kind = actions.findTarget(this.rig.head)?.kind
      if (actions.activate(this.rig.head, 'instant') && (kind === 'ladder' || kind === 'zipline')) {
        this.rig.place(body.position, this.rig.head.quaternion)
        this.blink = 0.12
      }
      this.pendingAction = false
    }
    body.update(dt, this.rig.direction(x, y, this.direction), false)
    this.rig.sync(body.position)
    const target = actions.findTarget(this.rig.head)
    this.setLabel(target ? `Trigger: ${target.label}` : 'Look at a nearby door, ladder or cable landing, then press either trigger')
    this.curtain.visible = this.blink > 0
    this.blink = Math.max(0, this.blink - dt)
  }

  async exit() { await this.session?.end() }

  dispose() {
    this.disposed = true
    void this.exit().catch(() => {})
    this.end()
    this.abort.abort()
    this.renderer.xr.removeEventListener('sessionstart', this.start)
    this.renderer.xr.removeEventListener('sessionend', this.end)
    this.rig.removeFromParent()
    this.labelTexture.dispose()
    this.label.geometry.dispose()
    this.label.material.dispose()
    this.curtain.geometry.dispose()
    this.curtain.material.dispose()
  }
}
