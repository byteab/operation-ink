// Sequential real mouse clicks: no simultaneous buttons (Magic Mouse workflow).
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { runAgentBrowser } from './agent-browser.mjs'
const browser = (...args) => runAgentBrowser('aim-toggle', ...args)
const evaluate = code => JSON.parse(browser('eval', '-b', Buffer.from(code).toString('base64')))
const click = button => { browser('mouse', 'down', button); browser('mouse', 'up', button) }
const directory = 'artifacts/aim-toggle'
mkdirSync(directory, { recursive: true })
const results = []
try {
  browser('open', 'http://localhost:5173')
  browser('wait', '--fn', 'window.__environment?.mission?.ready === true')
  evaluate(`(() => {
    const env = __environment, m = env.mission, p = env.player;
    p.fallback = true; document.querySelector('#walk-start').click();
    m.update = () => false; p.update = () => false;
    p.body.teleport(p.body.position.clone().set(0, .03, -70));
    p.actions.syncCamera(env.camera.perspective); env.camera.perspective.rotation.set(0, Math.PI, 0);
    window.__aimShots = []; m.weapons.context.onShot = s => __aimShots.push(s.weapon);
    window.__aimStep = seconds => {
      for (let i = 0; i < Math.ceil(seconds * 60); i++) m.weapons.update(1/60, {
        active: true, climbing: false, moving: 0, aiming: m.aiming,
        reducedMotion: false, feet: p.body.position
      });
      m.hud.setScoped(m.weapons.scoped, m.weapons.scopeMagnification);
      env.renderer.render(env.scene, env.camera.perspective);
      return { ammo: m.weapons.current.magazine, aiming: m.aiming, scoped: m.weapons.scoped,
        zoom: m.weapons.scopeMagnification, fov: env.camera.perspective.fov, shots: __aimShots.length,
        reloading: m.weapons.reloading };
    };
    return true;
  })()`)
  browser('mouse', 'move', '640', '350')
  for (const name of ['pistol', 'shotgun', 'ak', 'smg', 'sniper']) {
    const initial = evaluate(`(() => {
      __environment.mission.weapons.restore({ slots: [{id:'test-${name}',name:'${name}',magazine:5,reserve:20}], selected:0,pickups:[],nextId:1 });
      __aimShots.length = 0; return __aimStep(.4);
    })()`)
    click('right')
    const aimed = evaluate('__aimStep(.3)')
    if (name === 'pistol' || name === 'shotgun') {
      assert(!aimed.aiming && !aimed.scoped, `${name} ignores right-click aim`)
      click('left')
      assert.equal(evaluate('__aimStep(1/60)').ammo, initial.ammo - 1, `${name} still fires normally`)
      evaluate('__aimStep(.5)')
      browser('screenshot', directory + `/${name}-hip-fire.png`)
      browser('press', 'r')
      const loaded = evaluate('__aimStep(2)')
      assert(loaded.ammo > initial.ammo && !loaded.aiming && !loaded.reloading, `${name} still reloads normally`)
      results.push({ name, passed: true })
      console.log(`PASS ${name}: right-click does not aim; hip fire and reload work`)
      continue
    }
    assert(aimed.aiming, `${name}: aim must stay on after releasing right-click`)
    assert.equal(aimed.scoped, name === 'sniper')
    click('left')
    const fired = evaluate('__aimStep(1/60)')
    assert.equal(fired.ammo, initial.ammo - 1, `${name}: left click fires after releasing aim button`)
    assert.equal(fired.shots, name === 'shotgun' ? 8 : 1)
    const settled = evaluate('__aimStep(2)')
    assert(settled.aiming); assert.equal(settled.ammo, fired.ammo, 'released fire must not repeat')
    if (name === 'sniper') {
      browser('mouse', 'wheel', '-100')
      const zoomed = evaluate('__aimStep(.1)')
      assert.equal(zoomed.zoom, aimed.zoom + 1); assert(zoomed.fov < aimed.fov)
      browser('press', 'q'); assert.equal(evaluate('__aimStep(.1)').zoom, aimed.zoom)
      browser('press', 'e'); assert.equal(evaluate('__aimStep(.1)').zoom, zoomed.zoom)
    }
    click('left')
    const second = evaluate('__aimStep(1/60)')
    assert.equal(second.ammo, fired.ammo - 1); assert(second.aiming)
    if (name === 'sniper') {
      assert(second.scoped)
      browser('screenshot', directory + '/sniper-zoom-shot.png')
    }
    click('right')
    const lowered = evaluate('__aimStep(.1)')
    assert(!lowered.aiming && !lowered.scoped); assert.equal(lowered.fov, initial.fov)
    click('right'); assert(evaluate('__aimStep(.3)').aiming)
    browser('press', 'r')
    const lowering = evaluate('__aimStep(.1)')
    assert(!lowering.aiming && !lowering.scoped && lowering.reloading, 'reload clears toggled aim before handling the magazine')
    assert.equal(lowering.ammo, second.ammo, 'lowering does not transfer ammo')
    if (name === 'smg') {
      browser('screenshot', directory + '/smg-lowering.png')
      evaluate('__aimStep(.55)')
      browser('screenshot', directory + '/smg-reloading.png')
    }
    const loaded = evaluate('__aimStep(5)')
    assert(loaded.ammo > second.ammo && !loaded.reloading && !loaded.aiming && !loaded.scoped, 'reload finishes without automatically re-aiming')
    click('right'); assert(evaluate('__aimStep(.3)').aiming)
    evaluate('window.dispatchEvent(new Event("blur")); true')
    assert(!evaluate('__aimStep(.1)').aiming, 'losing focus clears toggled aim')
    evaluate('__environment.player.requestControl(); true')
    results.push({ name, passed: true })
    console.log(`PASS ${name}: sequential aim/fire, repeated shots, toggle off, reload lowers aim, and focus reset`)
  }
  const errors = browser('errors'); assert(!errors.trim(), errors)
  writeFileSync(directory + '/results.json', JSON.stringify(results, null, 2) + '\n')
} finally {
  browser('mouse', 'up', 'left'); browser('mouse', 'up', 'right'); browser('reload')
}
