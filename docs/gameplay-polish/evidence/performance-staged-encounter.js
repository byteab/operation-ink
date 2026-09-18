// Staged stress check, evaluated through agent-browser headless after a trusted Begin click.
// Repositions only the player, activates the existing reserve detail, emits one loud disturbance.
// Keeps health at 100 during measurement to keep the real encounter running; no AI/render bypass.
(async () => {
  const env = window.__environment, m = env.mission, p = env.player;
  if (!p.playing || !m.ready) throw new Error('Start the loaded mission through its real Begin button.');
  const point = p.body.position.clone().set(8, 0.12, -43);
  point.y = p.world.floor(point, 0.4, 1, 0.3) + 0.025;
  p.body.teleport(point); p.actions.syncCamera(env.camera.perspective);
  env.camera.perspective.lookAt(point.clone().add(point.clone().set(10, 1.4, 14)));
  m.ai.activateReserves(true, point);
  m.ai.hear({ kind: 'shot-ak', position: point.clone().add(point.clone().set(0, 1.5, 0)), radius: 160 });
  const initialShots = m.ai.enemies.reduce((n, e) => n + e.shots, 0);
  const samples = [], counts = [], navigation = [], calls = [], triangles = [];
  const started = performance.now(); let previous = started;
  await new Promise(resolve => {
    const frame = now => {
      m.state.health = 100;
      if (now - started > 2000) {
        samples.push(now - previous);
        counts.push({ combat: m.ai.enemies.filter(e => e.state === 'combat').length,
          investigate: m.ai.enemies.filter(e => ['investigate', 'search'].includes(e.state)).length,
          active: m.ai.enemies.filter(e => !['dead', 'reserve'].includes(e.state)).length });
        navigation.push(m.ai.navigationFrameMs);
        calls.push(env.renderer.info.render.calls); triangles.push(env.renderer.info.render.triangles);
      }
      previous = now;
      if (now - started < 10000) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
  const sorted = values => [...values].sort((a, b) => a - b);
  const summary = values => ({ min: Math.min(...values), mean: values.reduce((a, b) => a + b, 0) / values.length,
    p95: sorted(values)[Math.floor(values.length * 0.95)], max: Math.max(...values) });
  const gl = env.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const report = {
    condition: 'Staged outdoor water-tower encounter, 2s warmup plus 8s sample, live original actors and reserve routes, health held at 100 only to avoid ending sample.',
    viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, renderPixelRatio: env.renderer.getPixelRatio(),
    userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
    webgl: { version: gl.getParameter(gl.VERSION), vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) },
    frameCount: samples.length, frameMs: summary(samples), fps: 1000 / summary(samples).mean,
    over33ms: samples.filter(x => x > 33.34).length, over50ms: samples.filter(x => x > 50).length,
    navigationMs: summary(navigation), drawCalls: summary(calls), triangles: summary(triangles),
    active: summary(counts.map(c => c.active)), combat: summary(counts.map(c => c.combat)), investigate: summary(counts.map(c => c.investigate)),
    shotsDuringEncounter: m.ai.enemies.reduce((n, e) => n + e.shots, 0) - initialShots,
    playerPosition: p.body.position.toArray(), finalActors: m.ai.enemies.map(e => ({ id: e.spec.id, state: e.state, shots: e.shots })),
    geometries: env.renderer.info.memory.geometries, textures: env.renderer.info.memory.textures,
    playing: p.playing, missionPhase: m.state.phase,
  };
  p.pause(); m.update(0); window.__performanceReport = report;
  return report;
})()
