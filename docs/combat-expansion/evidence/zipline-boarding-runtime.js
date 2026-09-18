(()=>{
const env=window.__environment,p=env.player,a=p.actions,z=a.ziplines[0],v=(x=0,y=0,z=0)=>p.body.position.clone().set(x,y,z);
const blocked=[];
for(const position of [[6.208478136630216,12.634999656677246,-32.73667577395432],[6.458478136630216,12.634999656677246,-31.986675773954314]]){
 a.reset();p.body.teleport(v(...position));a.syncCamera(env.camera.perspective);env.camera.perspective.lookAt(a.ziplinePoint(z,false).add(v(0,1.3,0)));env.camera.perspective.updateMatrixWorld(true);const target=a.findTarget(env.camera.perspective)?.kind,activated=a.activate(env.camera.perspective);if(target==='zipline'||activated||a.riding)throw Error('Unsafe boarding admitted');blocked.push({position,target:target??null,activated});
}
const endpoints=[];for(const end of [false,true]){a.reset();p.body.teleport(a.ziplinePoint(z,end));a.syncCamera(env.camera.perspective);env.camera.perspective.lookAt(a.ziplinePoint(z,end).add(v(0,1.3,0)));env.camera.perspective.updateMatrixWorld(true);const target=a.findTarget(env.camera.perspective)?.kind,activated=a.activate(env.camera.perspective);if(target!=='zipline'||!activated||!a.riding)throw Error('Safe endpoint blocked');endpoints.push({end,target,activated});}a.reset();return {blocked,endpoints};
})()
