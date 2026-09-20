import * as THREE from 'three'
import { BulletTrails, bulletNearMiss } from './bullet-trails'
import { Capsule } from 'three/addons/math/Capsule.js'
import { EnemyActor, type ActorPostureSnapshot } from './actors'
import type { Posture } from '../lab/postures'
import { EnemyNavigation } from './navigation'
import { ENEMY_HEALTH, ENEMY_RUN_SPEED, ENEMY_WEAPONS as WEAPON, ENEMY_COMBAT as COMBAT, WEAPON_RULES, hitDamage, shotgunDamageMultiplier } from './balance'
import { rayCapsuleDistance, reactionClipName, type HitReaction, type HitZone } from './hit-reactions'
import { playerHitTarget, type PlayerBulletHit } from './player-hit-reactions'
import type { AIContext, EnemySnapshot, EnemySpec, EnemyState, PlayerSense, Shot, SoundEvent, Vec3, WeaponName } from './types'

const ignore = new THREE.Object3D()
const direction = new THREE.Vector3()
const eyeOffset = new THREE.Vector3(0, 1.5, 0)
// Per-frame targets for face and aim, which only read their argument.
const point = new THREE.Vector3(), aimPoint = new THREE.Vector3()
const clamp = THREE.MathUtils.clamp

/** The cone operates horizontally; occlusion is a separate, real-geometry test. */
export function insideVisionCone(from: THREE.Vector3, yaw: number, target: THREE.Vector3, range = 36, halfAngle = 55) {
  const dx = target.x - from.x, dz = target.z - from.z
  const distance = Math.hypot(dx, dz)
  return distance <= range && Math.abs(target.y - from.y) < 13 &&
    (distance < 0.1 || (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / distance >= Math.cos(halfAngle * Math.PI / 180))
}

export function audible(distance: number, radius: number, unobstructed: boolean) {
  return distance <= radius * (unobstructed ? 1 : 0.42)
}

/** Nearest positive ray hit on a world-upright enemy capsule; independent of animation triangle count. */
export function rayBodyDistance(origin: THREE.Vector3, rayDirection: THREE.Vector3, feet: THREE.Vector3) {
  const radius = 0.3, bottom = feet.y + radius, top = feet.y + 1.44
  const dx = origin.x - feet.x, dz = origin.z - feet.z
  const a = rayDirection.x * rayDirection.x + rayDirection.z * rayDirection.z
  const b = 2 * (dx * rayDirection.x + dz * rayDirection.z)
  const c = dx * dx + dz * dz - radius * radius
  let result = Infinity
  const discriminant = b * b - 4 * a * c
  if (a > 1e-8 && discriminant >= 0) {
    for (const t of [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)]) {
      const y = origin.y + rayDirection.y * t
      if (t >= 0 && y >= bottom && y <= top) result = Math.min(result, t)
    }
  }
  const ray = new THREE.Ray(origin, rayDirection)
  for (const y of [bottom, top]) {
    const hit = ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(feet.x, y, feet.z), radius), new THREE.Vector3())
    if (hit) result = Math.min(result, origin.distanceTo(hit))
  }
  return result
}

export type Tactic = 'hold' | 'cover' | 'peek' | 'flank' | 'charge' | 'retreat'

export type Enemy = {
  spec: EnemySpec
  actor: EnemyActor
  position: THREE.Vector3
  yaw: number
  health: number
  state: EnemyState
  suspicion: number
  lastKnown: THREE.Vector3 | null
  timer: number
  waypoint: number
  patrolStop: number
  path: THREE.Vector3[]
  pathTarget: THREE.Vector3 | null
  repath: number
  stuck: number
  senseTimer: number
  canSee: boolean
  lostFor: number
  shotTimer: number
  shots: number
  magazine: number
  reloadTimer: number
  calloutTimer: number
  communicationTimer: number
  wait: number
  dropped: boolean
  random: number
  reserveRoute: boolean
  alarmResponse: boolean
  alarmExit: THREE.Vector3 | null
  post: THREE.Vector3 | null
  visitedWaypoints: number
  distanceWalked: number
  footstepDistance: number
  pathFailures: number
  // Move facing travel, stop, turn with a step animation, settle, then shoot.
  tactic: Tactic
  tacticTimer: number
  tacticPoint: THREE.Vector3 | null
  burst: number
  aimTime: number
  blockedFor: number
  contactMemory: number
  suppress: number
  settledFor: number
  hitPause: number
  moveSpeed: number
  searchPoints: THREE.Vector3[]
  searchIndex: number
  woundArm: boolean
  woundLeg: boolean
  deathClip: string
  speaker: number
  noticedBodies: string[]
  scanTimer: number
  scanDuration: number
  scanCooldown: number
  scanYaw: number
  defensiveTimer: number
}

const tuple = (point: THREE.Vector3): Vec3 => [point.x, point.y, point.z]
const vector = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) ? new THREE.Vector3(...value as Vec3) : null
const number = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const NUMBERS = ['repath', 'stuck', 'senseTimer', 'lostFor', 'shotTimer', 'shots', 'magazine', 'reloadTimer', 'calloutTimer', 'communicationTimer', 'wait',
  'patrolStop', 'visitedWaypoints', 'distanceWalked', 'footstepDistance', 'pathFailures', 'tacticTimer', 'burst', 'aimTime', 'blockedFor', 'contactMemory', 'suppress', 'settledFor', 'hitPause', 'moveSpeed', 'searchIndex',
  'scanTimer', 'scanDuration', 'scanCooldown', 'scanYaw', 'defensiveTimer'] as const

export class EnemyDirector {
  readonly enemies: Enemy[] = []
  readonly navigation: EnemyNavigation
  private loaded = false
  private disposed = false
  private plans = new Map<Enemy, { target: THREE.Vector3; job: Generator<void, THREE.Vector3[]> }>()
  navigationFrameMs = 0
  navigationMaxFrameMs = 0
  private lastPlayer: PlayerSense | null = null
  private reserveDestination: THREE.Vector3 | null = null
  private elapsed = 0
  readonly bulletTrails: BulletTrails

  constructor(private context: AIContext, private actorFactory: (weapon: WeaponName) => Promise<EnemyActor> = EnemyActor.create) {
    this.navigation = new EnemyNavigation(context.world, context.doors, context.emit)
    this.bulletTrails = new BulletTrails(context.scene, 'Enemy bullet')
  }

  async init() {
    if (this.loaded) return
    // Sequential loads preserve the lab's rest-pose initialization order. Browser fetch cache reuses the GLB.
    for (let i = 0; i < this.context.specs.length; i++) {
      const spec = this.context.specs[i]
      const actor = await this.actorFactory(spec.weapon)
      if (this.disposed) { actor.dispose(); return }
      const position = new THREE.Vector3(...spec.position)
      const floor = this.navigation.floor(position)
      if (floor) position.copy(floor)
      actor.root.position.copy(position)
      actor.root.name = spec.name
      actor.root.visible = !spec.reserve
      const enemy: Enemy = {
        spec, actor, position, yaw: spec.facing ?? 0, health: ENEMY_HEALTH,
        state: spec.reserve ? 'reserve' : spec.patrol.length > 1 ? 'patrol' : 'guard',
        suspicion: 0, lastKnown: null, timer: 0, waypoint: spec.patrol.length > 1 ? 1 : 0, patrolStop: 0,
        path: [], pathTarget: null, repath: 0, stuck: 0, senseTimer: (i % 6) * 0.016,
        canSee: false, lostFor: 0, shotTimer: 0, shots: 0, magazine: WEAPON[spec.weapon].magazine, reloadTimer: 0, calloutTimer: 0,
        communicationTimer: 0, wait: 0.5 + i * 0.13, dropped: false, random: 7391 + i * 3571,
        reserveRoute: false, alarmResponse: false, alarmExit: null, post: null, visitedWaypoints: 0, distanceWalked: 0, footstepDistance: 0, pathFailures: 0,
        tactic: 'hold', tacticTimer: 0, tacticPoint: null, burst: 0, aimTime: 0, blockedFor: 0, contactMemory: 0, suppress: 0, settledFor: 0, hitPause: 0, moveSpeed: 0,
        searchPoints: [], searchIndex: 0, woundArm: false, woundLeg: false, deathClip: 'dieBody', speaker: i % 4, noticedBodies: [],
        scanTimer: 0, scanDuration: 0, scanCooldown: 0, scanYaw: 0, defensiveTimer: 0,
      }
      if (spec.patrolMode === 'perimeter') {
        enemy.wait = 2 + this.random(enemy) * 2
        this.nextPatrolStop(enemy, 0)
      }
      actor.root.rotation.y = enemy.yaw
      this.enemies.push(enemy)
      this.context.scene.add(actor.root)
    }
    this.loaded = true
  }

  get alertLevel() {
    if (this.enemies.some(enemy => enemy.state === 'combat')) return 'CONTACT — break line of sight'
    if (this.enemies.some(enemy => enemy.state === 'suspicious')) return 'SUSPICION — stay behind cover'
    if (this.enemies.some(enemy => enemy.state === 'investigate' || enemy.state === 'search')) return 'SEARCH — guards checking last contact'
    return 'UNDETECTED'
  }

  private random(enemy: Enemy) {
    enemy.random = (Math.imul(enemy.random, 1664525) + 1013904223) >>> 0
    return enemy.random / 4294967296
  }

  private say(enemy: Enemy, text: string, voice: string, force = false) {
    if (!force && enemy.calloutTimer > 0) return
    enemy.calloutTimer = 5
    this.context.emit({ kind: 'callout', position: enemy.position.clone().add(eyeOffset), radius: 55, text, voice, speaker: enemy.speaker })
  }

  private enter(enemy: Enemy, state: EnemyState) {
    if (enemy.state === state) return
    const previous = enemy.state
    enemy.state = state
    if (state === 'combat' || state === 'search') enemy.alarmExit = null
    if (state !== 'suspicious') { enemy.scanTimer = 0; enemy.actor.root.userData.alertScan = undefined }
    enemy.timer = 0
    enemy.path = []
    this.plans.delete(enemy)
    enemy.pathTarget = null
    enemy.repath = 0
    enemy.stuck = 0
    enemy.burst = 0
    // A state transition must not bypass an existing burst pause or reload.
    const reaction = enemy.spec.role === 'sniper' ? COMBAT.sniperReaction : COMBAT.reaction
    enemy.shotTimer = Math.max(enemy.shotTimer, reaction[0] + this.random(enemy) * (reaction[1] - reaction[0]))
    enemy.blockedFor = 0
    enemy.tactic = 'hold'; enemy.tacticTimer = 0; enemy.tacticPoint = null
    if (state === 'suspicious') this.say(enemy, 'Something nearby. Checking.', 'search')
    if (state === 'combat') { enemy.tacticTimer = COMBAT.openingHold; enemy.settledFor = 0; this.say(enemy, 'Contact! Open fire!', 'contact', enemy.communicationTimer <= 0); this.communicate(enemy); enemy.aimTime = 0 }
    if (state === 'investigate' && previous === 'combat') { enemy.suppress = 1.4; this.say(enemy, 'Lost him! Where did he go?', 'lost', true) }
    if (state === 'search') { this.say(enemy, 'Come out! Check the corners.', 'search'); if (enemy.spec.role !== 'sniper') this.planSearch(enemy) }
    if (state === 'patrol' || state === 'guard') {
      enemy.alarmResponse = false
      enemy.alarmExit = null
      enemy.lastKnown = null
      enemy.suspicion = 0
      enemy.lostFor = 0
      enemy.canSee = false
      enemy.suppress = 0
    }
  }

  private communicate(source: Enemy) {
    if (source.communicationTimer > 0 || !source.lastKnown) return
    source.communicationTimer = 7
    const radius = this.lastPlayer?.radioEnabled ? 58 : 20
    for (const ally of this.enemies) {
      if (ally === source || ['dead', 'reserve', 'combat'].includes(ally.state) || ally.position.distanceTo(source.position) > radius) continue
      if (!this.lastPlayer?.radioEnabled && !this.context.world.visible(source.position.clone().add(eyeOffset), ally.position.clone().add(eyeOffset), ignore)) continue
      ally.lastKnown = source.lastKnown.clone()
      ally.suspicion = Math.max(ally.suspicion, 0.4)
      ally.lostFor = 0
      this.enter(ally, 'investigate')
    }
  }

  private sees(enemy: Enemy, player: PlayerSense) {
    if (!player.alive) return false
    const origin = this.eye(enemy)
    const sniper = enemy.spec.role === 'sniper'
    const range = enemy.contactMemory > 0 ? (sniper ? COMBAT.sniperEngagedRange : COMBAT.engagedRange) :
      (sniper ? COMBAT.sniperPassiveRange : COMBAT.passiveRange)
    if (!insideVisionCone(origin, enemy.yaw, player.eye, range, enemy.state === 'combat' ? 70 : 55)) return false
    return this.context.world.visible(origin, player.eye, ignore) ||
      this.context.world.visible(origin, player.feet.clone().add(new THREE.Vector3(0, 0.95, 0)), ignore)
  }

  private speed(enemy: Enemy, base: number) { return enemy.woundLeg ? base * 0.6 : base }

  private eye(enemy: Enemy) { return enemy.actor.eye?.() ?? enemy.position.clone().add(eyeOffset) }

  private posture(enemy: Enemy) { return enemy.actor.posture ?? 'stand' }

  private transitioning(enemy: Enemy) { return (enemy.actor.postureTransitionRemaining ?? 0) > 0 }

  /** Low stances need a level supported footprint, including room for the extended limbs. */
  private postureFits(enemy: Enemy, posture: Posture) {
    if (posture === 'stand' || posture === 'crouch') return true
    const radius = posture === 'prone' ? 1.05 : 0.52
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4
      const point = enemy.position.clone().add(new THREE.Vector3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius))
      const floor = this.context.world.floor(point, 0.15, 0.25)
      if (!Number.isFinite(floor) || Math.abs(floor - enemy.position.y) > 0.12) return false
      const low = point.clone().add(new THREE.Vector3(0, 0.23, 0))
      if (!this.context.world.fits(new Capsule(low, low.clone().add(new THREE.Vector3(0, 0.32, 0)), 0.2))) return false
      if (this.enemies.some(other => other !== enemy && other.health > 0 && other.state !== 'reserve' && other.position.distanceTo(point) < 0.55)) return false
    }
    return true
  }

  private stand(enemy: Enemy) {
    // A navigation request or large tracking turn cannot cancel a defensive hold.
    if (enemy.defensiveTimer > 0 && this.posture(enemy) !== 'stand') return false
    enemy.defensiveTimer = 0
    if (this.posture(enemy) !== 'stand') {
      enemy.actor.setPosture?.('stand')
      enemy.settledFor = 0
    }
    return !this.transitioning(enemy)
  }

  /** Use the current location, so an indoor patrol can take outdoor stances after leaving. */
  private protectedPost(enemy: Enemy) {
    if (enemy.spec.role === 'sniper') return true
    let protectedArea = false
    this.context.scene.traverse(object => {
      if (protectedArea) return
      const data = object.userData
      const tower = data.kind === 'water-tower' || data.kind === 'observation-tower'
      if (!tower && !(data.footprint && (data.enterable || data.accessible))) return
      const local = object.worldToLocal(enemy.position.clone())
      if (tower) {
        const radius = data.deckRadius ?? data.deckWidth / 2
        protectedArea = Math.abs(local.y - data.deckHeight) < 1 && Math.abs(local.x) < radius + 1 && Math.abs(local.z) < radius + 1
      } else {
        const [width, depth] = data.footprint
        protectedArea = Math.abs(local.x) <= width / 2 && Math.abs(local.z) <= depth / 2
      }
    })
    // Covers rooms without footprint metadata, including the underground detention block.
    return protectedArea || this.context.world.rayDistance(enemy.position.clone().add(eyeOffset), new THREE.Vector3(0, 1, 0), 16) < 16
  }

  private noticeBody(enemy: Enemy) {
    if (enemy.state !== 'patrol' && enemy.state !== 'guard') return
    const eye = this.eye(enemy)
    for (const body of this.enemies) {
      if (body.state !== 'dead' || enemy.noticedBodies.includes(body.spec.id)) continue
      const point = body.position.clone().add(new THREE.Vector3(0, 0.3, 0))
      if (!insideVisionCone(eye, enemy.yaw, point, 12) || !this.context.world.visible(eye, point, ignore)) continue
      enemy.noticedBodies.push(body.spec.id)
      enemy.lastKnown = body.position.clone()
      enemy.suspicion = Math.max(enemy.suspicion, 0.5)
      enemy.lostFor = 0
      this.enter(enemy, 'investigate')
      this.say(enemy, 'Guard down! Check the area.', 'search')
      this.communicate(enemy)
      break
    }
  }

  private startReload(enemy: Enemy) {
    if (enemy.magazine > 0 || enemy.reloadTimer > 0) return
    enemy.reloadTimer = WEAPON[enemy.spec.weapon].reload
    enemy.shotTimer = enemy.reloadTimer
    enemy.burst = 0
    enemy.tacticTimer = 0
    this.say(enemy, 'Reloading! Cover me!', 'reload')
    this.context.emit({ kind: 'enemy-reload', position: enemy.position.clone(), radius: 5, weapon: enemy.spec.weapon })
  }

  update(dt: number, player: PlayerSense) {
    if (!this.loaded || this.disposed || dt <= 0) return
    dt = Math.min(dt, 0.05)
    this.elapsed += dt
    this.lastPlayer = player
    // Even a difficult radio investigation must not monopolize a rendered frame.
    this.advancePlans()
    this.bulletTrails.update(dt)
    for (const enemy of this.enemies) {
      if (enemy.state === 'reserve') continue
      if (enemy.state === 'dead') { enemy.actor.update(dt, 'dead', false); continue }
      if (!player.alive) enemy.canSee = false
      enemy.timer += dt
      enemy.repath -= dt
      enemy.contactMemory = Math.max(0, enemy.contactMemory - dt)
      enemy.shotTimer = Math.max(0, enemy.shotTimer - dt)
      enemy.calloutTimer -= dt
      enemy.communicationTimer -= dt
      enemy.scanCooldown = Math.max(0, enemy.scanCooldown - dt)
      enemy.scanTimer = Math.max(0, enemy.scanTimer - dt)
      enemy.defensiveTimer = Math.max(0, enemy.defensiveTimer - dt)
      if (enemy.defensiveTimer <= 0) this.stand(enemy)
      enemy.moveSpeed = 0
      if (enemy.reloadTimer > 0) {
        enemy.reloadTimer -= dt
        if (enemy.reloadTimer <= 0) {
          enemy.magazine = WEAPON[enemy.spec.weapon].magazine
          enemy.shotTimer = 0
        }
      }
      this.startReload(enemy)
      enemy.senseTimer -= dt
      if (enemy.senseTimer <= 0) {
        enemy.senseTimer = enemy.state === 'combat' ? COMBAT.senseCombat : COMBAT.senseIdle
        enemy.canSee = this.sees(enemy, player)
        // Only an actual sight query supplies a position; cached visibility never tracks a hidden player.
        if (enemy.canSee) { enemy.lastKnown = player.feet.clone(); enemy.contactMemory = COMBAT.contactMemory }
        else this.noticeBody(enemy)
      }
      if (enemy.canSee) {
        if (enemy.scanTimer > 0 && this.posture(enemy) === 'crouch') enemy.actor.setPosture?.('crouch', false)
        enemy.scanTimer = 0
        enemy.lostFor = 0
        enemy.aimTime += dt
        // Direct visual confirmation interrupts scans and investigation immediately.
        enemy.suspicion = 1
        if (enemy.state !== 'combat') this.enter(enemy, 'combat')
      } else {
        enemy.lostFor += dt
        enemy.aimTime = 0
        enemy.suspicion = Math.max(0, enemy.suspicion - dt * 0.18)
        if (enemy.state === 'suspicious' && enemy.scanTimer <= 0 && enemy.lostFor > 0.65) this.enter(enemy, 'investigate')
        // A guard that ducked into cover chose to lose sight; only a real disappearance starts the hunt.
        const relocating = ['flank', 'charge', 'retreat'].includes(enemy.tactic) && enemy.tacticPoint && enemy.tacticTimer > 0
        const patience = relocating ? 7 : enemy.tactic === 'cover' || enemy.tactic === 'peek' ? 4 : 1.5
        if (enemy.state === 'combat' && enemy.lostFor > patience) this.enter(enemy, 'investigate')
      }
      let moving = false
      if (enemy.hitPause > 0 || enemy.actor.reactionRemaining > 0 || this.transitioning(enemy)) {
        enemy.hitPause = Math.max(0, enemy.hitPause - dt)
        enemy.settledFor = 0
      } else if (enemy.state === 'combat') {
        moving = this.combat(enemy, player, dt)
      } else if (enemy.state === 'suspicious') {
        if (enemy.scanTimer > 0 && this.posture(enemy) !== 'prone' && this.posture(enemy) !== 'kneel') {
          const progress = 1 - enemy.scanTimer / enemy.scanDuration
          const yaw = enemy.scanYaw + Math.sin(progress * Math.PI * 2) * 0.7
          this.face(enemy, point.set(enemy.position.x + Math.sin(yaw), enemy.position.y, enemy.position.z + Math.cos(yaw)), dt, 2.8)
        } else if (enemy.scanTimer <= 0 && enemy.lastKnown) this.face(enemy, enemy.lastKnown, dt, 5)
      } else if (enemy.state === 'investigate') {
        if (enemy.spec.role === 'sniper') {
          if (enemy.lastKnown) this.face(enemy, enemy.lastKnown, dt, 2.2)
          if (enemy.timer > 3) this.enter(enemy, 'search')
        } else if (enemy.lastKnown) {
          const target = enemy.alarmExit ?? enemy.lastKnown
          moving = this.move(enemy, target, this.speed(enemy, enemy.suspicion >= 0.5 ? ENEMY_RUN_SPEED : 1.4), dt)
          if (!moving && !enemy.path.length) this.face(enemy, enemy.lastKnown, dt)
          if (enemy.alarmExit && enemy.position.distanceTo(enemy.alarmExit) < 1) { enemy.alarmExit = null; enemy.timer = 0 }
          else if (enemy.position.distanceTo(target) < 1 || enemy.timer > (enemy.alarmResponse ? 20 : 11)) this.enter(enemy, 'search')
        } else this.enter(enemy, 'search')
      } else if (enemy.state === 'search') {
        moving = this.search(enemy, dt)
      } else if (enemy.state === 'guard') {
        const post = enemy.post ?? point.fromArray(enemy.spec.position)
        // A queued plan reads its destination later, so it never receives the shared scratch point.
        if (enemy.position.distanceTo(post) > 0.6) moving = this.move(enemy, enemy.post ?? post.clone(), this.speed(enemy, 1.25), dt)
        else this.face(enemy, point.set(enemy.position.x + Math.sin(enemy.spec.facing ?? 0), enemy.position.y, enemy.position.z + Math.cos(enemy.spec.facing ?? 0)), dt)
      } else if (enemy.spec.patrolMode === 'perimeter') {
        moving = this.perimeterPatrol(enemy, dt)
      } else {
        const route = enemy.spec.patrol
        if (route.length) {
          const destination = new THREE.Vector3(...route[enemy.waypoint % route.length])
          if (enemy.wait > 0) enemy.wait -= dt
          else if (enemy.position.distanceTo(destination) < (enemy.reserveRoute && enemy.waypoint === route.length - 1 ? 1.25 : 0.6)) {
            enemy.waypoint = (enemy.waypoint + 1) % route.length
            enemy.visitedWaypoints++
            enemy.wait = 1.3 + this.random(enemy) * 2.2
            enemy.path = []; enemy.pathTarget = null
            if (enemy.reserveRoute && enemy.waypoint === 0) {
              enemy.reserveRoute = false
              const point = this.reserveDestination ?? destination
              const index = Math.max(0, this.context.specs.filter(spec => spec.reserve).findIndex(spec => spec.id === enemy.spec.id))
              // A detail searches different standing positions, never a single console/crowd coordinate.
              const angle = index * 2.399
              enemy.post = null
              for (const radius of [1.45, 2.1, 0.75, 2.7]) {
                const candidate = this.navigation.floor(new THREE.Vector3(point.x + Math.sin(angle) * radius, enemy.position.y, point.z + Math.cos(angle) * radius))
                if (candidate && !this.enemies.some(other => other !== enemy && other.post && other.post.distanceTo(candidate) < 0.9)) { enemy.post = candidate; break }
              }
              enemy.post ??= enemy.position.clone()
              enemy.lastKnown = enemy.post.clone()
              this.enter(enemy, 'investigate')
            }
          } else moving = this.move(enemy, destination, this.speed(enemy, 1.4), dt)
        }
      }
      enemy.actor.root.position.copy(enemy.position)
      enemy.actor.root.rotation.y = enemy.yaw
      enemy.actor.root.userData.alertScan = enemy.scanTimer > 0 && this.posture(enemy) !== 'prone' && this.posture(enemy) !== 'kneel' ? 1 - enemy.scanTimer / enemy.scanDuration : undefined
      enemy.actor.update(dt, enemy.state, moving, enemy.canSee && enemy.lastKnown ? aimPoint.copy(enemy.lastKnown).setY(enemy.lastKnown.y + 1.65) : undefined, enemy.moveSpeed)
    }
  }

  private nextPatrolStop(enemy: Enemy, from: number) {
    // Walk past intermediate points before choosing another 3–7 second lookout.
    const count = enemy.spec.patrol.length
    enemy.patrolStop = (from + 2 + Math.floor(this.random(enemy) * 4)) % count
  }

  private perimeterPatrol(enemy: Enemy, dt: number) {
    const route = enemy.spec.patrol
    if (route.length < 2) return false
    if (enemy.wait > 0) {
      enemy.wait = Math.max(0, enemy.wait - dt)
      if (enemy.visitedWaypoints > 0) {
        // Look out over the compound, rather than staring at the tank or path.
        const center = new THREE.Vector3()
        for (const point of route) center.add(new THREE.Vector3(...point))
        center.multiplyScalar(1 / route.length)
        this.face(enemy, enemy.position.clone().multiplyScalar(2).sub(center), dt, 1.8)
      }
      return false
    }
    const destination = new THREE.Vector3(...route[enemy.waypoint % route.length])
    if (enemy.position.distanceTo(destination) < 0.3) {
      if (enemy.waypoint === enemy.patrolStop) {
        enemy.wait = 3 + this.random(enemy) * 4
        this.nextPatrolStop(enemy, enemy.waypoint)
      }
      enemy.waypoint = (enemy.waypoint + 1) % route.length
      enemy.visitedWaypoints++
      enemy.path = []; enemy.pathTarget = null
      return false
    }
    return this.move(enemy, destination, this.speed(enemy, 1.25), dt)
  }

  // ---------------------------------------------------------------- combat tactics

  private squad(enemy: Enemy) {
    return this.enemies.filter(other => other !== enemy && other.state === 'combat' && other.health > 0 &&
      other.position.distanceTo(enemy.position) < 28 && other.lastKnown && enemy.lastKnown && other.lastKnown.distanceTo(enemy.lastKnown) < 12)
  }

  /** Reserve space for an ally's destination as well as its current body. */
  private availablePosition(enemy: Enemy, point: THREE.Vector3, spacing = 1.4) {
    return !this.enemies.some(other => other !== enemy && other.health > 0 && other.state !== 'reserve' &&
      (other.position.distanceTo(point) < spacing || other.tacticPoint && other.tacticPoint.distanceTo(point) < spacing))
  }

  /** Walkable point near the enemy that real geometry hides from the threat's eye. Prefers close points; `away` prefers distance from the threat. */
  private coverPoint(enemy: Enemy, threat: THREE.Vector3, away: boolean) {
    let best: THREE.Vector3 | null = null, bestScore = -Infinity, found = 0
    const offset = this.random(enemy) * Math.PI * 2
    for (let i = 0; i < 10 && found < 4; i++) {
      const angle = offset + i * 0.628
      for (const radius of [2.6, 4.6, 6.8, 9.5]) {
        const candidate = this.navigation.floor(new THREE.Vector3(enemy.position.x + Math.sin(angle) * radius, enemy.position.y, enemy.position.z + Math.cos(angle) * radius))
        if (!candidate || !this.availablePosition(enemy, candidate) || this.context.world.visible(threat, candidate.clone().add(eyeOffset), ignore) || !this.navigation.segment(enemy.position, candidate, false)) continue
        const toThreat = Math.hypot(candidate.x - threat.x, candidate.z - threat.z)
        const score = -radius * 0.35 + (away ? toThreat * 0.25 : -Math.max(0, 5 - toThreat) * 0.5)
        found++
        if (score > bestScore) { bestScore = score; best = candidate }
        break
      }
    }
    return best
  }

  /** Short step out of cover to a point that exposes the threat again. */
  private peekPoint(enemy: Enemy, threat: THREE.Vector3) {
    const forward = threat.clone().sub(enemy.position).setY(0).normalize()
    for (const [side, ahead] of [[1.4, 0.2], [-1.4, 0.2], [2, 0.8], [-2, 0.8], [0, 1.6]]) {
      const candidate = this.navigation.floor(enemy.position.clone().add(new THREE.Vector3(forward.z * side + forward.x * ahead, 0, -forward.x * side + forward.z * ahead)))
      if (!candidate || !this.availablePosition(enemy, candidate) || !this.navigation.segment(enemy.position, candidate, false)) continue
      const origin = candidate.clone().add(eyeOffset)
      if (!this.context.world.visible(threat, origin, ignore)) continue
      const ray = threat.clone().sub(origin).normalize()
      if (!this.enemies.some(other => other !== enemy && other.health > 0 && other.state !== 'reserve' && rayBodyDistance(origin, ray, other.position) < origin.distanceTo(threat))) return candidate
    }
    return null
  }

  /** A bounded run to a visible firing lane, never a chase to the player's feet. */
  private firingPosition(enemy: Enemy, known: THREE.Vector3, advance: boolean) {
    const forward = known.clone().sub(enemy.position).setY(0).normalize()
    const distance = Math.hypot(known.x - enemy.position.x, known.z - enemy.position.z)
    const ideal = enemy.spec.weapon === 'shotgun' ? 9 : enemy.spec.weapon === 'smg' ? 14 : enemy.spec.weapon === 'pistol' ? 16 : 22
    const ahead = advance ? Math.min(9, Math.max(0, distance - ideal)) : Math.min(2, Math.max(0, distance - ideal))
    const side = this.random(enemy) < 0.5 ? 1 : -1
    for (const lateral of [side * 5, -side * 5, side * 3, -side * 3]) {
      const candidate = this.navigation.floor(enemy.position.clone().addScaledVector(forward, ahead)
        .add(new THREE.Vector3(forward.z * lateral, 0, -forward.x * lateral)))
      if (!candidate || !this.availablePosition(enemy, candidate, 2.5) || !this.navigation.segment(enemy.position, candidate, false)) continue
      const origin = candidate.clone().add(eyeOffset), target = known.clone().add(eyeOffset)
      if (!this.context.world.visible(origin, target, ignore)) continue
      const ray = target.clone().sub(origin).normalize()
      if (this.enemies.some(other => other !== enemy && other.health > 0 && other.state !== 'reserve' &&
        this.bodyHit(other, origin, ray, origin.distanceTo(target)))) continue
      return candidate
    }
    return null
  }

  private chooseTactic(enemy: Enemy) {
    const known = enemy.lastKnown!
    const threatEye = known.clone().add(eyeOffset)
    const distance = enemy.position.distanceTo(known)
    const roll = this.random(enemy)
    enemy.tacticPoint = null
    if (enemy.spec.role === 'sniper') { enemy.tactic = 'hold'; enemy.tacticTimer = 4; return }
    if (enemy.reloadTimer > 0 || enemy.health < 35) {
      if (!this.context.world.visible(threatEye, enemy.position.clone().add(eyeOffset), ignore)) {
        enemy.tactic = 'hold'; enemy.tacticTimer = Math.max(1, enemy.reloadTimer + 0.3); return
      }
      enemy.tacticPoint = this.coverPoint(enemy, threatEye, true)
      if (enemy.tacticPoint) { enemy.tactic = 'cover'; enemy.tacticTimer = 5; return }
      if (enemy.reloadTimer > 0) { enemy.tactic = 'hold'; enemy.tacticTimer = enemy.reloadTimer + 0.3; return }
    }
    if (distance < 6) {
      enemy.tactic = 'hold'
      enemy.tacticTimer = 3
      return
    }
    const squad = this.squad(enemy)
    // Fixed posts retain their shelter and height while they have contact.
    if (enemy.canSee && this.protectedPost(enemy)) { enemy.tactic = 'hold'; enemy.tacticTimer = 4; return }
    const covering = squad.some(ally => ally.canSee && ally.tactic === 'hold' && ally.settledFor >= COMBAT.settle && ally.reloadTimer <= 0 && ally.magazine > 0 && ally.hitPause <= 0)
    const repositioning = squad.some(ally => ['flank', 'charge', 'cover', 'retreat', 'peek'].includes(ally.tactic))
    if (covering && !repositioning && roll < 0.6 && distance < 35 && !enemy.woundLeg) {
      const point = this.firingPosition(enemy, known, false)
      if (point) {
        enemy.tactic = 'flank'; enemy.tacticPoint = point; enemy.tacticTimer = 7
        this.say(enemy, 'Flanking! Keep him busy!', 'flank'); return
      }
    }
    // Keep a planted shooter covering the teammate who is changing angle.
    if (repositioning && enemy.canSee) {
      enemy.tactic = 'hold'; enemy.tacticTimer = 2; return
    }
    const cover = this.coverPoint(enemy, threatEye, false)
    if (cover && roll < 0.85) { enemy.tactic = 'cover'; enemy.tacticPoint = cover; enemy.tacticTimer = 5; return }
    // Only confirmed contact justifies a fast advance; teammates keep a covering lane.
    const effectiveRange = enemy.spec.weapon === 'shotgun' ? 12 : enemy.spec.weapon === 'smg' ? 18 : enemy.spec.weapon === 'pistol' ? 20 : 26
    const shouldAdvance = enemy.canSee && distance > effectiveRange && !enemy.woundLeg && (!squad.length || covering && !repositioning)
    enemy.tacticPoint = shouldAdvance ? this.firingPosition(enemy, known, true) : null
    enemy.tactic = enemy.tacticPoint ? 'charge' : 'hold'
    enemy.tacticTimer = enemy.tacticPoint ? 7 : 3.5
  }

  private combat(enemy: Enemy, player: PlayerSense, dt: number) {
    const known = enemy.lastKnown
    if (!known) return false
    // A defensive reaction keeps its planted firing window; existing burst and aim timers survive.
    if (enemy.defensiveTimer > 0) {
      enemy.tactic = 'hold'
      enemy.tacticPoint = null
      enemy.tacticTimer = Math.max(enemy.tacticTimer, enemy.defensiveTimer)
    } else enemy.tacticTimer -= dt
    // A nearby exposed threat takes priority over a long flank or advance.
    if (enemy.canSee && enemy.position.distanceTo(known) < 9 && (enemy.tactic === 'flank' || enemy.tactic === 'charge') && enemy.reloadTimer <= 0 && enemy.health >= 35) {
      enemy.tactic = 'hold'; enemy.tacticPoint = null; enemy.tacticTimer = COMBAT.openingHold
      enemy.path = []; enemy.pathTarget = null; this.plans.delete(enemy)
    }
    // Finish a live burst before moving; a reload can request shelter immediately.
    if (enemy.tacticTimer <= 0 && (enemy.burst <= 0 || !enemy.canSee || enemy.reloadTimer > 0)) this.chooseTactic(enemy)
    let moving = false
    const combatSpeed = this.speed(enemy, ENEMY_RUN_SPEED)
    switch (enemy.tactic) {
      case 'cover': case 'retreat': case 'flank': {
        const point = enemy.tacticPoint
        if (!point) { enemy.tacticTimer = 0; break }
        if (enemy.position.distanceTo(point) > 0.5) {
          moving = this.move(enemy, point, combatSpeed, dt)
          // A finished plan with no route means the point is unreachable: pick something else now.
          if (!enemy.path.length && !this.plans.has(enemy) && enemy.repath > 0) enemy.tacticTimer = 0
        } else if (enemy.tactic === 'cover') {
          if (enemy.reloadTimer > 0) { enemy.tacticTimer = Math.max(enemy.tacticTimer, enemy.reloadTimer + 0.3); break }
          // Arrived in cover: wait out the burst, then step out to fire.
          enemy.tactic = 'hold'; enemy.tacticTimer = 1.8; enemy.tacticPoint = this.peekPoint(enemy, known.clone().add(eyeOffset))
          if (enemy.tacticPoint) enemy.tactic = 'peek'
        } else {
          enemy.tactic = 'hold'; enemy.tacticPoint = null; enemy.tacticTimer = 3.5
          enemy.path = []; enemy.pathTarget = null; this.plans.delete(enemy)
          // Travel faces away from contact. Give the normal short reacquisition window
          // to turn back toward the remembered position, without learning a hidden one.
          enemy.lostFor = 0; enemy.senseTimer = 0
        }
        break
      }
      case 'peek': {
        // Step out to the exposed point and shoot; the next tactic choice usually returns to cover.
        if (enemy.tacticPoint && enemy.position.distanceTo(enemy.tacticPoint) > 0.3) {
          moving = this.move(enemy, enemy.tacticPoint, this.speed(enemy, 1.4), dt)
        } else {
          enemy.tactic = 'hold'; enemy.tacticTimer = 3
        }
        break
      }
      case 'charge': {
        if (enemy.tacticPoint && enemy.position.distanceTo(enemy.tacticPoint) > 0.5) moving = this.move(enemy, enemy.tacticPoint, combatSpeed, dt)
        else {
          enemy.tactic = 'hold'; enemy.tacticPoint = null; enemy.tacticTimer = 3.5
          enemy.path = []; enemy.pathTarget = null; this.plans.delete(enemy)
          enemy.lostFor = 0; enemy.senseTimer = 0
        }
        break
      }
      default: break
    }
    // An active route owns orientation, including while waiting on navigation or opening a door.
    const positioning = enemy.tactic !== 'hold' && !!enemy.tacticPoint && enemy.position.distanceTo(enemy.tacticPoint) > 0.5 || enemy.tactic === 'charge'
    if (!moving && !positioning) this.face(enemy, known, dt, COMBAT.turnSpeed)
    const aimYaw = Math.atan2(known.x - enemy.position.x, known.z - enemy.position.z)
    const aligned = Math.cos(aimYaw - enemy.yaw) >= Math.cos(COMBAT.aimHalfAngle)
    // Small tracking turns are valid firing poses; only locomotion or a large turn resets readiness.
    enemy.settledFor = moving || !aligned || positioning || this.transitioning(enemy) ? 0 : enemy.settledFor + dt
    if (enemy.canSee) {
      this.communicate(enemy)
      if (enemy.settledFor >= COMBAT.settle && enemy.aimTime >= COMBAT.aimDelay && enemy.shotTimer <= 0) {
        if (this.shoot(enemy, player)) enemy.blockedFor = 0
        else enemy.blockedFor += Math.max(dt, COMBAT.blockedRetry)
      }
      // A visible head over cover or a teammate in the doorway needs a new firing lane.
      if (enemy.blockedFor >= COMBAT.blockedReposition && enemy.spec.role !== 'sniper' && enemy.tactic === 'hold' && enemy.defensiveTimer <= 0) {
        const point = this.peekPoint(enemy, known.clone().add(eyeOffset))
        enemy.blockedFor = 0
        if (point) { enemy.tactic = 'peek'; enemy.tacticPoint = point; enemy.tacticTimer = 2 }
      }
    }
    return moving
  }

  // ---------------------------------------------------------------- search

  /** Up to three walkable points around the last contact, corners first; allies start from different angles. */
  private planSearch(enemy: Enemy) {
    enemy.searchPoints = []
    enemy.searchIndex = 0
    enemy.wait = 0
    const center = enemy.lastKnown ?? enemy.position
    const origin = enemy.position.clone().add(eyeOffset)
    const start = this.enemies.indexOf(enemy) * 1.2 + this.random(enemy) * 0.6
    const hidden: THREE.Vector3[] = [], open: THREE.Vector3[] = []
    for (let i = 0; i < 6; i++) {
      const angle = start + i * 1.047, radius = 2.5 + this.random(enemy) * 2.5
      const point = this.navigation.floor(new THREE.Vector3(center.x + Math.sin(angle) * radius, center.y, center.z + Math.cos(angle) * radius))
      if (!point || !this.availablePosition(enemy, point) || this.enemies.some(ally => ally !== enemy && ally.state === 'search' &&
        ally.searchPoints.slice(ally.searchIndex).some(assigned => assigned.distanceTo(point) < 2))) continue
      ;(this.context.world.visible(origin, point.clone().add(eyeOffset), ignore) ? open : hidden).push(point)
    }
    enemy.searchPoints = [...hidden, ...open].slice(0, 3)
  }

  private search(enemy: Enemy, dt: number) {
    const target = enemy.searchPoints[enemy.searchIndex]
    let moving = false
    if (target && enemy.timer < 9) {
      if (enemy.wait > 0) { enemy.wait -= dt; enemy.yaw += Math.sin(enemy.timer * 2.2) * dt * 1.4 }
      else if (enemy.position.distanceTo(target) < 0.7) { enemy.searchIndex++; enemy.wait = 1.2 + this.random(enemy) * 0.8; enemy.path = []; enemy.pathTarget = null }
      else moving = this.move(enemy, target, this.speed(enemy, 1.4), dt)
      return moving
    }
    if (!target) enemy.yaw += dt * 0.65
    if (enemy.timer > 9 || (!target && enemy.timer > 3)) {
      this.say(enemy, 'All clear. Back to post.', 'clear')
      this.enter(enemy, enemy.post ? 'guard' : enemy.spec.patrol.length > 1 ? 'patrol' : 'guard')
    }
    return moving
  }

  // ---------------------------------------------------------------- movement

  private face(enemy: Enemy, target: THREE.Vector3, dt: number, speed = 3) {
    const desired = Math.atan2(target.x - enemy.position.x, target.z - enemy.position.z)
    const difference = Math.atan2(Math.sin(desired - enemy.yaw), Math.cos(desired - enemy.yaw))
    // A planted knee or prone body cannot spin in place to follow a flanking target.
    if (Math.abs(difference) > 0.6 && (this.posture(enemy) === 'prone' || this.posture(enemy) === 'kneel')) {
      this.stand(enemy)
      return
    }
    if (this.transitioning(enemy)) return
    enemy.yaw += clamp(difference, -speed * dt, speed * dt)
  }

  /** Avoid a new overlap; an already overlapping guard may walk out of the overlap. */
  private separated(enemy: Enemy, next: THREE.Vector3, player?: THREE.Vector3) {
    for (const other of this.enemies) {
      if (other === enemy || other.state === 'dead' || other.state === 'reserve' || Math.abs(next.y - other.position.y) > 1.5) continue
      const distance = Math.hypot(next.x - other.position.x, next.z - other.position.z)
      if (distance < 0.62 && distance < Math.hypot(enemy.position.x - other.position.x, enemy.position.z - other.position.z) - 0.0001) return false
    }
    if (!player || Math.abs(next.y - player.y) >= 1.5) return true
    const distance = Math.hypot(next.x - player.x, next.z - player.z)
    return distance >= 0.62 || distance >= Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z)
  }

  private move(enemy: Enemy, destination: THREE.Vector3, speed: number, dt: number) {
    if (enemy.hitPause > 0) return false
    // Only authored perimeter patrols let a marksman leave his current post.
    // Combat, sounds and alarms never send him chasing targets off the tower.
    if (enemy.spec.role === 'sniper' && (enemy.spec.patrolMode !== 'perimeter' || enemy.state !== 'patrol')) return false
    if (!this.stand(enemy)) return false
    const recovered = this.navigation.recoverDoorOverlap(enemy.position)
    if (recovered && this.separated(enemy, recovered, this.lastPlayer?.feet)) {
      enemy.position.copy(recovered)
      enemy.path = []; enemy.pathTarget = null; enemy.repath = 0; enemy.stuck = 0
    }
    if (!enemy.pathTarget || enemy.pathTarget.distanceTo(destination) > 1.4 || (!enemy.path.length && enemy.repath <= 0 && !this.plans.has(enemy))) {
      enemy.path = []
      enemy.pathTarget = destination.clone()
      this.plans.set(enemy, { target: destination.clone(), job: this.navigation.createPlan(enemy.position, destination) })
    }
    while (enemy.path.length && enemy.position.distanceTo(enemy.path[0]) < 0.24) {
      // Reaching a corner's tolerance radius does not authorize cutting across
      // a door tip (or wall) on the way to the following waypoint.
      if (enemy.path.length > 1 && !this.navigation.segment(enemy.position, enemy.path[1])) {
        // Standing on the corner with the onward leg blocked (a congestion bypass point is only
        // checked from where it was added) would march on the spot forever: plan again from here.
        if (enemy.position.distanceTo(enemy.path[0]) < 0.01) { enemy.path = []; enemy.pathTarget = null; enemy.repath = 0; return false }
        break
      }
      enemy.path.shift()
    }
    const target = enemy.path[0]
    if (!target) return false
    this.face(enemy, target, dt)
    const heading = Math.atan2(target.x - enemy.position.x, target.z - enemy.position.z)
    const angle = Math.atan2(Math.sin(heading - enemy.yaw), Math.cos(heading - enemy.yaw))
    // Finish the planted turn first: the in-place walk/run clips only support forward travel.
    if (Math.abs(angle) > 0.08) return false
    enemy.yaw += angle
    const next = this.navigation.step(enemy.position, target, speed * dt)
    if (next && this.separated(enemy, next, this.lastPlayer?.feet)) {
      const distance = enemy.position.distanceTo(next)
      enemy.distanceWalked += distance
      enemy.moveSpeed = distance / dt
      enemy.footstepDistance += distance
      enemy.position.copy(next)
      if (enemy.footstepDistance >= 0.85) {
        enemy.footstepDistance %= 0.85
        this.context.emit({ kind: 'enemy-footstep', position: enemy.position.clone(), radius: 5 })
      }
      enemy.stuck = 0
      return true
    }
    enemy.stuck += dt
    // Wait for a blocked catwalk to clear; don't sidestep toward its open edges.
    if (enemy.spec.patrolMode === 'perimeter') return false
    if (enemy.stuck > 0.75) {
      if (!next) {
        // A door can swing across an existing route. Replan around the actual
        // leaf instead of repeatedly sidestepping back onto the blocked segment.
        enemy.path = []; enemy.pathTarget = null; enemy.repath = 0; enemy.stuck = 0
        return false
      }
      // Route around congestion by turning and walking to a bypass point on a later frame.
      const perpendicular = target.clone().sub(enemy.position).setY(0).normalize()
      const side = (enemy.spec.id.charCodeAt(enemy.spec.id.length - 1) & 1) ? 1 : -1
      for (const [lateral, forward] of [[side * 0.85, 0], [-side * 0.85, 0], [side * 0.65, -0.8], [-side * 0.65, -0.8], [0, -1.2]]) {
        const bypass = enemy.position.clone().add(new THREE.Vector3(perpendicular.z * lateral + perpendicular.x * forward, 0, -perpendicular.x * lateral + perpendicular.z * forward))
        const alternative = this.navigation.floor(bypass, false)
        if (alternative && this.navigation.segment(enemy.position, alternative, false) && this.separated(enemy, alternative, this.lastPlayer?.feet)) {
          enemy.path.unshift(alternative)
          enemy.stuck = 0
          break
        }
      }
    }
    if (enemy.stuck > 2.8) {
      enemy.path = []; enemy.pathTarget = null; enemy.repath = 0; enemy.stuck = 0
    }
    return false
  }

  private advancePlans() {
    const started = performance.now(), deadline = started + 3
    const pending = [...this.plans.entries()]
    let index = 0
    while (pending.length && performance.now() < deadline) {
      index %= pending.length
      const [enemy, plan] = pending[index]
      if (this.plans.get(enemy) !== plan) { pending.splice(index, 1); continue }
      const result = plan.job.next()
      if (result.done) {
        this.plans.delete(enemy)
        enemy.path = result.value
        enemy.pathTarget = plan.target
        enemy.repath = 1.4 + this.random(enemy) * 0.4
        if (!enemy.path.length) enemy.pathFailures++
        pending.splice(index, 1)
      } else index++
    }
    this.navigationFrameMs = performance.now() - started
    this.navigationMaxFrameMs = Math.max(this.navigationMaxFrameMs, this.navigationFrameMs)
  }

  // ---------------------------------------------------------------- shooting

  /** One round of a burst. Blind rounds go to the last contact and cannot damage: pressure, not punishment. */
  private shoot(enemy: Enemy, player: PlayerSense, blind = false) {
    if (!player.alive) return false
    if (enemy.moveSpeed > 0 || enemy.hitPause > 0 || enemy.actor.reactionRemaining > 0 || this.transitioning(enemy) || enemy.settledFor < COMBAT.settle || enemy.aimTime < COMBAT.aimDelay) return false
    const weapon = WEAPON[enemy.spec.weapon]
    if (enemy.reloadTimer > 0) return false
    if (enemy.magazine <= 0) {
      this.startReload(enemy)
      return false
    }
    // Blocked attempts are not rounds. Do not spend ammunition, burst slots or a full pause.
    enemy.shotTimer = COMBAT.blockedRetry
    // Fresh cone/occlusion checks at the damage event, not the cached perception result.
    if (!blind && !this.sees(enemy, player)) { enemy.canSee = false; enemy.aimTime = 0; enemy.senseTimer = 0; return false }
    const aimAt = blind ? enemy.lastKnown! : player.feet
    const yaw = Math.atan2(aimAt.x - enemy.position.x, aimAt.z - enemy.position.z)
    if (Math.cos(yaw - enemy.yaw) < Math.cos(COMBAT.aimHalfAngle)) return false
    const muzzle = enemy.actor.muzzle()
    const target = aimAt.clone().add(new THREE.Vector3(0, 1.12, 0))
    // Aim at the exposed head when the torso is hidden by low cover.
    if (!this.context.world.visible(muzzle, target, ignore)) {
      if (blind || !this.context.world.visible(muzzle, player.eye, ignore)) return false
      target.copy(player.eye)
    }
    let distance = muzzle.distanceTo(target)
    direction.copy(target).sub(muzzle).normalize()
    if (this.enemies.some(other => other !== enemy && other.health > 0 && other.state !== 'reserve' && this.bodyHit(other, muzzle, direction, distance))) return false
    const round = enemy.burst > 0 ? weapon.burst - enemy.burst : 0
    const recoil = round * 0.025
    const rangePenalty = enemy.spec.weapon === 'sniper' ? 0.004 : enemy.spec.weapon === 'smg' ? 0.017 : enemy.spec.weapon === 'pistol' ? 0.016 : 0.012
    const hitChance = blind ? 0 : clamp(0.72 - distance * rangePenalty - Math.min(0.18, player.velocity.length() * 0.025) - recoil - (enemy.woundArm ? 0.16 : 0) + Math.min(enemy.aimTime, 1.5) * 0.06, 0.08, 0.8)
    const hit = this.random(enemy) < hitChance
    let bodyHit: Pick<PlayerBulletHit, 'region' | 'side' | 'point'> = {
      region: target.y - player.feet.y > 1.5 ? 'head' : 'torso', side: 0, point: target.clone(),
    }
    if (hit && bodyHit.region !== 'head') {
      const candidate = playerHitTarget(player, this.random(enemy))
      // Never label an occluded limb as struck. Retain the exposed centre/head aim
      // if cover hides the sampled limb, then test the actual segment below.
      if (this.context.world.visible(muzzle, candidate.point, ignore)) {
        target.copy(candidate.point)
        bodyHit = candidate
      }
    }
    if (!hit) target.add(new THREE.Vector3((this.random(enemy) > 0.5 ? 1 : -1) * (0.7 + this.random(enemy) * (blind ? 2 : 1)), 0.2 + this.random(enemy) * (blind ? 1 : 0.6), 0))
    distance = muzzle.distanceTo(target)
    direction.copy(target).sub(muzzle).normalize()
    const range = Math.max(distance + 2, WEAPON_RULES[enemy.spec.weapon].range)
    const surface = this.context.world.raySurface(muzzle, direction, range)
    const obstruction = surface?.distance ?? range
    const hitPlayer = hit && obstruction >= muzzle.distanceTo(target) - 0.05
    const end = muzzle.clone().addScaledVector(direction, hitPlayer ? Math.min(distance, obstruction) : obstruction)
    // Avoid shooting through a friendly body standing across a doorway.
    if (this.enemies.some(other => other !== enemy && other.health > 0 && other.state !== 'reserve' && this.bodyHit(other, muzzle, direction, distance))) return false
    enemy.burst = (enemy.burst > 0 ? enemy.burst : weapon.burst) - 1
    enemy.shotTimer = enemy.burst > 0 ? weapon.gap : weapon.pause[0] + this.random(enemy) * (weapon.pause[1] - weapon.pause[0])
    enemy.shots++
    enemy.magazine--
    enemy.actor.shoot()
    // A guard's muzzle report must reach every player it can engage. The local
    // flyby is additional feedback, not a substitute for hearing the firing gun.
    const reportRange = (enemy.spec.role === 'sniper' || enemy.spec.weapon === 'sniper'
      ? COMBAT.sniperEngagedRange : COMBAT.engagedRange) + 20
    this.context.emit({ kind: `enemy-shot-${enemy.spec.weapon}`, position: muzzle.clone(), radius: reportRange })
    const near = !hitPlayer && bulletNearMiss(muzzle, end, player.eye)
    const shotDirection = direction.clone()
    const impact = !hitPlayer && surface ? () => {
      this.context.emit({ kind: 'impact', position: end.clone(), radius: 18 })
      this.context.onSurfaceHit?.(end, shotDirection, surface, enemy.spec.weapon)
    } : undefined
    this.bulletTrails.emit(muzzle, end, enemy.spec.weapon, near ? { fraction: near.fraction, fire: () => {
      // Sound arrives with the visible round. Recheck the current listener and cover,
      // including a wall alongside the path, not only the original muzzle ray.
      const eye = this.lastPlayer?.eye
      if (!eye || !this.lastPlayer?.alive) return
      const pass = bulletNearMiss(muzzle, end, eye)
      if (pass && this.context.world.visible(pass.point, eye, ignore)) {
        this.context.emit({ kind: 'enemy-bullet-whiz', position: pass.point, source: muzzle.clone(), intensity: pass.intensity, radius: 5 })
      }
    } } : undefined, impact)
    if (hitPlayer) this.context.damagePlayer(weapon.damage, enemy.position.clone(), {
      ...bodyHit, point: end.clone(), direction: direction.clone(), weapon: enemy.spec.weapon,
    })
    return true
  }

  hear(event: SoundEvent) {
    if (!event.position || !event.radius || event.kind.startsWith('enemy-') || ['callout', 'ambience', 'door'].includes(event.kind)) return
    for (const enemy of this.enemies) {
      if (['dead', 'reserve', 'combat'].includes(enemy.state)) continue
      const from = this.eye(enemy)
      const source = event.position.clone().add(new THREE.Vector3(0, 0.5, 0))
      const distance = from.distanceTo(source)
      // A visible muzzle disturbance within plausible view range is noticeable even when a
      // weapon's ordinary sound radius is shorter. It supplies a location, never a confirmed target.
      const shot = event.kind.includes('shot')
      const visibleShot = shot && insideVisionCone(from, enemy.yaw, event.position, enemy.spec.role === 'sniper' ? COMBAT.sniperEngagedRange : COMBAT.engagedRange) &&
        this.context.world.visible(from, event.position, ignore)
      // Seeing the muzzle can interrupt a near-miss scan; hearing it through cover cannot.
      if (visibleShot) {
        if (enemy.scanTimer > 0 && this.posture(enemy) === 'crouch') enemy.actor.setPosture?.('crouch', false)
        enemy.contactMemory = COMBAT.contactMemory; enemy.scanTimer = 0; enemy.senseTimer = 0
      }
      else if (enemy.scanTimer > 0) continue
      // Line of sight only decides the band between the muffled and the open radius; most guards are outside both.
      if (!visibleShot && !audible(distance, event.radius, distance > event.radius * 0.42 && distance <= event.radius &&
        this.context.world.visible(from, source, ignore))) continue
      enemy.lastKnown = event.position.clone()
      // Weapon events originate at eye/muzzle height; routes need the surface below that sound.
      const floor = this.context.world.floor(event.position, 0.38, 2.2, 0.1)
      enemy.lastKnown.y = Number.isFinite(floor) ? floor + 0.006 : enemy.position.y
      enemy.lostFor = 0
      enemy.suspicion = Math.max(enemy.suspicion, 0.25)
      this.enter(enemy, 'investigate')
      this.say(enemy, shot ? 'Gunshot! Checking the sound.' : 'Heard something. Have a look.', 'search')
    }
  }

  /** Nearest animated limb/torso/head capsule along the shot; fake actors without a rig fall back to the upright body capsule. */
  private bodyHit(enemy: Enemy, origin: THREE.Vector3, normalized: THREE.Vector3, maxDistance: number) {
    const volumes = enemy.actor.hitVolumes as EnemyActor['hitVolumes'] | undefined
    if (volumes) {
      // Broad phase around the whole animated body before the per-capsule test.
      const center = enemy.position.clone().add(new THREE.Vector3(0, 0.75, 0))
      if (rayCapsuleDistance(origin, normalized, center, center, 1.9) > maxDistance) return null
      const hit = volumes.raycast(origin, normalized, maxDistance)
      return hit && { distance: hit.distance, point: hit.point, zone: hit.zone, bone: hit.bone }
    }
    const distance = rayBodyDistance(origin, normalized, enemy.position)
    return distance <= maxDistance ? { distance, point: origin.clone().addScaledVector(normalized, distance), zone: 'torso' as HitZone, bone: undefined } : null
  }

  private nearestHit(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number) {
    let nearest: Enemy | undefined, best: ReturnType<EnemyDirector['bodyHit']> = null
    let distance = maxDistance
    const normalized = direction.clone().normalize()
    for (const enemy of this.enemies) {
      if (enemy.health <= 0 || enemy.state === 'reserve') continue
      const candidate = this.bodyHit(enemy, origin, normalized, distance)
      if (candidate && candidate.distance < distance) { nearest = enemy; best = candidate; distance = candidate.distance }
    }
    return { nearest, best, distance, normalized }
  }

  /** Read-only sight query uses the same animated volumes as damage, bounded by solid cover. */
  aimDistance(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number) {
    return this.nearestHit(origin, direction, maxDistance).distance
  }

  /** React to the travelled bullet segment, never its infinite ray or hidden shooter. */
  nearMiss(shot: Shot, maxDistance: number) {
    if (shot.direction.lengthSq() < 1e-8) return 0
    const normalized = shot.direction.clone().normalize()
    const surface = this.context.world.rayDistance(shot.origin, normalized, Math.min(maxDistance, shot.range))
    const { nearest, distance } = this.nearestHit(shot.origin, normalized, surface)
    const ray = new THREE.Ray(shot.origin, normalized)
    let count = 0
    for (const enemy of this.enemies) {
      if (enemy === nearest || enemy.health <= 0 || ['dead', 'reserve'].includes(enemy.state) || enemy.scanCooldown > 0 ||
        enemy.hitPause > 0 || enemy.actor.reactionRemaining > 0 || this.transitioning(enemy)) continue
      const bulletPoint = new THREE.Vector3(), bodyPoint = new THREE.Vector3()
      const volumes = enemy.actor.hitVolumes?.volumes() ?? [{ a: enemy.position.clone().add(new THREE.Vector3(0, 0.3, 0)),
        b: enemy.position.clone().add(new THREE.Vector3(0, 1.65, 0)) }]
      let separation = Infinity
      for (const volume of volumes) {
        const bullet = new THREE.Vector3(), body = new THREE.Vector3()
        const candidate = ray.distanceSqToSegment(volume.a, volume.b, bullet, body)
        if (candidate < separation) { separation = candidate; bulletPoint.copy(bullet); bodyPoint.copy(body) }
      }
      const along = bulletPoint.clone().sub(shot.origin).dot(normalized)
      if (separation > 0.95 ** 2 || along < 0.05 || along >= distance ||
        !this.context.world.visible(bodyPoint, bulletPoint, ignore)) continue
      const roll = this.random(enemy)
      let posture: Posture = roll < 1 / 3 ? 'crouch' : roll < 2 / 3 ? 'prone' : 'kneel'
      const threat = enemy.canSee && enemy.lastKnown ? enemy.lastKnown : shot.origin
      const tooClose = Math.hypot(threat.x - enemy.position.x, threat.z - enemy.position.z) < 14
      if (posture === 'prone' && (tooClose || this.protectedPost(enemy)) || !this.postureFits(enemy, posture)) {
        posture = this.postureFits(enemy, 'kneel') ? 'kneel' : 'crouch'
      }
      const engaged = enemy.state === 'combat' || enemy.canSee
      // A missed round supplies its local passage, never a hidden shooter's coordinates.
      // Combatants keep their confirmed contact and existing reaction/burst timing.
      if (!engaged) {
        enemy.lastKnown = bulletPoint.clone().setY(enemy.position.y)
        enemy.suspicion = Math.max(enemy.suspicion, 0.45)
        enemy.lostFor = 0
        this.enter(enemy, 'suspicious')
      }
      enemy.scanDuration = 1.95 + this.random(enemy) * 0.15
      enemy.scanTimer = engaged ? 0 : enemy.scanDuration
      enemy.defensiveTimer = posture === 'prone' ? 7 + this.random(enemy) * 1.5 : posture === 'kneel' ? 4.5 : engaged ? 2.8 : enemy.scanDuration
      enemy.scanCooldown = Math.max(6, enemy.defensiveTimer + 5)
      enemy.scanYaw = Math.atan2(bulletPoint.x - enemy.position.x, bulletPoint.z - enemy.position.z)
      enemy.settledFor = 0
      enemy.moveSpeed = 0
      enemy.path = []; enemy.pathTarget = null; this.plans.delete(enemy)
      enemy.actor.setPosture?.(posture, !engaged && posture === 'crouch')
      enemy.actor.root.userData.alertScan = !engaged && posture === 'crouch' ? 0 : undefined
      count++
    }
    return count
  }

  /** Limit authored shotgun travel to clear, level floor before a wall or platform edge. */
  private shotgunTravel(enemy: Enemy, shotDirection: THREE.Vector3) {
    const forward = shotDirection.clone().setY(0)
    if (forward.lengthSq() < 1e-8) return 0
    forward.normalize()
    let distance = 0
    // The hips travel 1.72 m; reserve another 0.8 m for the falling torso beyond them.
    for (let step = 1; step <= 26; step++) {
      const travel = step / 26 * 2.53
      const point = enemy.position.clone().addScaledVector(forward, travel)
      let clear = true
      for (const side of [-0.4, 0, 0.4]) {
        const sample = point.clone().add(new THREE.Vector3(forward.z * side, 0, -forward.x * side))
        const floor = this.context.world.floor(sample, 0.16, 0.26)
        if (!Number.isFinite(floor) || Math.abs(floor - enemy.position.y) > 0.13) { clear = false; break }
      }
      const low = point.clone().add(new THREE.Vector3(0, 0.43, 0))
      if (!clear || !this.context.world.fits(new Capsule(low, low.clone().add(new THREE.Vector3(0, 1.1, 0)), 0.4))) break
      distance = travel
    }
    return clamp((distance - 0.8 + 1e-8) / 1.73, 0, 1)
  }

  hit(shot: Shot, maxDistance: number) {
    const { nearest, best, normalized } = this.nearestHit(shot.origin, shot.direction, Math.min(maxDistance, shot.range))
    if (!nearest || !best) return false
    const falloff = shot.weapon === 'shotgun' ? shotgunDamageMultiplier(best.distance) : 1
    const damage = hitDamage(shot.weapon, best.zone, shot.damage) * falloff
    nearest.health = Math.max(0, nearest.health - damage)
    nearest.contactMemory = COMBAT.contactMemory
    nearest.canSee = false
    nearest.senseTimer = 0
    const lethal = nearest.health === 0
    const fromBehind = normalized.x * Math.sin(nearest.yaw) + normalized.z * Math.cos(nearest.yaw) > 0.25
    const reaction: HitReaction = { zone: best.zone, point: best.point, direction: normalized, lethal, bone: best.bone, weapon: shot.weapon, targetId: nearest.spec.id }
    nearest.scanTimer = 0
    nearest.actor.root.userData.alertScan = undefined
    nearest.actor.react(reactionClipName(reaction, fromBehind), lethal, normalized, lethal && shot.weapon === 'shotgun' ? this.shotgunTravel(nearest, normalized) : 1)
    if (!lethal) { nearest.hitPause = nearest.actor.reactionRemaining || 0.6; nearest.settledFor = 0; nearest.moveSpeed = 0 }
    if (lethal) nearest.deathClip = nearest.actor.deathClip
    this.context.onHit?.(reaction)
    this.context.emit({ kind: 'enemy-hit', position: best.point.clone(), radius: 14, zone: best.zone })
    this.context.emit({ kind: 'enemy-pain', position: nearest.position.clone().add(eyeOffset), radius: 38, speaker: nearest.speaker, zone: best.zone })
    if (lethal) {
      this.enter(nearest, 'dead')
      nearest.actor.update(0, 'dead', false)
      this.context.emit({ kind: 'enemy-down', position: nearest.position.clone(), radius: 5 })
      if (!nearest.dropped) {
        nearest.dropped = true
        this.context.dropWeapon({ id: `enemy-${nearest.spec.id}`, name: nearest.spec.weapon,
          magazine: nearest.magazine,
          reserve: WEAPON[nearest.spec.weapon].magazine, position: tuple(nearest.position) })
      }
      // A witness knows the body location. Only a visible muzzle identifies the shooter.
      for (const ally of this.enemies) {
        if (ally === nearest || ['dead', 'reserve', 'combat'].includes(ally.state) || ally.position.distanceTo(nearest.position) > 18) continue
        if (!this.context.world.visible(this.eye(ally), nearest.position.clone().add(new THREE.Vector3(0, 0.9, 0)), ignore)) continue
        const eye = this.eye(ally)
        const sawShooter = insideVisionCone(eye, ally.yaw, shot.origin, ally.spec.role === 'sniper' ? COMBAT.sniperEngagedRange : COMBAT.engagedRange) && this.context.world.visible(eye, shot.origin, ignore)
        ally.lastKnown = sawShooter ? shot.origin.clone().setY(this.lastPlayer?.feet.y ?? ally.position.y) : nearest.position.clone()
        if (sawShooter) ally.contactMemory = COMBAT.contactMemory
        ally.suspicion = Math.max(ally.suspicion, 0.8)
        ally.lostFor = 0
        this.enter(ally, 'investigate')
        this.say(ally, 'Man down! Man down!', 'down', true)
      }
    } else {
      if (best.zone === 'arm') nearest.woundArm = true
      if (best.zone === 'leg') nearest.woundLeg = true
      nearest.lastKnown = shot.origin.clone().setY(this.lastPlayer?.feet.y ?? nearest.position.y)
      nearest.suspicion = 1
      nearest.lostFor = 0
      // A hit supplies the disturbance location; confirmation still needs the actual cone and LOS.
      const seesShooter = this.lastPlayer ? this.sees(nearest, this.lastPlayer) : false
      this.enter(nearest, seesShooter ? 'combat' : 'investigate')
      if (nearest.state === 'combat') { nearest.shotTimer = Math.max(nearest.shotTimer, COMBAT.aimDelay); nearest.tacticTimer = COMBAT.openingHold }
      else nearest.suppress = 1.4
      this.say(nearest, 'I am hit!', 'hurt')
    }
    return true
  }

  activateReserves(radioEnabled: boolean, destination: THREE.Vector3) {
    this.reserveDestination = destination.clone()
    let remaining = radioEnabled ? 4 : 2
    for (const enemy of this.enemies) {
      if (enemy.state !== 'reserve' || remaining-- <= 0) continue
      enemy.actor.root.visible = true
      enemy.reserveRoute = true
      enemy.waypoint = 0
      enemy.wait = 0.6 * (radioEnabled ? 4 - remaining : 2 - remaining)
      this.enter(enemy, 'patrol')
      this.say(enemy, 'Inspection detail, check the signal.', 'search', true)
    }
  }

  /** A camera report is a place to investigate, never personal visual confirmation. */
  respondToAlarm(destination: THREE.Vector3, reserveCount = 0, notifyPatrols = true) {
    let activated = 0
    for (const enemy of this.enemies) {
      if (enemy.health <= 0 || enemy.state === 'dead') continue
      if (enemy.state === 'reserve') {
        if (activated >= reserveCount) continue
        activated++
        enemy.actor.root.visible = true
        enemy.reserveRoute = false
        enemy.post = new THREE.Vector3(...enemy.spec.position)
        enemy.alarmExit = enemy.spec.alarmExit ? new THREE.Vector3(...enemy.spec.alarmExit) : null
      } else if (!notifyPatrols || enemy.position.y < -1 || enemy.state === 'combat' || enemy.canSee) continue
      enemy.alarmResponse = true
      enemy.lastKnown = destination.clone()
      enemy.lostFor = 0
      enemy.suspicion = Math.max(enemy.suspicion, 0.6)
      this.enter(enemy, 'investigate')
      this.say(enemy, 'Alarm! Check the reported position.', 'search')
    }
    return activated
  }

  silenceAlarm() {
    for (const enemy of this.enemies) {
      if (!enemy.alarmResponse || ['dead', 'reserve'].includes(enemy.state)) continue
      enemy.alarmResponse = false
      enemy.alarmExit = null
      // Silencing the panel cannot make a soldier forget a player still in sight.
      if (enemy.canSee || enemy.state === 'combat') continue
      this.enter(enemy, 'search')
    }
  }

  snapshot(): EnemySnapshot[] {
    return this.enemies.map(enemy => ({
      id: enemy.spec.id, position: tuple(enemy.position), yaw: enemy.yaw, health: enemy.health,
      state: enemy.state, suspicion: enemy.suspicion, lastKnown: enemy.lastKnown ? tuple(enemy.lastKnown) : null,
      timer: enemy.timer, waypoint: enemy.waypoint, path: enemy.path.map(tuple), pathTarget: enemy.pathTarget ? tuple(enemy.pathTarget) : null, planning: this.plans.has(enemy),
      ...Object.fromEntries(NUMBERS.map(field => [field, enemy[field]])),
      random: enemy.random, dropped: enemy.dropped, reserveRoute: enemy.reserveRoute, alarmResponse: enemy.alarmResponse,
      alarmExit: enemy.alarmExit ? tuple(enemy.alarmExit) : null, post: enemy.post ? tuple(enemy.post) : null,
      canSee: enemy.canSee, tactic: enemy.tactic, tacticPoint: enemy.tacticPoint ? tuple(enemy.tacticPoint) : null,
      searchPoints: enemy.searchPoints.map(tuple), woundArm: enemy.woundArm, woundLeg: enemy.woundLeg, deathClip: enemy.deathClip,
      noticedBodies: [...enemy.noticedBodies],
      actorPosture: enemy.actor.postureSnapshot?.(),
      animationTime: enemy.actor.animationTime, elapsed: this.elapsed, reserveDestination: this.reserveDestination ? tuple(this.reserveDestination) : null,
    }))
  }

  restore(snapshot: EnemySnapshot[]) {
    this.plans.clear()
    this.navigationFrameMs = this.navigationMaxFrameMs = 0
    this.clearTraces()
    this.lastPlayer = null
    for (const saved of snapshot) {
      const enemy = this.enemies.find(candidate => candidate.spec.id === saved.id)
      if (!enemy) continue
      enemy.position.fromArray(saved.position)
      enemy.yaw = saved.yaw; enemy.health = saved.health; enemy.state = saved.state
      enemy.suspicion = saved.suspicion; enemy.lastKnown = vector(saved.lastKnown)
      enemy.timer = saved.timer; enemy.waypoint = saved.waypoint
      enemy.path = Array.isArray(saved.path) ? saved.path.map(vector).filter((point): point is THREE.Vector3 => !!point) : []
      enemy.pathTarget = vector(saved.pathTarget)
      if (saved.planning && enemy.pathTarget) this.plans.set(enemy, { target: enemy.pathTarget.clone(), job: this.navigation.createPlan(enemy.position, enemy.pathTarget) })
      enemy.post = vector(saved.post)
      for (const field of NUMBERS) enemy[field] = number(saved[field])
      enemy.random = number(saved.random, 7391)
      // Older checkpoints recorded the water marksman as a fixed guard.
      if (enemy.spec.patrolMode === 'perimeter' && saved.patrolStop === undefined) {
        this.nextPatrolStop(enemy, enemy.waypoint)
        if (enemy.state === 'guard' && !enemy.post) enemy.state = 'patrol'
      }
      enemy.canSee = !!saved.canSee; enemy.dropped = !!saved.dropped; enemy.reserveRoute = !!saved.reserveRoute
      enemy.alarmResponse = !!saved.alarmResponse
      enemy.alarmExit = vector(saved.alarmExit)
      enemy.tactic = typeof saved.tactic === 'string' && ['hold', 'cover', 'peek', 'flank', 'charge', 'retreat'].includes(saved.tactic) ? saved.tactic as Tactic : 'hold'
      enemy.tacticPoint = vector(saved.tacticPoint)
      enemy.searchPoints = Array.isArray(saved.searchPoints) ? saved.searchPoints.map(vector).filter((point): point is THREE.Vector3 => !!point) : []
      enemy.noticedBodies = Array.isArray(saved.noticedBodies) ? saved.noticedBodies.filter((id): id is string => typeof id === 'string') : []
      enemy.woundArm = !!saved.woundArm; enemy.woundLeg = !!saved.woundLeg
      enemy.deathClip = typeof saved.deathClip === 'string' ? saved.deathClip : 'dieBody'
      enemy.actor.root.position.copy(enemy.position)
      enemy.actor.root.rotation.y = enemy.yaw
      enemy.actor.root.visible = enemy.state !== 'reserve'
      enemy.actor.restore(enemy.state, number(saved.animationTime), enemy.deathClip, saved.actorPosture as ActorPostureSnapshot | undefined)
      enemy.actor.root.userData.alertScan = enemy.scanTimer > 0 && enemy.scanDuration > 0 && this.posture(enemy) !== 'prone' && this.posture(enemy) !== 'kneel' ? 1 - enemy.scanTimer / enemy.scanDuration : undefined
      this.elapsed = number(saved.elapsed)
      this.reserveDestination = vector(saved.reserveDestination)
    }
    this.navigation.clear()
  }

  private clearTraces() {
    this.bulletTrails.clear()
  }

  dispose() {
    this.disposed = true
    this.plans.clear()
    this.clearTraces()
    this.bulletTrails.dispose()
    this.enemies.forEach(enemy => enemy.actor.dispose())
    this.enemies.length = 0
    this.navigation.clear()
  }
}
