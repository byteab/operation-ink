import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { loadStickman } from '../src/lab/rig'
import { GAIT_SPEED, gaitStance, SHIN_LENGTH } from '../src/lab/gait'
import { Player } from '../src/lab/player'
import { EnemyActor } from '../src/game/actors'
import { ENEMY_RUN_SPEED, HOSTAGE_RUN_SPEED } from '../src/game/balance'
import { HostageActor } from '../src/game/hostage-actor'

const bytes = readFileSync('public/models/stickman.glb'), load = GLTFLoader.prototype.loadAsync
GLTFLoader.prototype.loadAsync = async function () {
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
}
try {
  const rig = await loadStickman(), player = new Player(rig.root)
  const { clips } = await import('../src/lab/clips/locomotion')
  const { clips: idle } = await import('../src/lab/clips/idle')
  const foot = (side: 'L' | 'R') => rig.bones[`shin.${side}`].localToWorld(new THREE.Vector3(0, SHIN_LENGTH, 0))
  // Test the real near-rigid end-cap vertices, independently of the IK targets.
  // They use one shin matrix in both linear and dual-quaternion skinning.
  const cap = { L: [] as THREE.Vector3[], R: [] as THREE.Vector3[] }
  for (const side of ['L', 'R'] as const) {
    const index = rig.mesh.skeleton.bones.indexOf(rig.bones[`shin.${side}`])
    const geometry = rig.mesh.geometry, { position, skinIndex, skinWeight } = geometry.attributes
    for (let i = 0; i < position.count; i++) {
      for (let j = 0; j < 4; j++) {
        if (skinIndex.getComponent(i, j) !== index || skinWeight.getComponent(i, j) < 0.999) continue
        const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(rig.mesh.bindMatrix)
          .applyMatrix4(rig.mesh.skeleton.boneInverses[index])
        if (p.y > SHIN_LENGTH - 0.065) cap[side].push(p)
      }
    }
    assert(cap[side].length > 10, 'Need real end-cap surface samples')
  }
  const baseSpans = new Map<string, number>()
  for (const name of ['walk', 'run'] as const) for (const speed of [1, 0.5, 1.2, 1.5, 2]) {
    player.setSpeed(speed)
    void player.play(clips[name], { fade: 0 })
    const clip = player.current!.getClip()
    const cadence = speed * player.current!.timeScale
    const stance = gaitStance(name, speed / cadence)
    const previous = new Map<string, THREE.Vector3>(), supportStart = new Map<string, THREE.Vector3>()
    let minGround = Infinity, maxSupportGap = 0, maxSlide = 0, maxStep = 0, minSeparation = Infinity, flight = 0
    let maxKnee = 0, maxSupportKnee = 0, maxFoot = 0, maxDescent = 0, maxContactDescent = 0, maxSway = 0
    let minHip = Infinity, maxHip = 0, maxHipSpeed = 0, maxHipVelocityChange = 0, maxElbowOut = 0, maxHandOut = 0
    let minHead = Infinity, maxHead = -Infinity, maxHeadSpeed = 0
    const hipVelocities: THREE.Vector3[] = []
    let previousHip: THREE.Vector3 | undefined
    let previousHead: THREE.Vector3 | undefined
    let minFootZ = Infinity, maxFootZ = -Infinity
    let heelPeakZ = 0, lowestHipPhase = 0, highestHipPhase = 0
    let minChestPitch = Infinity, maxChestPitch = -Infinity, minHeadPitch = Infinity, maxHeadPitch = -Infinity
    let chestPitchPeak = 0, headPitchPeak = 0
    const extension = { L: Infinity, R: Infinity }
    let passingHip = 0, contactHip = 0, maxPassingKnee = 0
    // Include samples between baked keys: exact keys alone can hide foot skating.
    const samples = name === 'run' ? 480 : 240
    for (let i = 0; i <= samples; i++) {
      const phase = i / samples
      player.current!.time = phase * clip.duration
      player.update(0); rig.root.updateMatrixWorld(true)
      if (rig.bones.hips.position.y < minHip) lowestHipPhase = phase % 0.5
      if (rig.bones.hips.position.y > maxHip) highestHipPhase = phase % 0.5
      minHip = Math.min(minHip, rig.bones.hips.position.y); maxHip = Math.max(maxHip, rig.bones.hips.position.y)
      maxSway = Math.max(maxSway, Math.abs(rig.bones.hips.position.x))
      const head = rig.bones.head.getWorldPosition(new THREE.Vector3())
      minHead = Math.min(minHead, head.y); maxHead = Math.max(maxHead, head.y)
      if (previousHead) maxHeadSpeed = Math.max(maxHeadSpeed, head.distanceTo(previousHead) * samples / clip.duration)
      previousHead = head
      if (previousHip) {
        const velocity = rig.bones.hips.position.clone().sub(previousHip).multiplyScalar(samples / clip.duration)
        maxHipSpeed = Math.max(maxHipSpeed, velocity.length())
        hipVelocities.push(velocity)
      }
      previousHip = rig.bones.hips.position.clone()
      if (i === samples) break
      if (i === 0) contactHip = rig.bones.hips.position.y
      if (i === samples / 4) passingHip = rig.bones.hips.position.y
      const chestUp = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.bones.chest.getWorldQuaternion(new THREE.Quaternion()))
      if (name === 'walk') assert(Math.abs(Math.atan2(chestUp.z, chestUp.y)) < THREE.MathUtils.degToRad(5), 'Walk hunches instead of standing tall')
      if (name === 'run') {
        const pitch = (bone: 'hips' | 'chest' | 'head') => {
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.bones[bone].getWorldQuaternion(new THREE.Quaternion()))
          return THREE.MathUtils.radToDeg(Math.atan2(up.z, up.y))
        }
        const chestPitch = pitch('chest'), headPitch = pitch('head')
        if (chestPitch > maxChestPitch) chestPitchPeak = phase % 0.5
        if (headPitch > maxHeadPitch) headPitchPeak = phase % 0.5
        minChestPitch = Math.min(minChestPitch, chestPitch); maxChestPitch = Math.max(maxChestPitch, chestPitch)
        minHeadPitch = Math.min(minHeadPitch, headPitch); maxHeadPitch = Math.max(maxHeadPitch, headPitch)
        assert(chestPitch > 8 && chestPitch < 17 && Math.abs(chestPitch - pitch('hips')) < 6, 'Run needs a forward body line without folding at the waist')
        assert(headPitch > 1 && headPitch < 8, 'Run head must follow the forward lean while looking ahead')
        const head = rig.bones.head.getWorldPosition(new THREE.Vector3())
        const hip = rig.bones.hips.getWorldPosition(new THREE.Vector3())
        assert(head.z - hip.z > 0.05, `Running head stays stacked over the hips (${head.z - hip.z}m forward)`)
      }
      const positions = [foot('L'), foot('R')]
      minSeparation = Math.min(minSeparation, positions[0].x - positions[1].x)
      let supported = 0
      for (const [index, side] of (['L', 'R'] as const).entries()) {
        const p = positions[index], sidePhase = (phase + index * 0.5) % 1
        minFootZ = Math.min(minFootZ, p.z); maxFootZ = Math.max(maxFootZ, p.z)
        const knee = rig.bones[`shin.${side}`].getWorldPosition(new THREE.Vector3())
        const hip = rig.bones[`thigh.${side}`].getWorldPosition(new THREE.Vector3())
        const kneeBend = THREE.MathUtils.radToDeg(knee.clone().sub(hip).angleTo(p.clone().sub(knee)))
        const arm = rig.bones[`forearm.${side}`].getWorldPosition(new THREE.Vector3())
          .sub(rig.bones[`upper_arm.${side}`].getWorldPosition(new THREE.Vector3()))
          .applyQuaternion(rig.bones.chest.getWorldQuaternion(new THREE.Quaternion()).invert())
        maxElbowOut = Math.max(maxElbowOut, arm.x * (side === 'L' ? 1 : -1))
        if (i === 0 || i === samples / 2) assert(p.z * arm.z < -0.005, `${name}: arm swing is out of phase with the opposite leg`)
        const hand = rig.bones[`hand.${side}`].getWorldPosition(new THREE.Vector3())
          .sub(rig.bones[`upper_arm.${side}`].getWorldPosition(new THREE.Vector3()))
          .applyQuaternion(rig.bones.chest.getWorldQuaternion(new THREE.Quaternion()).invert())
        maxHandOut = Math.max(maxHandOut, hand.x * (side === 'L' ? 1 : -1))
        maxKnee = Math.max(maxKnee, kneeBend)
        if (p.y > maxFoot) { maxFoot = p.y; heelPeakZ = p.z - hip.z }
        assert(Math.abs(knee.x - hip.x) < 0.055, `${name}: knee bends sideways`)
        assert(knee.z >= (hip.z + p.z) / 2 - 0.008, `${name}: knee bends backward`)
        assert(Math.abs(hip.distanceTo(knee) - rig.rest[`shin.${side}`].pos.length()) < 1e-5, 'Thigh length changed')
        assert(Math.abs(knee.distanceTo(p) - SHIN_LENGTH) < 1e-5, 'Shin length changed')
        const minY = Math.min(...cap[side].map(local => rig.bones[`shin.${side}`].localToWorld(local.clone()).y))
        minGround = Math.min(minGround, minY)
        assert(Math.abs(p.x - (side === 'L' ? 1 : -1) * (name === 'walk' ? 0.09 : 0.085)) < 0.002, `${name}: foot leaves its lane`)
        if (sidePhase < stance) {
          supported++
          maxSupportKnee = Math.max(maxSupportKnee, kneeBend)
          extension[side] = Math.min(extension[side], kneeBend)
          if (name === 'walk' && Math.abs(sidePhase - 0.25) < 0.025) maxPassingKnee = Math.max(maxPassingKnee, kneeBend)
          maxSupportGap = Math.max(maxSupportGap, Math.abs(minY))
          const world = p.clone().add(new THREE.Vector3(0, 0, phase * clip.duration / cadence * GAIT_SPEED[name] * speed))
          if (!supportStart.has(side)) supportStart.set(side, world.clone())
          maxSlide = Math.max(maxSlide, world.distanceTo(supportStart.get(side)!))
        } else supportStart.delete(side)
        if (previous.has(side)) {
          const last = previous.get(side)!
          maxStep = Math.max(maxStep, p.distanceTo(last))
          const descent = (last.y - p.y) * samples / clip.duration
          maxDescent = Math.max(maxDescent, descent)
          if (p.y < 0.064) maxContactDescent = Math.max(maxContactDescent, descent)
        }
        previous.set(side, p)
      }
      if (!supported) flight++
      assert(rig.root.position.length() === 0, 'The gait moved the navigation root')
    }
    hipVelocities.forEach((v, i) => {
      maxHipVelocityChange = Math.max(maxHipVelocityChange, v.distanceTo(hipVelocities[(i + 1) % hipVelocities.length]))
    })
    const span = maxFootZ - minFootZ
    if (speed === 1) baseSpans.set(name, span)
    else if (speed > 1) {
      assert(span > baseSpans.get(name)! * (1 + (speed - 1) * (name === 'walk' ? 0.45 : 0.10)), 'Higher speed must visibly lengthen the stride')
      assert(speed / cadence >= 1 + (speed - 1) * 0.39, 'Extra movement speed must produce longer ground-covering steps')
      assert(cadence < speed && cadence > 1, 'Higher speed should combine longer strides with a modest cadence increase')
    } else assert(Math.abs(span - baseSpans.get(name)!) < 1e-5, 'Slow-motion preview changed the base stride')
    console.log(JSON.stringify({ name, speed, span, cadence, minGround, maxSupportGap, maxSlide, maxStep, minSeparation, flight,
      maxKnee, maxSupportKnee, extension, maxPassingKnee, maxFoot, maxDescent, maxContactDescent, minHip, maxHip, maxSway, maxHipSpeed, maxHipVelocityChange, minHead, maxHead, maxHeadSpeed, maxElbowOut, maxHandOut }))
    assert(minGround > -0.003, `${name}: foot surface penetrates the floor by ${-minGround}m`)
    assert(maxSupportGap < 0.006, `${name}: planted cap floats ${maxSupportGap}m`)
    assert(maxSlide < 0.003, `${name}: stance foot slides ${maxSlide}m`)
    assert(maxStep < 0.035, `${name}: foot snaps ${maxStep}m`)
    assert(minSeparation > 0.16 && minSeparation < 0.20, `${name}: legs cross or spread too far`)
    assert(maxKnee < (name === 'walk' ? 35 : 115), `${name}: exaggerated knee fold ${maxKnee} degrees`)
    assert(maxSupportKnee < (name === 'walk' ? speed > 1 ? 30 : 21 : 65), `${name}: deep crouch on the planted leg`)
    const softKnee = name === 'walk' ? 15 : 20 // a run pushes off with a soft knee, never a locked one
    assert(extension.L < softKnee && extension.R < softKnee, `${name}: legs never extend through support/push-off`)
    if (name === 'walk') {
      assert(maxPassingKnee < 15, 'Walking support knee stays bent as the body passes over it')
      assert(passingHip - contactHip > 0.025, 'Torso does not rise with supporting-leg extension')
    }
    assert(maxFoot < (name === 'walk' ? 0.085 : 0.33), `${name}: feet lift too high`)
    assert(maxElbowOut < (name === 'walk' ? 0.08 : 0.065), `${name}: elbows flare away from the torso`)
    assert(maxDescent < (name === 'walk' ? 0.9 : 2.6), `${name}: swing leg drops too quickly`)
    assert(maxContactDescent < (name === 'walk' ? speed <= 1 ? 0.55 : 0.7 : speed <= 1 ? 1.2 : 1.8), `${name}: harsh landing speed`)
    // Faster cadence shortens real flight time, so a ballistic run bobs a little less at speed.
    assert(maxHip - minHip > (name === 'walk' ? 0.025 : speed <= 1 ? 0.045 : 0.03), `${name}: torso is frozen instead of following the stride`)
    // Two steps per loop must produce two smooth rises, without a second
    // chest/head bounce inside either step or increased running bob at 2×.
    const vertical = hipVelocities.map(v => Math.sign(v.y)).filter(sign => sign !== 0)
    const turns = vertical.filter((sign, i) => sign !== vertical[(i + 1) % vertical.length]).length
    assert.equal(turns, 4, `${name}: extra vertical pulse between footfalls`)
    assert(maxHip - minHip < (name === 'walk' ? speed <= 1 ? 0.035 : 0.08 : 0.07) && maxSway < (name === 'walk' ? 0.005 : 0.025), `${name}: excessive body travel`)
    assert(maxHipSpeed < (name === 'walk' ? speed <= 1 ? 0.26 : 0.58 : 0.85), `${name}: abrupt torso movement within the stride`)
    assert(maxHipVelocityChange < (name === 'walk' ? speed <= 1 ? 0.03 : 0.065 : 0.04), `${name}: torso velocity jumps, including at the loop seam`)
    assert(maxHead - minHead < (name === 'walk' ? speed <= 1 ? 0.036 : 0.081 : 0.10), `${name}: excessive head bounce`)
    assert(maxHeadSpeed < (name === 'walk' ? speed <= 1 ? 0.29 : 0.60 : 0.90), `${name}: head shakes through the stride`)
    if (name === 'run') {
      assert(span > 0.60 && GAIT_SPEED.run * clip.duration / cadence * speed / 2 > 0.9, 'Run steps are too short')
      assert(cadence / clip.duration < 2.2, 'Run cadence is too fast for the stride')
      assert(maxHandOut < 0.08, 'Run forearms fan out instead of swinging alongside the ribs')
      assert(maxKnee > 95 && maxFoot > 0.25 && heelPeakZ < -0.05, 'Run must fold the heel behind the body before swinging forward')
      assert(flight / samples > 0.2 && flight / samples < (speed <= 1 ? 0.52 : 0.65), 'Run floats between footfalls instead of pushing off the ground')
      assert(lowestHipPhase < stance && highestHipPhase > stance, 'Run must absorb weight in support and rise during flight')
      assert(maxChestPitch - minChestPitch > 4 && maxHeadPitch - minHeadPitch > 2, 'Run locks the torso or head at a fixed angle')
      const headDelay = (headPitchPeak - chestPitchPeak + 0.5) % 0.5
      assert(headDelay > 0.01 && headDelay < 0.09, 'Running head must follow the torso with a short delay')
    }
    assert(name === 'walk' ? flight === 0 : flight > 0, `${name}: incorrect support/flight timing`)
    for (const track of clip.tracks) {
      const size = track.getValueSize()
      for (let j = 0; j < size; j++) assert(Math.abs(track.values[j] - track.values[track.values.length - size + j]) < 1e-5, `${name}: loop discontinuity in ${track.name}`)
    }
    const exported = THREE.AnimationClip.parse(THREE.AnimationClip.toJSON(clip))
    assert.equal(exported.tracks.length, clip.tracks.length, 'Gait cannot be exported')
    console.log(`PASS ${name}: grounded caps, distinct leg recovery, soft landings, steady torso, fixed lengths, stance velocity, loop and export`)
  }
  // A speed edit or pause must preserve the foot phase and playback command identity.
  player.setSpeed(1)
  void player.play(clips.walk, { fade: 0 })
  player.update(0.3)
  const phaseTime = player.current!.time, revision = player.revision
  player.setSpeed(2); player.update(0)
  assert.equal(player.current!.time, phaseTime)
  assert.equal(player.revision, revision)
  const fast = player.current!.getClip(), pausedPose = rig.bones['thigh.L'].quaternion.clone()
  player.setSpeed(0); player.update(0.5)
  assert.equal(player.current!.time, phaseTime)
  assert.equal(player.current!.getClip(), fast)
  assert(rig.bones['thigh.L'].quaternion.angleTo(pausedPose) < 1e-6, 'Pause changed the stride pose')
  player.setSpeed(2); player.update(0.1)
  assert(player.current!.time > phaseTime, 'Resume did not advance the stride')
  void player.play(clips.jump, { fade: 0 })
  player.update(0.1)
  assert.equal(player.current!.time, 0.2, 'Stride scaling leaked into an action clip')
  player.setSpeed(1)
  // Returning to idle and action clips must restore original authored poses/lengths.
  for (const clip of [clips.walk, clips.run, idle.idle, clips.crouchIdle, clips.jump, clips.run, idle.idle]) {
    void player.play(clip, { fade: 0 }); player.update(0)
    for (const side of ['L', 'R'] as const) assert(rig.bones[`shin.${side}`].position.distanceTo(rig.rest[`shin.${side}`].pos) < 1e-6)
  }
  assert(rig.bones['thigh.L'].quaternion.angleTo(rig.rest['thigh.L'].quat) < 0.001, 'Gait correction leaked into idle')
  assert(Math.abs(ENEMY_RUN_SPEED / GAIT_SPEED.run - 1.5) < 1e-9, 'Game running must use the lab\'s 1.5× setting')
  for (const weapon of ['pistol', 'ak'] as const) for (const speed of [1.4, ENEMY_RUN_SPEED]) {
    const actor = await EnemyActor.create(weapon)
    try {
      for (let i = 0; i < 60; i++) actor.update(1 / 60, 'patrol', true, undefined, speed)
      const name = speed < 1.8 ? 'walk' : 'run'
      const activeClip = actor.player.current!.getClip()
      assert.equal(activeClip.name, name, 'Mission does not use lab gait')
      assert(actor.player.current!.timeScale <= speed / GAIT_SPEED[name], 'Mission ignores the longer stride')
      if (name === 'walk') assert(actor.player.current!.timeScale < speed / GAIT_SPEED[name], 'Faster mission walking only changes cadence')
      else {
        player.setSpeed(1.5)
        void player.play(clips.run, { fade: 0 })
        assert.equal(activeClip, player.current!.getClip(), 'Game run must use the same stride as the lab at 1.5×')
        assert(Math.abs(actor.player.current!.getEffectiveTimeScale() - player.current!.getEffectiveTimeScale() * player.mixer.timeScale) < 1e-9,
          'Game run cadence must match the lab at 1.5×')
      }
      if (weapon === 'pistol') for (const bone of ['upper_arm.L', 'forearm.L', 'hand.L'] as const) {
        const track = activeClip.tracks.find(t => t.name === `${actor.rig.bones[bone].name}.quaternion`)!
        const expected = new THREE.Quaternion().fromArray((track as THREE.QuaternionKeyframeTrack).createInterpolant().evaluate(actor.player.current!.time))
        assert(actor.rig.bones[bone].quaternion.angleTo(expected) < 0.001, 'Pistol carry replaced the free arm locomotion')
      }
    } finally { actor.dispose() }
  }
  const hostage = await HostageActor.create()
  try {
    hostage.restore(false)
    for (let i = 0; i < 60; i++) hostage.animate(1 / 60, true, false, false, false)
    assert.equal(hostage.player.current!.getClip(), clips.run)
    assert.equal(hostage.player.current!.timeScale, HOSTAGE_RUN_SPEED / GAIT_SPEED.run)
  } finally { hostage.dispose() }
  console.log('PASS gait transitions, armed mission actors and hostage share the corrected clips and speed')
} finally { GLTFLoader.prototype.loadAsync = load }
