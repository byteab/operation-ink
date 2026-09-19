// Real rAF playback through the lab's buttons. Run in agent-browser after reload.
(async () => {
  const ctx = window.__lab, player = ctx.player, results = []
  const resource = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const T = await import(resource('/node_modules/.vite/deps/three.js'))
  const { setOutlineResolution } = await import(resource('/src/lab/rig.ts'))
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const click = label => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.startsWith(label))
    assert(button, `Missing button: ${label}`); button.click()
  }
  const until = predicate => new Promise((resolve, reject) => {
    const started = performance.now()
    const frame = () => predicate() ? resolve() : performance.now() - started > 8000 ? reject(new Error('Playback timed out')) : requestAnimationFrame(frame)
    requestAnimationFrame(frame)
  })
  const wait = seconds => { const untilTime = performance.now() + seconds * 1000; return until(() => performance.now() >= untilTime) }
  const renderer = new T.WebGLRenderer({ antialias: true })
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.setSize(1280, 720)
  renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:99999;width:100%;height:100%;object-fit:contain;background:#fafbf9'
  document.body.append(renderer.domElement)
  const title = document.createElement('div')
  title.style.cssText = 'position:fixed;top:24px;left:32px;z-index:100000;font:22px sans-serif;color:#23332f'
  document.body.append(title)
  const camera = new T.PerspectiveCamera(35, 1280 / 720, .05, 100)
  let running = true, frames = 0
  const render = () => {
    if (!running) return
    setOutlineResolution(1280, 720); renderer.render(ctx.scene, camera); frames++; requestAnimationFrame(render)
  }
  render()
  const pose = () => Object.values(ctx.rig.bones).map(bone => bone.getWorldPosition(new T.Vector3()))
  try {
    for (const [name, label] of [['dieArm', 'Die: arm'], ['dieLeg', 'Die: leg'], ['dieHead', 'Die: head'], ['dieBody', 'Die: body'], ['dieBack', 'Die: from behind'], ['dieShotgun', 'Shotgun: airborne knockback']]) {
      click('Reset scene'); player.setSpeed(1); await wait(.15)
      title.textContent = `${label.replace('Die: ', '').replace('Shotgun: airborne knockback', 'shotgun')} · normal speed`
      const target = new T.Vector3(0, .56, name === 'dieShotgun' ? -.65 : 0)
      camera.position.copy(target).add(name === 'dieArm' ? new T.Vector3(.2, .5, 3.8) : new T.Vector3(2.8, .55, 2.8)); camera.lookAt(target)
      const startFrames = frames, started = performance.now()
      click(label)
      assert(player.current.getClip().name === name, `${label} selected the wrong clip`)
      await until(() => player.current.time >= player.current.getClip().duration)
      const final = pose(), duration = player.current.getClip().duration
      await wait(.22)
      assert(pose().every((p, i) => p.distanceTo(final[i]) < 1e-6), `${name}: corpse keeps moving`)
      assert(ctx.scene.getObjectByName('blood: decals').count > 0, `${name}: missing death blood`)
      for (const side of ['L', 'R']) {
        const wrist = ctx.rig.bones[`hand.${side}`].getWorldPosition(new T.Vector3())
        const foot = ctx.rig.bones[`shin.${side}`].localToWorld(new T.Vector3(0, Math.hypot(.36, .05), 0))
        assert(wrist.y < .085 && foot.y < .075, `${name}: hand or leg remains raised`)
      }
      results.push({ name, passed: true, duration, renderedFrames: frames - startFrames, wallSeconds: (performance.now() - started) / 1000 })
    }
    click('Reset scene'); player.setSpeed(1); click('Die: leg')
    await until(() => player.current.time > .4)
    player.setSpeed(0); const time = player.current.time, frozen = pose(); title.textContent = 'Pause · the entire collapse freezes'
    await wait(.25)
    assert(player.current.time === time && pose().every((p, i) => p.distanceTo(frozen[i]) < 1e-6), 'Pause did not freeze the collapse')
    player.setSpeed(.5); title.textContent = 'Leg · half speed'
    const start = performance.now(); await wait(.35)
    assert(Math.abs(player.current.time - time - (performance.now() - start) / 2000) < .04, 'Half-speed playback drifted')
    click('Walk'); player.setSpeed(1); ctx.fx.blood.clear(); await wait(.35)
    assert(player.current.getClip().name === 'walk' && ctx.scene.getObjectByName('blood: decals').count === 0, 'Interrupted death resumed or emitted its pool')
    results.push({ name: 'Pause, half speed and interrupted death', passed: true })
    return { passed: true, results }
  } finally {
    running = false; renderer.dispose(); renderer.domElement.remove(); title.remove(); click('Reset scene'); player.setSpeed(1)
  }
})()
