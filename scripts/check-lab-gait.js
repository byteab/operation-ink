// Run in a freshly loaded /lab.html with agent-browser eval --stdin.
(async () => {
  const ctx = window.__lab, player = ctx.player
  const resource = path => performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path)?.name ?? path
  const T = await import(resource('/node_modules/.vite/deps/three.js'))
  const { gaitStance } = await import(resource('/src/lab/gait.ts'))
  const slider = document.querySelector('#panel input[type=range]')
  const speed = value => { slider.value = String(value); slider.dispatchEvent(new Event('input', { bubbles: true })) }
  const button = label => [...document.querySelectorAll('#panel button')].find(b => b.textContent === label).click()
  const assert = (ok, message) => { if (!ok) throw new Error(message) }
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
  const rows = []
  for (const label of ['Walkw', 'Runr', 'Armed guard patrol']) {
    speed(1); button(label)
    const settling = performance.now()
    while (performance.now() - settling < 350) await nextFrame()
    let baseSpan = 0
    for (const rate of [1, 1.5, 2]) {
      const before = player.current.time, revision = player.revision
      speed(rate)
      assert(player.current.time === before && player.revision === revision, `${label}: speed reset the step`)
      const cadence = rate * player.current.timeScale, clip = player.current.getClip()
      player.setSpeed(0)
      let min = Infinity, max = -Infinity, maxSupportKnee = 0, extension = Infinity, passingKnee = 0
      let minHip = Infinity, maxHip = -Infinity, minHead = Infinity, maxHead = -Infinity
      const hipHeights = []
      const gait = label === 'Runr' ? 'run' : 'walk'
      const stance = gaitStance(gait, rate / cadence)
      for (let i = 0; i < 120; i++) {
        player.current.time = clip.duration * i / 120; player.update(0)
        ctx.rig.root.updateMatrixWorld(true)
        const hipY = ctx.rig.bones.hips.position.y, headY = ctx.rig.bones.head.getWorldPosition(new T.Vector3()).y
        minHip = Math.min(minHip, hipY); maxHip = Math.max(maxHip, hipY)
        minHead = Math.min(minHead, headY); maxHead = Math.max(maxHead, headY)
        hipHeights.push(hipY)
        for (const side of ['L', 'R']) {
          const p = ctx.rig.bones[`shin.${side}`].localToWorld(new T.Vector3(0, Math.hypot(.36, .05), 0))
          const hip = ctx.rig.bones[`thigh.${side}`].getWorldPosition(new T.Vector3())
          const knee = ctx.rig.bones[`shin.${side}`].getWorldPosition(new T.Vector3())
          const bend = T.MathUtils.radToDeg(knee.clone().sub(hip).angleTo(p.clone().sub(knee)))
          const phase = (i / 120 + (side === 'R' ? .5 : 0)) % 1
          if (phase < stance) {
            maxSupportKnee = Math.max(maxSupportKnee, bend); extension = Math.min(extension, bend)
            if (gait === 'walk' && Math.abs(phase - .25) < .025) passingKnee = Math.max(passingKnee, bend)
          }
          min = Math.min(min, p.z); max = Math.max(max, p.z)
          assert(p.y > .05, `${label}: foot penetrates the ground`)
        }
      }
      const span = max - min
      const bodyTravel = maxHip - minHip, headTravel = maxHead - minHead
      const directions = hipHeights.map((y, i) => Math.sign(hipHeights[(i + 1) % hipHeights.length] - y)).filter(Boolean)
      const turns = directions.filter((sign, i) => sign !== directions[(i + 1) % directions.length]).length
      assert(turns === 4, `${label}: extra body pulse between footfalls`)
      assert(bodyTravel < (gait === 'run' ? .07 : .08) && headTravel < (gait === 'run' ? .10 : .081), `${label}: excessive chest/head bounce`)
      assert(maxSupportKnee < (gait === 'walk' ? 30 : 65) && extension < 15, `${label}: legs stay crouched through support`)
      if (gait === 'walk') assert(passingKnee < 15, `${label}: supporting leg does not straighten beneath the body`)
      if (rate === 1) baseSpan = span
      else assert(span > baseSpan * (1 + (gait === 'walk' ? .45 : .10) * (rate - 1)) && cadence < rate, `${label}: faster movement only increased cadence`)
      if (gait === 'run') {
        assert(span > .60 && cadence / clip.duration < 2.2, 'Running steps are short and hurried')
        assert(bodyTravel > .045 && headTravel > .05 && stance >= .20, 'Running floats without weight transfer or enough ground contact')
      }
      speed(rate)
      const start = performance.now()
      let elapsed = 0, last = player.current.time
      while (performance.now() - start < 650) {
        await nextFrame()
        const time = player.current.time
        elapsed += (time - last + clip.duration) % clip.duration; last = time
      }
      assert(elapsed > .3, `${label}: real playback did not advance`)
      speed(0)
      const pausedTime = player.current.time, pausedClip = player.current.getClip()
      for (let i = 0; i < 5; i++) await nextFrame()
      assert(player.current.time === pausedTime && player.current.getClip() === pausedClip, `${label}: pause changed time or stride`)
      rows.push({ label, rate, span, cadence, bodyTravel, headTravel, turns, maxSupportKnee, extension, passingKnee, playbackAdvanced: elapsed, phasePreserved: true, pausePassed: true })
    }
  }
  ctx.weapons.guns.unequip(); speed(1); button('Runr')
  return { passed: true, rows }
})()
