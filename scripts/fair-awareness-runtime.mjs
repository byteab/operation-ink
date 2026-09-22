// Live-map checks via the user-requested agent-browser. Uses a dedicated session.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { runAgentBrowser } from './agent-browser.mjs'
const browser = (...args) => runAgentBrowser('fair-enemies', ...args)
const evaluate = code => browser('eval', '-b', Buffer.from(code).toString('base64'))
const directory = 'artifacts/enemy-ai/fair-awareness'
mkdirSync(directory, { recursive: true })
console.log(browser('open', 'http://localhost:5173'))
console.log(browser('wait', '--fn', 'window.__environment?.mission?.ready === true'))
console.log(browser('snapshot', '-i'))
console.log(browser('find', 'role', 'button', 'click', '--name', 'Begin mission'))
console.log(evaluate(`(() => {
  const env=__environment,m=env.mission;
  m.update=()=>false;env.player.update=()=>false;
  env.renderer.render(env.scene,env.camera.perspective);
  return {spawn:m.world.spawn,position:env.player.body.position.toArray(),health:m.state.health};
})()`))
console.log(browser('screenshot', directory+'/rear-insertion.png'))
const output = evaluate(`(() => {
  const env=__environment,m=env.mission,ai=m.ai;
  const initial=ai.snapshot(); let barks=[],damage=0;
  const emit=ai.context.emit;
  ai.context.emit=e=>{if(e.voice==='spot'||e.voice==='contact')barks.push(e.text)};
  ai.context.damagePlayer=n=>{damage+=n};
  const sense=feet=>({feet,eye:feet.clone().add({x:0,y:1.65,z:0}),velocity:feet.clone().set(0,0,0),alive:true,radioEnabled:true});
  const step=(seconds,p)=>{for(let i=0;i<Math.ceil(seconds*60);i++)ai.update(1/60,p)};
  const results=[];
  const p=sense(env.player.body.position.clone());step(15,p);
  results.push({scenario:'rear-insertion-15s',spawn:m.world.spawn,shots:ai.enemies.reduce((n,e)=>n+e.shots,0),damage,barks:[...barks]});
  for(const weapon of ['ak','sniper']){
    ai.restore(initial);barks=[];damage=0;
    for(const e of ai.enemies){e.state='reserve';e.actor.root.visible=false}
    const e=ai.enemies.find(e=>e.spec.weapon===weapon&&!e.spec.reserve),originalSpec=e.spec;
    e.spec={...e.spec,position:[0,.03,-58],patrol:[],facing:Math.PI/2};
    e.position.set(0,.03,-58);e.yaw=Math.PI/2;e.actor.root.position.copy(e.position);e.actor.root.rotation.y=e.yaw;e.actor.root.visible=true;e.actor.restore('guard');
    Object.assign(e,{state:'guard',contactMemory:0,senseTimer:0,canSee:false,lastKnown:null,shots:0,shotTimer:0});
    const p=sense(e.position.clone().set(weapon==='sniper'?85:45,.03,-57.35));
    step(3,p);const idle={shots:e.shots,barks:[...barks],canSee:e.canSee};
    const scan=ai.nearMiss({origin:p.eye.clone(),direction:e.position.clone().set(-1,0,0),range:110,damage:10},110);
    ai.hear({kind:'shot-pistol',position:p.eye.clone(),radius:8});
    step(1.3,p);
    results.push({scenario:'distant-'+weapon,idle,scan,afterVisibleMiss:{shots:e.shots,canSee:e.canSee,contactMemory:e.contactMemory,barks:[...barks]}});
    e.spec=originalSpec;
  }
  ai.restore(initial);barks=[];
  for(const e of ai.enemies)e.state='reserve';
  const guard=ai.enemies.find(e=>e.spec.id==='mess-kitchen');
  guard.state='guard';guard.senseTimer=0;guard.yaw=-Math.PI/2;
  const outside=sense(guard.position.clone().set(-50,.03,-56.4));
  ai.update(1/60,outside);
  ai.hear({kind:'footstep',position:outside.feet,radius:48});
  results.push({scenario:'indoor-guard-outside-footsteps',canSee:guard.canSee,state:guard.state,shots:guard.shots,contactMemory:guard.contactMemory,barks:[...barks]});
  ai.context.emit=emit;
  return results;
})()`)
const results=JSON.parse(output)
const spawn=results[0]
assert.equal(spawn.shots,0);assert.equal(spawn.damage,0);assert.equal(spawn.barks.length,0)
for(const result of results.slice(1,3)){
  assert.equal(result.idle.shots,0);assert.equal(result.idle.barks.length,0);assert.equal(result.idle.canSee,false)
  assert(result.scan>0);assert(result.afterVisibleMiss.shots>0);assert(result.afterVisibleMiss.canSee)
}
const indoor=results[3]
assert.equal(indoor.canSee,false);assert.equal(indoor.shots,0);assert.equal(indoor.contactMemory,0);assert.equal(indoor.barks.length,0)
writeFileSync(directory+'/fair-awareness-results.json',JSON.stringify(results,null,2)+'\n')
console.log(JSON.stringify(results,null,2))
console.log(browser('errors'))
