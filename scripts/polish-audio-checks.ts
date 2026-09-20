import assert from 'node:assert/strict'
import * as THREE from 'three'
import { MissionAudio } from '../src/game/audio'
import { IGI_SAMPLES, IGI_VOICES } from '../src/game/igi-samples'
import { readFileSync } from 'node:fs'

class Param {
  value = 0
  setValueAtTime(value: number) { this.value = value }
  exponentialRampToValueAtTime(value: number) { this.value = value }
  linearRampToValueAtTime(value: number) { this.value = value }
  cancelScheduledValues() {}
}
class Node {
  disconnected = false
  connect(target: Node) { return target }
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
  start() {}
  stop(time?: number) { if (time === undefined) { this.stopped = true; this.onended?.() } }
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
  createBiquadFilter() { return this.keep(Object.assign(new Node(), { frequency: new Param(), type: '' })) }
  createPanner() { return this.keep(Object.assign(new Node(), { positionX: new Param(), positionY: new Param(), positionZ: new Param() })) }
  createBufferSource() { return this.keep(new Source()) }
  createOscillator() { return this.keep(new Source()) }
  createBuffer(_channels: number, length: number, rate: number) { const data = new Float32Array(length); return { duration: length / rate, getChannelData: () => data } }
  async decodeAudioData(data: ArrayBuffer) { return Object.assign(this.createBuffer(1, 1200, 1000), { url: new TextDecoder().decode(data) }) }
  async resume() { this.state = 'running' }
  async suspend() { this.state = 'suspended' }
  async close() { this.state = 'closed' }
}
Object.assign(globalThis, { AudioContext: FakeAudioContext, fetch: async () => ({ ok: false }) })
const audio = new MissionAudio()
audio.play({ kind: 'shot-sniper' }); assert.equal(audio.diagnostics.sources, 0)
audio.setActive(true); await audio.unlock()
assert.equal(audio.status, 'running'); assert.equal(audio.diagnostics.sources, 2); assert(audio.diagnostics.music)
console.log('PASS browser activation starts exactly one ambience/music pair')

const camera = new THREE.PerspectiveCamera()
audio.update(camera); audio.setActive(true); await audio.unlock()
assert.equal(audio.diagnostics.sources, 2)
audio.play({ kind: 'enemy-shot-sniper', position: new THREE.Vector3(90, 0, 0), radius: 70 })
assert.equal(audio.diagnostics.sources, 2)
for (const zone of ['head', 'torso', 'arm', 'leg'] as const) audio.play({ kind: 'enemy-hit', zone, position: new THREE.Vector3(2, 0, 0) })
for (const kind of ['shot-sniper', 'switch', 'reload', 'reload-ready', 'empty', 'pickup', 'impact']) audio.play({ kind })
assert.equal(audio.diagnostics.sources, 13)
console.log('PASS all hit regions and mechanical/sniper events produce spatial or local sources; range culls distant shots')

const beforeVoices = audio.diagnostics.sources
for (const voice of ['contact', 'hurt', 'search', 'lost', 'reload']) audio.play({ kind: 'callout', voice, speaker: 1 })
assert.equal(audio.diagnostics.sources, beforeVoices, 'Unavailable vocals never produce synthetic tones')
assert.equal(audio.diagnostics.acceptedVoices, 0)
assert.equal(audio.diagnostics.suppressedVoices, 0)
console.log('PASS unavailable character recordings stay silent without consuming voice cooldowns')

const beforeLadder = audio.diagnostics.sources
audio.play({ kind: 'ladder' }); audio.play({ kind: 'ladder' })
assert.equal(audio.diagnostics.sources, beforeLadder)
FakeAudioContext.latest.currentTime += 0.2
audio.play({ kind: 'ladder' }); assert.equal(audio.diagnostics.sources, beforeLadder)
console.log('PASS unavailable ladder samples do not produce synthetic clatter')

audio.setVolume(2); assert.equal(audio.volume, 1); audio.setVolume(-1); assert.equal(audio.volume, 0)
audio.setMuted(true); const mutedSources = audio.diagnostics.sources
audio.play({ kind: 'shot-sniper' }); assert.equal(audio.diagnostics.sources, mutedSources)
audio.setMuted(false); audio.setActive(false)
assert.equal(audio.diagnostics.sources, 0); assert.equal(audio.status, 'suspended'); assert(!audio.diagnostics.music)
assert(FakeAudioContext.latest.nodes.slice(1).every(node => node.disconnected))
audio.setActive(true); assert.equal(audio.diagnostics.sources, 2)
audio.reset(); assert.equal(audio.diagnostics.sources, 0)
audio.update(camera); assert.equal(audio.diagnostics.sources, 2)
audio.dispose(); audio.setActive(true); await audio.unlock()
assert.equal(audio.diagnostics.sources, 0); assert.equal(audio.status, 'locked'); assert.equal(audio.diagnostics.active, false)
assert(FakeAudioContext.latest.nodes.every(node => node.disconnected))
console.log('PASS mute, pause, resume, reset and disposal clean nodes and do not duplicate loops')

let releaseFetch!: () => void
const pending = new Promise<void>(resolve => { releaseFetch = resolve })
Object.assign(globalThis, { fetch: async () => { await pending; return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) } } })
const loading = new MissionAudio()
await loading.unlock(); loading.dispose(); releaseFetch()
await new Promise(resolve => setTimeout(resolve, 0))
assert.equal(loading.diagnostics.decodedSamples, 0)
assert.equal(loading.diagnostics.sources, 0)
console.log('PASS late asynchronous sample loads cannot repopulate disposed audio')

Object.assign(globalThis, { fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }) })
const sampled = new MissionAudio()
sampled.setActive(true); await sampled.unlock(); await new Promise(resolve => setTimeout(resolve, 0))
assert(sampled.diagnostics.decodedSamples >= 52)
const context = FakeAudioContext.latest
sampled.play({ kind: 'callout', voice: 'contact', speaker: 1 })
context.currentTime = 1
sampled.play({ kind: 'callout', voice: 'hurt', speaker: 2 })
assert.equal(sampled.diagnostics.acceptedVoices, 1)
context.currentTime = 1.6
sampled.play({ kind: 'callout', voice: 'hurt', speaker: 2 })
assert.equal(sampled.diagnostics.acceptedVoices, 2)
sampled.play({ kind: 'enemy-hit', zone: 'head' })
const head = context.nodes.filter(node => node instanceof Source).at(-1) as Source
sampled.play({ kind: 'enemy-hit', zone: 'torso' })
const torso = context.nodes.filter(node => node instanceof Source).at(-1) as Source
assert(head.playbackRate.value > torso.playbackRate.value)
sampled.play({ kind: 'shot-sniper' })
const sniper = context.nodes.filter(node => node instanceof Source).at(-1) as Source
assert(sniper.playbackRate.value >= 0.94 && sniper.playbackRate.value <= 1.06, 'Dedicated IGI sniper report plays near its original pitch')
sampled.dispose()
console.log('PASS decoded voice duration prevents overlap; head/torso and sniper samples retain distinct pitch ranges')

// Pain is an immediate reaction, separate from throttled spoken tactics.
const reactions = new MissionAudio()
reactions.setActive(true); await reactions.unlock(); await new Promise(resolve=>setTimeout(resolve,0))
const rc = FakeAudioContext.latest
reactions.play({kind:'callout',voice:'contact',speaker:1})
const speech = rc.nodes.filter(node=>node instanceof Source).at(-1) as Source
reactions.play({kind:'enemy-pain',speaker:1,position:new THREE.Vector3(2,1,0)})
assert(speech.stopped,'A wounded speaker interrupts their own line')
const afterPain = reactions.diagnostics.sources
reactions.play({kind:'enemy-pain',speaker:1});assert.equal(reactions.diagnostics.sources,afterPain,'Repeated bullets do not stack pain')
reactions.play({kind:'enemy-pain',speaker:2});assert.equal(reactions.diagnostics.sources,afterPain+1,'Another wounded guard can react during speech cooldown')
reactions.play({kind:'enemy-pain',speaker:3})
reactions.play({kind:'enemy-pain',speaker:4});assert.equal(reactions.diagnostics.sources,afterPain+2,'At most three pain reactions overlap')
reactions.reset();assert.equal(reactions.diagnostics.sources,0)
reactions.play({kind:'enemy-pain',speaker:1});assert.equal(reactions.diagnostics.sources,1,'Reset clears pain limits')
reactions.setMuted(true);reactions.play({kind:'enemy-pain',speaker:2});assert.equal(reactions.diagnostics.sources,1)
reactions.setActive(false);assert.equal(reactions.diagnostics.sources,0)
reactions.dispose()
console.log('PASS Immediate pain interrupts the hurt speaker, survives dialogue cooldowns, stays bounded, and respects mute/pause/reset')

// Track the requested URL through decoding to prove routing selects the actual IGI bank.
const manifest = JSON.parse(readFileSync('public/sounds/igi/manifest.json', 'utf8')) as { assets: { file: string }[] }
const deployed = new Set(manifest.assets.map(asset => `igi/${asset.file}`))
const routed = new Set([...Object.values(IGI_SAMPLES).flatMap(entry => entry.files), ...Object.values(IGI_VOICES).flat()])
assert.deepEqual(routed, deployed, 'Every installed sample is used, and every route has a deployed sample')
const response = (url: string, ok = true) => ({ ok, arrayBuffer: async () => new TextEncoder().encode(url).buffer })
const requested: string[] = []
Object.assign(globalThis, { fetch: async (url: string) => { requested.push(url); return response(url) } })
const igi = new MissionAudio(); igi.setActive(true); await igi.unlock()
await new Promise(resolve => setTimeout(resolve, 0))
assert(requested.every(url => !/\/(voice_|guard_hey|pain_)/.test(url)), 'Legacy character assets are never requested')
const igiContext = FakeAudioContext.latest
for (const [kind, entry] of Object.entries(IGI_SAMPLES)) {
  igi.reset(); igi.play({ kind })
  const source = igiContext.nodes.filter(node => node instanceof Source).at(-1) as Source
  const url = (source.buffer as { url: string }).url
  assert(entry.files.some(file => url.endsWith(`/sounds/${file}`)), `${kind} must select its IGI sample`)
}
igi.reset()
igi.play({ kind: 'ladder', position: new THREE.Vector3(0, 0, 0) })
const rung1 = igiContext.nodes.filter(node => node instanceof Source).at(-1) as Source
igiContext.currentTime += 0.5
igi.play({ kind: 'ladder', position: new THREE.Vector3(0, 0.8, 0) })
const rung2 = igiContext.nodes.filter(node => node instanceof Source).at(-1) as Source
assert.notEqual(rung1.buffer, rung2.buffer, 'Successive rungs vary the original climbing sounds')
assert(!rung1.loop && !rung2.loop, 'Climbing plays one-shots, not a persistent ladder loop')
for (const voice of Object.keys(IGI_VOICES)) {
  igi.reset(); igi.play({ kind: 'callout', voice, speaker: 1 })
  const bark = igiContext.nodes.filter(node => node instanceof Source).at(-1) as Source
  assert(IGI_VOICES[voice].some(file => (bark.buffer as { url: string }).url.endsWith(`/sounds/${file}`)))
}
igi.reset()
for (const voice of ['lost', 'search', 'down', 'reload', 'flank', 'retreat', 'clear']) {
  igi.play({ kind: 'callout', voice, speaker: 1 })
}
assert.equal(igi.diagnostics.sources, 0, 'Unmapped dialogue stays caption-only')
igi.play({ kind: 'callout', voice: 'contact', speaker: 1 })
const alert = igiContext.nodes.filter(node => node instanceof Source).at(-1) as Source
igi.play({ kind: 'enemy-pain', speaker: 1 })
const pain = igiContext.nodes.filter(node => node instanceof Source).at(-1) as Source
assert(alert.stopped, 'Being hit interrupts the original detection bark')
assert((pain.buffer as { url: string }).url.includes('/igi/ai_hit_'), 'Hits use original IGI pain recordings')
igi.reset()
igi.play({ kind: 'enemy-bullet-whiz', position: new THREE.Vector3(1, 1.6, 0) })
const flybyCount = igi.diagnostics.sources
assert(flybyCount > 0, 'Flyby creates a spatial sound')
igi.play({ kind: 'enemy-bullet-whiz' })
assert.equal(igi.diagnostics.sources, flybyCount, 'Concurrent enemy flybys are rate limited')
igi.reset()
assert.equal(igi.diagnostics.sources, 0)
igi.play({ kind: 'enemy-bullet-whiz' })
assert(igi.diagnostics.sources > 0, 'Reset clears the flyby cooldown')
igi.setMuted(true); igi.reset(); igi.play({ kind: 'enemy-bullet-whiz' })
assert.equal(igi.diagnostics.sources, 0, 'Flyby respects mute')
igi.dispose()
console.log('PASS Bullet flyby synthesis is bounded, spatial, resettable and muted with other effects')
console.log('PASS All IGI routes select deployed WAVs; climbing varies one-shots, detection/hurt use original vocals, and hits interrupt barks')

const shotgunAudio = new MissionAudio(); shotgunAudio.setActive(true); await shotgunAudio.unlock()
await new Promise(resolve => setTimeout(resolve, 0))
const sc = FakeAudioContext.latest
const latestShotgunSource = () => sc.nodes.filter(node => node instanceof Source).at(-1) as Source
for (const kind of ['shot-shotgun', 'enemy-shot-shotgun']) {
  shotgunAudio.play({ kind, position: new THREE.Vector3(1, 1, 0) })
  const source = latestShotgunSource()
  assert((source.buffer as { url: string }).url.endsWith('/igi/spas12_shot_1.wav'), 'Both sides fire the original SPAS report')
  assert(source.playbackRate.value >= 0.94 && source.playbackRate.value <= 1.06, 'SPAS report retains its original pitch')
  assert(!source.loop, 'One report plays per shotgun blast')
}
const beforePump = shotgunAudio.diagnostics.sources
shotgunAudio.play({ kind: 'weapon-pump' })
assert.equal(shotgunAudio.diagnostics.sources, beforePump + 1, 'The two mechanism strokes use one bounded source')
assert((latestShotgunSource().buffer as { url: string }).url.endsWith('/igi/spas12_pump.wav'))
shotgunAudio.play({ kind: 'shell-load' }); const firstShell = latestShotgunSource().buffer
shotgunAudio.play({ kind: 'shell-load' }); const nextShell = latestShotgunSource().buffer
assert((firstShell as { url: string }).url.includes('/igi/spas12_bulins_'))
assert.notEqual(firstShell, nextShell, 'Successive shells vary the original insertion clips')
for (const [kind, clip] of [['reload', 'spas12_reload_1'], ['reload-ready', 'spas12_reload_2'], ['enemy-reload', 'spas12_pump']]) {
  shotgunAudio.play({ kind, weapon: 'shotgun' })
  assert((latestShotgunSource().buffer as { url: string }).url.endsWith(`/igi/${clip}.wav`), 'Shotgun reload metadata selects SPAS mechanism clips')
  shotgunAudio.play({ kind, weapon: 'ak' })
  assert((latestShotgunSource().buffer as { url: string }).url.includes('/igi/ak47_reload_'), 'Other weapons retain their existing reload clips')
}
for (const mode of ['muted', 'zero-volume', 'paused'] as const) {
  shotgunAudio.setMuted(mode === 'muted'); shotgunAudio.setVolume(mode === 'zero-volume' ? 0 : 0.55); shotgunAudio.setActive(mode !== 'paused')
  const count = sc.nodes.length
  for (const kind of ['shot-shotgun', 'enemy-shot-shotgun', 'weapon-pump', 'shell-load']) shotgunAudio.play({ kind })
  assert.equal(sc.nodes.length, count, `${mode} prevents shotgun and mechanism source allocation`)
}
shotgunAudio.setMuted(false); shotgunAudio.setVolume(0.55); shotgunAudio.setActive(true)
for (let i = 0; i < 100; i++) shotgunAudio.play({ kind: i % 2 ? 'weapon-pump' : 'shot-shotgun' })
assert.equal(shotgunAudio.diagnostics.sources, 80, 'Rapid shotgun effects retain the global source budget')
shotgunAudio.dispose(); assert.equal(shotgunAudio.diagnostics.sources, 0)
assert(sc.nodes.every(node => node.disconnected), 'Shotgun reset/disposal disconnects every node')
console.log('PASS Original shotgun report/pump/shell routing, native report pitch, shell variation, mute/pause/volume, source budget and disposal')

const siren = new MissionAudio(); siren.setActive(true); await siren.unlock()
await new Promise(resolve => setTimeout(resolve, 0))
const ac = FakeAudioContext.latest
siren.setAlarm(true, new THREE.Vector3(4, 2, 0))
const alarm = ac.nodes.filter(node => node instanceof Source).at(-1) as Source
assert((alarm.buffer as { url: string }).url.endsWith('/igi/alarm_1.wav'))
assert(alarm.loop); assert.equal(alarm.playbackRate.value, 1)
const count = siren.diagnostics.sources
for (let i = 0; i < 100; i++) { siren.setAlarm(true); siren.play({kind:'horn'}) }
assert.equal(siren.diagnostics.sources, count, 'Repeating alarm events never stack sirens')
siren.setAlarm(false); assert(alarm.stopped); assert(!siren.diagnostics.alarm)
for (const mode of ['mute', 'zero-volume', 'pause', 'range'] as const) {
  siren.setActive(true); siren.setMuted(false); siren.setVolume(0.55); siren.setAlarm(true)
  if (mode === 'mute') siren.setMuted(true)
  if (mode === 'zero-volume') siren.setVolume(0)
  if (mode === 'pause') siren.setActive(false)
  siren.setAlarm(true, new THREE.Vector3(mode === 'range' ? 150 : 0, 0, 0))
  assert(!siren.diagnostics.alarm, `${mode} stops the siren`)
}
siren.setAlarm(false); siren.reset(); siren.dispose()
assert(ac.nodes.every(node => node.disconnected))
console.log('PASS Original IGI siren loops at native pitch, does not stack, and stops on silence/mute/pause/range/reset')

for (const failure of ['missing', 'decode'] as const) {
  let release!: () => void
  const ready = new Promise<void>(resolve => { release = resolve })
  Object.assign(globalThis, { fetch: async (url: string) => { await ready; return response(url, failure !== 'missing' || !url.includes('/igi/')) } })
  const fallback = new MissionAudio()
  await fallback.unlock()
  const fc = FakeAudioContext.latest, decode = fc.decodeAudioData.bind(fc)
  if (failure === 'decode') fc.decodeAudioData = async data => {
    if (new TextDecoder().decode(data).includes('/igi/')) throw new Error('Corrupt sample')
    return decode(data)
  }
  release()
  await new Promise(resolve => setTimeout(resolve, 0))
  fallback.setActive(true); fallback.play({ kind: 'shot-sniper' })
  const shot = fc.nodes.filter(node => node instanceof Source).at(-1) as Source
  assert((shot.buffer as { url: string }).url.includes('/sounds/shot_rifle_'), `${failure}: previous sample is retained`)
  assert(shot.playbackRate.value < 0.8, 'Fallback rifle keeps the original sniper pitch adjustment')
  for (const kind of ['shot-shotgun', 'enemy-shot-shotgun']) {
    fallback.play({ kind })
    const report = fc.nodes.filter(node => node instanceof Source).at(-1) as Source
    assert((report.buffer as { url: string }).url.includes('/sounds/shot_rifle_'), `${failure}: shotgun retains the previous sample fallback`)
    assert(report.playbackRate.value >= 0.58 && report.playbackRate.value <= 0.66, 'Only the fallback uses the lowered rifle pitch')
  }
  for (const kind of ['weapon-pump', 'shell-load']) {
    fallback.play({ kind })
    const mechanism = fc.nodes.filter(node => node instanceof Source).at(-1) as Source
    assert.equal(mechanism.buffer, undefined, `${failure}: ${kind} retains the existing mechanical fallback`)
  }
  for (const kind of ['reload', 'enemy-reload', 'reload-ready']) {
    fallback.play({ kind, weapon: 'shotgun' })
    const mechanism = fc.nodes.filter(node => node instanceof Source).at(-1) as Source
    assert.equal(mechanism.buffer, undefined, `${failure}: shotgun ${kind} keeps the mechanical fallback`)
  }
  fallback.play({ kind: 'empty' })
  const empty = fc.nodes.filter(node => node instanceof Source).at(-1) as Source
  assert.equal(empty.buffer, undefined, 'Mechanical effects synthesize when their IGI sample is unavailable')
  const beforeVocals = fallback.diagnostics.sources
  fallback.play({ kind: 'callout', voice: 'contact', speaker: 1 })
  fallback.play({ kind: 'enemy-pain', speaker: 2 })
  assert.equal(fallback.diagnostics.sources, beforeVocals, 'Failed IGI vocals never fall back to legacy voices or synthetic tones')
  fallback.dispose()
}
console.log('PASS Missing and undecodable IGI sounds fall back to previous samples or synthesis')
