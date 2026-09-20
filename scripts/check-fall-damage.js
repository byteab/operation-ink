// Staged browser verification via agent-browser eval --stdin. Start the mission
// once to unlock native audio. Uses real keyboard handlers, physics and runtime;
// positions are staged at the actual roof/tower ladders, with guards suppressed.
// Reload afterward to restore the normal animation loop.
(async () => {
  const env = window.__environment, m = env.mission, p = env.player, c = env.camera.perspective
  if (!m?.ready) throw new Error('Wait for mission.ready')
  const playerUpdate = p.update.bind(p), missionUpdate = m.update.bind(m)
  p.update = m.update = env.camera.update = () => false
  m.ai.update = () => {}
  const results = [], sounds = [], sampled = [], captures = []
  const play = m.audio.play.bind(m.audio), sample = m.audio.sample.bind(m.audio)
  m.audio.play = event => { sounds.push(event.kind); play(event) }
  m.audio.sample = event => {
    const played = sample(event)
    if (played) sampled.push(event.kind)
    return played
  }
  const check = (ok, label, details) => {
    results.push({ passed: !!ok, label, details })
    if (!ok) throw new Error(JSON.stringify(results))
  }
  const key = (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
    code, bubbles: true, cancelable: true,
  }))
  const frame = (dt = 1 / 60) => {
    playerUpdate(dt); missionUpdate(dt)
    env.renderer.render(env.scene, c)
    const state = {
      health: m.state.health, hudHealth: Number(document.querySelector('#mission-health').getAttribute('aria-valuenow')),
      grounded: p.body.grounded, feet: p.body.position.toArray(), cameraDip: m.playerHits.pose.cameraPosition.y,
      weaponKick: m.playerHits.pose.weaponPosition.length(), hurt: m.hud.root.classList.contains('hurt'),
      phase: m.state.phase, death: m.death.active,
    }
    m.finishFrame()
    return state
  }
  const setup = (ladder, reduced = false) => {
    m.restart(); p.fallback = true; p.requestControl()
    m.hud.reducedMotion = reduced
    if (ladder) p.body.teleport(p.actions.ladderPoint(ladder, true))
    for (let i = 0; i < 60; i++) frame()
    check(p.body.grounded && m.state.health === 100, 'Setup stands safely at the landing')
    if (ladder) {
      const outward = p.body.position.clone().set(0, 0, 1).transformDirection(ladder.matrixWorld)
      c.lookAt(c.position.clone().add(outward.multiplyScalar(12)))
    }
    sounds.length = 0; sampled.length = 0
  }
  const jump = () => { key('Space'); key('Space', false) }
  setup()
  jump()
  for (let i = 0; i < 120; i++) frame()
  check(m.state.health === 100 && !sounds.includes('damage'), 'Normal ground jump leaves health and hurt feedback untouched')

  for (const name of ['west exterior', 'observation', 'water tower']) {
    const ladder = p.actions.ladders.find(item => item.name.toLowerCase().includes(name))
    setup(ladder)
    key('KeyW'); jump()
    let landed
    for (let i = 0; i < 300; i++) {
      const current = frame()
      if (current.health < 100) { landed = current; break }
    }
    key('KeyW', false)
    check(landed?.grounded && landed.health < 100, `${name}: actual contact removes health`, landed)
    check(landed.hudHealth === Math.ceil(landed.health), `${name}: visible health meter follows damage`)
    check(sounds.filter(kind => kind === 'damage').length === 1 && sounds.includes('bullet-hit'),
      `${name}: shared hit voice and impact trigger once`, [...sounds])
    check(sampled.includes('damage'), `${name}: native hurt recording plays`, [...sampled])
    if (landed.phase === 'active') {
      for (let i = 0; i < 6; i++) frame()
      check(m.playerHits.pose.cameraPosition.y < -0.03 && m.playerHits.pose.weaponPosition.length() > 0,
        `${name}: camera and weapon visibly react`)
      check(m.hud.root.classList.contains('hurt') && !m.hud.threat.hidden,
        `${name}: existing hurt flash and impact shading are visible`)
      check(m.hud.threatLabel.textContent === 'Fall damage', `${name}: feedback identifies the fall as the cause`)
    } else check(m.death.active && m.death.hitKick === 0, `${name}: lethal fall enters the existing death sequence`)
    captures.push({ name, image: env.renderer.domElement.toDataURL(), health: m.state.health })
  }
  const roof = p.actions.ladders.find(item => item.name.includes('west exterior'))
  setup(roof, true); key('KeyW'); jump()
  for (let i = 0; i < 300 && m.state.health === 100; i++) frame()
  key('KeyW', false)
  check(m.state.health < 100 && m.playerHits.pose.cameraPosition.length() === 0 && sounds.includes('damage'),
    'Reduced Motion keeps fall damage and native sound without camera movement')
  setup()
  check(m.state.health === 100 && !m.death.active && m.playerHits.pose.cameraPosition.length() === 0,
    'Restart restores health and clears falling/death feedback')

  // Repeat the roof jump in the real animation loop, then freeze its impact for
  // screenshot review. This catches event ordering that manual stepping cannot.
  setup(roof); key('KeyW'); jump()
  p.update = playerUpdate
  let frozen = false, liveFrames = 0, liveContacts = 0, liveHealth = 100
  m.update = (dt, elapsed) => {
    const active = missionUpdate(dt, elapsed)
    liveFrames++
    if (m.state.health !== liveHealth) {
      liveContacts++; liveHealth = m.state.health; key('KeyW', false)
    }
    if (m.playerHits.pose.cameraPosition.y < -0.05) {
      frozen = true; p.update = m.update = () => false
    }
    return active
  }
  await new Promise((resolve, reject) => {
    const deadline = performance.now() + 20000
    const poll = () => {
      if (frozen) resolve()
      else if (performance.now() > deadline) reject(new Error('Live roof landing timed out'))
      else requestAnimationFrame(poll)
    }
    requestAnimationFrame(poll)
  })
  check(liveContacts === 1 && liveFrames > 10 && m.state.health > 0 && m.state.health < 100,
    'Real animation loop applies roof damage once and renders the landing reaction', { liveFrames, liveContacts, health: m.state.health })
  window.__fallDamageReview = { results, captures, audio: m.audio.diagnostics }
  return { results, audio: m.audio.diagnostics }
})()
