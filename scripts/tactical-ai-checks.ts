import assert from 'node:assert/strict'
import * as THREE from 'three'
import { EnemyDirector } from '../src/game/ai'
import type { EnemyActor } from '../src/game/actors'
import { CollisionWorld } from '../src/player/collision'
import { createMissionWorld } from '../src/game/world'
import type { PlayerSense, SoundEvent, Vec3 } from '../src/game/types'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
async function fixture(positions: Vec3[], cover?: [number, number, number]) {
  const scene = new THREE.Scene()
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  floor.rotation.x = -Math.PI / 2; scene.add(floor)
  if (cover) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.4), new THREE.MeshBasicMaterial())
    wall.position.set(...cover); scene.add(wall)
  }
  const world = new CollisionWorld(scene), events: SoundEvent[] = []
  const director = new EnemyDirector({ scene, world, doors: [], specs: positions.map((position, i) => ({id: `guard-${i}`, name: `Guard ${i}`, position, patrol: [], weapon: 'ak'})),
    emit: event => events.push(event), damagePlayer() {}, dropWeapon() {} }, async () => {
      const root = new THREE.Group()
      return { root, update() {}, shoot() {}, react() {}, restore() {}, dispose() {}, reactionRemaining: 0, animationTime: 0,
        muzzle: () => root.position.clone().add(v(0, 1.3, 0.5)) } as unknown as EnemyActor
    })
  await director.init()
  const player: PlayerSense = {feet:v(0, 0, 20), eye:v(0, 1.65, 20), velocity:v(), alive:true, radioEnabled:false}
  const combat = () => director.enemies.forEach(e => Object.assign(e, {state:'combat', lastKnown:player.feet.clone(), canSee:true, senseTimer:100,
    tactic:'hold', tacticTimer:10, settledFor:1, shotTimer:10, random:0}))
  const step = (seconds: number) => {for(let i=0;i<Math.ceil(seconds*60);i++) director.update(1/60,player)}
  return {director, world, events, player, combat, step, dispose() {director.dispose();world.dispose()}}
}

{
  const mission = createMissionWorld()
  assert.equal(mission.enemies.length, 41)
  assert.equal(mission.enemies.filter(e=>!e.reserve).length, 37)
  assert.equal(new Set(mission.enemies.map(e=>e.id)).size, 41)
  assert.equal(mission.enemies.filter(e=>e.reserve).length, 4)
  console.log('PASS Seventeen indoor guards bring the roster to 37 active and four reserves with unique identities')
}
{
  const f = await fixture([[0,0,0], [4,0,0], [-4,0,0]])
  f.combat()
  f.director.enemies[1].tacticTimer = f.director.enemies[2].tacticTimer = 0
  f.step(1/60)
  assert.equal(f.director.enemies.filter(e=>e.tactic==='flank').length, 1)
  assert(f.director.enemies.some(e=>e.tactic==='hold' && e.settledFor>=.22))
  const snapshot = f.director.snapshot(); f.director.restore(snapshot)
  assert.deepEqual(f.director.snapshot(), snapshot)
  f.dispose()
  console.log('PASS A local squad assigns one flanker while another guard holds the firing lane; checkpoint restores tactics')
}
for (const reason of ['distant', 'reloading', 'moving'] as const) {
  const f = await fixture([[reason==='distant'?50:0,0,0],[4,0,0]])
  f.combat()
  const [covering, flanker] = f.director.enemies
  if(reason==='reloading') {covering.reloadTimer=2;covering.magazine=0}
  if(reason==='moving') {covering.tactic='charge';covering.settledFor=0}
  flanker.tacticTimer=0
  f.step(1/60)
  assert.notEqual(flanker.tactic,'flank',reason)
  f.dispose()
}
console.log('PASS Distant, moving or reloading teammates cannot authorize an unsupported flank')
{
  const f = await fixture([[0,0,0]], [2,1.5,3])
  f.combat()
  const enemy=f.director.enemies[0]
  enemy.magazine=0
  f.step(1/60)
  assert(enemy.reloadTimer>0)
  assert.equal(enemy.tactic,'cover')
  assert(enemy.tacticPoint)
  assert(!f.world.visible(f.player.eye,enemy.tacticPoint!.clone().add(v(0,1.5)),new THREE.Object3D()))
  enemy.position.copy(enemy.tacticPoint!)
  enemy.actor.root.position.copy(enemy.position)
  enemy.canSee=false
  f.step(.25)
  assert.equal(enemy.tactic,'cover','do not peek during a reload')
  assert.equal(enemy.shots,0)
  assert.equal(f.events.filter(e=>e.kind==='enemy-reload').length,1)
  f.step(2.5)
  assert.equal(enemy.magazine,30)
  f.dispose()
  console.log('PASS An empty guard reloads immediately, chooses real cover, stays there while reloading and refills once')
}
for(const blocked of [false,true]) {
  const f = await fixture([[0,0,0],[0,0,6]],blocked?[0,1.5,3]:undefined)
  f.player.feet.set(80,0,80);f.player.eye.set(80,1.65,80)
  const [guard,body]=f.director.enemies
  body.health=0;body.state='dead'
  f.step(.2)
  if(blocked) {
    assert.equal(guard.state,'guard');assert.equal(guard.noticedBodies.length,0)
  } else {
    assert.equal(guard.state,'investigate')
    assert.deepEqual(guard.lastKnown!.toArray(),body.position.toArray())
    assert.deepEqual(guard.noticedBodies,[body.spec.id])
    assert(guard.lastKnown!.distanceTo(f.player.feet)>50,'a corpse must not reveal the hidden player')
    const saved=f.director.snapshot();f.director.restore(saved)
    assert.deepEqual(f.director.snapshot(),saved)
    guard.state='guard';guard.senseTimer=0;guard.yaw=0;guard.lastKnown=null
    f.step(.2)
    assert.equal(guard.state,'guard','the same corpse cannot endlessly restart a search')
  }
  f.dispose()
}
console.log('PASS Body discovery requires line of sight, investigates the body location, and remembers discoveries across checkpoints')
{
  const f=await fixture([[-.5,0,0],[.5,0,0]],[2,1.5,3])
  f.combat()
  f.director.enemies.forEach(e=>{e.health=20;e.tacticTimer=0})
  f.step(1/60)
  const [a,b]=f.director.enemies
  assert.equal(a.tactic,'cover')
  assert(a.tacticPoint)
  if(b.tacticPoint) assert(a.tacticPoint!.distanceTo(b.tacticPoint)>=1.4)
  f.dispose()
  console.log('PASS Wounded guards prioritize shelter and do not reserve the same cover position')
}
{
  const f=await fixture([[0,0,0],[1,0,0]])
  f.player.feet.set(80,0,80);f.player.eye.set(80,1.65,80)
  f.director.enemies.forEach(e=>Object.assign(e,{state:'investigate',lastKnown:v(0,0,8),timer:12,senseTimer:100,canSee:false}))
  f.step(1/60)
  const [a,b]=f.director.enemies
  assert.equal(a.state,'search');assert.equal(b.state,'search')
  assert(a.searchPoints.length>0 && b.searchPoints.length>0)
  assert(a.searchPoints.every(p=>b.searchPoints.every(q=>p.distanceTo(q)>=2)))
  f.dispose()
  console.log('PASS Searching teammates choose separate investigation points instead of clustering on the same corner')
}
console.log('All tactical AI checks passed.')
