// Stage a completed escort, then use the real F key to board.
// The cinematic starts frozen for inspection; __cinemaCheck.step(seconds)
// advances the real runtime, and __cinemaCheck.resume() resumes live playback.
(async () => {
  const env = window.__environment, m = env.mission, p = env.player, c = env.camera.perspective
  if (!m.ready || !p.playing || m.escape.active) throw new Error('Begin a fresh active mission first')
  const resource = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const { RESCUE_LAYOUT } = await import(resource('/src/game/rescue-layout.ts'))
  const { setDoorOpen } = await import(resource('/src/world/doors.ts'))
  m.state.hostages[0].status = 'loaded'
  m.state.hostages[0].position = [...RESCUE_LAYOUT.jeepSeats[0]]
  m.state.jeep = 'boarding'; m.state.gateOpen = true
  m.syncWorld(true); setDoorOpen(m.world.rescue.gate, true, true); p.world.refresh()
  p.body.position.set(154.65, .05, 8.25); p.body.velocity.set(0, 0, 0)
  p.actions.syncCamera(c); c.lookAt(154.65, 1.05, 9.95)
  const update = m.update.bind(m)
  window.__cinemaCheck = {
    update,
    step(seconds) {
      for (let time = 0; time < seconds - 1e-8; time += 1 / 60) update(Math.min(1 / 60, seconds - time))
      env.renderer.render(env.scene, c)
    },
    resume() { m.update = update; env.invalidate() },
    status() { return { active: m.escape.active, elapsed: m.escape.elapsed, fade: m.escape.fade,
      phase: m.state.phase, jeep: m.world.rescue.jeep.position.toArray(), camera: c.position.toArray(),
      speed: m.escape.speed, yaw: m.escape.yaw, dust: m.escapeDust.mesh.count,
      menuHidden: document.querySelector('#walk-pause').hidden, menuInert: document.querySelector('#walk-pause').inert,
      weaponsVisible: m.weapons.root.visible, health: m.state.health, playing: p.playing } },
  }
  m.update = (dt, elapsed) => m.escape.active ? false : update(dt, elapsed)
  p.update(0); env.invalidate()
  const target = p.actions.findTarget(c)
  if (target?.label !== 'Board jeep') throw new Error('Driver boarding target unavailable')
  return { ready: true, target: target.label }
})()
