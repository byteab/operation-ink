import type { FirstPersonController } from '../player/controller'
import { touchStick, touchLookStick } from '../player/touch-stick'
import { SNIPER_ZOOM } from './balance'
import { touchIcon } from './touch-icons'
import type { WeaponName } from './types'
import './touch-controls.css'

export type TouchAction = 'aim' | 'reload' | 'jump' | 'use' | 'map' | 'pause' | 'slot' | 'drop' | 'zoom-in' | 'zoom-out'
type TouchState = { active: boolean; aiming: boolean; canAim: boolean; reloading: boolean; armed: boolean;
  scoped: boolean; zoom: number; selected: number; slots: ({ name: WeaponName; label: string } | null)[]; canReload: boolean }
type Callbacks = { action: (action: TouchAction, slot?: number) => boolean; fire: (held: boolean, cancelled?: boolean) => void;
  feedback: (strong: boolean) => void; unlock: () => void }
type Contact = { element: HTMLElement; role: string; x: number; y: number; radius: number }
const button = (name: string, label: string, glyph = name) => `<button type="button" data-touch="${name}" aria-label="${label}"><span class="touch-icon" data-icon="${glyph}">${touchIcon(glyph)}</span></button>`

/** The gesture's starting surface owns it until release: looking across the
 * trigger never fires, while dragging out of the trigger keeps firing. */
export class TouchControls {
  private root = document.createElement('section')
  private abort = new AbortController()
  private contacts = new Map<number, Contact>()
  private buttons = new Map<string, HTMLButtonElement>()
  private stick: HTMLElement
  private knob: HTMLElement
  private lookPad: HTMLElement
  private lookCursor: HTMLElement
  private actions: HTMLElement
  private combat: HTMLElement
  private tray: HTMLElement
  private zoom: HTMLElement
  private marker: HTMLButtonElement
  private markerHome: { parent: Node; next: ChildNode | null }
  private pickerOpen = false
  private scoped = false
  private active = false
  private running = false
  private manualMode = false
  private lastPulse = -Infinity
  private shotTimer = 0
  private haptics = true

  constructor(private player: FirstPersonController, private callbacks: Callbacks) {
    this.marker = document.querySelector<HTMLButtonElement>('#action-marker')!
    this.markerHome = { parent: this.marker.parentNode!, next: this.marker.nextSibling }
    this.root.id = 'touch-controls'
    this.root.hidden = true
    this.root.setAttribute('aria-label', 'Touch game controls')
    this.root.innerHTML = `
      <div class="touch-look" data-touch="look" aria-label="Drag and hold to turn. Move farther to turn faster."></div>
      <div class="touch-utilities">${button('pause', 'Pause and mission map')}</div>
      <div class="touch-movement">
        <div class="touch-stick" data-touch="move" role="group" aria-label="Movement stick. Push gently to walk, farther to run.">
          <b class="touch-knob"></b>
        </div>
      </div>
      <div class="touch-actions">
        <i class="touch-pad-surface" aria-hidden="true"></i>
        <div class="touch-combat">
        <div class="touch-shortcuts">
          ${button('weapon', 'Choose or drop weapon', 'ak')}
          ${button('aim', 'Toggle sights')}
          ${button('jump', 'Jump')}
          ${button('reload', 'Reload weapon')}
        </div>
        <div class="touch-look-pad" data-touch="look" role="group" aria-label="Look stick. Drag and hold the rim to turn. Move farther to turn faster. Hold the center to fire.">
          ${button('fire', 'Hold to fire. Drag and hold to turn while firing')}
          <i class="touch-look-cursor" aria-hidden="true"></i>
        </div>
        </div>
      <div class="touch-weapon-tray" id="touch-weapon-tray" inert aria-hidden="true" role="group" aria-label="Choose or drop weapon">
        ${[0, 1, 2, 3].map(i => `<button type="button" data-touch="slot" data-slot="${i}" aria-label="Empty slot"><span class="touch-icon" data-icon="empty">${touchIcon('empty')}</span></button>`).join('')}
        ${button('drop', 'Drop current weapon')}${button('close', 'Close weapons')}
      </div>
      </div>
      <div class="touch-zoom" hidden aria-label="Scope zoom">${button('zoom-out', 'Zoom out')}${button('zoom-in', 'Zoom in')}</div>`
    document.body.append(this.root)
    this.root.querySelectorAll<HTMLButtonElement>('button').forEach(el => {
      this.buttons.set(el.dataset.touch === 'slot' ? `slot-${el.dataset.slot}` : el.dataset.touch!, el)
    })
    this.stick = this.root.querySelector('.touch-stick')!
    this.knob = this.root.querySelector('.touch-knob')!
    this.lookPad = this.root.querySelector('.touch-look-pad')!
    this.lookCursor = this.root.querySelector('.touch-look-cursor')!
    this.actions = this.root.querySelector('.touch-actions')!
    this.combat = this.root.querySelector('.touch-combat')!
    this.tray = this.root.querySelector('.touch-weapon-tray')!
    this.zoom = this.root.querySelector('.touch-zoom')!
    this.buttons.get('aim')!.setAttribute('aria-pressed', 'false')
    this.buttons.get('reload')!.hidden = true
    this.buttons.get('weapon')!.setAttribute('aria-expanded', 'false')
    this.buttons.get('weapon')!.setAttribute('aria-controls', this.tray.id)
    const opts = { signal: this.abort.signal }
    this.root.addEventListener('pointerdown', this.down, opts)
    this.root.addEventListener('pointermove', this.move, opts)
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.root.addEventListener(event, e => this.release((e as PointerEvent).pointerId, event !== 'pointerup'), opts)
    }
    this.root.addEventListener('contextmenu', e => e.preventDefault(), opts)
    this.root.addEventListener('click', e => {
      e.preventDefault()
      if (e.detail || (e as PointerEvent).pointerType || !this.active) return
      const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-touch]')
      if (!target || target.disabled || target.closest('[inert]')) return
      if (target.dataset.touch === 'fire') {
        this.callbacks.fire(true); this.callbacks.fire(false)
      } else this.activate(target)
    }, opts)
    window.addEventListener('blur', () => this.reset(), opts)
    window.addEventListener('resize', () => this.reset(), opts)
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset() }, opts)
    const media = matchMedia('(any-pointer: coarse)')
    const detect = () => { if (!this.manualMode) this.setEnabled(media.matches || navigator.maxTouchPoints > 0) }
    media.addEventListener('change', detect, opts)
    document.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' && !this.manualMode && !player.touchMode) this.setEnabled(true)
    }, { ...opts, capture: true })
    document.querySelector('#mission-touch')!.addEventListener('change', event => {
      this.manualMode = true; this.setEnabled((event.target as HTMLInputElement).checked)
    }, opts)
    document.querySelector('#mission-haptics')!.addEventListener('change', event => {
      this.haptics = (event.target as HTMLInputElement).checked
      if (!this.haptics) this.vibrate(0)
    }, opts)
    detect()
  }

  private setEnabled(enabled: boolean) {
    this.reset()
    this.player.touchMode = enabled
    this.placeMarker(enabled)
    document.body.dataset.touch = String(enabled)
    ;(document.querySelector('#mission-touch') as HTMLInputElement).checked = enabled
    if (enabled && document.pointerLockElement) document.exitPointerLock()
    if (!enabled) {
      this.root.hidden = true
      if (this.player.playing) this.player.pause()
    }
  }

  private placeMarker(touch: boolean) {
    if (touch) {
      // Share the actual projected marker instead of drawing a second action.
      // Inside this layer it can receive a tap above the background look area.
      this.root.append(this.marker)
      this.marker.dataset.touch = 'use'
      this.marker.removeAttribute('aria-hidden')
      this.marker.tabIndex = 0
    } else {
      this.markerHome.parent.insertBefore(this.marker, this.markerHome.next)
      delete this.marker.dataset.touch
      this.marker.setAttribute('aria-hidden', 'true')
      this.marker.tabIndex = -1
    }
  }

  private down = (event: PointerEvent) => {
    if (!this.active || event.button !== 0) return
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-touch]')
    if (!element || element.hidden || element.closest('[inert]') || (element instanceof HTMLButtonElement && element.disabled)) return
    event.preventDefault()
    const role = element.dataset.touch!
    // A touch outside the picker dismisses it without also turning or firing.
    if (this.pickerOpen && role === 'look') { this.setTray(false); return }
    // One right thumb owns look/fire, preventing competing camera deltas.
    const looking = role === 'look' || role === 'fire'
    if ([...this.contacts.values()].some(c => c.role === role || looking && (c.role === 'look' || c.role === 'fire'))) return
    const rect = element.getBoundingClientRect()
    const contact: Contact = { element, role, x: event.clientX, y: event.clientY,
      radius: (looking ? this.lookPad.getBoundingClientRect().width : rect.width) * 0.37 }
    if (role === 'move') { contact.x = rect.left + rect.width / 2; contact.y = rect.top + rect.height / 2 }
    this.contacts.set(event.pointerId, contact)
    element.setPointerCapture(event.pointerId)
    element.classList.add('touch-held')
    this.callbacks.unlock()
    if (role === 'move') { this.feedback(); this.move(event) }
    else if (looking) {
      this.setTray(false)
      this.lookPad.classList.add('touch-tracking')
      if (role === 'fire') this.callbacks.fire(true)
    } else this.activate(element)
  }

  private move = (event: PointerEvent) => {
    const contact = this.contacts.get(event.pointerId)
    if (!contact || !this.active) return
    event.preventDefault()
    const x = event.clientX - contact.x, y = event.clientY - contact.y
    if (contact.role === 'move') {
      const stick = touchStick(x, y, contact.radius, this.player.inputSettings.move)
      this.player.setTouchMovement(stick.x, stick.forward, stick.sprint)
      this.knob.style.transform = `translate(${stick.knobX}px, ${stick.knobY}px)`
      if (stick.sprint && !this.running) this.feedback(true)
      this.running = stick.sprint
      this.stick.classList.toggle('touch-running', stick.sprint)
    } else if (contact.role === 'look' || contact.role === 'fire') {
      const stick = touchLookStick(x, y, contact.radius)
      this.player.setTouchLook(stick.x, stick.y)
      this.lookCursor.style.transform = `translate(${stick.knobX}px, ${stick.knobY}px)`
    }
  }

  private activate(element: HTMLElement) {
    const role = element.dataset.touch!
    if (role === 'close') { this.setTray(false); this.feedback(); return }
    if (role === 'weapon') { this.setTray(!this.pickerOpen); this.feedback(); return }
    const action = role as TouchAction
    if (action === 'use') this.setTray(false)
    if (this.callbacks.action(action, Number(element.dataset.slot))) this.feedback()
    if (action === 'slot' || action === 'drop') this.setTray(false)
  }

  private release(id: number, cancelled = false) {
    const contact = this.contacts.get(id)
    if (!contact) return
    this.contacts.delete(id)
    contact.element.classList.remove('touch-held')
    if (contact.element.hasPointerCapture(id)) contact.element.releasePointerCapture(id)
    if (contact.role === 'fire') this.callbacks.fire(false, cancelled)
    if (contact.role === 'move') {
      this.player.clearTouchMovement()
      this.knob.style.transform = ''
      this.stick.classList.remove('touch-running')
      this.running = false
    }
    if (contact.role === 'look' || contact.role === 'fire') {
      this.player.clearTouchLook()
      this.lookPad.classList.remove('touch-tracking')
      this.lookCursor.style.transform = ''
    }
  }

  private setTray(open: boolean) {
    if (this.pickerOpen === open) return
    const restoreFocus = this.actions.contains(document.activeElement)
    // Preserve the movement thumb, but never carry a trigger/camera contact
    // across the change of controls. Pointer-up cannot activate a new button.
    for (const [id, contact] of this.contacts) {
      if (contact.role !== 'move' && contact.role !== 'pause') this.release(id, true)
    }
    this.pickerOpen = open
    this.actions.classList.toggle('touch-picker-open', open)
    this.combat.inert = open
    this.combat.setAttribute('aria-hidden', String(open))
    this.tray.inert = !open
    this.tray.setAttribute('aria-hidden', String(!open))
    this.zoom.hidden = open || !this.scoped
    this.buttons.get('weapon')!.setAttribute('aria-expanded', String(open))
    if (restoreFocus) {
      const target = open ? this.tray.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not(:disabled)') ?? this.buttons.get('close')! : this.buttons.get('weapon')!
      target.focus({ preventScroll: true })
    }
  }

  reset() {
    for (const id of this.contacts.keys()) this.release(id, true)
    this.player.clearTouchInput()
    this.callbacks.fire(false)
    this.setTray(false)
    clearTimeout(this.shotTimer)
    this.lookPad.classList.remove('touch-shot')
    this.vibrate(0)
  }

  private vibrate(duration: number) {
    try { navigator.vibrate?.(duration) } catch { /* Unsupported hardware still gets ink and audio feedback. */ }
  }

  private feedback(strong = false) {
    this.callbacks.feedback(strong)
    this.pulse(strong ? 14 : 8)
  }

  private pulse(duration: number) {
    const now = performance.now()
    if (!this.haptics || document.body.dataset.reducedMotion === 'true' || now - this.lastPulse < 70) return
    this.lastPulse = now
    this.vibrate(duration)
  }

  shot() {
    if (!this.active || ![...this.contacts.values()].some(c => c.role === 'fire')) return
    this.pulse(16)
    this.lookPad.classList.add('touch-shot')
    clearTimeout(this.shotTimer)
    this.shotTimer = window.setTimeout(() => this.lookPad.classList.remove('touch-shot'), 65)
  }

  private setIcon(button: HTMLButtonElement, name: string) {
    const holder = button.querySelector<HTMLElement>('.touch-icon')!
    if (holder.dataset.icon === name) return
    holder.dataset.icon = name; holder.innerHTML = touchIcon(name)
  }

  update(state: TouchState) {
    const visible = this.player.touchMode && state.active && !document.hidden
    if (this.active && !visible) this.reset()
    this.active = visible
    this.root.hidden = !visible
    if (!visible) return
    this.lookPad.classList.toggle('touch-aiming', state.aiming)
    this.buttons.get('aim')!.setAttribute('aria-pressed', String(state.aiming))
    this.buttons.get('aim')!.disabled = !state.canAim
    this.buttons.get('reload')!.disabled = !state.canReload
    this.buttons.get('reload')!.hidden = !state.canReload
    this.buttons.get('reload')!.classList.toggle('touch-reloading', state.reloading)
    this.buttons.get('reload')!.setAttribute('aria-label', state.reloading ? 'Reloading' : 'Reload weapon')
    this.buttons.get('jump')!.disabled = this.player.actions.traversing
    this.buttons.get('fire')!.disabled = !state.armed || this.player.actions.traversing
    const weapon = this.buttons.get('weapon')!
    this.setIcon(weapon, state.slots[state.selected]?.name ?? 'pistol')
    this.scoped = state.scoped
    this.zoom.hidden = !state.scoped || this.pickerOpen
    this.zoom.setAttribute('aria-label', `Scope zoom, ${state.zoom} times`)
    this.buttons.get('zoom-out')!.disabled = state.zoom <= SNIPER_ZOOM.min
    this.buttons.get('zoom-in')!.disabled = state.zoom >= SNIPER_ZOOM.max
    state.slots.forEach((item, i) => {
      const slot = this.buttons.get(`slot-${i}`)!
      this.setIcon(slot, item?.name ?? 'empty')
      slot.setAttribute('aria-label', item?.label ?? 'Empty slot')
      slot.disabled = !item
      slot.hidden = !item
      slot.setAttribute('aria-pressed', String(i === state.selected))
    })
    this.buttons.get('drop')!.disabled = !state.armed
  }

  dispose() {
    this.reset(); this.abort.abort(); this.placeMarker(false); this.root.remove()
    this.player.touchMode = false
    delete document.body.dataset.touch
  }
}
