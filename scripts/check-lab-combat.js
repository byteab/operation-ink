// Run on a freshly loaded /lab.html with agent-browser eval --stdin.
(async () => {
  const ctx = window.__lab, player = ctx.player, guns = ctx.weapons.guns
  const resource = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const T = await import(resource('/node_modules/.vite/deps/three.js'))
  const { updaters } = await import(resource('/src/lab/registry.ts'))
  const damage = await import(resource('/src/lab/clips/damage.ts'))
  const results = [], metrics = []
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const check = async (name, fn) => {
    try { await fn(); results.push({ name, passed: true }) }
    catch (e) { results.push({ name, passed: false, error: String(e.message) }) }
  }
  const step = async (dt = 1 / 120, speed = 1) => {
    player.setSpeed(speed); player.update(dt); for (const update of updaters) update(dt, ctx); player.setSpeed(0)
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }
  const advance = async seconds => { for (let i = 0, n = Math.ceil(seconds * 120); i < n; i++) await step(seconds / n) }
  const height = () => ctx.rig.bones.hips.position.y
  const point = bone => ctx.rig.bones[bone].getWorldPosition(new T.Vector3())
  const gripError = () => {
    const gun = guns.current
    const anchor = gun.userData.support.clone()
    if (gun.userData.parts.pump) anchor.z += gun.userData.parts.pump.position.z - 0.26
    return ctx.rig.bones['hand.L'].localToWorld(new T.Vector3(0, .035, 0)).distanceTo(gun.localToWorld(anchor))
  }
  try {
    player.setSpeed(0); player.fade = .2
    for (const posture of ['stand', 'crouch', 'kneel', 'prone']) for (const name of guns.names) {
      await check(`${posture}/${name}: aimed and hip fire, cycle, reload, grounded pose`, async () => {
        guns.unequip(); player.stop(0); player.mixer.stopAllAction(); ctx.rig.resetPose(); guns.equip(name)
        void guns.posture(posture); await advance(1)
        const hips = height()
        let error = 0
        for (const hold of ['aim', 'hip']) {
          guns[hold](); await advance(.6)
          if (guns.current.userData.twoHanded) error = Math.max(error, gripError())
          const ray = guns.fire()
          assert(ray && ray.origin.y > .1 && Math.abs(ray.direction.y) < .08, `Invalid muzzle ray: ${JSON.stringify(ray)}`)
          for (let i = 0; i < 190; i++) {
            await step()
            assert(Math.abs(height() - hips) < .002, 'Firing/cycling stood up or changed pelvis height')
          }
          assert(!guns.busy && guns.bodyPosture === posture, 'Did not return to the chosen posture')
        }
        guns.aim(); await advance(.6); guns.reload(); await advance(2.8)
        assert(!guns.busy && guns.bodyPosture === posture && Math.abs(height() - hips) < .002, 'Reload lost posture')
        const elbow = Math.min(point('forearm.L').y, point('forearm.R').y)
        const foot = side => ctx.rig.bones[`shin.${side}`].localToWorld(new T.Vector3(0, Math.hypot(.36, .05), 0)).y
        const feet = [foot('L'), foot('R')]
        metrics.push({ posture, name, hips, elbow, feet, supportError: error })
        assert(error < .025, `Support hand separated ${error.toFixed(3)}m`)
        if (posture === 'prone') assert(elbow > .045, `Prone elbow is below ground: ${elbow}`)
        assert(Math.min(...feet) > .035, `Foot penetrates ground: ${feet}`)
      })
    }
    for (const reaction of ['curious', 'prone', 'kneel']) await check(`Near miss ${reaction}: settles, shoots, pauses, interrupts`, async () => {
      guns.unequip(); guns.equip('ak'); void guns.nearMiss(reaction); await advance(.1)
      const t = player.current.time; await step(2, 0)
      assert(player.current.time === t, 'Pause advanced reaction')
      guns.fire(); await advance(2.8)
      assert(!guns.busy && !guns.changingPosture && guns.bodyPosture === (reaction === 'curious' ? 'crouch' : reaction), 'Queued fire lost stance')
      void guns.nearMiss(reaction); await advance(.08); player.play(ctx.clips.walk); await advance(2.8)
      assert(player.current.getClip() === ctx.clips.walk && guns.bodyPosture === 'stand', 'Interrupted reaction resumed')
    })
    for (const posture of ['kneel', 'prone']) for (const name of guns.names) await check(`${posture}/${name}: queued fire emits once after planting and keeps the low stance`, async () => {
      guns.unequip(); player.stop(0); player.mixer.stopAllAction(); ctx.rig.resetPose(); guns.equip(name)
      await advance(2.2)
      void guns.posture(posture); await advance(.08)
      const effects = ctx.scene.getObjectByName('gun effects'), shots = new Set()
      assert(guns.fire() === null && guns.changingPosture, 'Fire interrupted the posture transition')
      await step(1, 0)
      assert(!effects.children.some(object => object.isLine), 'Paused drop emitted a shot')
      let plantedHeight = null
      for (let frame = 0; frame < 480; frame++) {
        await step()
        for (const object of effects.children) if (object.isLine) {
          assert(!guns.changingPosture, 'Shot emitted before the character planted')
          shots.add(object.uuid)
        }
        if (!guns.changingPosture) {
          plantedHeight ??= height()
          assert(Math.abs(height() - plantedHeight) < .002, 'Queued shot or weapon cycle stood the character up')
        }
      }
      assert(shots.size === 1, `Expected one queued shot, observed ${shots.size}`)
      assert(guns.bodyPosture === posture && guns.readyToFire, 'Queued shot did not restore the low firing stance')
    })
    for (const posture of ['crouch', 'kneel', 'prone']) await check(`${posture}: automatic fire and death interruption`, async () => {
      guns.unequip(); guns.equip('ak'); void guns.posture(posture); await advance(1)
      guns.toggleAuto(); await advance(.8)
      assert(guns.automatic && guns.bodyPosture === posture, 'Automatic fire lost posture')
      damage.hitShotgun(ctx); await advance(.4)
      assert(!guns.current && !guns.automatic && player.current.getClip() === ctx.clips.dieShotgun, 'Death did not cancel shooting')
    })
    await check('Commands during a drop queue and sniper interruptions remount correctly', async () => {
      for (const command of ['reload', 'toggleAuto']) {
        guns.unequip(); guns.equip('ak'); void guns.nearMiss('prone'); await advance(.1); guns[command](); await advance(3)
        assert(!guns.changingPosture && guns.bodyPosture === 'prone', `${command} left a stale transition`)
        assert(command === 'reload' ? !guns.busy : guns.automatic, `${command} did not finish/start after the drop`)
      }
      guns.unequip(); guns.equip('sniper'); void guns.posture('kneel'); await advance(1); guns.fire(); await advance(.35)
      guns.aim(); await advance(.7)
      assert(guns.current.parent === ctx.rig.bones['hand.R'] && !guns.busy && guns.readyToFire, 'Interrupted bolt left rifle in support hand')
      void guns.posture('prone'); await advance(1); guns.equip('shotgun'); await advance(.5)
      assert(guns.bodyPosture === 'prone' && height() < .15, 'Weapon switch stood up')
      void guns.posture('stand'); await advance(.1); player.stop(0); await step(); guns.fire(); await advance(1.3)
      assert(!guns.changingPosture && !guns.busy, 'Stop left a stale queued reaction')
      void guns.posture('stand'); await advance(1)
      assert(guns.bodyPosture === 'stand' && height() > .8 && guns.readyToFire, 'Stand did not restore normal firing')
    })
    await check('Shotgun: airborne feet, travel, blood, pause, landing, interruption', async () => {
      guns.unequip(); player.stop(0); player.mixer.stopAllAction(); ctx.rig.resetPose(); guns.equip('ak'); ctx.fx.blood.clear()
      damage.hitShotgun(ctx); await advance(.32)
      const hips = point('hips'), feet = ['L', 'R'].map(s => ctx.rig.bones[`shin.${s}`].localToWorld(new T.Vector3(0, Math.hypot(.36, .05), 0)))
      assert(hips.y > 1.0 && hips.z < -.7 && feet.every(p => p.y > .4), 'Shotgun lacks airborne recoil')
      const blood = ctx.scene.getObjectByName('blood: droplets')
      assert(blood.count > 100 && blood.count <= 800, `Blood amount ${blood.count}`)
      const t = player.current.time; await step(2, 0); assert(player.current.time === t, 'Shotgun advances while paused')
      await advance(1.3)
      assert(point('hips').y < .2 && point('hips').z < -1.6 && ctx.scene.getObjectByName('blood: decals').count > 0, 'Shotgun did not land')
      guns.equip('ak'); damage.hitShotgun(ctx); await advance(.02); player.play(ctx.clips.idle); ctx.fx.blood.clear(); await advance(1.4)
      assert(ctx.scene.getObjectByName('blood: droplets').count === 0 && ctx.scene.getObjectByName('blood: decals').count === 0, 'Interrupted shotgun emitted delayed blood')
    })
  } finally {
    guns.unequip(); ctx.fx.blood.clear(); player.stop(0); player.mixer.stopAllAction(); ctx.rig.resetPose(); player.play(ctx.clips.idle); player.setSpeed(1)
  }
  return { passed: results.every(r => r.passed), results, metrics }
})()
