// Run with agent-browser eval --stdin on /lab.html. Reload to remove the sheet.
(async () => {
  const ctx = window.__lab, player = ctx.player
  const resource = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const T = await import(resource('/node_modules/.vite/deps/three.js'))
  const { setOutlineResolution } = await import(resource('/src/lab/rig.ts'))
  ctx.weapons.guns.unequip(); ctx.fx.blood.clear(); player.setSpeed(0); player.stop(0); player.mixer.stopAllAction(); ctx.rig.resetPose()
  const renderer = new T.WebGLRenderer({ antialias: true })
  renderer.outputColorSpace = T.SRGBColorSpace
  const sheet = document.createElement('canvas'), g = sheet.getContext('2d')
  const sequence = window.deathSequence === true, detail = window.deathDetail === true
  const w = detail ? 720 : sequence ? 330 : 480, h = detail ? 450 : 310, columns = detail ? 2 : sequence ? 5 : 3
  sheet.width = w * columns; sheet.height = h * 2
  const camera = new T.PerspectiveCamera(35, w / (h - 28), 0.05, 100)
  const metrics = []
  const items = detail ? ['dieArm', 'dieArm', 'dieLeg', 'dieLeg'].map(name => ({ name, time: ctx.clips[name].duration }))
    : sequence ? ['dieArm', 'dieLeg'].flatMap(name => [0.4, 0.7, 1.05, 1.4, ctx.clips[name].duration].map(time => ({ name, time })))
    : ['dieHead', 'dieBody', 'dieArm', 'dieLeg', 'dieBack', 'dieShotgun'].map(name => ({ name, time: ctx.clips[name].duration }))
  for (const [index, { name, time }] of items.entries()) {
    player.play(ctx.clips[name], { once: true, fade: 0 }); player.current.time = time; player.update(0); ctx.rig.root.updateMatrixWorld(true)
    const hip = ctx.rig.bones.hips.getWorldPosition(new T.Vector3())
    const head = ctx.rig.bones.head.getWorldPosition(new T.Vector3())
    const center = hip.clone().lerp(head, 0.1); center.y = sequence ? 0.52 : 0.15
    camera.position.copy(center).add(new T.Vector3(name === 'dieArm' ? 0.15 : 2, sequence ? 1.15 : 1.15, name === 'dieArm' ? 3.35 : 2.5))
    if (detail) camera.position.copy(center).add(index % 2 === 0 ? new T.Vector3(name === 'dieArm' ? 0 : 2.3, 0.32, name === 'dieArm' ? 2.7 : 0.5) : new T.Vector3(1, 2.9, 0.8))
    camera.lookAt(center); camera.updateProjectionMatrix()
    renderer.setSize(w, h - 28); setOutlineResolution(w, h - 28); renderer.render(ctx.scene, camera)
    const x = (index % columns) * w, y = Math.floor(index / columns) * h
    g.fillStyle = '#edf0eb'; g.fillRect(x, y, w, h); g.drawImage(renderer.domElement, x, y + 28)
    g.fillStyle = '#192929'; g.font = '16px sans-serif'; g.fillText(`${name} · ${time.toFixed(2)} s`, x + 10, y + 20)
    metrics.push({ name, time, heights: Object.fromEntries(['forearm.L', 'forearm.R', 'hand.L', 'hand.R', 'shin.L', 'shin.R'].map(b => [b, ctx.rig.bones[b].getWorldPosition(new T.Vector3()).y])),
      feet: ['L', 'R'].map(side => ctx.rig.bones[`shin.${side}`].localToWorld(new T.Vector3(0, Math.hypot(.36, .05), 0)).y) })
  }
  document.querySelector('#death-contact-sheet')?.remove(); sheet.id = 'death-contact-sheet'
  sheet.style.cssText = 'position:absolute;left:0;top:0;z-index:99999;pointer-events:none'
  document.body.append(sheet); document.body.style.overflow = 'auto'; window.scrollTo(0, 0)
  renderer.dispose()
  return metrics
})()
