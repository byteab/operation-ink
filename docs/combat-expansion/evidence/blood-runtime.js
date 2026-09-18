(()=>{
const env=window.__environment,m=env.mission,p=env.player,ai=m.ai,v=(x=0,y=0,z=0)=>p.body.position.clone().set(x,y,z);ai.update=()=>{};
const e=ai.enemies.find(g=>g.spec.id==='mess-west-aisle');for(const g of ai.enemies)g.actor.update(1,'guard',false);
p.body.teleport(e.position.clone().add(v(0,0,-2.2)));p.actions.syncCamera(env.camera.perspective);
const b=e.actor.hitVolumes.volumes().find(x=>x.zone==='torso'),target=b.a.clone().lerp(b.b,.5),origin=env.camera.perspective.position.clone(),direction=target.clone().sub(origin).normalize();
env.camera.perspective.lookAt(target);m.blood.clear();m.shot({origin,direction,range:20,damage:20,weapon:'pistol'});
const normal=m.blood.snapshot();if(normal.droplets.length!==24||e.health>=100)throw Error('Body hit blood failed');
m.blood.clear();e.hitPause=0;e.actor.restore();e.actor.update(1,'guard',false);e.health=10;
const b2=e.actor.hitVolumes.volumes().find(x=>x.zone==='torso'),target2=b2.a.clone().lerp(b2.b,.5);m.shot({origin,direction:target2.clone().sub(origin).normalize(),range:20,damage:100,weapon:'pistol'});
const fatal=m.blood.snapshot();if(e.health!==0||fatal.droplets.length!==42)throw Error('Fatal hit blood failed');
const profile=(count)=>{m.blood.clear();for(let i=0;i<count;i++)m.blood.emitHit({zone:'torso',point:target,direction,lethal:true});const capped=m.blood.snapshot(),times=[];for(let i=0;i<160;i++){const t=performance.now();m.blood.update(1/60);times.push(performance.now()-t);}times.sort((a,b)=>a-b);return {initialDrops:capped.droplets.length,initialStains:capped.stains.length,maxMs:times.at(-1),p95Ms:times[Math.floor(times.length*.95)],meanMs:times.reduce((a,b)=>a+b,0)/times.length,remaining:m.blood.snapshot().droplets.length};};
const normalTiming=profile(1),capTiming=profile(120);m.blood.restore(fatal);for(let i=0;i<12;i++){m.blood.update(1/60);e.actor.update(1/60,'dead',false);}m.blood.update=()=>{};env.invalidate();
window.bloodProof={normal:{drops:normal.droplets.length,stains:normal.stains.length},fatal:{drops:fatal.droplets.length,stains:fatal.stains.length},normalTiming,capTiming};return window.bloodProof;
})()
