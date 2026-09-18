(()=>{
const env=window.__environment,p=env.player,a=p.actions,m=env.mission,z=a.ziplines[0],progress=window.ziplineTestProgress??.15;
m.ai.update=()=>{};a.reset();p.body.teleport(a.ziplinePoint(z,false));a.syncCamera(env.camera.perspective);env.camera.perspective.lookAt(a.ziplinePoint(z,false).add(p.body.position.clone().set(0,1.3,0)));env.camera.perspective.updateMatrixWorld(true);
if(!p.playing||!a.activate(env.camera.perspective))throw Error('Staging failed');
while(a.riding && 1-a.riding.remaining/a.riding.distance<progress)a.updateTraversal(1/60);
m.update(0);const midair=p.body.position.toArray();p.setImmersive(true);m.update(0);p.setImmersive(false);m.update(0);
for(let i=0;i<60;i++)p.body.update(1/60,p.body.position.clone().set(0,0,0),false);
const expected=a.ziplinePoint(z,progress>.5),result={progress,midair,position:p.body.position.toArray(),distance:p.body.position.distanceTo(expected),grounded:p.body.grounded,riding:!!a.riding};
if(result.riding||result.distance>.05||!result.grounded)throw Error(JSON.stringify(result));return result;
})()
