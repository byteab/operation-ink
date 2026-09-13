import * as THREE from 'three'
import { box, dark, gun, metal, part, tube, wood, type V } from './common'

/** Extrude a continuous side silhouette across the gun's width. Points are [Z, Y]. */
function stock(points: [number, number][], width: number) {
  const shape = new THREE.Shape()
  points.forEach(([z, y], i) => i ? shape.lineTo(-z, y) : shape.moveTo(-z, y))
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false })
  geometry.rotateY(Math.PI / 2).translate(-width / 2, 0, 0)
  return part(geometry, wood, [0, 0, 0])
}

/** An open guard, with a slim trigger inside its opening. */
function triggerGuard(g: THREE.Group, z: number, y: number) {
  g.add(box(0.009, 0.034, 0.006, [0, y + 0.017, z - 0.025], dark))
  g.add(box(0.009, 0.034, 0.006, [0, y + 0.017, z + 0.025], dark))
  g.add(box(0.009, 0.006, 0.056, [0, y, z], dark))
  g.add(box(0.005, 0.023, 0.005, [0, y + 0.024, z - 0.005], dark, [-18, 0, 0]))
}

/** Open-ended barrel with a recessed dark bore, so its origin sits on the visible opening. */
function barrel(g: THREE.Group, radius: number, from: number, to: number, y: number) {
  g.add(part(new THREE.CylinderGeometry(radius, radius, to - from, 16, 1, true), metal,
    [0, y, (from + to) / 2], [90, 0, 0]))
  g.add(part(new THREE.RingGeometry(radius * 0.69, radius, 16), metal, [0, y, to]))
  g.add(part(new THREE.CircleGeometry(radius * 0.69, 16), dark, [0, y, to - 0.014]))
}

export function buildShotgun() {
  const muzzle: V = [0, 0.085, 0.61]
  const g = gun('shotgun', 'shotgun', true, muzzle, [0.021, 0.081, 0.057], (g, parts) => {
    // One piece joins the butt, wrist and grip, removing the gaps between the old boxes.
    g.add(stock([
      [-0.255, -0.039], [-0.255, 0.068], [-0.178, 0.075], [-0.092, 0.065],
      [-0.04, 0.054], [0.016, 0.047], [0.015, 0.009], [-0.003, -0.043],
      [-0.028, -0.047], [-0.05, 0.005], [-0.099, 0.026], [-0.183, -0.025],
    ], 0.039))
    g.add(box(0.043, 0.111, 0.012, [0, 0.0145, -0.261], dark))
    g.add(box(0.041, 0.061, 0.17, [0, 0.0715, 0.04]))
    // Ejection port and its bright lower lip sit on the right receiver wall.
    g.add(box(0.0015, 0.022, 0.055, [0.021, 0.081, 0.057], dark))
    g.add(box(0.002, 0.003, 0.052, [0.022, 0.0705, 0.057]))
    triggerGuard(g, 0.04, 0.001)
    const loadingPort = new THREE.Object3D()
    loadingPort.position.set(0, 0.038, 0.07)
    loadingPort.userData.grip = new THREE.Vector3()
    parts.loadingPort = loadingPort
    g.add(loadingPort)
    barrel(g, 0.012, 0.115, muzzle[2], muzzle[1])
    g.add(tube(0.01, 0.446, [0, 0.055, 0.33], dark))
    g.add(tube(0.012, 0.016, [0, 0.055, 0.553]))
    g.add(box(0.025, 0.043, 0.013, [0, 0.072, 0.51], dark))

    // All the wooden ribs and action bars travel with the pump over its 7 cm stroke.
    const pump = new THREE.Group()
    pump.position.set(0, 0.055, 0.26)
    pump.add(box(0.049, 0.045, 0.136, [0, 0, 0], wood))
    for (const z of [-0.051, -0.034, -0.017, 0, 0.017, 0.034, 0.051]) {
      pump.add(box(0.051, 0.004, 0.004, [0, -0.022, z], dark))
      for (const x of [-0.0248, 0.0248]) pump.add(box(0.002, 0.032, 0.004, [x, -0.004, z], dark))
    }
    for (const x of [-0.0155, 0.0155]) pump.add(box(0.004, 0.007, 0.138, [x, 0.008, -0.126], dark))
    parts.pump = pump
    g.add(pump)
    g.add(box(0.006, 0.008, 0.009, [0, 0.101, 0.59]))
  })
  // Centre of the support palm just beneath the fore-end; follows the pump's Z offset.
  g.userData.support = new THREE.Vector3(0, -0.005, 0.26)
  return g
}

export function buildSniper() {
  const muzzle: V = [0, 0.096, 0.8]
  const g = gun('sniper', 'sniper', true, muzzle, [-0.023, 0.1, 0.082], (g, parts) => {
    g.add(stock([
      [-0.25, -0.037], [-0.25, 0.07], [-0.176, 0.078], [-0.086, 0.067],
      [-0.045, 0.065], [0.01, 0.075], [0.105, 0.078], [0.307, 0.069],
      [0.325, 0.054], [0.307, 0.034], [0.071, 0.026], [0.035, 0.023],
      [0.015, -0.038], [-0.009, -0.047], [-0.034, -0.022], [-0.049, 0.014],
      [-0.103, 0.029], [-0.181, -0.025],
    ], 0.043))
    g.add(box(0.047, 0.111, 0.013, [0, 0.0165, -0.2565], dark))
    g.add(box(0.045, 0.014, 0.085, [0, 0.077, -0.182], wood))
    g.add(box(0.044, 0.036, 0.24, [0, 0.096, 0.06]))
    // Barrel shank overlaps the receiver and runs through the fore-end without a gap.
    g.add(tube(0.015, 0.067, [0, 0.096, 0.181], dark))
    barrel(g, 0.011, 0.179, muzzle[2], muzzle[1])
    g.add(box(0.0015, 0.02, 0.065, [-0.0225, 0.1, 0.082], dark))
    triggerGuard(g, 0.042, -0.006)

    const magazine = new THREE.Group()
    magazine.position.set(0, 0.03, 0.108)
    magazine.add(box(0.034, 0.056, 0.061, [0, -0.015, 0], dark))
    magazine.add(box(0.038, 0.006, 0.065, [0, -0.043, 0]))
    parts.magazine = magazine
    magazine.userData.grip = new THREE.Vector3(0, -0.043, 0)
    g.add(magazine)

    // Two supported scope rings, an objective bell, eyepiece and elevation/windage turrets.
    g.add(box(0.026, 0.008, 0.16, [0, 0.117, 0.018], dark))
    for (const z of [-0.034, 0.072]) {
      g.add(box(0.027, 0.031, 0.018, [0, 0.132, z], dark))
      g.add(tube(0.0195, 0.012, [0, 0.159, z], dark))
    }
    g.add(tube(0.0165, 0.175, [0, 0.159, 0.015]))
    g.add(tube(0.024, 0.04, [0, 0.159, 0.111], dark))
    g.add(tube(0.0205, 0.032, [0, 0.159, -0.073], dark))
    g.add(part(new THREE.CircleGeometry(0.019, 16), dark, [0, 0.159, 0.1312]))
    g.add(part(new THREE.RingGeometry(0.019, 0.024, 16), metal, [0, 0.159, 0.1314]))
    g.add(part(new THREE.RingGeometry(0.0145, 0.0205, 16), metal, [0, 0.159, -0.0892], [0, 180, 0]))
    g.add(tube(0.0105, 0.018, [0, 0.181, 0.018], dark, [0, 0, 0]))
    g.add(tube(0.009, 0.016, [0.019, 0.159, 0.018], dark, [0, 0, 90]))

    // Bolt body, handle and knob remain a single sliding assembly.
    const bolt = new THREE.Group()
    bolt.position.set(0, 0.096, -0.025)
    bolt.add(tube(0.01, 0.15, [0, 0.002, 0.028]))
    bolt.add(tube(0.005, 0.038, [-0.029, 0, -0.012], metal, [0, 0, 90]))
    bolt.add(part(new THREE.SphereGeometry(0.009, 10, 6), dark, [-0.049, -0.004, -0.012]))
    parts.bolt = bolt
    bolt.userData.grip = new THREE.Vector3(-0.105, -0.002, -0.012)
    g.add(bolt)
  })
  g.userData.support = new THREE.Vector3(0, -0.005, 0.26)
  return g
}
