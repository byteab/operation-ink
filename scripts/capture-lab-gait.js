// agent-browser eval --stdin < scripts/capture-lab-gait.js
// Optional window.__gaitCapture = { label: 'Before', view: 'front' | 'side' | 'three' }.
// Reload to dismiss the contact sheet. Samples the actual skinned lab model.
(async () => {
  const ctx = window.__lab
  if (!ctx) throw new Error('Open /lab.html first')
  const loaded = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const T = await import(loaded('/node_modules/.vite/deps/three.js'))
  const { setOutlineResolution } = await import(loaded('/src/lab/rig.ts'))
  const options = window.__gaitCapture ?? {}, view = options.view ?? 'front'
  const renderer = new T.WebGLRenderer({ antialias: true })
  const width = 260, height = 360, caption = 32
  renderer.setSize(width, height)
  renderer.outputColorSpace = T.SRGBColorSpace
  const camera = new T.PerspectiveCamera(35, width / height, 0.05, 100)
  camera.position.set(...({ front: [0, 0.95, 3.3], side: [3.3, 0.95, 0], three: [2.3, 1.1, 2.3] }[view]))
  camera.lookAt(0, 0.86, 0)
  const sheet = document.createElement('canvas'), context = sheet.getContext('2d')
  const phases = [0, 0.125, 0.25, 0.375, 0.5], names = ['walk', 'run']
  sheet.width = width * phases.length; sheet.height = (height + caption) * names.length
  const player = ctx.player, original = { clip: player.current?.getClip(), speed: player.mixer.timeScale }
  try {
    player.setSpeed(0)
    ctx.weapons.guns.unequip()
    player.stop(0)
    player.mixer.stopAllAction()
    ctx.rig.resetPose()
    setOutlineResolution(width, height)
    for (const [row, name] of names.entries()) {
      for (const [col, phase] of phases.entries()) {
        void player.play(ctx.clips[name], { fade: 0 })
        player.current.time = ctx.clips[name].duration * phase
        player.update(0)
        ctx.rig.root.updateMatrixWorld(true)
        renderer.render(ctx.scene, camera)
        const x = col * width, y = row * (height + caption)
        context.fillStyle = '#edf0eb'; context.fillRect(x, y, width, height + caption)
        context.drawImage(renderer.domElement, x, y + caption)
        context.fillStyle = '#192929'; context.font = '14px sans-serif'
        context.fillText(`${options.label ?? ''} ${name} ${Math.round(phase * 100)}% · ${view}`, x + 8, y + 22)
      }
    }
    document.querySelector('#gait-contact-sheet')?.remove()
    sheet.id = 'gait-contact-sheet'
    sheet.style.cssText = 'position:absolute;left:0;top:0;z-index:99999;pointer-events:none'
    document.body.append(sheet)
    document.body.style.overflow = 'auto'
    window.scrollTo(0, 0)
    return { view, width: sheet.width, height: sheet.height }
  } finally {
    if (original.clip) void player.play(original.clip, { fade: 0 })
    player.update(0); player.setSpeed(original.speed)
    const canvas = document.querySelector('#lab')
    setOutlineResolution(canvas.clientWidth, canvas.clientHeight)
    renderer.dispose()
  }
})()
