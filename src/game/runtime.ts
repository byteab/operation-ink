import * as THREE from 'three'
import { penPalette } from '../render/ballpoint'
import type { EnvironmentCamera } from '../camera'
import type { FirstPersonController } from '../player/controller'
import type { ActionTarget } from '../player/actions'
import { setDoorOpen } from '../world/doors'
import { EnemyDirector } from './ai'
import { FirstPersonWeapons } from './weapons'
import { MissionAudio } from './audio'
import { MissionHUD } from './hud'
import { MissionBlood, type BloodSnapshot } from './hit-reactions'
import { MissionImpacts } from './impacts'
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
  readonly hud: MissionHUD
  readonly escort: HostageEscort
  readonly security: SecuritySystem
  ready = false
  deaths = 0
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
  private traces: { line: THREE.Line; time: number }[] = []
  private hitFlash = 0
  private impactPoint: THREE.Vector3 | null = null
  private disposed = false
  private gunfireUntil = 0

  constructor(private scene: THREE.Scene, private camera: EnvironmentCamera,
    readonly player: FirstPersonController, readonly world: MissionWorld, private invalidate: () => void) {
    player.missionMode = true
    player.canPlay = () => this.ready && this.state.phase === 'active'
    if (!camera.perspective.parent) scene.add(camera.perspective)
    this.weapons = new FirstPersonWeapons({ scene, camera: camera.perspective, world: player.world,
      aimDistance: (origin, direction, maxDistance) => this.ai.aimDistance(origin, direction, maxDistance),
      emit: event => this.emit(event, true), onShot: shot => this.shot(shot) })
    this.blood = new MissionBlood(scene, player.world, id => {
      const enemy = this.ai?.enemies.find(candidate => candidate.spec.id === id)
      if (!enemy || enemy.state !== 'dead' || enemy.deathClip !== 'dieShotgun') return null
      return enemy.actor.rig.bones.chest.getWorldPosition(new THREE.Vector3())
    })
    this.impacts = new MissionImpacts(scene)
    player.lookSensitivity = () => this.weapons.lookSensitivity
    this.ai = new EnemyDirector({ scene, world: player.world, doors: player.actions.doors, specs: world.enemies,
      emit: event => this.emit(event, false), damagePlayer: (amount, source) => this.damage(amount, source),
      onSurfaceHit: (point, direction) => this.impacts.emit(point, direction),
      dropWeapon: item => { this.weapons.addPickup(item); this.state.kills++ }, onHit: hit => {
        this.impactPoint = hit.point.clone(); this.blood.emitHit(hit); this.audio.confirmHit(hit)
      } })
    this.hud = new MissionHUD(world, { retry: () => this.retry(), restart: () => this.restart(),
      volume: value => this.audio.setVolume(value), mute: value => this.audio.setMuted(value) })
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
    window.addEventListener('pointerdown', event => {
      if (!this.isActive() || event.target !== document.querySelector('#world')) return
      void this.audio.unlock()
      if (event.button === 0) this.weapons.trigger(true)
      if (event.button === 2) this.aiming = true
      this.invalidate()
    }, options)
    window.addEventListener('pointerup', event => {
      if (event.button === 0) this.weapons.trigger(false)
      if (event.button === 2) this.aiming = false
    }, options)
    window.addEventListener('blur', () => this.cancelInput(), options)
    document.addEventListener('pointerlockchange', () => { if (!player.playing) this.cancelInput() }, options)
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancelInput() }, options)
    void this.initialize()
  }

  private async initialize() {
    try {
      await this.ai.init()
      await this.escort.init()
      if (this.disposed) return
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

  private isActive() { return this.ready && this.state.phase === 'active' && this.player.enabled && this.player.playing && !this.player.immersive }
  private cancelInput() { this.aiming = false; this.weapons.cancel() }
  private keyDown = (event: KeyboardEvent) => {
    const zoomKey = event.code === 'KeyQ' || event.code === 'KeyE'
    if (event.ctrlKey || event.metaKey || event.altKey || (event.repeat && !zoomKey) || !this.player.enabled || this.player.immersive) return
    if (event.target instanceof HTMLElement && event.target.closest('button,input,select,textarea,summary,[contenteditable="true"]')) return
    if (event.code === 'KeyM') {
      event.preventDefault()
      if (this.player.playing) this.player.pause()
      else this.player.requestControl()
      this.cancelInput(); this.invalidate(); return
    }
    if (!this.isActive()) return
    if (zoomKey) {
      if (!this.aiming || !this.weapons.adjustScopeZoom(event.code === 'KeyE' ? 1 : -1)) return
      event.preventDefault(); this.invalidate(); return
    }
    switch (event.code) {
      case 'KeyR': this.weapons.reload(); break
      case 'Digit1': this.weapons.switchSlot(0); break
      case 'Digit2': this.weapons.switchSlot(1); break
      case 'Digit3': this.weapons.switchSlot(2); break
      case 'Digit4': this.weapons.switchSlot(3); break
      case 'KeyG': this.weapons.drop(this.player.body.position); break
      default: return
    }
    event.preventDefault(); this.invalidate()
  }

  private targets(): ActionTarget[] {
    if (!this.isActive() || this.state.jeep === 'escaping') return []
    const targets: ActionTarget[] = []
    for (const station of this.world.stations) {
      const label = stationLabel(this.state,station.kind,station.id)
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
    const result = useStation(this.state,station.kind,station.id)
    this.hud.notify(result.message,7)
    if (!result.changed) return false
    this.weapons.cancel()
    this.emit({ kind: station.kind === 'distraction' ? 'bell' : 'objective',
      position: station.point.clone(), radius: station.kind === 'distraction' ? 27 : 6 }, station.kind === 'distraction')
    if (station.kind === 'rally') this.escort.rally(this.state)
    if (station.kind === 'jeep') {
      this.player.actions.reset(); this.player.movementLocked = true
      this.camera.perspective.lookAt(new THREE.Vector3(...RESCUE_LAYOUT.escapeRoute.at(-1)!).add(new THREE.Vector3(0, 1.8, 0)))
    }
    if (this.state.phase === 'complete') { this.player.pause(); this.cancelInput() }
    this.syncWorld(); this.invalidate()
    return true
  }

  private emit(event: SoundEvent, audible: boolean) {
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
    const distance=this.player.world.rayDistance(shot.origin,shot.direction,shot.range)
    this.ai.nearMiss(shot,distance)
    this.impactPoint = null
    const hit=this.ai.hit(shot,distance)
    if (hit) this.hitFlash = 0.15
    const end=this.impactPoint ?? shot.origin.clone().addScaledVector(shot.direction,distance)
    if (!hit && distance<shot.range) {
      this.audio.play({kind:'impact',position:end,radius:18})
      this.impacts.emit(end, shot.direction)
    }
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([shot.origin,end]),new THREE.LineBasicMaterial({color:penPalette.ink,transparent:true,opacity:0.35}))
    line.userData.noCollision=true; this.scene.add(line); this.traces.push({line,time:0.055})
  }

  damage(amount: number, source?: THREE.Vector3) {
    if (!this.isActive() || !damageMission(this.state,amount)) return
    this.hud.hurt(); this.audio.play({kind:'damage'})
    this.hud.notify(source ? `Taking fire · ${this.soundDirection(source).toLowerCase()}. Break line of sight.` : 'You fell. Find a safer route.',2.5)
    if (this.state.phase==='dead') { this.deaths++; this.player.pause(); this.cancelInput() }
    this.invalidate()
  }

  private snapshot(): Checkpoint {
    return { mission:structuredClone(this.state),weapons:this.weapons.snapshot(),enemies:this.ai.snapshot(),
      doors:this.player.actions.doors.map(door=>Boolean(door.userData.open)),position:this.player.body.position.toArray() as Vec3,
      quaternion:this.camera.perspective.quaternion.toArray() as [number,number,number,number], blood:this.blood.snapshot() }
  }

  private restore(saved: Checkpoint) {
    this.player.pause(); this.cancelInput(); this.audio.reset(); this.player.actions.reset()
    this.state=structuredClone(saved.mission)
    this.player.movementLocked = false; this.gunfireUntil = 0
    this.player.actions.doors.forEach((door,i)=>setDoorOpen(door,saved.doors[i]??false,true))
    this.player.world.refresh(); this.ai.restore(structuredClone(saved.enemies)); this.weapons.restore(structuredClone(saved.weapons)); this.blood.restore(saved.blood)
    this.player.body.teleport(new THREE.Vector3(...saved.position)); this.player.actions.syncCamera(this.camera.perspective)
    this.camera.perspective.quaternion.fromArray(saved.quaternion)
    this.safePosition.copy(this.player.body.position); this.safeQuaternion.copy(this.camera.perspective.quaternion)
    this.stepTime=0; this.interactionTime=0; this.hitFlash=0; this.lastCaptionAt=-100
    this.clearTraces(); this.impacts.clear(); this.hud.reset(); this.security.reset(); this.syncWorld(true); this.invalidate()
  }

  retry() { if(this.checkpoint) { this.restore(this.checkpoint); this.hud.notify('Checkpoint restored. Resume when ready.',5) } }
  restart() {
    if(!this.initial) return
    this.checkpoint=structuredClone(this.initial); this.deaths=0; this.restore(this.initial)
    this.hud.setCheckpoint('Insertion'); this.hud.notify('Fresh mission. All equipment, patrols and objectives reset.',5)
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
        for (const wheel of rescue.jeep.userData.wheels as THREE.Group[] ?? []) wheel.rotation.z = 0
        const door = rescue.jeep.userData.passengerDoor as THREE.Group
        door.rotation.y = 0
      }
    }
    if (resetEscort) this.escort.sync(this.state)
    this.security.sync(this.state)
    if (this.state.alarm !== 'active') this.audio.setAlarm(false)
  }

  private updateEscape(dt: number) {
    if (this.state.jeep !== 'escaping') return
    const route = RESCUE_LAYOUT.escapeRoute.map(point => new THREE.Vector3(...point))
    const length = route.slice(1).reduce((sum, point, index) => sum + point.distanceTo(route[index]), 0)
    this.state.escapeProgress = Math.min(length, this.state.escapeProgress + dt * 5)
    let remaining = this.state.escapeProgress
    const position = route[0].clone()
    for (let index = 1; index < route.length; index++) {
      const distance = route[index - 1].distanceTo(route[index])
      position.copy(route[index - 1]).lerp(route[index], Math.min(1, remaining / distance))
      if (remaining <= distance) break
      remaining -= distance
    }
    this.escort.jeepOffset.copy(position).sub(route[0])
    this.world.rescue?.jeep.position.copy(position)
    const jeep = this.world.rescue?.jeep
    if (jeep) for (const wheel of jeep.userData.wheels as THREE.Group[] ?? []) wheel.rotation.z = -this.state.escapeProgress / jeep.userData.wheelRadius
    // Body position is feet-based; subtract eye height to sit at the driver's seat.
    this.player.body.teleport(position.clone().add(new THREE.Vector3(-0.35, -0.12, -0.46)))
    this.player.actions.syncCamera(this.camera.perspective)
    if (completeEscape(this.state, this.state.escapeProgress >= length && loadedCount(this.state) === this.state.hostages.length)) {
      this.player.pause(); this.cancelInput()
      this.hud.notify('Hostage safely extracted.', 8)
    }
  }

  update(dt:number) {
    const active=this.isActive()
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
    if(active!==this.active) { this.cancelInput(); this.audio.setActive(active); this.active=active }
    if(active) {
      advanceMission(this.state,dt)
      const body=this.player.body
      const bounds=this.world.bounds
      if(body.position.y < -12 || body.position.x<bounds.minX || body.position.x>bounds.maxX || body.position.z<bounds.minZ || body.position.z>bounds.maxZ) {
        body.teleport(this.safePosition); this.player.actions.syncCamera(this.camera.perspective)
        this.hud.notify('The perimeter is closed. Follow the marked routes.',3)
      }
      if (Math.abs(body.position.x - 117) < 10 && body.position.z > -31 && body.position.z < -2) this.state.detentionFound = true
      if (this.state.detentionFound && body.position.y < -2.8) this.state.cellsReached = true
      this.security.update(dt, this.state, this.camera.perspective.position)
      this.ai.update(dt,{feet:body.position,eye:this.camera.perspective.position,velocity:body.velocity,alive:this.state.phase==='active',radioEnabled:true})
      const danger = this.gunfireUntil > this.state.elapsed
      this.updateEscape(dt)
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
    }
    this.weapons.update(dt,{active:this.isActive()&&this.interactionTime===0&&this.state.jeep!=='escaping',climbing:this.player.actions.traversing,
      moving:this.player.body.velocity.length(),aiming:this.aiming,reducedMotion:this.hud.reducedMotion,feet:this.player.body.position})
    this.audio.update(this.camera.perspective)
    this.audio.setAlarm(active && this.state.alarm === 'active',
      this.state.alarmPosition ? new THREE.Vector3(...this.state.alarmPosition) : undefined)
    this.hud.setScoped(this.weapons.scoped, this.weapons.scopeMagnification)
    if(active) {
      for(const trace of this.traces) trace.time-=dt
      for(const trace of this.traces.filter(t=>t.time<=0)) { trace.line.removeFromParent();trace.line.geometry.dispose();(trace.line.material as THREE.Material).dispose() }
      this.traces=this.traces.filter(t=>t.time>0)
      this.hitFlash-=dt
    }
    const crosshair=document.querySelector<HTMLElement>('.crosshair')!
    crosshair.classList.toggle('confirmed-hit', this.hitFlash > 0)
    this.hud.update(dt,this.state,{playing:this.player.playing,enabled:this.player.enabled&&!this.player.immersive,
      label:this.weapons.label,ammo:this.weapons.ammo,reloading:this.weapons.reloading,blocked:this.weapons.blocked,
      alert:this.ai.alertLevel,position:this.player.body.position,yaw:new THREE.Euler().setFromQuaternion(this.camera.perspective.quaternion,'YXZ').y,deaths:this.deaths,ready:this.ready})
    return active
  }

  private clearTraces() { for(const trace of this.traces) { trace.line.removeFromParent();trace.line.geometry.dispose();(trace.line.material as THREE.Material).dispose() };this.traces=[] }
  dispose() { this.disposed=true;this.abort.abort();this.clearTraces();this.escort.dispose();this.weapons.dispose();this.ai.dispose();this.blood.dispose();this.impacts.dispose();this.audio.dispose();this.hud.dispose();this.player.movementLocked=false;this.player.lookSensitivity=()=>1;this.player.actions.extraTargets=()=>[];this.player.actions.onAction=()=>{} }
}
