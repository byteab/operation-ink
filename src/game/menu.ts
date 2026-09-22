import { missionObjective, type MissionState } from './mission'

type MenuPage = 'home' | 'mission' | 'controls' | 'settings' | 'vr' | 'restart'
type MenuCallbacks = { retry: () => void; restart: () => void }

/** One decision at a time; reference material never blocks entering the game. */
export class MissionMenu {
  private card = document.querySelector<HTMLElement>('.walk-card')!
  private pause = document.querySelector<HTMLElement>('#walk-pause')!
  private abort = new AbortController()
  private page: MenuPage = 'home'
  private phase: MissionState['phase'] = 'active'
  private hasPlayed = false
  private wasPlaying = false
  private loaded = false
  private loadError = ''
  private returnFocus: HTMLElement | null = null
  private title: HTMLElement
  private premise: HTMLElement
  private retry: HTMLButtonElement
  private restart: HTMLButtonElement

  constructor(private start: HTMLButtonElement, map: string, reducedMotion: boolean, callbacks: MenuCallbacks) {
    this.card.dataset.page = 'home'
    this.card.setAttribute('role', 'dialog')
    this.card.setAttribute('aria-modal', 'true')
    this.card.setAttribute('aria-labelledby', 'mission-menu-title')
    this.card.innerHTML = `
      <section data-menu-page="home">
        <h1 id="mission-menu-title">Operation Safe Return</h1>
        <p id="mission-premise">Find the hostage. Get out together.</p>
        <div id="mission-debrief" role="status" hidden></div>
        <div class="mission-actions">
          <div class="mission-start-slot"></div>
          <button id="mission-retry" class="menu-primary" hidden>Try again</button>
          <button id="mission-restart" class="menu-quiet" hidden>Restart mission</button>
        </div>
        <nav class="mission-menu-links" aria-label="Mission menu">
          <button data-menu-open="mission">Mission</button>
          <button data-menu-open="controls">Controls</button>
          <button data-menu-open="settings">Settings</button>
        </nav>
      </section>
      <section data-menu-page="mission" hidden>
        <button class="menu-back" data-menu-back><span aria-hidden="true">←</span> Back <kbd>Esc</kbd></button>
        <h2 id="mission-page-title">The rescue</h2>
        <p id="mission-current-objective">Find detention and reach the cells.</p>
        <div class="field-map">${map}</div>
        <p class="map-legend"><span>— Rail route</span><span>┄ Service route</span><span>▲ You</span></p>
        <details class="mission-tips"><summary>Route tips</summary>
          <p>Take the mess-hall roof to the rail line, or the west service gate to the covered lanes.</p>
          <p>The office terminal stops cameras for 60 seconds. Security shuts them down permanently. Open the exit gate before the rescue.</p>
          <p>The jeep is southeast of detention. If the hostage falls behind, return to him and lead him onward. Alarms bring reinforcements; you don’t need to fight everyone.</p>
        </details>
      </section>
      <section data-menu-page="controls" hidden>
        <button class="menu-back" data-menu-back><span aria-hidden="true">←</span> Back <kbd>Esc</kbd></button>
        <h2 id="controls-page-title">Controls</h2>
        <dl class="mission-keys">
          <div><dt>Move</dt><dd><kbd>W A S D</kbd></dd></div>
          <div><dt>Look</dt><dd><kbd>Mouse</kbd></dd></div>
          <div><dt>Fire</dt><dd><kbd>Left click</kbd></dd></div>
          <div><dt>Toggle aim</dt><dd><kbd>Right click</kbd></dd></div>
          <div><dt>Interact / pick up</dt><dd><kbd>F</kbd></dd></div>
          <div><dt>Reload</dt><dd><kbd>R</kbd></dd></div>
          <div><dt>Sprint</dt><dd><kbd>Shift</kbd></dd></div>
          <div><dt>Jump</dt><dd><kbd>Space</kbd></dd></div>
          <div><dt>Switch weapon</dt><dd><kbd>1–4</kbd></dd></div>
          <div><dt>Drop weapon</dt><dd><kbd>G</kbd></dd></div>
          <div><dt>Scope zoom</dt><dd><kbd>Q / E / Wheel</kbd></dd></div>
          <div><dt>Mission map</dt><dd><kbd>M</kbd></dd></div>
          <div><dt>Pause</dt><dd><kbd>Esc</kbd></dd></div>
        </dl>
      </section>
      <section data-menu-page="settings" hidden>
        <button class="menu-back" data-menu-back><span aria-hidden="true">←</span> Back <kbd>Esc</kbd></button>
        <h2 id="settings-page-title">Settings</h2>
        <div class="mission-settings">
          <label class="mission-volume-label" for="mission-volume">Volume <output id="mission-volume-value" for="mission-volume">55%</output></label>
          <input id="mission-volume" type="range" min="0" max="100" value="55" />
          <label for="mission-mute">Mute <input id="mission-mute" type="checkbox" /></label>
          <label for="mission-motion">Reduced motion <input id="mission-motion" type="checkbox" ${reducedMotion ? 'checked' : ''} /></label>
        </div>
      </section>
      <section data-menu-page="vr" hidden>
        <button class="menu-back" data-menu-back><span aria-hidden="true">←</span> Back <kbd>Esc</kbd></button>
        <h2 id="vr-page-title">Explore in VR</h2>
        <p>Walk through the compound with your headset. Your mission stays paused.</p>
        <div class="mission-vr-slot"></div>
      </section>
      <section data-menu-page="restart" hidden>
        <button class="menu-back" data-menu-back><span aria-hidden="true">←</span> Back <kbd>Esc</kbd></button>
        <h2 id="restart-page-title">Start over?</h2>
        <p>Your current mission progress will be reset.</p>
        <div class="mission-actions">
          <button id="mission-cancel-restart" class="menu-primary">Cancel</button>
          <button id="mission-confirm-restart" class="menu-secondary">Restart mission</button>
        </div>
      </section>`
    this.card.querySelector('.mission-start-slot')!.append(start)
    // Move the existing controls so the WebXR click handler keeps the browser's
    // user activation and session lifecycle, inside the same menu.
    this.card.querySelector('.mission-vr-slot')!.append(document.querySelector('#vr-panel')!)
    this.title = this.element('#mission-menu-title')
    this.premise = this.element('#mission-premise')
    this.retry = this.element('#mission-retry')
    this.restart = this.element('#mission-restart')
    const options = { signal: this.abort.signal }
    this.card.querySelectorAll<HTMLElement>('[data-menu-open]').forEach(button => {
      button.addEventListener('click', () => this.show(button.dataset.menuOpen as MenuPage, button), options)
    })
    this.card.querySelectorAll('[data-menu-back]').forEach(button => {
      button.addEventListener('click', () => this.back(), options)
    })
    this.retry.addEventListener('click', callbacks.retry, options)
    this.restart.addEventListener('click', () => {
      if (this.phase === 'complete') callbacks.restart()
      else this.show('restart', this.restart)
    }, options)
    this.element('#mission-confirm-restart').addEventListener('click', callbacks.restart, options)
    this.element('#mission-cancel-restart').addEventListener('click', () => this.back(), options)
    this.element('#mission-volume').addEventListener('input', event => {
      this.element('#mission-volume-value').textContent = `${(event.target as HTMLInputElement).value}%`
    }, options)
    window.addEventListener('keydown', this.keyDown, { ...options, capture: true })
  }

  private element<T extends HTMLElement = HTMLElement>(selector: string) { return this.card.querySelector<T>(selector)! }

  private show(page: MenuPage, source?: HTMLElement, focus = true) {
    if (source) this.returnFocus = source
    this.page = page
    this.card.dataset.page = page
    this.card.querySelectorAll<HTMLElement>('[data-menu-page]').forEach(section => { section.hidden = section.dataset.menuPage !== page })
    this.card.setAttribute('aria-labelledby', page === 'home' ? 'mission-menu-title' : `${page}-page-title`)
    this.pause.scrollTop = 0
    if (focus) {
      if (page === 'home') this.focusPrimary()
      else this.element<HTMLButtonElement>(`[data-menu-page="${page}"] ${page === 'restart' ? '#mission-cancel-restart' : '[data-menu-back]'}`).focus({ preventScroll: true })
    }
  }

  private back() {
    this.show('home', undefined, false)
    if (this.returnFocus && !this.returnFocus.hidden) this.returnFocus.focus({ preventScroll: true })
    else this.focusPrimary()
    this.returnFocus = null
  }

  showMap() { this.returnFocus = null; this.show('mission') }
  setPlaying(playing: boolean) {
    if (playing) {
      this.hasPlayed = true
      this.returnFocus = null
      this.show('home', undefined, false)
    } else if (this.wasPlaying) {
      this.show('home', undefined, false)
      this.focusPrimary()
    }
    this.wasPlaying = playing
  }
  focusPrimary() {
    const primary = this.phase === 'dead' ? this.retry : this.phase === 'complete' ? this.restart : this.start
    if (!this.pause.hidden && !this.pause.inert && !primary.hidden && !primary.disabled) primary.focus({ preventScroll: true })
  }
  ready() { this.loaded = true; this.start.disabled = false; this.start.textContent = 'Begin mission'; if (this.page === 'home') this.focusPrimary() }
  error(message: string) { this.loadError = message; this.start.textContent = 'Unable to load'; this.start.disabled = true; this.show('home'); this.showError() }
  private showError() { const debrief = this.element('#mission-debrief'); debrief.hidden = false; delete debrief.dataset.summary; debrief.textContent = this.loadError }
  reset() { this.phase = 'active'; this.loadError = ''; this.show('home', undefined, false) }

  update(state: MissionState, data: { playing: boolean; enabled: boolean; ready: boolean }) {
    if (data.playing) {
      this.hasPlayed = true
      if (!this.wasPlaying) this.show('home', undefined, false)
      this.wasPlaying = true
      return
    }
    const justPaused = this.wasPlaying
    this.wasPlaying = false
    if (this.phase !== state.phase) {
      this.phase = state.phase
      this.show('home', undefined, false)
    }
    const dead = state.phase === 'dead', complete = state.phase === 'complete'
    this.title.textContent = dead ? 'No way through.' : complete ? 'Hostage safe.' : this.hasPlayed ? 'Paused.' : 'Operation Safe Return'
    this.premise.hidden = dead
    this.premise.textContent = complete ? 'You both made it out.' : this.hasPlayed ? missionObjective(state) : 'Find the hostage. Get out together.'
    this.start.hidden = dead || complete
    this.start.disabled = !data.ready || !this.loaded
    if (!this.loadError && this.loaded) this.start.textContent = this.hasPlayed ? 'Resume mission' : 'Begin mission'
    this.retry.hidden = !dead
    this.retry.disabled = !data.ready
    this.restart.hidden = dead || (!complete && !this.hasPlayed)
    this.restart.disabled = !data.ready
    this.restart.className = complete ? 'menu-primary' : 'menu-quiet'
    this.restart.textContent = complete ? 'Play again' : 'Restart mission'
    const debrief = this.element('#mission-debrief')
    debrief.hidden = !complete
    if (complete) {
      const time = `${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`
      const health = Math.ceil(Math.max(0, Math.min(100, state.health)))
      const summary = `${time}|${state.kills}|${health}`
      if (debrief.dataset.summary !== summary) {
        debrief.dataset.summary = summary
        debrief.innerHTML = `<dl class="mission-recap" aria-label="Mission recap">
          <div><dt>Time</dt><dd>${time}</dd></div>
          <div><dt>Kills</dt><dd>${state.kills}</dd></div>
          <div><dt>Health</dt><dd>${health}%</dd></div>
        </dl>`
      }
    }
    if (this.loadError) this.showError()
    this.element('#mission-current-objective').textContent = missionObjective(state)
    if (data.enabled && ((justPaused && !dead) || complete) && this.page === 'home' && !this.card.contains(document.activeElement)) this.focusPrimary()
  }

  private keyDown = (event: KeyboardEvent) => {
    if (this.pause.hidden || this.pause.inert || document.querySelector<HTMLElement>('#walk-hud')!.hidden || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.repeat) return
      if (this.page !== 'home') this.back()
      else if (this.hasPlayed && this.phase === 'active') this.start.click()
      return
    }
    if (event.code === 'KeyM' && (this.page === 'home' || this.page === 'mission')) {
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.repeat) return
      if (this.page === 'home') this.showMap()
      else if (this.hasPlayed && this.phase === 'active') this.start.click()
      else this.back()
      return
    }
    const buttons = Array.from(this.card.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary')).filter(el => el.getClientRects().length > 0)
    const index = buttons.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Tab') {
      if (index === -1 || (event.shiftKey ? index === 0 : index === buttons.length - 1)) {
        event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus()
      }
    } else if (['ArrowUp', 'ArrowDown'].includes(event.key) && (this.page === 'home' || this.page === 'restart')) {
      event.preventDefault()
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
    }
  }

  dispose() { this.abort.abort() }
}
