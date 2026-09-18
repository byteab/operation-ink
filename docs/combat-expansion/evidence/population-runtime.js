(async()=>{
const env=window.__environment,{mission:m,player:p}=env,{Capsule}=await import('/node_modules/three/examples/jsm/math/Capsule.js');
const v=(x=0,y=0,z=0)=>p.body.position.clone().set(x,y,z);
const enemies=m.ai.enemies.map(e=>({id:e.spec.id,state:e.state,position:e.position.toArray(),visible:e.actor.root.visible,supported:Math.abs(p.world.floor(e.position,.12,.4)-e.position.y)<.05,clear:p.world.fits(new Capsule(e.position.clone().add(v(0,.3)),e.position.clone().add(v(0,1.44)),.3))}));
const active=enemies.filter(e=>e.state!=='reserve');const bad=active.filter(e=>!e.supported||!e.clear||!e.visible);
const result={total:enemies.length,active:active.length,reserves:enemies.length-active.length,bad,enemies};
if(result.total!==44||result.active!==40||bad.length)throw Error(JSON.stringify(result));window.populationProof=result;return result;
})()
