// agent-browser eval --stdin < scripts/check-tower-patrol.js
// Runs the real mission director and loaded actors; restores the session afterward.
(async () => {
  const env = window.__environment, m = env.mission, ai = m.ai, p = env.player
  if (!m.ready) throw new Error('Wait for mission.ready')
  const resource = performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/node_modules/.vite/deps/three.js')?.name
  const T = await import(resource ?? '/node_modules/.vite/deps/three.js')
  const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z)
  const saved = ai.snapshot(), missionUpdate = m.update, playerUpdate = p.update, damage = ai.context.damagePlayer
  const weaponVisible = m.weapons.root.visible
  m.update = () => false; p.update = () => false; ai.context.damagePlayer = () => {}; m.weapons.root.visible = false
  const renderer = new T.WebGLRenderer({ antialias: true }); renderer.outputColorSpace = T.SRGBColorSpace; renderer.setSize(640, 390)
  renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:99999;width:100%;height:100%;object-fit:contain;background:#f6f7f3'
  document.body.append(renderer.domElement)
  const camera = new T.PerspectiveCamera(48, 640 / 390, .05, 300)
  const sheet = document.createElement('canvas'); sheet.width = 1280; sheet.height = 840
  const g = sheet.getContext('2d'), captures = []
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  try {
    const water = ai.enemies.find(e => e.spec.id === 'water-sniper')
    const watch = ai.enemies.find(e => e.spec.id === 'watch-sniper'), watchPost = watch.position.clone()
    for (const e of ai.enemies) if (e !== water && e !== watch) { e.state = 'reserve'; e.actor.root.visible = false }
    const tower = env.scene.getObjectByName('North water tower'), center = tower.getWorldPosition(v())
    const player = { feet: v(-200, 0, -200), eye: v(-200, 1.65, -200), velocity: v(), alive: true, radioEnabled: false }
    const render = () => {
      const radial = water.position.clone().sub(center).setY(0).normalize()
      const tangent = v(-radial.z, 0, radial.x)
      camera.position.copy(water.position).addScaledVector(radial, 3.8).addScaledVector(tangent, 2.1).add(v(0, 1.7))
      camera.lookAt(water.position.clone().add(v(0, .85)))
      renderer.render(env.scene, camera)
    }
    const capture = label => {
      render()
      const x = (captures.length % 2) * 640, y = Math.floor(captures.length / 2) * 420
      g.fillStyle = '#f6f7f3'; g.fillRect(x, y, 640, 420); g.drawImage(renderer.domElement, x, y + 30)
      g.fillStyle = '#23332f'; g.font = '17px sans-serif'; g.fillText(label, x + 16, y + 22)
      captures.push({ label, position: water.position.toArray(), clip: water.actor.player.current?.getClip().name })
    }
    let walkFrames = 0, relaxedFrames = 0, previousWait = water.wait
    const stops = [], sectors = new Set(), photographed = new Set()
    // Normal-speed playback first: observe an actual walk → stop transition.
    const start = performance.now()
    let previous = start, liveWalk = false, livePause = false
    while (performance.now() - start < 14000) {
      await new Promise(resolve => requestAnimationFrame(resolve))
      const now = performance.now(); ai.update(Math.min(.05, (now - previous) / 1000), player); previous = now
      render()
      if (water.moveSpeed > 0) liveWalk = true
      if (liveWalk && water.wait > 0) livePause = true
    }
    assert(liveWalk && livePause, 'Normal-speed playback must include both walking and stopping')
    for (let frame = 0; frame < 7200; frame++) {
      ai.update(1 / 60, player)
      const radius = Math.hypot(water.position.x - center.x, water.position.z - center.z)
      assert(radius > 3.3 && radius < 3.85 && Math.abs(water.position.y - tower.userData.deckHeight - .024) < .03, 'Left supported catwalk')
      assert(watch.position.distanceTo(watchPost) < .001, 'Observation tower moved')
      const clip = water.actor.player.current?.getClip().name
      const sector = Math.floor((Math.atan2(water.position.z - center.z, water.position.x - center.x) + Math.PI) / (Math.PI / 4)) % 8
      if (water.moveSpeed > 0) {
        walkFrames++; sectors.add(sector); assert(clip === 'walk', 'Moving without a walk animation')
        if (!captures.length && walkFrames > 15) capture('Walking along the catwalk')
      }
      if (water.wait > previousWait) stops.push({ waypoint: (water.waypoint + 15) % 16, seconds: water.wait })
      previousWait = water.wait
      if (water.wait > 0 && clip === 'lookRelaxed') {
        relaxedFrames++
        if (captures.length > 0 && captures.length < 4 && !photographed.has(sector)) {
          capture(`Lookout pause · side ${sector + 1}`); photographed.add(sector)
        }
      }
    }
    assert(sectors.size === 8 && walkFrames > 1500 && relaxedFrames > 300 && stops.length >= 8, 'Incomplete patrol coverage')
    assert(captures.length === 4 && water.pathFailures === 0, 'Missing lookout evidence or navigation failure')
    sheet.id = 'tower-patrol-evidence'; sheet.style.cssText = 'position:fixed;inset:0;z-index:99999'; document.querySelector('#tower-patrol-evidence')?.remove(); document.body.append(sheet)
    return { passed: true, normalSpeedPlayback: { walked: liveWalk, paused: livePause }, walkFrames, relaxedFrames, sectors: sectors.size,
      distance: water.distanceWalked, waypoints: water.visitedWaypoints, pathFailures: water.pathFailures, stops, captures }
  } finally {
    ai.restore(saved); m.weapons.root.visible = weaponVisible; ai.context.damagePlayer = damage
    m.update = missionUpdate; p.update = playerUpdate; p.pause(); renderer.domElement.remove(); renderer.dispose()
  }
})()
