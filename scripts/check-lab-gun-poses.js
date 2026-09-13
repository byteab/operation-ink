// Evaluate in the running development /lab.html page, e.g. agent-browser eval --stdin.
// Complements check-lab-guns.js with geometry and 60 Hz animation regression checks.
// A passing report is a guard against clipping/snaps, not a replacement for multi-view visual review.
(async () => {
  const ctx = window.__lab
  if (!ctx) throw new Error('Open the development Stickman Lab before running the gun pose checks.')
  const activeUrl = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const module = await import(activeUrl('/src/lab/weapons/guns.ts'))
  const threeUrl = performance.getEntriesByType('resource').find(e => new URL(e.name).pathname.endsWith('/three.js'))?.name
  if (!threeUrl) throw new Error('Three.js has not loaded yet.')
  const T = await import(threeUrl)
  const registry = await import(activeUrl('/src/lab/registry.ts'))
  if (module.clips.gun_aim2 !== ctx.clips.gun_aim2) throw new Error('Reload the page to test its active gun module.')
  if (registry.clips !== ctx.clips) throw new Error('Reload the page to test its active action registry.')
  const player = ctx.player, rig = ctx.rig, guns = ctx.weapons.guns
  const original = {
    speed: player.mixer.timeScale, fade: player.fade, name: guns.current?.userData.name,
    stance: guns.stance, automatic: guns.automatic, clip: player.current?.getClip(),
    position: rig.root.position.clone(), quaternion: rig.root.quaternion.clone(),
  }
  const results = [], started = performance.now(), vec = () => new T.Vector3()
  let currentMetrics
  const assert = (value, message) => { if (!value) throw new Error(message) }
  const point = (bone, local = vec()) => rig.bones[bone].localToWorld(local.clone())
  const worldDirection = bone => new T.Vector3(0, 1, 0).transformDirection(rig.bones[bone].matrixWorld)
  const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  const step = async (dt = 1 / 60, speed = 1, sample) => {
    player.setSpeed(speed)
    try {
      player.update(dt)
      module.update(dt, ctx)
      // main.ts renders here. Completion promises may switch clips afterward; their
      // uncorrected intermediate poses are never presented by the renderer.
      sample?.()
    } finally { player.setSpeed(0) }
    await settle()
    rig.root.updateMatrixWorld(true)
  }
  const advance = async seconds => {
    const count = Math.ceil(seconds * 60)
    for (let i = 0; i < count; i++) await step(seconds / count)
  }
  const equip = async (name, stance = 'aim') => {
    player.fade = 0
    guns.equip(name)
    if (stance === 'aim') guns.aim()
    if (stance === 'hip') guns.hip()
    await step(0)
    await advance(0.25)
    return guns.current
  }
  const test = async (name, run) => {
    currentMetrics = undefined
    try { results.push({ name, passed: true, details: await run() }) }
    catch (e) { results.push({ name, passed: false, error: String(e?.message ?? e), details: currentMetrics }) }
  }

  // Derive the visible fist from the bind mesh, independently of the weapon solver's
  // contact constant. A wrist-origin check alone accepts a gun mounted inside the arm.
  // Only near-rigid hand vertices are used: THREE.applyBoneTransform uses linear skinning,
  // whereas the rendered character uses dual quaternions.
  const fistLocal = {}
  for (const side of ['L', 'R']) {
    const mesh = rig.mesh, geometry = mesh.geometry, skeleton = mesh.skeleton
    const index = skeleton.bones.indexOf(rig.bones[`hand.${side}`])
    const positions = geometry.attributes.position, indices = geometry.attributes.skinIndex, weights = geometry.attributes.skinWeight
    const bounds = new T.Box3()
    for (let i = 0; i < positions.count; i++) {
      for (let j = 0; j < 4; j++) {
        if (indices.getComponent(i, j) !== index || weights.getComponent(i, j) < 0.9) continue
        bounds.expandByPoint(vec().fromBufferAttribute(positions, i).applyMatrix4(mesh.bindMatrix).applyMatrix4(skeleton.boneInverses[index]))
      }
    }
    assert(!bounds.isEmpty(), `The ${side} hand has no near-rigid fist vertices.`)
    fistLocal[side] = bounds.getCenter(vec())
  }
  const fist = side => point(`hand.${side}`, fistLocal[side])
  const gripError = (model, side, anchor) => fist(side).distanceTo(model.localToWorld(anchor.clone()))

  // Sample actual weapon triangle surfaces (including large stock faces), not world AABBs.
  // Conservative interior capsules reject deep intersections while permitting a stock
  // to touch the shoulder and a hand to wrap a grip. The visible limb radii are 4–5 cm;
  // these 2.5–3 cm cores intentionally leave margin for the dual-quaternion skin surface.
  const samples = new WeakMap()
  const weaponSamples = model => {
    if (samples.has(model)) return samples.get(model)
    const meshes = []
    model.traverse(mesh => {
      if (!mesh.isMesh) return
      const geometry = mesh.geometry, p = geometry.attributes.position, index = geometry.index
      const points = [], seen = new Set(), a = vec(), b = vec(), c = vec(), sample = vec()
      const add = v => {
        const key = v.toArray().map(x => Math.round(x * 10000)).join(',')
        if (!seen.has(key)) { seen.add(key); points.push(v.clone()) }
      }
      const count = index?.count ?? p.count
      for (let i = 0; i < count; i += 3) {
        a.fromBufferAttribute(p, index ? index.getX(i) : i)
        b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1)
        c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2)
        const divisions = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.025))
        for (let j = 0; j <= divisions; j++) for (let k = 0; k <= divisions - j; k++) {
          add(sample.copy(a).multiplyScalar(1 - (j + k) / divisions).addScaledVector(b, j / divisions).addScaledVector(c, k / divisions))
        }
      }
      meshes.push({ mesh, points })
    })
    samples.set(model, meshes)
    return meshes
  }
  const bodyCapsules = () => {
    const head = point('head', new T.Vector3(0, 0.185, 0))
    const capsules = [
      { name: 'torso', a: point('hips'), b: point('neck'), radius: 0.06 },
      { name: 'head', a: head, b: head.clone(), radius: 0.17 },
    ]
    for (const side of ['L', 'R']) {
      const shoulder = point(`upper_arm.${side}`), elbow = point(`forearm.${side}`), wrist = point(`hand.${side}`)
      const thigh = point(`thigh.${side}`), knee = point(`shin.${side}`)
      capsules.push(
        { name: `upper arm ${side}`, a: shoulder.clone().lerp(elbow, 0.2), b: elbow, radius: 0.027 },
        { name: `forearm ${side}`, a: elbow.clone(), b: wrist.clone().lerp(elbow, 0.2), radius: 0.025 },
        { name: `thigh ${side}`, a: thigh, b: knee, radius: 0.035 },
        { name: `shin ${side}`, a: knee.clone(), b: point(`shin.${side}`, new T.Vector3(0, 0.36, 0)), radius: 0.03 },
      )
    }
    for (const capsule of capsules) {
      capsule.direction = capsule.b.clone().sub(capsule.a)
      capsule.lengthSquared = capsule.direction.lengthSq()
    }
    return capsules
  }
  const measureCollision = model => {
    const capsules = bodyCapsules(), p = vec(), relative = vec(), nearest = vec(), gunInverse = model.matrixWorld.clone().invert()
    let worst = { clearance: Infinity, body: '', weaponPoint: [] }, minWeaponHeight = Infinity
    for (const { mesh, points } of weaponSamples(model)) for (const local of points) {
      p.copy(local).applyMatrix4(mesh.matrixWorld)
      minWeaponHeight = Math.min(minWeaponHeight, p.y)
      for (const capsule of capsules) {
        relative.subVectors(p, capsule.a)
        const t = capsule.lengthSquared ? T.MathUtils.clamp(relative.dot(capsule.direction) / capsule.lengthSquared, 0, 1) : 0
        nearest.copy(capsule.a).addScaledVector(capsule.direction, t)
        const clearance = p.distanceTo(nearest) - capsule.radius
        if (clearance < worst.clearance) worst = { clearance, body: capsule.name, weaponPoint: p.toArray(), weaponLocalPoint: p.clone().applyMatrix4(gunInverse).toArray(), capsulePoint: nearest.toArray(), capsuleFraction: t }
      }
    }
    return { ...worst, minWeaponHeight }
  }
  const frame = model => ({
    grip: model.getWorldPosition(vec()), muzzle: model.localToWorld(model.userData.muzzle.clone()),
    elbows: ['L', 'R'].map(side => point(`forearm.${side}`)), hands: ['L', 'R'].map(fist),
    handRotations: ['L', 'R'].map(side => rig.bones[`hand.${side}`].getWorldQuaternion(new T.Quaternion()).normalize()),
  })
  const measureFrame = (model, metrics, previous, collision = true) => {
    rig.root.updateMatrixWorld(true)
    const current = frame(model)
    for (const bone of Object.values(rig.bones)) assert(bone.quaternion.toArray().every(Number.isFinite), 'A bone rotation is non-finite.')
    if (previous) {
      const gripStep = current.grip.distanceTo(previous.grip)
      if (gripStep > metrics.maxGripStep) Object.assign(metrics, { maxGripStep: gripStep, gripStepClip: player.current?.getClip().name, gripStepTime: player.current?.time, gripStepCase: metrics.carryCase })
      metrics.maxMuzzleStep = Math.max(metrics.maxMuzzleStep, current.muzzle.distanceTo(previous.muzzle))
      for (let i = 0; i < 2; i++) {
        const elbowStep = current.elbows[i].distanceTo(previous.elbows[i])
        if (elbowStep > metrics.maxElbowStep) Object.assign(metrics, { maxElbowStep: elbowStep, elbowSide: ['L', 'R'][i], elbowStepClip: player.current?.getClip().name, elbowStepTime: player.current?.time })
        metrics.maxHandStep = Math.max(metrics.maxHandStep, current.hands[i].distanceTo(previous.hands[i]))
        const handRotationStep = current.handRotations[i].angleTo(previous.handRotations[i]) * T.MathUtils.RAD2DEG
        if (handRotationStep > metrics.maxHandRotationStep) Object.assign(metrics, { maxHandRotationStep: handRotationStep, handRotationSide: ['L', 'R'][i], handRotationClip: player.current?.getClip().name, handRotationTime: player.current?.time })
      }
    }
    for (const side of ['L', 'R']) {
      const bend = worldDirection(`forearm.${side}`).angleTo(worldDirection(`hand.${side}`)) * T.MathUtils.RAD2DEG
      if (bend > metrics.maxWristBend) Object.assign(metrics, { maxWristBend: bend, wristSide: side, wristClip: player.current?.getClip().name, wristTime: player.current?.time })
      for (const bone of [`forearm.${side}`, `hand.${side}`]) {
        const ratio = rig.bones[bone].position.length() / rig.rest[bone].pos.length()
        assert(Math.abs(ratio - 1) < 0.02, `${bone} changes limb length by ${(100 * (ratio - 1)).toFixed(1)}%.`)
      }
    }
    if (model.parent === rig.bones['hand.R']) metrics.maxTriggerError = Math.max(metrics.maxTriggerError, gripError(model, 'R', vec()))
    if (collision) {
      const measured = measureCollision(model)
      const minWeaponHeight = Math.min(metrics.minWeaponHeight, measured.minWeaponHeight)
      if (measured.clearance < metrics.clearance) Object.assign(metrics, measured, { collisionClip: player.current?.getClip().name, collisionTime: player.current?.time, collisionCase: metrics.carryCase })
      metrics.minWeaponHeight = minWeaponHeight
    }
    metrics.frames++
    return current
  }
  const metrics = () => (currentMetrics = { frames: 0, clearance: Infinity, minWeaponHeight: Infinity, maxGripStep: 0, maxMuzzleStep: 0, maxElbowStep: 0, maxHandStep: 0, maxHandRotationStep: 0, maxWristBend: 0, maxTriggerError: 0, maxSupportError: 0, maxMechanismError: 0, mechanismFrames: 0 })
  const validate = (m, temporal = false) => {
    assert(m.minWeaponHeight >= -0.005, `Weapon passes ${(100 * -m.minWeaponHeight).toFixed(1)} cm below the floor.`)
    assert(m.clearance >= -0.003, `Weapon penetrates the ${m.body} core by ${(-m.clearance * 100).toFixed(2)} cm.`)
    assert(m.maxTriggerError < 0.035, `Grip is ${(m.maxTriggerError * 100).toFixed(2)} cm from the visible firing fist.`)
    assert(m.maxSupportError < 0.035, `Support hand loses its fore-end by ${(m.maxSupportError * 100).toFixed(2)} cm.`)
    assert(m.maxMechanismError < 0.035, `Operating hand loses a moving mechanism by ${(m.maxMechanismError * 100).toFixed(2)} cm.`)
    assert(m.maxWristBend < 90, `Wrist folds ${m.maxWristBend.toFixed(1)}° away from the forearm.`)
    if (temporal) {
      assert(m.maxGripStep < 0.065, `Gun grip jumps ${(100 * m.maxGripStep).toFixed(1)} cm in one 60 Hz frame.`)
      assert(m.maxMuzzleStep < 0.11, `Muzzle jumps ${(100 * m.maxMuzzleStep).toFixed(1)} cm in one 60 Hz frame.`)
      assert(m.maxElbowStep < 0.09, `Elbow jumps ${(100 * m.maxElbowStep).toFixed(1)} cm in one 60 Hz frame.`)
      assert(m.maxHandRotationStep < 35, `Hand orientation snaps ${m.maxHandRotationStep.toFixed(1)}° in one 60 Hz frame.`)
      assert(m.maxHandStep < 0.11, `Hand jumps ${(100 * m.maxHandStep).toFixed(1)} cm in one 60 Hz frame.`)
    }
    return m
  }

  // Clearance alone accepts the old hooked small-gun hold. In a settled lowered
  // carry the arm should hang with a soft elbow; aiming extends it, while a hip
  // shot legitimately bends it. Check neutral firing wrists in all three cases.
  // These are posture bounds, not exact authored targets or mechanism/reload limits.
  const observeSmallGunPosture = (m, stance) => {
    const upper = point('forearm.R').sub(point('upper_arm.R'))
    const forearm = point('hand.R').sub(point('forearm.R'))
    const measured = {
      elbow: upper.angleTo(forearm) * T.MathUtils.RAD2DEG,
      wrist: worldDirection('hand.R').angleTo(forearm) * T.MathUtils.RAD2DEG,
      upperFromDown: upper.angleTo(new T.Vector3(0, -1, 0)) * T.MathUtils.RAD2DEG,
    }
    const maxima = m.smallGunPosture ??= { samples: 0, elbow: 0, wrist: 0, upperFromDown: 0 }
    maxima.samples++
    for (const [key, value] of Object.entries(measured)) maxima[key] = Math.max(maxima[key], value)
    assert(measured.wrist < 25, `Small-gun ${stance} wrist hooks ${measured.wrist.toFixed(1)}° away from the forearm.`)
    if (stance === 'down') {
      assert(measured.elbow < 45, `Relaxed small-gun carry curls its elbow ${measured.elbow.toFixed(1)}°.`)
      assert(measured.upperFromDown < 30, `Relaxed small-gun upper arm rises ${measured.upperFromDown.toFixed(1)}° away from a hanging posture.`)
    }
    if (stance === 'aim') assert(measured.elbow < 40, `Aimed small-gun arm remains curled ${measured.elbow.toFixed(1)}° at the elbow.`)
  }

  const mechanismState = model => Object.fromEntries(Object.entries(model.userData.parts).map(([name, obj]) => [name, {
    position: obj.position.clone(), previousPosition: obj.position.clone(), previousRotation: obj.quaternion.clone(),
  }]))
  const observeContacts = (model, m, restParts, operation) => {
    const parts = model.userData.parts
    if (operation === 'fire' && model.userData.twoHanded && model.userData.support) {
      const anchor = model.userData.support.clone()
      if (parts.pump) anchor.z += parts.pump.position.z - restParts.pump.position.z
      const error = gripError(model, 'L', anchor)
      if (error > m.maxSupportError) Object.assign(m, { maxSupportError: error, supportClip: player.current?.getClip().name, supportTime: player.current?.time })
    }
    for (const [name, part] of Object.entries(parts)) {
      if (!part.userData.grip || name === 'pump') continue
      // Reload hands must remain with the magazine/cylinder/charging handle while it
      // physically moves. During firing only a manual bolt is hand-operated.
      if (operation === 'fire' && !(model.userData.name === 'sniper' && name === 'bolt')) continue
      const rest = restParts[name]
      const moves = part.position.distanceTo(rest.previousPosition) > 0.0001 || part.quaternion.angleTo(rest.previousRotation) > 0.002
      const rearward = part.position.z < rest.previousPosition.z - 0.0001
      rest.previousPosition.copy(part.position)
      rest.previousRotation.copy(part.quaternion)
      if (!moves) continue
      // Slides and automatic charging handles spring forward after release. A cylinder
      // can stay swung out while the other hand reaches for ammunition.
      if (operation === 'reload' && ['slide', 'bolt'].includes(name) && model.userData.name !== 'sniper' && !rearward) continue
      part.updateWorldMatrix(true, false)
      const side = operation === 'fire' ? 'R' : 'L'
      const error = fist(side).distanceTo(part.localToWorld(part.userData.grip.clone()))
      if (error > m.maxMechanismError) Object.assign(m, {
        maxMechanismError: error, mechanism: name, mechanismClip: player.current?.getClip().name, mechanismTime: player.current?.time,
      })
      m.mechanismFrames++
    }
  }

  try {
    player.setSpeed(0)
    module.update(0, ctx)
    await test('Wrist calibration preserves the complete rest-mesh silhouette', async () => {
      guns.unequip()
      player.stop(0)
      rig.resetPose()
      rig.root.updateMatrixWorld(true)
      // At rest every skin transform must be the same rigid root transform. This
      // verifies that moving a wrist joint also updated its inverse bind matrix.
      const skeleton = rig.mesh.skeleton, reference = new T.Matrix4()
      reference.multiplyMatrices(skeleton.bones[0].matrixWorld, skeleton.boneInverses[0])
      let maxDifference = 0
      skeleton.bones.forEach((bone, i) => {
        const actual = new T.Matrix4().multiplyMatrices(bone.matrixWorld, skeleton.boneInverses[i])
        actual.elements.forEach((value, j) => { maxDifference = Math.max(maxDifference, Math.abs(value - reference.elements[j])) })
      })
      assert(maxDifference < 1e-6, `Rest skin transforms disagree by ${maxDifference}; the mesh deforms during wrist rebinding.`)
      return { maxSkinMatrixDifference: maxDifference }
    })
    for (const name of guns.names) {
      await test(`${name}: default-fade Idle → Equip starts with a clear carry`, async () => {
        guns.unequip()
        player.fade = 0.2
        const idle = registry.actions.find(a => a.label === 'Idle')
        assert(idle, 'Expected lab Idle action is missing.')
        void idle.run(ctx)
        await advance(0.35)
        const labels = { pistol: 'Pistol', revolver: 'Revolver', smg: 'SMG', ak: 'AK-47', shotgun: 'Shotgun', sniper: 'Sniper' }
        const action = registry.actions.find(a => a.label === `Equip: ${labels[name]}`)
        assert(action, `Expected lab equip action for ${name} is missing.`)
        void action.run(ctx)
        const model = guns.current, m = metrics()
        assert(model?.userData.name === name, 'Equip action did not select the expected weapon.')
        const restParts = mechanismState(model)
        for (let i = 0; i < 36; i++) await step(1 / 60, 1, () => {
          measureFrame(model, m, null)
          observeContacts(model, m, restParts, 'fire')
        })
        return validate(m)
      })
      for (const stance of ['down', 'aim', 'hip']) {
        await test(`${name}: ${stance} body clearance, visible grip, and wrists`, async () => {
          const model = await equip(name, stance), m = metrics()
          measureFrame(model, m)
          if (model.userData.twoHanded && model.userData.support) {
            const error = gripError(model, 'L', model.userData.support)
            assert(error < 0.035, `Support grip is ${(100 * error).toFixed(2)} cm from the visible fist.`)
          }
          if (!model.userData.twoHanded) observeSmallGunPosture(m, stance)
          return validate(m)
        })
      }
      for (const stance of ['aim', 'hip', 'down']) for (const operation of ['fire', 'reload']) {
        await test(`${name}: ${operation} from ${stance}, every animation frame`, async () => {
          const model = await equip(name, stance), m = metrics()
          player.fade = 0.2
          let previous = frame(model)
          const restParts = mechanismState(model)
          guns[operation]()
          previous = measureFrame(model, m, previous)
          // Includes recoil -> pump/bolt, hand transfers, mechanism reset, and the return fade.
          for (let i = 0; i < 240; i++) {
            await step(1 / 60, 1, () => {
              previous = measureFrame(model, m, previous)
              observeContacts(model, m, restParts, operation)
            })
            if (!guns.busy && i > 25) break
          }
          assert(!guns.busy, 'Operation is still busy after four seconds.')
          for (let i = 0; i < 18; i++) { await step(1 / 60, 1, () => { previous = measureFrame(model, m, previous) }) }
          return validate(m, true)
        })
      }
      if (['smg', 'ak'].includes(name)) for (const stance of ['aim', 'hip', 'down']) {
        await test(`${name}: automatic fire from ${stance} retains posture and contact`, async () => {
          const model = await equip(name, stance), m = metrics(), restParts = mechanismState(model)
          player.fade = 0.2
          let previous = frame(model)
          guns.toggleAuto()
          previous = measureFrame(model, m, previous)
          for (let i = 0; i < 120; i++) {
            await step(1 / 60, 1, () => {
              previous = measureFrame(model, m, previous)
              observeContacts(model, m, restParts, 'fire')
            })
          }
          guns.toggleAuto()
          for (let i = 0; i < 18; i++) { await step(1 / 60, 1, () => { previous = measureFrame(model, m, previous) }) }
          return validate(m, true)
        })
      }
      await test(`${name}: smooth stance changes`, async () => {
        const model = await equip(name, 'down'), m = metrics()
        player.fade = 0.2
        let previous = frame(model)
        for (const change of ['aim', 'hip', 'lower', 'hip', 'aim', 'lower']) {
          guns[change]()
          for (let i = 0; i < 24; i++) { await step(1 / 60, 1, () => { previous = measureFrame(model, m, previous) }) }
        }
        return validate(m, true)
      })
      if (['pistol', 'shotgun'].includes(name)) await test(`${name}: pause freezes a stance transition`, async () => {
        const model = await equip(name, 'down')
        player.fade = 0.3
        guns.aim()
        await advance(0.08)
        const before = frame(model), time = player.current.time
        const bones = Object.values(rig.bones).map(b => ({ b, q: b.quaternion.clone(), p: b.position.clone() }))
        await step(10, 0)
        assert(player.current.time === time, 'Paused transition advanced the animation clock.')
        assert(frame(model).muzzle.distanceTo(before.muzzle) < 1e-6, 'Paused transition moved the weapon.')
        for (const { b, q, p } of bones) assert(b.quaternion.toArray().every((v, i) => Math.abs(v - q.toArray()[i]) < 1e-7) && b.position.distanceTo(p) < 1e-7, `Paused transition changed ${b.name}.`)
        await advance(0.4)
      })
      await test(`${name}: ordinary carry transitions preserve posture and requested actions`, async () => {
        const m = metrics()
        const cases = [
          ['aim', 'Walk', 'fire', 'aim'], ['hip', 'Crouch', 'fire', 'hip'],
          ['down', 'Walk', 'aim', 'aim'], ['aim', 'Run', 'hip', 'hip'],
          ['aim', 'Crouch', 'lower', 'down'], ['down', 'Walk', 'aimThenFire', 'aim'],
          ['aim', 'Walk', 'reload', 'aim'],
        ]
        if (['smg', 'ak'].includes(name)) cases.push(['aim', 'Run', 'toggleAuto', 'aim'])
        m.carryCases = cases.map(([, action, operation, destination]) => `${action} → ${operation} → ${destination}`)
        for (const [stance, label, operation, destination] of cases) {
          const model = await equip(name, stance)
          const action = registry.actions.find(a => a.label === label)
          assert(action, `Expected lab action ${label} is missing.`)
          void action.run(ctx)
          await advance(0.5)
          player.fade = 0.2
          const restParts = mechanismState(model)
          const knownEffects = new WeakSet(ctx.scene.getObjectByName('gun effects')?.children ?? [])
          let previous = frame(model), shots = 0
          m.carryCase = `${label} → ${operation} → ${destination}`
          const sample = () => {
            previous = measureFrame(model, m, previous)
            observeContacts(model, m, restParts, operation === 'reload' ? 'reload' : 'fire')
            for (const obj of ctx.scene.getObjectByName('gun effects')?.children ?? []) {
              if (knownEffects.has(obj)) continue
              knownEffects.add(obj)
              if (obj.isSprite) shots++
            }
          }
          guns[operation === 'aimThenFire' ? 'aim' : operation]()
          if (operation === 'aimThenFire') {
            for (let i = 0; i < 3; i++) await step(1 / 60, 1, sample)
            guns.fire()
          }
          for (let i = 0; i < 240; i++) {
            await step(1 / 60, 1, sample)
            if (operation === 'toggleAuto' ? i >= 75 : !guns.busy && i > 35) break
          }
          if (guns.automatic) guns.toggleAuto()
          assert(!guns.busy && guns.stance === destination, `${m.carryCase} did not finish in the requested stance.`)
          if (['fire', 'aimThenFire'].includes(operation)) assert(shots === 1, `${m.carryCase} emitted ${shots} shots instead of one.`)
          if (operation === 'toggleAuto') assert(shots > 0, `${m.carryCase} never emitted an automatic shot.`)
          for (let i = 0; i < 18; i++) await step(1 / 60, 1, sample)
        }
        return validate(m, true)
      })
      await test(`${name}: carry remains clear during ordinary animations and turns`, async () => {
        const model = await equip(name), m = metrics()
        // Root transform catches a solver accidentally treating a character-local pole as world-local.
        rig.root.position.set(0.4, 0, -0.2)
        rig.root.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), 1.1)
        m.ordinaryClips = ['idle', 'walk', 'run', 'jump', 'crouchIdle', 'crouchWalk', 'alert', 'alertIdle', 'cower', 'cowerHold', 'lookRelaxed', 'point', 'turnL', 'turnR']
        const actionLabels = {
          idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump', crouchIdle: 'Crouch', crouchWalk: 'Crouch walk',
          alert: 'Alert', cower: 'Cower', lookRelaxed: 'Look around (relaxed)', point: 'Point/shout', turnL: 'Turn L', turnR: 'Turn R',
        }
        for (const name of m.ordinaryClips) {
          const clip = ctx.clips[name]
          assert(clip, `Expected ordinary animation ${name} is missing.`)
          if (actionLabels[name]) {
            const action = registry.actions.find(a => a.label === actionLabels[name])
            assert(action, `Expected lab action ${actionLabels[name]} is missing.`)
            // Turning actions rotate the root before playing their compensating hip keys.
            // Call real UI actions so tests do not invent a discontinuous heading change.
            void action.run(ctx)
          } else player.play(clip, { fade: 0 })
          const frames = Math.ceil(Math.max(0.5, clip.duration) * 60)
          for (let i = 0; i < frames; i++) await step(1 / 60, 1, () => {
            measureFrame(model, m, null)
            // Let the carry handoff finish before judging the relaxed silhouette.
            // Crouching/running and expressive clips intentionally use different bends.
            if (!model.userData.twoHanded && ['idle', 'walk'].includes(name) && i >= 24) observeSmallGunPosture(m, 'down')
          })
        }
        rig.root.position.copy(original.position)
        rig.root.quaternion.copy(original.quaternion)
        return validate(m)
      })
    }
    await test('Sniper: interrupting a support-hand bolt cycle remounts smoothly', async () => {
      const m = metrics()
      for (const [command, destination] of [['aim', 'aim'], ['hip', 'hip'], ['lower', 'down']]) {
        const model = await equip('sniper', 'aim')
        guns.fire()
        await advance(0.7)
        assert(model.parent === rig.bones['hand.L'], 'Sniper did not reach its support-hand bolt cycle.')
        player.fade = 0.2
        let previous = frame(model)
        m.carryCase = `Bolt cycle → ${command}`
        guns[command]()
        for (let i = 0; i < 36; i++) await step(1 / 60, 1, () => { previous = measureFrame(model, m, previous) })
        assert(!guns.busy && guns.stance === destination, `Interrupted bolt cycle did not finish in ${destination}.`)
        assert(model.parent === rig.bones['hand.R'], 'Interrupted bolt cycle did not restore the firing hand.')
      }
      return validate(m, true)
    })
    const report = { passed: results.every(r => r.passed), durationMs: Math.round(performance.now() - started), fistLocal: Object.fromEntries(Object.entries(fistLocal).map(([s, p]) => [s, p.toArray()])), results }
    window.__gunPoseReport = report
    if (!report.passed) throw new Error(JSON.stringify(report))
    return report
  } finally {
    rig.root.position.copy(original.position)
    rig.root.quaternion.copy(original.quaternion)
    guns.unequip()
    if (original.name) {
      guns.equip(original.name)
      if (original.stance === 'aim') guns.aim()
      if (original.stance === 'hip') guns.hip()
      if (original.automatic && guns.canAuto) guns.toggleAuto()
    } else if (original.clip) player.play(original.clip, { fade: 0 })
    player.update(0)
    module.update(0, ctx)
    player.fade = original.fade
    player.setSpeed(original.speed)
  }
})()
