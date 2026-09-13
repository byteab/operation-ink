// Evaluate this expression in the running /lab.html page (for example with agent-browser eval).
// Simulation steps and microtasks are deterministic; no wall-clock waits or rendering are needed.
(async () => {
  const ctx = window.__lab
  if (!ctx) throw new Error('Open the development Stickman Lab before running the gun checks.')
  const player = ctx.player
  const original = {
    speed: player.mixer.timeScale,
    fade: player.fade,
    name: ctx.weapons.guns?.current?.userData.name,
    stance: ctx.weapons.guns?.stance,
    automatic: ctx.weapons.guns?.automatic,
  }
  const started = performance.now()
  const results = []
  const counts = { shell: 0, flash: 0, tracer: 0 }
  const seenEffects = new WeakSet()
  let guns
  let module
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const close = (a, b, epsilon = 1e-7) => Math.abs(a - b) <= epsilon
  const sampleEffects = () => {
    const group = ctx.scene.getObjectByName('gun effects')
    for (const obj of group?.children ?? []) {
      if (seenEffects.has(obj)) continue
      seenEffects.add(obj)
      if (obj.isMesh) counts.shell++
      else if (obj.isSprite) counts.flash++
      else if (obj.isLine) counts.tracer++
    }
  }
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  const step = async (dt = 1 / 60, speed = 1) => {
    player.setSpeed(speed)
    try {
      player.update(dt)
      module.update(dt, ctx)
    } finally {
      player.setSpeed(0)
    }
    sampleEffects()
    await settle()
    sampleEffects()
  }
  const advance = async seconds => {
    const steps = Math.ceil(seconds * 60)
    for (let i = 0; i < steps; i++) await step(seconds / steps)
  }
  const finish = async (limit = 4) => {
    for (let i = 0; guns.busy && i < limit * 60; i++) await step()
    assert(!guns.busy, `Operation did not complete within ${limit} simulated seconds.`)
  }
  const partsState = model => Object.fromEntries(Object.entries(model.userData.parts).map(([name, obj]) => [name, {
    position: obj.position.toArray(), rotation: obj.rotation.toArray().slice(0, 3),
  }]))
  const assertParts = (model, expected, allowCylinderIndex = false) => {
    const actual = partsState(model)
    for (const [name, fields] of Object.entries(expected)) {
      for (const property of ['position', 'rotation']) {
        for (let axis = 0; axis < 3; axis++) {
          if (allowCylinderIndex && name === 'cylinder' && property === 'rotation' && axis === 2) continue
          assert(close(actual[name][property][axis], fields[property][axis]), `${name}.${property}[${axis}] failed to return to its rest transform.`)
        }
      }
    }
  }
  const checkRay = (ray, model) => {
    assert(ray, 'Fire did not return a ray.')
    assert([...ray.origin.toArray(), ...ray.direction.toArray()].every(Number.isFinite), 'Fire returned a non-finite ray.')
    model.updateWorldMatrix(true, false)
    const expectedOrigin = model.localToWorld(model.userData.muzzle.clone())
    const expectedDirection = ray.direction.clone().set(0, 0, 1).transformDirection(model.matrixWorld)
    assert(ray.origin.distanceTo(expectedOrigin) < 1e-7, 'Ray origin does not match the current muzzle.')
    assert(ray.direction.distanceTo(expectedDirection) < 1e-7 && close(ray.direction.length(), 1), 'Ray direction does not match the current barrel.')
  }
  const test = async (name, run) => {
    try {
      const details = await run()
      results.push({ name, passed: true, ...(details ? { details } : {}) })
    } catch (error) {
      results.push({ name, passed: false, error: String(error?.message ?? error) })
    }
  }
  const equip = async (name, stance = 'aim') => {
    guns.equip(name)
    if (stance === 'aim') guns.aim()
    else if (stance === 'hip') guns.hip()
    else guns.lower()
    await step(0)
    return guns.current
  }
  try {
    player.setSpeed(0)
    player.fade = 0
    // Vite can stamp imports after an edit; use the exact module loaded by the page.
    // Reload the page before checks so its first request identifies the active instance.
    const moduleUrl = performance.getEntriesByType('resource').find(entry =>
      new URL(entry.name).pathname === '/src/lab/weapons/guns.ts')?.name
    module = await import(moduleUrl ?? '/src/lab/weapons/guns.ts')
    assert(module.clips.gun_aim2 === ctx.clips.gun_aim2, 'Reload the page to test its active gun module.')
    module.update(0, ctx)
    guns = ctx.weapons.guns
    sampleEffects()

    for (const name of guns.names) {
      await test(`${name}: aim, fire, finish, and mechanism reset`, async () => {
        const model = await equip(name)
        const rest = partsState(model)
        const before = { ...counts }
        checkRay(guns.fire(), model)
        sampleEffects()
        assert(guns.busy, 'A single shot must remain busy through its animation and cycle.')
        const immediateShells = ['pistol', 'smg', 'ak'].includes(name) ? 1 : 0
        assert(counts.shell - before.shell === immediateShells, 'Incorrect shell ejection at the instant of firing.')
        await finish()
        assert(model.parent === ctx.rig.bones['hand.R'], 'Finished weapon was not returned to the firing hand.')
        assert(guns.stance === 'aim', 'Shot changed the selected stance.')
        assertParts(model, rest, name === 'revolver')
        assert(counts.flash - before.flash === 1 && counts.tracer - before.tracer === 1, 'Single shot emitted an incorrect number of muzzle effects.')
        assert(counts.shell - before.shell === (name === 'revolver' ? 0 : 1), 'Single shot/cycle emitted an incorrect number of shells.')
      })
      await test(`${name}: same-frame equip, aim, and fire`, async () => {
        guns.equip(name)
        guns.aim()
        checkRay(guns.fire(), guns.current)
        sampleEffects()
        await finish()
      })
      await test(`${name}: fire from lowered raises before emitting and respects pause`, async () => {
        const model = await equip(name, 'down')
        const before = { ...counts }
        assert(guns.fire() === null, 'A lowered gun returned a ray before it was raised.')
        assert(guns.busy, 'Raising for a shot did not mark the gun busy.')
        sampleEffects()
        assert(counts.flash === before.flash && counts.tracer === before.tracer, 'A lowered gun emitted effects before raising.')
        await advance(0.08)
        assert(counts.flash === before.flash, 'Raising emitted a shot prematurely.')
        const clipTime = player.current.time, parts = partsState(model)
        await step(10, 0)
        assert(close(player.current.time, clipTime) && guns.busy, 'Pause advanced or finished the raise.')
        assertParts(model, parts)
        assert(counts.flash === before.flash, 'Paused raise emitted a shot.')
        await finish()
        assert(counts.flash - before.flash === 1 && counts.tracer - before.tracer === 1, 'Raising did not emit exactly one shot after resuming.')
        assert(counts.shell - before.shell === (name === 'revolver' ? 0 : 1), 'Raised shot/cycle emitted the wrong shell count.')
        assert(guns.stance === 'aim', 'Raised shot did not finish in aim stance.')
      })
      await test(`${name}: automatic-fire availability`, async () => {
        await equip(name)
        const allowed = name === 'smg' || name === 'ak'
        assert(guns.canAuto === allowed, 'Automatic capability does not match the weapon.')
        guns.toggleAuto()
        assert(guns.automatic === allowed, 'Automatic toggle accepted or rejected the wrong weapon.')
        if (allowed) guns.toggleAuto()
      })
    }

    for (const name of ['pistol', 'sniper']) for (const cancel of ['lower', 'switch', 'holster']) {
      await test(`${name}: ${cancel} cancels a pending raised shot`, async () => {
        const old = await equip(name, 'down'), before = { ...counts }, rest = partsState(old)
        guns.fire()
        await advance(0.08)
        if (cancel === 'switch') guns.equip('revolver')
        else if (cancel === 'holster') guns.unequip()
        else guns.lower()
        await advance(1.5)
        assert(!guns.busy, 'Canceled raise left the gun busy.')
        assertParts(old, rest)
        assert(counts.flash === before.flash && counts.shell === before.shell && counts.tracer === before.tracer, 'Canceled raise emitted a stale shot or shell.')
        assert(guns.current?.userData.name === (cancel === 'switch' ? 'revolver' : cancel === 'holster' ? undefined : name), 'Canceled raise replaced a newer equipped weapon.')
      })
    }
    for (const name of ['smg', 'ak']) {
      await test(`${name}: automatic fire from lowered waits for the raise`, async () => {
        await equip(name, 'down')
        const before = counts.flash
        guns.toggleAuto()
        await advance(0.08)
        assert(counts.flash === before, 'Automatic fire emitted before raising.')
        await step(10, 0)
        assert(counts.flash === before, 'Automatic raise emitted while paused.')
        await advance(0.35)
        assert(counts.flash > before && guns.automatic, 'Automatic fire did not begin after raising.')
        guns.toggleAuto()
        assert(!guns.automatic, 'Automatic fire did not stop.')
        await equip(name, 'down')
        const canceled = counts.flash
        guns.toggleAuto()
        await advance(0.08)
        guns.lower()
        await advance(0.8)
        assert(counts.flash === canceled && !guns.automatic && !guns.busy, 'Canceled automatic raise emitted delayed shots.')
      })
    }

    for (const name of ['shotgun', 'sniper']) {
      await test(`${name}: hip fire cycles, ejects once, and returns to hip`, async () => {
        const model = await equip(name, 'hip')
        const part = model.userData.parts[name === 'shotgun' ? 'pump' : 'bolt']
        const rest = part.position.z
        const before = counts.shell
        checkRay(guns.fire(), model)
        sampleEffects()
        assert(counts.shell === before, 'Manual action ejected before its cycle.')
        await step(0.21)
        assert(player.current.getClip().name === (name === 'shotgun' ? 'gun_pump' : 'gun_bolt'), 'Hip fire skipped its manual action clip.')
        await advance(0.34)
        assert(Math.abs(part.position.z - rest) > 0.005, 'Manual action part did not move.')
        await finish()
        assert(counts.shell - before === 1, 'Manual action did not eject exactly one shell.')
        assert(guns.stance === 'hip' && player.current.getClip().name === 'gun_hip', 'Manual action did not restore hip stance.')
        assert(close(part.position.z, rest), 'Manual action failed to reset its moving part.')
        assert(model.parent === ctx.rig.bones['hand.R'], 'Manual action left the gun on the support hand.')
      })

      for (const action of ['switch', 'holster']) {
        await test(`${name}: ${action} during the cycle cancels stale work`, async () => {
          const old = await equip(name)
          const rest = partsState(old)
          guns.fire()
          sampleEffects()
          await step(0.21)
          await advance(name === 'shotgun' ? 0.1 : 0.34)
          const before = { ...counts }
          if (action === 'switch') {
            guns.equip('pistol')
            guns.aim()
            checkRay(guns.fire(), guns.current)
            sampleEffects()
          } else guns.unequip()
          assertParts(old, rest)
          await advance(1.6)
          assert(!guns.busy, 'Canceled cycle kept the weapon busy.')
          assert(counts.shell - before.shell === (action === 'switch' ? 1 : 0), 'Canceled cycle ejected a stale shell.')
          assert(counts.flash - before.flash === (action === 'switch' ? 1 : 0), 'Canceled cycle emitted a stale shot.')
          assert(guns.current?.userData.name === (action === 'switch' ? 'pistol' : undefined), 'Canceled cycle replaced or reattached a later weapon.')
          assert(old.parent === null, 'Canceled weapon remained attached to the rig.')
        })
      }
    }

    for (const name of ['pistol', 'revolver', 'smg', 'ak', 'sniper']) {
      await test(`${name}: reload interruption resets mechanisms and timers`, async () => {
        const model = await equip(name)
        const rest = partsState(model)
        guns.reload()
        await advance(0.55)
        assert(guns.busy, 'Reload ended prematurely.')
        assert(JSON.stringify(partsState(model)) !== JSON.stringify(rest), 'Reload did not animate its mechanism.')
        const before = counts.shell
        guns.lower()
        assertParts(model, rest)
        await advance(2.5)
        assertParts(model, rest)
        assert(!guns.busy && model.parent === ctx.rig.bones['hand.R'], 'Reload interruption left stale state.')
        assert(counts.shell === before, 'Canceled reload emitted delayed shells.')
      })
    }

    await test('Pause freezes a moving slide and its effects', async () => {
      const model = await equip('pistol')
      guns.fire()
      sampleEffects()
      await step(0.025)
      const partSnapshot = partsState(model)
      const clipTime = player.current.time
      const effects = ctx.scene.getObjectByName('gun effects').children.map(obj => ({
        obj, position: obj.position.toArray(), rotation: obj.rotation.toArray(), opacity: obj.material?.opacity,
      }))
      await step(10, 0)
      assertParts(model, partSnapshot)
      assert(close(player.current.time, clipTime), 'Paused animation time advanced.')
      for (const saved of effects) {
        assert(JSON.stringify(saved.obj.position.toArray()) === JSON.stringify(saved.position), 'Paused effect position moved.')
        assert(JSON.stringify(saved.obj.rotation.toArray()) === JSON.stringify(saved.rotation), 'Paused effect rotation moved.')
        assert(saved.obj.material?.opacity === saved.opacity, 'Paused muzzle effect faded.')
      }
      await finish()
    })

    await test('Pause freezes reload timers', async () => {
      const model = await equip('revolver')
      guns.reload()
      await advance(0.2)
      const snapshot = partsState(model)
      const before = counts.shell
      await step(10, 0)
      assert(guns.busy, 'Pause completed a reload.')
      assertParts(model, snapshot)
      assert(counts.shell === before, 'Paused reload timer emitted shells.')
      await finish()
      assert(counts.shell - before === 6, 'Revolver reload did not eject six shells after resuming.')
    })

    for (const name of ['smg', 'ak']) {
      await test(`${name}: auto pause, stall recovery, and repeated-shot drift`, async () => {
        const model = await equip(name)
        const rest = partsState(model)
        guns.toggleAuto()
        await step(0.005)
        const beforePause = { ...counts }
        const pausedParts = partsState(model)
        await step(30, 0)
        assertParts(model, pausedParts)
        assert(counts.flash === beforePause.flash, 'Paused automatic gun emitted another shot.')
        await step(5)
        assert(counts.flash - beforePause.flash === 1, 'Automatic fire emitted a burst of missed shots after a stall.')
        await step(0.001)
        assert(counts.flash - beforePause.flash === 1, 'Automatic fire kept catching up after a stall.')
        const moving = model.userData.parts.bolt
        const baseZ = moving.position.z
        const period = name === 'smg' ? 60 / 900 : 60 / 600
        for (let i = 0; i < 60; i++) {
          await step(period / 2)
          assert(Math.abs(moving.position.z - baseZ) <= 0.03, 'Repeated shots accumulated bolt drift.')
        }
        guns.toggleAuto()
        assertParts(model, rest)
        assert(!guns.automatic, 'Automatic fire failed to stop.')
        checkRay(guns.fire(), model)
        sampleEffects()
        await finish()
      })
    }

    for (const name of ['ak', 'shotgun', 'sniper']) {
      await test(`${name}: support fist follows the anchor across stances`, async () => {
        const distances = {}
        for (const stance of ['aim', 'hip', 'down']) {
          const model = await equip(name, stance)
          await advance(0.1)
          const anchor = model.localToWorld(model.userData.support.clone())
          const fist = ctx.rig.bones['hand.L'].localToWorld(anchor.clone().set(0, 0.035, 0))
          distances[stance] = fist.distanceTo(anchor)
          assert(distances[stance] < 0.012, `${stance} support fist misses its anchor by ${(distances[stance] * 100).toFixed(2)} cm.`)
          for (const bone of Object.values(ctx.rig.bones)) assert(bone.quaternion.toArray().every(Number.isFinite), 'Support solver produced a non-finite bone rotation.')
        }
        return { distanceMeters: distances }
      })
    }

    await test('Sniper remains steady when handed to the support hand for cycling', async () => {
      const model = await equip('sniper')
      guns.fire()
      sampleEffects()
      await step(0.21)
      assert(model.parent === ctx.rig.bones['hand.L'], 'Sniper was not handed to the support hand.')
      const initial = model.localToWorld(model.userData.muzzle.clone())
      await advance(0.05)
      const distance = initial.distanceTo(model.localToWorld(model.userData.muzzle.clone()))
      assert(distance < 0.01, `Sniper muzzle jumped ${(distance * 100).toFixed(2)} cm when the bolt clip restored the support-arm keys.`)
      await finish()
      return { transferMovementMeters: distance }
    })

    for (const [name, part, at] of [
      ['pistol', 'magazine', 0.7], ['pistol', 'slide', 1.5],
      ['revolver', 'cylinder', 0.75], ['smg', 'magazine', 0.7], ['smg', 'bolt', 1.65],
      ['ak', 'magazine', 0.7], ['ak', 'bolt', 1.65],
      ['shotgun', 'loadingPort', 0.7], ['sniper', 'magazine', 0.7],
    ]) {
      await test(`${name}: reload hand follows ${part}`, async () => {
        const model = await equip(name)
        guns.reload()
        await advance(at)
        const mechanism = model.userData.parts[part]
        const anchor = mechanism.localToWorld(mechanism.userData.grip.clone())
        const fist = ctx.rig.bones['hand.L'].localToWorld(anchor.clone().set(0, 0.035, 0))
        const error = fist.distanceTo(anchor)
        assert(error < 0.012, `Reload hand misses ${part} by ${(error * 100).toFixed(2)} cm.`)
        await finish()
      })
    }

    for (const name of ['shotgun', 'sniper']) {
      await test(`${name}: unrelated animation cancels its cycle`, async () => {
        const model = await equip(name)
        const rest = partsState(model)
        guns.fire()
        await step(0.21)
        const before = counts.shell
        player.play(ctx.clips.idle, { fade: 0 })
        await advance(1.5)
        assert(!guns.busy && player.current.getClip() === ctx.clips.idle, 'Canceled cycle took the rig back.')
        assert(counts.shell === before, 'Interrupted cycle emitted a stale shell.')
        assert(model.parent === ctx.rig.bones['hand.R'], 'Interrupted cycle left the gun in the wrong hand.')
        assertParts(model, rest)
      })
    }

    const report = { passed: results.every(result => result.passed), durationMs: Math.round(performance.now() - started), results }
    if (!report.passed) throw new Error(JSON.stringify(report))
    return report
  } finally {
    if (guns) {
      guns.unequip()
      if (original.name) {
        guns.equip(original.name)
        if (original.stance === 'aim') guns.aim()
        else if (original.stance === 'hip') guns.hip()
        if (original.automatic && guns.canAuto) guns.toggleAuto()
      }
      player.update(0)
      module.update(0, ctx)
    }
    player.fade = original.fade
    player.setSpeed(original.speed)
  }
})()
