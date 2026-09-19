import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { palette } from '../render/ink'
import { penPalette } from '../render/ballpoint'
import { Player } from './player'
import type { Ctx } from './registry'
import { loadStickman, setOutlineResolution } from './rig'
import './lab.css'

const canvas = document.querySelector<HTMLCanvasElement>('#lab')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio, 1.5), 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.NoToneMapping
renderer.setClearColor(palette.paper)

const scene = new THREE.Scene()
scene.background = new THREE.Color(palette.paper)
scene.add(new THREE.GridHelper(8, 16, penPalette.light, penPalette.faint))

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100)
camera.position.set(0, 1.1, 4)
const controls = new OrbitControls(camera, canvas)
controls.target.set(0, 0.9, 0)
controls.enableDamping = true
controls.update()

function resize() {
  const width = canvas.clientWidth, height = canvas.clientHeight
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  setOutlineResolution(width, height)
}
window.addEventListener('resize', resize)
resize()

async function start() {
  const rig = await loadStickman()
  scene.add(rig.root)
  const player = new Player(rig.root)
  // Registry (and the clip modules it globs) needs the rest pose, so it loads after the rig.
  const { actions, clips, updaters } = await import('./registry')
  const ctx: Ctx = { rig, player, scene, camera, fx: {}, weapons: {}, clips, time: 0 }
  const { mountPanel } = await import('./panel')
  mountPanel(document.querySelector('#panel')!, ctx, controls)
  player.play(clips.idle, { loop: true })

  window.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if ((event.target as HTMLElement).matches?.('input:not([type=range]), textarea, select')) return
    const action = actions.find(a => a.hotkey?.toLowerCase() === event.key.toLowerCase())
    if (action) { event.preventDefault(); void action.run(ctx) }
  })

  let last = performance.now()
  renderer.setAnimationLoop(now => {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    ctx.time += dt
    player.update(dt)
    for (const update of updaters) update(dt, ctx)
    controls.update()
    renderer.render(scene, camera)
  })
  if (import.meta.env.DEV) Object.assign(window, { __lab: ctx })
}
start().catch(console.error)
