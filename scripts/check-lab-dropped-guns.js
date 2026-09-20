// agent-browser eval --stdin < scripts/check-lab-dropped-guns.js
// Run in the development /lab.html page. Checks release, floor contact and cleanup.
(async () => {
  const ctx = window.__lab
  if (!ctx) throw new Error('Open the development Stickman Lab before running dropped-gun checks.')
  const resource = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const gunsModule = await import(resource('/src/lab/weapons/guns.ts'))
  const droppedModule = await import(resource('/src/lab/weapons/dropped.ts'))
  const scenario = await import(resource('/src/lab/actions/scenario.ts'))
  const damage = await import(resource('/src/lab/clips/damage.ts'))
  const threeUrl = performance.getEntriesByType('resource').find(e => /\/three\.js/.test(e.name))?.name
  const THREE = await import(threeUrl)
  if (gunsModule.clips.gun_aim2 !== ctx.clips.gun_aim2) throw new Error('Reload the page to test its active gun module.')
  const { player } = ctx
  const guns = ctx.weapons.guns
  const original = { speed: player.mixer.timeScale, fade: player.fade, name: guns.current?.userData.name, stance: guns.stance, automatic: guns.automatic }
  // Exercise the actual lethal action handlers without accumulating unrelated blood effects.
  const damageCtx = { ...ctx, fx: { ...ctx.fx, blood: undefined } }
  const results = [], effects = new WeakSet()
  const counts = { shell: 0, flash: 0 }
  const check = (name, passed, details) => {
    results.push({ name, passed: Boolean(passed), ...(details ? { details } : {}) })
    if (!passed) throw new Error(JSON.stringify({ passed: false, results }))
  }
  const sample = () => {
    for (const obj of ctx.scene.getObjectByName('gun effects')?.children ?? []) {
      if (effects.has(obj)) continue
      effects.add(obj)
      if (obj.isMesh) counts.shell++
      if (obj.isSprite) counts.flash++
    }
  }
  const step = async (dt, speed = 1) => {
    player.setSpeed(speed)
    try {
      player.update(dt)
      scenario.update(dt, ctx)
      droppedModule.update(dt, ctx)
      gunsModule.update(dt, ctx)
    } finally { player.setSpeed(0) }
    sample()
    for (let i = 0; i < 10; i++) await Promise.resolve()
    sample()
  }
  const advance = async seconds => {
    const n = Math.ceil(seconds * 120)
    for (let i = 0; i < n; i++) await step(seconds / n)
  }
  const equip = async name => {
    guns.equip(name); guns.aim()
    await step(0)
    return guns.current
  }
  const world = gun => ({ position: gun.getWorldPosition(new THREE.Vector3()), quaternion: gun.getWorldQuaternion(new THREE.Quaternion()).normalize() })
  const bounds = gun => new THREE.Box3().setFromObject(gun)
  const die = async (clip = 'dieHead') => {
    player.play(ctx.clips[clip], { once: true, fade: .2 })
    // UI clicks flush interrupted operation promises before the next render frame.
    for (let i = 0; i < 10; i++) await Promise.resolve()
    await step(0)
  }
  try {
    player.setSpeed(0); player.fade = 0
    sample()
    for (const name of guns.names) {
      const gun = await equip(name), before = world(gun)
      let disposed = false
      gun.children.find(obj => obj.isMesh).geometry.addEventListener('dispose', () => { disposed = true })
      await die()
      const after = world(gun)
      check(`${name}: releases the original visible model without changing the death clip`, guns.current === null && gun.parent === ctx.scene && !disposed && player.current.getClip() === ctx.clips.dieHead)
      const releaseMovement = before.position.distanceTo(after.position)
      const releaseRotation = before.quaternion.normalize().angleTo(after.quaternion.normalize())
      check(`${name}: preserves the transform at release`, releaseMovement < 1e-4 && releaseRotation < 1e-4, { releaseMovement, releaseRotation })
      let lowest = Infinity
      for (let i = 0; i < 240; i++) {
        await step(1 / 120)
        lowest = Math.min(lowest, bounds(gun).min.y)
      }
      const settled = world(gun), floor = bounds(gun).min.y
      await advance(.5)
      check(`${name}: falls, settles on its side and remains above the floor`, lowest >= .0059 && floor >= .0059 && floor < .007 && settled.position.distanceTo(world(gun).position) < 1e-8 && settled.quaternion.angleTo(world(gun).quaternion) < 1e-6, { lowest, floor })
      guns.unequip()
      // Batched gun geometry is shared by every copy of the model, so clean-up removes the gun and must not dispose it.
      check(`${name}: holster cleans up the dropped model`, !disposed && gun.parent === null)
    }

    for (const clip of ['dieHead', 'dieBody', 'dieArm', 'dieLeg', 'dieBack']) {
      const gun = await equip('ak')
      await die(clip)
      await advance(2.5)
      check(`${clip}: finishes with the weapon separate from the body`, guns.current === null && gun.parent === ctx.scene && player.current.getClip() === ctx.clips[clip] && bounds(gun).min.y >= .0059)
    }

    for (const fade of [0, .2]) for (const label of ['Die: head', 'Die: from behind']) {
      player.fade = 0
      const gun = await equip('ak'), visible = world(gun)
      player.fade = fade
      damage.actions.find(action => action.label === label).run(damageCtx)
      const released = world(gun)
      check(`${label}, fade ${fade}: UI action releases before modifying the visible hold`, gun.parent === ctx.scene && visible.position.distanceTo(released.position) < 1e-4 && visible.quaternion.angleTo(released.quaternion) < 1e-4)
      for (let i = 0; i < 10; i++) await Promise.resolve()
      await step(1 / 60)
      const moved = world(gun)
      check(`${label}, fade ${fade}: next frame follows the drop instead of the death pose`, moved.position.distanceTo(visible.position) < .03 && moved.quaternion.angleTo(visible.quaternion) < .1 && guns.current === null)
    }
    player.fade = 0
    const boltGun = await equip('sniper')
    guns.fire(); await advance(.6)
    const visibleBolt = world(boltGun)
    damage.actions.find(action => action.label === 'Die: leg').run(damageCtx)
    check('Sniper bolt UI death releases the exact last visible hold before a zero-fade fall', boltGun.parent === ctx.scene && world(boltGun).position.distanceTo(visibleBolt.position) < 1e-4)
    for (let i = 0; i < 10; i++) await Promise.resolve()
    await step(1 / 60)
    check('Sniper bolt UI death keeps release stable through interrupted promises and first frame', world(boltGun).position.distanceTo(visibleBolt.position) < .03 && guns.current === null)

    const pausedGun = await equip('sniper')
    await die()
    await advance(.18)
    const paused = world(pausedGun), pausedTime = player.current.time
    await step(10, 0)
    check('Pause freezes the falling weapon and death animation', world(pausedGun).position.distanceTo(paused.position) < 1e-8 && world(pausedGun).quaternion.angleTo(paused.quaternion) < 1e-6 && player.current.time === pausedTime)
    await advance(2)
    check('Resume completes the weapon fall', bounds(pausedGun).min.y < .007)

    for (const [name, operation] of [['ak', 'auto'], ['revolver', 'reload'], ['shotgun', 'cycle'], ['sniper', 'cycle']]) {
      const gun = await equip(name)
      if (operation === 'auto') guns.toggleAuto()
      else if (operation === 'reload') guns.reload()
      else guns.fire()
      await advance(operation === 'reload' || name === 'sniper' ? .6 : .3)
      const before = { ...counts }, transform = world(gun)
      await die('dieLeg')
      const released = world(gun)
      check(`${name}: death cancels ${operation} and preserves the release location`, !guns.busy && !guns.automatic && guns.current === null && gun.parent === ctx.scene && transform.position.distanceTo(released.position) < 1e-4, { movement: transform.position.distanceTo(released.position), busy: guns.busy, automatic: guns.automatic, held: guns.current !== null, sceneParent: gun.parent === ctx.scene })
      await advance(2.5)
      check(`${name}: death prevents delayed firing or shell ejection`, counts.shell === before.shell && counts.flash === before.flash && player.current.getClip() === ctx.clips.dieLeg)
    }

    for (const cleanup of ['switch', 'reset']) {
      const old = await equip('ak')
      await die()
      await advance(.15)
      if (cleanup === 'switch') guns.equip('pistol')
      else scenario.actions.find(action => action.label === 'Reset scene').run(ctx)
      await advance(2)
      check(`${cleanup} removes the old falling weapon without stale reattachment`, old.parent === null && guns.current?.userData.name === (cleanup === 'switch' ? 'pistol' : undefined))
    }
    scenario.actions.find(action => action.label === 'Armed: alert & fire burst').run(ctx)
    await advance(1.1)
    const burstShots = counts.flash
    await die('dieBody')
    await advance(2.5)
    check('Death cancels the remaining scenario burst', guns.current === null && counts.flash === burstShots && player.current.getClip() === ctx.clips.dieBody)
    return { passed: true, checks: results.length, results }
  } finally {
    guns.unequip()
    if (original.name) {
      guns.equip(original.name)
      if (original.stance === 'aim') guns.aim()
      else if (original.stance === 'hip') guns.hip()
      if (original.automatic && guns.canAuto) guns.toggleAuto()
    }
    player.update(0); gunsModule.update(0, ctx)
    player.fade = original.fade; player.setSpeed(original.speed)
  }
})()
