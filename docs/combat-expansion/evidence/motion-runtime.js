(()=>{
const env=window.__environment,m=env.mission,p=env.player,v=(x=0,y=0,z=0)=>p.body.position.clone().set(x,y,z);m.ai.update=()=>{};
const e=m.ai.enemies.find(x=>x.spec.id==='mess-west-aisle'),a=e.actor;for(const g of m.ai.enemies)g.actor.update(1,'guard',false);
e.yaw=0;a.root.rotation.y=0;p.body.teleport(e.position.clone().add(v(0,0,2.5)));p.actions.syncCamera(env.camera.perspective);env.camera.perspective.lookAt(e.position.clone().add(v(0,1.1,0)));
const head=a.rig.bones.head,initial=head.quaternion.clone();let idleVariation=0;for(let i=0;i<360;i++){a.update(1/60,'guard',false);idleVariation=Math.max(idleVariation,initial.angleTo(head.quaternion));}
a.root.userData.alertScan=0;a.restore('suspicious');for(let i=0;i<40;i++)a.update(1/60,'suspicious',false);
let previous=a.rig.bones['hand.R'].getWorldPosition(v()),maxHandStep=0,maxSupportError=0;const heads=[];
for(let i=0;i<=100;i++){a.root.userData.alertScan=i/100;a.update(1/60,'suspicious',false);const hand=a.rig.bones['hand.R'].getWorldPosition(v());maxHandStep=Math.max(maxHandStep,hand.distanceTo(previous));previous=hand;if(a.gun.userData.support)maxSupportError=Math.max(maxSupportError,a.gun.localToWorld(a.gun.userData.support.clone()).distanceTo(a.rig.bones['hand.L'].localToWorld(v(0,.035,0))));if(i===25||i===75)heads.push(head.quaternion.clone());}
const result={idleHeadVariation:idleVariation,scanHeadSweep:heads[0].angleTo(heads[1]),maxHandStep,maxSupportError};if(idleVariation<.5||result.scanHeadSweep<.7||maxHandStep>.07||maxSupportError>.06)throw Error(JSON.stringify(result));
window.motionProof=result;window.motionActor=a;a.root.userData.alertScan=.25;for(let i=0;i<20;i++)a.update(1/60,'suspicious',false);env.invalidate();return result;
})()
