// Staged real-actor WebGL check: agent-browser eval --stdin < scripts/check-npc-motion.js
// This isolates actors and pauses mission updates; reload afterward.
(async () => {
  const env = window.__environment, m = env.mission
  if (!m.ready) throw new Error('Mission not ready')
  const resource = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const T = await import(resource('/node_modules/.vite/deps/three.js'))
  const { ENEMY_RUN_SPEED, HOSTAGE_RUN_SPEED } = await import(resource('/src/game/balance.ts'))
  env.player.pause()
  m.update = env.player.update = () => false
  m.audio.setMuted(true)
  const scene = new T.Scene(); scene.background = new T.Color('white')
  const camera = new T.PerspectiveCamera(36, 1.25, .01, 100)
  camera.position.set(3.6, 1.7, 3.7); camera.lookAt(0, .82, 0)
  const ground = new T.Mesh(new T.PlaneGeometry(20, 20), new T.MeshBasicMaterial({ color: 0xf8f8f8 }))
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.008; scene.add(ground)
  const renderer = new T.WebGLRenderer({ antialias: true }); renderer.outputColorSpace = T.SRGBColorSpace
  renderer.setSize(360, 288)
  const sheet = document.createElement('canvas'); sheet.width = 1440; sheet.height = 660
  const g = sheet.getContext('2d'); g.fillStyle = 'white'; g.fillRect(0, 0, sheet.width, sheet.height)
  const h = m.escort.actors[0], e = m.ai.enemies.find(enemy => enemy.spec.weapon === 'ak').actor
  const names = Object.keys(h.rig.bones)
  const capturePose = rig => names.map(name => ({p: rig.bones[name].position.clone(), q: rig.bones[name].quaternion.clone().normalize()}))
  const compare = (rig, pose) => Math.max(...names.map((name,i) => Math.max(rig.bones[name].position.distanceTo(pose[i].p), rig.bones[name].quaternion.clone().normalize().angleTo(pose[i].q))))
  const rows = []
  const subjects = [
    {actor:h, label:'Hostage · blue · 2.6 m/s', reset:()=>h.restore(false), tick:(dt, run)=>h.animate(dt, run, false, false, false)},
    {actor:e, label:'Enemy · 4.2 m/s', reset:()=>e.restore('guard'), tick:(dt, run)=>e.update(dt, run?'combat':'guard', run, undefined, run?ENEMY_RUN_SPEED:0)},
  ]
  for (const [row, subject] of subjects.entries()) {
    const actor = subject.actor
    scene.add(actor.root); actor.root.position.set(0,0,0); actor.root.rotation.set(0,0,0); actor.root.visible=true
    subject.reset()
    for(let i=0;i<90;i++) subject.tick(1/60,true)
    const capture = (column, label) => {
      renderer.render(scene, camera)
      g.drawImage(renderer.domElement, column*360, row*330+42)
      g.fillStyle='#222'; g.font='15px sans-serif'; g.fillText(label,column*360+12,row*330+24)
    }
    capture(0,subject.label)
    const before = capturePose(actor.rig)
    subject.tick(0,false)
    const discontinuity = compare(actor.rig,before)
    if(discontinuity>1e-5) throw new Error('Pose snaps: '+discontinuity)
    capture(1,'Idle requested · 0 ms')
    for(let i=0;i<13;i++)subject.tick(1/120,false)
    capture(2,'Blending · 108 ms')
    for(let i=0;i<17;i++)subject.tick(1/120,false)
    capture(3,'Settled · 250 ms')
    scene.remove(actor.root)
    rows.push({actor:subject.label, discontinuity, finalClip:actor.player.current.getClip().name})
  }
  const color=h.rig.mesh.material.color
  if(!(color.b>2*color.r&&color.b>2*color.g))throw new Error('Hostage is not blue')
  if(e.rig.mesh.material.color.getHex()!==0)throw new Error('Enemy color changed')
  sheet.id='npc-transition-evidence';sheet.style.cssText='position:fixed;inset:0;z-index:999999;width:100%;height:auto;background:white'
  document.body.append(sheet)
  renderer.dispose(); ground.geometry.dispose(); ground.material.dispose()
  return {passed:true,rows,hostageColor:color.getHexString(),hostageSpeed:HOSTAGE_RUN_SPEED,enemySpeed:ENEMY_RUN_SPEED,invincible:m.invincible}
})()
