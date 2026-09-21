// Run against a freshly loaded dev game via agent-browser eval --stdin.
// Uses real menu events/runtime callbacks, with guards disabled and pointer-lock
// fallback enabled only to make the lifecycle checks deterministic in automation.
(async () => {
  const env = window.__environment, m = env.mission, p = env.player
  if (!m?.ready) throw new Error('Wait for mission.ready')
  const $ = selector => document.querySelector(selector)
  const visible = selector => $(selector).getClientRects().length > 0
  const results = []
  const check = (ok, label) => {
    results.push({ passed: !!ok, label })
    if (!ok) throw new Error(label)
  }
  const key = (code, options = {}) => window.dispatchEvent(new KeyboardEvent('keydown', {
    key: code === 'KeyM' ? 'm' : code, code, bubbles: true, cancelable: true, ...options,
  }))
  const click = selector => $(selector).click()
  const draw = () => { m.update(0); m.finishFrame() }
  const page = () => $('.walk-card').dataset.page
  const singlePage = () => [...document.querySelectorAll('[data-menu-page]')].filter(el => el.getClientRects().length).length === 1
  const originalAI = m.ai.update, originalFallback = p.fallback, originalInvincible = m.invincible
  m.ai.update = () => {}
  p.fallback = true
  m.invincible = false
  try {
    check(page() === 'home' && !visible('.field-map') && !visible('.mission-settings'), 'Opening menu contains no map or settings clutter')
    check(!visible('#mission-retry') && !visible('#mission-restart'), 'Fresh mission hides irrelevant recovery actions')
    const initialWords = $('[data-menu-page="home"]').innerText.trim().split(/\s+/).length
    check(initialWords <= 25, `Opening screen has only ${initialWords} words`)

    check(!$('[data-menu-open="vr"]') && !visible('#vr-panel'), 'Unfinished VR is not offered in the menu')
    for (const name of ['mission', 'controls', 'settings']) {
      const selector = `[data-menu-open="${name}"]`
      click(selector)
      check(page() === name && singlePage(), `${name}: only its own page is visible`)
      check(document.activeElement.hasAttribute('data-menu-back'), `${name}: keyboard focus enters the page`)
      key('Escape')
      check(page() === 'home' && document.activeElement === $(selector) && !p.playing, `${name}: Escape returns focus without starting the game`)
    }

    $('[data-menu-open="settings"]').focus(); key('Tab')
    check(document.activeElement.id === 'walk-start', 'Tab wraps inside the menu')
    key('Tab', { shiftKey: true })
    check(document.activeElement.dataset.menuOpen === 'settings', 'Shift+Tab wraps backwards')
    $('#walk-start').focus(); key('ArrowDown')
    check(document.activeElement.dataset.menuOpen === 'mission', 'Arrow keys navigate the menu')

    click('[data-menu-open="settings"]')
    const volume = $('#mission-volume')
    volume.value = '31'; volume.dispatchEvent(new Event('input', { bubbles: true }))
    click('#mission-mute'); click('#mission-motion')
    check(m.audio.diagnostics.volume === 0.31 && m.audio.diagnostics.muted && m.hud.reducedMotion, 'Settings control actual audio and reduced motion')
    key('Escape'); click('[data-menu-open="settings"]')
    check(volume.value === '31' && $('#mission-volume-value').value === '31%' && $('#mission-motion').checked, 'Settings survive page navigation')
    volume.value = '55'; volume.dispatchEvent(new Event('input', { bubbles: true }))
    click('#mission-mute'); click('#mission-motion'); key('Escape')

    click('#walk-start'); draw()
    check(p.playing && $('#walk-pause').hidden, 'Begin mission enters play directly')
    key('KeyM'); draw()
    check(!p.playing && page() === 'mission' && visible('.field-map'), 'M opens the mission map directly from gameplay')
    key('KeyM')
    // Deliberately pause before a render frame: page state must not depend on RAF.
    p.pause(); draw()
    check(page() === 'home' && visible('#mission-restart') && !visible('#mission-retry'), 'Rapid map/resume/pause returns to the home menu')

    m.state.health = 43; m.state.elapsed = 19
    click('#mission-restart')
    check(page() === 'restart' && m.state.health === 43, 'Restart waits for an explicit confirmation')
    key('Escape')
    check(page() === 'home' && m.state.health === 43 && document.activeElement.id === 'mission-restart', 'Cancel restart preserves progress and focus')
    check(!$('.walk-card').innerText.toLowerCase().includes('checkpoint'), 'Menus do not refer to nonexistent checkpoints')
    click('#walk-start'); draw()

    m.damage(200)
    for (let i = 0; i < 260; i++) { m.update(1 / 60); m.finishFrame() }
    check(m.state.phase === 'dead' && m.death.menuVisible && page() === 'home', 'Fatal damage reaches the simplified death menu')
    check(document.activeElement.id === 'mission-retry' && !visible('.field-map') && !visible('#mission-debrief') && !visible('#walk-start'), 'Death focuses Try again and hides map, statistics, and Resume')
    check(!visible('#mission-restart') && $('#mission-retry').textContent === 'Try again' && !visible('#mission-premise'), 'Death has one recovery action and no redundant instructions')
    click('[data-menu-open="settings"]'); key('Escape')
    check(m.state.phase === 'dead' && !p.playing && page() === 'home', 'Death submenus return without reviving the player')
    click('#mission-retry'); draw()
    check(p.playing && m.state.phase === 'active' && m.deaths === 0 && m.state.health === 100 && m.state.elapsed === 0 && !document.body.dataset.death, 'Try again resets the mission and resumes immediately')

    p.pause(); draw(); m.state.health = 42; m.deaths = 3
    click('#mission-restart'); click('#mission-confirm-restart'); draw()
    check(p.playing && m.state.health === 100 && m.deaths === 0, 'Confirmed restart resets and enters a fresh mission')

    p.pause(); m.state.phase = 'complete'; m.state.elapsed = 87; m.state.kills = 9; m.state.health = 42.3; draw()
    check($('#mission-menu-title').textContent === 'Hostage safe.' && visible('#mission-restart') && !visible('#mission-retry') && !visible('#walk-start'), 'Completion offers Play again without invalid actions')
    const recap = () => [...document.querySelectorAll('.mission-recap dd')].map(value => value.textContent).join('|')
    check(visible('#mission-debrief') && recap() === '1:27|9|43%', 'Completion recap uses actual mission time, kills and remaining health')
    m.state.elapsed = 0; m.state.kills = 0; m.state.health = 100; draw()
    check(recap() === '0:00|0|100%', 'Completion recap preserves zero kills and full health')
    click('#mission-restart'); draw()
    check(m.state.phase === 'active' && p.playing && m.state.kills === 0 && m.state.health === 100 && m.state.elapsed === 0, 'Play again starts a new mission directly with fresh recap values')
    p.pause(); draw()
    check(!visible('#mission-debrief'), 'Fresh mission hides the previous completion recap')
    return { results, initialWords }
  } finally {
    m.ai.update = originalAI
    p.fallback = originalFallback
    m.invincible = originalInvincible
  }
})()
