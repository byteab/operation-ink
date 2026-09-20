import assert from 'node:assert/strict'
import * as THREE from 'three'
import { MissionAudio } from '../src/game/audio'
import { IGI_SAMPLES, IGI_VOICES } from '../src/game/igi-samples'
import { existsSync, readFileSync } from 'node:fs'

class Param {
  value = 0
  events: { kind: string; value: number; time: number }[] = []
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push({ kind: 'set', value, time }) }
  exponentialRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push({ kind: 'exponential', value, time }) }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push({ kind: 'linear', value, time }) }
  cancelScheduledValues() {}
}
class Node {
  disconnected = false
  connections: Node[] = []
  connect(target: Node) { this.connections.push(target); return target }
  disconnect() { this.disconnected = true }
}
class Gain extends Node { gain = new Param() }
class Filter extends Node { frequency = new Param(); Q = new Param(); type = '' }
class Panner extends Node {
  positionX = new Param(); positionY = new Param(); positionZ = new Param()
  panningModel = ''; distanceModel = ''; refDistance = 0; maxDistance = 0; rolloffFactor = 0
}
class Source extends Node {
  buffer: unknown
  loop = false
  playbackRate = new Param()
  frequency = new Param()
  type = 'sine'
  onended: (() => void) | null = null
  stopped = false
  startTime = 0
  stopTime = 0
  start(time = 0) { this.startTime = time }
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
  createGain() { return this.keep(new Gain()) }
  createBiquadFilter() { return this.keep(new Filter()) }
  createPanner() { return this.keep(new Panner()) }
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

const incoming = new MissionAudio()
incoming.play({ kind: 'enemy-bullet-whiz', intensity: 1 }); incoming.play({ kind: 'bullet-hit', intensity: 1 })
assert.equal(incoming.diagnostics.sources, 0, 'Incoming cues remain locked until audio activation')
incoming.setActive(true); await incoming.unlock()
const incomingContext = FakeAudioContext.latest
const incomingSources = () => incomingContext.nodes.filter(node => node instanceof Source) as Source[]
const filterFor = (source: Source) => source.connections[0] as Filter
const gainFor = (source: Source) => filterFor(source).connections[0] as Gain
const pannerFor = (source: Source) => gainFor(source).connections[0] as Panner
const peakFor = (source: Source) => Math.max(...gainFor(source).gain.events.map(event => event.value))
const listener = new THREE.PerspectiveCamera(); listener.position.set(10, 1.6, -5)
incoming.update(listener)
const closest = listener.position.clone().add(new THREE.Vector3(0.5, 0, 0))
const muzzle = closest.clone().add(new THREE.Vector3(0, 0, -20))
const whiz = { kind: 'enemy-bullet-whiz', position: closest, source: muzzle, radius: 5, intensity: 0.9 }
incoming.play(whiz)
const [crack, air] = incomingSources().slice(-2)
assert.equal(incoming.diagnostics.sources, 4, 'One pass adds exactly two layers')
assert(crack.buffer && air.buffer && crack.buffer !== air.buffer, 'The crisp crack and soft air use different noise colors')
assert.equal(crack.startTime, air.startTime, 'Both layers start at the arrival event without another timing delay')
assert.equal(crack.stopTime, 0.038); assert.equal(air.stopTime, 0.15)
assert(peakFor(crack) <= 0.28 && peakFor(air) < peakFor(crack) * 0.4, 'The air tail stays below the sharp transient')
for (const layer of [crack, air]) {
  const filter = filterFor(layer)
  assert.equal(filter.type, 'bandpass'); assert(filter.Q.value < 1, 'No resonant ringing is introduced')
  assert(filter.frequency.events[0].value > filter.frequency.events.at(-1)!.value, 'Both noise colors descend briefly')
  assert.equal(gainFor(layer).gain.events.at(-1)!.value, 0.001)
  assert.equal(pannerFor(layer).positionX.value, closest.x, 'The passing side remains audible')
  assert(!layer.loop)
}
assert.equal(pannerFor(crack).positionZ.value, closest.z - 0.65, 'The crack has a bounded muzzle-direction bias')
assert.equal(pannerFor(air).positionZ.events[0].value, closest.z - 0.65)
assert.equal(pannerFor(air).positionZ.events.at(-1)!.value, closest.z + 0.9, 'The air tail moves past the closest point')
assert.equal(closest.z, -5); assert.equal(muzzle.z, -25, 'Spatial shaping never mutates gameplay positions')
const afterWhiz = incomingContext.nodes.length
incomingContext.currentTime = 0.089; incoming.play(whiz)
assert.equal(incomingContext.nodes.length, afterWhiz, 'Automatic fire within 90 ms does not stack passing cues')
incomingContext.currentTime = 0.09
incoming.play({ ...whiz, position: listener.position.clone().add(new THREE.Vector3(-4.5, 0, 0)), intensity: undefined })
const [farCrack, farAir] = incomingSources().slice(-2)
assert(peakFor(farCrack) < peakFor(crack) * 0.5 && peakFor(farAir) < peakFor(air) * 0.2, 'Outer-radius passes are quieter')
assert(pannerFor(farCrack).positionX.value < listener.position.x, 'Left-side passes retain left spatial placement')
incomingContext.currentTime = 0.2
const beforeRejected = incomingContext.nodes.length
incoming.play({ ...whiz, position: listener.position.clone().add(new THREE.Vector3(6, 0, 0)) })
incoming.play({ ...whiz, intensity: 0 }); incoming.play({ ...whiz, intensity: Number.NaN })
assert.equal(incomingContext.nodes.length, beforeRejected, 'Out-of-range, inaudible and invalid cues allocate no layers')
incoming.play(whiz)
assert.equal(incomingSources().length, 8, 'Rejected events do not consume the arrival cooldown')
console.log('PASS Incoming rounds layer a sharp crack and quieter descending pass, scale with distance, preserve side/source direction and rate-limit at 90 ms')

for (const mode of ['muted', 'zero-volume', 'paused'] as const) {
  incoming.setMuted(mode === 'muted'); incoming.setVolume(mode === 'zero-volume' ? 0 : 0.55); incoming.setActive(mode !== 'paused')
  const count = incomingContext.nodes.length
  incoming.play(whiz); incoming.play({ kind: 'bullet-hit', intensity: 1 })
  assert.equal(incomingContext.nodes.length, count, `${mode} rejects all incoming layers before allocation`)
}
incoming.setMuted(false); incoming.setVolume(0.55); incoming.setActive(true)
incoming.reset()
for (let i = 0; i < 79; i++) incoming.play({ kind: 'shot-ak' })
const protectedReports = incomingSources().filter(source => !source.disconnected)
const at79 = incomingContext.nodes.length
incoming.play(whiz)
assert.equal(incoming.diagnostics.sources, 79)
assert.equal(incomingContext.nodes.length, at79, 'A two-layer cue never partially allocates its last available slot')
protectedReports[0].onended?.()
incoming.play(whiz)
assert.equal(incoming.diagnostics.sources, 80, 'Failed capacity reservations leave the cue eligible on immediate retry')
assert(protectedReports.slice(1).every(source => !source.stopped), 'Urgent cues preserve active weapon reports')
incoming.reset()
for (let i = 0; i < 80; i++) incoming.play({ kind: 'impact' })
const expendable = incomingSources().filter(source => !source.disconnected)
incoming.play(whiz)
assert.equal(incoming.diagnostics.sources, 80)
assert(expendable[0].stopped && expendable[1].stopped && !expendable[2].stopped, 'Only the two oldest incidental effects make room for a full pass')
incoming.play({ kind: 'bullet-hit', intensity: 1 })
assert.equal(incoming.diagnostics.sources, 80); assert(expendable[2].stopped, 'Damage reserves only its one required source')
const incomingNodes = incomingContext.nodes.length
incomingContext.currentTime += 0.1; incoming.play(whiz)
assert.equal(incoming.diagnostics.sources, 80)
assert.equal(incomingContext.nodes.length, incomingNodes + 8, 'Another accepted pass replaces only its bounded layers')
incoming.reset(); assert.equal(incoming.diagnostics.sources, 0)
assert(incomingContext.nodes.slice(1).every(node => node.disconnected), 'Reset disconnects every replaced and retained effect node')
incoming.play(whiz); assert.equal(incoming.diagnostics.sources, 2, 'Reset clears the incoming rate limits')
const completed = incomingSources().slice(-2)
completed.forEach(source => source.onended?.())
assert.equal(incoming.diagnostics.sources, 0, 'Natural completion releases both layers from the source budget')
assert(completed.every(source => source.disconnected && filterFor(source).disconnected && gainFor(source).disconnected && pannerFor(source).disconnected))
incoming.dispose(); const disposedIncomingNodes = incomingContext.nodes.length
incoming.play(whiz); incoming.play({ kind: 'bullet-hit', intensity: 1 }); await incoming.unlock()
assert.equal(incomingContext.nodes.length, disposedIncomingNodes)
assert(incomingContext.nodes.every(node => node.disconnected))
console.log('PASS Incoming cues obey pause/mute/volume, atomically cap all layers at 80 sources, preserve reports, reclaim old incidental effects and release all nodes')

const dying = new MissionAudio()
dying.setActive(true); await dying.unlock()
const deathContext = FakeAudioContext.latest
for (let i = 0; i < 90; i++) dying.play({ kind: 'shot-ak' })
assert.equal(dying.diagnostics.sources, 80)
dying.beginDeath()
assert.equal(dying.diagnostics.sources, 2, 'Death clears saturated combat and always plays its two fallback layers')
assert(!dying.diagnostics.music && !dying.diagnostics.ambience)
const deathSources = deathContext.nodes.filter(node => node instanceof Source).slice(-2) as Source[]
assert.equal(deathSources[0].stopTime, 2.25); assert.equal(deathSources[1].stopTime, 1.15)
dying.update(camera); dying.setActive(true)
dying.play({ kind: 'enemy-shot-ak' }); dying.play({ kind: 'horn' })
assert.equal(dying.diagnostics.sources, 2, 'Death does not restart ambience or accept late combat sounds')
dying.play({ kind: 'player-fall' }); assert.equal(dying.diagnostics.sources, 3, 'Contact gets a separate local impact')
dying.setMuted(true); dying.play({ kind: 'player-fall' }); assert.equal(dying.diagnostics.sources, 3)
dying.setMuted(false); dying.setVolume(0); dying.play({ kind: 'player-fall' }); assert.equal(dying.diagnostics.sources, 3)
dying.setActive(false); assert.equal(dying.diagnostics.sources, 0)
assert(deathSources.every(source => source.disconnected))
dying.reset(); dying.setVolume(0.55); dying.setActive(true)
assert(dying.diagnostics.music && dying.diagnostics.ambience, 'Retry restores the ordinary soundscape')
dying.dispose()
console.log('PASS Death sound survives source saturation, has a distinct ground impact, obeys mute/volume and clears on pause/reset/disposal')

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
// Manifest ids are the source .wav names; the served files are mono AAC (looped alarm: FLAC).
const served = (file: string) => file.replace('.wav', file.includes('alarm_') ? '.flac' : '.m4a')
for (const file of routed) assert(existsSync(`public/sounds/${served(file)}`), `${file} is served as ${served(file)}`)
const response = (url: string, ok = true) => ({ ok, arrayBuffer: async () => new TextEncoder().encode(url).buffer })
const requested: string[] = []
Object.assign(globalThis, { fetch: async (url: string) => { requested.push(url); return response(url) } })
const igi = new MissionAudio(); igi.setActive(true); await igi.unlock()
await new Promise(resolve => setTimeout(resolve, 0))
assert(requested.every(url => !/\/(voice_|guard_hey|pain_)/.test(url)), 'Legacy character assets are never requested')
assert(requested.length === routed.size && requested.every(url => url.includes('/igi/')), 'Fallback recordings are not downloaded while the IGI bank decodes')
const igiContext = FakeAudioContext.latest
for (const [kind, entry] of Object.entries(IGI_SAMPLES)) {
  igi.reset()
  const before = igiContext.nodes.length
  igi.play({ kind })
  const source = igiContext.nodes.slice(before).find(node => node instanceof Source && (node.buffer as { url?: string })?.url) as Source
  assert(source, `${kind} must include a decoded recording, including layered cues`)
  const url = (source.buffer as { url: string }).url
  assert(entry.files.some(file => url.endsWith(`/sounds/${served(file)}`)), `${kind} must select its IGI sample`)
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
  assert(IGI_VOICES[voice].some(file => (bark.buffer as { url: string }).url.endsWith(`/sounds/${served(file)}`)))
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

const reports = new MissionAudio(); reports.setActive(true); await reports.unlock()
await new Promise(resolve => setTimeout(resolve, 0))
const reportContext = FakeAudioContext.latest
const reportSources = () => reportContext.nodes.filter(node => node instanceof Source) as Source[]
const latestReport = () => reportSources().at(-1)!
const reportCamera = new THREE.PerspectiveCamera(); reportCamera.position.set(0, 1.6, 0)
reports.update(reportCamera)
for (const weapon of ['pistol', 'ak', 'smg', 'shotgun', 'sniper']) {
  const kind = `enemy-shot-${weapon}`, radius = weapon === 'sniper' ? 130 : 80
  for (const distance of weapon === 'sniper' ? [20, 40, 60, 110] : [20, 40, 60]) {
    const before = reports.diagnostics.sources
    reports.play({ kind, position: new THREE.Vector3(distance, 1.6, 0), radius })
    assert.equal(reports.diagnostics.sources, before + 1, `${kind} remains audible throughout its combat range`)
    const source = latestReport(), gain = source.connections[0] as Gain, panner = gain.connections[0] as Panner
    const url = (source.buffer as { url: string }).url
    assert(IGI_SAMPLES[kind].files.some(file => url.endsWith(`/sounds/${served(file)}`)), `${kind} retains its native recording`)
    assert.equal(gain.gain.value, IGI_SAMPLES[kind].gain, 'Restoring range does not boost the original sample gain')
    assert(source.playbackRate.value >= 0.94 && source.playbackRate.value <= 1.06, 'Native report pitch is preserved')
    assert.equal(panner.panningModel, 'HRTF'); assert.equal(panner.distanceModel, 'inverse')
    assert.equal(panner.positionX.value, distance); assert.equal(panner.positionY.value, 1.6); assert.equal(panner.positionZ.value, 0)
    assert.equal(panner.refDistance, weapon === 'sniper' ? 16 : 10); assert.equal(panner.rolloffFactor, 0.85)
    assert.equal(panner.maxDistance, radius)
    const attenuation = panner.refDistance / (panner.refDistance + panner.rolloffFactor * (distance - panner.refDistance))
    assert(attenuation > (distance === 110 ? 0.15 : 0.18), 'Report retains a useful level beside local passing cues')
    assert(!source.loop)
  }
  const count = reportContext.nodes.length
  reports.play({ kind, position: new THREE.Vector3(radius + 1, 1.6, 0), radius })
  assert.equal(reportContext.nodes.length, count, 'Reports beyond the explicit event range are still culled')
}
reports.play({ kind: 'impact', position: new THREE.Vector3(12, 1.6, 0), radius: 18 })
const impactPanner = latestReport().connections[0].connections[0] as Panner
assert.equal(impactPanner.refDistance, 4); assert.equal(impactPanner.rolloffFactor, 1.35, 'Other spatial effects retain their existing attenuation')
console.log('PASS All enemy guns retain their native sampled report, source position and usable attenuation at 20/40/60 m and sniper 110 m')

reports.reset(); reports.update(reportCamera)
reports.play({ kind: 'callout', voice: 'contact', speaker: 99 })
reports.play({ kind: 'horn', position: new THREE.Vector3(10, 1.6, 0), radius: 100 })
reports.play({ kind: 'bullet-hit', intensity: 1 })
const protectedSources = reportSources().filter(source => !source.disconnected)
reports.play({ kind: 'enemy-bullet-whiz', position: new THREE.Vector3(0.5, 1.6, 0), intensity: 1 })
const passingSources = reportSources().slice(-2)
const room = 80 - reports.diagnostics.sources
for (let i = 0; i < room; i++) reports.play({ kind: i % 2 ? 'footstep' : 'impact' })
const incidentalSources = reportSources().slice(-room)
assert.equal(reports.diagnostics.sources, 80)
reports.play({ kind: 'enemy-shot-ak', position: new THREE.Vector3(40, 1.6, 0), radius: 80 })
const admittedEnemy = latestReport()
assert((admittedEnemy.buffer as { url: string }).url.endsWith('/igi/ak47_single.m4a'))
assert.equal(reports.diagnostics.sources, 80, 'A weapon report replaces an incidental sound without exceeding capacity')
assert(incidentalSources[0].stopped && !incidentalSources[1].stopped)
assert(passingSources.every(source => !source.stopped), 'Footsteps and impacts are reclaimed before older whiz layers')
reports.play({ kind: 'shot-pistol' })
const admittedPlayer = latestReport()
assert((admittedPlayer.buffer as { url: string }).url.includes('/igi/glock_shot_'))
assert(incidentalSources[1].stopped && !incidentalSources[2].stopped, 'Player reports receive the same source priority')
assert.equal(reports.diagnostics.sources, 80)
incidentalSources.forEach(source => source.onended?.())
while (reports.diagnostics.sources < 80) reports.play({ kind: 'shot-ak' })
const reportsBeforeWhizReclaim = reportSources().filter(source => !source.disconnected && !protectedSources.includes(source) && !passingSources.includes(source))
reports.play({ kind: 'enemy-shot-sniper', position: new THREE.Vector3(110, 1.6, 0), radius: 130 })
const admittedSniper = latestReport()
assert((admittedSniper.buffer as { url: string }).url.endsWith('/igi/svddrag_shot_1.m4a'))
assert(passingSources[0].stopped && !passingSources[1].stopped, 'The oldest whiz layer yields when no incidental sound remains')
assert.equal(reports.diagnostics.sources, 80)
reports.play({ kind: 'shot-smg' })
assert(passingSources[1].stopped, 'The remaining passing-air layer can also yield to a report')
assert.equal(reports.diagnostics.sources, 80)
assert(protectedSources.every(source => !source.stopped), 'Ambience, music, alarm, speech and impact thump remain protected')
assert(reportsBeforeWhizReclaim.every(source => !source.stopped) && !admittedSniper.stopped, 'Previously playing weapon reports are never interrupted')
const allProtected = reportContext.nodes.length
reports.play({ kind: 'enemy-shot-ak', position: new THREE.Vector3(20, 1.6, 0), radius: 80 })
assert.equal(reportContext.nodes.length, allProtected, 'A fully protected budget rejects another report safely')
reports.reset(); assert.equal(reports.diagnostics.sources, 0)
assert(reportContext.nodes.slice(1).every(node => node.disconnected), 'Reset releases reclaimed and protected sources and their nodes')
for (let i = 0; i < 80; i++) reports.play({ kind: 'shot-ak' })
const afterReset = reportContext.nodes.length
reports.play({ kind: 'enemy-shot-ak' })
assert.equal(reportContext.nodes.length, afterReset, 'Reset leaves no stale reclaimable source entries')
reports.dispose(); assert(reportContext.nodes.every(node => node.disconnected))
console.log('PASS Gun reports reclaim incidental sounds then whizzes at capacity, preserve reports/voices/loops/thumps, cap at 80 and clean up completely')

const shotgunAudio = new MissionAudio(); shotgunAudio.setActive(true); await shotgunAudio.unlock()
await new Promise(resolve => setTimeout(resolve, 0))
const sc = FakeAudioContext.latest
const latestShotgunSource = () => sc.nodes.filter(node => node instanceof Source).at(-1) as Source
for (const kind of ['shot-shotgun', 'enemy-shot-shotgun']) {
  shotgunAudio.play({ kind, position: new THREE.Vector3(1, 1, 0) })
  const source = latestShotgunSource()
  assert((source.buffer as { url: string }).url.endsWith('/igi/spas12_shot_1.m4a'), 'Both sides fire the original SPAS report')
  assert(source.playbackRate.value >= 0.94 && source.playbackRate.value <= 1.06, 'SPAS report retains its original pitch')
  assert(!source.loop, 'One report plays per shotgun blast')
}
const beforePump = shotgunAudio.diagnostics.sources
shotgunAudio.play({ kind: 'weapon-pump' })
assert.equal(shotgunAudio.diagnostics.sources, beforePump + 1, 'The two mechanism strokes use one bounded source')
assert((latestShotgunSource().buffer as { url: string }).url.endsWith('/igi/spas12_pump.m4a'))
shotgunAudio.play({ kind: 'shell-load' }); const firstShell = latestShotgunSource().buffer
shotgunAudio.play({ kind: 'shell-load' }); const nextShell = latestShotgunSource().buffer
assert((firstShell as { url: string }).url.includes('/igi/spas12_bulins_'))
assert.notEqual(firstShell, nextShell, 'Successive shells vary the original insertion clips')
for (const [kind, clip] of [['reload', 'spas12_reload_1'], ['reload-ready', 'spas12_reload_2'], ['enemy-reload', 'spas12_pump']]) {
  shotgunAudio.play({ kind, weapon: 'shotgun' })
  assert((latestShotgunSource().buffer as { url: string }).url.endsWith(`/igi/${clip}.m4a`), 'Shotgun reload metadata selects SPAS mechanism clips')
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
assert((alarm.buffer as { url: string }).url.endsWith('/igi/alarm_1.flac'))
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
