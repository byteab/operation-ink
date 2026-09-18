(()=>{
const env=window.__environment,m=env.mission,p=env.player,ai=m.ai,a=m.audio,v=(x=0,y=0,z=0)=>p.body.position.clone().set(x,y,z);ai.update=()=>{};
for(const e of ai.enemies){e.state='reserve';e.actor.root.visible=false;}
const e=ai.enemies[0];e.state='guard';e.health=100;e.position.set(130,0,60);e.actor.root.position.copy(e.position);e.actor.root.visible=true;e.actor.restore('guard');e.actor.update(1,'guard',false);
p.body.teleport(v(130,0,30));p.actions.syncCamera(env.camera.perspective);a.update(env.camera.perspective);
const origin=env.camera.perspective.position.clone(),shot=(damage=20)=>{const b=e.actor.hitVolumes.volumes().find(x=>x.zone==='torso');return {origin,direction:b.a.clone().lerp(b.b,.5).sub(origin).normalize(),range:60,damage,weapon:'pistol'};};
const records=[],play=a.play.bind(a);a.play=event=>{const before=a.diagnostics.sources;play(event);records.push({kind:event.kind,zone:event.zone,newSources:a.diagnostics.sources-before});};
let confirmations=0;const confirm=a.confirmHit.bind(a);a.confirmHit=hit=>{confirmations++;confirm(hit);};
const initial={status:a.status,...a.diagnostics};
m.shot({...shot(),direction:v(1,0,0)});const missConfirmations=confirmations;
m.shot(shot());const body={health:e.health,confirmations,events:records.splice(0)};
e.actor.restore('guard');e.actor.update(1,'guard',false);e.health=10;m.shot(shot(100));const kill={health:e.health,confirmations,events:records.splice(0)};
if(initial.status!=='running'||initial.decodedSamples<100||missConfirmations!==0||body.health>=100||kill.health!==0||confirmations!==2)throw Error(JSON.stringify({initial,missConfirmations,body,kill}));
if(!body.events.some(x=>x.kind==='hit-confirm'&&x.newSources===1)||!body.events.some(x=>x.kind==='hit-tick'&&x.newSources===1)||!kill.events.some(x=>x.kind==='kill-confirm'&&x.newSources===1))throw Error('No real confirmation graph nodes');
a.setMuted(true);const mutedBefore=a.diagnostics.sources;a.confirmHit({zone:'torso',lethal:false});const mutedDelta=a.diagnostics.sources-mutedBefore;a.setMuted(false);p.pause();m.update(0);a.confirmHit({zone:'torso',lethal:false});const paused={status:a.status,...a.diagnostics};if(mutedDelta!==0||paused.sources!==0)throw Error('Mute/pause source leak');
return {initial,missConfirmations,body,kill,mutedDelta,paused};
})()
