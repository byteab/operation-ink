import * as THREE from 'three'
import { loadedCount, releasedCount, missionObjective, type MissionState } from './mission'
import type { MissionWorld } from './types'
import './game.css'

const icons: Record<string, string> = {
  door: '<path d="M5 21V3h14v18M9 21V5l8 2v14M13 13h1"/>',
  ladder: '<path d="M7 2v20M17 2v20M7 5h10M7 10h10M7 15h10M7 20h10"/>',
  pickup: '<path d="M4 13v7h16v-7M12 2v13m-5-5 5 5 5-5"/>',
  mission: '<path d="M5 20V4h14v16ZM8 8h8M8 12h3m4 0h1M8 16h8"/>',
}

export class MissionHUD {
  private root = document.createElement('div')
  private abort = new AbortController()
  private objective: HTMLElement
  private detail: HTMLElement
  private health: HTMLElement
  private healthBar: HTMLElement
  private scope = document.createElement('div')
  private scopeLabel: HTMLSpanElement
  private ammo: HTMLElement
  private weapon: HTMLElement
  private alert: HTMLElement
  private caption: HTMLElement
  private title: HTMLElement
  private debrief: HTMLElement
  private mapDot: SVGElement
  private checklist: HTMLElement
  private checkpoint: HTMLElement
  private icon: HTMLElement
  private captionTimer = 0
  private start: HTMLButtonElement
  private damageTimer = 0
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(world: MissionWorld, callbacks: { retry: () => void; restart: () => void; volume: (value: number) => void; mute: (value: boolean) => void }) {
    document.body.dataset.mission = 'true'
    document.body.dataset.reducedMotion = String(this.reducedMotion)
    document.title = 'Operation Safe Return — Stickman'
    const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!
    this.start = $<HTMLButtonElement>('#walk-start')
    this.start.textContent = 'Loading the compound…'; this.start.disabled = true
    $('.walk-heading .walk-eyebrow').textContent = 'Operation Safe Return'
    $('.walk-controls').innerHTML = '<span><kbd>WASD</kbd> Move</span><span><kbd>F</kbd> Use</span><span><kbd>R</kbd> Reload</span><span><kbd>1–4</kbd> Pistol / Shotgun / AK / SMG</span><span><kbd>M</kbd> Field map</span><span><kbd>Esc</kbd> Pause</span>'
    $('#world').setAttribute('aria-label', 'Operation Safe Return tactical mission. Mouse to look, WASD move, left click fire, right click aim, F interact, R reload, M field map, Escape pause.')
    const card = $('.walk-card')
    card.innerHTML = `<div class="mission-orders"><div class="mission-number">Field orders / 01</div><h1>Operation Safe Return</h1><p class="mission-premise">One hostage.<br>One way home.</p><p>Infiltrate the east annex, release the hostage beneath detention, and escape together in the jeep.</p><ol id="mission-checklist"><li>Find detention and reach the underground cells.</li><li>Release the prisoner in cell 01.</li><li>Lead him to the jeep beside the east gate.</li><li>Open the gate, board, and escape.</li></ol><p class="mission-warning">Preparation pays: disable cameras in security and open the gate before the rescue. Alarms bring two soldiers immediately and two more after 14 seconds. No need to kill everyone.</p><div id="mission-debrief" role="status" hidden></div><div class="mission-start-slot"></div><div class="mission-recovery"><button id="mission-retry">Retry checkpoint</button><button id="mission-restart">Restart mission</button></div><small id="mission-checkpoint">Insertion checkpoint · saves last until this page closes.</small></div><div class="mission-reference"><div class="field-map">${this.buildMap(world)}</div><p class="map-legend"><span>— Rail approach</span><span>┄ Service approach</span><span>▲ Your position</span></p><p class="map-note">Rail route: use the mess-hall roof and northern siding to reach security. Quiet entry: open the west service gate beside the mess hall and follow the covered lanes. The jeep waits southeast of detention.</p><div class="mission-keys"><span><kbd>WASD</kbd> Move</span><span><kbd>Mouse</kbd> Look</span><span><kbd>Shift</kbd> Sprint / louder</span><span><kbd>Space</kbd> Jump</span><span><kbd>Left click</kbd> Fire</span><span><kbd>Right click</kbd> Hold aim</span><span><kbd>Q / E / Wheel</kbd> Scope zoom</span><span><kbd>R</kbd> Reload</span><span><kbd>1–4</kbd> Weapon slot</span><span><kbd>F</kbd> Use / pick up</span><span><kbd>G</kbd> Drop weapon</span></div><div class="mission-settings"><label>Volume <input id="mission-volume" type="range" min="0" max="100" value="55" aria-label="Volume" /></label><label><input id="mission-mute" type="checkbox" /> Mute</label><label><input id="mission-motion" type="checkbox" ${this.reducedMotion ? 'checked' : ''} /> Reduced motion</label></div><small>Retry restores the insertion checkpoint, including the hostage and security. The unarmed prisoner waits inside cell 01. Return along the marked route or use a regroup panel if he falls behind.</small></div>`
    $('.mission-start-slot').append(this.start)
    this.title = $('.walk-card h1'); this.debrief = $('#mission-debrief'); this.mapDot = document.querySelector('#field-player')!
    this.checklist = $('#mission-checklist'); this.checkpoint = $('#mission-checkpoint')
    this.root.id = 'mission-hud'
    this.root.innerHTML = '<div class="mission-objective"><span>Mission</span><strong id="mission-objective"></strong><small id="mission-detail"></small></div><div id="mission-alert" role="status"></div><div id="mission-caption" role="status"></div><div class="mission-vitals"><span>Condition</span><strong id="mission-health">100</strong></div><div class="mission-weapon"><span id="mission-weapon"></span><strong id="mission-ammo"></strong><small>Magazine / reserve</small></div><div class="mission-damage" aria-hidden="true"></div>'
    document.body.append(this.root)
    this.objective = $('#mission-objective'); this.detail = $('#mission-detail'); this.health = $('#mission-health')
    this.health.parentElement!.querySelector('span')!.textContent = 'Health'
    this.health.setAttribute('aria-label', 'Health: 100 of 100')
    this.healthBar = document.createElement('div')
    this.healthBar.className = 'mission-health-bar'
    this.healthBar.setAttribute('aria-hidden', 'true')
    this.health.parentElement!.append(this.healthBar)
    this.scope.className = 'mission-scope'
    this.scope.hidden = true
    this.scope.setAttribute('aria-hidden', 'true')
    this.scope.innerHTML = '<div class="scope-lens"><i></i><b></b><span>4×</span><small>Q − · E + · Mouse wheel</small></div>'
    this.scopeLabel = this.scope.querySelector('span')!
    document.body.append(this.scope)
    this.ammo = $('#mission-ammo'); this.weapon = $('#mission-weapon'); this.alert = $('#mission-alert'); this.caption = $('#mission-caption')
    this.icon = document.createElement('span'); this.icon.className = 'action-icon'; this.icon.setAttribute('aria-hidden', 'true')
    $('#action-prompt').insertBefore(this.icon, $('#action-prompt').children[1])
    const opts = { signal: this.abort.signal }
    $('#mission-retry').addEventListener('click', callbacks.retry, opts)
    $('#mission-restart').addEventListener('click', callbacks.restart, opts)
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
      ${world.stations.filter(s => ['cameras', 'gate', 'jeep'].includes(s.kind)).map(s => `<circle cx="${x(s.point.x)}" cy="${z(s.point.z)}" r="2.6" fill="var(--ink)"/><text text-anchor="${s.kind === 'gate' ? 'end' : 'start'}" x="${x(s.point.x)+(s.kind === 'gate' ? -5 : 5)}" y="${z(s.point.z)-5}">${stationNames[s.kind]}</text>`).join('')}
      <path id="field-player" d="M0 -5 3.5 4 0 2 -3.5 4Z" fill="var(--ink-deep)" stroke="var(--paper)" stroke-width="1"/>
    </svg>`
  }

  ready() { this.start.disabled = false; this.start.textContent = 'Begin mission' }
  error(message: string) { this.start.textContent = 'Reload to retry loading'; this.debrief.hidden = false; this.debrief.textContent = message }
  notify(message: string, duration = 5) { this.caption.textContent = message; this.captionTimer = duration }
  hurt() { this.damageTimer = 0.32 }
  reset() { this.damageTimer = 0; this.captionTimer = 0; this.root.classList.remove('hurt'); this.setScoped(false) }
  setScoped(scoped: boolean, magnification = 4) {
    this.scope.hidden = !scoped
    document.body.classList.toggle('mission-scoped', scoped)
    const label = `${magnification}×`
    if (this.scopeLabel.textContent !== label) this.scopeLabel.textContent = label
  }
  setCheckpoint(label: string) { this.checkpoint.textContent = `${label} · session checkpoint` }

  update(dt: number, state: MissionState, data: { playing: boolean; enabled: boolean; label: string; ammo: string; reloading: boolean; blocked: boolean; alert: string; position: THREE.Vector3; yaw: number; deaths: number; ready: boolean }) {
    this.root.hidden = !data.enabled || !data.playing
    this.objective.textContent = missionObjective(state)
    this.detail.textContent = `${loadedCount(state) ? 'Hostage aboard' : releasedCount(state) ? 'Hostage following' : 'Hostage captive'} · Cameras ${state.camerasActive ? 'active' : 'off'} · Gate ${state.gateOpen ? 'open' : 'closed'}`
    this.health.textContent = String(Math.ceil(state.health)); this.health.classList.toggle('danger', state.health <= 35)
    this.health.setAttribute('aria-label', `Health: ${Math.ceil(state.health)} of 100`)
    this.healthBar.style.setProperty('--health', `${Math.max(0, Math.min(100, state.health))}%`)
    this.healthBar.classList.toggle('danger', state.health <= 35)
    this.weapon.textContent = data.label; this.ammo.textContent = data.reloading ? 'Reloading…' : data.ammo
    this.alert.textContent = state.alarm === 'active' ? 'ALARM · Barracks responding' : state.alarm === 'silenced' ? 'Alarm silenced · Guards searching' : data.blocked ? 'Weapon obstructed · step back' : ['routine','clear','UNDETECTED'].includes(data.alert) ? '' : data.alert
    if (data.playing) { this.captionTimer -= dt; this.damageTimer -= dt }
    this.caption.hidden = this.captionTimer <= 0
    this.root.classList.toggle('hurt', this.damageTimer > 0 && !this.reducedMotion)
    const kind = document.querySelector<HTMLElement>('#action-prompt')!.dataset.kind ?? 'mission'
    if (this.icon.dataset.kind !== kind) { this.icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${icons[kind] ?? icons.mission}</svg>`; this.icon.dataset.kind = kind }
    if (!data.playing) {
      this.mapDot.setAttribute('transform', `translate(${(data.position.x+110)*1.55+12},${(data.position.z+78)*1.55+12}) rotate(${-data.yaw*180/Math.PI})`)
      const flags = [state.cellsReached,releasedCount(state) === state.hostages.length,loadedCount(state) === state.hostages.length,state.phase==='complete']
      Array.from(this.checklist.children).forEach((li,i)=>li.classList.toggle('complete',flags[i]))
      this.title.textContent = state.phase === 'complete' ? 'Everyone is coming home.' : state.phase === 'dead' ? 'No way through.' : 'Operation Safe Return'
      this.start.hidden = state.phase !== 'active'
      if (!data.ready) this.start.disabled = true
      this.debrief.hidden = state.phase === 'active'
      if (!this.debrief.hidden) this.debrief.textContent = `${state.phase === 'complete' ? 'Hostage extracted. You both made it out.' : 'Retry the checkpoint, or start again with a fresh plan.'} ${Math.floor(state.elapsed/60)}:${String(Math.floor(state.elapsed%60)).padStart(2,'0')} active time · ${state.kills} enemies defeated · ${data.deaths} deaths.`
    }
  }
  dispose() { this.abort.abort(); this.setScoped(false); this.scope.remove(); this.root.remove(); this.icon.remove(); delete document.body.dataset.mission }
}
