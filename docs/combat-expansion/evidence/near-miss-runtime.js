(()=>{
const env=window.__environment,m=env.mission,p=env.player,ai=m.ai,v=(x=0,y=0,z=0)=>p.body.position.clone().set(x,y,z);
for(const e of ai.enemies){e.state='reserve';e.actor.root.visible=false;}
const e=ai.enemies[0];Object.assign(e,{state:'guard',health:100,canSee:false,suspicion:0,scanTimer:0,scanCooldown:0,senseTimer:0,yaw:0});e.position.set(130,0,60);e.actor.root.position.copy(e.position);e.actor.root.rotation.y=0;e.actor.root.visible=true;e.actor.update(1,'guard',false);
const origin=v(129.3,1.1,50),direction=v(0,0,1),before=e.health;m.shot({origin,direction,range:20,damage:34,weapon:'pistol'});
const afterShot={health:e.health,state:e.state,scanTimer:e.scanTimer,lastKnown:e.lastKnown?.toArray(),muzzleDistance:e.lastKnown?.distanceTo(origin)};
if(e.health!==before||e.state!=='suspicious'||e.scanTimer<=1||afterShot.muzzleDistance<9)throw Error(JSON.stringify(afterShot));
const position=e.position.clone(),yaw=e.yaw,sense={feet:v(-100,0,-70),eye:v(-100,1.65,-70),velocity:v(),alive:true,radioEnabled:false};
for(let i=0;i<30;i++)Object.getPrototypeOf(ai).update.call(ai,1/60,sense);
const scanned={health:e.health,state:e.state,yawDelta:e.yaw-yaw,moved:e.position.distanceTo(position),scanTimer:e.scanTimer};
if(scanned.moved||Math.abs(scanned.yawDelta)<.1||scanned.state!=='suspicious')throw Error(JSON.stringify(scanned));
for(let i=0;i<120;i++)Object.getPrototypeOf(ai).update.call(ai,1/60,sense);
const afterScan={state:e.state,scanTimer:e.scanTimer,health:e.health};if(afterScan.scanTimer!==0||afterScan.state==='suspicious')throw Error(JSON.stringify(afterScan));
return {afterShot,scanned,afterScan};
})()
