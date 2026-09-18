import assert from 'node:assert/strict'
import * as THREE from 'three'
import { MissionImpacts } from '../src/game/impacts'
import { hitDamage, ENEMY_HEALTH, WEAPON_RULES } from '../src/game/balance'
import { rayCapsuleDistance, reactionClipName } from '../src/game/hit-reactions'
import type { WeaponName } from '../src/game/types'

for (const name of Object.keys(WEAPON_RULES) as WeaponName[]) {
  const damage = (zone: 'head'|'torso'|'arm'|'leg') => hitDamage(name, zone, WEAPON_RULES[name].damage)
  assert.equal(damage('head') >= ENEMY_HEALTH, name === 'sniper')
  assert(damage('torso') < ENEMY_HEALTH)
  assert(damage('head') > damage('torso') && damage('torso') > damage('arm') && damage('leg') > 0)
}
console.log('PASS shared balance permits only sniper one-shot head kills; every limb takes positive damage')

for (const zone of ['head','torso','arm','leg'] as const) {
  assert(reactionClipName({zone,lethal:false},false).startsWith('flinch'))
  assert(reactionClipName({zone,lethal:true},false).startsWith('die'))
}
assert.equal(reactionClipName({zone:'arm',lethal:false,bone:'forearm.L'},false),'flinchArmLeft')
assert.equal(reactionClipName({zone:'leg',lethal:false,bone:'shin.L'},false),'flinchLegLeft')
const a=new THREE.Vector3(0,1,0), b=new THREE.Vector3(0,2,0)
assert(Math.abs(rayCapsuleDistance(new THREE.Vector3(0,1.5,-2),new THREE.Vector3(0,0,1),a,b,.1)-1.9)<1e-9)
assert.equal(rayCapsuleDistance(new THREE.Vector3(1,1.5,-2),new THREE.Vector3(0,0,1),a,b,.1),Infinity)
console.log('PASS region reaction routing includes mirrored limbs and exact ray capsule surfaces')

const scene=new THREE.Scene(), impacts=new MissionImpacts(scene)
const point=new THREE.Vector3(3,2,1), direction=new THREE.Vector3(0,0,-1)
impacts.emit(point,direction)
assert.equal(impacts.mesh.count,7)
const matrix=new THREE.Matrix4();impacts.mesh.getMatrixAt(0,matrix)
assert(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(point)<.02)
for(let i=0;i<100;i++) impacts.emit(point,direction)
assert.equal(impacts.mesh.count,80)
for(let i=0;i<30;i++) impacts.update(1/60)
assert.equal(impacts.mesh.count,0)
impacts.emit(point,direction);impacts.clear();assert.equal(impacts.mesh.count,0)
impacts.dispose();assert(!scene.children.includes(impacts.mesh))
console.log('PASS impact chips originate at actual contact, remain bounded, expire and clear on reset/dispose')
