// Extract only the two CC0 authored cycles used by this character.
// node scripts/import-locomotion-reference.mjs /path/to/universal-animation-library.glb
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

globalThis.ProgressEvent ??= class extends Event {
  constructor(type, props) { super(type); Object.assign(this, props) }
}
const bytes = readFileSync(process.argv[2]), jsonLength = bytes.readUInt32LE(12)
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength))
json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + jsonLength).toString('base64')}`
// No reference mesh, textures or unused animation is shipped with the game.
for (const node of json.nodes) delete node.mesh
for (const key of ['meshes', 'materials', 'textures', 'images', 'samplers']) delete json[key]
const { scene, animations } = await new GLTFLoader().parseAsync(JSON.stringify(json), '')
const mixer = new THREE.AnimationMixer(scene)
const mapping = {
  hips: 'pelvis', spine: 'spine_01', chest: 'spine_03', neck: 'neck_01', head: 'Head',
  'shoulder.L': 'clavicle_l', 'upper_arm.L': 'upperarm_l', 'forearm.L': 'lowerarm_l', 'hand.L': 'hand_l',
  'shoulder.R': 'clavicle_r', 'upper_arm.R': 'upperarm_r', 'forearm.R': 'lowerarm_r', 'hand.R': 'hand_r',
  'thigh.L': 'thigh_l', 'shin.L': 'calf_l', 'thigh.R': 'thigh_r', 'shin.R': 'calf_r',
}
const vector = () => new THREE.Vector3(), quaternion = () => new THREE.Quaternion()
const position = name => scene.getObjectByName(name).getWorldPosition(vector())
const rotation = name => scene.getObjectByName(name).getWorldQuaternion(quaternion())
const rounded = a => a.map(n => +n.toFixed(4))
mixer.clipAction(animations.find(c => c.name === 'A_TPose')).play(); mixer.update(0); scene.updateMatrixWorld(true)
const bind = Object.fromEntries(Object.entries(mapping).map(([target, source]) => [target, {
  rotation: rotation(source), position: position(source),
}]))
const reference = {
  source: 'Quaternius Universal Animation Library (CC0)',
  url: 'https://quaternius.com/packs/universalanimationlibrary.html',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  legLength: position('thigh_l').distanceTo(position('calf_l')) + position('calf_l').distanceTo(position('foot_l')),
  bind: Object.fromEntries(Object.entries(bind).map(([name, b]) => [name, { position: rounded(b.position.toArray()), rotation: rounded(b.rotation.toArray()) }])),
  clips: {},
}
for (const [name, source] of [['walk', 'Walk_Loop'], ['run', 'Sprint_Loop']]) {
  mixer.stopAllAction()
  const clip = animations.find(c => c.name === source), action = mixer.clipAction(clip)
  action.play()
  const count = Math.round(clip.duration * 60)
  const frames = []
  for (let i = 0; i <= count; i++) {
    action.time = i === count ? 0 : i / count * clip.duration
    mixer.update(0); scene.updateMatrixWorld(true)
    frames.push({
      hips: rounded(position('pelvis').toArray()),
      rotations: Object.fromEntries(Object.entries(mapping).map(([name, source]) => [name,
        rounded(rotation(source).multiply(bind[name].rotation.clone().invert()).toArray())])),
      feet: ['l', 'r'].map(side => rounded(position(`foot_${side}`).toArray())),
      knees: ['l', 'r'].map(side => rounded(position(`calf_${side}`).toArray())),
    })
  }
  reference.clips[name] = { source, duration: clip.duration, frames }
}
mkdirSync('src/lab/data', { recursive: true })
writeFileSync('src/lab/data/locomotion-reference.json', JSON.stringify(reference))
console.log(Object.entries(reference.clips).map(([name, c]) => ({ name, source: c.source, duration: c.duration, frames: c.frames.length })))
