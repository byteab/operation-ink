import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { runAgentBrowser } from './agent-browser.mjs'
const browser=(...args)=>runAgentBrowser('starting-loadout',...args)
const evaluate=code=>browser('eval','-b',Buffer.from(code).toString('base64'))
const directory='artifacts/starting-loadout';mkdirSync(directory,{recursive:true})
console.log(browser('open','http://localhost:5173'))
console.log(browser('wait','--fn','window.__environment?.mission?.ready === true'))
console.log(browser('snapshot','-i'))
console.log(browser('find','role','button','click','--name','Begin mission'))
console.log(evaluate(`(()=>{
 const env=__environment,m=env.mission;
 m.update=()=>false;env.player.update=()=>false;
 window.__loadoutFrame={active:true,climbing:false,moving:0,aiming:false,reducedMotion:false,feet:env.player.body.position};
 window.__loadoutStep=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++)m.weapons.update(1/60,__loadoutFrame);m.hud.update(0,m.state,{playing:true,enabled:true,label:m.weapons.label,ammo:m.weapons.ammo,reloading:m.weapons.reloading,blocked:m.weapons.blocked,alert:m.ai.alertLevel,position:env.player.body.position,yaw:0,deaths:m.deaths,ready:true});env.renderer.render(env.scene,env.camera.perspective)};
 return {loadout:m.weapons.slots.map(w=>w.name),ready:m.ready};
})()`))
const loadout=JSON.parse(evaluate('__environment.mission.weapons.slots.map(w=>w.name)'))
assert.deepEqual(loadout,['pistol','shotgun','ak','smg'])
// Exercise the real keyboard handler, rather than directly assigning a selected slot.
const selected=[]
for(const [key,name] of [['1','pistol'],['2','shotgun'],['3','ak'],['4','smg']]){
 console.log(browser('press',key))
 const result=JSON.parse(evaluate(`__loadoutStep(.3);({name:__environment.mission.weapons.current.name,ammo:__environment.mission.weapons.ammo})`))
 assert.equal(result.name,name);selected.push(result)
}
console.log(browser('press','2'))
console.log(evaluate('__loadoutStep(.3);true'))
console.log(browser('screenshot',directory+'/starting-shotgun.png'))
const shotgun=JSON.parse(evaluate(`(()=>{
 const m=__environment.mission,w=m.weapons,original=w.context.onShot,shots=[];
 w.context.onShot=s=>shots.push({weapon:s.weapon,pellet:s.pelletIndex,direction:s.direction.toArray()});
 const before=w.current.magazine;w.trigger(true);w.trigger(false);__loadoutStep(.25);
 const pump=w.model.userData.parts.pump.position.z,after=w.current.magazine;
 __loadoutStep(1);w.reload();__loadoutStep(.7);
 w.context.onShot=original;
 return {before,after,reloaded:w.current.magazine,reserve:w.current.reserve,pellets:shots.length,pump};
})()`))
assert.equal(shotgun.pellets,8);assert.equal(shotgun.after,shotgun.before-1);assert.equal(shotgun.reloaded,6);assert(shotgun.pump<.24)
const timing=JSON.parse(evaluate(`(()=>{
 const env=__environment,m=env.mission,ai=m.ai,saved=ai.snapshot();
 for(const e of ai.enemies){e.state='reserve';e.actor.root.visible=false}
 const e=ai.enemies.find(e=>e.spec.weapon==='ak');
 e.position.set(0,.03,-58);e.yaw=Math.PI;e.actor.root.position.copy(e.position);e.actor.root.rotation.y=e.yaw;e.actor.root.visible=true;e.actor.restore('guard');
 Object.assign(e,{state:'guard',senseTimer:0,contactMemory:0,canSee:false,lastKnown:null,shotTimer:0,shots:0});
 const p={feet:e.position.clone().set(0,.03,-70),eye:e.position.clone().set(0,1.68,-70),velocity:e.position.clone().set(0,0,0),alive:true,radioEnabled:false};
 ai.context.damagePlayer=()=>{};
 let first=null;for(let i=0;i<90;i++){ai.update(1/60,p);if(e.shots&&first===null)first=(i+1)/60}
 // Force actual sight loss and reacquisition while retaining the combat state.
 p.feet.z=p.eye.z=-150;for(let i=0;i<20;i++)ai.update(1/60,p);
 const before=e.shots;p.feet.z=p.eye.z=-70;e.tacticTimer=10;
 let reacquired=null;for(let i=0;i<90;i++){ai.update(1/60,p);if(e.shots>before&&reacquired===null)reacquired=(i+1)/60}
 ai.restore(saved);return {first,reacquired};
})()`))
assert(timing.first>=.8&&timing.first<1.3);assert(timing.reacquired>=.8&&timing.reacquired<1.4)
const report={loadout,selected,shotgun,timing}
writeFileSync(directory+'/starting-loadout-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
console.log(browser('errors'))
