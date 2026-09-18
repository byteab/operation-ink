(() => {
const env=window.__environment,p=env.player,a=p.actions,z=a.ziplines[0],m=env.mission;
const distance=p.body.position.distanceTo(a.ziplinePoint(z,true));
if(a.traversing||distance>.05||!p.body.grounded)throw Error('First arrival failed '+JSON.stringify({distance,grounded:p.body.grounded,riding:!!a.riding}));
window.ziplineProof={outbound:{distance,grounded:p.body.grounded}};
a.syncCamera(env.camera.perspective);env.camera.perspective.lookAt(a.ziplinePoint(z,true).add(p.body.position.clone().set(0,1.3,0)));env.camera.perspective.updateMatrixWorld(true);
window.ziplineProof.shotsBefore=m.state.shots;return {outbound:window.ziplineProof.outbound,target:a.findTarget(env.camera.perspective)?.label};
})()
