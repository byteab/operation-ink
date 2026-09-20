// Staged native-audio checks through agent-browser eval --stdin. Reload afterward.
(async () => {
  const env = window.__environment, m = env.mission, p = env.player, c = env.camera.perspective, audio = m.audio
  if (!m.ready) throw new Error('Wait for mission.ready')
  const resource = performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/node_modules/.vite/deps/three.js')?.name
  const T = await import(resource ?? '/node_modules/.vite/deps/three.js')
  const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z)
  m.update = p.update = env.camera.update = () => false
  p.enabled = p.playing = true; m.state.phase = 'active'
  p.actions.reset(); p.body.teleport(v(0, 0.03, -62)); p.actions.syncCamera(c); c.lookAt(-50, 1.6, -62)
  audio.setActive(true); audio.setMuted(false); audio.setVolume(0.55); await audio.unlock(); audio.update(c)
  for (const enemy of m.ai.enemies) { enemy.state = 'reserve'; enemy.actor.root.visible = false }
  const results = [], routes = []
  const check = (ok, label) => { results.push({ passed: !!ok, label }); if (!ok) throw new Error(JSON.stringify(results)) }
  const play = audio.play.bind(audio), output = audio.output.bind(audio)
  let outputs = []
  audio.output = event => { const nodes = output(event); outputs.push({ event, ...nodes }); return nodes }
  audio.play = event => {
    const previous = new Set(audio.sources); outputs = []
    play(event)
    const sources = [...audio.sources].filter(source => !previous.has(source))
    if (event.kind.startsWith('enemy-shot-')) {
      const source = sources[0], nodes = outputs[0], distance = event.position.distanceTo(c.position)
      const sample = source && [...audio.buffers].find(([, buffer]) => buffer === source.buffer)?.[0]
      const panner = nodes?.panner
      const attenuation = panner ? panner.refDistance / (panner.refDistance + panner.rolloffFactor * Math.max(0, distance - panner.refDistance)) : 0
      routes.push({ kind: event.kind, distance, radius: event.radius, sources: sources.length, sample,
        gain: nodes?.gain.gain.value, attenuation, pannerPosition: panner && [panner.positionX.value, panner.positionY.value, panner.positionZ.value] })
    }
  }
  try {
    for (const [name, distances] of [['ak', [20, 40, 59]], ['sniper', [70, 109]]]) {
      const guard = m.ai.enemies.find(enemy => enemy.spec.weapon === name)
      check(!!guard, `${name} has an actual mission actor`)
      for (const distance of distances) {
        audio.reset(); m.ai.bulletTrails.clear()
        guard.position.set(-distance, 0.03, -62); guard.yaw = Math.PI / 2
        guard.actor.root.position.copy(guard.position); guard.actor.root.rotation.y = guard.yaw
        guard.actor.restore('guard'); guard.actor.update(0.01, 'guard', false)
        Object.assign(guard, { state: 'combat', health: 100, moveSpeed: 0, hitPause: 0, settledFor: 1, aimTime: 2,
          reloadTimer: 0, magazine: 30, burst: 0, defensiveTransition: 0, contactMemory: 8 })
        const random = m.ai.random
        m.ai.random = () => 0.99
        try {
          check(m.ai.shoot(guard, { feet: p.body.position, eye: c.position, velocity: v(), alive: true, radioEnabled: false, yaw: 0 }), `${name} fires through real world geometry at ${distance} m`)
        } finally { m.ai.random = random; guard.state = 'reserve' }
        const route = routes.at(-1)
        check(route?.kind === `enemy-shot-${name}` && route.sources === 1, `One native report starts at ${distance} m`)
        check(route.sample === `igi/${name === 'ak' ? 'ak47_single' : 'svddrag_shot_1'}.wav`, `Original ${name} recording is selected`)
        check(route.attenuation > (name === 'sniper' ? 0.15 : 0.18), `Report remains audible at ${distance} m`)
      }
    }
    audio.reset()
    for (let i = 0; i < 80; i++) audio.play({ kind: 'impact' })
    const before = new Set(audio.sources)
    m.emit({ kind: 'enemy-shot-ak', position: c.position.clone().add(v(40)), radius: 80 }, false)
    check(audio.sources.size === 80 && [...audio.sources].some(source => !before.has(source)), 'A full effects pool admits the gunshot within its source cap')
    for (const mode of ['muted', 'zero volume', 'paused']) {
      audio.reset(); audio.setActive(mode !== 'paused'); audio.setMuted(mode === 'muted'); audio.setVolume(mode === 'zero volume' ? 0 : 0.55)
      const count = routes.length
      m.emit({ kind: 'enemy-shot-ak', position: c.position.clone().add(v(40)), radius: 80 }, false)
      check(routes.length === count + 1 && routes.at(-1).sources === 0, `${mode} still silences enemy gunshots`)
    }
    return { staged: true, results, reports: routes.slice(0, 5), sourceBudget: 80 }
  } finally {
    audio.play = play; audio.output = output
    audio.reset(); audio.setMuted(false); audio.setVolume(0.55); audio.setActive(false)
  }
})()
