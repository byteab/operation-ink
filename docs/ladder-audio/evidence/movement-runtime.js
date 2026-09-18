(()=>{
 const e=window.__environment,p=e.player,a=p.actions,c=e.camera.perspective,m=e.mission,v=(x=0,y=0,z=0)=>p.body.position.clone().set(x,y,z);
 p.pause();m.update(0);const rows=[];
 for(const l of a.ladders){
 a.reset();p.body.teleport(a.ladderPoint(l,true));for(let i=0;i<40;i++)p.body.update(1/60,v(),false);
 a.syncCamera(c);c.lookAt(a.ladderPoint(l,true).add(v(0,.85,0)));const q=c.quaternion.clone();if(!a.activate(c))throw Error('No ladder prompt '+l.name);
 let last=c.position.y,maxStep=0;while(a.climbing){a.updateTraversal(1/60);a.syncCamera(c,1/60);maxStep=Math.max(maxStep,Math.abs(c.position.y-last));last=c.position.y;}
 for(let i=0;i<45;i++){p.body.update(1/60,v(),false);a.syncCamera(c,1/60)}
 const angularChange=c.quaternion.angleTo(q);if(maxStep>.065||angularChange>1e-7||!p.body.grounded)throw Error('Ladder discontinuity '+l.name);
 rows.push({name:l.name,maxStep,angularChange,grounded:p.body.grounded});
 }
 let hall;e.scene.traverse(o=>{if(o.userData.kind==='mess-hall')hall=o});
 p.body.teleport(hall.localToWorld(v(9.2,.3,-7.5)));for(let i=0;i<40;i++)p.body.update(1/60,v(),false);
 for(let i=0;i<168;i++)p.body.update(1/60,v(0,0,1),false);a.syncCamera(c);
 let cameraMax=0,bodyMax=0,changeMax=0,previous=0,count=0;
 for(let i=0;i<175;i++){
 const cy=c.position.y,by=p.body.position.y;p.body.update(1/60,v(0,0,-1),false);a.syncCamera(c,1/60);
 const z=hall.worldToLocal(p.body.position.clone()).z,d=c.position.y-cy;
 if(z>-5.5&&z<.5){cameraMax=Math.max(cameraMax,Math.abs(d));bodyMax=Math.max(bodyMax,Math.abs(p.body.position.y-by));if(count++)changeMax=Math.max(changeMax,Math.abs(d-previous));previous=d;if(d>0)throw Error('Camera bounced');}
 }
 if(cameraMax>.05||changeMax>.005)throw Error('Stair jitter');
 return {ladders:rows,stairs:{cameraMax,bodyMax,changeMax,count}};
})()
