// Run in agent-browser on /lab.html; reload to dismiss the contact sheet.
(async () => {
  const ctx = window.__lab, player = ctx.player, guns = ctx.weapons.guns
  const resource = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const T = await import(resource('/node_modules/.vite/deps/three.js'))
  const { updaters } = await import(resource('/src/lab/registry.ts'))
  const { setOutlineResolution } = await import(resource('/src/lab/rig.ts'))
  const { hitShotgun } = await import(resource('/src/lab/clips/damage.ts'))
  const advance = async seconds => {
    for (let i = 0, n = Math.ceil(seconds * 120); i < n; i++) {
      const dt = seconds / n
      player.setSpeed(1); player.update(dt); for (const update of updaters) update(dt, ctx); player.setSpeed(0)
      for (let j = 0; j < 10; j++) await Promise.resolve()
    }
  }
  const renderer = new T.WebGLRenderer({ antialias: true })
  renderer.outputColorSpace = T.SRGBColorSpace
  const sheet = document.createElement('canvas'), g = sheet.getContext('2d')
  sheet.width = 1440; sheet.height = 1120
  const camera = new T.PerspectiveCamera(35, 1.6, 0.05, 100)
  const draw = (x, y, w, h, label, side = false, blast = false) => {
    renderer.setSize(w, h - 28); setOutlineResolution(w, h - 28)
    camera.aspect = w / (h - 28); camera.position.set(...(side ? [3.4, 1, 0.25] : [2.5, 1.5, 3.1]))
    if (blast) { camera.position.set(5.1, 1.6, 0.1); camera.lookAt(0, 0.65, -0.8) }
    else camera.lookAt(0, 0.76, 0.1)
    camera.updateProjectionMatrix(); ctx.rig.root.updateMatrixWorld(true); renderer.render(ctx.scene, camera)
    g.fillStyle = '#edf0eb'; g.fillRect(x, y, w, h); g.drawImage(renderer.domElement, x, y + 28)
    g.fillStyle = '#192929'; g.font = '15px sans-serif'; g.fillText(label, x + 10, y + 20)
  }
  player.setSpeed(0); ctx.fx.blood.clear(); guns.unequip(); player.stop(0); player.mixer.stopAllAction(); ctx.rig.resetPose(); guns.equip('ak')
  const positions = []
  for (const [col, posture] of ['stand', 'crouch', 'kneel', 'prone'].entries()) {
    void guns.posture(posture); await advance(1)
    for (const [row, side] of [false, true].entries()) draw(col * 360, row * 300, 360, 300, `${posture} · ${side ? 'side' : 'three quarter'}`, side)
    positions.push({ posture, bones: Object.fromEntries(['hips', 'chest', 'head', 'shin.L', 'shin.R', 'forearm.L', 'forearm.R', 'hand.L', 'hand.R'].map(b => [b, ctx.rig.bones[b].getWorldPosition(new T.Vector3()).toArray()])) })
  }
  guns.unequip(); player.stop(0); player.mixer.stopAllAction(); ctx.rig.resetPose(); guns.equip('ak'); hitShotgun(ctx)
  let previous = 0
  for (const [col, time] of [0.05, 0.17, 0.32, 0.5, 0.65, 0.73, 0.82, 1.4].entries()) {
    await advance(time - previous); previous = time
    draw((col % 4) * 360, 600 + Math.floor(col / 4) * 260, 360, 260, `shotgun · ${time.toFixed(2)}s`, true, true)
  }
  document.querySelector('#combat-contact-sheet')?.remove(); sheet.id = 'combat-contact-sheet'
  sheet.style.cssText = 'position:absolute;left:0;top:0;z-index:99999;pointer-events:none'
  document.body.append(sheet); document.body.style.overflow = 'auto'; window.scrollTo(0, 0)
  renderer.dispose()
  return positions
})()
