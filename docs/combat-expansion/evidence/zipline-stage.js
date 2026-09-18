(() => {
 const env=window.__environment,{player:p,mission:m}=env,a=p.actions,z=a.ziplines[0];
 for(const e of m.ai.enemies){e.state='reserve';e.actor.root.visible=false;}
 a.reset();p.body.teleport(a.ziplinePoint(z,false));a.syncCamera(env.camera.perspective);
 env.camera.perspective.lookAt(a.ziplinePoint(z,false).add(p.body.position.clone().set(0,1.3,0)));
 env.camera.perspective.updateMatrixWorld(true); env.invalidate();
 return {from:p.body.position.toArray(),end:a.ziplinePoint(z,true).toArray(),target:a.findTarget(env.camera.perspective)?.label};
})()
