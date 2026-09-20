import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createMissionGun } from '../src/game/weapon-models'
import { builders, disposeGun } from '../src/lab/weapons/models'
import { createPenEdges, createPenSilhouette } from '../src/render/ballpoint'
import { Draft } from '../src/render/ink'

// Inspect the real installed LineMaterial shader after its compilation hook.
// Evaluate only its scalar distance function as JS; this is not GPU validation.
function shaderFor(material: THREE.ShaderMaterial) {
  const shader = { vertexShader: material.vertexShader, fragmentShader: material.fragmentShader, uniforms: {} }
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer)
  return shader.vertexShader
}
function taper(shader: string) {
  const body = shader.match(/float penDistanceScale\(float viewDepth\)\s*\{([^}]+)\}/)?.[1]
  assert(body, 'Distance function must be present in the actual assembled shader')
  const evaluate = new Function('viewDepth', 'projectionMatrix', body.replace(/\bfloat\b/g, 'let').replace(/\bmax\(/g, 'Math.max('))
  return (depth: number, camera: THREE.Camera) => evaluate(depth, [[0], [0], [0, 0, 0, camera.projectionMatrix.elements[11]]]) as number
}
const perspective = new THREE.PerspectiveCamera(75, 1.6, 0.05, 300)
const orthographic = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.05, 300)
const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.5)
const defaultEdge = createPenEdges(geometry, 1)
const defaultShell = createPenSilhouette(geometry)
const scenery = new Draft('distance-check')
scenery.box(2, 2, 2, 0, 1, -20)
scenery.finish()
for (const material of [defaultEdge.material, defaultShell.material,
  (scenery.children.find(object => object.name.endsWith(': ink')) as THREE.Mesh).material] as THREE.ShaderMaterial[]) {
  const scale = taper(shaderFor(material))
  assert.equal(scale(0.5, perspective), 1)
  assert.equal(scale(8, perspective), 1)
  assert.equal(scale(40, perspective), 0.62)
  assert(Math.abs(scale(80, perspective) - 0.36536082474226805) < 1e-12)
  assert.equal(scale(80, orthographic), 1)
}
console.log('PASS Scenery/default contours retain their original taper and orthographic weight')

const cameraPosition = new THREE.Vector3(13, 1.6, -17)
perspective.position.copy(cameraPosition)
perspective.rotation.y = 0.7
perspective.updateMatrixWorld(true)
const forward = perspective.getWorldDirection(new THREE.Vector3())
let contours = 0
for (const name of Object.keys(builders) as (keyof typeof builders)[]) {
  const gun = createMissionGun(name)
  // Test the same factory used by held guards, pickups and first-person weapons.
  // A transformed parent catches accidental local-space distance calculations.
  const parent = new THREE.Group()
  parent.rotation.y = -0.4
  parent.add(gun)
  gun.rotation.y = 1.1
  const materials = new Set<THREE.ShaderMaterial>()
  gun.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.ShaderMaterial)) return
    const shader = shaderFor(object.material)
    const scale = taper(shader)
    materials.add(object.material)
    contours++
    if ('isLineSegments2' in object) {
      assert(shader.includes('offset *= linewidth * instancePenWidth * penWidthScale;'))
      assert(shader.includes('instancePenOffset.x * penStartScale'))
      assert(shader.includes('penDistanceScale(-start.z)') && shader.includes('penDistanceScale(-end.z)'))
    } else assert(shader.includes('width * penDistanceScale(-view.z)'))
    assert.equal(scale(0.5, perspective), 1, `${name}: FPS contour changed`)
    assert.equal(scale(2, perspective), 1, `${name}: close inspection contour changed`)
    let previous = 1
    for (const depth of [4, 8, 12, 20, 40, 80, 200]) {
      assert(scale(depth, perspective) < previous, `${name}: contour does not taper at ${depth}m`)
      previous = scale(depth, perspective)
      assert.equal(scale(depth, orthographic), 1, `${name}: orthographic contour changed`)
      parent.position.copy(cameraPosition).addScaledVector(forward, depth)
      parent.updateMatrixWorld(true)
      const view = gun.getWorldPosition(new THREE.Vector3()).applyMatrix4(perspective.matrixWorldInverse)
      assert(Math.abs(scale(-view.z, perspective) - scale(depth, perspective)) < 1e-12)
    }
    assert(scale(12, perspective) < 0.6, `${name}: medium-distance lines are still too bold`)
    assert(scale(40, perspective) < 0.2, `${name}: distant silhouettes are still too bold`)
    assert(scale(200, perspective) >= 0.1, `${name}: distant contour has lost its minimum weight`)
  })
  assert(materials.size >= 2, `${name}: validate both hard edges and smooth silhouettes`)
  disposeGun(gun)
}
assert.notEqual(defaultEdge.material.customProgramCacheKey(), createPenEdges(geometry, 1, 'edge', 'weapon').material.customProgramCacheKey(),
  'World and gun profiles must not share a GPU program cache key')
console.log(`PASS ${contours} gun contours taper through combat distances while preserving FPS and orthographic weight`)
