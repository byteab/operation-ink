import * as THREE from 'three'
import type { BoneName, Rig } from '../lab/rig'
import { bloodPalette, createStampSurface } from '../lab/fx/blood-stamps'
import type { CollisionWorld } from '../player/collision'
import type { Vec3, WeaponName } from './types'

export type HitZone = 'head' | 'torso' | 'arm' | 'leg'
export type ActorHit = { distance: number; point: THREE.Vector3; zone: HitZone; bone: BoneName }
export type HitReaction = { zone: HitZone; point: THREE.Vector3; direction: THREE.Vector3; lethal: boolean; bone?: BoneName; weapon?: WeaponName; targetId?: string }
export type ActorReactionSnapshot = { clip: string; elapsed: number; zone: HitZone; lethal: boolean }
export type HitVolume = { a: THREE.Vector3; b: THREE.Vector3; radius: number; zone: HitZone; bone: BoneName }

/** Nearest surface of a capsule; direction must be normalized. End spheres handle parallel rays. */
export function rayCapsuleDistance(origin: THREE.Vector3, direction: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  const axis = b.clone().sub(a), offset = origin.clone().sub(a)
  const length = axis.lengthSq(), alongRay = axis.dot(direction), alongOrigin = axis.dot(offset)
  const nearest = length ? THREE.MathUtils.clamp(alongOrigin / length, 0, 1) : 0
  if (offset.clone().addScaledVector(axis, -nearest).lengthSq() <= radius * radius) return 0
  let result = Infinity
  const ray = new THREE.Ray(origin, direction), hit = new THREE.Vector3()
  for (const center of [a, b]) if (ray.intersectSphere(new THREE.Sphere(center, radius), hit)) result = Math.min(result, hit.distanceTo(origin))
  const aa = length - alongRay * alongRay
  const bb = length * offset.dot(direction) - alongOrigin * alongRay
  const cc = length * (offset.lengthSq() - radius * radius) - alongOrigin * alongOrigin
  const discriminant = bb * bb - aa * cc
  if (aa > 1e-10 && discriminant >= 0) {
    const t = (-bb - Math.sqrt(discriminant)) / aa
    const y = alongOrigin + t * alongRay
    if (t >= 0 && y >= 0 && y <= length) result = Math.min(result, t)
  }
  return result
}

/** Small volumes follow the rendered skeleton, including leaning, raised arms and falling poses. */
export class AnimatedHitVolumes {
  constructor(private rig: Rig) {}

  volumes(): HitVolume[] {
    this.rig.root.updateMatrixWorld(true)
    const scale = this.rig.root.getWorldScale(new THREE.Vector3()).x
    const point = (bone: BoneName, y = 0) => this.rig.bones[bone].localToWorld(new THREE.Vector3(0, y, 0))
    const result: HitVolume[] = []
    const add = (bone: BoneName, end: BoneName | number, radius: number, zone: HitZone, start = 0) => result.push({
      a: point(bone, start), b: typeof end === 'number' ? point(bone, end) : point(end), radius: radius * scale, zone, bone,
    })
    add('head', 0.205, 0.205, 'head', 0.205)
    add('hips', 'spine', 0.095, 'torso')
    add('spine', 'chest', 0.105, 'torso')
    add('chest', 'neck', 0.11, 'torso')
    add('neck', 'head', 0.063, 'torso')
    for (const side of ['L', 'R'] as const) {
      add(`upper_arm.${side}`, `forearm.${side}`, 0.055, 'arm')
      add(`forearm.${side}`, `hand.${side}`, 0.05, 'arm')
      add(`hand.${side}`, 0.075, 0.054, 'arm')
      add(`thigh.${side}`, `shin.${side}`, 0.07, 'leg')
      add(`shin.${side}`, 0.36, 0.062, 'leg')
    }
    return result
  }

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): ActorHit | null {
    if (direction.lengthSq() < 1e-10) return null
    const normalized = direction.clone().normalize()
    let closest: ActorHit | null = null
    for (const volume of this.volumes()) {
      const distance = rayCapsuleDistance(origin, normalized, volume.a, volume.b, volume.radius)
      if (distance <= maxDistance && (!closest || distance < closest.distance)) closest = {
        distance, point: origin.clone().addScaledVector(normalized, distance), zone: volume.zone, bone: volume.bone,
      }
    }
    return closest
  }
}

export function reactionClipName(hit: Pick<HitReaction, 'zone' | 'lethal' | 'bone' | 'weapon'>, fromBehind: boolean) {
  if (hit.lethal && hit.weapon === 'shotgun') return 'dieShotgun'
  const region = { head: 'Head', torso: 'Body', arm: 'Arm', leg: 'Leg' }[hit.zone]
  const base = hit.lethal && hit.zone === 'torso' && fromBehind ? 'dieBack' : `${hit.lethal ? 'die' : 'flinch'}${region}`
  return `${base}${(hit.zone === 'arm' || hit.zone === 'leg') && hit.bone?.endsWith('.L') ? 'Left' : ''}`
}

/** Mirror the lab's authored right-limb reactions without changing or sharing their tracks. */
export function mirrorReactionClip(clip: THREE.AnimationClip, rig: Rig) {
  const result = clip.clone()
  result.name = `${clip.name}Left`
  const names = Object.keys(rig.bones) as BoneName[]
  for (const track of result.tracks) {
    const name = names.find(bone => track.name.startsWith(`${rig.rest[bone].node}.`))
    if (!name) continue
    const mirror = (name.endsWith('.L') ? name.replace('.L', '.R') : name.endsWith('.R') ? name.replace('.R', '.L') : name) as BoneName
    track.name = track.name.replace(rig.rest[name].node, rig.rest[mirror].node)
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      for (let i = 0; i < track.values.length; i += 4) {
        const local = rig.rest[name].quat.clone().invert().multiply(new THREE.Quaternion().fromArray(track.values, i))
        const euler = new THREE.Euler().setFromQuaternion(local, 'ZYX')
        const quaternion = rig.rest[mirror].quat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(euler.x, -euler.y, -euler.z, 'ZYX')))
        quaternion.toArray(track.values, i)
      }
    } else if (track instanceof THREE.VectorKeyframeTrack) {
      for (let i = 0; i < track.values.length; i += 3) {
        if (name === 'hips') track.values[i] = 2 * rig.rest.hips.pos.x - track.values[i]
        else {
          const fraction = new THREE.Vector3().fromArray(track.values, i).length() / Math.max(0.001, rig.rest[name].pos.length())
          rig.rest[mirror].pos.clone().multiplyScalar(fraction).toArray(track.values, i)
        }
      }
    }
  }
  return result
}

type Droplet = { position: Vec3; velocity: Vec3; radius: number; age: number }
type Stain = { position: Vec3; size: number; angle: number; stamp: number; grow?: number }
type ShotgunBurst = { targetId: string; direction: Vec3; elapsed: number; next: number }
export type BloodSnapshot = { droplets: Droplet[]; stains: Stain[]; seed: number; shotgunBursts?: ShotgunBurst[] }

/** Per-mission version of the lab's pigment stamps; no global lab singleton, flat-ground assumption or timers. */
export class MissionBlood {
  readonly root = new THREE.Group()
  private readonly dropLimit = 192
  private readonly stainLimit = 512
  private droplets: Droplet[] = []
  private stains: Stain[] = []
  private shotgunBursts: ShotgunBurst[] = []
  private seed = 17923
  private surface = createStampSurface(this.stainLimit)
  private drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), new THREE.MeshBasicMaterial({ color: bloodPalette.fresh, toneMapped: false }), this.dropLimit)
  private marks = new THREE.InstancedMesh(this.surface.geometry, this.surface.material, this.stainLimit)
  private matrix = new THREE.Matrix4()
  private position = new THREE.Vector3()
  private velocity = new THREE.Vector3()
  private orientation = new THREE.Quaternion()
  private scale = new THREE.Vector3()
  private disposed = false
  private regions = new Map<string, CollisionWorld>()

  constructor(scene: THREE.Scene, private world: Pick<CollisionWorld, 'floor' | 'rayDistance'> & Partial<Pick<CollisionWorld, 'region'>>,
    private followBody?: (targetId: string) => THREE.Vector3 | null) {
    this.root.name = 'Mission blood effects'
    this.root.userData.noCollision = true
    this.drops.name = 'Impact blood droplets'
    this.marks.name = 'Blood pigment stains'
    this.drops.count = this.marks.count = 0
    this.drops.frustumCulled = this.marks.frustumCulled = false
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // The stamp shader reads instanceColor; allocate it before the first compile or the program fails once.
    this.marks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.stainLimit * 3), 3)
    this.marks.renderOrder = 1
    this.root.add(this.drops, this.marks)
    scene.add(this.root)
  }

  private random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296 }

  private nearby(point: THREE.Vector3) {
    if (!this.world.region) return this.world
    const x = Math.floor(point.x / 12), z = Math.floor(point.z / 12), key = `${x},${z}`
    let view = this.regions.get(key)
    if (!view) {
      // Every ray/stamp extends less than four metres from its sample. Include
      // the full height column so tower spray still finds the ground below.
      view = this.world.region(new THREE.Box3(new THREE.Vector3(x * 12 - 4, -Infinity, z * 12 - 4),
        new THREE.Vector3((x + 1) * 12 + 4, Infinity, (z + 1) * 12 + 4)))
      if (this.regions.size >= 48) {
        const oldest = this.regions.keys().next().value!
        this.regions.get(oldest)!.dispose(); this.regions.delete(oldest)
      }
      this.regions.set(key, view)
    }
    return view
  }

  private spray(point: THREE.Vector3, forward: THREE.Vector3, count: number, lethal: boolean, shotgun = false) {
    for (let i = 0; i < count; i++) {
      const speed = 1.8 + this.random() * (lethal ? 4.6 : 3.2) + (shotgun ? 0.6 : 0)
      const direction = forward.clone().multiplyScalar(i % 4 === 0 ? -0.7 : 1)
        .add(new THREE.Vector3((this.random() - 0.5) * (shotgun ? 1.7 : 1.4), this.random() - 0.2,
          (this.random() - 0.5) * (shotgun ? 1.7 : 1.4))).normalize().multiplyScalar(speed)
      direction.y += 0.6 + this.random() * 0.95
      this.droplets.push({ position: point.toArray() as Vec3, velocity: direction.toArray() as Vec3,
        radius: 0.032 + this.random() * (lethal ? 0.05 : 0.038), age: 0 })
    }
    this.droplets = this.droplets.slice(-this.dropLimit)
  }

  emitHit(hit: HitReaction) {
    if (this.disposed) return
    const shotgun = hit.weapon === 'shotgun'
    const forward = hit.direction.clone().normalize()
    this.spray(hit.point, forward, shotgun ? (hit.lethal ? 144 : 64) : hit.lethal ? 72 : 48, hit.lethal, shotgun)
    const followsFall = shotgun && hit.lethal && hit.targetId && this.followBody
    if (followsFall) {
      this.shotgunBursts = this.shotgunBursts.filter(burst => burst.targetId !== hit.targetId)
      this.shotgunBursts.push({ targetId: hit.targetId!, direction: forward.toArray(), elapsed: 0, next: 0 })
      this.shotgunBursts = this.shotgunBursts.slice(-16)
    }
    // Immediate solid splashes reinforce the hit before airborne spray lands.
    for (let i = 0; i < (shotgun ? (hit.lethal ? 10 : 5) : hit.lethal ? 8 : 4); i++) {
      const spread = new THREE.Vector3((this.random() - 0.5) * 1.1, 0, (this.random() - 0.5) * 1.1)
        .addScaledVector(forward, 0.12 + this.random() * 0.28)
      spread.y = 0
      const distance = spread.length()
      if (distance && this.nearby(hit.point).rayDistance(hit.point, spread.clone().normalize(), distance) < distance) continue
      this.stain(hit.point.clone().add(spread), 0.1 + this.random() * 0.1, Math.floor(this.random() * 16))
    }
    // Only the stain created for this fatal hit may grow; unsupported hits must
    // never attach a pool to an unrelated earlier victim.
    this.stain(hit.point, hit.lethal ? 0.3 : 0.17,
      hit.lethal ? 16 + Math.floor(this.random() * 8) : Math.floor(this.random() * 16),
      hit.lethal && !followsFall ? 0.55 + this.random() * 0.15 : undefined)
    this.render()
  }

  private stain(point: THREE.Vector3, size: number, stamp: number, grow?: number) {
    const world = this.nearby(point)
    const floor = world.floor(point, 0.025, Math.max(0.5, point.y + 5))
    if (!Number.isFinite(floor)) return
    const down = point.y - floor
    if (down > 0.04 && world.rayDistance(point, new THREE.Vector3(0, -1, 0), down) < down - 0.04) return
    // Reserve the whole grown footprint now: a pool cannot spread through a wall
    // or over a ledge later. Atlas quads extend two units either side of centre.
    const centre = new THREE.Vector3(point.x, floor + 0.035, point.z)
    let limit = grow ?? size
    for (let i = 0; i < 8; i++) {
      const direction = new THREE.Vector3(Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4))
      const obstruction = world.rayDistance(centre, direction, limit * 2.3)
      if (obstruction < limit * 2.3) limit = Math.min(limit, Math.max(0, obstruction - 0.015) / 2.3)
      const edge = centre.clone().addScaledVector(direction, limit * 2.3)
      const support = world.floor(edge, 0.025, 0.12)
      if (!Number.isFinite(support) || Math.abs(support - floor) > 0.04) limit *= 0.5
    }
    if (limit < 0.018) return
    this.stains.push({ position: [point.x, floor + 0.006 + (this.stains.length % 8) * 0.00015, point.z],
      size: Math.min(size, limit), angle: this.random() * Math.PI * 2, stamp,
      ...(grow ? { grow: Math.min(grow, limit) } : {}) })
    this.stains = this.stains.slice(-this.stainLimit)
  }

  update(dt: number) {
    if (this.disposed || dt <= 0) return
    const delta = Math.min(dt, 0.05)
    // Same authored impact times as the lab; anchors follow the animated corpse,
    // and snapshots retain pending marks without timers or renderer references.
    const events = [0.12, 0.26, 0.44, 0.73]
    this.shotgunBursts = this.shotgunBursts.filter(burst => {
      const point = this.followBody?.(burst.targetId)
      if (!point) return false
      burst.elapsed += delta
      while (burst.next < events.length && burst.elapsed + 1e-8 >= events[burst.next]) {
        const index = burst.next++
        if (index < 3) this.spray(point, new THREE.Vector3(...burst.direction), 28 - index * 6, false, true)
        else {
          this.stain(point, 0.32, 16 + Math.floor(this.random() * 8), 0.65)
          this.spray(point, new THREE.Vector3(...burst.direction).setY(0.15).normalize(), 24, false)
        }
      }
      return burst.next < events.length
    })
    for (const mark of this.stains) if (mark.grow && mark.size < mark.grow) mark.size = Math.min(mark.grow, mark.size + delta * 0.1)
    const live: Droplet[] = []
    for (const drop of this.droplets) {
      const before = this.position.fromArray(drop.position).clone()
      const world = this.nearby(before)
      this.velocity.fromArray(drop.velocity)
      this.velocity.y -= 11 * delta
      this.velocity.multiplyScalar(Math.max(0, 1 - delta * 0.9))
      this.position.addScaledVector(this.velocity, delta)
      const travel = this.position.clone().sub(before)
      const distance = travel.length()
      // Ballistic rays skip their first centimetre. Back up the particle sweep
      // slightly so a droplet already close to a wall cannot cross that gap.
      const padding = 0.025
      const hit = distance > 0 ? world.rayDistance(before.clone().addScaledVector(travel.normalize(), -padding), travel, distance + padding) - padding : distance
      drop.age += delta
      if (hit < distance) {
        const impact = before.addScaledVector(travel, Math.max(0, hit))
        const floor = world.floor(impact, 0.04, 0.12)
        if (Number.isFinite(floor) && Math.abs(impact.y - floor) < 0.1) this.stain(impact, drop.radius * 2.1, 24 + Math.floor(this.random() * 8))
        continue
      }
      const floor = world.floor(this.position, Math.max(0.05, -this.velocity.y * delta + 0.03), 0.12)
      if (Number.isFinite(floor) && this.position.y <= floor + 0.012) {
        this.stain(this.position.clone().setY(floor + 0.025), drop.radius * 2.1, 24 + Math.floor(this.random() * 8))
        continue
      }
      if (drop.age > 2.5) continue
      drop.position = this.position.toArray() as Vec3
      drop.velocity = this.velocity.toArray() as Vec3
      live.push(drop)
    }
    this.droplets = live
    this.render()
  }

  private render() {
    const up = new THREE.Vector3(0, 1, 0)
    this.drops.count = this.droplets.length
    this.droplets.forEach((drop, index) => {
      this.position.fromArray(drop.position)
      this.velocity.fromArray(drop.velocity)
      const stretch = 1 + Math.min(this.velocity.length() * 0.25, 1.6)
      this.orientation.setFromUnitVectors(up, this.velocity.normalize())
      this.scale.set(drop.radius / Math.sqrt(stretch), drop.radius * stretch, drop.radius / Math.sqrt(stretch))
      this.drops.setMatrixAt(index, this.matrix.compose(this.position, this.orientation, this.scale))
    })
    this.drops.instanceMatrix.needsUpdate = true
    this.marks.count = this.stains.length
    this.stains.forEach((mark, index) => {
      this.position.fromArray(mark.position)
      this.orientation.setFromAxisAngle(up, mark.angle)
      this.scale.set(mark.size, 1, mark.size * 1.15)
      this.marks.setMatrixAt(index, this.matrix.compose(this.position, this.orientation, this.scale))
      this.marks.setColorAt(index, new THREE.Color(bloodPalette.stain))
      this.surface.stamps.setXY(index, mark.stamp, 1)
    })
    this.marks.instanceMatrix.needsUpdate = this.surface.stamps.needsUpdate = true
    if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true
  }

  snapshot(): BloodSnapshot { return structuredClone({ droplets: this.droplets, stains: this.stains, seed: this.seed, shotgunBursts: this.shotgunBursts }) }
  restore(snapshot?: BloodSnapshot | null) {
    if (this.disposed) return
    this.droplets = structuredClone(snapshot?.droplets ?? []).slice(-this.dropLimit)
    this.stains = structuredClone(snapshot?.stains ?? []).slice(-this.stainLimit)
    this.shotgunBursts = structuredClone(snapshot?.shotgunBursts ?? []).slice(-16)
    this.seed = snapshot?.seed ?? 17923
    this.render()
  }
  clear() { this.restore() }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.regions.forEach(region => region.dispose()); this.regions.clear()
    this.root.removeFromParent()
    this.drops.geometry.dispose()
    this.drops.material.dispose()
    this.surface.material.uniforms.atlas.value.dispose()
    this.surface.material.dispose()
    this.surface.geometry.dispose()
    this.droplets = []; this.stains = []; this.shotgunBursts = []
    this.drops.count = this.marks.count = 0
  }
}
