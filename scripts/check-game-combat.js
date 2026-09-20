// Browser QA on a fresh development game page. Stages one existing guard on a clear map lane.
// Uses the real director, collision world, weapon trigger, hit path and blood system.
(async () => {
  const env = window.__environment, m = env.mission, ai = m.ai, p = env.player
  if (!m.ready) throw new Error('Wait for mission.ready')
  const resource = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const T = await import(resource('/node_modules/.vite/deps/three.js'))
  const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z)
  const saved = ai.snapshot(), missionUpdate = m.update, playerUpdate = p.update
  m.update = () => false; p.update = () => false
  p.enabled = p.playing = true; m.state.phase = 'active'
  m.audio.setActive(true)
  const e = ai.enemies.find(e => e.spec.weapon === 'ak')
  const emit = ai.context.emit, damage = ai.context.damagePlayer, events = []
  ai.context.emit = event => { if (event.kind.startsWith('enemy-shot')) events.push({ kind: event.kind, posture: e.actor.posture, y: event.position.y - e.position.y }); emit(event) }
  ai.context.damagePlayer = () => {}
  const reset = () => {
    ai.restore(saved); m.blood.clear(); m.bulletTrails.clear(); events.length = 0
    for (const other of ai.enemies) { other.state = 'reserve'; other.actor.root.visible = false }
    e.position.copy(ai.navigation.floor(v(0, .1, -58)) ?? v(0, .03, -58)); e.yaw = 0
    Object.assign(e, { state: 'guard', health: 100, canSee: false, lastKnown: null, senseTimer: 10, scanTimer: 0, scanCooldown: 0,
      defensiveTimer: 0, hitPause: 0, shotTimer: 0, aimTime: 0, shots: 0, settledFor: 0, tactic: 'hold', tacticTimer: 10, path: [], pathTarget: null })
    e.actor.root.position.copy(e.position); e.actor.root.rotation.y = 0; e.actor.root.visible = true; e.actor.restore('guard')
  }
  const far = { feet: v(-180, 0, -100), eye: v(-180, 1.65, -100), velocity: v(), alive: true, radioEnabled: false }
  const step = (seconds, sense = far) => {
    for (let i = 0; i < Math.ceil(seconds * 120); i++) { ai.update(1 / 120, sense); m.blood.update(1 / 120); m.impacts.update(1 / 120) }
  }
  const results = [], captures = []
  const check = (ok, label, details) => { results.push({ label, passed: !!ok, details }); if (!ok) throw new Error(JSON.stringify(results)) }
  const renderer = new T.WebGLRenderer({ antialias: true }); renderer.outputColorSpace = T.SRGBColorSpace; renderer.setSize(420, 340)
  const camera = new T.PerspectiveCamera(40, 420 / 340, .05, 300)
  const sheet = document.createElement('canvas'); sheet.width = 1260; sheet.height = 740
  const g = sheet.getContext('2d')
  const capture = (label, index, blast = false) => {
    camera.position.copy(e.position).add(v(blast ? 4.7 : 3.2, blast ? 2.2 : 1.8, blast ? 4.0 : 3.1))
    camera.lookAt(e.position.clone().add(v(0, .75, blast ? .8 : 0)))
    m.weapons.root.visible = false; renderer.render(env.scene, camera)
    const x = index % 3 * 420, y = Math.floor(index / 3) * 370
    g.fillStyle = '#edf0eb'; g.fillRect(x, y, 420, 370); g.drawImage(renderer.domElement, x, y + 30)
    g.fillStyle = '#1b2d26'; g.font = '16px sans-serif'; g.fillText(label, x + 12, y + 21)
    captures.push(label)
  }
  try {
    for (const [index, seed, posture] of [[0, 0, 'crouch'], [1, 700, 'prone'], [2, 1200, 'kneel']]) {
      reset(); e.random = seed
      const origin = e.position.clone().add(v(.65, 1.2, -20)), shot = { origin, direction: v(0, 0, 1), damage: 10, range: 40, weapon: 'pistol' }
      check(ai.nearMiss(shot, 40) === 1 && e.actor.posture === posture, `Actual near miss chooses ${posture}`, { state: e.state, posture: e.actor.posture })
      const start = e.position.clone(); step(.7)
      check(e.position.distanceTo(start) < .001 && e.health === 100, `${posture} reacts without sliding or damage`)
      const snapshot = ai.snapshot(); step(.05); ai.restore(snapshot)
      const restored = ai.snapshot()
      const differences = restored.flatMap((after, i) => Object.keys(after).filter(key => JSON.stringify(after[key]) !== JSON.stringify(snapshot[i][key])).map(key => ({ id: after.id, key })))
      check(differences.length === 0, `${posture} checkpoint roundtrip`, differences)
      // Real contact from the current facing; preserves the pose and normal aim delay.
      const front = v(Math.sin(e.yaw), 0, Math.cos(e.yaw))
      const feet = e.position.clone().addScaledVector(front, 16)
      const sense = { feet, eye: feet.clone().add(v(0, 1.65, 0)), velocity: v(), alive: true, radioEnabled: false }
      e.state = 'combat'; e.canSee = true; e.senseTimer = 0; e.lastKnown = feet.clone(); e.contactMemory = 8
      e.defensiveTimer = posture === 'prone' ? 7 : posture === 'kneel' ? 4.5 : 2.8; e.tacticTimer = 10; e.shotTimer = .8; e.aimTime = 0; e.settledFor = 0
      step(1.8, sense)
      check(events.some(event => event.posture === posture), `${posture} fires through real AI`, { shots: events.slice(), finalPosture: e.actor.posture })
      if (posture === 'prone') { step(3, sense); check(e.actor.posture === 'prone' && events.length >= 4, 'Prone holds and returns sustained fire beyond five seconds', { shots: events.length, hold: e.defensiveTimer }) }
      capture(`${posture} · actual AI fire`, index)
      step(10, far)
      check(e.actor.posture === 'stand', `${posture} eventually returns to standing`)
    }
    reset(); e.yaw = Math.PI; e.actor.root.rotation.y = Math.PI; e.actor.restore('guard')
    const chest = e.actor.rig.bones.chest.getWorldPosition(v()).add(v(0, .06, 0))
    env.camera.perspective.position.copy(e.position).add(v(0, 1.5, -2.2)); env.camera.perspective.lookAt(chest)
    p.body.teleport(env.camera.perspective.position.clone().setY(e.position.y))
    m.weapons.restore({ slots: [{ id: 'qa-shotgun', name: 'shotgun', magazine: 6, reserve: 24 }], selected: 0, pickups: [], nextId: 1000 })
    const frame = { active: true, climbing: false, moving: 0, aiming: true, reducedMotion: false, feet: p.body.position }
    for (let i = 0; i < 90; i++) m.weapons.update(1 / 120, frame)
    const kills = m.state.kills, shots = m.state.shots
    m.weapons.trigger(true); m.weapons.trigger(false)
    m.weapons.update(1 / 120, frame)
    check(e.state === 'dead' && e.deathClip === 'dieShotgun', 'Real shotgun trigger selects airborne death', { health: e.health, state: e.state, deathClip: e.deathClip })
    const drops = m.weapons.snapshot().pickups.filter(item => item.id === `enemy-${e.spec.id}`).length
    check(m.state.kills === kills + 1 && m.state.shots === shots + 1 && m.weapons.current.magazine === 5 && drops === 1,
      'Eight pellets consume one shell, count one shot, and drop one pickup', { kills: m.state.kills - kills, shots: m.state.shots - shots, magazine: m.weapons.current.magazine, drops })
    check(m.blood.snapshot().droplets.length >= 110, 'Real shotgun produces heavier initial blood', { drops: m.blood.snapshot().droplets.length })
    step(.32); capture('Shotgun · airborne 0.32s', 3, true)
    const hips = e.actor.rig.bones.hips.getWorldPosition(v())
    check(hips.y - e.position.y > 1 && hips.z > e.position.z + .6, 'Actual shotgun launches away from shooter', { hips: hips.toArray(), root: e.position.toArray() })
    const blood = m.blood.snapshot()
    const flight = ai.snapshot()
    check(blood.droplets.length > 0 && blood.shotgunBursts.length === 1 && blood.shotgunBursts[0].next === 2,
      'Blood trail follows actual victim as initial droplets strike ground', { drops: blood.droplets.length, stains: blood.stains.length })
    step(.44); capture('Shotgun · ground impact', 4, true)
    step(.8); capture('Shotgun · settled', 5, true)
    check(m.blood.snapshot().stains.some(s => s.grow) && m.blood.snapshot().shotgunBursts.length === 0, 'Actual landing receives pool and drains events')
    const landed = m.blood.snapshot(), corpse = e.actor.rig.bones.chest.getWorldPosition(v())
    ai.restore(flight); m.blood.restore(blood); step(.44); step(.8)
    const replay = m.blood.snapshot()
    const pools = snapshot => snapshot.stains.filter(s => s.grow).map(s => s.position)
    check(e.actor.rig.bones.chest.getWorldPosition(v()).distanceTo(corpse) < 1e-5 &&
      JSON.stringify(pools(replay)) === JSON.stringify(pools(landed)) && replay.shotgunBursts.length === 0,
      'Combined actor and blood checkpoint resumes to the same corpse and landing pool', { pools: pools(replay) })
    const bank = await import(resource('/src/game/igi-samples.ts'))
    const files = ['spas12_shot_1', 'spas12_pump', 'spas12_reload_1', 'spas12_reload_2', ...[1,2,3,4].map(n => `spas12_bulins_${n}`)]
    const ac = new AudioContext(), decoded = []
    for (const name of files) { const response = await fetch(`/sounds/igi/${name}.m4a`); check(response.ok, `Served IGI ${name}`); const buffer = await ac.decodeAudioData(await response.arrayBuffer()); decoded.push({ name, duration: buffer.duration, rate: buffer.sampleRate }) }
    await ac.close()
    check(bank.IGI_SAMPLES['shot-shotgun'].files[0] === 'igi/spas12_shot_1.wav', 'Shotgun report uses original IGI source', decoded)
    m.restart()
    check(m.ai.enemies.every(enemy => enemy.actor.posture === 'stand') && m.blood.snapshot().shotgunBursts.length === 0 && m.state.kills === 0,
      'Restart clears defensive postures, deaths, and pending blood')
    sheet.id = 'game-combat-evidence'; sheet.style.cssText = 'position:fixed;top:0;left:0;z-index:99999'; document.body.append(sheet)
    return { staged: 'One existing guard on real mission lane; real director, weapon trigger, collision and blood', passed: true, results, captures }
  } finally {
    ai.context.emit = emit; ai.context.damagePlayer = damage
    ai.restore(saved); m.blood.clear(); m.weapons.root.visible = true; p.pause()
    m.update = missionUpdate; p.update = playerUpdate; renderer.dispose()
  }
})()
