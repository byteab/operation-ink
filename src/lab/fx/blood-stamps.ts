import * as THREE from 'three'

export const bloodPalette = {
  fresh: 0xcc1717,
  dark: 0x7a0c0c,
  stain: 0xa81010,
} as const

const TILE = 256, COLUMNS = 8, ROWS = 4
const TAU = Math.PI * 2
export type StampKind = 'splash' | 'pool' | 'drop'
const variants: Record<StampKind, [number, number]> = { splash: [0, 16], pool: [16, 8], drop: [24, 8] }

export function chooseStamp(kind: StampKind) {
  const [start, count] = variants[kind]
  return start + Math.floor(Math.random() * count)
}

function random(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed)
    n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n
    return ((n ^ n >>> 14) >>> 0) / 4294967296
  }
}

function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y)
  let fx = x - ix, fy = y - iy
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
  const hash = (a: number, b: number) => {
    let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed
    n = Math.imul(n ^ n >>> 13, 1274126177)
    return ((n ^ n >>> 16) >>> 0) / 4294967296
  }
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
  return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy
}

/** Bake solid, connected blood footprints with irregular antialiased edges.
 * R stores coverage; filled interiors stay opaque with no hatching or grain.
 */
function bakeStamp(seed: number, kind: StampKind) {
  const rng = random(seed), range = (a: number, b: number) => a + rng() * (b - a)
  const field = new Float32Array(TILE * TILE).fill(1)
  const blob = (x: number, y: number, rx: number, ry = rx, angle = 0, merge = 0.035) => {
    const reach = Math.max(rx, ry) + merge + 0.055
    const loX = Math.max(0, Math.floor((x - reach + 1) * TILE / 2))
    const hiX = Math.min(TILE - 1, Math.ceil((x + reach + 1) * TILE / 2))
    const loY = Math.max(0, Math.floor((y - reach + 1) * TILE / 2))
    const hiY = Math.min(TILE - 1, Math.ceil((y + reach + 1) * TILE / 2))
    const cos = Math.cos(angle), sin = Math.sin(angle), radius = Math.min(rx, ry)
    for (let py = loY; py <= hiY; py++) for (let px = loX; px <= hiX; px++) {
      const dx = (px + 0.5) * 2 / TILE - 1 - x, dy = (py + 0.5) * 2 / TILE - 1 - y
      const u = (dx * cos + dy * sin) / rx, v = (-dx * sin + dy * cos) / ry
      const distance = (Math.hypot(u, v) - 1) * radius
      const i = py * TILE + px, old = field[i]
      const h = Math.max(merge - Math.abs(old - distance), 0) / merge
      field[i] = Math.min(old, distance) - h * h * merge * 0.25
    }
  }

  const pool = kind === 'pool', drop = kind === 'drop'
  // An off-centre body plus unequal connected lobes, never a regular radial disc.
  blob(range(-0.07, 0.07), range(-0.06, 0.06), range(0.26, 0.36), range(0.29, 0.41), range(0, TAU))
  const lobes = pool ? 10 : drop ? 4 : 5
  for (let i = 0; i < lobes; i++) {
    const a = range(0, TAU), d = range(0.16, pool ? 0.44 : 0.37)
    blob(Math.cos(a) * d, Math.sin(a) * d, range(0.1, pool ? 0.28 : 0.2), range(0.09, 0.2), a, 0.07)
  }

  if (!drop) {
    const fingers = pool ? 12 : 7 + Math.floor(rng() * 6)
    for (let i = 0; i < fingers; i++) {
      const a = range(0, TAU), start = range(0.16, 0.25)
      const end = pool ? range(0.4, 0.64) : 0.43 + rng() ** 1.6 * 0.43
      const bend = range(-0.12, 0.12), width = pool ? range(0.025, 0.055) : range(0.035, 0.075)
      const steps = Math.ceil((end - start) * TILE)
      for (let step = 0; step <= steps; step++) {
        const t = step / steps, d = start + (end - start) * t
        const curve = bend * t * t
        const x = Math.cos(a) * d - Math.sin(a) * curve, y = Math.sin(a) * d + Math.cos(a) * curve
        blob(x, y, width * (1 - t) ** 1.6 + 0.003, undefined, 0, 0.008)
      }
      if (!pool && rng() < 0.7) {
        // The thread breaks into successively smaller beads beyond its tip.
        const d = Math.min(0.91, end + range(0.04, 0.12)), radius = range(0.009, 0.026)
        blob(Math.cos(a) * d - Math.sin(a) * bend, Math.sin(a) * d + Math.cos(a) * bend, radius, radius * range(1, 1.7), a, 0.008)
      }
    }
  }
  if (!pool) for (let i = 0; i < (drop ? 3 : 25); i++) {
    const a = range(0, TAU), d = range(0.48, 0.9), r = range(0.005, 0.024)
    blob(Math.cos(a) * d, Math.sin(a) * d, r, r * range(0.65, 1.6), a, 0.006)
  }

  const pixels = new Uint8Array(TILE * TILE * 4)
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const i = y * TILE + x, u = x / TILE, v = y / TILE
    const broad = noise(u * 9, v * 9, seed), grain = noise(u * 83, v * 83, seed + 3)
    const fine = noise(u * 173, v * 173, seed + 7)
    const distance = field[i] + (broad - 0.5) * 0.065 + (grain - 0.5) * 0.022 + (fine - 0.5) * 0.008
    // Noise only shapes the outer edge; the interior is a continuous red fill.
    const edge = THREE.MathUtils.clamp(0.5 - distance / 0.012, 0, 1)
    const coverage = edge * edge * (3 - 2 * edge)
    // Transparent padding keeps mipmaps/anisotropic sampling inside each tile.
    const border = Math.min(x, y, TILE - 1 - x, TILE - 1 - y)
    pixels[i * 4] = border < 5 ? 0 : Math.round(coverage * 255)
    pixels[i * 4 + 3] = 255
  }
  return pixels
}

const schedule: (run: (deadline?: IdleDeadline) => void) => void =
  globalThis.requestIdleCallback?.bind(globalThis) ?? (run => setTimeout(run, 16))

/**
 * Baking all 32 tiles blocked the first frame for ~230 ms (M4; three times that on a laptop), so they are
 * baked one at a time in idle moments after load. `finish` bakes whatever is left at once: the surface calls
 * it before it draws a stain, so a mark can never sample an unbaked tile, however early the first hit is.
 */
function makeAtlas() {
  const width = TILE * COLUMNS, height = TILE * ROWS, tiles = COLUMNS * ROWS
  const data = new Uint8Array(width * height * 4)
  const texture = new THREE.DataTexture(data, width, height)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 4
  texture.needsUpdate = true
  let tile = 0
  const bakeTile = () => {
    const kind: StampKind = tile < 16 ? 'splash' : tile < 24 ? 'pool' : 'drop'
    const pixels = bakeStamp(7319 + tile * 1013, kind)
    for (let y = 0; y < TILE; y++) {
      const offset = ((Math.floor(tile / COLUMNS) * TILE + y) * width + tile % COLUMNS * TILE) * 4
      data.set(pixels.subarray(y * TILE * 4, (y + 1) * TILE * 4), offset)
    }
    if (++tile === tiles) texture.needsUpdate = true
  }
  const finish = () => { while (tile < tiles) bakeTile() }
  const idle = (deadline?: IdleDeadline) => {
    if (tile >= tiles) return
    do bakeTile(); while (tile < tiles && deadline && deadline.timeRemaining() > 10)
    schedule(idle)
  }
  schedule(idle)
  texture.addEventListener('dispose', () => { tile = tiles })
  return { texture, finish }
}

export function createStampSurface(capacity: number) {
  const geometry = new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2)
  const stamps = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2)
  stamps.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('instanceStamp', stamps)
  const atlas = makeAtlas()
  const material = new THREE.ShaderMaterial({
    uniforms: { atlas: { value: atlas.texture } },
    vertexShader: `
      attribute vec2 instanceStamp;
      varying vec2 stampUv;
      varying vec3 pigment;
      void main() {
        vec2 localUv = vec2((uv.x - 0.5) * instanceStamp.y + 0.5, uv.y);
        vec2 tile = vec2(mod(instanceStamp.x, ${COLUMNS}.0), floor(instanceStamp.x / ${COLUMNS}.0));
        stampUv = (localUv + tile) / vec2(${COLUMNS}.0, ${ROWS}.0);
        pigment = instanceColor;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D atlas;
      varying vec2 stampUv;
      varying vec3 pigment;
      void main() {
        float coverage = texture2D(atlas, stampUv).r;
        if (coverage < 0.012) discard;
        gl_FragColor = vec4(pigment, coverage);
        #include <colorspace_fragment>
        #include <premultiplied_alpha_fragment>
      }
    `,
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  })
  material.onBeforeRender = (_renderer, _scene, _camera, _geometry, object) => { if ((object as THREE.InstancedMesh).count > 0) atlas.finish() }
  return { geometry, material, stamps }
}
