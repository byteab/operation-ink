(() => {
 const env=window.__environment,{player:p,mission:m,scene}=env,w=p.world,ai=m.ai;
 const v=(x=0,y=0,z=0)=>p.body.position.clone().set(x,y,z),lane=window.fenceProof.lane;
 const from=v().fromArray(lane.from),to=v().fromArray(lane.to);
 for(const e of ai.enemies){e.state='reserve';e.actor.root.visible=false;}
 const e=ai.enemies[0];e.health=100;e.state='guard';e.actor.root.visible=true;
 e.position.copy(to).setY(w.floor(to,.2,3)); e.actor.root.position.copy(e.position);
 p.body.teleport(from.clone().setY(w.floor(from,.2,3)));p.actions.syncCamera(env.camera.perspective);
 e.yaw=Math.atan2(from.x-to.x,from.z-to.z); e.actor.root.rotation.y=e.yaw;e.canSee=false;e.suspicion=0;e.senseTimer=0;e.shots=0;
 e.tactic='hold';e.tacticTimer=100;e.actor.root.updateMatrixWorld(true);
 const sense={feet:p.body.position.clone(),eye:p.body.position.clone().add(v(0,1.65)),velocity:v(),alive:true,radioEnabled:false};
 m.state.health=100;
 for(let i=0;i<720 && m.state.health===100;i++){e.tactic='hold';e.tacticTimer=100;ai.update(1/60,sense);}
 const acquired=e.canSee,enemyShots=e.shots,playerHealth=m.state.health;
 const body=e.actor.hitVolumes.volumes().find(x=>x.zone==='torso');
 const target=body.a.clone().lerp(body.b,.5),origin=sense.eye.clone(),direction=target.clone().sub(origin).normalize();
 const before=e.health;m.shot({origin,direction,range:20,damage:34,weapon:'pistol'});
 const result={lane:lane.name,enemyAcquired:acquired,enemyShots,playerHealth,enemyHealthBefore:before,enemyHealthAfter:e.health,playing:p.playing};
 if(!acquired||!enemyShots||playerHealth>=100||e.health>=before)throw Error(JSON.stringify(result));
 env.camera.perspective.lookAt(target);env.invalidate();window.fenceProof.combat=result;
 return result;
})()
