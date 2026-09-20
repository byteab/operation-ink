// Real capsule blockout verification; this does not simulate AI or a human playthrough.
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'
import { createCompound } from '../src/world/compound'
import { createMissionWorld, prepareCompound } from '../src/game/world'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody } from '../src/player/body'
import { PlayerActions } from '../src/player/actions'
import { setDoorOpen } from '../src/world/doors'
import { initialMission, stationLabel, useStation, SIGNALS_COMPUTER_ID } from '../src/game/mission'

const compound=createCompound(); prepareCompound(compound)
const mission=createMissionWorld(compound), scene=new THREE.Group()
scene.add(compound,mission.root); scene.updateMatrixWorld(true)
const world=new CollisionWorld(scene),body=new PlayerBody(world),actions=new PlayerActions(scene,body)
const errors:string[]=[]
function check(name:string,run:()=>void){try{run(); console.log('PASS',name)}catch(error){errors.push(`${name}: ${error}`); console.log('FAIL',name,String(error))}}
function stand(x:number,z:number,y=0){const p=new THREE.Vector3(x,y,z);p.y=world.floor(p,1.2,3,.1)+.005;return p}
function fits(p:THREE.Vector3){return world.fits(new Capsule(p.clone().add(new THREE.Vector3(0,.28,0)),p.clone().add(new THREE.Vector3(0,1.52,0)),.28))}
function walk(points:number[][]){body.teleport(stand(points[0][0],points[0][1],points[0][2]??0));for(const [x,z] of points.slice(1)){let frames=0;const budget=Math.ceil(Math.hypot(body.position.x-x,body.position.z-z)/4.2*60)+600;while(Math.hypot(body.position.x-x,body.position.z-z)>.2&&frames++<budget){const d=new THREE.Vector3(x-body.position.x,0,z-body.position.z).normalize();world.refresh();body.update(1/60,d,false)}assert(Math.hypot(body.position.x-x,body.position.z-z)<.3,`stuck en route to ${x},${z}: ${body.position.toArray()}`)}}
for(const door of actions.doors)if(door.name.includes('house')||door.name.includes('cabin')||door.name.includes('shelter'))setDoorOpen(door,true,true)
world.refresh()
check('spawn fits',()=>assert(fits(stand(mission.spawn[0],mission.spawn[2]))))
check('camera computer, alarm and exit control activate only their own function',()=>{
  assert(!mission.stations.some(station=>station.id==='security-alarm'||station.id==='escort-rally'))
  for(const id of ['security-computer','detention-alarm','exit-gate-control']){
    const station=mission.stations.find(station=>station.id===id)!
    const state=initialMission(),camera=new THREE.PerspectiveCamera()
    state.alarm='active'
    actions.extraTargets=()=>stationLabel(state,station.kind,id)?[{object:station.object,point:station.point,kind:'mission',label:station.label,descending:false,use:()=>useStation(state,station.kind,id).changed}]:[]
    const outward=new THREE.Vector3(0,0,1).transformDirection(station.object.matrixWorld)
    const approach=station.point.clone().addScaledVector(outward,1.5)
    body.teleport(stand(approach.x,approach.z,station.object.position.y))
    assert(fits(body.position),`${id} must have a clear approach`)
    actions.syncCamera(camera);camera.lookAt(station.point);camera.updateMatrixWorld(true)
    assert.equal(actions.findTarget(camera)?.object,station.object,`${id} must be targetable`)
    assert(actions.activate(camera),`${id} must activate`)
    assert.equal(state.camerasActive,id!=='security-computer')
    assert.equal(state.alarm,id==='detention-alarm'?'silenced':'active')
    assert.equal(state.gateOpen,id==='exit-gate-control')
  }
  actions.extraTargets=()=>[]
})
check('office blue-screen computer uses the real nearby interaction and rejects use through the partition',()=>{
  const station=mission.stations.find(station=>station.id===SIGNALS_COMPUTER_ID)!
  assert(station)
  assert.equal(station.object.name,'Signals office · monitor 1')
  const screen=station.object.getObjectByName('Signals office · powered surveillance screen') as THREE.Mesh
  assert.equal((screen.material as THREE.MeshBasicMaterial).color.getHex(),0x146bff)
  const state=initialMission(),camera=new THREE.PerspectiveCamera()
  actions.extraTargets=()=>stationLabel(state,station.kind,station.id)?[{object:station.object,point:station.point,kind:'mission',label:station.label,descending:false,use:()=>useStation(state,station.kind,station.id).changed}]:[]
  const outward=new THREE.Vector3(0,0,1).transformDirection(station.object.matrixWorld)
  const approach=station.point.clone().addScaledVector(outward,1.75)
  body.teleport(stand(approach.x,approach.z,0.28))
  assert(fits(body.position),'The chair must leave room to stand and use the monitor')
  actions.syncCamera(camera);camera.lookAt(station.point);camera.updateMatrixWorld(true)
  assert.equal(actions.findTarget(camera)?.object,station.object)
  assert(actions.activate(camera));assert(!state.camerasActive);assert.equal(state.camerasDisabledUntil,60)
  assert(!actions.activate(camera),'No timer extension while offline')
  state.camerasActive=true;state.camerasDisabledUntil=null
  body.teleport(stand(station.point.x+0.2,-51.3,0.28));actions.syncCamera(camera);camera.lookAt(station.point);camera.updateMatrixWorld(true)
  assert(camera.position.distanceTo(station.point)<2.65,'Occlusion fixture must be within interaction range')
  assert(!world.visible(camera.position,station.point,station.object))
  assert.notEqual(actions.findTarget(camera)?.object,station.object)
  actions.activate(camera);assert(state.camerasActive)
  actions.extraTargets=()=>[]
})
check('only pines remain and their crowns clear compound and annex fences',()=>{
  const landscape=compound.getObjectByName('Perimeter trees and low vegetation')!
  const trees=landscape.userData.trees as {x:number;z:number;radius:number;species:string}[]
  assert.equal(trees.length,40)
  assert.deepEqual([...new Set(trees.map(tree=>tree.species))],['pine'])
  const segments:THREE.Line3[]=[]
  scene.traverse(object=>{
    for(const panel of object.userData.collisionPanels??[]){
      const a=object.localToWorld(new THREE.Vector3(panel.a[0],0,panel.a[1]))
      const b=object.localToWorld(new THREE.Vector3(panel.b[0],0,panel.b[1]))
      segments.push(new THREE.Line3(a.setY(0),b.setY(0)))
    }
  })
  const intersections:string[]=[]
  for(const tree of trees){
    const point=new THREE.Vector3(tree.x,0,tree.z)
    const distance=Math.min(...segments.map(line=>line.closestPointToPoint(point,true,new THREE.Vector3()).distanceTo(point)))
    if(distance<=tree.radius+0.3) intersections.push(`${tree.species} at ${tree.x},${tree.z} intersects fence: clearance ${distance-tree.radius}`)
  }
  assert.equal(intersections.length,0,intersections.join('\n'))
})
for(const station of mission.stations)check(`station ${station.kind} standing and visible`,()=>{
  // Wall controls face local +Z; the solid jeep is boarded from the driver's side, local -Z.
  const outward=new THREE.Vector3(0,0,station.kind==='jeep'?-1:1).transformDirection(station.object.matrixWorld)
  const p=station.point.clone().addScaledVector(outward,1.25);const feet=stand(p.x,p.z,station.point.y-1.3)
  assert(fits(feet),`station has no clear standing point: ${feet.toArray()}`)
  assert(world.visible(feet.clone().add(new THREE.Vector3(0,1.65,0)),station.point,station.object),'station occluded')
})
for(const npc of mission.enemies)check(`${npc.id} starts clear`,()=>{
  const p = new THREE.Vector3(...npc.position)
  p.y = world.floor(p, 0.4, 1) + 0.005
  assert(Number.isFinite(p.y) && fits(p),JSON.stringify(npc.position))
})
for(const npc of mission.enemies.filter(npc=>!npc.reserve && npc.role!=='sniper'))check(`${npc.id} complete patrol clearance`,()=>walk([...npc.patrol,npc.patrol[0]].map(p=>[p[0],p[2],p[1]])))
check('Two supported tower sniper posts have open outward sightlines',()=>{
  const snipers=mission.enemies.filter(npc=>npc.role==='sniper')
  assert.equal(snipers.length,2)
  for(const npc of snipers){
    assert.equal(npc.weapon,'sniper')
    assert.equal(npc.patrol.length,npc.id==='water-sniper'?16:1)
    const feet=new THREE.Vector3(...npc.position)
    assert(feet.y>6);assert(Math.abs(world.floor(feet,.1,.3)-feet.y)<.03)
    const target=feet.clone().add(new THREE.Vector3(Math.sin(npc.facing!)*20,-feet.y+1.4,Math.cos(npc.facing!)*20))
    assert(world.visible(feet.clone().add(new THREE.Vector3(0,1.5,0)),target,new THREE.Object3D()),`${npc.id} sightline blocked`)
  }
})
check('Water-tower marksman faces the mess hall from an unobstructed west-side post',()=>{
  const sniper=mission.enemies.find(npc=>npc.id==='water-sniper')!
  const hall=compound.getObjectByName('Northwest service building')!
  const tower=compound.getObjectByName('North water tower')!
  const feet=new THREE.Vector3(...sniper.position)
  const target=hall.getWorldPosition(new THREE.Vector3());target.y=hall.userData.roofHeight+1.65
  const direction=target.clone().sub(feet).setY(0).normalize()
  const facing=new THREE.Vector3(Math.sin(sniper.facing!),0,Math.cos(sniper.facing!))
  assert(feet.x<tower.getWorldPosition(new THREE.Vector3()).x,'post must face out from the west side of the tank')
  assert(facing.dot(direction)>.999,'authored facing must point toward the dining building')
  assert(world.visible(feet.clone().add(new THREE.Vector3(0,1.5,0)),target,hall),'tank must not obstruct the mess-hall view')
})
for(const [name,points] of Object.entries({
  detention:[[117,-3],[117,-8],[117,-21,-4.2],[117,-26,-4.2],[117,-8],[117,-3]],security:[[146,-37],[146,-45],[146,-52]],
  crew:[[143,12],[143,3],[143,-6]],maintenance:[[111,-37],[111,-45],[111,-53]],
  eastGate:[[95,11],[104,11],[110,5],[117,-3]],
  railGap:[[93,-34.2],[103,-34.2],[104,-36],[120,-36]],
  separationGate:[[57,-14],[57,-19.5],[57,-22.9],[57,-25.7]],
  annexTraverse:[[117,-3],[128,-3],[128,-22],[139,-25],[139,-37],[146,-37]],
  reserveExit:[[140,1.3],[143,3],[143,-1.5],[143,-5],[151,-8],[151,-22],[154,-35],[146,-37],[146,-42]],
  southernFieldMapRoute:[[-34,-34],[-50,-30],[-50,4],[-20,4],[-20,2.25],[-11,2.25],[-8,13],[0,13],[55,16],[99,11],[110,5],[117,-3],[117,-9]],
  northernFieldMapRoute:[[-34,-34],[-20,-29],[-20,2.25],[-11,2.25],[-8,13],[55,16],[57,13],[57,-16],[57,-25.7],[57,-34.2],[97,-34.2],[103,-34.2],[107,-35],[142,-35]],
}))check(`traverse ${name}`,()=>walk(points))
check('maintenance ladder goes up and down',()=>{
  const ladder=actions.ladders.find(x=>x.name.includes('Maintenance shelter'))!;assert(ladder)
  const bottom=actions.ladderPoint(ladder,false),top=actions.ladderPoint(ladder,true)
  assert(fits(stand(bottom.x,bottom.z)))
  assert(fits(new THREE.Vector3(top.x,4.205,top.z)),`top blocked: ${top.toArray()}`)
  const camera=new THREE.PerspectiveCamera();body.teleport(stand(bottom.x,bottom.z));camera.position.copy(body.position).y+=1.65
  camera.lookAt(bottom.clone().add(new THREE.Vector3(0,1.25,0)));camera.updateMatrixWorld(true)
  assert.equal(actions.findTarget(camera)?.object,ladder);assert(actions.activate(camera))
  for(let i=0;i<360&&actions.climbing;i++)actions.updateClimb(1/60)
  assert(!actions.climbing);assert(Math.abs(body.position.y-4.225)<.08)
  camera.position.copy(body.position).y+=1.65;camera.lookAt(top.clone().add(new THREE.Vector3(0,.85,0)));camera.updateMatrixWorld(true)
  assert(actions.findTarget(camera)?.descending);assert(actions.activate(camera))
  for(let i=0;i<360&&actions.climbing;i++)actions.updateClimb(1/60)
  assert(!actions.climbing);assert(body.position.y<.2)
})
check('outer masonry wall removed',()=>assert(!mission.root.getObjectByName('Playable perimeter · masonry boundary')))
check('water tower shortcut fenced',()=>{
  assert(!fits(stand(24.75,-28)))
  assert(!fits(stand(24.75,-22)))
})
check('old inner gate and tower-side fence gaps closed',()=>{
  assert(!fits(stand(-12.45,20.1)))
  assert(!fits(new THREE.Vector3(-46.4,.005,21.05)))
  for(const side of [-1,1]){
    body.teleport(stand(-46.4,21.15+side))
    for(let i=0;i<120;i++)body.update(1/60,new THREE.Vector3(0,0,-side),false)
    assert((body.position.z-21.15)*side>.2,`crossed tower-side fence from side ${side}`)
  }
})
check('removed administration fence return leaves its west end clear',()=>{
  for(const z of [27,30,33,35.7])assert(fits(stand(-45.45,z)),`former fence still blocks west end at ${z}`)
  walk([[-46.4,26],[-46.4,36],[-43,36]])
})
check('removed east detention baffle leaves a clear walking lane',()=>{
  for(const x of [130,132,134])assert(fits(stand(x,-18)),`former baffle still blocks ${x},-18`)
  walk([[132,-20],[132,-16]])
})
check('removed detention-side baffle leaves a clear walking lane',()=>{
  for(const x of [101,103,105])assert(fits(stand(x,-6)),`former baffle still blocks ${x},-6`)
  walk([[103,-8],[103,-4]])
})
check('utility building has clearance from the cross fence',()=>{
  const utility=compound.getObjectByName('West utility building')!
  const footprint=utility.userData.footprint as number[]
  assert(24-(utility.position.z+footprint[0]/2)>2)
})
for(const name of ['Detention entrance','Security cabin','Crew house','Maintenance shelter'])check(`${name} closed door blocks`,()=>{
 const door=actions.doors.find(x=>x.name===name||x.name===`${name} · south door`)!;setDoorOpen(door,false,true);world.refresh()
 const p=door.getWorldPosition(new THREE.Vector3());body.teleport(stand(p.x,p.z+2))
 for(let i=0;i<90;i++)body.update(1/60,new THREE.Vector3(0,0,-1),false)
 assert(body.position.z>p.z+.2,body.position.toArray().toString());setDoorOpen(door,true,true);world.refresh()
})
let meshes=0,triangles=0;mission.root.traverse(object=>{if(object instanceof THREE.Mesh){meshes++;const g=object.geometry;triangles+=(g.index?.count??g.getAttribute('position')?.count??0)/3}})
console.log(JSON.stringify({newMeshes:meshes,newTriangles:Math.round(triangles),stationCount:mission.stations.length,enemies:mission.enemies.length,failures:errors},null,2))
world.dispose();if(errors.length)process.exitCode=1
