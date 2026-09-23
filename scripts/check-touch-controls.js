// Fresh dev mission, via npx agent-browser eval --stdin. Uses actual DOM pointer
// handlers and runtime actions. Synthetic pointers require a capture shim; also
// verify a real captured drag with agent-browser mouse. AI, hardware vibration,
// a nearby interaction and the sniper loadout are staged. Reload afterwards.
(async () => {
  const { mission: m, player: p, camera } = window.__environment
  if (!m?.ready) throw new Error('Wait for mission.ready')
  const $ = selector => document.querySelector(selector)
  const control = name => name === 'look' ? $('.touch-look-pad') : $(`[data-touch="${name}"]`)
  const visible = el => !!el.getClientRects().length && !el.closest('[inert]') && getComputedStyle(el).visibility !== 'hidden'
  const results = []
  const check = (condition, label, details) => {
    if (!condition) throw new Error(label + (details ? `: ${JSON.stringify(details)}` : ''))
    results.push(label)
  }
  const original = { ai: m.ai.update, invincible: m.invincible, capture: Element.prototype.setPointerCapture,
    hasCapture: Element.prototype.hasPointerCapture, release: Element.prototype.releasePointerCapture,
    vibrate: navigator.vibrate, extraTargets: p.actions.extraTargets }
  const pulses = []
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.releasePointerCapture = () => {}
  navigator.vibrate = duration => { pulses.push(duration); return true }
  m.ai.update = () => {}; m.invincible = true
  const point = el => { const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: el.dataset.touch === 'look' ? b.y + 18 : b.y + b.height / 2 } }
  const pointer = (el, type, id, at = point(el)) => el.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: at.x, clientY: at.y,
    button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, bubbles: true, cancelable: true,
  }))
  let nextId = 10
  const tap = el => { const id = nextId++; pointer(el, 'pointerdown', id); pointer(el, 'pointerup', id) }
  const draw = (frames = 1) => {
    for (let i = 0; i < frames; i++) { p.update(1 / 60); m.update(1 / 60); m.finishFrame() }
  }
  const resume = () => { $('#walk-start').click(); draw(20) }
  const settlePicker = async () => {
    $('.touch-pad-surface').getBoundingClientRect()
    await Promise.all($('.touch-actions').getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
  }
  try {
    p.pause()
    // First touch on a hybrid browser enables the controls before mission entry.
    pointer($('#walk-start'), 'pointerdown', 1); pointer($('#walk-start'), 'pointerup', 1)
    check(p.touchMode && $('#mission-touch').checked, 'Touch is detected without relying on viewport width')
    resume()
    check(p.playing && !document.pointerLockElement && visible($('#touch-controls')), 'Touch starts play without pointer lock')
    const onScreen = el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1 }
    check($('#touch-controls').textContent.trim() === '', 'Gameplay controls contain icons only, including the closed loadout')
    check(visible(control('aim')) && visible(control('jump')), 'Aim and Jump have dedicated persistent buttons')
    check(!visible(control('reload')) && !visible(control('use')), 'A full magazine and no nearby target hide Reload and Interact')
    check([...$('#touch-controls').querySelectorAll('button')].filter(visible).length === 5, 'Only applicable actions are visible around the pad')
    check(getComputedStyle(document.body).touchAction === 'none', 'The entire playing surface blocks browser pan and zoom')
    for (const el of [control('fire'), control('fire').querySelector('svg'), $('.mission-vitals'), $('.magazine-count')]) {
      check(getComputedStyle(el).userSelect === 'none', 'Controls, SVG icons and HUD text cannot be selected')
    }
    const browserEvent = (el, type) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      el.dispatchEvent(event)
      return event.defaultPrevented
    }
    for (const el of [control('fire'), $('#world')]) {
      for (const type of ['touchstart', 'touchmove', 'touchend', 'dblclick', 'gesturestart', 'gesturechange', 'selectstart', 'dragstart', 'contextmenu']) {
        check(browserEvent(el, type), `${type} browser default is cancelled on ${el.id || 'Fire'}`)
      }
    }
    const positions = ['weapon', 'aim', 'jump'].map(name => point(control(name)))
    for (const name of ['move', 'look', 'fire', 'jump', 'aim', 'weapon', 'pause']) {
      const el = control(name), b = el.getBoundingClientRect()
      check(onScreen(el) && b.width >= 44 && b.height >= 44, `${name} fits the viewport with a usable touch target`)
    }
    const stick = control('move'), origin = point(stick), radius = stick.getBoundingClientRect().width * 0.37
    pointer(stick, 'pointerdown', 1, origin)
    pointer(stick, 'pointermove', 1, { x: origin.x, y: origin.y - radius * 0.45 })
    draw(6)
    check(p.touchMove.forward > 0 && p.touchMove.forward < 1 && !p.touchMove.sprint && p.direction.length() < 1,
      'Partial stick input stays analog through the player controller')
    pointer(stick, 'pointermove', 1, { x: origin.x, y: origin.y - radius * 1.4 })
    check(p.touchMove.sprint && Math.abs(p.touchMove.forward - 1) < 1e-6, 'Full stick travel runs and clamps outside its ring')
    const look = control('look'), lookAt = point(look), beforeLook = camera.perspective.quaternion.clone()
    pointer(look, 'pointerdown', 2, lookAt)
    pointer(look, 'pointermove', 2, { x: lookAt.x + 20, y: lookAt.y + 3 })
    draw(3)
    check(beforeLook.angleTo(camera.perspective.quaternion) > 0.01 && p.touchMove.sprint, 'A second finger looks without interrupting movement')
    const heldView = camera.perspective.quaternion.clone()
    draw(6)
    check(heldView.angleTo(camera.perspective.quaternion) > 0.01, 'A stationary held look stick keeps turning without more pointer events')
    const shots = m.state.shots
    pointer(look, 'pointermove', 2, point(control('fire')))
    draw(8)
    check(m.state.shots === shots && !m.weapons.held, 'Dragging the look rim across the center never fires')
    pointer(control('fire'), 'pointerdown', 3)
    pointer(control('fire'), 'pointerup', 3)
    check(!m.weapons.held, 'An extra look/fire contact cannot steal the current camera gesture')
    pointer(look, 'pointerup', 2)
    const fireAt = point(control('fire')), beforeFireDrag = camera.perspective.quaternion.clone()
    pointer(control('fire'), 'pointerdown', 3)
    pointer(control('fire'), 'pointermove', 3, { x: fireAt.x + 25, y: fireAt.y })
    draw(24)
    check(m.state.shots > shots && m.weapons.held && p.touchMove.sprint, 'Movement, looking and automatic fire work simultaneously')
    check(beforeFireDrag.angleTo(camera.perspective.quaternion) > 0.01, 'Dragging Fire also controls the view')
    pointer(control('fire'), 'pointercancel', 3)
    pointer(stick, 'pointercancel', 1)
    const cancelledShots = m.state.shots
    draw(20)
    check(m.state.shots === cancelledShots && !m.weapons.held && p.touchMove.forward === 0, 'Cancelled contacts stop shooting and movement')
    pointer(control('fire'), 'pointerdown', 3)
    pointer(control('fire'), 'pointercancel', 3)
    draw()
    check(m.state.shots === cancelledShots, 'Cancellation before the next frame discards a pending shot')
    pointer(stick, 'pointerdown', 1, { x: origin.x + radius, y: origin.y })
    pointer(stick, 'lostpointercapture', 1)
    check(p.touchMove.x === 0, 'Losing pointer capture releases the stick')
    const lookRadius = look.getBoundingClientRect().width * 0.37
    const turnFor = (reach, fps) => {
      pointer(look, 'pointerdown', 2, lookAt)
      pointer(look, 'pointermove', 2, { x: lookAt.x + lookRadius * reach, y: lookAt.y })
      const before = camera.perspective.quaternion.clone()
      for (let i = 0; i < fps; i++) p.update(1 / fps)
      const angle = before.angleTo(camera.perspective.quaternion)
      pointer(look, 'pointerup', 2)
      return angle
    }
    const smallTurn = turnFor(0.3, 60), fullTurn = turnFor(1, 60)
    check(smallTurn > 0 && fullTurn > smallTurn * 4, 'Small held tilts turn slowly and full tilts turn quickly')
    check(turnFor(0.05, 60) < 1e-6, 'Thumb jitter inside the look dead zone does not turn')
    const frameRates = [30, 60, 144].map(fps => turnFor(0.6, fps))
    check(Math.max(...frameRates) - Math.min(...frameRates) < 1e-6, 'Held camera speed is consistent at 30, 60 and 144 fps', frameRates)
    const releasedView = camera.perspective.quaternion.clone()
    draw(6)
    check(releasedView.angleTo(camera.perspective.quaternion) < 1e-6, 'Releasing the look stick stops camera motion immediately')
    pointer(look, 'pointerdown', 2, lookAt)
    pointer(look, 'pointermove', 2, { x: lookAt.x + 20, y: lookAt.y })
    pointer(stick, 'pointerdown', 1, origin); pointer(stick, 'pointerup', 1)
    const afterMoveRelease = camera.perspective.quaternion.clone()
    draw(6)
    check(afterMoveRelease.angleTo(camera.perspective.quaternion) > 0.01, 'Releasing movement preserves a held camera stick')
    pointer(look, 'pointermove', 2, lookAt)
    const centeredView = camera.perspective.quaternion.clone()
    draw(6)
    check(centeredView.angleTo(camera.perspective.quaternion) < 1e-6, 'Returning the held look stick to its origin stops turning')
    pointer(look, 'pointercancel', 2)
    // Inspect the actual return transition at its midpoint, without timing a screenshot.
    pointer(stick, 'pointerdown', 1, { x: origin.x + radius, y: origin.y })
    const knob = $('.touch-knob')
    knob.getBoundingClientRect()
    check(getComputedStyle(knob).transitionDuration === '0s', 'The movement knob follows a held thumb without animation lag')
    pointer(stick, 'pointerup', 1)
    knob.getBoundingClientRect()
    const recenter = knob.getAnimations().find(animation => animation.transitionProperty === 'transform')
    check(!!recenter && p.touchMove.x === 0, 'Releasing movement stops input immediately and starts a visual return animation')
    recenter.pause(); recenter.currentTime = 75
    const midpoint = new DOMMatrix(getComputedStyle(knob).transform).m41
    check(midpoint > 0 && midpoint < radius, 'The released movement knob passes smoothly between its offset and center')
    recenter.finish()
    tap(look); tap(look); draw()
    check(!m.aiming && m.state.shots === cancelledShots, 'Tapping the look pad does not accidentally aim or fire')
    tap(control('aim')); draw(25)
    check(m.aiming && look.classList.contains('touch-aiming') && control('aim').getAttribute('aria-pressed') === 'true', 'The dedicated Aim button toggles sights with a visible pressed state')
    check(m.state.shots === cancelledShots, 'Using Aim never queues a shot')
    check(visible(control('reload')) && !control('reload').disabled, 'Reload appears after ammunition is spent')
    check(['weapon', 'aim', 'jump'].every((name, i) => { const at = point(control(name)); return at.x === positions[i].x && at.y === positions[i].y }), 'Reload appearing does not move the other controls')
    const reserve = m.weapons.current.reserve
    m.weapons.current.reserve = 0; draw()
    check(!visible(control('reload')), 'Reload stays hidden when no reserve ammunition is available')
    m.weapons.current.reserve = reserve; draw()
    const padBounds = look.getBoundingClientRect()
    tap(control('weapon'))
    check(visible($('.touch-weapon-tray')) && !m.weapons.reloading, 'One tap on Weapons always opens the selection and drop list')
    check(!visible(look) && !visible(control('aim')) && !visible(control('jump')) && !visible(control('reload')), 'The picker replaces the right-side combat controls')
    check($('.touch-weapon-tray').closest('.touch-actions') && visible(stick), 'The picker shares the right pad while movement remains available')
    check([...document.querySelectorAll('[data-touch="slot"]')].filter(visible).length === m.weapons.slots.filter(Boolean).length, 'Only available weapons are shown')
    const blockedShots = m.state.shots
    tap(control('fire')); draw(2)
    check(m.state.shots === blockedShots && !m.weapons.held, 'Replaced combat controls cannot fire through the picker')
    pointer(stick, 'pointerdown', 1, { x: origin.x + radius, y: origin.y })
    check(p.touchMove.x > 0, 'The movement stick works with the weapon picker open')
    await settlePicker()
    const expanded = $('.touch-pad-surface').getBoundingClientRect()
    check(expanded.width > padBounds.width && Math.abs(expanded.x + expanded.width / 2 - padBounds.x - padBounds.width / 2) < 20, 'The existing pad expands in place into the picker', { expanded: expanded.toJSON(), pad: padBounds.toJSON(), open: m.touch.pickerOpen, playing: p.playing })
    check(onScreen($('.touch-weapon-tray')) && [...$('.touch-weapon-tray').querySelectorAll('button')].filter(visible).every(onScreen), 'The expanded circle and its choices fit the viewport')
    check([...$('.touch-weapon-tray').querySelectorAll('button')].every(el => ['slot', 'drop', 'close'].includes(el.dataset.touch)), 'The weapon list contains selection, drop and close only')
    check(control('drop').closest('.touch-weapon-tray') && !control('aim').closest('.touch-weapon-tray') && !control('reload').closest('.touch-weapon-tray'), 'Drop shares the picker with weapon choices')
    check($('#touch-controls').textContent.trim() === '' && [...document.querySelectorAll('[data-touch="slot"]')].every(el => el.querySelector('svg') && el.getAttribute('aria-label')), 'Weapon choices use distinct icons with accessible names')
    tap(control('close'))
    check(visible(look) && visible(control('aim')) && visible(control('jump')) && p.touchMove.x > 0, 'Closing restores combat controls and preserves the movement thumb')
    pointer(stick, 'pointerup', 1)
    pointer(control('fire'), 'pointerdown', 61)
    tap(control('weapon')); draw(4)
    check(!m.weapons.held && m.state.shots === blockedShots && ![...m.touch.contacts.values()].some(c => c.role === 'fire'), 'Opening the picker cancels a held trigger and pending shot')
    tap(control('close')); tap(control('weapon')); tap(control('close')); tap(control('weapon'))
    await settlePicker()
    check(visible($('.touch-weapon-tray')) && !visible(look) && $('.touch-pad-surface').getBoundingClientRect().width > padBounds.width, 'Rapid toggles settle into the latest requested state')
    tap(control('close'))
    tap(control('reload')); draw()
    check(m.weapons.reloading && !m.aiming && !visible(control('reload')), 'Reload uses its own button, lowers aim and hides while unavailable')
    draw(240)
    check(!m.weapons.reloading && m.weapons.current.magazine > 0 && !visible(control('reload')), 'Reload finishes and disappears with a full magazine')
    tap(control('jump'))
    check(p.body.velocity.y > 0, 'Jump acts on the real player body')
    draw(90)
    let used = 0
    // Reuse the scene root as an ignored ray target; put the staged action in clear air.
    const actionPoint = camera.perspective.position.clone().addScaledVector(camera.perspective.getWorldDirection(p.forward), 0.6)
    p.actions.extraTargets = () => [{ object: m.world.root, point: actionPoint, kind: 'mission', label: 'Test control', descending: false, use: () => { used++; return true } }]
    draw()
    check(visible(control('use')) && control('use').id === 'action-marker' && control('use').getAttribute('aria-label') === 'Test control', 'A nearby target reveals a tappable marker on the object')
    check(!$('.touch-shortcuts [data-touch="use"]'), 'There is no duplicate action button beside the right pad')
    const marker = control('use'), markerBox = marker.getBoundingClientRect(), iconBox = marker.querySelector('svg').getBoundingClientRect()
    check(markerBox.width >= 44 && markerBox.height >= 44 && Math.abs(markerBox.x + markerBox.width / 2 - iconBox.x - iconBox.width / 2) < 0.5 && Math.abs(markerBox.y + markerBox.height / 2 - iconBox.y - iconBox.height / 2) < 0.5, 'The SVG is centered inside a usable world-marker touch target')
    check(document.elementFromPoint(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2) === marker, 'The world marker receives taps above the background look surface')
    check(visible(control('jump')) && control('jump').querySelector('.touch-icon').dataset.icon === 'jump' && visible(control('aim')), 'Jump and Aim remain available beside a nearby interaction')
    const markerView = camera.perspective.quaternion.clone(), markerShots = m.state.shots, markerPulses = pulses.filter(n => n > 0).length
    pointer(stick, 'pointerdown', 1, { x: origin.x + radius, y: origin.y })
    m.touch.lastPulse = -Infinity
    tap(marker)
    marker.dispatchEvent(new PointerEvent('click', { pointerType: 'touch', detail: 1, bubbles: true, cancelable: true }))
    check(used === 1, 'Tapping the world marker activates once without a duplicate click')
    check(p.touchMove.x > 0 && markerView.angleTo(camera.perspective.quaternion) < 1e-6 && m.state.shots === markerShots, 'Marker taps preserve movement without looking or firing')
    check(pulses.filter(n => n > 0).length > markerPulses, 'World interactions retain touch feedback')
    pointer(stick, 'pointerup', 1)
    const stagedTargets = p.actions.extraTargets
    let wrongTargetUsed = 0
    p.actions.extraTargets = () => [{ ...stagedTargets()[0], object: m.world.root.clone(false), use: () => { wrongTargetUsed++; return true } }]
    tap(marker)
    check(wrongTargetUsed === 0, 'A stale marker cannot activate a different nearby object')
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }))
    check(wrongTargetUsed === 1, 'Desktop F still activates the current valid target')
    p.actions.extraTargets = () => [{ ...stagedTargets()[0], point: actionPoint.clone().addScalar(20) }]
    tap(marker)
    check(used === 1, 'Marker activation rechecks reach instead of trusting its last screen position')
    p.actions.extraTargets = original.extraTargets
    draw(30)
    check(!visible(control('use')) && visible(control('jump')), 'Only the action button disappears when no target remains')
    tap(control('weapon'))
    check(visible($('.touch-weapon-tray')), 'Weapons opens the loadout tray')
    const otherSlot = [...document.querySelectorAll('[data-touch="slot"]')].find(el => !el.disabled && el.getAttribute('aria-pressed') !== 'true')
    if (otherSlot) {
      const index = Number(otherSlot.dataset.slot)
      tap(otherSlot)
      m.weapons.current.magazine--
      draw()
      check(!visible(control('reload')) && !m.weapons.canReload, 'Reload stays hidden until the weapon swap finishes')
      draw(30)
      check(m.weapons.selected === index && !visible($('.touch-weapon-tray')), 'Selecting a weapon updates the actual inventory slot')
      check(visible(control('reload')) && m.weapons.canReload, 'Reload becomes available after the weapon swap')
    }
    // A sniper is a pickup in normal play; stage it to test zoom without walking the map.
    const snapshot = m.weapons.snapshot()
    snapshot.slots[0] = { id: 'touch-test-sniper', name: 'sniper', magazine: 5, reserve: 15 }
    snapshot.selected = 0
    m.weapons.restore(snapshot); draw(30)
    tap(control('aim')); draw(30)
    check(m.weapons.scoped && visible($('.touch-zoom')) && !visible($('.touch-weapon-tray')), 'Sniper zoom is available without opening the weapon list')
    const zoom = m.weapons.scopeMagnification
    tap(control('zoom-in')); draw()
    check(m.weapons.scopeMagnification === zoom + 1, 'Touch zoom changes actual scope magnification')
    tap(control('zoom-out')); tap(control('aim')); draw()
    tap(control('weapon')); tap(control('drop')); draw()
    check(!m.weapons.current && control('fire').disabled, 'Dropping the weapon disables fire')
    check(visible(control('aim')) && visible(control('jump')) && !visible(control('reload')), 'Aim and Jump stay visible when unarmed; Reload stays hidden')
    tap(control('pause')); $('[data-menu-open="mission"]').click()
    check(!p.playing && $('.walk-card').dataset.page === 'mission' && !visible($('#touch-controls')), 'The map remains reachable through Pause without an extra gameplay button')
    check(getComputedStyle($('#walk-pause')).touchAction === 'pan-y' && !browserEvent($('.walk-card'), 'touchmove'), 'Paused menus retain native scrolling without browser zoom')
    $('[data-menu-page="mission"] [data-menu-back]').click()
    resume()
    pointer(stick, 'pointerdown', 1, { x: origin.x + radius, y: origin.y })
    window.dispatchEvent(new Event('resize'))
    check(p.touchMove.x === 0 && m.touch.contacts.size === 0, 'Resize/orientation changes release held contacts')
    pointer(stick, 'pointerdown', 1, { x: origin.x + radius, y: origin.y })
    window.dispatchEvent(new Event('blur'))
    check(!p.playing && p.touchMove.x === 0 && !visible($('#touch-controls')), 'App backgrounding pauses and clears all contacts')
    resume(); tap(control('pause'))
    $('[data-menu-open="settings"]').click()
    check(pulses.some(duration => duration > 0), 'Supported vibration receives interaction pulses')
    $('#mission-haptics').click()
    $('[data-menu-page="settings"] [data-menu-back]').click(); resume()
    const pulseCount = pulses.filter(duration => duration > 0).length
    m.touch.lastPulse = -Infinity
    tap(control('weapon'))
    check(pulses.filter(duration => duration > 0).length === pulseCount, 'Vibration setting silences haptics')
    tap(control('close')); tap(control('pause')); $('[data-menu-open="settings"]').click()
    $('#mission-haptics').click(); $('#mission-motion').click()
    $('[data-menu-page="settings"] [data-menu-back]').click(); resume()
    m.touch.lastPulse = -Infinity; tap(control('weapon'))
    check(pulses.filter(duration => duration > 0).length === pulseCount && getComputedStyle(control('weapon')).transitionDuration === '0s', 'Reduced motion disables vibration and button transitions')
    check(getComputedStyle($('.touch-pad-surface')).transitionDuration === '0s' && getComputedStyle($('.touch-weapon-tray')).transitionDuration === '0s', 'Reduced motion switches the picker without growth or fade animation')
    check(getComputedStyle($('.touch-knob')).transitionDuration === '0s', 'Reduced motion removes the stick return animation')
    tap(control('close'))
    void m.audio.unlock()
    m.audio.setMuted(true)
    const mutedSources = m.audio.diagnostics.sources
    m.audio.controlTick()
    check(m.audio.diagnostics.sources === mutedSources, 'Muted touch feedback creates no audio source')
    m.audio.setMuted(false); m.audio.setVolume(0)
    const silentSources = m.audio.diagnostics.sources
    m.audio.controlTick()
    check(m.audio.diagnostics.sources === silentSources, 'Zero volume also silences touch feedback')
    m.audio.setVolume(0.55)
    const audibleSources = m.audio.diagnostics.sources
    m.audio.controlTick()
    check(m.audio.diagnostics.sources === audibleSources + 1, 'Touch click sound uses the running mission audio bus')
    m.invincible = false; m.damage(200); draw(300)
    check(m.state.phase === 'dead' && !visible($('#touch-controls')) && m.touch.contacts.size === 0, 'Death clears and hides touch input')
    $('#mission-retry').click(); draw(30)
    check(p.playing && m.state.health === 100 && visible($('#touch-controls')) && p.touchMove.x === 0 && !m.aiming, 'Retry restores touch play without stale movement or aim')
    tap(control('pause')); $('[data-menu-open="settings"]').click(); $('#mission-touch').click()
    check(!p.touchMode && !visible($('#touch-controls')) && document.body.dataset.touch === 'false', 'Touch mode can be turned off for keyboard/mouse play')
    check(!browserEvent($('#world'), 'touchend') && !browserEvent($('#world'), 'gesturestart'), 'Touch event fallbacks switch off with touch mode')
    return { passed: results.length, results }
  } finally {
    m.ai.update = original.ai; m.invincible = original.invincible
    p.actions.extraTargets = original.extraTargets
    Element.prototype.setPointerCapture = original.capture
    Element.prototype.hasPointerCapture = original.hasCapture
    Element.prototype.releasePointerCapture = original.release
    navigator.vibrate = original.vibrate
    p.pause(); m.restart()
  }
})()
