// Staged visual checks via agent-browser eval --stdin, not a full input-only playthrough.
(() => {
  const e = window.__environment, m = e.mission, c = e.camera.perspective;
  if (!m.ready) throw new Error('Mission is not ready');
  const missionUpdate = m.update.bind(m);
  e.player.update = () => false;
  e.camera.update = () => false;
  m.update = () => false;
  m.ai.update = () => {};
  m.security.update = () => {};
  const style = document.createElement('style');
  style.textContent = 'body > :not(canvas):not(script){display:none!important}';
  document.head.append(style);
  const vector = xyz => c.position.clone().fromArray(xyz);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const view = (eye, target, fov = 50) => {
    c.position.fromArray(eye); c.lookAt(vector(target)); c.fov = fov;
    c.updateProjectionMatrix(); c.updateMatrixWorld(true);
    e.renderer.render(e.scene, c);
    return { eye, target, fov };
  };
  const service = e.scene.getObjectByName('North service yard gate · closed');
  const exit = m.world.rescue.gate;
  assert(service.userData.permanentlyClosed && !e.player.actions.doors.includes(service), 'Service gate must stay noninteractive');
  assert(exit.userData.style === 'wire-gate', 'Rescue exit must use wire');
  assert(!e.scene.getObjectByName('Rail entrance shelter'), 'Rail shelter must be removed');
  assert(!e.scene.getObjectByName('North entrance gate · open'), 'Outer roadside gate must be removed');
  assert(Math.abs(e.scene.getObjectByName('West observation tower').position.z - 15.15) < 0.001, 'Tower must move with its landing');
  window.__compoundChecks = {
    view,
    overview: () => view([-155, 130, -182], [30, 0, -5], 49),
    forecourt: () => view([-97, 43, -104], [-34, 0, -43], 51),
    tower: () => view([-78, 18, -1], [-54, 3, 20], 53),
    rail: () => view([127, 23, -64], [104, 2, -25], 55),
    detention: () => view([90, 10, 8], [113, 2, -15], 53),
    warehouse: () => view([6, 2.3, -8], [50, 3, -6.6], 65),
    exit: () => view([150, 5, 1], [164, 1.6, 11], 53),
    openExit() {
      if (!e.player.enabled) e.player.enable();
      e.player.playing = true;
      e.player.body.teleport(vector([159, 0.05, 6.3]));
      e.player.actions.syncCamera(c);
      const station = m.world.stations.find(station => station.id === 'exit-gate-control');
      c.lookAt(station.point); c.updateMatrixWorld(true);
      assert(e.player.actions.findTarget(c)?.object === station.object, 'Exit control must be reachable');
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
      assert(m.state.gateOpen, 'F must open the rescue gate');
      for (let i = 0; i < 90; i++) {
        missionUpdate(1 / 60); e.interactions.update(1 / 60); e.player.world.refresh();
      }
      const hinge = exit.children.find(child => child.userData.doorHinge);
      assert(Math.abs(hinge.rotation.y + Math.PI / 2) < 0.002, 'Wire leaf must swing fully open');
      e.player.pause(); missionUpdate(0);
      this.exit();
      return { gateOpen: m.state.gateOpen, hingeAngle: hinge.rotation.y };
    },
  };
  return { checks: 'passed', tower: e.scene.getObjectByName('West observation tower').position.toArray(),
    permanentlyClosedServiceGate: true, wireExit: true };
})();
