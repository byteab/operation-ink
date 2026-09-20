// Run in an existing Vite development mission with agent-browser eval --stdin.
// The gallery uses a separate renderer/scene and never changes the mission.
// window.__gunDistanceVisual.hide()/show()/remove() controls the contact sheet.
// Optional window.__gunDistanceVisualOptions = { names: ['ak', 'smg'], pixelRatio: 2 }.
(async () => {
  if (!window.__environment) throw new Error('Open the development game page first.')
  window.__gunDistanceVisual?.remove()
  const loaded = path => performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === path)?.name ?? path
  const T = await import(loaded('/node_modules/.vite/deps/three.js'))
  const { createMissionGun } = await import(loaded('/src/game/weapon-models.ts'))
  const { disposeGun } = await import(loaded('/src/lab/weapons/models.ts'))
  const { penDistanceGLSL } = await import(loaded('/src/render/ballpoint.ts'))
  const options = window.__gunDistanceVisualOptions ?? {}
  const names = options.names ?? ['ak', 'smg']
  const distances = [2, 12, 20, 40]
  const width = 1280, height = 720, fov = 75
  const pixelRatio = options.pixelRatio ?? window.__environment.renderer.getPixelRatio()
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(width, height, false)
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.NoToneMapping
  const shaderErrors = []
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => shaderErrors.push({
    program: gl.getProgramInfoLog(program), vertex: gl.getShaderInfoLog(vertex), fragment: gl.getShaderInfoLog(fragment),
  })
  const scene = new T.Scene()
  scene.background = new T.Color(0xffffff)
  const camera = new T.PerspectiveCamera(fov, width / height, 0.05, 100)
  const cellWidth = 292, cellHeight = 520, header = 72, weaponHeader = 28
  const sheetWidth = cellWidth * distances.length
  const sheetHeight = header + names.length * (cellHeight + weaponHeader)
  const sheet = document.createElement('canvas')
  sheet.id = 'gun-distance-contact-sheet'
  sheet.width = Math.ceil(sheetWidth * pixelRatio)
  sheet.height = Math.ceil(sheetHeight * pixelRatio)
  sheet.style.cssText = `display:block;width:${sheetWidth}px;height:${sheetHeight}px`
  const g = sheet.getContext('2d')
  g.scale(pixelRatio, pixelRatio)
  g.fillStyle = '#fff'; g.fillRect(0, 0, sheetWidth, sheetHeight)
  const label = (text, x, y, size = 13, color = '#333') => {
    g.fillStyle = color; g.font = `${size}px system-ui,sans-serif`; g.fillText(text, x, y)
  }
  label('Gun distance · previous scenery taper / new weapon taper', 16, 27, 20, '#111')
  label(`${width} × ${height} CSS viewport · ${fov}° FOV · DPR ${pixelRatio} · actual metre distances · unchanged model scale`, 16, 49)
  label('Top: native-size crops. Bottom: identical center crops enlarged 8× with nearest-neighbor pixels.', 16, 66, 12)
  const temporary = document.createElement('canvas')
  temporary.width = renderer.domElement.width; temporary.height = renderer.domElement.height
  const pixels = temporary.getContext('2d', { willReadFrequently: true })
  const samples = [], controls = [], geometryOwners = [], cloneOwners = []
  const distanceFunction = /float penDistanceScale\(float viewDepth\)\s*\{[^}]+\}/

  // All materials are isolated. In particular, original onBeforeRender callbacks
  // capture the shared game material, so replace those instead of invoking them.
  function isolate(gun, variant) {
    const materials = new Map(), bindings = new Map()
    gun.traverse(object => {
      if (!object.isMesh) return
      const source = object.material
      let material = materials.get(source)
      if (!material) {
        material = source.clone()
        material.onBeforeCompile = function (shader, activeRenderer) {
          source.onBeforeCompile.call(source, shader, activeRenderer)
          if (variant === 'old' && source.isShaderMaterial) {
            if (!distanceFunction.test(shader.vertexShader)) throw new Error('Missing gun distance function')
            shader.vertexShader = shader.vertexShader.replace(distanceFunction, penDistanceGLSL.trim())
          }
        }
        // Cloning a ShaderMaterial copies its shader strings but not its hooks.
        // The hook above replaces the taper for edges and hulls alike.
        material.customProgramCacheKey = () => `${source.customProgramCacheKey()}|distance-gallery:${variant}`
        materials.set(source, material)
        cloneOwners.push(material)
      }
      bindings.set(object, material)
      object.onBeforeRender = (_renderer, _scene, _camera, _geometry, activeMaterial) => {
        if (activeMaterial.uniforms?.resolution) {
          activeMaterial.uniforms.resolution.value.set(width, height)
          activeMaterial.uniformsNeedUpdate = true
        }
      }
    })
    return bindings
  }

  function capture(gun, bindings, center, distance) {
    for (const [object, material] of bindings) object.material = material
    scene.clear(); scene.add(gun)
    camera.position.copy(center).add(new T.Vector3(distance, 0, 0))
    camera.lookAt(center); camera.updateMatrixWorld(true)
    renderer.render(scene, camera)
    pixels.drawImage(renderer.domElement, 0, 0)
    const snapshot = document.createElement('canvas')
    snapshot.width = temporary.width; snapshot.height = temporary.height
    snapshot.getContext('2d').drawImage(temporary, 0, 0)
    const data = pixels.getImageData(0, 0, temporary.width, temporary.height).data
    let inkMass = 0, darkPixels = 0
    for (let i = 0; i < data.length; i += 4) {
      inkMass += 1 - data[i] / 255
      if (data[i] < 240) darkPixels++
    }
    return { snapshot, inkMass, darkPixels, data }
  }

  function difference(a, b) {
    let absoluteInkDifference = 0, changedPixels = 0, footprintDifference = 0
    for (let i = 0; i < a.data.length; i += 4) {
      absoluteInkDifference += Math.abs(a.data[i] - b.data[i]) / 255
      if (a.data[i] !== b.data[i]) changedPixels++
      if ((a.data[i] < 240) !== (b.data[i] < 240)) footprintDifference++
    }
    return { relativeInkDifference: absoluteInkDifference / a.inkMass, changedPixels, footprintDifference,
      relativeFootprintDifference: footprintDifference / a.darkPixels,
      footprintAreaRatio: b.darkPixels / a.darkPixels }
  }

  function drawCrop(snapshot, x, y, cropWidth, cropHeight, scale) {
    const sx = Math.round((width / 2 - cropWidth / 2) * pixelRatio)
    const sy = Math.round((height / 2 - cropHeight / 2) * pixelRatio)
    const sw = Math.round(cropWidth * pixelRatio), sh = Math.round(cropHeight * pixelRatio)
    g.imageSmoothingEnabled = false
    g.drawImage(snapshot, sx, sy, sw, sh, x + (cellWidth - cropWidth * scale) / 2, y, cropWidth * scale, cropHeight * scale)
  }
  try {
    for (const [row, name] of names.entries()) {
      const gun = createMissionGun(name)
      geometryOwners.push(gun)
      const previous = isolate(gun, 'old')
      const current = isolate(gun, 'new')
      if (!(gun instanceof T.Group)) throw new Error('Three.js instance mismatch; reload the page after source edits')
      const center = new T.Box3().setFromObject(gun).getCenter(new T.Vector3())
      // One physical object/geometry is used for both variants. Repeated identical
      // draws and a wholly-near 1m comparison expose raster/draw-order artifacts.
      const oldNear = capture(gun, previous, center, 1)
      const newNear = capture(gun, current, center, 1)
      const oldRepeat = capture(gun, previous, center, 1)
      const newRepeat = capture(gun, current, center, 1)
      const control = { weapon: name, fullWeightAt1m: difference(oldNear, newNear),
        repeatedPrevious: difference(oldNear, oldRepeat), repeatedNew: difference(newNear, newRepeat) }
      controls.push({ ...control, passed: [control.fullWeightAt1m, control.repeatedPrevious, control.repeatedNew]
        .every(diff => diff.relativeFootprintDifference < 0.01 && Math.abs(diff.footprintAreaRatio - 1) < 0.01) })
      const rowY = header + row * (cellHeight + weaponHeader)
      label(name.toUpperCase(), 12, rowY + 21, 18, '#111')
      for (const [column, distance] of distances.entries()) {
        const x = column * cellWidth, y = rowY + weaponHeader
        const old = capture(gun, previous, center, distance)
        const updated = capture(gun, current, center, distance)
        const ratio = updated.inkMass / old.inkMass
        const delta = difference(old, updated)
        // Repeated identical alpha-to-coverage renders have measured ~1% pigment
        // variation but stable native pixel coverage. Near-view preservation is
        // therefore checked spatially (area AND footprint XOR), not by pigment.
        // Keep pigment as evidence and use its large reduction at far distances.
        const changed = distance === 2
          ? Math.abs(delta.footprintAreaRatio - 1) < 0.01 && delta.relativeFootprintDifference < 0.01
          : ratio < 0.9
        samples.push({ weapon: name, distance, previousInkMass: old.inkMass, currentInkMass: updated.inkMass,
          inkRatio: ratio, previousDarkPixels: old.darkPixels, currentDarkPixels: updated.darkPixels,
          pixelDifference: delta, passed: changed })
        g.strokeStyle = '#dedede'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, cellWidth - 1, cellHeight - 1)
        label(`${distance} m · side view`, x + 12, y + 23, 16, '#111')
        label('Previous · native 1×', x + 12, y + 45, 12)
        drawCrop(old.snapshot, x, y + 52, 270, 96, 1)
        label('New · native 1×', x + 12, y + 164, 12)
        drawCrop(updated.snapshot, x, y + 171, 270, 96, 1)
        label('Previous · center detail 8×', x + 12, y + 286, 12)
        drawCrop(old.snapshot, x, y + 294, 32, 11, 8)
        label('New · same center detail 8×', x + 12, y + 401, 12)
        drawCrop(updated.snapshot, x, y + 409, 32, 11, 8)
        label(`Rendered ink: ${(ratio * 100).toFixed(1)}% of previous`, x + 12, y + 513, 11)
      }
    }
    const report = { passed: shaderErrors.length === 0 && samples.every(sample => sample.passed) && controls.every(control => control.passed),
      nativeViewport: [width, height], fov, pixelRatio, shaderErrors, compiledPrograms: renderer.info.programs.length,
      source: 'createMissionGun: same factory used by held guards, dropped pickups and FPS weapons',
      baseline: 'Isolated cloned material sets on the same gun object/geometry; unchanged scenery taper versus weapon taper',
      criteria: 'Near views: <1% native dark-pixel area change AND <1% footprint XOR. Far views: >10% pigment reduction. All 1m and identical-repeat footprint controls must also pass.',
      pigmentNote: 'Identical GPU renders showed about 1% pigment variation with stable pixel coverage; pigment sums remain diagnostic for near views. This does not establish which GPU raster stage causes the variation.',
      sheet: { width: sheetWidth, height: sheetHeight, id: sheet.id }, controls, samples }
    const overlay = document.createElement('div')
    overlay.id = 'gun-distance-visual'
    overlay.style.cssText = `position:absolute;left:0;top:0;z-index:2147483646;background:#fff;width:${sheetWidth}px`
    overlay.append(sheet)
    const priorBodyOverflow = document.body.style.overflow, priorRootOverflow = document.documentElement.style.overflow
    const previousScroll = [window.scrollX, window.scrollY]
    const hide = () => {
      overlay.remove(); document.body.style.overflow = priorBodyOverflow
      document.documentElement.style.overflow = priorRootOverflow; window.scrollTo(...previousScroll)
    }
    const show = () => {
      document.body.append(overlay); document.body.style.overflow = 'auto'
      document.documentElement.style.overflow = 'auto'; window.scrollTo(0, 0)
    }
    window.__gunDistanceVisual = { report, canvas: sheet, show, hide,
      remove() { hide(); delete window.__gunDistanceVisual } }
    show()
    return report
  } finally {
    scene.clear()
    geometryOwners.forEach(disposeGun)
    cloneOwners.forEach(material => material.dispose())
    renderer.dispose()
  }
})()
