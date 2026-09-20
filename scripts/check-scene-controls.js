// Staged camera views and actual F-handler checks via agent-browser eval --stdin.
// Reload before installing; this deliberately freezes simulation for visual inspection.
(() => {
  const e = window.__environment, m = e.mission, c = e.camera.perspective
  if (!m.ready) throw new Error('Mission must be ready')
  e.player.pause()
  e.player.update = () => false; e.camera.update = () => false
  m.update = () => false; m.ai.update = () => {}; m.security.update = () => {}
  c.getObjectByName('First-person stickman arms').visible = false
  const assert = (ok, text) => { if (!ok) throw new Error(text) }
  const vector = values => c.position.clone().fromArray(values)
  const style = document.createElement('style')
  style.textContent = 'body > :not(canvas):not(script){display:none!important}'
  document.head.append(style)
  const view = (eye, target, fov = 65) => {
    c.position.fromArray(eye); c.lookAt(vector(target)); c.fov = fov
    c.updateProjectionMatrix(); c.updateMatrixWorld(true)
    e.scene.updateMatrixWorld(true); e.renderer.render(e.scene, c)
    return { eye, target, fov }
  }
  window.__sceneControls = {
    view,
    warehouse: () => view([-8, 1.8, 8], [23, 0.7, -0.2], 75),
    barrier: () => view([153, 1.8, -19], [158, 0.75, -12], 65),
    room: () => view([145.5, 1.78, -41.3], [146, 1.2, -46.5], 83),
    computer: () => view([146.6, 1.78, -46.4], [149, 1.15, -45.7], 58),
    yard: () => view([120, 1.8, 18], [141, 1.6, 3], 73),
    gate: () => view([157.7, 1.75, 5.4], [160.5, 1.13, 6.3], 57),
    controls() {
      assert(!m.world.stations.some(s => ['security-alarm', 'escort-rally'].includes(s.id)), 'Marked pedestals must be absent')
      const results = []
      for (const id of ['security-computer', 'detention-alarm', 'exit-gate-control']) {
        const station = m.world.stations.find(s => s.id === id)
        m.state.camerasActive = true; m.state.camerasDisabledUntil = null
        m.state.alarm = 'active'; m.state.gateOpen = false
        e.player.playing = true
        const outward = vector([0, 0, 1]).transformDirection(station.object.matrixWorld)
        const approach = station.point.clone().addScaledVector(outward, 1.5)
        approach.y = e.player.world.floor(approach, 0.5, 3) + 0.005
        e.player.body.teleport(approach)
        e.player.actions.syncCamera(c); c.lookAt(station.point); c.updateMatrixWorld(true)
        assert(e.player.actions.findTarget(c)?.object === station.object, `${id} must be the interaction target`)
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }))
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', bubbles: true }))
        assert(m.state.camerasActive === (id !== 'security-computer'), `${id}: camera independence`)
        assert(m.state.alarm === (id === 'detention-alarm' ? 'silenced' : 'active'), `${id}: alarm independence`)
        assert(m.state.gateOpen === (id === 'exit-gate-control'), `${id}: gate independence`)
        results.push({ id, camerasActive: m.state.camerasActive, alarm: m.state.alarm, gateOpen: m.state.gateOpen })
      }
      e.player.pause(); m.audio.setActive(false)
      for (let i = 0; i < 181; i++) e.interactions.update(1 / 60)
      const hinge = m.world.rescue.gate.children.find(child => child.userData.doorHinge)
      assert(Math.abs(hinge.rotation.y + Math.PI / 2) < 0.002, 'Exit wire gate must fully open')
      return { removedPedestals: true, results, gateAngle: hinge.rotation.y }
    },
  }
  return { ready: true }
})()
