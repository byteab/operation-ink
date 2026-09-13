// Run in a freshly loaded development /lab.html page:
// agent-browser eval --stdin < scripts/capture-lab-guns.js
// agent-browser screenshot /tmp/gun-poses.png --full
// Optional: set window.__gunCaptureOptions before evaluating this file.
// Reload the page to dismiss the contact sheet.
(async () => {
  const ctx = window.__lab
  if (!ctx) throw new Error('Open the development character lab first.')
  const resources = performance.getEntriesByType('resource')
  const loaded = path => resources.find(entry => new URL(entry.name).pathname === path)?.name ?? path
  const THREE = await import(loaded('/node_modules/.vite/deps/three.js'))
  const module = await import(loaded('/src/lab/weapons/guns.ts'))
  if (module.clips.gun_aim2 !== ctx.clips.gun_aim2) throw new Error('Reload the page before capturing after a source edit.')
  const options = window.__gunCaptureOptions ?? {}
  const mode = options.mode ?? 'stances'
  const view = options.view ?? 'three'
  const names = options.names ?? ctx.weapons.guns.names
  const samples = mode === 'stances' ? ['down', 'aim', 'hip'] : options.times ?? [0.35, 0.7, 1.5]
  const guns = ctx.weapons.guns
  const player = ctx.player
  const original = {
    speed: player.mixer.timeScale, fade: player.fade,
    weapon: guns.current?.userData.name, stance: guns.stance,
    automatic: guns.automatic, clip: player.current?.getClip(),
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  const width = 400, height = 360, caption = 30
  renderer.setSize(width, height)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.05, 100)
  const positions = { front: [0, 1.3, 3.2], side: [3.2, 1.3, 0], three: [-2.4, 1.4, 2.4], back: [2.4, 1.4, -2.4] }
  camera.position.set(...(positions[view] ?? positions.three))
  camera.lookAt(0, 0.94, 0.1)
  const sheet = document.createElement('canvas')
  sheet.width = samples.length * width
  sheet.height = names.length * (height + caption)
  const context = sheet.getContext('2d')
  context.fillStyle = '#edf0eb'
  context.fillRect(0, 0, sheet.width, sheet.height)
  const step = async dt => {
    player.setSpeed(1)
    try { player.update(dt); module.update(dt, ctx) }
    finally { player.setSpeed(0) }
    for (let i = 0; i < 8; i++) await Promise.resolve()
  }
  const advance = async seconds => {
    const count = Math.max(1, Math.ceil(seconds * 60))
    for (let i = 0; i < count; i++) await step(seconds / count)
  }
  try {
    player.setSpeed(0)
    player.fade = 0
    for (const [row, name] of names.entries()) {
      for (const [column, sample] of samples.entries()) {
        guns.equip(name)
        guns.aim()
        await advance(0.3)
        if (mode === 'stances') {
          if (sample === 'down') guns.lower()
          else if (sample === 'hip') guns.hip()
          await advance(0.3)
        } else {
          if (options.stance === 'hip') { guns.hip(); await step(0) }
          if (mode === 'reload') guns.reload()
          else if (mode === 'fire') guns.fire()
          else if (mode === 'auto') guns.toggleAuto()
          else throw new Error(`Unknown capture mode: ${mode}`)
          await advance(sample)
        }
        // Completion promises may start a new clip after the last sampled frame.
        // Evaluate it before drawing, as the next browser render would.
        await step(0)
        renderer.render(ctx.scene, camera)
        const x = column * width, y = row * (height + caption)
        context.drawImage(renderer.domElement, x, y + caption)
        context.fillStyle = '#192929'
        context.font = '17px sans-serif'
        context.fillText(`${name} / ${mode} ${sample} / ${view}`, x + 12, y + 22)
      }
    }
    document.querySelector('#gun-contact-sheet')?.remove()
    sheet.id = 'gun-contact-sheet'
    sheet.style.cssText = 'position:absolute;left:0;top:0;z-index:99999;pointer-events:none'
    document.body.append(sheet)
    document.body.style.overflow = 'auto'
    window.scrollTo(0, 0)
    return { mode, view, weapons: names.length, samples: samples.length, width: sheet.width, height: sheet.height }
  } finally {
    guns.unequip()
    if (original.weapon) {
      guns.equip(original.weapon)
      if (original.stance === 'aim') guns.aim()
      else if (original.stance === 'hip') guns.hip()
      if (original.automatic) guns.toggleAuto()
    } else if (original.clip) player.play(original.clip, { fade: 0 })
    player.update(0)
    module.update(0, ctx)
    player.fade = original.fade
    player.setSpeed(original.speed)
    renderer.dispose()
  }
})()
