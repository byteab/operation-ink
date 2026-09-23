// Fresh dev mission via agent-browser eval --stdin. Uses real sliders, pointer
// handlers and player camera updates. Pointer capture, AI and fallback mouse
// control are staged; settings and collaborators are restored afterward.
(() => {
  const { player: p, mission: m, camera } = window.__environment
  if (!m?.ready) throw new Error('Wait for mission.ready')
  const $ = selector => document.querySelector(selector)
  const visible = selector => !!$(selector).getClientRects().length
  const results = []
  const check = (ok, label) => { if (!ok) throw new Error(label); results.push(label) }
  const original = { settings: { ...p.inputSettings }, storage: localStorage.getItem('stickman.input-sensitivity.v1'),
    ai: m.ai.update, invincible: m.invincible, fallback: p.fallback, touch: p.touchMode,
    capture: Element.prototype.setPointerCapture, hasCapture: Element.prototype.hasPointerCapture, release: Element.prototype.releasePointerCapture }
  const change = (key, percent) => {
    const input = $(`#sensitivity-${key}`)
    input.value = String(percent); input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const invert = (input, enabled) => { const el = $('#invert-' + input); if (el.checked !== enabled) el.click() }
  const showSettings = () => { p.pause(); $('[data-menu-open="settings"]').click() }
  const point = el => { const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
  const pointer = (el, type, at) => el.dispatchEvent(new PointerEvent(type, { pointerId: 5, pointerType: 'touch',
    clientX: at.x, clientY: at.y, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true }))
  const resume = () => { $('#walk-start').click(); m.update(0); m.finishFrame() }
  const look = $('.touch-look-pad'), stick = $('.touch-stick')
  try {
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.releasePointerCapture = () => {}
    m.ai.update = () => {}; m.invincible = true; p.fallback = true
    invert('mouse', false); invert('touch', false)
    m.touch.setEnabled(false); showSettings()
    check(visible('#sensitivity-mouse') && !visible('#sensitivity-move') && !visible('#sensitivity-look'), 'Desktop settings show the mouse slider only')
    const mouseTurn = percent => {
      change('mouse', percent); resume(); p.dragging = true
      const before = camera.perspective.quaternion.clone()
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: 100, movementY: 0, bubbles: true }))
      p.dragging = false
      return before.angleTo(camera.perspective.quaternion)
    }
    const slowMouse = mouseTurn(50), fastMouse = mouseTurn(150)
    check(Math.abs(fastMouse / slowMouse - 3) < 1e-6, 'Mouse sensitivity scales actual mouse camera movement')
    const mouseVector = inverted => {
      invert('mouse', inverted); camera.perspective.quaternion.identity(); p.dragging = true
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: 20, movementY: 40, bubbles: true }))
      p.dragging = false
      return camera.perspective.getWorldDirection(p.forward.clone())
    }
    const mouseNormal = mouseVector(false), mouseInverted = mouseVector(true)
    check(mouseNormal.y < 0 && mouseInverted.y > 0 && Math.abs(mouseNormal.x - mouseInverted.x) < 1e-6, 'Mouse inversion reverses vertical look while preserving horizontal look')
    check(!p.inputSettings.invertTouch, 'Mouse inversion does not change touch inversion')
    showSettings(); $('#mission-touch').click()
    check(!visible('#sensitivity-mouse') && visible('#sensitivity-move') && visible('#sensitivity-look'), 'Touch mode immediately shows the two stick sliders instead')
    check($('#sensitivity-mouse').value === '150', 'Switching input mode preserves the mouse setting')
    change('move', 50); change('look', 100); resume()
    const origin = point(stick), radius = stick.getBoundingClientRect().width * 0.37
    const moveSpeed = percent => {
      change('move', percent)
      pointer(stick, 'pointerdown', origin)
      pointer(stick, 'pointermove', { x: origin.x + radius * 0.55, y: origin.y })
      const speed = p.touchMove.x * (p.touchMove.sprint ? 7.6 : 4.2)
      pointer(stick, 'pointerup', origin)
      return speed
    }
    check(moveSpeed(200) > moveSpeed(50) * 1.5, 'Left sensitivity changes the real movement-stick response')
    for (const value of [50, 200]) {
      change('move', value)
      pointer(stick, 'pointerdown', origin)
      pointer(stick, 'pointermove', { x: origin.x + radius, y: origin.y })
      check(p.touchMove.sprint && Math.abs(p.touchMove.x - 1) < 1e-6, `Left sensitivity at ${value}% still reaches full run`)
      pointer(stick, 'pointerup', origin)
    }
    const lookAt = point(look); lookAt.y -= look.getBoundingClientRect().height / 2 - 16
    const touchTurn = percent => {
      change('look', percent)
      pointer(look, 'pointerdown', lookAt)
      pointer(look, 'pointermove', { x: lookAt.x + 20, y: lookAt.y })
      const before = camera.perspective.quaternion.clone()
      for (let frame = 0; frame < 30; frame++) p.update(1 / 60)
      const angle = before.angleTo(camera.perspective.quaternion)
      pointer(look, 'pointerup', lookAt)
      return angle
    }
    const slowLook = touchTurn(50), fastLook = touchTurn(200)
    check(Math.abs(fastLook / slowLook - 4) < 1e-6, 'Right sensitivity changes held camera turning speed')
    change('mouse', 25)
    check(Math.abs(touchTurn(200) - fastLook) < 1e-6, 'Mouse sensitivity does not multiply touch camera speed')
    change('move', 50)
    check(Math.abs(touchTurn(200) - fastLook) < 1e-6, 'Left-stick sensitivity does not alter the right stick')
    const touchVector = inverted => {
      invert('touch', inverted); change('look', 100); camera.perspective.quaternion.identity()
      pointer(look, 'pointerdown', lookAt)
      pointer(look, 'pointermove', { x: lookAt.x + 12, y: lookAt.y + 12 })
      for (let frame = 0; frame < 10; frame++) p.update(1 / 60)
      pointer(look, 'pointerup', lookAt)
      return camera.perspective.getWorldDirection(p.forward.clone())
    }
    const touchNormal = touchVector(false), touchInverted = touchVector(true)
    check(touchNormal.y < 0 && touchInverted.y > 0 && Math.abs(touchNormal.x - touchInverted.x) < 1e-6, 'Touch inversion reverses held vertical look while preserving horizontal look')
    check(p.inputSettings.invertMouse, 'Touch inversion preserves the independent mouse choice')
    showSettings(); change('mouse', 75); change('move', 150); change('look', 200)
    const saved = JSON.parse(localStorage.getItem('stickman.input-sensitivity.v1'))
    check(saved.mouse === 0.75 && saved.move === 1.5 && saved.look === 2, 'Slider changes save all three independent preferences')
    check(saved.invertMouse && saved.invertTouch, 'Inversion choices are saved alongside sensitivity')
    check($('#sensitivity-move-value').value === '150%' && $('#sensitivity-look-value').value === '200%', 'Sliders display their current percentages')
    m.restart()
    check(p.inputSettings.mouse === 0.75 && p.inputSettings.move === 1.5 && p.inputSettings.look === 2, 'Mission restart preserves input preferences')
    check(p.inputSettings.invertMouse && p.inputSettings.invertTouch, 'Mission restart preserves inversion choices')
    showSettings(); $('#mission-touch').click()
    check(visible('#sensitivity-mouse') && !visible('#sensitivity-look') && $('#sensitivity-mouse').value === '75', 'Returning to desktop restores its independent setting')
    return { passed: results.length, results }
  } finally {
    p.pause(); m.restart()
    for (const key of ['mouse', 'move', 'look']) change(key, original.settings[key] * 100)
    for (const input of ['mouse', 'touch']) {
      const el = $('#invert-' + input)
      el.checked = original.settings[input === 'mouse' ? 'invertMouse' : 'invertTouch']
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (original.storage === null) localStorage.removeItem('stickman.input-sensitivity.v1')
    else localStorage.setItem('stickman.input-sensitivity.v1', original.storage)
    m.ai.update = original.ai; m.invincible = original.invincible; p.fallback = original.fallback
    m.touch.setEnabled(original.touch)
    Element.prototype.setPointerCapture = original.capture
    Element.prototype.hasPointerCapture = original.hasCapture
    Element.prototype.releasePointerCapture = original.release
  }
})()
