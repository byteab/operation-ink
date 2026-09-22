// Staged verification of real actors and level geometry through agent-browser.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { runAgentBrowser } from './agent-browser.mjs'
const browser = (...args) => runAgentBrowser('sharp-enemies', ...args)
const evaluate = code => browser('eval', '-b', Buffer.from(code).toString('base64'))
const directory = 'artifacts/enemy-ai/responsive-ai'
mkdirSync(directory, { recursive: true })
console.log(browser('open', 'http://localhost:5173'))
console.log(browser('wait', '--fn', 'window.__environment?.mission?.ready === true'))
console.log(browser('find', 'role', 'button', 'click', '--name', 'Begin mission'))
const output = evaluate(`(() => {
  const env=window.__environment,m=env.mission,ai=m.ai,camera=env.camera.perspective;
  m.update=()=>false;env.player.update=()=>false;
  const saved=ai.snapshot(), emit=ai.context.emit, damage=ai.context.damagePlayer;
  const results=[];let events=[],hits=0,time=0;
  ai.context.emit=e=>{if(e.kind.startsWith('enemy-shot'))events.push({time,kind:e.kind});emit(e)};
  ai.context.damagePlayer=n=>{hits+=n};
  const setup=(weapon,feet)=>{
    ai.restore(saved);events=[];hits=0;time=0;
    for(const e of ai.enemies){e.state='reserve';e.actor.root.visible=false}
    const e=ai.enemies.find(e=>e.spec.weapon===weapon&&!e.spec.reserve);
    e.position.set(0,.03,-58);e.yaw=Math.PI;e.actor.root.position.copy(e.position);e.actor.root.rotation.y=e.yaw;e.actor.root.visible=true;e.actor.restore('guard');
    Object.assign(e,{state:'guard',senseTimer:0,shotTimer:0,settledFor:0,canSee:false,lastKnown:null,shots:0});
    const player={feet:e.position.clone().fromArray(feet),eye:e.position.clone().fromArray(feet).add({x:0,y:1.65,z:0}),velocity:e.position.clone().set(0,0,0),alive:true,radioEnabled:false};
    camera.position.copy(player.eye);camera.lookAt(e.position.clone().add({x:0,y:1.5,z:0}));env.player.body.teleport(player.feet);
    return {e,player};
  };
  for(const weapon of ['pistol','ak','smg','sniper']){
    const {e,player}=setup(weapon,[0,.03,-70]);
    for(let i=0;i<96;i++){time=(i+1)/60;ai.update(1/60,player)}
    results.push({scenario:'first-contact',weapon,shots:e.shots,firstShot:events[0]?.time,damage:hits,travel:e.distanceWalked});
  }
  const {e,player}=setup('ak',[0,.03,-70]);
  for(let i=0;i<210;i++){time=(i+1)/60;if(i>20){player.velocity.x=2;player.feet.x+=2/60;player.eye.x=player.feet.x}e.tacticTimer=10;ai.update(1/60,player)}
  results.push({scenario:'moving-target',shots:e.shots,damage:hits,firstShot:events[0]?.time,lastShot:events.at(-1)?.time});
  // Capture the real weapon pose during a shot in the rendered scene.
  const shotCount=e.shots;
  for(let i=0;i<90&&e.shots===shotCount;i++)ai.update(1/60,player);
  camera.position.copy(player.eye);camera.lookAt(e.position.clone().add({x:0,y:1.4,z:0}));m.weapons.root.visible=false;env.renderer.render(env.scene,camera);
  ai.context.emit=emit;ai.context.damagePlayer=damage;
  window.__sharpAIResults=results;
  return results;
})()`)
const results = JSON.parse(output)
for (const result of results) {
  if (result.scenario === 'first-contact') assert(result.firstShot >= 0.8 && result.firstShot < 1.3, JSON.stringify(result))
  else assert(result.shots >= 8 && result.damage > 0 && result.lastShot > 3, JSON.stringify(result))
}
writeFileSync(`${directory}/runtime-results.json`, JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
console.log(browser('screenshot', `${directory}/tracking-fire.png`))
console.log(browser('errors'))
