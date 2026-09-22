import * as THREE from 'three'
import { BulletTrails } from './bullet-trails'
import { fallDamage } from './balance'
import type { EnvironmentCamera } from '../camera'
import type { FirstPersonController } from '../player/controller'
import type { ActionTarget } from '../player/actions'
import { isDoorFullyOpen, setDoorOpen } from '../world/doors'
import { EnemyDirector } from './ai'
import { FirstPersonWeapons } from './weapons'
import { MissionAudio } from './audio'
import { MissionHUD } from './hud'
import { MissionBlood, type BloodSnapshot } from './hit-reactions'
import { MissionImpacts } from './impacts'
import { PlayerHitReactions, type PlayerBulletHit } from './player-hit-reactions'
import { PlayerDeathSequence } from './player-death'
import { EscapeCinematic } from './escape-cinematic'
import { EscapeDust } from './escape-dust'
import { advanceMission, completeEscape, damageMission, initialMission, loadedCount, stationLabel, useStation, type MissionState } from './mission'
import { HostageEscort } from './hostages'
import { SecuritySystem } from './security'
import { RESCUE_LAYOUT } from './rescue-layout'
import { updateRescueJeepDoor } from './rescue-jeep'
import type { EnemySnapshot, MissionWorld, Shot, SoundEvent, Station, Vec3, WeaponSnapshot } from './types'

type Checkpoint = { mission: MissionState; weapons: WeaponSnapshot; enemies: EnemySnapshot[]; doors: boolean[]; position: Vec3; quaternion: [number,number,number,number]; blood?: BloodSnapshot }

export class MissionRuntime {
  state = initialMission()
  readonly weapons: FirstPersonWeapons
  readonly ai: EnemyDirector
  readonly audio = new MissionAudio()
  readonly blood: MissionBlood
  readonly impacts: MissionImpacts
  readonly bulletTrails: BulletTrails
  readonly playerHits = new PlayerHitReactions()
  readonly death = new PlayerDeathSequence()
  readonly escape = new EscapeCinematic()
  readonly escapeDust: EscapeDust
  readonly hud: MissionHUD
  readonly escort: HostageEscort
  readonly security: SecuritySystem
  ready = false
  readonly initialized: Promise<void>
  deaths = 0
  // Opt-in protection for staged checks; normal play always starts vulnerable.
  invincible = false
  private abort = new AbortController()
  private checkpoint: Checkpoint | null = null
  private initial: Checkpoint | null = null
  private active = false
  private aiming = false
  private stepTime = 0
  private interactionTime = 0
  private lastCaption = ''
  private lastCaptionAt = -100
  private wasVR = false
  private safePosition = new THREE.Vector3()
  private safeQuaternion = new THREE.Quaternion()
  private hitFlash = 0
  private impactPoint: THREE.Vector3 | null = null
  private disposed = false
  private gunfireUntil = 0

  constructor(scene: THREE.Scene, private camera: EnvironmentCamera,
    readonly player: FirstPersonController, readonly world: MissionWorld, private invalidate: () => void) {
    player.missionMode = true
    player.canPlay = () => this.ready && this.state.phase === 'active' && !this.escape.active
    if (!camera.perspective.parent) scene.add(camera.perspective)
    this.weapons = new FirstPersonWeapons({ scene, camera: camera.perspective, world: player.world,
      aimDistance: (origin, direction, maxDistance) => this.ai.aimDistance(origin, direction, maxDistance),
      emit: event => this.emit(event, true), onShot: shot => this.shot(shot) })
    this.blood = new MissionBlood(scene, player.world, id => {
      const enemy = this.ai?.enemies.find(candidate => candidate.spec.id === id)
      if (!enemy || enemy.state !== 'dead' || enemy.deathClip !== 'dieShotgun') return null
      return enemy.actor.rig.bones.chest.getWorldPosition(new THREE.Vector3())
    })
    this.impacts = new MissionImpacts(scene, player.world)
    this.bulletTrails = new BulletTrails(scene, 'Player bullet')
    this.escapeDust = new EscapeDust(scene)
    player.lookSensitivity = () => this.weapons.lookSensitivity
    this.ai = new EnemyDirector({ scene, world: player.world, doors: player.actions.doors, specs: world.enemies,
      emit: event => this.emit(event, false), damagePlayer: (amount, source, hit) => this.damage(amount, source, hit),
      onSurfaceHit: (point, direction, surface, weapon) => this.impacts.emit(point, direction, surface, weapon),
      dropWeapon: item => { this.weapons.addPickup(item); this.state.kills++ }, onHit: hit => {
        this.impactPoint = hit.point.clone(); this.blood.emitHit(hit); this.audio.confirmHit(hit)
      } })
    this.hud = new MissionHUD(world, {
      retry: () => { this.restart(); void this.audio.unlock(); this.player.requestControl() },
      restart: () => { this.restart(); void this.audio.unlock(); this.player.requestControl() },
      volume: value => this.audio.setVolume(value), mute: value => this.audio.setMuted(value) })
    player.onPlayingChange = playing => {
      this.hud.setPlaying(playing)
      if (this.escape.active) this.hud.setEscape(this.escape)
    }
    this.escort = new HostageEscort(scene, player.world, player.actions.doors)
    this.security = new SecuritySystem(player.world, world, this.ai, event => this.emit(event, false))
    this.syncWorld()
    player.actions.extraTargets = () => this.targets()
    player.actions.onAction = target => {
      this.weapons.cancel(); this.aiming = false; this.interactionTime = 0.25
      if (target.kind === 'door' || target.kind === 'ladder') this.emit({ kind: target.kind, position: target.point, radius: target.kind === 'door' ? 8 : 5 }, true)
    }
    const options = { signal: this.abort.signal }
    document.querySelector('#walk-start')!.addEventListener('click', () => { void this.audio.unlock() }, options)
    window.addEventListener('keydown', this.keyDown, options)
    document.querySelector('#world')!.addEventListener('wheel', event => {
      const wheel = event as WheelEvent
      if (!this.isActive() || !this.aiming || wheel.ctrlKey || wheel.metaKey || wheel.altKey) return
      if (!this.weapons.adjustScopeZoom(-Math.sign(wheel.deltaY))) return
      wheel.preventDefault()
      this.invalidate()
    }, { ...options, passive: false })
    // Toggle aim so firing never requires simultaneous mouse buttons (Magic
    // Mouse / trackpads). Mouse events also report each button independently.
    window.addEventListener('mousedown', event => {
      if (!this.isActive() || event.target !== document.querySelector('#world')) return
      void this.audio.unlock()
      if (event.button === 0) this.weapons.trigger(true)
      if (event.button === 2) {
        this.aiming = this.weapons.canAim && !this.aiming
        if (this.weapons.current && !this.weapons.canAim) this.hud.notify("You can't aim with this weapon.", 2, true)
      }
      this.invalidate()
    }, options)
    window.addEventListener('mouseup', event => {
      if (event.button === 0) this.weapons.trigger(false)
    }, options)
    window.addEventListener('blur', () => this.cancelInput(), options)
    document.addEventListener('pointerlockchange', () => { if (!player.playing) this.cancelInput() }, options)
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancelInput() }, options)
    this.initialized = this.initialize()
  }

  private async initialize() {
    try {
      await this.ai.init()
      await this.escort.init()
      if (this.disposed) return
      this.player.world.warm()
      this.escort.sync(this.state)
      const supply = this.world.stations.find(s => s.kind === 'supply')
      if (supply) {
        const point = supply.point.clone().add(new THREE.Vector3(0.7, 0, 0.65))
        const floor = this.player.world.floor(point, 0.1, 2)
        this.weapons.addPickup({ id: 'maintenance-smg', name: 'smg', magazine: 24, reserve: 48,
          position: [point.x, Number.isFinite(floor) ? floor : 0.12, point.z] })
        this.weapons.addPickup({ id: 'maintenance-sniper', name: 'sniper', magazine: 5, reserve: 15,
          position: [point.x - 1.4, Number.isFinite(floor) ? floor : 0.12, point.z + 0.6] })
      }
      this.placeAtInsertion()
      this.initial = this.snapshot()
      this.checkpoint = structuredClone(this.initial)
      this.ready = true; this.hud.ready(); this.invalidate()
    } catch (error) {
      if (this.disposed) return
      console.error('Mission loading failed', error)
      this.hud.error(`Could not load the mission: ${error instanceof Error ? error.message : String(error)}. Reload this page to retry.`)
      this.invalidate()
    }
  }

  private placeAtInsertion() {
    this.player.actions.reset()
    this.player.body.teleport(new THREE.Vector3(...this.world.spawn))
    this.player.world.refresh()
    this.player.body.update(1/60,new THREE.Vector3(),false)
    this.player.actions.syncCamera(this.camera.perspective)
    this.camera.perspective.lookAt(new THREE.Vector3(...this.world.lookAt))
    this.safePosition.copy(this.player.body.position); this.safeQuaternion.copy(this.camera.perspective.quaternion)
  }

  private isActive() { return this.ready && this.state.phase === 'active' && !this.escape.active && this.player.enabled && this.player.playing && !this.player.immersive }
  private cancelInput() { this.aiming = false; this.weapons.cancel() }
  private keyDown = (event: KeyboardEvent) => {
    if (this.escape.active) return
    const zoomKey = event.code === 'KeyQ' || event.code === 'KeyE'
    if (event.ctrlKey || event.metaKey || event.altKey || (event.repeat && !zoomKey) || !this.player.enabled || this.player.immersive) return
    if (event.target instanceof HTMLElement && event.target.closest('button,input,select,textarea,summary,[contenteditable="true"]')) return
    if (event.code === 'KeyM') {
      event.preventDefault()
      if (this.state.phase !== 'active') return
      if (this.player.playing) { this.player.pause(); this.hud.showMap() }
      else this.player.requestControl()
      this.cancelInput(); this.invalidate(); return
    }
    if (!this.isActive()) return
    if (zoomKey) {
      if (!this.aiming || !this.weapons.adjustScopeZoom(event.code === 'KeyE' ? 1 : -1)) return
      event.preventDefault(); this.invalidate(); return
    }
    switch (event.code) {
      case 'KeyR': if (this.weapons.reload()) this.aiming = false; break
      case 'Digit1': this.weapons.switchSlot(0); break
      case 'Digit2': this.weapons.switchSlot(1); break
      case 'Digit3': this.weapons.switchSlot(2); break
      case 'Digit4': this.weapons.switchSlot(3); break
      case 'KeyG': this.weapons.drop(this.player.body.position); break
      default: return
    }
    if (!this.weapons.canAim) this.aiming = false
    event.preventDefault(); this.invalidate()
  }

  private targets(): ActionTarget[] {
    if (!this.isActive() || this.state.jeep === 'escaping') return []
    const targets: ActionTarget[] = []
    for (const station of this.world.stations) {
      let label = stationLabel(this.state,station.kind,station.id)
      if (station.kind === 'jeep' && label === 'Board jeep' && this.gateOpening()) label = 'Gate opening'
      if (label) targets.push({ object: station.object, point: station.point, kind: 'mission', label,
        descending: false, use: () => this.use(station) })
    }
    for (const item of this.weapons.pickupTargets()) targets.push({ ...item, kind: 'pickup', descending: false, use: () => this.weapons.pickup(item.id) })
    return targets
  }

  private use(station: Station) {
    if (!this.isActive()) return false
    const eye = this.camera.perspective.position
    if (eye.distanceTo(station.point) > 2.65 || !this.player.world.visible(eye, station.point, station.object)) return false
    if (station.kind === 'jeep' && this.gateOpening()) {
      this.hud.notify('Wait for the exit gate to finish opening.', 3)
      return false
    }
    const result = useStation(this.state,station.kind,station.id)
    this.hud.notify(result.message,7)
    if (!result.changed) return false
    this.weapons.cancel()
    this.emit({ kind: station.kind === 'distraction' ? 'bell' : 'objective',
      position: station.point.clone(), radius: station.kind === 'distraction' ? 27 : 6 }, station.kind === 'distraction')
    if (station.kind === 'rally') this.escort.rally(this.state)
    if (station.kind === 'jeep') {
      this.beginEscape()
    }
    if (this.state.phase === 'complete') { this.player.pause(); this.cancelInput() }
    this.syncWorld(); this.invalidate()
    return true
  }

  private gateOpening() {
    return this.state.gateOpen && this.world.rescue && !isDoorFullyOpen(this.world.rescue.gate)
  }

  private emit(event: SoundEvent, audible: boolean) {
    if (this.death.active) return
    if ((event.kind.startsWith('shot-') || event.kind.startsWith('enemy-shot')) && event.position) {
      if (this.state.hostages.some(h => h.status === 'following' && event.position!.distanceTo(new THREE.Vector3(...h.position)) < 15)) this.gunfireUntil = this.state.elapsed + 1.1
    }
    const eye = this.camera.perspective.position
    const distance = event.position ? eye.distanceTo(event.position) : 0
    const inRange = !event.position || distance <= (event.radius ?? 38)
    if (inRange) this.audio.play(event)
    if (audible && event.radius && event.position) this.ai.hear(event)
    if (event.text && inRange && !event.kind.startsWith('shot-') && !event.kind.startsWith('enemy-shot')) {
      const text = event.kind === 'callout' && event.position ? `${this.soundDirection(event.position)} · “${event.text}”` : event.text
      if (text !== this.lastCaption || this.state.elapsed-this.lastCaptionAt>3) {
        this.hud.notify(text,3.5); this.lastCaption=text; this.lastCaptionAt=this.state.elapsed
      }
    }
  }

  private soundDirection(point: THREE.Vector3) {
    const relative = point.clone().sub(this.camera.perspective.position).applyQuaternion(this.camera.perspective.quaternion.clone().invert())
    return Math.abs(relative.x)>Math.abs(relative.z)*0.65 ? relative.x>0?'Right':'Left' : relative.z>0?'Behind':'Ahead'
  }

  private shot(shot: Shot) {
    if (!this.isActive()) return
    if (!shot.pelletIndex) this.state.shots++
    const surface = this.player.world.raySurface(shot.origin, shot.direction, shot.range)
    const distance = surface?.distance ?? shot.range
    this.ai.nearMiss(shot,distance)
    this.impactPoint = null
    const hit=this.ai.hit(shot,distance)
    if (hit) this.hitFlash = 0.15
    const end=this.impactPoint ?? shot.origin.clone().addScaledVector(shot.direction,distance)
    const impact = !hit && surface ? () => {
      this.audio.play({kind:'impact',position:end,radius:18})
      this.impacts.emit(end, shot.direction, surface, shot.weapon)
    } : undefined
    this.bulletTrails.emit(shot.origin, end, shot.weapon, undefined, impact)
  }

  damage(amount: number, source?: THREE.Vector3, hit?: PlayerBulletHit) {
    if (this.invincible || !this.isActive() || !damageMission(this.state,amount)) return
    if (this.state.phase !== 'dead' && !this.hud.reducedMotion) {
      const point = this.player.body.position.clone().add(new THREE.Vector3(0, 1.17, 0))
      this.playerHits.hit(hit ?? { region: source ? 'torso' : 'leg', side: 0, point,
        direction: source ? point.clone().sub(source) : new THREE.Vector3(0, 1, 0) },
        amount, this.player.body.grounded && !this.player.actions.traversing)
    }
    this.hud.hurt(); this.audio.play({kind:'damage'})
    // Share the local hurt recording, impact thump and shading for bullets and hard landings.
    this.audio.play({ kind: 'bullet-hit', intensity: Math.min(1, amount / 28) })
    this.hud.hitFrom(1, source ? this.soundDirection(source) : 'Below')
    this.hud.notify(source ? `Taking fire · ${this.soundDirection(source).toLowerCase()}. Break line of sight.` : 'You fell. Find a safer route.',2.5)
    if (this.state.phase==='dead') {
      this.playerHits.clear(); this.deaths++
      const bulletDirection = hit?.direction ?? (source ? this.camera.perspective.position.clone().sub(source) : undefined)
      this.death.begin(this.camera.perspective, this.player.body.position, this.player.world, this.hud.reducedMotion, bulletDirection)
      this.weapons.beginDeath()
      this.player.pause(); this.player.actions.reset(); this.cancelInput()
      this.player.body.velocity.set(0, 0, 0)
      this.audio.beginDeath()
      this.hud.setScoped(false); this.hud.clearThreat(); this.hud.setDeath(this.death)
    }
    this.invalidate()
  }

  private snapshot(): Checkpoint {
    return { mission:structuredClone(this.state),weapons:this.weapons.snapshot(),enemies:this.ai.snapshot(),
      doors:this.player.actions.doors.map(door=>Boolean(door.userData.open)),position:this.player.body.position.toArray() as Vec3,
      quaternion:this.camera.perspective.quaternion.toArray() as [number,number,number,number], blood:this.blood.snapshot() }
  }

  private restore(saved: Checkpoint) {
    this.escape.reset(this.camera.perspective)
    this.escapeDust.clear()
    this.death.reset(); this.weapons.resetDeath()
    this.playerHits.clear()
    this.player.pause(); this.cancelInput(); this.audio.reset(); this.player.actions.reset()
    this.state=structuredClone(saved.mission)
    this.player.movementLocked = false; this.gunfireUntil = 0
    this.player.actions.doors.forEach((door,i)=>setDoorOpen(door,saved.doors[i]??false,true))
    this.player.world.refresh(); this.ai.restore(structuredClone(saved.enemies)); this.weapons.restore(structuredClone(saved.weapons)); this.blood.restore(saved.blood)
    this.player.body.teleport(new THREE.Vector3(...saved.position)); this.player.actions.syncCamera(this.camera.perspective)
    this.camera.perspective.quaternion.fromArray(saved.quaternion)
    this.safePosition.copy(this.player.body.position); this.safeQuaternion.copy(this.camera.perspective.quaternion)
    this.stepTime=0; this.interactionTime=0; this.hitFlash=0; this.lastCaptionAt=-100
    this.bulletTrails.clear(); this.impacts.clear(); this.hud.reset(); this.security.reset(); this.syncWorld(true); this.invalidate()
  }

  retry() { if(this.checkpoint) { this.restore(this.checkpoint); this.hud.notify('Mission reset.',3) } }
  restart() {
    if(!this.initial) return
    this.checkpoint=structuredClone(this.initial); this.deaths=0; this.restore(this.initial)
    this.hud.notify('Mission restarted.',3)
  }

  private syncWorld(resetEscort = false) {
    const rescue = this.world.rescue
    if (rescue) {
      setDoorOpen(rescue.gate, this.state.gateOpen)
      rescue.cellDoors.forEach((door, index) => {
        const released = this.state.hostages[index].status !== 'captive'
        door.userData.missionLocked = !released
        setDoorOpen(door, released)
      })
      rescue.jeep.position.set(...RESCUE_LAYOUT.escapeRoute[0])
      if (resetEscort) {
        rescue.jeep.quaternion.identity()
        for (const wheel of rescue.jeep.userData.wheels as THREE.Group[] ?? []) wheel.rotation.set(0, 0, 0)
        const door = rescue.jeep.userData.passengerDoor as THREE.Group
        door.rotation.y = 0
      }
      this.player.world.refresh()
    }
    if (resetEscort) this.escort.sync(this.state)
    this.security.sync(this.state)
    if (this.state.alarm !== 'active') this.audio.setAlarm(false)
  }

  private beginEscape() {
    this.cancelInput(); this.playerHits.clear()
    this.player.actions.reset(); this.player.movementLocked = true
    this.player.body.velocity.set(0, 0, 0)
    this.weapons.update(0, { active: false, climbing: false, moving: 0, aiming: false,
      reducedMotion: this.hud.reducedMotion, feet: this.player.body.position })
    this.hud.setScoped(false); this.hud.clearThreat()
    this.bulletTrails.clear(); this.ai.bulletTrails.clear()
    this.escape.begin(this.camera.perspective)
    this.escapeDust.clear()
    this.player.pause()
    this.hud.setEscape(this.escape)
    this.audio.setAlarm(false)
  }

  private updateEscape(dt: number, elapsed: number) {
    const visible = this.player.enabled && !this.player.immersive
    const playing = visible && !document.hidden && this.escape.running
    const step = playing ? dt : 0
    const cinematicStep = playing ? elapsed : 0
    if (!visible) { this.hud.clearEscape(); this.audio.setActive(false); return false }
    this.escape.update(cinematicStep)
    const position = this.escape.position
    this.state.escapeProgress = this.escape.progress
    this.escort.jeepOffset.copy(position).sub(new THREE.Vector3(...RESCUE_LAYOUT.escapeRoute[0]))
    this.escort.jeepRotation.copy(this.escape.rotation)
    this.world.rescue?.jeep.position.copy(position)
    const jeep = this.world.rescue?.jeep
    if (jeep) {
      jeep.quaternion.copy(this.escape.rotation)
      for (const wheel of jeep.userData.wheels as THREE.Group[] ?? []) {
        wheel.rotation.y = wheel.position.x > 0 ? this.escape.steering : 0
        wheel.rotation.z = -this.state.escapeProgress / jeep.userData.wheelRadius
      }
    }
    this.escapeDust.update(cinematicStep, position, this.escape.rotation, this.escape.speed)
    // Keep the player aboard for world state, while the camera stays outside.
    this.player.body.teleport(new THREE.Vector3(-0.35, -0.12, -0.46).applyQuaternion(this.escape.rotation).add(position))
    if (playing) {
      advanceMission(this.state, step)
      this.player.world.refresh()
      this.ai.update(step, { feet: this.player.body.position, eye: this.camera.perspective.position,
        velocity: this.player.body.velocity, alive: false, radioEnabled: false })
      this.escort.update(step, this.state, this.player.body.position, false)
      if (jeep) updateRescueJeepDoor(jeep, this.state.hostages[0].position, true, step)
      this.blood.update(step); this.impacts.update(step); this.bulletTrails.update(step)
      this.security.sync(this.state, this.state.elapsed)
    }
    if (completeEscape(this.state, this.escape.crossedGate && loadedCount(this.state) === this.state.hostages.length)) {
      this.hud.notify('Hostage safely extracted.', 8)
    }
    this.escape.applyCamera(this.camera.perspective)
    this.audio.setActive(playing && !this.escape.menuVisible)
    this.audio.setAlarm(false); this.audio.update(this.camera.perspective)
    this.hud.update(step, this.state, { playing: false, enabled: true, weapon: this.weapons.current, reloading: false,
      position: this.player.body.position, yaw: 0, deaths: this.deaths, ready: this.ready })
    this.hud.setEscape(this.escape)
    return playing && this.escape.running
  }

  update(dt:number, elapsed = dt) {
    this.finishFrame()
    const landingSpeed = this.player.body.landingSpeed
    this.player.body.landingSpeed = 0
    if (this.escape.active) return this.updateEscape(dt, elapsed)
    const active=this.isActive()
    if (this.player.immersive || !this.player.enabled || this.state.phase !== 'active') {
      this.playerHits.clear(); this.hud.clearThreat()
      if (this.player.immersive || !this.player.enabled || !this.death.active) {
        this.bulletTrails.clear(); this.ai.bulletTrails.clear()
      }
    }
    if(this.player.immersive && !this.wasVR) {
      this.cancelInput()
      // Entering VR resets transit to a tower landing. Preserve that safe
      // location, rather than the previous frame's position halfway along a cable.
      this.safePosition.copy(this.player.body.position)
      this.safeQuaternion.copy(this.camera.perspective.quaternion)
    }
    if(!this.player.immersive && this.wasVR) {
      this.player.body.teleport(this.safePosition); this.player.actions.syncCamera(this.camera.perspective)
      this.camera.perspective.quaternion.copy(this.safeQuaternion)
    }
    this.wasVR=this.player.immersive
    let deathVisible = this.death.active && this.player.enabled && !this.player.immersive
    const deathPlaying = deathVisible && !this.death.menuVisible && !document.hidden
    if(active!==this.active) { this.cancelInput(); this.active=active }
    this.audio.setActive(active || deathPlaying)
    if(active) {
      advanceMission(this.state,dt)
      const body=this.player.body
      const bounds=this.world.bounds
      if(body.position.y < -12 || body.position.x<bounds.minX || body.position.x>bounds.maxX || body.position.z<bounds.minZ || body.position.z>bounds.maxZ) {
        body.teleport(this.safePosition); this.player.actions.syncCamera(this.camera.perspective)
        this.hud.notify('The perimeter is closed. Follow the marked routes.',3)
      } else if (!this.player.actions.traversing) this.damage(fallDamage(landingSpeed))
      if (Math.abs(body.position.x - 117) < 10 && body.position.z > -31 && body.position.z < -2) this.state.detentionFound = true
      if (this.state.detentionFound && body.position.y < -2.8) this.state.cellsReached = true
      this.security.update(dt, this.state, this.camera.perspective.position)
      this.ai.update(dt,{feet:body.position,eye:this.camera.perspective.position,velocity:body.velocity,alive:this.state.phase==='active',radioEnabled:true,
        yaw:new THREE.Euler().setFromQuaternion(this.camera.perspective.quaternion,'YXZ').y})
      const danger = this.gunfireUntil > this.state.elapsed
      this.escort.update(dt, this.state, body.position, danger)
      if (this.world.rescue) {
        const hostage = this.state.hostages[0]
        updateRescueJeepDoor(this.world.rescue.jeep, hostage.position, hostage.status === 'loaded', dt)
      }
      this.blood.update(dt)
      this.impacts.update(dt)
      const speed=Math.hypot(body.velocity.x,body.velocity.z)
      if(speed>0.5 && body.grounded || this.player.actions.climbing) {
        this.stepTime+=dt
        if(this.stepTime>(this.player.actions.climbing?0.5:speed>5?0.3:0.48)) {
          this.stepTime=0; this.emit({kind:this.player.actions.climbing?'ladder':'footstep',position:body.position.clone(),radius:speed>5?15:6},true)
        }
      } else this.stepTime=0
      this.safePosition.copy(body.position); this.safeQuaternion.copy(this.camera.perspective.quaternion)
      this.interactionTime=Math.max(0,this.interactionTime-dt)
    } else if (deathPlaying) {
      // Losing player control does not pause the world. Finish blood flight,
      // corpse animations and NPC movement until the actual menu opens.
      this.player.world.refresh()
      this.ai.update(dt, { feet: this.player.body.position, eye: this.camera.perspective.position,
        velocity: this.player.body.velocity, alive: false, radioEnabled: false,
        yaw: new THREE.Euler().setFromQuaternion(this.camera.perspective.quaternion, 'YXZ').y })
      this.escort.update(dt, this.state, this.player.body.position, true)
      this.blood.update(dt); this.impacts.update(dt)
      this.security.sync(this.state, this.state.elapsed + this.death.elapsed)
      if (this.world.rescue) {
        const hostage = this.state.hostages[0]
        updateRescueJeepDoor(this.world.rescue.jeep, hostage.position, hostage.status === 'loaded', dt)
      }
    }
    const reactionActive = this.isActive() && this.state.jeep !== 'escaping'
    const hitPose = this.playerHits.update(reactionActive ? dt : 0,
      new THREE.Euler().setFromQuaternion(this.camera.perspective.quaternion,'YXZ').y, this.hud.reducedMotion)
    if (reactionActive) {
      const zoom = this.aiming && this.weapons.current?.name === 'sniper' && !this.weapons.reloading ? this.weapons.scopeMagnification : 1
      this.playerHits.applyCamera(this.camera.perspective, this.player.world, 1 / zoom)
    }
    // A lethal AI hit can start the sequence inside this very update.
    deathVisible = this.death.active && this.player.enabled && !this.player.immersive
    if (deathVisible) {
      if (this.death.update(document.hidden ? 0 : dt, this.camera.perspective, this.player.world)) this.audio.play({ kind: 'player-fall' })
      this.weapons.updateDeath(this.death.elapsed, this.death.reducedMotion, this.death.hitKick, this.death.hitSide)
      this.hud.setDeath(this.death)
    } else {
      if (this.death.active) { this.death.reset(); this.weapons.resetDeath(); this.hud.clearDeath() }
      this.weapons.update(dt,{active:reactionActive&&this.interactionTime===0,climbing:this.player.actions.traversing,
        moving:this.player.body.velocity.length(),aiming:this.aiming,reducedMotion:this.hud.reducedMotion,feet:this.player.body.position,hitPose})
    }
    this.audio.update(this.camera.perspective)
    this.audio.setAlarm(this.isActive() && this.state.alarm === 'active',
      this.state.alarmPosition ? new THREE.Vector3(...this.state.alarmPosition) : undefined)
    this.hud.setScoped(this.weapons.scoped, this.weapons.scopeMagnification)
    if(active || deathPlaying) {
      this.bulletTrails.update(dt)
      this.hitFlash-=dt
    }
    const crosshair=document.querySelector<HTMLElement>('.crosshair')!
    crosshair.classList.toggle('confirmed-hit', this.hitFlash > 0)
    this.hud.update(dt,this.state,{playing:this.player.playing,enabled:this.player.enabled&&!this.player.immersive,
      weapon:this.weapons.current,reloading:this.weapons.reloading,
      position:this.player.body.position,yaw:new THREE.Euler().setFromQuaternion(this.camera.perspective.quaternion,'YXZ').y,deaths:this.deaths,ready:this.ready})
    return active || this.death.running
  }

  finishFrame() { this.playerHits.removeCamera() }
  dispose() { this.escape.reset(this.camera.perspective);this.escapeDust.dispose();this.playerHits.clear();this.disposed=true;this.abort.abort();this.bulletTrails.dispose();this.escort.dispose();this.weapons.dispose();this.ai.dispose();this.blood.dispose();this.impacts.dispose();this.audio.dispose();this.hud.dispose();this.player.movementLocked=false;this.player.onPlayingChange=()=>{};this.player.lookSensitivity=()=>1;this.player.actions.extraTargets=()=>[];this.player.actions.onAction=()=>{} }
}
