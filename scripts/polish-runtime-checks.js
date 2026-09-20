// Staged integration checks for agent-browser eval --stdin, never production code.
// Requires a real Begin mission click first. The coordinator separately runs input-only playthroughs.
(() => {
  const env = window.__environment, m = env.mission, p = env.player;
  const results = [];
  const assert = (name, ok, data = {}) => {
    const result = { name, pass: Boolean(ok), ...data }; results.push(result);
    if (!ok) throw new Error(JSON.stringify(result));
  };
  const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.polishReview = {
    results,
    async health() {
      assert('Trusted Begin mission click starts audio and two loops', p.playing && m.audio.status === 'running' && m.audio.diagnostics.sources === 2, m.audio.diagnostics);
      m.damage(31, env.camera.perspective.position.clone().addScalar(3));
      await frames();
      assert('Health changes by next presented frame', m.state.health === 69 && document.querySelector('#mission-health').getAttribute('aria-valuenow') === '69', { health: m.state.health });
      assert('Heart fill and accessible value agree', Math.abs(Number(document.querySelector('.health-fill').getAttribute('height')) - 48 * 0.69) < 1e-6 && document.querySelector('#mission-health').getAttribute('aria-valuetext') === '69 of 100');
      return results;
    },
    async audio() {
      m.audio.clear(); m.audio.update(env.camera.perspective);
      const before = m.audio.diagnostics;
      for (let i = 0; i < 20; i++) m.audio.play({ kind: 'callout', voice: 'contact', speaker: i % 4 });
      const after = m.audio.diagnostics;
      assert('Callout burst accepts one voice and suppresses overlap', after.acceptedVoices - before.acceptedVoices === 1 && after.suppressedVoices - before.suppressedVoices === 19, after);
      m.audio.setMuted(true);
      const count = m.audio.diagnostics.sources;
      m.audio.play({ kind: 'shot-pistol' });
      assert('Mute blocks new event sources and zeroes output', m.audio.diagnostics.sources === count && m.audio.master.gain.value === 0);
      m.audio.setMuted(false);
      assert('Unmute restores configured volume', m.audio.master.gain.value === Math.fround(0.55));
      p.pause(); m.update(0);
      await frames();
      assert('Pause clears every source and suspends context', m.audio.diagnostics.sources === 0 && !m.audio.diagnostics.music && m.audio.status === 'suspended', m.audio.diagnostics);
      m.audio.play({ kind: 'callout', voice: 'search', speaker: 2 });
      assert('Paused callouts cannot create sources', m.audio.diagnostics.sources === 0);
      return results;
    },
    async death() {
      assert('Death test starts through Resume click', p.playing);
      m.damage(200);
      await frames();
      assert('Lethal damage ends play and displays recovery', m.state.phase === 'dead' && m.state.health === 0 && !p.playing && document.querySelector('.walk-card h1').textContent === 'No way through.');
      assert('Death clears audio and scope', !m.audio.diagnostics.active && m.audio.diagnostics.sources === 0 && document.querySelector('.mission-scope').hidden);
      return results;
    },
    async recovered() {
      await frames();
      assert('Trusted Retry checkpoint click restores health and idle audio', m.state.health === 100 && m.state.phase === 'active' && document.querySelector('#mission-health').getAttribute('aria-valuenow') === '100' && m.audio.diagnostics.sources === 0);
      return results;
    },
    impacts() {
      const point = env.camera.perspective.position.clone().addScalar(0.5);
      const direction = point.clone().set(0, 0, -1);
      for (let i = 0; i < 40; i++) m.impacts.emit(point, direction);
      assert('Impact bursts capped at 80 instanced chips', m.impacts.mesh.count === 80, { count: m.impacts.mesh.count });
      for (let i = 0; i < 30; i++) m.impacts.update(1 / 60);
      assert('All impact chips expire', m.impacts.mesh.count === 0);
      m.impacts.emit(point, direction);
      m.restart(); m.update(0);
      assert('Restart clears transient effects and health', m.impacts.mesh.count === 0 && m.bulletTrails.count === 0 && m.ai.bulletTrails.count === 0 && m.state.health === 100 && m.audio.diagnostics.sources === 0);
      return results;
    },
    surfaceShot() {
      assert('Surface shot starts in active gameplay', p.playing);
      const origin = env.camera.perspective.position.clone();
      const direction = env.camera.perspective.getWorldDirection(origin.clone());
      const distance = p.world.rayDistance(origin, direction, 110);
      assert('Staged insertion sightline ends on actual solid geometry', distance > 0 && distance < 110, { distance });
      m.impacts.clear();
      m.shot({ origin, direction, range: 110, damage: 30, weapon: 'pistol' });
      const expected = origin.clone().addScaledVector(direction, distance - 0.015);
      assert('Authoritative runtime world hit emits chips at raycast surface', m.impacts.mesh.count === 7 && m.impacts.chips.every(chip => chip.position.distanceTo(expected) < 1e-7), { count: m.impacts.mesh.count, expected: expected.toArray() });
      return results;
    },
    world() {
      const snapshot = m.ai.snapshot();
      const guards = snapshot.filter(enemy => /relay-patrol|crew-patrol|dispatch-guard|maintenance-guard/.test(enemy.id));
      assert('Four active house guards exist', guards.length === 4 && guards.every(enemy => enemy.health === 100 && enemy.state === 'patrol'), { guards: guards.map(enemy => ({ id: enemy.id, position: enemy.position, state: enemy.state })) });
      const snipers = m.world.enemies.filter(enemy => enemy.role === 'sniper');
      assert('Two tower marksmen have supported stationary posts', snipers.length === 2 && snipers.every(enemy => {
        const point = p.body.position.clone().fromArray(enemy.position);
        return enemy.patrol.length === 1 && Math.abs(p.world.floor(point, 0.1, 0.3) - point.y) < 0.05;
      }), { snipers });
      return results;
    },
    async dispose() {
      m.audio.dispose(); await frames();
      assert('Audio disposal clears nodes and closes context', m.audio.diagnostics.disposed && m.audio.diagnostics.sources === 0 && m.audio.status === 'locked');
      return results;
    },
  };
  return 'Staged integration checks installed; use polishReview.health(), audio(), death(), recovered(), impacts(), world(), dispose().';
})()
