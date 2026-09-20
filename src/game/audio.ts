import * as THREE from 'three'
import type { SoundEvent } from './types'
import type { HitReaction } from './hit-reactions'
import { IGI_SAMPLES, IGI_VOICES } from './igi-samples'

/**
 * IGI effects take priority over the previous samples (see public/sounds/CREDITS.md).
 * Procedural synthesis remains the fallback for kinds without a decoded sample.
 */
const series = (name: string, count: number) => Array.from({ length: count }, (_, i) => `${name}_${i}`)
const SAMPLES: Record<string, { files: string[]; gain: number; pitch?: number }> = {
  footstep: { files: series('step_gravel', 10), gain: 0.42 },
  'enemy-footstep': { files: series('step_gravel', 10), gain: 0.34 },
  door: { files: series('door', 1), gain: 0.3 },
  'shot-pistol': { files: series('shot_pistol', 4), gain: 0.75 },
  'shot-ak': { files: series('shot_rifle', 5), gain: 0.8 },
  'shot-smg': { files: series('shot_rifle', 5), gain: 0.62, pitch: 1.28 },
  'shot-shotgun': { files: series('shot_rifle', 5), gain: 0.95, pitch: 0.62 },
  'shot-sniper': { files: series('shot_rifle', 5), gain: 0.9, pitch: 0.72 },
  'enemy-shot-pistol': { files: series('shot_pistol', 4), gain: 0.7 },
  'enemy-shot-ak': { files: series('shot_rifle', 5), gain: 0.75 },
  'enemy-shot-smg': { files: series('shot_rifle', 5), gain: 0.6, pitch: 1.28 },
  'enemy-shot-shotgun': { files: series('shot_rifle', 5), gain: 0.88, pitch: 0.62 },
  'enemy-shot-sniper': { files: series('shot_rifle', 5), gain: 0.82, pitch: 0.72 },
  impact: { files: series('hit_world', 5), gain: 0.35 },
  'enemy-hit': { files: series('hit_flesh', 5), gain: 0.75 },
  'hit-confirm': { files: series('hit_flesh', 5), gain: 0.34 },
  'enemy-down': { files: series('body_fall', 5), gain: 0.5 },
  damage: { files: series('hit_flesh', 5), gain: 0.5 },
  'player-fall': { files: series('body_fall', 5), gain: 0.7 },
}
const URGENT = new Set(['contact', 'hurt', 'down', 'retreat'])
const SOURCE_LIMIT = 80
const INCIDENTAL = new Set(['footstep', 'enemy-footstep', 'impact'])
const PAIN_PITCH = [0.93, 1, 1.06, 0.97]
const HIT_COLOR = { head: { pitch: 1.22, gain: 1.06 }, torso: { pitch: 0.82, gain: 1 }, arm: { pitch: 1.1, gain: 0.8 }, leg: { pitch: 0.94, gain: 0.88 } }

export class MissionAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private sources = new Set<AudioScheduledSourceNode>()
  private incidentalSources = new Set<AudioScheduledSourceNode>()
  private whizSources = new Set<AudioScheduledSourceNode>()
  private cleanup = new Map<AudioScheduledSourceNode, () => void>()
  private noise: AudioBuffer | null = null
  private crackNoise: AudioBuffer | null = null
  private ambience: AudioBufferSourceNode | null = null
  private music: AudioBufferSourceNode | null = null
  private alarmSource: AudioScheduledSourceNode | null = null
  private musicBuffer: AudioBuffer | null = null
  private musicGain: GainNode | null = null
  private buffers = new Map<string, AudioBuffer>()
  private loading = false
  private lastIndex = new Map<string, number>()
  private whizUntil = 0
  private bulletHitUntil = 0
  private voiceUntil = 0
  private speakerUntil = new Map<number, number>()
  private phraseUntil = new Map<string, number>()
  private painUntil = new Map<number, number>()
  private painSources = new Set<AudioScheduledSourceNode>()
  private spoken: { source: AudioScheduledSourceNode; speaker: number } | null = null
  private disposed = false
  private loadAbort = new AbortController()
  private acceptedVoices = 0
  private suppressedVoices = 0
  private active = false
  private dying = false
  private listenerPosition = new THREE.Vector3()
  volume = 0.55
  muted = false

  async unlock() {
    if (this.disposed) return
    try {
      if (!this.context) {
        this.context = new AudioContext()
        this.master = this.context.createGain()
        this.master.connect(this.context.destination)
        this.setVolume(this.volume)
        this.noise = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate)
        const data = this.noise.getChannelData(0)
        let previous = 0
        for (let i = 0; i < data.length; i++) { previous = (previous + (Math.random() * 2 - 1) * 0.05) / 1.05; data[i] = previous * 4 }
        this.crackNoise = this.context.createBuffer(1, this.context.sampleRate * 0.5, this.context.sampleRate)
        const crack = this.crackNoise.getChannelData(0)
        for (let i = 0; i < crack.length; i++) crack[i] = Math.random() * 2 - 1
        this.musicBuffer = this.composeMusic(this.context)
      }
      if (this.active) await this.context.resume()
      if (this.active) this.startAmbience()
      void this.load()
    } catch { /* Captions always carry gameplay information even if audio is unavailable. */ }
  }

  private async load() {
    if (this.loading || !this.context || this.disposed) return
    this.loading = true
    const context = this.context
    // IGI ids keep their source names (igi/manifest.json) but ship as mono AAC; the looped
    // alarm is FLAC because AAC tail padding would leave a gap at every loop (see CREDITS.md).
    const served = (name: string) => name.endsWith('.wav') ? name.replace('.wav', name.includes('alarm_') ? '.flac' : '.m4a') : `${name}.m4a`
    const fetchAll = (names: Iterable<string>) => Promise.all([...new Set(names)].map(async name => {
      try {
        const response = await fetch(`${import.meta.env?.BASE_URL ?? '/'}sounds/${served(name)}`, { signal: this.loadAbort.signal })
        if (!response.ok) return
        const buffer = await context.decodeAudioData(await response.arrayBuffer())
        if (!this.disposed && context === this.context) this.buffers.set(name, buffer)
      } catch { /* missing sample: procedural fallback stays in place */ }
    }))
    await fetchAll([...Object.values(IGI_SAMPLES).flatMap(entry => entry.files), ...Object.values(IGI_VOICES).flat()])
    // The older recordings are only downloaded for kinds whose IGI samples all failed.
    if (this.disposed) return
    await fetchAll(Object.entries(SAMPLES).filter(([kind]) => !IGI_SAMPLES[kind]?.files.some(file => this.buffers.has(file))).flatMap(([, entry]) => entry.files))
  }

  setVolume(value: number) {
    this.volume = THREE.MathUtils.clamp(value, 0, 1)
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume
  }

  setMuted(muted: boolean) { this.muted = muted; this.setVolume(this.volume) }

  setActive(active: boolean) {
    if (this.disposed) return
    if (active === this.active) return
    this.active = active
    if (!active) { this.clear(); void this.context?.suspend().catch(() => {}) }
    else { void this.context?.resume().catch(() => {}); this.startAmbience() }
  }

  update(camera: THREE.Camera) {
    if (!this.context) return
    const p = camera.getWorldPosition(new THREE.Vector3()), f = camera.getWorldDirection(new THREE.Vector3())
    this.listenerPosition.copy(p)
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()))
    const listener = this.context.listener
    if (listener.positionX) {
      listener.positionX.value = p.x; listener.positionY.value = p.y; listener.positionZ.value = p.z
      listener.forwardX.value = f.x; listener.forwardY.value = f.y; listener.forwardZ.value = f.z
      listener.upX.value = u.x; listener.upY.value = u.y; listener.upZ.value = u.z
    } else { listener.setPosition(p.x, p.y, p.z); listener.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z) }
    if (this.active && !this.ambience) this.startAmbience()
  }

  private startAmbience() {
    if (!this.active || this.dying || this.disposed || !this.context || !this.noise || !this.master || this.ambience) return
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain()
    source.buffer = this.noise; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = 320
    gain.gain.value = 0.035
    source.connect(filter).connect(gain).connect(this.master)
    this.track(source, [filter, gain]); source.start(); this.ambience = source
    if (this.musicBuffer) {
      const music = this.context.createBufferSource(), musicGain = this.context.createGain()
      music.buffer = this.musicBuffer; music.loop = true; musicGain.gain.value = 0.028
      music.connect(musicGain).connect(this.master)
      this.track(music, [musicGain]); music.start(); this.music = music; this.musicGain = musicGain
    }
  }

  /** Original 16-second D-minor ambient phrase; envelopes reach zero at the seamless loop boundary. */
  private composeMusic(context: AudioContext) {
    const buffer = context.createBuffer(1, context.sampleRate * 16, context.sampleRate)
    const data = buffer.getChannelData(0), notes = [146.8324, 174.6141, 220, 164.8138]
    for (let i = 0; i < data.length; i++) {
      const t = i / context.sampleRate, phrase = Math.sin(Math.PI * t / 16) ** 2
      const pulse = Math.sin(Math.PI * (t % 4) / 4) ** 2, note = notes[Math.floor(t / 4)]
      data[i] = phrase * (Math.sin(2 * Math.PI * 73.4162 * t) * 0.35 + Math.sin(2 * Math.PI * 110 * t) * 0.2 + Math.sin(2 * Math.PI * note * t) * pulse * 0.28)
    }
    return buffer
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[], priority?: 'incidental' | 'whiz') {
    this.sources.add(source)
    if (priority === 'incidental') this.incidentalSources.add(source)
    if (priority === 'whiz') this.whizSources.add(source)
    const release = () => {
      source.onended = null; source.disconnect(); nodes.forEach(node => node.disconnect())
      this.sources.delete(source); this.cleanup.delete(source)
      this.incidentalSources.delete(source)
      this.whizSources.delete(source)
      this.painSources.delete(source)
      if (this.spoken?.source === source) this.spoken = null
      if (this.alarmSource === source) this.alarmSource = null
    }
    this.cleanup.set(source, release); source.onended = release
  }

  /** Reserve every layer together. Weapon reports also outrank passing air;
   * existing reports, voices, hit thumps, alarms and music remain protected. */
  private reserveSources(count: number, reclaimWhiz = false) {
    const needed = this.sources.size + count - SOURCE_LIMIT
    if (needed <= 0) return true
    const available = [...this.incidentalSources, ...(reclaimWhiz ? this.whizSources : [])]
    if (available.length < needed) return false
    for (const source of available.slice(0, needed)) {
      try { source.stop() } catch { /* already ended */ }
      this.cleanup.get(source)?.()
    }
    return true
  }

  private duckMusic() {
    if (!this.context || !this.musicGain) return
    const t = this.context.currentTime, gain = this.musicGain.gain
    gain.cancelScheduledValues(t); gain.setValueAtTime(0.008, t)
    gain.setValueAtTime(0.008, t + 0.65); gain.linearRampToValueAtTime(0.028, t + 1.5)
  }

  private output(event: SoundEvent) {
    const context = this.context!
    const gain = context.createGain()
    const panner = event.position ? context.createPanner() : null
    if (panner) {
      const vocal = event.kind === 'callout' || event.kind === 'enemy-pain'
      const enemyReport = event.kind.startsWith('enemy-shot-')
      panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'
      panner.refDistance = event.kind === 'horn' ? 24 : enemyReport ? event.kind === 'enemy-shot-sniper' ? 16 : 10 : vocal ? 10 : 4
      panner.maxDistance = event.radius ?? 60; panner.rolloffFactor = event.kind === 'horn' ? 0.65 : vocal || enemyReport ? 0.85 : 1.35
      panner.positionX.value = event.position!.x; panner.positionY.value = event.position!.y; panner.positionZ.value = event.position!.z
      gain.connect(panner).connect(this.master!)
    } else gain.connect(this.master!)
    return { gain, panner }
  }

  private pick(kind: string, files: string[]) {
    files = files.filter(file => this.buffers.has(file))
    if (!files.length) return undefined
    let index = Math.floor(Math.random() * files.length)
    if (files.length > 1 && index === this.lastIndex.get(kind)) index = (index + 1) % files.length
    this.lastIndex.set(kind, index)
    return this.buffers.get(files[index])
  }

  /** Returns false when no decoded sample exists for the event so the caller can synthesize instead. */
  private sample(event: SoundEvent) {
    const context = this.context!
    let buffer: AudioBuffer | undefined, gainValue = 1, pitch = 1
    if (event.kind === 'callout') {
      if (!event.voice) return false
      const original = IGI_VOICES[event.voice]
      // Share selection across spotting/contact so consecutive alerts do not repeat a clip.
      buffer = original && this.pick(event.voice === 'hurt' ? 'igi:hurt' : 'igi:detected', original)
      if (!buffer) return false
      this.voiceUntil = context.currentTime + buffer.duration + 0.35
      gainValue = 0.95
    } else {
      const kind = event.weapon === 'shotgun' && ['reload', 'enemy-reload', 'reload-ready'].includes(event.kind)
        ? `${event.kind}-shotgun` : event.kind
      const preferred = IGI_SAMPLES[kind]
      buffer = preferred && this.pick(`igi:${kind}`, preferred.files)
      const entry: { files: string[]; gain: number; pitch?: number } | undefined = buffer ? preferred : SAMPLES[event.kind]
      if (!entry) return false
      if (!buffer) buffer = this.pick(event.kind, entry.files)
      if (!buffer) return false
      gainValue = entry.gain
      pitch = (entry.pitch ?? 1) * (0.94 + Math.random() * 0.12)
      if (event.kind === 'enemy-hit' || event.kind === 'hit-confirm') {
        const color = HIT_COLOR[event.zone ?? 'torso']
        pitch *= color.pitch; gainValue *= color.gain
      }
      if (event.kind === 'enemy-pain') pitch *= PAIN_PITCH[(event.speaker ?? 0) % PAIN_PITCH.length]
    }
    const { gain, panner } = this.output(event)
    gain.gain.value = gainValue
    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = event.kind === 'horn' ? 1 : pitch
    if (event.kind === 'horn') { source.loop = true; this.alarmSource = source }
    source.connect(gain)
    this.track(source, panner ? [gain, panner] : [gain], INCIDENTAL.has(event.kind) ? 'incidental' : undefined); source.start()
    if (event.kind === 'callout') this.spoken = { source, speaker: event.speaker ?? 0 }
    if (event.kind === 'enemy-pain') this.painSources.add(source)
    return true
  }

  /** Local feedback belongs only to a confirmed player hit, not the spatial
   * enemy sound bus. It remains audible when a distant impact is range-culled. */
  confirmHit(hit: Pick<HitReaction, 'zone' | 'lethal'>) {
    this.play({ kind: 'hit-confirm', zone: hit.zone })
    this.play({ kind: hit.lethal ? 'kill-confirm' : 'hit-tick', zone: hit.zone })
  }

  private confirmation(event: SoundEvent) {
    if (!['hit-confirm', 'hit-tick', 'kill-confirm'].includes(event.kind)) return false
    const context = this.context!, t = context.currentTime
    const flesh = event.kind === 'hit-confirm', lethal = event.kind === 'kill-confirm', head = event.zone === 'head'
    const variation = 0.97 + Math.random() * 0.06
    const duration = flesh ? 0.085 : lethal ? 0.19 : 0.045
    const { gain } = this.output(event)
    const peak = flesh ? 0.18 : lethal ? 0.075 : 0.042
    gain.gain.setValueAtTime(0.001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.004)
    if (lethal) {
      gain.gain.exponentialRampToValueAtTime(0.008, t + 0.07)
      gain.gain.exponentialRampToValueAtTime(peak * 0.7, t + 0.09)
    }
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    const filter = context.createBiquadFilter()
    const source = flesh ? context.createBufferSource() : context.createOscillator()
    if (flesh) {
      const transient = source as AudioBufferSourceNode
      transient.buffer = this.noise
      transient.playbackRate.value = HIT_COLOR[event.zone ?? 'torso'].pitch * variation
      filter.type = 'bandpass'; filter.frequency.value = head ? 1800 : 850
    } else {
      const tone = source as OscillatorNode
      tone.type = 'triangle'
      const pitch = (lethal ? head ? 1040 : 780 : head ? 1580 : 960) * variation
      tone.frequency.setValueAtTime(pitch, t)
      tone.frequency.exponentialRampToValueAtTime(pitch * (lethal ? 0.75 : 0.55), t + duration)
      filter.type = 'lowpass'; filter.frequency.value = head ? 2400 : 1700
    }
    source.connect(filter).connect(gain)
    this.track(source, [filter, gain]); source.start(t); source.stop(t + duration)
    return true
  }

  /** The runtime emits this at the bullet's closest approach. A small bias
   * toward its muzzle connects the crack to the report without losing the
   * passing side; the quieter tail then travels beyond the closest point. */
  private incomingWhiz(event: SoundEvent, strength: number) {
    const context = this.context!, t = context.currentTime
    const closest = event.position?.clone()
    const travel = closest && event.source ? closest.clone().sub(event.source) : null
    const position = closest?.clone()
    if (position && travel && travel.lengthSq() > 0.0001) {
      const bias = Math.min(0.65, travel.length() * 0.06)
      travel.normalize(); position.addScaledVector(travel, -bias)
    }
    const variation = 0.96 + Math.random() * 0.08
    const layers = [
      { buffer: this.crackNoise, duration: 0.038, attack: 0.002, peak: 0.28 * Math.sqrt(strength), from: 2600, to: 1500 },
      { buffer: this.noise, duration: 0.15, attack: 0.012, peak: 0.085 * strength, from: 1750, to: 500 },
    ]
    layers.forEach((layer, index) => {
      const { gain, panner } = this.output({ ...event, position })
      gain.gain.setValueAtTime(0.001, t)
      gain.gain.exponentialRampToValueAtTime(layer.peak, t + layer.attack)
      gain.gain.exponentialRampToValueAtTime(0.001, t + layer.duration)
      const filter = context.createBiquadFilter(), source = context.createBufferSource()
      filter.type = 'bandpass'; filter.Q.value = 0.65
      filter.frequency.setValueAtTime(layer.from * variation, t)
      filter.frequency.exponentialRampToValueAtTime(layer.to * variation, t + layer.duration)
      source.buffer = layer.buffer; source.playbackRate.value = variation
      if (index === 1 && panner && position && closest && travel) {
        const end = closest.clone().addScaledVector(travel, 0.9)
        for (const axis of ['x', 'y', 'z'] as const) {
          const param = axis === 'x' ? panner.positionX : axis === 'y' ? panner.positionY : panner.positionZ
          param.setValueAtTime(position[axis], t)
          param.linearRampToValueAtTime(end[axis], t + layer.duration)
        }
      }
      source.connect(filter).connect(gain)
      this.track(source, panner ? [filter, gain, panner] : [filter, gain], 'whiz')
      source.start(t); source.stop(t + layer.duration)
    })
  }

  /** One short chest-level thump layers under the original player-hit sample. */
  private incomingHit(strength: number) {
    const context = this.context!, t = context.currentTime, duration = 0.13
    const { gain } = this.output({ kind: 'bullet-hit' })
    const peak = 0.14 * Math.sqrt(strength)
    gain.gain.setValueAtTime(0.001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.003)
    gain.gain.exponentialRampToValueAtTime(peak * 0.5, t + 0.035)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    const source = context.createOscillator(), filter = context.createBiquadFilter()
    source.type = 'sine'
    source.frequency.setValueAtTime(138, t)
    source.frequency.exponentialRampToValueAtTime(52, t + duration)
    filter.type = 'lowpass'; filter.frequency.value = 280
    source.connect(filter).connect(gain)
    this.track(source, [filter, gain]); source.start(t); source.stop(t + duration)
  }

  /** Local and independent of guard distance. Clear combat first so the last
   * breath and ground contact survive both source saturation and player pause. */
  beginDeath() {
    this.clear()
    this.dying = true
    this.play({ kind: 'player-death' })
  }

  private deathSound() {
    const context = this.context!, t = context.currentTime
    this.sample({ kind: 'player-death' })
    // A soft breath loses its high frequencies over a low descending pulse.
    // Both are also the fallback if the voice recording is not yet decoded.
    for (const breath of [false, true]) {
      const duration = breath ? 1.15 : 2.25
      const { gain } = this.output({ kind: 'player-death' })
      gain.gain.setValueAtTime(0.001, t)
      gain.gain.exponentialRampToValueAtTime(breath ? 0.19 : 0.16, t + (breath ? 0.065 : 0.018))
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'; filter.Q.value = 0.5
      filter.frequency.setValueAtTime(breath ? 950 : 240, t)
      filter.frequency.exponentialRampToValueAtTime(breath ? 180 : 70, t + duration)
      const source = breath ? context.createBufferSource() : context.createOscillator()
      if (breath) (source as AudioBufferSourceNode).buffer = this.noise
      else {
        const tone = source as OscillatorNode
        tone.type = 'sine'; tone.frequency.setValueAtTime(95, t)
        tone.frequency.exponentialRampToValueAtTime(38, t + duration)
      }
      source.connect(filter).connect(gain)
      this.track(source, [filter, gain]); source.start(t); source.stop(t + duration)
    }
  }

  /** Runtime owns the siren lifetime, including silence, pause and checkpoint restore. */
  setAlarm(enabled: boolean, position?: THREE.Vector3) {
    const audible = enabled && this.active && !this.muted && this.volume > 0 &&
      (!position || position.distanceTo(this.listenerPosition) <= 100)
    if (!audible && this.alarmSource) {
      const source = this.alarmSource
      try { source.stop() } catch { /* already ended */ }
      this.cleanup.get(source)?.()
    } else if (audible && !this.alarmSource) this.play({ kind: 'horn', position, radius: 100 })
  }

  play(event: SoundEvent) {
    const context = this.context
    if (!context || !this.master || !this.active || this.muted || this.volume <= 0 || this.disposed) return
    if (this.dying && !['player-death', 'player-fall'].includes(event.kind)) return
    if (event.kind === 'player-death') {
      if (this.reserveSources(3, true)) this.deathSound()
      return
    }
    if (event.kind === 'player-fall') {
      if (this.reserveSources(2, true)) { this.sample(event); this.incomingHit(1) }
      return
    }
    if (event.kind === 'horn' && this.alarmSource) return
    const distance = event.kind === 'bullet-hit' ? 0 : event.position?.distanceTo(this.listenerPosition) ?? 0
    if (distance > (event.radius ?? 60)) return
    if (event.kind === 'enemy-bullet-whiz' || event.kind === 'bullet-hit') {
      const whiz = event.kind === 'enemy-bullet-whiz', t = context.currentTime
      const strength = THREE.MathUtils.clamp(event.intensity ?? (whiz ? 1 - distance / (event.radius ?? 5) : 1), 0, 1)
      if (!Number.isFinite(strength) || strength <= 0 || t < (whiz ? this.whizUntil : this.bulletHitUntil)) return
      if (!this.reserveSources(whiz ? 2 : 1)) return
      if (whiz) { this.whizUntil = t + 0.09; this.incomingWhiz(event, strength) }
      else { this.bulletHitUntil = t + 0.08; this.incomingHit(strength) }
      this.duckMusic()
      return
    }
    const report = event.kind.startsWith('shot-') || event.kind.startsWith('enemy-shot-')
    if (report) { if (!this.reserveSources(1, true)) return }
    else if (this.sources.size >= SOURCE_LIMIT) return
    if (event.kind === 'enemy-pain') {
      const speaker = event.speaker ?? 0, t = context.currentTime
      if (t < (this.painUntil.get(speaker) ?? 0) || this.painSources.size >= 3) return
      this.painUntil.set(speaker, t + 0.55)
      if (this.spoken?.speaker === speaker) {
        const source = this.spoken.source
        source.stop(); this.cleanup.get(source)?.()
        this.voiceUntil = t + 0.35
      }
      // Brief pain reactions can interrupt this guard's speech and do not wait
      // behind another guard's dialogue. Automatic fire cannot stack screams.
      this.speakerUntil.set(speaker, Math.max(this.speakerUntil.get(speaker) ?? 0, t + 0.9))
      if (this.sample(event)) this.duckMusic()
      return
    }
    if (event.kind === 'callout') {
      // Character vocals are IGI-only. Unmapped/unavailable lines keep their captions,
      // without synthesized speech, tones, or consuming another guard's voice cooldown.
      if (!event.voice || !IGI_VOICES[event.voice]?.some(file => this.buffers.has(file))) return
      const speaker = event.speaker ?? 0, key = `${speaker}:${event.voice ?? 'cue'}`, t = context.currentTime
      const urgent = URGENT.has(event.voice ?? '')
      // Urgent lines have a shorter speaker cooldown, but never overlap an existing line.
      if (t < this.voiceUntil || t < (this.speakerUntil.get(speaker) ?? 0) || t < (this.phraseUntil.get(key) ?? 0)) {
        this.suppressedVoices++; return
      }
      if (!this.sample(event)) return
      this.acceptedVoices++
      this.speakerUntil.set(speaker, t + (urgent ? 1.6 : 3.8)); this.phraseUntil.set(key, t + (urgent ? 4 : 8))
      this.duckMusic()
      return
    }
    if (event.kind.includes('shot') || event.kind === 'damage') this.duckMusic()
    if (this.sample(event)) return
    // Climbing emits one sampled rung sound every 0.5s, never a synthetic tone.
    if (event.kind === 'ladder') return
    if (this.confirmation(event)) return
    const shot = event.kind.includes('shot'), horn = event.kind === 'horn', step = event.kind.endsWith('footstep')
    const metal = ['door', 'reload', 'enemy-reload', 'reload-ready', 'weapon-pump', 'shell-load', 'switch', 'pickup', 'drop', 'empty', 'impact', 'enemy-down'].includes(event.kind)
    const duration = horn ? 1.8 : shot ? event.kind.includes('sniper') ? 0.34 : 0.16 : step ? 0.08 : event.kind === 'empty' ? 0.045 : event.kind === 'callout' ? 0.18 : metal ? 0.11 : 0.28
    const t = context.currentTime
    const { gain, panner } = this.output(event)
    const volume = horn ? 0.28 : shot ? 0.7 : step ? 0.15 : metal ? 0.17 : 0.12
    gain.gain.setValueAtTime(0.001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.007)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    const noisy = shot || step || event.kind === 'impact'
    const source = noisy ? context.createBufferSource() : context.createOscillator()
    const filter = context.createBiquadFilter()
    if (noisy) {
      const noiseSource = source as AudioBufferSourceNode
      noiseSource.buffer = this.noise; noiseSource.playbackRate.value = shot ? event.kind.includes('sniper') ? 1.25 : 2.4 : 0.8
      filter.type = 'highpass'; filter.frequency.value = shot ? 650 : 90
    } else {
      const tone = source as OscillatorNode
      tone.type = horn ? 'sawtooth' : metal ? 'triangle' : 'sine'
      const mechanical: Record<string, number> = { 'weapon-pump': 210, 'shell-load': 450, empty: 950, switch: 240, pickup: 590, reload: 330, 'enemy-reload': 330, 'reload-ready': 760 }
      const frequency = horn ? 136 : event.kind === 'damage' ? 90 : event.kind === 'enemy-hit' ? 150 * HIT_COLOR[event.zone ?? 'torso'].pitch : mechanical[event.kind] ?? (metal ? 420 : event.kind === 'callout' ? 320 : 720)
      tone.frequency.setValueAtTime(frequency, t)
      tone.frequency.exponentialRampToValueAtTime(horn ? 132 : frequency * (metal ? 0.5 : 1.5), t + duration)
      filter.type = 'lowpass'; filter.frequency.value = horn ? 620 : 1800
    }
    source.connect(filter).connect(gain)
    if (horn) this.alarmSource = source
    this.track(source, panner ? [filter, gain, panner] : [filter, gain], INCIDENTAL.has(event.kind) ? 'incidental' : undefined); source.start(t); source.stop(t + duration)
  }

  clear() {
    for (const source of [...this.sources]) { try { source.stop() } catch { /* already ended */ }; this.cleanup.get(source)?.() }
    this.ambience = null; this.music = null; this.musicGain = null; this.alarmSource = null; this.voiceUntil = 0; this.whizUntil = 0; this.bulletHitUntil = 0
    this.incidentalSources.clear(); this.whizSources.clear()
    this.speakerUntil.clear(); this.phraseUntil.clear(); this.painUntil.clear(); this.painSources.clear(); this.spoken = null
  }
  reset() { this.clear(); this.dying = false }
  get status() { return this.context?.state ?? 'locked' }
  get diagnostics() { return { active: this.active, sources: this.sources.size, music: !!this.music, ambience: !!this.ambience, alarm: !!this.alarmSource,
    decodedSamples: this.buffers.size, acceptedVoices: this.acceptedVoices, suppressedVoices: this.suppressedVoices, muted: this.muted, volume: this.volume, disposed: this.disposed } }
  dispose() {
    this.disposed = true; this.active = false; this.loadAbort.abort(); this.reset()
    this.buffers.clear(); this.noise = null; this.crackNoise = null; this.musicBuffer = null
    this.master?.disconnect(); this.master = null; void this.context?.close().catch(() => {}); this.context = null
  }
}
