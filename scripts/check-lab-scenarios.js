// Run after opening the development /lab.html page:
// agent-browser eval --stdin < scripts/check-lab-scenarios.js
// Advances playback deterministically, including gun completion microtasks.
(async () => {
  const ctx = window.__lab
  if (!ctx) throw new Error('Open the development Stickman Lab before running the scenario checks.')
  const player = ctx.player
  const original = {
    speed: player.mixer.timeScale,
    fade: player.fade,
    name: ctx.weapons.guns?.current?.userData.name,
    stance: ctx.weapons.guns?.stance,
    automatic: ctx.weapons.guns?.automatic,
  }
  const resource = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const scenario = await import(resource('/src/lab/actions/scenario.ts'))
  const gunModule = await import(resource('/src/lab/weapons/guns.ts'))
  if (scenario.clips.armedAlert !== ctx.clips.armedAlert || gunModule.clips.gun_aim2 !== ctx.clips.gun_aim2)
    throw new Error('Reload the page to test its active scenario and gun modules.')
  const results = []
  const started = performance.now()
  let shots = 0, fireCalls = 0
  let guns, originalFire
  const check = (name, passed, details) => {
    results.push({ name, passed: Boolean(passed), ...(details ? { details } : {}) })
    if (!passed) throw new Error(JSON.stringify({ passed: false, results }))
  }
  const step = async (dt, speed = 1) => {
    player.setSpeed(speed)
    try {
      player.update(dt)
      scenario.update(dt, ctx)
      gunModule.update(dt, ctx)
    } finally { player.setSpeed(0) }
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }
  const advance = async (seconds, speed = 1) => {
    const n = Math.ceil(seconds * 120)
    for (let i = 0; i < n; i++) await step(seconds / n, speed)
  }
  const until = async predicate => {
    for (let i = 0; i < 600; i++) {
      if (predicate()) return
      await step(1 / 120)
    }
    throw new Error(`Timed out waiting for a burst phase: ${player.current?.getClip().name}, ${shots} shots.`)
  }
  const interrupt = kind => {
    if (kind === 'holster') guns.unequip()
    if (kind === 'switch') guns.equip('pistol')
    if (kind === 'walk') player.play(ctx.clips.walk, { fade: 0 })
    if (kind === 'aim') guns.aim()
    if (kind === 'stop') player.stop(0)
  }
  try {
    player.setSpeed(0)
    player.fade = 0
    gunModule.update(0, ctx)
    guns = ctx.weapons.guns
    originalFire = guns.fire
    guns.fire = () => { fireCalls++; const ray = originalFire(); if (ray) shots++; return ray }
    const burst = scenario.actions.find(a => a.label === 'Armed: alert & fire burst')
    const start = () => { burst.run(ctx); shots = 0; fireCalls = 0 }

    start()
    await advance(.65)
    check('Alert keeps its armed clip before aiming', player.current.getClip().name === 'armedAlert' && shots === 0)
    await advance(1.5)
    check('Burst fires exactly three shots and settles at aim', shots === 3 && player.current.getClip().name === 'gun_aim2', { shots })

    start()
    await advance(.45)
    const t = player.current.time
    await advance(4, 0)
    check('Pause freezes alert and pending shots', shots === 0 && player.current.time === t)
    await advance(2)
    check('Resume completes three shots', shots === 3, { shots })

    start()
    await advance(2, .25)
    check('Quarter speed slows burst sequencing', shots === 0 && Math.abs(player.current.time - .5) < .001)
    await advance(5, .25)
    check('Quarter speed completes three shots', shots === 3, { shots })

    // Interrupt during alert, aim, either recoil, and the gap between shots.
    for (const at of [.2, .8, 1.03, 1.22, 1.34]) {
      for (const kind of ['holster', 'switch', 'walk', 'aim', 'stop']) {
        start()
        await advance(at)
        const before = shots
        interrupt(kind)
        const current = player.current, equipped = guns.current
        await advance(3)
        check(`${kind} at ${at}s cancels remaining burst`, shots === before && player.current === current && guns.current === equipped, { before, shots })
      }
    }

    start()
    await advance(.85)
    const aim = player.current
    player.play(ctx.clips.gun_aim2, { fade: 0 })
    check('Aim replay reuses the same cached action', player.current === aim)
    await advance(2)
    check('Replaying the identical aim clip cancels the burst', shots === 0)

    start()
    await advance(1.05)
    const count = shots
    await advance(3, 0)
    check('Pause between shots prevents additional gunfire', shots === count, { shots })
    await advance(1)
    check('Resume between shots finishes the remaining burst', shots === 3, { shots })

    start()
    await advance(.8)
    burst.run(ctx)
    await advance(2)
    check('Restart replaces the old sequence', shots === 3, { shots })

    // The default UI fade keeps Aim in its carry transition longer than the
    // first shot delay. A longer user fade must also finish before firing.
    for (const fade of [.2, .8]) {
      player.fade = fade
      const label = `Fade ${fade}s`
      start()
      await advance(scenario.clips.armedAlert.duration + .3)
      check(`${label}: waits for the aim transition without queuing a shot`, shots === 0 && fireCalls === 0 && player.current.getClip().name === 'gun_aim2' && !guns.readyToFire)
      await advance(3)
      check(`${label}: fires exactly three accepted shots and settles`, shots === 3 && fireCalls === 3 && !guns.busy && player.current.getClip().name === 'gun_aim2', { shots, fireCalls })

      start()
      await advance(scenario.clips.armedAlert.duration + .1)
      const aimTime = player.current.time
      await advance(3, 0)
      check(`${label}: pause freezes the aim transition and pending shots`, player.current.time === aimTime && fireCalls === 0 && !guns.readyToFire)
      await advance(3)
      check(`${label}: resuming the aim transition completes the burst`, shots === 3 && fireCalls === 3, { shots, fireCalls })

      // Locate the phases from actual shot completion, independent of the fade.
      for (const phase of ['aim transition', 'first recoil', 'between shots']) {
        for (const kind of ['holster', 'switch', 'walk', 'aim', 'stop']) {
          start()
          if (phase === 'aim transition') await advance(scenario.clips.armedAlert.duration + .1)
          else if (phase === 'first recoil') await until(() => shots === 1 && player.current.getClip().name === 'gun_fire2')
          else await until(() => shots === 1 && !guns.busy && player.current.getClip().name === 'gun_aim2')
          const before = shots, calls = fireCalls
          interrupt(kind)
          const current = player.current, equipped = guns.current
          await advance(3)
          check(`${label}: ${kind} during ${phase} cancels the burst`, shots === before && fireCalls === calls && player.current === current && guns.current === equipped, { before, shots, fireCalls })
        }
      }
    }

    for (const [label, duration] of [['Armed guard patrol', 1], ['Armed: alert & fire burst', .65]]) {
      scenario.actions.find(a => a.label === label).run(ctx)
      let maxGripError = 0, maxLengthError = 0
      for (let i = 0; i <= Math.ceil(duration * 120); i++) {
        await step(i === 0 ? 0 : duration / Math.ceil(duration * 120))
        const model = guns.current
        const anchor = model.localToWorld(model.userData.support.clone())
        const fist = ctx.rig.bones['hand.L'].localToWorld(anchor.clone().set(0, .035, 0))
        maxGripError = Math.max(maxGripError, fist.distanceTo(anchor))
        for (const name of ['forearm.L', 'forearm.R', 'hand.L', 'hand.R']) {
          maxLengthError = Math.max(maxLengthError, Math.abs(ctx.rig.bones[name].position.length() - ctx.rig.rest[name].pos.length()))
        }
      }
      check(`${label} preserves support contact and arm lengths`, maxGripError < .012 && maxLengthError < .00001, { maxGripError, maxLengthError })
    }
    return { passed: true, checks: results.length, durationMs: Math.round(performance.now() - started), results }
  } finally {
    if (guns) {
      guns.fire = originalFire
      guns.unequip()
      if (original.name) {
        guns.equip(original.name)
        if (original.stance === 'aim') guns.aim()
        else if (original.stance === 'hip') guns.hip()
        if (original.automatic && guns.canAuto) guns.toggleAuto()
      }
      player.update(0)
      scenario.update(0, ctx)
      gunModule.update(0, ctx)
    }
    player.fade = original.fade
    player.setSpeed(original.speed)
  }
})()
