(async () => {
 const env=window.__environment, {player:p,mission:m,scene}=env, w=p.world;
 const {Capsule}=await import('/node_modules/three/examples/jsm/math/Capsule.js');
 const v=(x=0,y=0,z=0)=>p.body.position.clone().set(x,y,z), ignore=scene;
 const lanes=[];
 scene.traverse(o=>{for(const panel of o.userData.collisionPanels??[]){
   const a=v(panel.a[0],1.3,panel.a[1]).applyMatrix4(o.matrixWorld), b=v(panel.b[0],1.3,panel.b[1]).applyMatrix4(o.matrixWorld);
   const tangent=b.clone().sub(a).normalize(), normal=v(-tangent.z,0,tangent.x);
   for(const t of [.23,.41,.63,.81]){const mid=a.clone().lerp(b,t), from=mid.clone().addScaledVector(normal,-2), to=mid.clone().addScaledVector(normal,2);
     const ray=to.clone().sub(from).normalize();
     if(w.rayDistance(from,ray,4)>=3.999 && w.rayDistance(to,ray.clone().negate(),4)>=3.999){
       const feet=mid.clone().setY(0), capsule=new Capsule(feet.clone().add(v(0,.35)),feet.clone().add(v(0,1.4)),.3);
       lanes.push({name:o.name,from:from.toArray(),to:to.toArray(),visible:w.visible(from,to,{}),reverseVisible:w.visible(to,from,{}),bodyBlocked:!w.fits(capsule)});
     }
   }
 }});
 const lane=lanes.find(l=>l.bodyBlocked);
 if(!lane || !lanes.some(l=>l.bodyBlocked)) throw Error('No real map wire test lane');
 window.fenceProof={lanes,lane};
 return {testedLanes:lanes.length,passingLanes:lanes.filter(l=>l.visible&&l.reverseVisible&&l.bodyBlocked).length,lane};
})()
