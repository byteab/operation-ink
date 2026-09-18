(()=>{
 const env=window.__environment,p=env.player,m=env.mission,a=m.audio,ai=m.ai,c=env.camera.perspective,v=(x=0,y=0,z=0)=>p.body.position.clone().set(x,y,z);
 const initial={status:a.status,...a.diagnostics};if(initial.decodedSamples!==178)throw Error('Expected all 178 samples '+JSON.stringify(initial));
 p.pause();m.update(0);a.setActive(true);a.clear();
 for(const e of ai.enemies){e.state='reserve';e.actor.root.visible=false;}
 p.body.teleport(v(130,0,30));p.actions.syncCamera(c);a.update(c);
 const e=ai.enemies[0];e.state='guard';e.health=100;e.position.set(130,0,33);e.actor.root.position.copy(e.position);e.actor.root.visible=true;e.actor.restore('guard');e.actor.update(1,'guard',false);
 const records=[],play=a.play.bind(a);
 a.play=event=>{const before=new Set(a.sources);play(event);const created=[...a.sources].filter(s=>!before.has(s));records.push({kind:event.kind,voice:event.voice,speaker:event.speaker,samples:created.map(s=>[...a.buffers].find(([k,b])=>s.buffer===b)?.[0]??'synthesis'),count:created.length});};
 const cues=[];for(const [state,voice] of [['suspicious','spot'],['combat','contact'],['investigate','lost'],['search','search']]) {
 a.clear();e.calloutTimer=0;e.communicationTimer=0;ai.enter(e,state);const result=records.splice(0);if(!result.some(r=>r.voice===voice&&r.samples.some(s=>s.startsWith('voice_')||s==='guard_hey')))throw Error('Silent state '+state);cues.push({state,events:result});
 }
 a.clear();e.calloutTimer=0;ai.say(e,'Hey you!','contact',true);records.splice(0);
 const torso=e.actor.hitVolumes.volumes().find(b=>b.zone==='torso'),origin=c.position.clone();const shot={origin,direction:torso.a.clone().lerp(torso.b,.5).sub(origin).normalize(),range:10,damage:20,weapon:'pistol'};
 ai.hit(shot,10);const hit=records.splice(0);if(!hit.some(r=>r.kind==='enemy-pain'&&r.count===1)||!hit.some(r=>r.kind==='hit-confirm'&&r.count===1)||e.health===100)throw Error('Missing hit reaction '+JSON.stringify(hit));
 a.play({kind:'enemy-pain',speaker:e.speaker});const repeated=records.splice(0);if(repeated.some(r=>r.count))throw Error('Repeated pain stacking');
 a.play({kind:'ladder'});const ladder=records.splice(0);if(ladder.some(r=>r.count))throw Error('Ladder still audible');
 a.setMuted(true);a.play({kind:'enemy-pain',speaker:123});a.play({kind:'callout',voice:'contact',speaker:123});const muted=records.splice(0);if(muted.some(r=>r.count))throw Error('Mute ignored');a.setMuted(false);
 const waveform=[...a.buffers].filter(([name])=>name==='guard_hey'||name.startsWith('pain_')||name.startsWith('voice_')).map(([name,b])=>{const data=b.getChannelData(0);let energy=0;for(const x of data)energy+=x*x;return {name,duration:b.duration,rms:Math.sqrt(energy/data.length)}});if(waveform.some(w=>w.rms<.001))throw Error('Silent recording');
 a.setActive(false);const paused=a.diagnostics;if(paused.sources!==0)throw Error('Source leak');
 return {initial,cues,hit,remainingHealth:e.health,repeated,ladder,muted,paused,recordings:waveform.length,minRMS:Math.min(...waveform.map(w=>w.rms))};
})()
