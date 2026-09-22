// Staged checks in the actual game, via agent-browser eval --stdin. Reload afterward.
(async () => {
  const env = window.__environment, m = env.mission, p = env.player, c = env.camera.perspective
  if (!m.ready) throw new Error('Wait for mission.ready')
  const resource = performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/node_modules/.vite/deps/three.js')?.name
  const T = await import(resource ?? '/node_modules/.vite/deps/three.js')
  const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z)
  const update = m.update.bind(m)
  m.update = p.update = env.camera.update = () => false
  const results = [], events = []
  const check = (ok, label) => { results.push({ label, passed: !!ok }); if (!ok) throw new Error(JSON.stringify(results)) }
  const emit = m.emit.bind(m)
  m.emit = (event, audible) => { events.push(event); emit(event, audible) }
  const step = dt => { p.actions.syncCamera(c); update(dt); env.renderer.render(env.scene, c); m.finishFrame() }
  const setup = (name = 'ak') => {
    m.playerHits.clear(); m.bulletTrails.clear(); m.ai.bulletTrails.clear(); m.impacts.clear(); m.hud.reset()
    m.state.phase = 'active'; m.state.health = 100; m.state.jeep = 'waiting'
    p.enabled = p.playing = true; p.immersive = false; p.actions.reset()
    p.body.teleport(v(0, 0.03, -62)); p.body.grounded = true
    p.actions.syncCamera(c); c.lookAt(14, 2, -35); c.fov = 75; c.updateProjectionMatrix()
    m.hud.reducedMotion = false; document.body.dataset.reducedMotion = 'false'
    m.aiming = false; m.interactionTime = 0
    for (const enemy of m.ai.enemies) { enemy.state = 'reserve'; enemy.actor.root.visible = false }
    m.weapons.restore({ slots: [{ id: 'bullet-check', name, magazine: 8, reserve: 30 }], selected: 0, pickups: [], nextId: 1000 })
    for (let i = 0; i < 30; i++) step(1 / 120)
    check(!m.weapons.blocked, `${name} firing lane clear`)
    events.length = 0
  }
  const shoot = () => {
    const canvas = document.querySelector('#world')
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))
    canvas.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }))
    step(0)
  }
  const sheet = document.createElement('canvas'); sheet.width = 1440; sheet.height = 650
  const g = sheet.getContext('2d')
  const capture = (index, label) => {
    env.renderer.render(env.scene, c)
    const x = index % 3 * 480, y = Math.floor(index / 3) * 325
    g.fillStyle = '#fff'; g.fillRect(x, y, 480, 325)
    g.drawImage(env.renderer.domElement, x, y + 25, 480, 300)
    g.fillStyle = '#000'; g.font = '14px monospace'; g.fillText(label, x + 10, y + 18)
  }
  setup(); shoot()
  check(m.weapons.current.magazine === 7 && m.bulletTrails.count === 1, 'Pointer fire produces one visible round and consumes one cartridge')
  const round = m.bulletTrails.rounds[0]
  check(round.distance > 2 && round.duration >= 0.055, 'Fast round has a finite readable flight')
  capture(0, 'AK · muzzle departure')
  step(0.02); capture(1, 'AK · traveling head / short wake')
  const age = round.age
  p.playing = false; step(0.25)
  check(round.age === age, 'Pause freezes visual flight')
  p.playing = true; step(0.02); capture(2, 'AK · near contact')
  step(0.2); check(m.bulletTrails.count === 0, 'Projectile afterimage expires')
  setup('shotgun'); shoot()
  check(m.weapons.current.magazine === 7 && m.bulletTrails.count === 8, 'Shotgun draws eight compact pellets for one cartridge')
  step(0.014); capture(3, 'Shotgun · individual pellet marks')
  setup(); m.impacts.emit(v(1.4, 1.6, -59), v(0, 0, 1)); capture(4, 'Surface · brief ink burst / chips')
  check(m.impacts.bursts.count === 1, 'Surface hit has a brief contact burst')
  step(0.05); step(0.05); check(m.impacts.bursts.count === 0, 'Contact burst expires')

  setup()
  const guard = m.ai.enemies.find(enemy => enemy.spec.weapon === 'ak')
  const fireGuard = hit => {
    guard.position.set(0, 0.03, -52); guard.yaw = Math.PI
    guard.actor.root.position.copy(guard.position); guard.actor.root.rotation.y = Math.PI
    guard.actor.restore('guard'); guard.actor.update(0.01, 'guard', false)
    Object.assign(guard, { state: 'combat', health: 100, moveSpeed: 0, hitPause: 0, settledFor: 1, aimTime: 2, reloadTimer: 0, magazine: 30, burst: 0, defensiveTransition: 0 })
    let count = 0
    const random = m.ai.random
    m.ai.random = () => count++ === 0 ? (hit ? 0 : 0.99) : 0.55
    try { check(m.ai.shoot(guard, { feet: p.body.position, eye: c.position, velocity: v(), alive: true, radioEnabled: false, yaw: 0 }), 'Actual enemy firing path runs') }
    finally { m.ai.random = random; guard.state = 'reserve'; guard.actor.root.visible = false }
  }
  fireGuard(false)
  check(!events.some(e => e.kind === 'enemy-bullet-whiz'), 'Flyby waits for traveling round')
  for (let i = 0; i < 10; i++) step(0.01)
  const whiz = events.find(e => e.kind === 'enemy-bullet-whiz')
  check(whiz?.intensity > 0 && whiz.source && m.state.health === 100, 'Real near miss emits directional intensity without damage')
  check(document.querySelector('.mission-threat').hidden && m.hud.incoming.strength === 0 && !document.querySelector('#mission-hud').classList.contains('hurt'), 'Near miss leaves the view clear without hit shading or caption')
  fireGuard(true); step(0)
  check(m.state.health < 100 && m.playerHits.impulses.length > 0, 'Bullet damage still drives anatomical flinch')
  check(!document.querySelector('.mission-threat').hidden && m.hud.incoming.strength > 0, 'Confirmed hit triggers directional feedback')
  const pressure = Number(document.querySelector('.mission-threat').style.getPropertyValue('--pressure'))
  check(pressure > 0 && pressure <= 0.18, 'Hit shading stays below the reduced 18% cap')
  capture(5, 'Confirmed hit · subtle edge feedback')
  const strength = m.hud.incoming.strength
  p.playing = false; step(0.3)
  check(m.hud.incoming.strength === strength, 'Pause freezes pressure recovery')
  p.playing = true; m.hud.reducedMotion = true; step(0.01)
  check(document.querySelector('.mission-threat').style.getPropertyValue('--pressure') === '0', 'Reduced Motion suppresses pressure, retains direction text')
  m.hud.reducedMotion = false; step(0.7)
  check(document.querySelector('.mission-threat').hidden, 'Pressure clears fully after quiet')
  m.retry()
  check(m.bulletTrails.count === 0 && m.ai.bulletTrails.count === 0 && !m.hud.incoming.visible, 'Checkpoint clears trails, callbacks and threat')
  setup(); fireGuard(false); p.immersive = true; step(0)
  check(m.ai.bulletTrails.count === 0 && !m.hud.incoming.visible, 'VR entry clears incoming effects')

  setup(); fireGuard(false)
  for (let i = 0; i < 6; i++) step(0.01)
  window.__bulletJuice = { results, setup, step, shoot, fireGuard, sheet,
    showSheet() { sheet.style.cssText = 'position:fixed;inset:0;width:100%;height:auto;z-index:99999;background:white'; document.body.append(sheet) },
    hideSheet() { sheet.remove() },
  }
  return { staged: true, results, audio: m.audio.diagnostics }
})()
