// Targeted browser QA via agent-browser eval --stdin; staged positions, real F input.
(() => {
  if (window.__securityChecks) throw new Error('Reload the page before installing this staged check again');
  const e = window.__environment, m = e.mission, c = e.camera.perspective;
  if (!m.ready) throw new Error('Mission is not ready');
  const update = m.update.bind(m), securityUpdate = m.security.update.bind(m.security);
  e.player.update = () => false; e.camera.update = () => false; m.update = () => false;
  m.ai.update = () => {}; m.security.update = () => {};
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const vector = point => c.position.clone().fromArray(point);
  const style = document.createElement('style');
  style.textContent = 'body > :not(canvas):not(script){display:none!important}';
  document.head.append(style);
  const view = (eye, target, fov = 55) => {
    c.getObjectByName('First-person stickman arms').visible = false;
    c.position.fromArray(eye); c.lookAt(vector(target)); c.fov = fov;
    c.updateProjectionMatrix(); c.updateMatrixWorld(true); e.scene.updateMatrixWorld(true);
    e.renderer.render(e.scene, c);
  };
  window.__securityChecks = {
    view,
    office: () => view([-42.7,2.5,-46.5],[-47,1.3,-47.9],60),
    camera: () => view([-24.4,4,-30.6],[-20.16,3.45,-35.66],42),
    exit: () => view([-39,4.2,-26],[-24,2.6,-36],65),
    trees: () => view([125,18,81],[76,4,59],54),
    fence: () => view([85,13,43],[104,3,17],55),
    panel: () => view([122.5,2,-1.5],[125.4,1.25,-4.5],45),
    green() { m.state.camerasActive=true; m.state.camerasDisabledUntil=null; m.state.alarm='inactive'; m.security.sync(m.state); this.camera(); },
    red() { m.state.camerasActive=true; m.state.alarm='active'; m.security.sync(m.state); this.camera(); },
    async computer() {
      if (!e.player.enabled) e.player.enable(); e.player.playing=true;
      m.state.alarm='inactive'; m.state.camerasActive=true; m.state.camerasDisabledUntil=null;
      const station = m.world.stations.find(s => s.id === 'signals-office-computer');
      e.player.body.teleport(vector([station.point.x+1.75,0.285,station.point.z]));
      e.player.actions.syncCamera(c); c.lookAt(station.point); c.updateMatrixWorld(true);
      assert(e.player.actions.findTarget(c)?.object === station.object,'The office monitor must be the F target');
      window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',bubbles:true}));
      window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyF',bubbles:true}));
      assert(!m.state.camerasActive,'F must shut down cameras');
      assert(Math.abs(m.state.camerasDisabledUntil-m.state.elapsed-60)<1e-8,'Shutdown must last 60 seconds');
      update(0);
      const hud=document.querySelector('#mission-detail').textContent;
      assert(hud.includes('60s remaining'),'HUD must show remaining time');
      const saved=m.snapshot();
      e.player.playing=false; update(30);
      assert(m.state.elapsed===saved.mission.elapsed,'Pause must freeze the shutdown timer');
      e.player.playing=true;
      for(let i=0;i<1199;i++) update(0.05);
      assert(!m.state.camerasActive,'Cameras stay disabled before 60 seconds');
      update(0.1);
      assert(m.state.camerasActive,'Cameras recover after 60 seconds');
      m.restore(saved);
      assert(!m.state.camerasActive && Math.abs(m.state.camerasDisabledUntil-m.state.elapsed-60)<1e-8,'Checkpoint restores timer');
      m.restart();
      assert(m.state.camerasActive && m.state.camerasDisabledUntil===null,'Restart restores cameras');
      this.office();
      return {fInteraction:true,hud,pausedTimer:true,timedRecovery:true,checkpoint:true,restart:true};
    },
    scan() {
      const camera=m.world.rescue.cameras.find(c=>c.id==='mess-hall-exit-camera');
      m.state.camerasActive=true;m.state.alarm='inactive';
      const poses=[0,0.8,1.3,2,3,4].map(time=>{m.state.elapsed=time;m.security.sync(m.state);return camera.pivot.rotation.y;});
      assert(poses[0]===poses[1],'Camera must pause');assert(poses[2]!==poses[3],'Camera must turn');assert(poses[4]===poses[5],'Camera must pause again');
      m.state.elapsed=0; m.security.sync(m.state); this.camera();return {poses};
    },
    sound() {
      m.audio.setActive(true); void m.audio.unlock();
      return m.audio.diagnostics;
    },
    alarm() {
  const e=window.__environment,m=e.mission,c=e.camera.perspective;
  const assert=(value,message)=>{if(!value)throw new Error(message)};
  const panel=m.world.stations.find(station=>station.id==='detention-alarm');
  e.player.playing=true;
  e.player.body.teleport(c.position.clone().set(125.4,0.005,-2.3));
  e.player.actions.syncCamera(c); c.lookAt(panel.point); c.updateMatrixWorld(true);
  m.audio.update(c); m.security.trigger(m.state,e.player.body.position.clone());
  const source=m.audio.alarmSource;
  assert(source?.loop,'Alarm must create a loop');
  assert(source.buffer===m.audio.buffers.get('igi/alarm_1.wav'),'Alarm must use original IGI recording');
  const count=m.audio.diagnostics.sources;
  for(let i=0;i<50;i++)m.audio.setAlarm(true,e.player.body.position);
  assert(m.audio.diagnostics.sources===count,'Repeated alarm events must not stack');
  assert(e.player.actions.findTarget(c)?.object===panel.object,'F must target the alarm panel');
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',bubbles:true}));
  window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyF',bubbles:true}));
  assert(m.state.alarm==='silenced'&&!m.audio.diagnostics.alarm,'F must silence and stop the loop');
  const result={decodedDuration:source.buffer.duration,channels:source.buffer.numberOfChannels,originalIGILoop:true,noStacking:true,fSilencesAlarm:true};
  m.audio.setActive(false);m.restart();window.__securityChecks.office();return result;
    },
    securityUpdate,
  };
  return {ready:true,cameras:m.world.rescue.cameras.length,terminal:m.world.stations.find(s=>s.id==='signals-office-computer').point.toArray()};
})();
