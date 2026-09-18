import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCompound } from '../src/world/compound'
import { CollisionWorld } from '../src/player/collision'
import { PlayerBody, EYE_HEIGHT } from '../src/player/body'
import { PlayerActions } from '../src/player/actions'
const scene = createCompound(), world = new CollisionWorld(scene), body = new PlayerBody(world), actions = new PlayerActions(scene, body), camera = new THREE.PerspectiveCamera()
const zero = new THREE.Vector3()
const stand = (point: THREE.Vector3) => { body.teleport(point); for(let i=0;i<40;i++) body.update(1/60,zero,false); actions.syncCamera(camera) }
const hall = scene.children.find(object => object.userData.kind === 'mess-hall')!
stand(hall.localToWorld(new THREE.Vector3(9.2, .3, -7.5)))
for(let i=0;i<168;i++) body.update(1/60,new THREE.Vector3(0,0,1),false)
actions.syncCamera(camera)
let maxCameraStep=0, maxBodyStep=0, maxChange=0, lastStep=0, samples=0
for(let i=0;i<175;i++) {
  const before=camera.position.y, beforeBody=body.position.y
  body.update(1/60,new THREE.Vector3(0,0,-1),false); actions.syncCamera(camera,1/60)
  const local=hall.worldToLocal(body.position.clone()), delta=camera.position.y-before
  if(local.z>-5.5 && local.z<.5) {
    maxCameraStep=Math.max(maxCameraStep,Math.abs(delta)); maxBodyStep=Math.max(maxBodyStep,Math.abs(body.position.y-beforeBody));
    if(samples++) maxChange=Math.max(maxChange,Math.abs(delta-lastStep)); lastStep=delta
    assert(delta<=0,'Stair descent never bounces upward')
  }
}
assert(samples>60); assert(maxCameraStep<.05); assert(maxChange<.005); assert(maxCameraStep<maxBodyStep*.65)
console.log('PASS Continuous stair descent instead of tread jolts', {samples,maxCameraStep,maxBodyStep,maxChange})
for(const ladder of actions.ladders) {
 actions.reset(); stand(actions.ladderPoint(ladder,true));
 camera.lookAt(actions.ladderPoint(ladder,true).add(new THREE.Vector3(0,.85,0)))
 const rotation=camera.quaternion.clone(); assert(actions.activate(camera)); assert(camera.quaternion.angleTo(rotation)<1e-7,'Boarding preserves view')
 const paused=body.position.clone(); actions.updateClimb(0); assert(body.position.equals(paused))
 let last=camera.position.y, maxStep=0
 for(let i=0;i<1000 && actions.climbing;i++) {actions.updateClimb(1/60); actions.syncCamera(camera,1/60);maxStep=Math.max(maxStep,Math.abs(camera.position.y-last));last=camera.position.y}
 assert(!actions.climbing);assert(maxStep<.065,'No climb/landing jump');
 for(let i=0;i<45;i++){body.update(1/60,zero,false);actions.syncCamera(camera,1/60)}
 assert(body.grounded);assert(Math.abs(camera.position.y-body.position.y-EYE_HEIGHT)<.003)
 assert(camera.quaternion.angleTo(rotation)<1e-7)
 console.log('PASS Smooth descent, unchanged view, safe landing:',ladder.name)
}
body.teleport(new THREE.Vector3(100,20,100));actions.syncCamera(camera,1/60);assert.equal(camera.position.y,21.65,'Teleport never interpolates across map')
body.grounded=false;body.velocity.y=7;body.position.y+=.1;actions.syncCamera(camera,1/60);assert(Math.abs(camera.position.y-21.75)<1e-6,'Jump follows body immediately')
world.dispose()
