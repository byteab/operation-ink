// Staged browser diagnostic on the real mission map, using its loaded actors and AI.
(async () => {
  const env = window.__environment, m = env.mission, ai = m.ai, p = env.player
  if (!m.ready) throw new Error('Wait for mission.ready')
  const resource = performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/node_modules/.vite/deps/three.js')?.name
  const T = await import(resource ?? '/node_modules/.vite/deps/three.js')
  const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z)
  const saved = ai.snapshot(), missionUpdate = m.update, playerUpdate = p.update, damage = ai.context.damagePlayer
  m.update = () => false; p.update = () => false; ai.context.damagePlayer = () => {}
  const results = [], captures = [], dt = 1 / 60
  const check = (ok, label, details) => { results.push({ label, passed: !!ok, details }); if (!ok) throw new Error(JSON.stringify(results)) }
  const renderer = new T.WebGLRenderer({ antialias: true }); renderer.outputColorSpace = T.SRGBColorSpace; renderer.setSize(480, 400)
  const camera = new T.PerspectiveCamera(42, 480 / 400, .05, 300)
  const sheet = document.createElement('canvas'); sheet.width = 1440; sheet.height = 435
  const g = sheet.getContext('2d')
  const capture = (label, index, actor, tower = false) => {
    camera.position.copy(actor.position).add(tower ? v(-3.5, 2.1, 4.7) : v(4, 2.0, 4))
    camera.lookAt(actor.position.clone().add(v(0, .85, 0)))
    m.weapons.root.visible = false; renderer.render(env.scene, camera)
    g.fillStyle = '#edf0eb'; g.fillRect(index * 480, 0, 480, 435); g.drawImage(renderer.domElement, index * 480, 35)
    g.fillStyle = '#1b2d26'; g.font = '16px sans-serif'; g.fillText(label, index * 480 + 12, 23)
    captures.push(label)
  }
  try {
    for (const e of ai.enemies) { e.state = 'reserve'; e.actor.root.visible = false }
    const squad = ai.enemies.filter(e => e.spec.weapon === 'ak' && e.spec.role !== 'sniper').slice(0, 3)
    const feet = v(0, .02, -38), player = { feet, eye: feet.clone().add(v(0, 1.65, 0)), velocity: v(), alive: true, radioEnabled: false }
    squad.forEach((e, i) => {
      e.position.copy(ai.navigation.floor(v((i - 1) * 5, .1, -58)))
      Object.assign(e, { state: 'combat', health: 100, canSee: true, lastKnown: feet.clone(), senseTimer: 0, contactMemory: 8,
        tactic: 'hold', tacticTimer: 0, settledFor: 1, aimTime: 1, shotTimer: 0, burst: 0, magazine: 30, reloadTimer: 0,
        defensiveTimer: 0, hitPause: 0, random: 0, path: [], pathTarget: null, communicationTimer: 100 })
      e.yaw = Math.atan2(feet.x - e.position.x, feet.z - e.position.z)
      e.actor.root.position.copy(e.position); e.actor.root.rotation.y = e.yaw; e.actor.root.visible = true; e.actor.restore('combat')
    })
    ai.update(dt, player)
    const movers = squad.filter(e => e.tactic === 'flank' || e.tactic === 'charge')
    check(movers.length === 1, 'Exactly one real-map guard repositions', squad.map(e => ({ id: e.spec.id, tactic: e.tactic })))
    const runner = movers[0], destination = runner.tacticPoint.clone(), holders = squad.filter(e => e !== runner)
    const posts = holders.map(e => e.position.clone())
    let runFrames = 0, peakSpeed = 0, arrived = false
    for (let i = 0; i < 420; i++) {
      ai.update(dt, player)
      peakSpeed = Math.max(peakSpeed, runner.moveSpeed)
      if (runner.moveSpeed > 1.8 && runner.actor.player.current?.getClip().name === 'run') {
        runFrames++
        if (runFrames === 18) capture('Running to a new firing position', 0, runner)
      }
      if (runner.tactic === 'hold' && runner.position.distanceTo(destination) < .5) { arrived = true; break }
    }
    check(arrived && runFrames > 30 && peakSpeed > 2.7, 'Real-map navigation visibly runs and reaches its firing point', { runFrames, peakSpeed, destination: destination.toArray() })
    check(holders.every((e, i) => e.position.distanceTo(posts[i]) < .01 && e.shots > 0), 'Nearby teammates hold their posts and provide covering fire', holders.map(e => ({ id: e.spec.id, shots: e.shots })))
    const planted = runner.position.clone(), before = runner.shots
    for (let i = 0; i < 180; i++) ai.update(dt, player)
    check(runner.position.distanceTo(planted) < .01 && runner.shots > before, 'Arriving runner stays planted and fires', { shots: runner.shots - before, clip: runner.actor.player.current?.getClip().name })
    capture('Stopped, aimed and firing', 1, runner)
    ai.restore(saved)
    const tower = ai.enemies.find(e => e.spec.id === 'water-sniper')
    const hall = v(-34.2, tower.position.y, -46.65), front = v(Math.sin(tower.yaw), 0, Math.cos(tower.yaw))
    check(front.dot(hall.clone().sub(tower.position).normalize()) > .999, 'Water-tower guard faces the mess hall from the west catwalk', { position: tower.position.toArray(), yaw: tower.yaw })
    capture('Water tower watches the mess hall', 2, tower, true)
    document.querySelector('#ai-reposition-evidence')?.remove()
    sheet.id = 'ai-reposition-evidence'; sheet.style.cssText = 'position:fixed;top:0;left:0;z-index:99999'; document.body.append(sheet)
    return { staged: 'Three existing guards on a real mission lane; unmodified director and loaded actors', passed: true, results, captures }
  } finally {
    ai.restore(saved); m.weapons.root.visible = true; ai.context.damagePlayer = damage
    m.update = missionUpdate; p.update = playerUpdate; p.pause(); renderer.dispose()
  }
})()
