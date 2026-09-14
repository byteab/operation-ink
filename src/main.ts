import * as THREE from 'three'
import { EnvironmentCamera, views, type ViewName } from './camera'
import { palette, resizeInk } from './render/ink'
import { createCompound } from './world/compound'
import { EnvironmentInteractions } from './interactions'
import './style.css'

const canvas = document.querySelector<HTMLCanvasElement>('#world')!
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
// A small supersampling floor keeps sub-pixel details clean on non-Retina displays.
const pixelRatio = () => Math.min(Math.max(window.devicePixelRatio, 1.5), 2)
renderer.setPixelRatio(pixelRatio())
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.NoToneMapping
renderer.setClearColor(palette.paper)
renderer.shadowMap.enabled = false

const scene = new THREE.Scene()
scene.name = 'Line-art environment study'
scene.background = new THREE.Color(palette.paper)
scene.add(createCompound())

let frame = 0
let lastTime = performance.now()
let rendering = false
let contextLost = false
let disposed = false
const invalidate = () => {
  if (!frame && !contextLost && !disposed) {
    if (!rendering) lastTime = performance.now()
    frame = requestAnimationFrame(render)
  }
}
const camera = new EnvironmentCamera(canvas, invalidate)
const interactions = new EnvironmentInteractions(canvas, scene, () => camera.active, invalidate)

function render(now: number) {
  frame = 0
  rendering = true
  const dt = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  const moving = camera.update(dt)
  const doorsMoving = interactions.update(dt)
  renderer.render(scene, camera.active)
  canvas.dataset.ready = 'true'
  if (moving || doorsMoving) invalidate()
  rendering = false
}

function resize() {
  const width = window.innerWidth, height = window.innerHeight
  renderer.setPixelRatio(pixelRatio())
  renderer.setSize(width, height, false)
  camera.resize(width, height)
  resizeInk(width, height)
  invalidate()
}
window.addEventListener('resize', resize)
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault()
  contextLost = true
  cancelAnimationFrame(frame)
  frame = 0
  canvas.dataset.ready = 'false'
})
canvas.addEventListener('webglcontextrestored', () => {
  contextLost = false
  resize()
})
resize()
const initialView = new URLSearchParams(location.search).get('view') ?? 'overview'
camera.setView(initialView in views ? initialView as ViewName : 'overview')

// Development inspection surface, intentionally absent from production builds and the page UI.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __environment: {
      scene, renderer, camera,
      interactions,
      setView: (name: ViewName) => camera.setView(name),
      invalidate,
      stats: () => ({
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        view: camera.view,
        camera: camera.active.position.toArray(),
        objects: scene.children[0].children.map(object => ({ name: object.name, kind: object.userData.kind ?? 'environment' })),
      }),
    },
  })
}

import.meta.hot?.dispose(() => {
  disposed = true
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', resize)
  camera.dispose()
  interactions.dispose()
  const materials = new Set<THREE.Material>()
  scene.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    }
  })
  materials.forEach(material => material.dispose())
  renderer.dispose()
})
