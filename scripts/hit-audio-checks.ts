import assert from 'node:assert/strict'
import * as THREE from 'three'
import { MissionAudio } from '../src/game/audio'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { CollisionWorld } from '../src/player/collision'
import type { HitReaction } from '../src/game/hit-reactions'

class Param {
  value = 0
  values: number[] = []
  setValueAtTime(value: number) { this.value = value; this.values.push(value) }
  exponentialRampToValueAtTime(value: number) { this.value = value; this.values.push(value) }
  linearRampToValueAtTime(value: number) { this.value = value }
  cancelScheduledValues() {}
}
class Node {
  disconnected = false
  connections: Node[] = []
  connect(target: Node) { this.connections.push(target); return target }
  disconnect() { this.disconnected = true }
}
class Source extends Node {
  buffer: unknown
  loop = false
  playbackRate = new Param()
  frequency = new Param()
  type = 'sine'
  onended: (() => void) | null = null
  stopped = false
  stopTime = 0
  start() {}
  stop(time?: number) { this.stopTime = time ?? 0; if (time === undefined) { this.stopped = true; this.onended?.() } }
}
class FakeAudioContext {
  static latest: FakeAudioContext
  currentTime = 0
  sampleRate = 1000
  state = 'suspended'
  destination = new Node()
  nodes: Node[] = []
  listener = Object.fromEntries(['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].map(name => [name, new Param()]))
  constructor() { FakeAudioContext.latest = this }
  keep<T extends Node>(node: T) { this.nodes.push(node); return node }
  createGain() { return this.keep(Object.assign(new Node(), { gain: new Param() })) }
  createBiquadFilter() { return this.keep(Object.assign(new Node(), { frequency: new Param(), Q: new Param(), type: '' })) }
  createPanner() { return this.keep(Object.assign(new Node(), { positionX: new Param(), positionY: new Param(), positionZ: new Param() })) }
  createBufferSource() { return this.keep(new Source()) }
  createOscillator() { return this.keep(new Source()) }
  createBuffer(_channels: number, length: number, rate: number) { const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data } }
  async decodeAudioData() { return this.createBuffer(1, 1200, 1000) }
  async resume() { this.state = 'running' }
  async suspend() { this.state = 'suspended' }
  async close() { this.state = 'closed' }
}
Object.assign(globalThis, { AudioContext: FakeAudioContext, fetch: async () => ({ ok: false }) })
const audio = new MissionAudio(), body = { zone: 'torso' as const, lethal: false }, head = { zone: 'head' as const, lethal: false }
audio.confirmHit(body); assert.equal(audio.diagnostics.sources, 0)
audio.setActive(true); await audio.unlock()
const context = FakeAudioContext.latest
const sources = () => context.nodes.filter(node => node instanceof Source) as Source[]
const panners = () => context.nodes.filter(node => 'positionX' in node).length
const before = audio.diagnostics.sources, pannerCount = panners()
audio.play({ kind: 'enemy-hit', position: new THREE.Vector3(100, 0, 0), radius: 14 })
assert.equal(audio.diagnostics.sources, before, 'distant spatial flesh impact is culled')
audio.confirmHit(body)
assert.equal(audio.diagnostics.sources, before + 2, 'local flesh transient and short cue remain audible regardless of enemy distance')
const bodyCue = sources().at(-1)!
assert.equal(bodyCue.stopTime, 0.045)
audio.confirmHit(head)
const headCue = sources().at(-1)!
assert(headCue.frequency.values[0] > bodyCue.frequency.values[0] * 1.4, 'head feedback reads sharper than body impact')
audio.confirmHit({ ...body, lethal: true })
const killCue = sources().at(-1)!
assert.equal(killCue.stopTime, 0.19)
assert(killCue.frequency.values[0] < bodyCue.frequency.values[0], 'kill cue has a separate lower, longer finish')
assert.equal(panners(), pannerCount, 'confirmation never creates a spatial panner')
const pitches = new Set<number>()
for (let i = 0; i < 8; i++) { audio.confirmHit(body); pitches.add(sources().at(-1)!.frequency.values[0]) }
assert(pitches.size > 1, 'repeated confirmed hits vary slightly')
console.log('PASS Distant hits retain local flesh/tick feedback; head and kill cues differ, vary pitch and remain non-spatial')

for (const mode of ['muted', 'zero-volume', 'paused'] as const) {
  audio.setMuted(mode === 'muted'); audio.setVolume(mode === 'zero-volume' ? 0 : 0.55); audio.setActive(mode !== 'paused')
  const count = sources().length
  audio.confirmHit({ ...head, lethal: true })
  audio.play({ kind: 'bullet-hit', intensity: 1 })
  assert.equal(sources().length, count, `${mode} may not allocate confirmation sources`)
}
audio.setMuted(false); audio.setVolume(0.55); audio.setActive(true)
for (let i = 0; i < 100; i++) audio.confirmHit({ ...body, lethal: true })
assert.equal(audio.diagnostics.sources, 80)
audio.reset(); assert.equal(audio.diagnostics.sources, 0)
assert(context.nodes.slice(1).every(node => node.disconnected))
console.log('PASS Mute, zero volume and pause reject new sources; rapid automatic hits obey the 80-source budget and reset disconnects all effect nodes')

const scene = new THREE.Scene()
const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
floor.rotation.x = -Math.PI / 2; scene.add(floor)
const world = new CollisionWorld(scene), confirmations: HitReaction[] = []
let playerDamage = 0
const director = new EnemyDirector({ scene, world, doors: [],
  specs: [{ id: 'audio-target', name: 'Audio target', weapon: 'pistol', position: [0, 0, 8], patrol: [], facing: Math.PI }],
  emit: event => audio.play(event), damagePlayer: amount => { playerDamage += amount }, dropWeapon() {},
  onHit: hit => { confirmations.push(hit); audio.confirmHit(hit) },
}, async () => {
  const root = new THREE.Group()
  return { root, update() {}, shoot() {}, react() {}, restore() {}, dispose() {}, reactionRemaining: 0,
    muzzle: () => root.position.clone().add(new THREE.Vector3(0, 1.3, -0.5)) } as unknown as EnemyActor
})
await director.init()
const player = { feet: new THREE.Vector3(), eye: new THREE.Vector3(0, 1.65, 0), velocity: new THREE.Vector3(), alive: true, radioEnabled: false }
for (let i = 0; i < 720; i++) {
  director.enemies[0].tactic = 'hold'; director.enemies[0].tacticTimer = 100
  director.update(1 / 60, player)
}
assert(playerDamage > 0); assert.equal(confirmations.length, 0, 'enemy hits on the player are not enemy-hit confirmations')
audio.reset()
const shot = { origin: new THREE.Vector3(0, 1.2, 0), direction: new THREE.Vector3(0, 0, 1), range: 20, damage: 34, weapon: 'pistol' as const }
assert(!director.hit({ ...shot, direction: new THREE.Vector3(0.08, 0, 1).normalize() }, 20))
director.nearMiss({ ...shot, direction: new THREE.Vector3(0.08, 0, 1).normalize() }, 20)
assert(!director.hit(shot, 3), 'a shot stopped by cover cannot reach the body')
assert.equal(confirmations.length, 0)
assert(director.hit(shot, 20)); assert.equal(confirmations.length, 1); assert(!confirmations[0].lethal)
assert(director.hit({ ...shot, damage: 200 }, 20)); assert.equal(confirmations.length, 2); assert(confirmations[1].lethal)
assert(!director.hit(shot, 20)); assert.equal(confirmations.length, 2, 'dead bodies cannot trigger repeated kill confirmations')
assert.equal(audio.diagnostics.sources, 6, 'two local voices per confirmed hit plus one spatial flesh sound per hit')
director.dispose(); world.dispose()
audio.dispose(); const disposedCount = sources().length
audio.confirmHit(body); await audio.unlock()
assert.equal(sources().length, disposedCount); assert.equal(audio.diagnostics.sources, 0)
assert(context.nodes.every(node => node.disconnected))
console.log('PASS Live enemy damage callback confirms only actual player hits/kills; misses, world-clipped shots, enemy fire and dead bodies do not confirm')

Object.assign(globalThis, { fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }) })
const sampled = new MissionAudio(); sampled.setActive(true); await sampled.unlock()
await new Promise(resolve => setTimeout(resolve, 0))
assert(sampled.diagnostics.decodedSamples >= 52)
const sampledContext = FakeAudioContext.latest
sampled.confirmHit(body)
const sampledBody = sampledContext.nodes.filter(node => node instanceof Source).slice(-2)[0] as Source
sampled.confirmHit(head)
const sampledHead = sampledContext.nodes.filter(node => node instanceof Source).slice(-2)[0] as Source
assert(sampledBody.buffer && sampledHead.buffer)
assert(sampledHead.playbackRate.value > sampledBody.playbackRate.value, 'decoded local flesh samples retain distinct region coloration')
assert.notEqual(sampledHead.buffer, sampledBody.buffer, 'successive hits select different flesh samples')
const beforeDamage = sampled.diagnostics.sources
sampled.play({ kind: 'damage' })
const originalDamage = sampledContext.nodes.filter(node => node instanceof Source).at(-1) as Source
assert(originalDamage.buffer, 'Bullet thumps preserve the existing recorded player damage layer')
const beforeThumpPanners = sampledContext.nodes.filter(node => 'positionX' in node).length
sampled.play({ kind: 'bullet-hit', intensity: 0.25, position: new THREE.Vector3(200, 0, 0), source: new THREE.Vector3(20, 0, 0) })
const softThump = sampledContext.nodes.filter(node => node instanceof Source).at(-1) as Source
assert.equal(sampled.diagnostics.sources, beforeDamage + 2, 'A bullet hit layers one brief thump under the damage sample')
assert.equal(softThump.buffer, undefined); assert.equal(softThump.type, 'sine')
assert.equal(softThump.stopTime, 0.13); assert(!softThump.loop)
assert.equal(softThump.frequency.values[0], 138); assert.equal(softThump.frequency.values.at(-1), 52)
assert.equal(sampledContext.nodes.filter(node => 'positionX' in node).length, beforeThumpPanners, 'Impact weight is local even if an event includes spatial metadata')
const thumpPeak = (source: Source) => Math.max(...(source.connections[0].connections[0] as Node & { gain: Param }).gain.values)
assert(thumpPeak(softThump) <= 0.07, 'The body layer stays below the original damage sample')
const afterThump = sampledContext.nodes.length
sampledContext.currentTime = 0.079; sampled.play({ kind: 'bullet-hit', intensity: 1 })
assert.equal(sampledContext.nodes.length, afterThump, 'Pellets and very rapid hits cannot stack thumps')
sampledContext.currentTime = 0.08; sampled.play({ kind: 'bullet-hit', intensity: 1 })
const hardThump = sampledContext.nodes.filter(node => node instanceof Source).at(-1) as Source
assert.equal(thumpPeak(hardThump), thumpPeak(softThump) * 2, 'Damage intensity controls impact weight without changing pitch')
assert.deepEqual(hardThump.frequency.values, softThump.frequency.values)
sampled.reset(); sampled.play({ kind: 'bullet-hit', intensity: 1 })
assert.equal(sampled.diagnostics.sources, 1, 'Reset clears the hit stacking limit')
const completedThump = sampledContext.nodes.filter(node => node instanceof Source).at(-1) as Source
completedThump.onended?.()
assert.equal(sampled.diagnostics.sources, 0, 'A finished thump releases its source, filter and gain')
assert(completedThump.disconnected && completedThump.connections[0].disconnected && completedThump.connections[0].connections[0].disconnected)
sampled.dispose()
assert(sampledContext.nodes.every(node => node.disconnected))
console.log('PASS Loaded flesh samples layer with original local cues, vary without immediate repeats and preserve head/body pitch distinction')
console.log('PASS Bullet damage retains its sample and adds one local, low descending thump with intensity, pellet rate limiting and complete cleanup')
