// Staged integration/visual checks through agent-browser eval --stdin on a ready game.
// Uses the real enemy shot -> mission damage -> viewmodel/camera pipeline. Reload afterward.
(async () => {
  const env = window.__environment, m = env.mission, p = env.player, c = env.camera.perspective
  if (!m?.ready) throw new Error('Wait for mission.ready')
  const resource = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const T = await import(resource('/node_modules/.vite/deps/three.js'))
  const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z)
  const missionUpdate = m.update.bind(m)
  m.update = p.update = env.camera.update = () => false
  m.audio.setMuted(true)
  const style = document.createElement('style')
  style.textContent = 'body > :not(canvas):not(script){display:none!important}'
  document.head.append(style)
  const results = [], captures = [], impacts = []
  const check = (ok, label, details) => {
    results.push({ label, passed: !!ok, details })
    if (!ok) throw new Error(JSON.stringify(results))
  }
  const damage = m.ai.context.damagePlayer
  m.ai.context.damagePlayer = (amount, source, hit) => { impacts.push(hit); damage(amount, source, hit) }
  const guard = m.ai.enemies.find(e => e.spec.weapon === 'ak')
  const baselinePosition = v(0, 1.68, -62)
  let baselineQuaternion, baseYaw
  const step = (seconds, render = true) => {
    for (let time = 0; time < seconds - 1e-8; time += 1 / 120) {
      p.actions.syncCamera(c)
      missionUpdate(Math.min(1 / 120, seconds - time))
      if (render) env.renderer.render(env.scene, c)
      m.finishFrame()
    }
  }
  const setup = (name = 'ak') => {
    m.playerHits.clear(); m.weapons.cancel(); m.bulletTrails.clear()
    m.state.health = 100; m.state.phase = 'active'; m.state.jeep = 'waiting'
    p.enabled = p.playing = true; p.immersive = false; p.actions.reset(); p.movementLocked = false
    p.body.teleport(v(0, 0.03, -62)); p.body.grounded = true
    p.actions.syncCamera(c); c.position.copy(baselinePosition); c.lookAt(14, 2, -35)
    c.fov = 75; c.updateProjectionMatrix()
    baselineQuaternion = c.quaternion.clone(); baseYaw = new T.Euler().setFromQuaternion(c.quaternion, 'YXZ').y
    m.hud.reducedMotion = false; m.aiming = false; m.interactionTime = 0
    for (const enemy of m.ai.enemies) { enemy.state = 'reserve'; enemy.actor.root.visible = false }
    m.weapons.restore({ slots: [{ id: 'hit-review', name, magazine: name === 'shotgun' ? 5 : 4, reserve: 30 }], selected: 0, pickups: [], nextId: 1000 })
    step(0.25, false)
    check(!m.weapons.blocked, `${name} staged lane has a clear muzzle`)
  }
  const fire = roll => {
    guard.position.set(0, 0.03, -52); guard.yaw = Math.PI
    guard.actor.root.position.copy(guard.position); guard.actor.root.rotation.y = Math.PI
    guard.actor.restore('guard'); guard.actor.update(0.01, 'guard', false)
    Object.assign(guard, { state: 'combat', health: 100, moveSpeed: 0, hitPause: 0, settledFor: 1, aimTime: 2,
      reloadTimer: 0, magazine: 30, burst: 0, defensiveTransition: 0 })
    let count = 0
    const random = m.ai.random
    m.ai.random = () => count++ === 0 ? 0 : roll
    const before = impacts.length
    try { check(m.ai.shoot(guard, { feet: p.body.position, eye: c.position, velocity: v(), alive: true, radioEnabled: false, yaw: baseYaw }), 'Real guard fires') }
    finally { m.ai.random = random; guard.state = 'reserve'; guard.actor.root.visible = false }
    check(impacts.length === before + 1 && m.state.health < 100, 'Real traced round reaches mission damage')
    return impacts.at(-1)
  }
  const cellWidth = 480, cellHeight = 320
  const sheet = document.createElement('canvas'); sheet.width = cellWidth * 3; sheet.height = cellHeight * 3
  const ctx = sheet.getContext('2d')
  const capture = (label, index) => {
    m.playerHits.applyCamera(c, p.world, m.weapons.scoped ? 1 / m.weapons.scopeMagnification : 1)
    env.renderer.render(env.scene, c)
    const position = c.position.toArray(), rotation = new T.Euler().setFromQuaternion(c.quaternion, 'YXZ')
    const x = index % 3 * cellWidth, y = Math.floor(index / 3) * cellHeight
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, cellWidth, cellHeight)
    ctx.drawImage(env.renderer.domElement, x, y + 28, cellWidth, cellHeight - 28)
    ctx.fillStyle = '#000'; ctx.font = '16px sans-serif'; ctx.fillText(label, x + 12, y + 20)
    captures.push({ label, position, rotation: [rotation.x, rotation.y, rotation.z], weapon: m.weapons.mount.position.toArray(), leftHand: m.weapons.leftHand.position.toArray() })
    m.finishFrame()
  }
  setup(); capture('Before impact', 0)
  for (const [index, roll, region, side, label] of [
    [1, 0.55, 'shoulder', 1, 'Right shoulder · 75 ms'],
    [2, 0.45, 'shoulder', -1, 'Left shoulder · 75 ms'],
    [3, 0.77, 'hand', 1, 'Right hand · 75 ms'],
    [4, 0.735, 'hand', -1, 'Left hand · 75 ms'],
    [5, 0.1, 'torso', -1, 'Torso · 100 ms'],
    [6, 0.92, 'leg', 1, 'Right leg · 140 ms'],
    [7, 0.8, 'leg', -1, 'Left leg · 140 ms'],
  ]) {
    setup()
    const actual = fire(roll)
    check(actual.region === region && actual.side === side, `Actual bullet strikes ${label.split(' · ')[0]}`, { region: actual.region, side: actual.side, point: actual.point.toArray() })
    step(region === 'leg' ? 0.14 : region === 'torso' ? 0.1 : 0.075)
    capture(label, index)
    const strengths = [m.playerHits.pose.cameraPosition.length(), m.playerHits.pose.cameraRotation.length()]
    check(strengths.every(value => value > 0), 'Live update produces body and head motion', strengths)
    check(c.quaternion.angleTo(baselineQuaternion) < 1e-7 && c.position.distanceTo(baselinePosition) < 1e-6, 'Render cleanup preserves base aim and position')
  }
  step(0.8); capture('Recovered · exact rest', 8)
  check(m.playerHits.pose.cameraPosition.length() + m.playerHits.pose.cameraRotation.length() === 0, 'Recovery reaches exact rest')
  setup(); fire(0.55); step(0.06)
  const ages = m.playerHits.impulses.map(hit => hit.age)
  p.playing = false; missionUpdate(0.4); m.finishFrame()
  check(JSON.stringify(ages) === JSON.stringify(m.playerHits.impulses.map(hit => hit.age)), 'Pause freezes reaction time')
  p.playing = true; step(0.04)
  check(m.playerHits.impulses[0].age > ages[0], 'Resume continues the reaction')
  setup(); fire(0.55); step(0.06)
  p.fallback = true; p.dragging = true
  document.dispatchEvent(new MouseEvent('mousemove', { movementX: 34, movementY: -18 }))
  p.dragging = false
  const userAim = c.quaternion.clone()
  check(userAim.angleTo(baselineQuaternion) > 0.04, 'Normal mouse handler remains responsive during the flinch')
  step(0.8)
  check(c.quaternion.angleTo(userAim) < 1e-7, 'Full recovery preserves the new mouse aim')
  setup(); m.hud.reducedMotion = true; fire(0.55); step(0.1)
  check(m.playerHits.pose.cameraPosition.length() + m.playerHits.pose.weaponPosition.length() === 0, 'Reduced Motion suppresses camera and limb movement')
  setup('ak'); m.weapons.reload(); const ammo = m.weapons.current.magazine + m.weapons.current.reserve
  fire(0.735); step(0.1); check(m.weapons.reloading, 'Hit keeps the active reload')
  step(2.5, false)
  check(!m.weapons.reloading && m.weapons.current.magazine + m.weapons.current.reserve === ammo, 'Reload finishes with ammunition conserved')
  setup('sniper'); m.aiming = true; step(0.2, false); fire(0.55); step(0.075)
  const magnitude = m.playerHits.pose.cameraRotation.length()
  m.playerHits.applyCamera(c, p.world, 1 / m.weapons.scopeMagnification)
  check(m.weapons.scoped && c.quaternion.angleTo(baselineQuaternion) < magnitude / 3.8, 'Scoped flinch is scaled to 4× magnification')
  m.finishFrame()
  setup(); fire(0.55); step(0.08); m.retry()
  check(m.playerHits.impulses.length === 0 && m.playerHits.pose.cameraRotation.length() === 0, 'Checkpoint clears pending reactions')
  setup(); fire(0.55); step(0.08); m.restart()
  check(m.playerHits.impulses.length === 0, 'Restart clears pending reactions')
  setup(); fire(0.55); step(0.08); m.damage(200, v(0, 1.4, -52))
  check(m.state.phase === 'dead' && m.playerHits.impulses.length === 0, 'Death clears transient flinch')
  setup(); fire(0.55); step(0.08); p.immersive = true; missionUpdate(0.01); m.finishFrame()
  check(m.playerHits.impulses.length === 0, 'Entering VR clears reaction state')
  p.immersive = false
  setup()
  sheet.id = 'player-hit-comparison'
  sheet.style.cssText = 'position:fixed;inset:0;z-index:99999;width:100%;height:auto;box-shadow:0 0 0 100vmax white'
  document.body.append(sheet)
  window.__playerHitReview = { results, captures, setup, fire, step, sheet }
  return { staged: 'Existing guard moved onto a clear real-map lane; seeded accuracy and target rolls; real shot, damage, pose, render and reset paths', results, captures }
})()
