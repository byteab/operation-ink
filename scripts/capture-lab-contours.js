// Evaluate in a freshly loaded lab. Optional window.__contourCapture =
// { view: 'front' | 'three', label: 'Before', framing: 'full', poses: [['idle', 0]] }.
(async () => {
  const ctx = window.__lab
  const loaded = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const T = await import(loaded('/node_modules/.vite/deps/three.js'))
  const { setOutlineResolution } = await import(loaded('/src/lab/rig.ts'))
  const options = window.__contourCapture ?? {}, view = options.view ?? 'front'
  const full = options.framing === 'full'
  const width = full ? 400 : 320, height = full ? 800 : 540, caption = 30
  const renderer = new T.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height); renderer.outputColorSpace = T.SRGBColorSpace
  const camera = full ? new T.OrthographicCamera(-0.5, 0.5, 1, -1, 0.01, 20)
    : new T.OrthographicCamera(-0.32, 0.32, 0.54, -0.54, 0.01, 20)
  camera.position.set(...(view === 'front' ? [0, 0.95, 4] : [2.5, 0.95, 3.2]))
  camera.lookAt(0, 0.95, 0)
  const sheet = document.createElement('canvas'), drawing = sheet.getContext('2d')
  const poses = options.poses ?? [['idle', 0], ['walk', 0.18], ['run', 0.1], ['gun_aim2', 0]]
  sheet.width = width * poses.length; sheet.height = height + caption
  ctx.weapons.guns.unequip(); ctx.player.stop(0); ctx.player.mixer.stopAllAction(); ctx.rig.resetPose(); ctx.player.setSpeed(0)
  setOutlineResolution(width, height)
  for (const [column, [name, time]] of poses.entries()) {
    ctx.player.play(ctx.clips[name], { fade: 0 })
    ctx.player.current.time = time; ctx.player.update(0); ctx.rig.root.updateMatrixWorld(true)
    renderer.render(ctx.scene, camera)
    drawing.fillStyle = '#edf0eb'; drawing.fillRect(column * width, 0, width, height + caption)
    drawing.drawImage(renderer.domElement, column * width, caption)
    drawing.fillStyle = '#192929'; drawing.font = '15px sans-serif'
    drawing.fillText(`${options.label ?? ''} ${name} / ${view}`, column * width + 10, 22)
  }
  sheet.id = 'contour-contact-sheet'; sheet.style.cssText = 'position:absolute;left:0;top:0;z-index:99999'
  document.querySelector('#contour-contact-sheet')?.remove(); document.body.append(sheet)
  renderer.dispose()
  return { width: sheet.width, height: sheet.height }
})()
