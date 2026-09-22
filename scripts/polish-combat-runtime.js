// Independent, explicitly staged browser verification; every browser command uses agent-browser headless.
import { mkdirSync, writeFileSync } from 'node:fs'
import { runAgentBrowser } from './agent-browser.mjs'
const root = new URL('../', import.meta.url).pathname
const evidenceDirectory = `${root}artifacts/gameplay-polish/evidence/combat`
mkdirSync(evidenceDirectory, { recursive: true })
const browser = (...args) => runAgentBrowser('polish-review-combat', '--headed', 'false', ...args)
const evaluate = code => browser('eval', '-b', Buffer.from(code).toString('base64'))
const screenshot = name => console.log(browser('screenshot', `${evidenceDirectory}/${name}.png`))
const setup = `(() => {
  const env=window.__environment,m=env.mission,camera=env.camera.perspective;
  if(!window.__combatReview){window.__combatReview={missionUpdate:m.update.bind(m),playerUpdate:env.player.update.bind(env.player)};m.update=()=>false;env.player.update=()=>false;}
  const review=window.__combatReview;
  camera.position.set(0,1.8,-55);camera.lookAt(14,4,-34);env.player.body.teleport(camera.position.clone().setY(.03));
  review.frame={active:true,climbing:false,moving:0,aiming:false,reducedMotion:false,feet:env.player.body.position};
  review.render=()=>{m.hud.setScoped(m.weapons.scoped);m.hud.update(0,m.state,{playing:true,enabled:true,label:m.weapons.label,ammo:m.weapons.ammo,reloading:m.weapons.reloading,blocked:m.weapons.blocked,alert:m.ai.alertLevel,position:env.player.body.position,yaw:0,deaths:m.deaths,ready:true});env.renderer.render(env.scene,camera);};
  review.step=(time)=>{for(let t=0;t<time-1e-8;t+=1/60)m.weapons.update(Math.min(1/60,time-t),review.frame);review.render();};
  review.equip=(name)=>{m.weapons.restore({slots:[{id:'review-'+name,name,magazine:name==='sniper'?5:name==='ak'?30:name==='smg'?24:12,reserve:60},{id:'review-sidearm',name:'pistol',magazine:12,reserve:36}],selected:0,pickups:[],nextId:100});review.frame.aiming=false;review.step(.3);};
  review.stats=()=>({weapon:m.weapons.current?.name,ammo:m.weapons.ammo,blocked:m.weapons.blocked,scoped:m.weapons.scoped,fov:camera.fov,rootVisible:m.weapons.root.visible,hand:m.weapons.leftHand.position.toArray(),arms:m.weapons.arms.map(a=>({upper:a.upper.scale.y,fore:a.fore.scale.y})),flash:m.weapons.flash.visible});
  return {staged:true,position:camera.position.toArray()};
})()`
const mode = process.argv[2] ?? 'weapons'
if (mode === 'weapons') {
  console.log(evaluate(setup))
  for (const resolution of [[1440,900],[1024,768]]) {
    console.log(browser('set','viewport',...resolution.map(String)))
    for (const name of ['pistol','ak','smg','sniper']) {
      console.log(evaluate(`__combatReview.equip('${name}');__combatReview.stats()`));screenshot(`${resolution[0]}-${name}-idle`)
      console.log(evaluate('__combatReview.frame.aiming=true;__combatReview.step(.4);__combatReview.stats()'));screenshot(`${resolution[0]}-${name}-aim`)
      console.log(evaluate('__combatReview.frame.aiming=false;__combatReview.step(.4);__environment.mission.weapons.trigger(true);__combatReview.step(1/60);__environment.mission.weapons.trigger(false);__combatReview.stats()'));screenshot(`${resolution[0]}-${name}-fire`)
      console.log(evaluate('__combatReview.step(.2);__environment.mission.weapons.reload();__combatReview.step(.01);__combatReview.stats()'))
      const reload = {pistol:1.85,ak:2.3,smg:2.05,sniper:2.9}[name]
      for (const phase of [20,40,60,80,100]) {
        console.log(evaluate(`__combatReview.step(${reload/5});__combatReview.stats()`));screenshot(`${resolution[0]}-${name}-reload-${phase}`)
      }
      console.log(evaluate('__environment.mission.weapons.switchSlot(1);__combatReview.step(.08);__combatReview.stats()'));screenshot(`${resolution[0]}-${name}-switch`)
    }
  }
}
if(mode==='eval') console.log(evaluate(process.argv[3]))
if(mode==='screenshot') screenshot(process.argv[3])
if(mode==='setup') console.log(evaluate(setup))
if(mode==='actors') {
  console.log(browser('set','viewport','1440','900'))
  console.log(evaluate(`(() => {
    const env=__environment,m=env.mission,r=__combatReview,camera=env.camera.perspective;
    r.enemySnapshot=m.ai.snapshot();r.target=m.ai.enemies[0];
    for(const e of m.ai.enemies){e.state='reserve';e.actor.root.visible=false;}
    const e=r.target;e.position.set(0,.03,-58);e.yaw=Math.PI;e.health=100;e.state='guard';e.actor.root.visible=true;e.actor.root.position.copy(e.position);e.actor.root.rotation.y=e.yaw;
    camera.position.set(0,1.5,-62);camera.lookAt(e.position.clone().add({x:0,y:1,z:0}));env.player.body.teleport(camera.position.clone().setY(.03));
    r.resetTarget=()=>{e.health=100;e.state='guard';e.actor.restore('guard');m.blood.clear();m.bulletTrails.clear();};
    r.hitBone=(bone,damage=1,weapon='pistol')=>{
      const volume=e.actor.hitVolumes.volumes().find(v=>v.bone===bone),point=volume.a.clone().lerp(volume.b,.5);
      let origin,direction,predicted;
      for(const offset of [[0,0,-3],[3,0,0],[-3,0,0],[0,0,3],[0,3,-1]]) {
        origin=point.clone().add({x:offset[0],y:offset[1],z:offset[2]});direction=point.clone().sub(origin).normalize();predicted=e.actor.hitVolumes.raycast(origin,direction,5);
        if(predicted?.bone===bone)break;
      }
      m.shot({origin,direction,range:5,damage,weapon});e.actor.update(.08,e.state,false);m.blood.update(.035);r.render();
      return {requested:bone,predicted:predicted&&{bone:predicted.bone,zone:predicted.zone,point:predicted.point.toArray()},actualPoint:m.impactPoint?.toArray(),health:e.health,mode:e.actor.mode,reaction:e.actor.reactionRemaining,animation:e.actor.animationTime,blood:m.blood.snapshot().droplets.length,state:e.state};
    };
    m.weapons.root.visible=false;r.resetTarget();r.render();return {target:e.spec.id,position:e.position.toArray()};
  })()`))
  screenshot('actor-baseline')
  for(const bone of ['head','chest','upper_arm.L','upper_arm.R','thigh.L','thigh.R']) {
    console.log(evaluate(`__combatReview.resetTarget();__combatReview.hitBone('${bone}')`));screenshot(`hit-${bone.replace('.','-')}`)
    console.log(evaluate(`__combatReview.hitBone('${bone}')`));screenshot(`repeat-${bone.replace('.','-')}`)
  }
  console.log(evaluate("__combatReview.resetTarget();__combatReview.hitBone('head',30,'pistol')"));screenshot('pistol-head-survives')
  console.log(evaluate("__combatReview.resetTarget();__combatReview.hitBone('head',65,'sniper');for(let t=0;t<.7;t+=1/60){__combatReview.target.actor.update(1/60,'dead',false);__environment.mission.blood.update(1/60);}__combatReview.render();({state:__combatReview.target.state,health:__combatReview.target.health,clip:__combatReview.target.actor.mode})"));screenshot('sniper-head-death')
}
if(mode==='ai') {
  console.log(evaluate(`(() => {
    const env=__environment,m=env.mission,r=__combatReview,ai=m.ai;
    r.fresh=()=>{ai.restore(m.initial.enemies);m.state.health=100;m.state.phase='active';for(const e of ai.enemies){e.state='reserve';e.actor.root.visible=false;}m.bulletTrails.clear();m.blood.clear();};
    r.sense=(feet)=>({feet,eye:feet.clone().add({x:0,y:1.65,z:0}),velocity:feet.clone().set(0,0,0),alive:true,radioEnabled:false});
    r.results=[];r.events=[];r.surface=[];r.damage=[];
    r.originalEmit=ai.context.emit;r.originalDamage=ai.context.damagePlayer;r.originalSurface=ai.context.onSurfaceHit;
    ai.context.emit=event=>{if(event.kind.startsWith('enemy-shot'))r.events.push({kind:event.kind,radius:event.radius,time:r.simTime,moveSpeed:r.activeEnemy.moveSpeed,settled:r.activeEnemy.settledFor,canSee:r.activeEnemy.canSee,position:r.activeEnemy.position.toArray()});r.originalEmit(event);};
    ai.context.damagePlayer=(amount,source)=>r.damage.push({amount,source:source.toArray()});
    ai.context.onSurfaceHit=(point,direction)=>{r.surface.push(point.toArray());r.originalSurface?.(point,direction);};
    r.sim=(seconds,sense)=>{let maxLateral=0,moving=0;const modes=new Set(),states=new Set();for(let t=0;t<seconds;t+=1/60){r.simTime=t;const old=r.activeEnemy.position.clone();ai.update(1/60,sense);m.impacts.update(1/60);m.blood.update(1/60);const delta=r.activeEnemy.position.clone().sub(old);if(delta.length()>.0001){moving++;delta.normalize();maxLateral=Math.max(maxLateral,Math.abs(delta.x*Math.cos(r.activeEnemy.yaw)-delta.z*Math.sin(r.activeEnemy.yaw)));}modes.add(r.activeEnemy.actor.mode);states.add(r.activeEnemy.state);}return{maxLateral,moving,modes:[...modes],states:[...states]};};
    return {ready:true};
  })()`))
  for(const [id,point] of [['water-sniper',[29.616453021445817,.029,-24.049735805647156]],['watch-sniper',[-35.472077938642144,.029,4.172077938642143]]]) {
    console.log(evaluate(`(() => {
      const r=__combatReview,env=__environment,m=env.mission,ai=m.ai;r.fresh();r.events=[];r.surface=[];r.damage=[];
      const e=ai.enemies.find(e=>e.spec.id==='${id}');r.activeEnemy=e;e.state='guard';e.actor.root.visible=true;
      const start=e.position.clone(),sense=r.sense(start.clone().fromArray(${JSON.stringify(point)}));
      const initialSees=ai.sees(e,sense);env.camera.perspective.position.copy(sense.eye);env.camera.perspective.lookAt(e.position.clone().add({x:0,y:1.5,z:0}));
      const motion=r.sim(12,sense);m.weapons.root.visible=false;r.render();
      const result={id:'${id}',initialSees,position:start.toArray(),target:sense.feet.toArray(),displacement:e.position.distanceTo(start),shots:r.events,damage:r.damage,surface:r.surface,motion};r.results.push(result);return result;
    })()`));screenshot(`${id}-engaging`)
  }
  console.log(evaluate(`(() => {
    const r=__combatReview,m=__environment.mission,ai=m.ai;r.fresh();const e=ai.enemies[0];r.activeEnemy=e;e.state='patrol';e.actor.root.visible=true;r.events=[];
    const far=r.sense(e.position.clone().set(-190,.03,-90));const patrol=r.sim(12,far);
    const before=e.position.clone();ai.hear({kind:'shot-pistol',position:e.position.clone().add({x:6,y:1.4,z:3}),radius:38});
    const heard={state:e.state,known:e.lastKnown?.toArray(),canSee:e.canSee};const investigation=r.sim(30,far);
    const result={id:'patrol-hearing-search',patrol,heard,investigation,finalState:e.state,travel:e.position.distanceTo(before),shots:r.events.length};r.results.push(result);return result;
  })()`))
  const results=evaluate(`(()=>{const r=__combatReview,ai=__environment.mission.ai;ai.context.emit=r.originalEmit;ai.context.damagePlayer=r.originalDamage;ai.context.onSurfaceHit=r.originalSurface;return r.results;})()`)
  writeFileSync(`${evidenceDirectory}/ai-results.json`,results+'\n');console.log(results)
}
if(mode==='video') {
  console.log(browser('set','viewport','1280','720'))
  console.log(browser('record','start',`${evidenceDirectory}/weapon-motion-final.webm`))
  console.log(browser('wait','--fn','window.__environment?.mission?.ready === true'))
  console.log(browser('find','role','button','click','--name','Begin mission'))
  console.log(evaluate(setup))
  console.log(evaluate(`(async()=>{
    const r=__combatReview,m=__environment.mission;
    const animate=seconds=>new Promise(resolve=>{let last=performance.now(),elapsed=0;const tick=now=>{const dt=Math.min((now-last)/1000,.05);last=now;elapsed+=dt;m.weapons.update(dt,r.frame);m.impacts.update(dt);m.blood.update(dt);r.render();if(elapsed<seconds)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
    for(const [name,duration] of [['pistol',1.85],['ak',2.3],['smg',2.05],['sniper',2.9]]){
      r.equip(name);await animate(.4);r.frame.aiming=true;await animate(.6);r.frame.aiming=false;await animate(.25);m.weapons.trigger(true);await animate(.06);m.weapons.trigger(false);await animate(.1);m.weapons.reload();await animate(duration+.1);m.weapons.switchSlot(1);await animate(.3);
    }return {complete:true,fov:__environment.camera.perspective.fov};
  })()`))
  console.log(browser('record','stop'))
  for(const height of [720,577]) {
    console.log(browser('set','viewport','1280',String(height)))
    for(const name of ['pistol','sniper']) {console.log(evaluate(`__combatReview.equip('${name}');__combatReview.stats()`));screenshot(`1280x${height}-${name}-idle`)}
  }
}
