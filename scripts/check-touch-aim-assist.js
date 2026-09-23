// Fresh dev mission via npx agent-browser eval --stdin. Stages a stationary
// guard in a clear firing lane and synthetic touch events with a capture shim.
// Exercises real animated hit volumes, collision, runtime and weapons. Reload afterwards.
(async () => {
  const { mission: m, player: p, camera: cameras } = window.__environment
  if (!m?.ready) throw new Error('Wait for mission.ready')
  const camera = cameras.perspective, results = []
  const check = (ok, label, details) => { if (!ok) throw new Error(label + (details ? `: ${JSON.stringify(details)}` : '')); results.push(label) }
  const original = { ai: m.ai.update, capture: Element.prototype.setPointerCapture,
    hasCapture: Element.prototype.hasPointerCapture, release: Element.prototype.releasePointerCapture }
  const look = document.querySelector('.touch-look-pad')
  const box = look.getBoundingClientRect()
  let at = { x: box.x + box.width / 2, y: box.y + 12 }
  const pointer = (type, point = at, element = look) => element.dispatchEvent(new PointerEvent(type, {
    pointerId: 71, pointerType: 'touch', clientX: point.x, clientY: point.y,
    button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, bubbles: true, cancelable: true,
  }))
  const draw = (frames = 1) => {
    for (let i = 0; i < frames; i++) { m.update(1 / 60); m.finishFrame() }
  }
  try {
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    m.ai.update = () => {}; m.invincible = true
    const setting = document.querySelector('#mission-touch')
    setting.checked = true; setting.dispatchEvent(new Event('change'))
    p.requestControl(); draw(2)
    const target = m.ai.enemies[0]
    for (const enemy of m.ai.enemies) { enemy.state = 'reserve'; enemy.actor.root.visible = false }
    target.state = 'guard'; target.health = 100; target.actor.root.visible = true
    const bodyPoint = bone => {
      const volume = target.actor.hitVolumes.volumes().find(v => v.bone === bone)
      return volume.a.clone().lerp(volume.b, 0.5)
    }
    let lane = false
    for (const [x, z] of [[0, -8], [-8, 0], [0, 8], [8, 0]]) {
      const feet = target.position.clone(); feet.x += x; feet.z += z
      const floor = p.world.floor(feet, 2, 4)
      if (!Number.isFinite(floor)) continue
      feet.y = floor + 0.01
      p.body.teleport(feet); p.actions.syncCamera(camera)
      if (p.world.visible(camera.position, bodyPoint('head'), target.actor.root) &&
        p.world.visible(camera.position, bodyPoint('chest'), target.actor.root)) { lane = true; break }
    }
    check(lane, 'Fixture has a real unobstructed lane to the animated enemy')
    m.weapons.switchSlot(0); draw(30)
    const bounds = look.getBoundingClientRect()
    at = { x: bounds.x + bounds.width / 2, y: bounds.y + 12 }
    const offsetAim = bone => {
      m.touch.reset(); m.aimAssist.reset()
      const targetPoint = bodyPoint(bone)
      camera.lookAt(targetPoint)
      // Torso/limb centers are close together on the real thin rig; keep the
      // initial offset within this part's neighborhood rather than over an arm.
      p.lookBy(bone === 'head' ? 9 : 2, 0)
      return targetPoint
    }
    const error = point => camera.getWorldDirection(point.clone().set(0, 0, 0)).angleTo(point.clone().sub(camera.position))
    for (const bone of ['head', 'chest', 'thigh.L']) {
      const point = offsetAim(bone), before = error(point)
      pointer('pointerdown'); draw(40)
      check(error(point) < before * 0.05, `Held touch aiming converges on the animated ${bone}`,
        { before, after: error(point), selected: m.aimAssist.locked?.bone })
      check(m.aimAssist.locked?.bone === bone, `${bone} remains selected without being forced to another body part`)
      pointer('pointerup'); draw()
      check(m.aimAssist.locked === null && m.touch.aimAssistStrength === null, 'Lifting the thumb clears attraction')
    }
    const point = offsetAim('head'), idleView = camera.quaternion.clone()
    draw(20)
    check(idleView.angleTo(camera.quaternion) < 1e-7, 'Touch mode alone does not rotate the camera without the aiming thumb')
    pointer('pointerdown')
    pointer('pointermove', { x: at.x + bounds.width, y: at.y })
    const beforeTurn = camera.quaternion.clone(); p.update(1 / 60)
    const afterTurn = camera.quaternion.clone(); draw()
    check(beforeTurn.angleTo(afterTurn) > 0.01 && afterTurn.angleTo(camera.quaternion) < 1e-7 && m.aimAssist.locked === null,
      'Full stick deflection turns away without the magnet fighting input')
    pointer('pointercancel')
    check(m.touch.aimAssistStrength === null, 'Pointer cancellation releases aim assist')
    offsetAim('head'); pointer('pointerdown'); draw()
    p.pause()
    check(m.aimAssist.locked === null && m.touch.aimAssistStrength === null, 'Pause clears the lock and touch gesture')
    p.requestControl(); draw(2)
    offsetAim('head'); pointer('pointerdown'); draw()
    m.weapons.current.magazine--
    check(m.weapons.reload(), 'Fixture reload starts')
    const reloadView = camera.quaternion.clone(); draw(10)
    check(reloadView.angleTo(camera.quaternion) < 1e-7 && m.aimAssist.locked === null, 'Reload disables camera attraction')
    pointer('pointercancel'); draw(150)
    offsetAim('head'); pointer('pointerdown')
    p.touchMode = false
    const desktop = camera.quaternion.clone(); draw(20)
    check(desktop.angleTo(camera.quaternion) < 1e-7 && m.aimAssist.locked === null, 'Mouse mode never receives touch aim assistance')
    p.touchMode = true; draw(2)
    offsetAim('head'); pointer('pointerdown'); draw()
    target.health = 0
    const deadView = camera.quaternion.clone(); draw(20)
    check(deadView.angleTo(camera.quaternion) < 1e-7 && m.aimAssist.locked === null, 'A dead target releases immediately')
    target.health = 100
    offsetAim('head'); pointer('pointerdown'); draw(40); pointer('pointerup')
    const health = target.health, fire = document.querySelector('[data-touch="fire"]'), shots = m.state.shots
    pointer('pointerdown', at, fire); draw(); pointer('pointerup', at, fire)
    check(m.state.shots === shots + 1 && target.health < health, 'The assisted crosshair hits through the ordinary weapon and damage path')
    offsetAim('head'); pointer('pointerdown'); draw()
    m.restart()
    check(m.aimAssist.locked === null && m.touch.aimAssistStrength === null, 'Restart clears the target and held touch')
    check(point.distanceTo(camera.position) > 0, 'Camera remains finite after reset')
    return { passed: results.length, results }
  } finally {
    Element.prototype.setPointerCapture = original.capture
    Element.prototype.hasPointerCapture = original.hasCapture
    Element.prototype.releasePointerCapture = original.release
    m.ai.update = original.ai; m.invincible = false
    p.pause(); m.restart()
  }
})()
