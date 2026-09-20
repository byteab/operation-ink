import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { Draft } from '../src/render/ink'
import { drawPine, treeRadius, treeSeed } from '../src/world/vegetation'

const makeTree = (seed: number, x = 0, z = 0, maxHeight = 8) => {
  const draft = new Draft('Pine verification')
  const height = drawPine(draft, x, z, maxHeight, seed)
  return { draft: draft.finish(), height }
}
const dispose = (tree: Draft) => tree.traverse(object => {
  if (object instanceof THREE.Mesh) object.geometry.dispose()
})
const fingerprint = (tree: Draft) => {
  const hash = createHash('sha256')
  tree.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    for (const name of Object.keys(object.geometry.attributes).sort()) {
      const attribute = object.geometry.attributes[name]
      const array = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array
      hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
    }
  })
  return hash.digest('hex')
}

const sites = [[70,640], [1390,22], [968,183], [57,251], [653,34]]
const identities = sites.map(([x,z]) => treeSeed(x,z))
assert.equal(new Set(identities).size, sites.length)
assert.notEqual(treeSeed(70,640),treeSeed(70,641))
assert.deepEqual(sites.toReversed().map(([x,z])=>treeSeed(x,z)).toReversed(),identities)
console.log('PASS pine seeds depend on both coordinates, independently of planting order')

const signatures = new Set<string>()
let maxTriangles = 0
for (let seed=0;seed<128;seed++) {
  const x=-100.8,z=24.75,maxHeight=seed%2?4.5:11
  const {draft,height}=makeTree(seed,x,z,maxHeight)
  assert(height>=maxHeight*.88 && height<=maxHeight)
  assert(draft.children.length<=4,'Pine surfaces and ink must stay batched')
  signatures.add(fingerprint(draft))
  if (seed<8) {
    const repeat=makeTree(seed,x,z,maxHeight)
    assert.equal(fingerprint(draft),fingerprint(repeat.draft),'Same seed must regenerate identical surfaces and ink')
    dispose(repeat.draft)
  }
  let triangles=0
  draft.traverse(object=>{
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshBasicMaterial)) return
    const position=object.geometry.getAttribute('position'),normal=object.geometry.getAttribute('normal')
    triangles+=position.count/3
    for(let vertex=0;vertex<position.count;vertex++){
      const px=position.getX(vertex),py=position.getY(vertex),pz=position.getZ(vertex)
      assert(Number.isFinite(px+py+pz+normal.getX(vertex)+normal.getY(vertex)+normal.getZ(vertex)))
      assert(Math.hypot(px-x,pz-z)<=treeRadius(height)+.002,`Pine ${seed} exceeds its fence envelope`)
      assert(py>=-.002 && py<=height+.002,`Pine ${seed} exceeds its height envelope`)
    }
  })
  assert(triangles<=400,'Keep the original lightweight cone geometry')
  maxTriangles=Math.max(maxTriangles,triangles)
  dispose(draft)
}
assert.equal(signatures.size,128,'Different seeds must change the geometry')
console.log('PASS 128 varied pines: repeatable ink/geometry, bounded heights and crowns')
console.log(JSON.stringify({seedCases:128,maxSurfaceTriangles:maxTriangles}))
