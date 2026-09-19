// agent-browser eval --stdin < scripts/check-lab-relaxed-look.js
// Optional: window.recordRelaxedLook = true adds a 60 fps WebM (base64) to the result.
(async () => {
  const ctx = window.__lab, player = ctx.player
  const resource = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const T = await import(resource('/node_modules/.vite/deps/three.js'))
  const { setOutlineResolution } = await import(resource('/src/lab/rig.ts'))
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const button = label => [...document.querySelectorAll('#panel button')].find(b => b.textContent === label).click()
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
  const rate = value => {
    const slider = document.querySelector('#panel input[type=range]')
    slider.value = String(value); slider.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const point = name => ctx.rig.bones[name].getWorldPosition(new T.Vector3())
  const foot = side => ctx.rig.bones[`shin.${side}`].localToWorld(new T.Vector3(0, Math.hypot(.36, .05), 0))
  const yaw = name => { const dir = new T.Vector3(0, 0, 1).applyQuaternion(ctx.rig.bones[name].getWorldQuaternion(new T.Quaternion())); return Math.atan2(dir.x, dir.z) * 180 / Math.PI }
  const preview = new T.WebGLRenderer({ antialias: true }); preview.setSize(1280, 720); preview.outputColorSpace = T.SRGBColorSpace
  const canvas = document.createElement('canvas'), g = canvas.getContext('2d'); canvas.width = 1280; canvas.height = 720
  canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;width:100%;height:100%;object-fit:contain;background:#fafbf9'; document.body.append(canvas)
  const camera = new T.PerspectiveCamera(35, 1280 / 720, .05, 100)
  camera.position.set(2.5, 1.3, 3.4); camera.lookAt(0, .86, 0)
  let recording, stream, chunks = []
  if (window.recordRelaxedLook) {
    stream = canvas.captureStream(60)
    recording = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 4000000 })
    recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    recording.start()
  }
  const draw = label => {
    setOutlineResolution(1280, 720); preview.render(ctx.scene, camera); g.drawImage(preview.domElement, 0, 0)
    g.fillStyle = '#23332f'; g.font = '22px sans-serif'; g.fillText(label, 32, 42)
  }
  try {
    ctx.weapons.guns.unequip(); ctx.fx.blood.clear(); rate(1); button('Look around (relaxed)')
    player.update(0); ctx.rig.root.updateMatrixWorld(true)
    const duration = player.current.getClip().duration, start = performance.now()
    const pelvis = point('hips'), feet = [foot('L'), foot('R')]
    let frames = 0, maxPelvisTravel = 0, maxFootTravel = 0, minYaw = Infinity, maxYaw = -Infinity, headStart, chestStart, wraps = 0, previousTime = 0
    while (performance.now() - start < (duration + .4) * 1000) {
      await frame(); frames++
      const time = player.current.time, head = yaw('head'), chest = yaw('chest')
      if (time < previousTime) wraps++; previousTime = time
      maxPelvisTravel = Math.max(maxPelvisTravel, point('hips').distanceTo(pelvis))
      maxFootTravel = Math.max(maxFootTravel, foot('L').distanceTo(feet[0]), foot('R').distanceTo(feet[1]))
      minYaw = Math.min(minYaw, head); maxYaw = Math.max(maxYaw, head)
      if (!wraps && time < 2) {
        if (head > 1) headStart ??= time
        if (chest > 1) chestStart ??= time
      }
      draw('Look around (relaxed) · normal speed')
    }
    assert(maxPelvisTravel < .00001 && maxFootTravel < .00001, 'Look-around still sways the body or slides the feet')
    assert(minYaw < -30 && maxYaw > 30 && wraps === 1, 'Did not play both glances and the loop seam')
    assert(chestStart - headStart > .1, 'Shoulders move at the same time as the head')
    rate(0); const time = player.current.time, head = point('head')
    for (let i = 0; i < 8; i++) { await frame(); draw('Pause') }
    assert(player.current.time === time && point('head').distanceTo(head) < 1e-6, 'Pause drifts')
    rate(.5); const slowStart = performance.now()
    while (performance.now() - slowStart < 450) { await frame(); draw('Look around (relaxed) · half speed') }
    const advanced = (player.current.time - time + duration) % duration
    assert(Math.abs(advanced - (performance.now() - slowStart) / 2000) < .045, 'Half-speed playback changed the timing')
    const result = { passed: true, duration, frames, maxPelvisTravel, maxFootTravel, minYaw, maxYaw, headLeadSeconds: chestStart - headStart, wraps, pause: true, halfSpeed: true }
    if (recording) {
      await new Promise(resolve => { recording.onstop = resolve; recording.stop() })
      const blob = new Blob(chunks, { type: 'video/webm' })
      result.video = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob) })
    }
    return result
  } finally {
    if (recording?.state === 'recording') recording.stop()
    stream?.getTracks().forEach(track => track.stop()); preview.dispose(); canvas.remove(); rate(1)
  }
})()
