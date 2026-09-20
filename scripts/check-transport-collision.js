// Load with agent-browser eval --stdin on a fresh dev page. Stages the local
// scenarios, then exercises real WASD/F handlers and the running render loop.
(async () => {
  const e = window.__environment, m = e.mission, c = e.camera.perspective
  if (!m.ready) throw new Error('Wait for the mission to load')
  const { setDoorOpen } = await import('/src/world/doors.ts')
  const { RESCUE_LAYOUT } = await import('/src/game/rescue-layout.ts')
  const jeep = m.world.rescue.jeep, gate = m.world.rescue.gate
  const hinge = gate.children.find(child => child.userData.doorHinge)
  const vector = values => c.position.clone().fromArray(values)
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }))
  const activate = () => { key('keydown', 'KeyF'); key('keyup', 'KeyF') }
  const place = (feet, target) => {
    e.player.body.teleport(vector(feet)); e.player.actions.syncCamera(c)
    c.lookAt(vector(target)); c.updateMatrixWorld(true)
    e.invalidate()
  }
  m.ai.update = () => {}; m.security.update = () => {}; m.audio.setMuted(true)
  window.__transportChecks = {
    async collision() {
      e.player.playing = true
      const results = []
      for (const [name, x, z] of [['front', 1, 0], ['rear', -1, 0], ['driver', 0, -1], ['passenger', 0, 1]]) {
        place([155 + x * 4, 0.05, 11 + z * 4], [155, 1.7, 11])
        key('keydown', 'ShiftLeft'); key('keydown', 'KeyW')
        try { await new Promise(resolve => setTimeout(resolve, 1800)) }
        finally { key('keyup', 'KeyW'); key('keyup', 'ShiftLeft') }
        const p = e.player.body.position
        assert((p.x - 155) * x + (p.z - 11) * z > (x ? 2.5 : 1.25), `Walked through ${name}`)
        results.push({ side: name, feet: p.toArray() })
      }
      place([154.65, 0.05, 8.8], m.world.stations.find(s => s.kind === 'jeep').point.toArray())
      assert(e.player.actions.findTarget(c)?.object === jeep, 'Driver interaction is unreachable')
      return results
    },
    async gate(stall = 0) {
      m.restart()
      // Restart releases pointer lock asynchronously; let that event finish
      // before staging input so it cannot pause the timed check halfway through.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      e.player.playing = true; e.player.onPlayingChange(true); e.invalidate()
      const hostage = m.state.hostages[0]
      hostage.status = 'loaded'; hostage.position = [...RESCUE_LAYOUT.jeepSeats[0]]
      m.escort.sync(m.state)
      const station = m.world.stations.find(s => s.kind === 'gate')
      place([158.9, 0.05, 6.3], station.point.toArray())
      assert(e.player.actions.findTarget(c)?.object === station.object, 'Gate control not targetable')
      activate()
      assert(m.state.gateOpen && hinge.rotation.y === 0, 'Gate command must start without a snap')
      const started = performance.now()
      const boarding = m.world.stations.find(s => s.kind === 'jeep')
      place([154.65, 0.05, 8.8], boarding.point.toArray())
      assert(e.player.actions.findTarget(c)?.label === 'Gate opening', 'Opening prompt missing')
      activate()
      assert(!m.escape.active && m.state.jeep !== 'escaping', 'Boarded before the gate cleared')
      place([157.5, 0.05, 8], [164, 1.5, 11])
      const samples = [], original = e.interactions.update.bind(e.interactions)
      e.interactions.update = dt => {
        const result = original(dt)
        samples.push({ time: (performance.now() - started) / 1000, progress: -hinge.rotation.y / (Math.PI / 2) })
        if (stall) { const until = performance.now() + stall; while (performance.now() < until) {} }
        return result
      }
      try {
        await new Promise((resolve, reject) => {
          const sample = () => {
            if (Math.abs(hinge.rotation.y + Math.PI / 2) < 0.000001) resolve()
            else if (performance.now() - started > 5000) reject(new Error('Gate took more than five seconds'))
            else requestAnimationFrame(sample)
          }
          requestAnimationFrame(sample)
        })
      } finally { e.interactions.update = original }
      const duration = samples.at(-1).time
      assert(duration > 2.8 && duration < 3.3, `Gate duration ${duration}s`)
      assert(samples.some(s => s.progress > 0.4 && s.progress < 0.6), 'Missing intermediate swing')
      place([154.65, 0.05, 8.8], boarding.point.toArray())
      assert(e.player.actions.findTarget(c)?.label === 'Board jeep', 'Board prompt did not become ready')
      activate()
      assert(m.escape.active, 'Cannot board after gate finishes')
      return { duration, stall, samples, waitedForGate: true, boardedAfterOpening: true }
    },
    view(progress) {
      m.restart(); e.player.pause()
      e.player.update = () => false; m.update = () => false
      e.interactions.update = () => false
      setDoorOpen(gate, false, true)
      gate.userData.open = true
      hinge.rotation.y = -Math.PI / 2 * progress
      e.player.world.refresh()
      c.position.set(156.8, 2.7, 4.8); c.lookAt(vector([163, 1.2, 11]))
      c.fov = 68; c.updateProjectionMatrix(); c.updateMatrixWorld(true)
      const arms = c.getObjectByName('First-person stickman arms')
      if (arms) arms.visible = false
      document.querySelector('#walk-pause').hidden = true
      e.scene.updateMatrixWorld(true); e.renderer.render(e.scene, c)
      return { progress, angle: hinge.rotation.y }
    },
  }
  return { ready: true }
})()
