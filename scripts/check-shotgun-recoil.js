// Staged recoil comparison, evaluated with agent-browser on a ready development mission.
// Freezes mission/player updates; reload the isolated page after inspection.
(() => {
  const e = window.__environment, m = e.mission, w = m.weapons, c = e.camera.perspective
  if (!m.ready) throw new Error('Wait for mission.ready')
  m.update = e.player.update = e.camera.update = () => false
  e.player.enabled = e.player.playing = true
  m.state.phase = 'active'
  const style = document.createElement('style')
  style.textContent = 'body > :not(canvas):not(script){display:none!important}'
  document.head.append(style)
  const frame = { active: true, climbing: false, moving: 0, aiming: false, reducedMotion: false, feet: e.player.body.position }
  const results = [], random = Math.random
  const step = seconds => {
    for (let t = 0; t < seconds - 1e-8; t += 1 / 60) w.update(Math.min(1 / 60, seconds - t), frame)
  }
  const ready = (name, reducedMotion = false) => {
    w.restore({ slots: [{ id: 'recoil-' + name, name, magazine: 6, reserve: 12 }], selected: 0, pickups: [], nextId: 1000 })
    e.player.body.teleport(c.position.clone().set(0, .03, -62))
    c.position.set(0, 1.7, -62); c.lookAt(14, 2, -35); c.fov = 75; c.updateProjectionMatrix()
    frame.reducedMotion = reducedMotion; frame.aiming = false
    step(.4)
    if (w.blocked) throw new Error('Staged firing lane is blocked')
  }
  const angle = () => Math.asin(c.getWorldDirection(c.position.clone()).y) * 180 / Math.PI
  const sample = () => { e.renderer.render(e.scene, c); return angle() }
  const cellWidth = 400, cellHeight = 280
  const sheet = document.createElement('canvas'); sheet.width = cellWidth * 4; sheet.height = cellHeight * 2
  const g = sheet.getContext('2d')
  const capture = (row, column, label) => {
    sample()
    const x = column * cellWidth, y = row * cellHeight
    g.fillStyle = '#ffffff'; g.fillRect(x, y, cellWidth, cellHeight)
    g.drawImage(e.renderer.domElement, x, y + 30, cellWidth, cellHeight - 30)
    g.fillStyle = '#000000'; g.font = '15px sans-serif'; g.fillText(label, x + 10, y + 21)
  }
  try {
    Math.random = () => .5
    for (const [row, name] of ['ak', 'shotgun'].entries()) {
      ready(name)
      const baseline = sample()
      capture(row, 0, `${name.toUpperCase()} · before`)
      w.trigger(true); w.trigger(false); step(1 / 60)
      const peak = sample() - baseline
      capture(row, 1, `${name.toUpperCase()} · shot · ${peak.toFixed(2)}°`)
      step(.15)
      const recovery = sample() - baseline
      capture(row, 2, `${name.toUpperCase()} · 150 ms · ${recovery.toFixed(2)}°`)
      step(.65)
      const settled = sample() - baseline
      capture(row, 3, `${name.toUpperCase()} · 800 ms · ${settled.toFixed(2)}°`)
      if (w.current.magazine !== 5) throw new Error('Single click must consume one round')
      results.push({ name, peakDegrees: peak, after150ms: recovery, after800ms: settled })
    }
    if (results[1].peakDegrees < results[0].peakDegrees * 3) throw new Error('Shotgun kick is too weak')
    ready('shotgun', true)
    const baseline = c.quaternion.clone()
    w.trigger(true); w.trigger(false); step(.8)
    if (!baseline.equals(c.quaternion)) throw new Error('Reduced motion moved the camera')
    ready('shotgun')
    sample()
    window.__shotgunRecoil = {
      ready, step, frame, sample, results,
      showComparison() {
        sheet.id = 'shotgun-recoil-comparison'
        sheet.style.cssText = 'position:fixed;inset:0;z-index:99999;width:100%;height:auto;box-shadow:0 0 0 100vmax white'
        document.body.append(sheet)
      },
      hideComparison() { sheet.remove() },
      stats() { return { name: w.current.name, ammo: w.current.magazine, pitchDegrees: angle(), reducedMotion: frame.reducedMotion } },
    }
    return { staged: true, results, reducedMotion: 'no camera movement' }
  } finally { Math.random = random }
})()
