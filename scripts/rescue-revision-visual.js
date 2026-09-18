// Staged visual/integration QA, NOT an input-only full-mission run.
// Load through agent-browser eval after a fresh page. Position the player at the
// relevant interaction, use the real F handler, and advance the real mission systems.
(() => {
  const e = window.__environment, m = e.mission, c = e.camera.perspective;
  if (!m.ready) throw new Error('Mission is not ready');
  const update = m.update.bind(m);
  e.player.update = () => false;
  e.camera.update = () => false;
  m.update = () => false;
  m.ai.update = () => {};
  m.security.update = () => {};
  e.player.playing = true;
  const style = document.createElement('style');
  style.textContent = 'body > :not(canvas):not(script){display:none!important}';
  document.head.append(style);
  const vec = xyz => c.position.clone().fromArray(xyz);
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const tick = seconds => { for (let i = 0; i < seconds * 60; i++) {
    e.interactions.update(1 / 60); e.player.world.refresh(); update(1 / 60);
  } };
  const view = (eye, target, fov = 50) => {
    c.position.fromArray(eye); c.lookAt(vec(target)); c.fov = fov; c.updateProjectionMatrix();
    e.renderer.render(e.scene, c);
    const gl = e.renderer.getContext(), pixels = new Uint8Array(4 * 40 * 40);
    gl.readPixels(Math.floor(gl.drawingBufferWidth / 2) - 20, Math.floor(gl.drawingBufferHeight / 2) - 20,
      40, 40, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return { colors: colors.size, canvas: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
  };
  const use = (id, feet) => {
    e.player.playing = true;
    e.player.body.teleport(vec(feet));
    e.player.actions.syncCamera(c);
    const station = m.world.stations.find(station => station.id === id);
    c.lookAt(station.point); c.updateMatrixWorld(true);
    check(e.player.actions.findTarget(c)?.object === station.object, `Missing F target: ${id}`);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
  };
  window.__rescueRevision = {
    view, tick,
    seated() { return view([112.25, -2.9, -18.9], [110.35, -3.4, -21]); },
    jail() { return view([114.2, -2.6, -22.1], [110.35, -3.4, -21], 50); },
    mobileHostage() { return view([112.6, -2.4, -19.1], [110.35, -3.4, -21], 60); },
    mobileJeep() { return view([160.2, 3.15, 15.7], [155, 0.85, 11], 75); },
    jeep() { return view([160.2, 3.15, 15.7], [155, 0.85, 11], 43); },
    rear() { return view([150, 2.8, 14.5], [155, 0.9, 11], 43); },
    release() {
      use('hostage-1', [115.1, -4.2, -19.75]);
      check(m.state.hostages[0].status === 'following', 'F did not release the hostage');
      tick(0.55);
      check(m.escort.actors[0].root.userData.animation === 'hostage-stand-up', 'Stand-up was skipped');
      check(m.state.hostages[0].position[0] === 110.5, 'Hostage slid before standing');
      return this.seated();
    },
    escort() {
      e.player.body.teleport(vec([155.02, 0.05, 12.25]));
      tick(90);
      check(m.state.hostages.length === 1 && m.state.hostages[0].status === 'loaded', 'Escort did not reach jeep');
      return view([155.1, 1.75, 14.2], [154.8, 1, 11.4], 48);
    },
    escape() {
      use('exit-gate-control', [159, 0.05, 6.3]);
      check(m.state.gateOpen, 'Gate did not open');
      use('rescue-jeep', [154.5, 0.05, 9.3]);
      check(m.state.jeep === 'escaping', 'Jeep did not begin escape');
      tick(5);
      check(m.state.phase === 'complete' && m.state.hostages[0].position[0] > 174, 'Escape did not complete');
      return { phase: m.state.phase, hostages: m.state.hostages, jeep: m.state.jeep,
        wheels: m.world.rescue.jeep.userData.wheels.map(wheel => wheel.rotation.z) };
    },
    restart() {
      m.restart();
      check(m.state.hostages.length === 1 && m.state.hostages[0].status === 'captive', 'Restart failed');
      check(m.escort.actors[0].root.userData.animation === 'hostage-seated', 'Restart did not reseat hostage');
      return this.seated();
    },
  };
  return 'Staged single-hostage visual checks ready';
})()
