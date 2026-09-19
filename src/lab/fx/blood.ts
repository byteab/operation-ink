import * as THREE from 'three'
import type { Action, Ctx } from '../registry'
import { bloodPalette, chooseStamp, createStampSurface, type StampKind } from './blood-stamps'

/**
 * Airborne droplets, solid red ground splashes and slowly spreading pools.
 * Ground marks share a procedural pigment atlas and one instanced ring buffer.
 * API lives on ctx.fx.blood (registered on first update / action).
 */
export type Blood = {
  spray(worldPos: THREE.Vector3, worldDir: THREE.Vector3, amount: number): void
  splat(worldPos: THREE.Vector3, size?: number): void
  pool(worldPos: THREE.Vector3, seconds: number): void
  clear(): void
  settings: { enabled: boolean; intensity: number; gore: 'low' | 'mid' | 'high' }
}

const MAX_DROPS = 800, MAX_DECALS = 400, MAX_POOLS = 32
const GRAVITY = 11, DRAG = 0.9, DROP_LIFE = 4
const GORE = { low: 0.5, mid: 1, high: 1.8 } as const
const DARK = new THREE.Color(bloodPalette.dark), BRIGHT = new THREE.Color(bloodPalette.fresh), POOL = new THREE.Color(bloodPalette.stain)

const settings: Blood['settings'] = { enabled: true, intensity: 1, gore: 'mid' }

// droplet particle store (struct of arrays, swap-remove on death)
const pos = new Float32Array(MAX_DROPS * 3), vel = new Float32Array(MAX_DROPS * 3)
const col = new Float32Array(MAX_DROPS * 3), size = new Float32Array(MAX_DROPS), age = new Float32Array(MAX_DROPS)
let alive = 0

// decal ring buffer
const decalSerial = new Uint32Array(MAX_DECALS)
let decalHead = 0, decalCount = 0, serial = 1

// A pool is one connected footprint, so growth never exposes overlapping oval rims.
type Pool = { slot: number; serial: number; t: number; seconds: number; x: number; z: number; size: number; angle: number }
const pools: Pool[] = []

let drops: THREE.InstancedMesh | undefined, rim: THREE.InstancedMesh | undefined, decals: THREE.InstancedMesh | undefined
let stamps: THREE.InstancedBufferAttribute

// scratch — no per-frame allocation
const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
const v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color()
const rand = (a: number, b: number) => a + Math.random() * (b - a)

function init(ctx: Ctx) {
  if (drops) return
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
    const mesh = new THREE.InstancedMesh(geo, mat, n)
    mesh.count = 0
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
    return mesh
  }
  drops = instanced(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), MAX_DROPS)
  drops.name = 'blood: droplets'
  rim = new THREE.InstancedMesh(new THREE.SphereGeometry(1.35, 8, 6), new THREE.MeshBasicMaterial({ color: bloodPalette.dark, side: THREE.BackSide, toneMapped: false }), MAX_DROPS)
  rim.instanceMatrix = drops.instanceMatrix  // share the buffer: one matrix write per droplet
  rim.count = 0
  rim.frustumCulled = false
  rim.name = 'blood: droplet ink'
  const surface = createStampSurface(MAX_DECALS)
  stamps = surface.stamps
  decals = instanced(surface.geometry, surface.material, MAX_DECALS)
  decals.renderOrder = 1
  decals.name = 'blood: decals'
  ctx.scene.add(drops, rim, decals)
  ctx.fx.blood = api
}

function spawnDrop(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number) {
  if (alive >= MAX_DROPS) return
  const i = alive++, i3 = i * 3
  pos[i3] = x; pos[i3 + 1] = y; pos[i3 + 2] = z
  vel[i3] = vx; vel[i3 + 1] = vy; vel[i3 + 2] = vz
  c.copy(DARK).lerp(BRIGHT, Math.random())
  col[i3] = c.r; col[i3 + 1] = c.g; col[i3 + 2] = c.b
  size[i] = r
  age[i] = 0
}

/** Write one decal into the ring buffer. Returns the slot. */
function putDecal(x: number, z: number, sx: number, sz: number, angle: number, color: THREE.Color, kind: StampKind = 'splash') {
  const slot = decalHead
  decalHead = (decalHead + 1) % MAX_DECALS
  decalCount = Math.min(decalCount + 1, MAX_DECALS)
  decalSerial[slot] = serial++
  stamps.setXY(slot, chooseStamp(kind), Math.random() < 0.5 ? -1 : 1)
  stamps.needsUpdate = true
  writeDecal(slot, x, z, sx, sz, angle)
  decals!.instanceColor!.setXYZ(slot, color.r, color.g, color.b)
  decals!.instanceColor!.needsUpdate = true
  decals!.count = decalCount
  return slot
}

function writeDecal(slot: number, x: number, z: number, sx: number, sz: number, angle: number) {
  // tiny per-slot lift so overlapping stains don't z-fight
  m.compose(p.set(x, 0.002 + slot * 0.00002, z), q.setFromAxisAngle(up, angle), s.set(sx, 1, sz))
  decals!.setMatrixAt(slot, m)
  decals!.instanceMatrix.needsUpdate = true
}

/** Orient the footprint's long local Z axis along the incoming horizontal velocity. */
function stain(x: number, z: number, r: number, streak: number, angle: number, color: THREE.Color, specks: number) {
  putDecal(x, z, r / Math.sqrt(streak), r * streak, angle, color)
  for (let i = 0; i < specks; i++) {
    const a = streak > 1.15 ? angle + rand(-0.8, 0.8) : rand(0, Math.PI * 2)
    const d = r * rand(1.6, 3) * Math.sqrt(streak), sr = r * rand(0.06, 0.19)
    putDecal(x + Math.sin(a) * d, z + Math.cos(a) * d, sr, sr * rand(1, 1.8), a, color, 'drop')
  }
}

const api: Blood = {
  settings,
  spray(worldPos, worldDir, amount) {
    if (!settings.enabled || !drops) return
    amount = THREE.MathUtils.clamp(amount, 0, 1)
    const n = Math.round((12 + 84 * amount) * settings.intensity * GORE[settings.gore])
    v.copy(worldDir).normalize()
    for (let i = 0; i < n; i++) {
      const back = Math.random() < 0.22
      const speed = (back ? rand(0.8, 2.6) : rand(1.8, 5.2) * (0.5 + amount)) * (0.8 + 0.4 * settings.intensity)
      // cone: main direction (or its opposite for back-spatter) plus random scatter, biased upward
      const scatter = back ? 0.9 : 0.55
      p.set(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize().multiplyScalar(scatter)
      p.addScaledVector(v, back ? -1 : 1).normalize().multiplyScalar(speed)
      p.y += rand(0.35, 1.65)
      spawnDrop(worldPos.x + rand(-0.03, 0.03), worldPos.y + rand(-0.03, 0.03), worldPos.z + rand(-0.03, 0.03),
        p.x, p.y, p.z, rand(0.016, 0.048) * (back ? 0.7 : 1) * (0.7 + 0.3 * GORE[settings.gore]))
    }
  },
  splat(worldPos, sz = 0.12) {
    if (!settings.enabled || !decals) return
    c.copy(DARK).lerp(BRIGHT, rand(0.25, 0.6))
    stain(worldPos.x, worldPos.z, sz, rand(1, 1.25), rand(0, Math.PI * 2), c, 4 + Math.round(4 * GORE[settings.gore]))
  },
  pool(worldPos, seconds) {
    if (!settings.enabled || !decals) return
    if (pools.length >= MAX_POOLS) pools.shift()
    const angle = rand(0, Math.PI * 2)
    const slot = putDecal(worldPos.x, worldPos.z, 0.01, 0.01, angle, POOL, 'pool')
    pools.push({ slot, serial: decalSerial[slot], t: 0, seconds: Math.max(0.001, seconds),
      x: worldPos.x, z: worldPos.z, angle,
      size: 0.3 * (0.7 + 0.3 * GORE[settings.gore]) * settings.intensity })
  },
  clear() {
    alive = 0; decalHead = 0; decalCount = 0; pools.length = 0
    if (drops && rim && decals) { drops.count = rim.count = decals.count = 0 }
  },
}

export function update(dt: number, ctx: Ctx) {
  init(ctx)
  const D = drops!, colors = D.instanceColor!
  // droplets
  for (let i = 0; i < alive;) {
    const i3 = i * 3
    vel[i3 + 1] -= GRAVITY * dt
    const k = Math.max(0, 1 - DRAG * dt)
    vel[i3] *= k; vel[i3 + 1] *= k; vel[i3 + 2] *= k
    pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt
    age[i] += dt
    if (pos[i3 + 1] <= 0 || age[i] > DROP_LIFE) {
      if (pos[i3 + 1] <= 0) {
        // Glancing impacts stretch forward; harder vertical impacts spread wider.
        const hx = vel[i3], hz = vel[i3 + 2], h = Math.hypot(hx, hz)
        const vertical = Math.abs(vel[i3 + 1])
        const streak = THREE.MathUtils.clamp(1 + h / Math.max(1, vertical) * 0.85, 1, 2.6)
        const r = size[i] * (2.4 + Math.min(vertical, 7) * 0.22) * rand(0.85, 1.15)
        c.setRGB(col[i3], col[i3 + 1], col[i3 + 2])
        stain(pos[i3], pos[i3 + 2], r, streak, h > 0.05 ? Math.atan2(hx, hz) : rand(0, Math.PI), c, Math.random() < 0.4 * GORE[settings.gore] ? 1 : 0)
      }
      // swap-remove
      alive--
      if (i !== alive) {
        const j3 = alive * 3
        pos[i3] = pos[j3]; pos[i3 + 1] = pos[j3 + 1]; pos[i3 + 2] = pos[j3 + 2]
        vel[i3] = vel[j3]; vel[i3 + 1] = vel[j3 + 1]; vel[i3 + 2] = vel[j3 + 2]
        col[i3] = col[j3]; col[i3 + 1] = col[j3 + 1]; col[i3 + 2] = col[j3 + 2]
        size[i] = size[alive]; age[i] = age[alive]
      }
      continue
    }
    // blob stretched along its velocity
    v.set(vel[i3], vel[i3 + 1], vel[i3 + 2])
    const speed = v.length()
    q.setFromUnitVectors(up, v.divideScalar(speed || 1))
    const stretch = 1 + Math.min(speed * 0.18, 1.4)
    m.compose(p.set(pos[i3], pos[i3 + 1], pos[i3 + 2]), q, s.set(size[i] / Math.sqrt(stretch), size[i] * stretch, size[i] / Math.sqrt(stretch)))
    D.setMatrixAt(i, m)
    colors.setXYZ(i, col[i3], col[i3 + 1], col[i3 + 2])
    i++
  }
  D.count = rim!.count = alive
  D.instanceMatrix.needsUpdate = true
  colors.needsUpdate = true
  // pools grow with ease-out, until finished or their slots got recycled
  for (let n = 0; n < pools.length;) {
    const pool = pools[n]
    pool.t += dt
    const k = Math.min(1, pool.t / pool.seconds), grow = 0.1 + 0.9 * Math.sqrt(k)
    const live = decalSerial[pool.slot] === pool.serial
    const r = pool.size * grow
    if (live) writeDecal(pool.slot, pool.x, pool.z, r * 1.1, r, pool.angle)
    if (k >= 1 || !live) pools.splice(n, 1)
    else n++
  }
}

// ---- panel ----
const hit = new THREE.Vector3(), dir = new THREE.Vector3()
const bone = (ctx: Ctx, name: 'chest' | 'head', lift = 0) => { ctx.rig.bones[name].getWorldPosition(hit); hit.y += lift; return hit }
function relabel(prefix: string, text: string) {
  document.querySelectorAll<HTMLButtonElement>('#panel button').forEach(b => { if (b.textContent?.startsWith(prefix)) b.textContent = text })
}
const cycle = <T,>(list: readonly T[], cur: T) => list[(list.indexOf(cur) + 1) % list.length]

export const actions: Action[] = [
  { group: 'Blood', label: 'Test spray (chest)', hotkey: 'b', run: ctx => { init(ctx); api.spray(bone(ctx, 'chest', 0.12), dir.set(1, 0.5, -0.4), 0.8) } },
  { group: 'Blood', label: 'Test spray (head)', hotkey: 'h', run: ctx => { init(ctx); api.spray(bone(ctx, 'head', 0.1), dir.set(0.4, 1, -0.3), 1) } },
  { group: 'Blood', label: 'Ground splash test', run: ctx => { init(ctx); api.splat(hit.set(0.45, 0, 0.35), 0.2) } },
  { group: 'Blood', label: 'Pool test', run: ctx => { init(ctx); api.pool(bone(ctx, 'chest'), 4) } },
  { group: 'Blood', label: 'Clear blood', run: ctx => { init(ctx); api.clear() } },
  { group: 'Blood', get label() { return `Blood: ${settings.enabled ? 'on' : 'off'}` }, run() { settings.enabled = !settings.enabled; relabel('Blood:', this.label) } },
  { group: 'Blood', get label() { return `Intensity: ${settings.intensity}` }, run() { settings.intensity = cycle([0.5, 1, 1.5, 2], settings.intensity); relabel('Intensity:', this.label) } },
  { group: 'Blood', get label() { return `Gore: ${settings.gore}` }, run() { settings.gore = cycle(['low', 'mid', 'high'] as const, settings.gore); relabel('Gore:', this.label) } },
]
