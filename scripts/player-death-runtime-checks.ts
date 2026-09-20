import assert from 'node:assert/strict'
import * as THREE from 'three'
import { MissionRuntime } from '../src/game/runtime'
import { initialMission } from '../src/game/mission'
import { PlayerDeathSequence, DEATH_TIMING } from '../src/game/player-death'
import { PlayerHitReactions } from '../src/game/player-hit-reactions'

// Exercise the real mission update/damage/restore methods. Collaborators are
// deliberately small so this checks the lifecycle without a browser or GPU.
const noop = () => {}
const crosshair = { classList: { toggle: noop } }
Object.assign(globalThis, { document: { hidden: false, querySelector: () => crosshair } })
const m = Object.create(MissionRuntime.prototype) as any
const camera = new THREE.PerspectiveCamera(75)
camera.position.set(0, 1.68, 0)
const audioEvents: string[] = []
let paused = 0, deathUpdates = 0, weaponUpdates = 0, deathResets = 0, audioActive = false, hudCleared = false
let hitCues = 0, hurtCues = 0
let fatalKick = 0
let worldTime = 0, effectTime = 0, trailTime = 0
const body = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), grounded: true,
  teleport(point: THREE.Vector3) { this.position.copy(point) } }
const player = { enabled: true, immersive: false, playing: true, body, movementLocked: false,
  world: { floor: () => 0, fits: () => true, refresh: noop },
  actions: { traversing: false, climbing: false, doors: [], reset: noop, syncCamera: () => camera.position.copy(body.position).add(new THREE.Vector3(0, 1.68, 0)) },
  pause() { paused++; this.playing = false },
}
Object.assign(m, {
  state: initialMission(), ready: true, deaths: 0, camera: { perspective: camera }, player,
  world: { bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } },
  death: new PlayerDeathSequence(), playerHits: new PlayerHitReactions(),
  weapons: { cancel: noop, beginDeath: noop, updateDeath: (_elapsed: number, _reduced: boolean, kick: number) => { deathUpdates++; fatalKick = kick }, resetDeath: () => deathResets++,
    update: () => weaponUpdates++, restore: noop },
  audio: { setActive: (active: boolean) => audioActive = active, play: ({ kind }: { kind: string }) => audioEvents.push(kind),
    beginDeath: () => audioEvents.push('death'), reset: () => audioEvents.push('reset'), update: noop, setAlarm: noop },
  hud: { reducedMotion: false, hurt: () => hurtCues++, hitFrom: () => hitCues++, notify: noop, clearThreat: noop, setScoped: noop, setDeath: noop,
    update: noop, reset: () => hudCleared = true, clearDeath: () => hudCleared = true },
  ai: { update: (dt: number, sense: { alive: boolean }) => { worldTime += dt; if (sense.alive) m.damage(100, new THREE.Vector3(0, 1, -5)) }, bulletTrails: { clear: noop }, restore: noop },
  escort: { update: noop, sync: noop }, security: { update: noop, sync: noop, reset: noop },
  blood: { update: (dt: number) => effectTime += dt, restore: noop }, impacts: { update: noop, clear: noop }, bulletTrails: { clear: noop, update: (dt: number) => trailTime += dt },
  safePosition: new THREE.Vector3(), safeQuaternion: new THREE.Quaternion(), active: false, wasVR: false,
  stepTime: 0, interactionTime: 0, gunfireUntil: 0, hitFlash: 0, invalidate: noop,
})
const initial = { mission: initialMission(), weapons: {}, enemies: [], doors: [], position: [0, 0, 0], quaternion: camera.quaternion.toArray() }
m.checkpoint = initial
m.emit({ kind: 'enemy-bullet-whiz', intensity: 1, position: camera.position.clone(), source: new THREE.Vector3(0, 1, -5), radius: 5 }, false)
assert.equal(hitCues, 0); assert.equal(hurtCues, 0)
assert(audioEvents.includes('enemy-bullet-whiz'), 'Near misses retain sound without any hit shading')
m.damage(0, new THREE.Vector3(0, 1, -5)); assert.equal(hitCues, 0)
m.damage(5, new THREE.Vector3(0, 1, -5)); assert.equal(hitCues, 1); assert.equal(hurtCues, 1)
assert.equal(m.state.health, 95, 'Only actual damage triggers the hit shading')
assert(m.update(1 / 60))
assert.equal(m.state.phase, 'dead'); assert.equal(m.deaths, 1); assert.equal(paused, 1)
assert(m.death.active && deathUpdates === 1 && weaponUpdates === 0, 'Lethal hit inside AI update enters death immediately')
assert(audioActive && audioEvents.includes('death'))
m.damage(200); assert.equal(m.deaths, 1, 'Late damage cannot restart the sequence')
const missionTime = m.state.elapsed
for (let frame = 0; frame < 210; frame++) assert(m.update(1 / 60), 'Animation keeps rendering after player pause')
assert(audioActive && !m.death.menuVisible && m.death.visionLoss === 1)
assert.equal(m.state.elapsed, missionTime, 'Death time is not added to active mission time')
assert.equal(audioEvents.filter(event => event === 'player-fall').length, 1)
assert(worldTime > 3.5 && effectTime > 3.5 && trailTime > 3.5, 'NPCs, blood and projectiles keep advancing through the death cinematic')
const elapsed = m.death.elapsed
const beforeHidden = [worldTime, effectTime, trailTime]
document.hidden = true; m.update(0.05)
assert.equal(m.death.elapsed, elapsed); assert(!audioActive)
assert.deepEqual([worldTime, effectTime, trailTime], beforeHidden, 'Hidden tabs pause the world and effects together')
document.hidden = false
while (m.death.elapsed < DEATH_TIMING.end) m.update(1 / 60)
assert(m.death.menuVisible && !audioActive && !m.update(1 / 60), 'Menu completes and continuous rendering stops')
const menuTime = [worldTime, effectTime, trailTime]
m.update(0.05); assert.deepEqual([worldTime, effectTime, trailTime], menuTime, 'The menu still pauses gameplay')
m.retry()
assert(!m.death.active && hudCleared && deathResets === 1 && m.state.phase === 'active')
assert.deepEqual(camera.position.toArray(), [0, 1.68, 0])
assert(audioEvents.includes('reset'))
// A one-point final round must carry the same impact, independently of damage.
player.playing = true; m.state.health = 1
m.damage(1, new THREE.Vector3(0, 1, -5)); m.update(1 / 60)
assert(m.death.active && m.deaths === 2 && m.death.elapsed < 0.02, 'Retry supports a fresh subsequent death')
assert(fatalKick > 0 && fatalKick === m.death.hitKick, 'Even a one-point fatal bullet passes the heavy impact to the arms')
player.enabled = false; m.update(1 / 60)
assert(!m.death.active && !audioActive && deathResets === 2, 'Inspection clears the cinematic and sound')
console.log('PASS Real runtime lethal-frame handoff, one-shot damage/audio, continued rendering, hidden-tab pause, menu completion, retry and inspection cleanup')
