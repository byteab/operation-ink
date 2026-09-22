// agent-browser eval --stdin < scripts/rescue-input-run.js
// A repeatable INPUT harness, not a state simulation. It reads diagnostics but
// only dispatches mouse/keyboard events: no teleport, health edits, mission
// mutations, clock acceleration, collision bypass or direct action calls.
(() => {
  const e = window.__environment;
  if (!e?.mission?.ready) throw new Error('Mission not ready');
  window.__rescueInputRun?.dispose();
  const log = [], held = new Set();
  const runner = { queue: [], index: 0, running: false, combat: false, log, started: 0, since: 0,
    run(steps, combat = false) { this.queue=steps;this.index=0;this.combat=combat;this.running=true;this.started=performance.now();this.since=performance.now();this.error=null;log.push({event:'start',elapsed:e.mission.state.elapsed,position:e.player.body.position.toArray()}); },
    stop() { this.running=false;for(const key of [...held]) keyUp(key); },
    status() { return {running:this.running,index:this.index,step:this.queue[this.index],error:this.error,position:e.player.body.position.toArray(),mission:{...e.mission.state},log:log.slice(-8)}; },
  };
  const keyDown = code => { if(held.has(code))return;held.add(code);window.dispatchEvent(new KeyboardEvent('keydown',{code,key:code.replace('Key',''),bubbles:true})); };
  const keyUp = code => { if(!held.delete(code))return;window.dispatchEvent(new KeyboardEvent('keyup',{code,key:code.replace('Key',''),bubbles:true})); };
  const tap = code => {keyDown(code);keyUp(code);};
  const aim = point => {
    const camera=e.camera.perspective,from=camera.position,dir=camera.getWorldDirection(from.clone());
    const currentYaw=Math.atan2(-dir.x,-dir.z),desiredYaw=Math.atan2(from.x-point.x,from.z-point.z);
    const difference=Math.atan2(Math.sin(currentYaw-desiredYaw),Math.cos(currentYaw-desiredYaw));
    const pitch=Math.asin(dir.y),desiredPitch=Math.atan2(point.y-from.y,Math.hypot(point.x-from.x,point.z-from.z));
    document.dispatchEvent(new MouseEvent('mousemove',{movementX:difference/0.0022,movementY:(pitch-desiredPitch)/0.0022,bubbles:true}));
  };
  const vec = (x,y,z) => e.player.body.position.clone().set(x,y,z);
  let lastUse=0,lastShot=0,frame;
  const next = () => {for(const key of [...held])keyUp(key);log.push({event:'step',step:runner.queue[runner.index],time:(performance.now()-runner.started)/1000,position:e.player.body.position.toArray(),health:e.mission.state.health});runner.index++;runner.since=performance.now();};
  const loop = now => {
    frame=requestAnimationFrame(loop);
    if(!runner.running)return;
    if(e.mission.state.phase!=='active') {runner.stop();log.push({event:'end',phase:e.mission.state.phase,elapsed:e.mission.state.elapsed});return;}
    if(!e.player.playing){runner.stop();runner.error='Mission paused or pointer lock lost';return;}
    const step=runner.queue[runner.index];
    if(!step){runner.stop();tap('Escape');return;}
    if(now-runner.since>(step.timeout??45000)){runner.error='Step timed out';runner.stop();return;}
    if(e.player.actions.climbing){keyUp('KeyW');keyUp('ShiftLeft');return;}
    if(runner.combat){
      const feet=e.player.body.position,eye=e.camera.perspective.position;
      const model=e.mission.weapons.model;
      const muzzle=model?model.localToWorld(model.userData.muzzle.clone()):eye;
      const targets=e.mission.ai.enemies.filter(n=>n.state!=='dead'&&n.state!=='reserve'&&n.position.distanceTo(feet)<60&&e.player.world.visible(eye,n.position.clone().add(vec(0,1.35,0)),n.actor.root)&&e.player.world.visible(muzzle,n.position.clone().add(vec(0,1.35,0)),n.actor.root));
      targets.sort((a,b)=>a.position.distanceTo(feet)-b.position.distanceTo(feet));
      if(targets[0] && (e.mission.weapons.current?.magazine || e.mission.weapons.current?.reserve)){
        keyUp('KeyW');keyUp('ShiftLeft');aim(targets[0].position.clone().add(vec(0,1.35,0)));
        if(!e.mission.weapons.current?.magazine)tap('KeyR');
        else if(now-lastShot>130){lastShot=now;const canvas=document.querySelector('#world');canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));}
        return;
      }
    }
    if(step.wait){keyUp('KeyW');if(now-runner.since>=step.wait*1000)next();return;}
    if(step.key){tap(step.key);next();return;}
    if(step.move){
      const [x,z]=step.move,p=e.player.body.position,distance=Math.hypot(x-p.x,z-p.z);
      if(distance<(step.tolerance??0.24)){next();return;}
      aim(vec(x,e.camera.perspective.position.y,z));
      if(step.sprint)keyDown('ShiftLeft');else keyUp('ShiftLeft');
      const action=e.player.actions.findTarget(e.camera.perspective);
      if(action?.kind==='door'&&!action.object.userData.open&&now-lastUse>900){keyUp('KeyW');lastUse=now;tap('KeyF');return;}
      keyDown('KeyW');return;
    }
    if(step.use || step.station || step.stationId){
      keyUp('KeyW');keyUp('ShiftLeft');
      let point;
      if(step.station || step.stationId){point=e.mission.world.stations.find(s=>step.stationId ? s.id===step.stationId : s.kind===step.station).point;}
      else{const object=e.player.actions.ladders.find(o=>o.name.includes(step.use));if(!object)throw new Error(step.use);point=e.player.actions.ladderPoint(object,!!step.down);point.y+=step.down?0.85:1.25;}
      aim(point);
      const action=e.player.actions.findTarget(e.camera.perspective);
      if(action && ((step.station || step.stationId)?action.kind==='mission':action.kind==='ladder')){tap('KeyF');next();}
      return;
    }
  };
  requestAnimationFrame(loop);
  const stop=runner.stop.bind(runner);runner.stop=()=>{stop();};
  runner.dispose=()=>{stop();cancelAnimationFrame(frame)};
  window.__rescueInputRun=runner;
  return 'Input-only harness installed. Call __rescueInputRun.run([...]); read status().';
})()
