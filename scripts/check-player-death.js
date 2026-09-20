// Staged integration/visual review through agent-browser eval --stdin.
// Fatal damage uses the real mission pipeline; setup only controls the location
// and suppresses unrelated guards. Reload the page after this review.
(async () => {
  const env = window.__environment, m = env.mission, p = env.player, c = env.camera.perspective
  if (!m?.ready) throw new Error('Wait for mission.ready')
  const originalUpdate = m.update.bind(m)
  const originalAI = m.ai.update.bind(m.ai)
  m.ai.update = (dt, player) => { if (!player.alive) originalAI(dt, player) }
  const results = [], sounds = []
  const check = (ok, label) => {
    results.push({ passed: !!ok, label })
    if (!ok) throw new Error(label)
  }
  const play = m.audio.play.bind(m.audio)
  m.audio.play = event => { sounds.push({ kind: event.kind, time: m.death.elapsed }); play(event) }
  let frozen = false
  const reset = (reduced = false) => {
    m.retry(); p.enabled = true; p.immersive = false; p.playing = true
    p.fallback = true; m.hud.reducedMotion = reduced
    p.actions.syncCamera(c); c.lookAt(c.position.x + 12, c.position.y + 0.3, c.position.z + 18)
    originalUpdate(1 / 60); m.finishFrame()
    document.querySelector('#walk-pause').hidden = true
    sounds.length = 0
  }
  const kill = () => { m.state.health = 1; m.damage(1, c.position.clone().add({ x: 0, y: 0, z: -10 })) }
  const draw = () => { env.renderer.render(env.scene, c); m.finishFrame() }
  const advance = seconds => {
    for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 1 / 120) originalUpdate(Math.min(1 / 120, seconds - elapsed))
    draw()
  }
  const state = () => ({ time: m.death.elapsed, hitKick: m.death.hitKick, position: c.position.toArray(), rotation: c.quaternion.toArray(),
    menu: m.death.menuVisible, menuHidden: document.querySelector('#walk-pause').hidden,
    menuOpacity: getComputedStyle(document.querySelector('#walk-pause')).opacity,
    blur: getComputedStyle(document.querySelector('.death-blur')).backdropFilter,
    mask: getComputedStyle(document.querySelector('.death-blur')).maskImage,
    dim: Number(getComputedStyle(document.querySelector('.death-dim')).opacity),
    vignette: !!document.querySelector('.death-shade'),
    death: document.body.dataset.death, audio: m.audio.diagnostics })
  const freeze = () => { frozen = true; m.update = p.update = () => false }
  const stage = time => { if (!frozen) freeze(); reset(); kill(); advance(time); return state() }
  await m.audio.unlock()
  reset()
  check(m.audio.status === 'running', 'Native browser audio unlocked')
  const victim = m.ai.enemies[0]
  victim.state = 'dead'; victim.health = 0
  victim.actor.react('dieBody', true); victim.actor.update(0, 'dead', false)
  const animationBefore = victim.actor.animationTime
  m.blood.emitHit({ zone: 'torso', point: c.position.clone(), direction: c.position.clone().set(0, 0.2, 1).normalize(), lethal: true })
  const bloodBefore = m.blood.snapshot()
  check(bloodBefore.droplets.length > 0, 'Airborne blood exists when the player dies')
  const analyser = m.audio.context.createAnalyser(), waveform = new Float32Array(2048)
  analyser.fftSize = waveform.length; m.audio.master.connect(analyser)
  let peak = 0
  const samples = []
  const sample = setInterval(() => {
    analyser.getFloatTimeDomainData(waveform)
    peak = Math.max(peak, ...waveform.map(Math.abs))
    samples.push(state())
  }, 40)
  kill(); env.invalidate()
  await new Promise(resolve => setTimeout(resolve, 4800))
  clearInterval(sample); m.audio.master.disconnect(analyser); analyser.disconnect()
  check(m.death.menuVisible && m.death.elapsed === 4.25, 'Real animation loop reaches the completed menu')
  check(samples.some(s => s.time < 0.2 && s.hitKick > 0.5), 'A one-point fatal bullet still produces the heavy initial impact')
  check(victim.actor.animationTime > animationBefore + 0.5, 'An enemy death animation keeps advancing while the player falls')
  check(m.blood.snapshot().droplets.length === 0, 'Airborne blood settles and expires during the death sequence')
  check(samples.filter(s => s.time < 3.7).every(s => s.menuHidden), 'Menu stays hidden through fall and gradual dimming')
  check(samples.every(s => !s.vignette), 'Death has no circle or vignette layer')
  check(samples.every(s => s.mask === 'none'), 'Blur covers the whole background without a closing mask')
  const early = samples.find(s => s.time > 0.8), late = samples.find(s => s.time > 3.35)
  check(parseFloat(early.blur.slice(5)) < parseFloat(late.blur.slice(5)) && early.dim < late.dim && late.dim < 1,
    'Background gradually blurs and darkens while remaining faintly visible')
  check(peak > 0.005, 'Native death audio produces an audible signal after master volume')
  check(sounds.filter(s => s.kind === 'player-death').length === 1 && sounds.filter(s => s.kind === 'player-fall').length === 1,
    'Exactly one death cue and one timed ground impact')
  check(!m.audio.diagnostics.active && m.audio.diagnostics.sources === 0, 'Menu stops all death audio')
  check(document.activeElement.id === 'mission-retry', 'Retry receives keyboard focus')
  freeze()
  reset(true)
  const position = c.position.toArray(), rotation = c.quaternion.toArray()
  kill(); advance(2)
  check(JSON.stringify(position) === JSON.stringify(c.position.toArray()) && JSON.stringify(rotation) === JSON.stringify(c.quaternion.toArray()), 'Reduced Motion keeps the camera still')
  check(getComputedStyle(document.querySelector('.death-blur')).display === 'none', 'Reduced Motion removes blur')
  m.retry(); originalUpdate(0)
  check(!document.body.dataset.death && document.querySelector('.mission-death').hidden && !document.querySelector('#walk-pause').inert, 'Retry removes all death effects and unlocks the menu')
  m.restart(); originalUpdate(0)
  check(m.deaths === 0 && !m.death.active, 'Restart clears the sequence and death count')
  check(CSS.supports('backdrop-filter', 'blur(10px)'), 'Native background blur supported')
  window.__deathReview = { stage, state, results, samples, sounds, peak, restoreAI: () => m.ai.update = originalAI }
  stage(2)
  return { results, peak, samples: samples.filter((_, index) => index % 12 === 0), sounds }
})()
