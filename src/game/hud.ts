import * as THREE from 'three'
import { type MissionState, SIGNALS_COMPUTER_ID } from './mission'
import { WEAPON_RULES } from './balance'
import type { MissionWorld, WeaponItem } from './types'
import './game.css'
import { IncomingFire } from './incoming-fire'
import { MissionMenu } from './menu'
import type { PlayerDeathSequence } from './player-death'
import type { EscapeCinematic } from './escape-cinematic'

const icons: Record<string, string> = {
  door: '<path d="M5 21V3h14v18M9 21V5l8 2v14M13 13h1"/>',
  ladder: '<path d="M7 2v20M17 2v20M7 5h10M7 10h10M7 15h10M7 20h10"/>',
  zipline: '<path d="M2 3l20 7M8 5l-1 4 5 2 1-4M10 10l-1 6 5 2m-5-2-4 5m9-3 3 3"/>',
  pickup: '<path d="M4 13v7h16v-7M12 2v13m-5-5 5 5 5-5"/>',
  mission: '<path d="M5 20V4h14v16ZM8 8h8M8 12h3m4 0h1M8 16h8"/>',
}

export class MissionHUD {
  private root = document.createElement('div')
  private abort = new AbortController()
  private health: HTMLElement
  private healthFill: SVGRectElement
  private scope = document.createElement('div')
  private scopeLabel: HTMLSpanElement
  private ammo: HTMLElement
  private ammoFill: SVGRectElement
  private magazineCount: HTMLElement
  private reloadIcon: SVGElement
  private caption: HTMLElement
  private menu: MissionMenu
  private mapDot: SVGElement
  private icon: HTMLElement
  private captionTimer = 0
  private start: HTMLButtonElement
  private damageTimer = 0
  private death = document.createElement('div')
  private pause = document.querySelector<HTMLElement>('#walk-pause')!
  private deathMenuShown = false
  private escape = document.createElement('div')
  private escapeMenuShown = false
  readonly incoming = new IncomingFire()
  private threat: HTMLElement
  private threatLabel: HTMLElement
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(world: MissionWorld, callbacks: { retry: () => void; restart: () => void; volume: (value: number) => void; mute: (value: boolean) => void }) {
    document.body.dataset.mission = 'true'
    document.body.dataset.reducedMotion = String(this.reducedMotion)
    document.title = 'Operation Safe Return — Stickman'
    const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!
    this.start = $<HTMLButtonElement>('#walk-start')
    this.start.textContent = 'Loading the compound…'; this.start.disabled = true
    $('.walk-heading .walk-eyebrow').textContent = 'Operation Safe Return'
    $('#world').setAttribute('aria-label', 'Operation Safe Return tactical mission. Mouse to look, WASD move, left click fire, right click toggle aim, F interact, R reload, M field map, Escape pause.')
    this.menu = new MissionMenu(this.start, this.buildMap(world), this.reducedMotion, callbacks)
    this.mapDot = document.querySelector('#field-player')!
    this.root.id = 'mission-hud'
    this.root.innerHTML = `
      <div id="mission-caption" role="status"></div>
      <div class="mission-vitals" id="mission-health" role="meter" aria-label="Health" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
        <svg viewBox="0 0 64 64" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">
          <defs><path id="hud-heart" d="M32 56C27 52 7 38 7 23C7 8 24 3 32 17C41 3 57 8 57 23C57 38 37 53 32 56Z"/><clipPath id="hud-heart-clip"><use href="#hud-heart"/></clipPath></defs>
          <use href="#hud-heart" fill="var(--paper)"/>
          <rect class="health-fill" x="7" y="8" width="50" height="48" fill="currentColor" clip-path="url(#hud-heart-clip)"/>
          <use href="#hud-heart" fill="none" stroke="currentColor" stroke-width="2"/>
        </svg>
      </div>
      <div class="mission-weapon" id="mission-ammo" role="meter" aria-label="Magazine" aria-valuemin="0" aria-valuemax="30" aria-valuenow="30">
        <span class="magazine-count" aria-hidden="true">4 ×</span>
        <svg class="magazine-icon" viewBox="0 0 64 76" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">
          <defs><path id="hud-magazine" d="M14 10L35 10L35 27C35 43 41 53 50 61L33 71C19 58 13 44 13 27Z"/><clipPath id="hud-magazine-clip"><use href="#hud-magazine"/></clipPath></defs>
          <use href="#hud-magazine" fill="var(--paper)"/>
          <g clip-path="url(#hud-magazine-clip)">
            <rect class="magazine-fill" x="10" y="10" width="44" height="61" fill="currentColor"/>
            <path d="M20 20V28C20 44 25 54 35 64M28 20V28C28 43 33 53 42 60" fill="none" stroke="var(--paper)" stroke-width="1.5"/>
          </g>
          <use href="#hud-magazine" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M12 5L37 5L37 11L12 11ZM30 70L50 58L53 62L33 74Z" fill="var(--paper)" stroke="currentColor" stroke-width="1.7"/>
        </svg>
        <svg class="magazine-reload" viewBox="0 0 24 24" aria-hidden="true" hidden fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10A8 8 0 0 0 6 6L3 9M3 4V9H8M4 14A8 8 0 0 0 18 18L21 15M16 15H21V20"/>
        </svg>
      </div>
      <div class="mission-damage" aria-hidden="true"></div>`
    document.body.append(this.root)
    this.death.className = 'mission-death'
    this.death.hidden = true
    this.death.setAttribute('aria-hidden', 'true')
    this.death.innerHTML = '<div class="death-blur"></div><div class="death-dim"></div>'
    document.body.append(this.death)
    this.escape.className = 'mission-escape'
    this.escape.hidden = true
    this.escape.setAttribute('aria-hidden', 'true')
    document.body.append(this.escape)
    this.threat = document.createElement('div')
    this.threat.className = 'mission-threat'
    this.threat.setAttribute('aria-hidden', 'true')
    this.threat.innerHTML = '<i></i><span></span>'
    this.threatLabel = this.threat.querySelector('span')!
    this.root.append(this.threat)
    this.clearThreat()
    this.health = $('#mission-health')
    this.healthFill = this.health.querySelector('.health-fill')!
    this.scope.className = 'mission-scope'
    this.scope.hidden = true
    this.scope.setAttribute('aria-hidden', 'true')
    this.scope.innerHTML = '<div class="scope-lens"><i></i><b></b><span>4×</span><small>Q − · E + · Mouse wheel</small></div>'
    this.scopeLabel = this.scope.querySelector('span')!
    document.body.append(this.scope)
    this.ammo = $('#mission-ammo')
    this.ammoFill = this.ammo.querySelector('.magazine-fill')!
    this.magazineCount = this.ammo.querySelector('.magazine-count')!
    this.reloadIcon = this.ammo.querySelector('.magazine-reload')!
    this.caption = $('#mission-caption')
    this.icon = document.createElement('span'); this.icon.className = 'action-icon'; this.icon.setAttribute('aria-hidden', 'true')
    $('#action-prompt').insertBefore(this.icon, $('#action-prompt').children[1])
    const opts = { signal: this.abort.signal }
    $('#mission-volume').addEventListener('input', e => callbacks.volume(Number((e.target as HTMLInputElement).value) / 100), opts)
    $('#mission-mute').addEventListener('change', e => callbacks.mute((e.target as HTMLInputElement).checked), opts)
    $('#mission-motion').addEventListener('change', e => { this.reducedMotion = (e.target as HTMLInputElement).checked; document.body.dataset.reducedMotion = String(this.reducedMotion) }, opts)
  }

  private buildMap(world: MissionWorld) {
    const x = (v: number) => (v + 110) * 1.55 + 12, z = (v: number) => (v + 78) * 1.55 + 12
    const point = (a: number, b: number) => `${x(a)},${z(b)}`
    const buildings: [number, number, number, number][] = [[-34,-46,28,21],[25,-7,56,13],[16,36,20,14],[55,35,12,18],[-30,30,28,8],[83,-9,17,13],[117,-17,18,24],[146,-45,10,9],[143,3,14,10],[111,-45,12,10]]
    const stationNames: Record<string,string> = { cameras: 'Security', gate: 'Exit gate', jeep: 'Jeep', hostage: 'Cells', alarm: 'Alarm', rally: 'Regroup', supply: 'Supplies', distraction: 'Bell' }
    const buildingsInk = buildings.map(([bx,bz,w,d], i) => {
      const left = x(bx-w/2), top = z(bz-d/2), width = w*1.55, height = d*1.55
      return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="url(#map-hatching)" stroke="var(--ink-light)"/>
        <path d="M${left-0.5} ${top+1}l${width+1} -0.6 -0.7 ${height-0.2}${i%2 ? '' : ` -${width-1} 0.5`}" fill="none" stroke="var(--ink)" stroke-width="0.55"/>`
    }).join('')
    return `<svg viewBox="0 0 460 260" role="img" aria-label="Field map: north is up. Rail route via water tower; service route via warehouse and workshop. East annex holds underground detention, security, jeep and exit gate." stroke-linecap="round" stroke-linejoin="round">
      <defs><pattern id="map-hatching" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="var(--paper)"/><path d="M-1 6L6 -1M1 8L8 1" stroke="var(--ink-light)" stroke-width="0.5" opacity="0.5"/></pattern></defs>
      <path d="M6 6L454 5 455 254 5 255Z M7 8L452 7" fill="var(--paper)" stroke="var(--ink-rule)"/>
      <path d="M18 32V15l-4 7m4-7 4 7" fill="none" stroke="var(--ink)"/><text x="16" y="45">N</text>
      <path d="M${point(26,-32)} L${point(165,-32)}" stroke="var(--ink-light)" stroke-width="3"/>
      <path d="M${point(-53,-51)} L${point(-48.665,-51)} L${point(-34,-51)} L${point(-34,-34)} L${point(-20,-29)} L${point(17,-28)} L${point(25,-34.2)} L${point(97,-34.2)} L${point(103,-34.2)} L${point(107,-35)} L${point(142,-35)}" stroke="var(--ink)" stroke-width="1.4" fill="none"/>
      <path d="M${point(-40,-62.3)} L${point(-53,-62.3)} L${point(-61.8,-52)} L${point(-61.8,-44)} L${point(-53,-44)} L${point(-50,-30)} L${point(-50,4)} L${point(-20,4)} L${point(-20,20.1)} L${point(-11.75,20.1)} L${point(-11.75,14)} L${point(0,13)} L${point(55,16)} L${point(99,11)} L${point(110,5)} L${point(117,-2)} L${point(117,-9)}" stroke="var(--ink)" stroke-dasharray="4 3" stroke-width="1.4" fill="none"/>
      ${buildingsInk}
      <text x="${x(-43)}" y="${z(-59)}">Mess hall</text><text x="${x(-92)}" y="${z(-50)}">Service gate</text><text x="${x(7)}" y="${z(5)}">Warehouse</text><text x="${x(64)}" y="${z(3)}">Workshop</text><text x="${x(132)}" y="${z(15)}">Barracks</text><text x="${x(108)}" y="${z(-18)}">Detention</text>
      ${world.stations.filter(s => ['cameras', 'gate', 'jeep'].includes(s.kind)).map(s => `<circle cx="${x(s.point.x)}" cy="${z(s.point.z)}" r="2.6" fill="var(--ink)"/><text text-anchor="${s.kind === 'gate' ? 'end' : 'start'}" x="${x(s.point.x)+(s.kind === 'gate' ? -5 : 5)}" y="${z(s.point.z)-5}">${s.id === SIGNALS_COMPUTER_ID ? 'Office terminal' : stationNames[s.kind]}</text>`).join('')}
      <path id="field-player" d="M0 -5 3.5 4 0 2 -3.5 4Z" fill="var(--ink-deep)" stroke="var(--paper)" stroke-width="1"/>
    </svg>`
  }

  ready() { this.menu.ready() }
  showMap() { this.menu.showMap() }
  setPlaying(playing: boolean) { this.menu.setPlaying(playing) }
  error(message: string) { this.menu.error(message) }
  notify(message: string, duration = 5, visible = false) {
    this.caption.textContent = message
    this.captionTimer = duration
    this.caption.classList.toggle('visible-notice', visible)
  }
  hurt() { this.damageTimer = 0.32 }
  hitFrom(intensity: number, direction: string) { this.incoming.pulse(intensity, direction) }
  clearThreat() { this.incoming.clear(); this.threat.hidden = true }
  reset() { this.damageTimer = 0; this.captionTimer = 0; this.root.classList.remove('hurt'); this.setScoped(false); this.clearThreat(); this.clearDeath(); this.clearEscape(); this.menu.reset() }
  setEscape(sequence: EscapeCinematic) {
    document.body.dataset.escape = sequence.menuVisible ? 'menu' : 'driving'
    this.escape.hidden = false
    this.escape.style.opacity = String(sequence.fade)
    this.root.hidden = true
    this.pause.hidden = !sequence.menuVisible
    this.pause.inert = !sequence.menuVisible
    this.pause.style.opacity = String(sequence.menuOpacity)
    if (sequence.menuVisible && !this.escapeMenuShown) {
      this.escapeMenuShown = true
      this.menu.focusPrimary()
    }
  }
  clearEscape() {
    delete document.body.dataset.escape
    this.escape.hidden = true
    this.escapeMenuShown = false
    this.pause.inert = false
    this.pause.style.removeProperty('opacity')
  }
  setDeath(sequence: PlayerDeathSequence) {
    document.body.dataset.death = sequence.menuVisible ? 'menu' : 'falling'
    this.death.hidden = false
    this.death.classList.toggle('reduced-motion', sequence.reducedMotion)
    const loss = sequence.visionLoss
    // Uniform loss of focus and light, with no vignette or circular mask.
    this.death.style.setProperty('--death-blur', `${10 * loss}px`)
    this.death.style.setProperty('--death-loss', String(0.92 * loss))
    this.pause.hidden = !sequence.menuVisible
    this.pause.inert = !sequence.menuVisible
    this.pause.style.opacity = String(sequence.menuOpacity)
    if (sequence.menuVisible && !this.deathMenuShown) {
      this.deathMenuShown = true
      this.menu.focusPrimary()
    }
  }
  clearDeath() {
    delete document.body.dataset.death
    this.death.hidden = true
    this.deathMenuShown = false
    this.pause.inert = false
    this.pause.style.removeProperty('opacity')
  }
  setScoped(scoped: boolean, magnification = 4) {
    this.scope.hidden = !scoped
    document.body.classList.toggle('mission-scoped', scoped)
    const label = `${magnification}×`
    if (this.scopeLabel.textContent !== label) this.scopeLabel.textContent = label
  }

  update(dt: number, state: MissionState, data: { playing: boolean; enabled: boolean; weapon: WeaponItem | null; reloading: boolean; position: THREE.Vector3; yaw: number; deaths: number; ready: boolean }) {
    this.root.hidden = !data.enabled || !data.playing
    const health = Math.max(0, Math.min(100, state.health))
    this.health.setAttribute('aria-valuenow', String(Math.ceil(health)))
    this.health.setAttribute('aria-valuetext', `${Math.ceil(health)} of 100`)
    this.healthFill.setAttribute('y', String(56 - 48 * health / 100))
    this.healthFill.setAttribute('height', String(48 * health / 100))
    this.ammo.hidden = !data.weapon
    this.reloadIcon.toggleAttribute('hidden', !data.reloading)
    if (data.weapon) {
      const rule = WEAPON_RULES[data.weapon.name]
      const rounds = Math.max(0, Math.min(rule.capacity, data.weapon.magazine))
      const magazines = (rounds > 0 ? 1 : 0) + Math.ceil(Math.max(0, data.weapon.reserve) / rule.capacity)
      this.magazineCount.textContent = `${magazines} ×`
      this.ammo.setAttribute('aria-label', `${rule.label} magazine`)
      this.ammo.setAttribute('aria-valuemax', String(rule.capacity))
      this.ammo.setAttribute('aria-valuenow', String(rounds))
      this.ammo.setAttribute('aria-valuetext', `${data.reloading ? 'Reloading. ' : ''}${rounds} of ${rule.capacity} rounds; ${data.weapon.reserve} in reserve; ${magazines} magazines including the loaded magazine when nonempty`)
      this.ammoFill.setAttribute('y', String(71 - 61 * rounds / rule.capacity))
      this.ammoFill.setAttribute('height', String(61 * rounds / rule.capacity))
    }
    if (data.playing) { this.captionTimer -= dt; this.damageTimer -= dt; this.incoming.update(dt) }
    this.threat.hidden = !this.incoming.visible || state.phase !== 'active'
    this.threat.dataset.direction = this.incoming.direction.toLowerCase()
    this.threat.style.setProperty('--pressure', String(this.reducedMotion ? 0 : this.incoming.strength * 0.18))
    this.threatLabel.textContent = this.incoming.direction === 'Below' ? 'Fall damage' : `Hit · ${this.incoming.direction.toLowerCase()}`
    this.caption.hidden = this.captionTimer <= 0
    this.root.classList.toggle('hurt', this.damageTimer > 0 && !this.reducedMotion)
    const kind = document.querySelector<HTMLElement>('#action-prompt')!.dataset.kind ?? 'mission'
    if (this.icon.dataset.kind !== kind) { this.icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${icons[kind] ?? icons.mission}</svg>`; this.icon.dataset.kind = kind }
    if (!data.playing) {
      this.mapDot.setAttribute('transform', `translate(${(data.position.x+110)*1.55+12},${(data.position.z+78)*1.55+12}) rotate(${-data.yaw*180/Math.PI})`)
    }
    this.menu.update(state, data)
  }
  dispose() { this.menu.dispose(); this.abort.abort(); this.clearDeath(); this.clearEscape(); this.escape.remove(); this.death.remove(); this.setScoped(false); this.scope.remove(); this.root.remove(); this.icon.remove(); delete document.body.dataset.mission }
}
