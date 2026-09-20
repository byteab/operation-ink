import * as THREE from 'three'
import { penSeed } from '../../../render/ballpoint'
import { box, dark, gun, metal, part, path, tube, wood, type Gun, type V } from './common'

/** Extrude a side profile in (forward, up) coordinates, centred across the gun. */
function profile(shape: THREE.Shape, width: number, pos: V, material = metal) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width, bevelEnabled: false, steps: 1, curveSegments: 12,
  })
  geometry.translate(0, 0, -width / 2)
  geometry.rotateY(-Math.PI / 2)
  return part(geometry, material, pos)
}

function triggerGuard(rear: number, front: number, top: number, bottom: number) {
  const shape = new THREE.Shape()
  shape.moveTo(rear, top)
  shape.lineTo(front, top)
  shape.lineTo(front, bottom + 0.013)
  shape.quadraticCurveTo(front, bottom, front - 0.013, bottom)
  shape.lineTo(rear, bottom)
  shape.closePath()
  const hole = new THREE.Path()
  hole.moveTo(rear + 0.007, top - 0.006)
  hole.lineTo(rear + 0.007, bottom + 0.007)
  hole.lineTo(front - 0.015, bottom + 0.007)
  hole.quadraticCurveTo(front - 0.007, bottom + 0.007, front - 0.007, bottom + 0.016)
  hole.lineTo(front - 0.007, top - 0.006)
  hole.closePath()
  shape.holes.push(hole)
  return profile(shape, 0.012, [0, 0, 0], dark)
}

export function buildSmg(): Gun {
  const receiverLift = 0.025
  return gun('smg', 'pistol', false, [0, 0.061 + receiverLift, 0.2325], [0.029, 0.073 + receiverLift, 0.049], (g, parts) => {
    // Seat the receiver above the fist so its rear does not require a hooked wrist
    // to clear the forearm. Barrel, sights, stock and charging handle move together.
    const upper = new THREE.Group()
    upper.position.y = receiverLift
    g.add(upper)
    // A compact receiver with enough height and grip width to read beside the fist.
    upper.add(box(0.054, 0.067, 0.285, [0, 0.061, 0.039]))
    upper.add(box(0.049, 0.009, 0.226, [0, 0.099, 0.015], dark))
    g.add(box(0.035, 0.125, 0.052, [0, 0.0065, 0], dark, [-8, 0, 0]))
    for (const x of [-0.019, 0.019]) {
      g.add(box(0.004, 0.054, 0.033, [x, -0.009, -0.002], metal, [-8, 0, 0]))
    }

    // The magazine is separate from the grip so reloads can withdraw it along -Y.
    const magazine = new THREE.Group()
    magazine.position.set(0, -0.051, -0.007)
    magazine.add(box(0.029, 0.134, 0.036, [0, -0.05, 0], dark))
    magazine.add(box(0.038, 0.009, 0.044, [0, -0.12, 0], metal))
    for (const x of [-0.015, 0.015]) {
      magazine.add(box(0.002, 0.087, 0.003, [x, -0.064, 0.007], metal))
    }
    parts.magazine = magazine
    magazine.userData.grip = new THREE.Vector3(0, -0.1, 0)
    g.add(magazine)

    g.add(triggerGuard(0.02, 0.092, 0.056, -0.023))
    g.add(box(0.007, 0.037, 0.008, [0, 0.025, 0.043], metal, [-15, 0, 0]))

    // Folded stock rails meet the rear hinge and receiver on both sides.
    for (const x of [-0.032, 0.032]) {
      upper.add(box(0.008, 0.009, 0.115, [x, 0.047, -0.06], dark))
      upper.add(box(0.009, 0.052, 0.012, [x, 0.065, -0.108], dark))
    }
    upper.add(box(0.068, 0.009, 0.012, [0, 0.089, -0.108], dark))
    upper.add(box(0.061, 0.02, 0.02, [0, 0.047, -0.012]))

    upper.add(tube(0.011, 0.076, [0, 0.061, 0.194], dark))
    upper.add(tube(0.017, 0.018, [0, 0.061, 0.185]))
    upper.add(tube(0.012, 0.013, [0, 0.061, 0.2255]))
    upper.add(tube(0.007, 0.001, [0, 0.061, 0.232], dark))

    // Right-side port and top charging handle share the actual chamber location.
    upper.add(box(0.002, 0.025, 0.074, [0.0275, 0.073, 0.049], dark))
    const bolt = new THREE.Group()
    bolt.position.set(0, 0.104, -0.01)
    bolt.add(box(0.011, 0.012, 0.02, [0, 0, 0]))
    bolt.add(box(0.029, 0.009, 0.025, [0, 0.009, 0], dark))
    parts.bolt = bolt
    bolt.userData.grip = new THREE.Vector3(0.025, 0.044, 0)
    upper.add(bolt)
    for (const z of [-0.081, 0.155]) {
      upper.add(box(0.024, 0.009, 0.019, [0, 0.103, z]))
      for (const x of [-0.011, 0.011]) {
        upper.add(box(0.005, 0.022, 0.016, [x, 0.114, z], dark))
      }
    }
    upper.add(box(0.006, 0.019, 0.008, [0, 0.112, 0.155]))
  })
}

export function buildAk(): Gun {
  const result = gun('ak', 'ak', true, [0, 0.077, 0.594], [0.025, 0.089, 0.103], (g, parts) => {
    g.add(box(0.046, 0.064, 0.243, [0, 0.073, 0.1065]))
    g.add(box(0.042, 0.018, 0.211, [0, 0.109, 0.095], dark))

    const grip = new THREE.Shape()
    grip.moveTo(-0.021, 0.046)
    grip.lineTo(0.029, 0.043)
    grip.lineTo(0.006, -0.057)
    grip.lineTo(-0.028, -0.06)
    grip.lineTo(-0.03, -0.035)
    grip.closePath()
    g.add(profile(grip, 0.032, [0, 0, 0], wood))
    g.add(triggerGuard(0.022, 0.087, 0.047, -0.005))
    g.add(box(0.008, 0.027, 0.008, [0, 0.024, 0.049], dark, [-18, 0, 0]))

    // A single stock profile joins the receiver; no floating butt or neck pieces.
    const stock = new THREE.Shape()
    stock.moveTo(0.004, 0.096)
    stock.lineTo(-0.035, 0.097)
    stock.lineTo(-0.105, 0.078)
    stock.lineTo(-0.251, 0.082)
    stock.lineTo(-0.251, -0.031)
    stock.lineTo(-0.209, -0.027)
    stock.lineTo(-0.047, 0.031)
    stock.lineTo(0.004, 0.037)
    stock.closePath()
    g.add(profile(stock, 0.037, [0, 0, 0], wood))
    g.add(box(0.043, 0.118, 0.013, [0, 0.025, -0.254], dark))
    g.add(box(0.044, 0.059, 0.025, [0, 0.065, -0.014], dark))

    g.add(box(0.05, 0.049, 0.147, [0, 0.066, 0.297], wood))
    g.add(tube(0.011, 0.152, [0, 0.106, 0.298], dark))
    g.add(box(0.046, 0.025, 0.12, [0, 0.105, 0.292], wood))
    for (const z of [0.226, 0.369]) {
      g.add(box(0.054, 0.057, 0.012, [0, 0.07, z], dark))
    }
    for (const x of [-0.0255, 0.0255]) {
      for (const z of [0.251, 0.276, 0.301, 0.326]) {
        g.add(box(0.002, 0.007, 0.013, [x, 0.084, z], dark))
      }
    }

    g.add(tube(0.009, 0.205, [0, 0.077, 0.4735]))
    g.add(box(0.023, 0.041, 0.021, [0, 0.094, 0.397], dark))
    g.add(tube(0.009, 0.039, [0, 0.108, 0.385]))
    g.add(box(0.021, 0.058, 0.016, [0, 0.099, 0.538], dark))
    for (const x of [-0.012, 0.012]) {
      g.add(box(0.006, 0.027, 0.013, [x, 0.128, 0.538], dark))
    }
    g.add(box(0.005, 0.023, 0.008, [0, 0.124, 0.538]))
    g.add(tube(0.015, 0.03, [0, 0.077, 0.5785], dark))
    g.add(tube(0.014, 0.007, [0, 0.077, 0.59]))
    g.add(tube(0.007, 0.001, [0, 0.077, 0.5935], dark))
    g.add(box(0.026, 0.012, 0.03, [0, 0.123, 0.203], dark))

    // Smooth, continuous banana magazine; origin is the insertion point at the well.
    const magazine = new THREE.Group()
    magazine.position.set(0, 0.04, 0.11)
    const magazineShape = new THREE.Shape()
    magazineShape.moveTo(-0.026, 0.01)
    magazineShape.lineTo(0.026, 0.01)
    magazineShape.bezierCurveTo(0.025, -0.06, 0.045, -0.119, 0.097, -0.164)
    magazineShape.lineTo(0.056, -0.195)
    magazineShape.bezierCurveTo(-0.008, -0.133, -0.026, -0.075, -0.026, 0.01)
    magazineShape.closePath()
    const magazineBody = profile(magazineShape, 0.032, [0, 0, 0], dark)
    // The curved sidewall has no hard edge at its view-dependent silhouette.
    // A hull covers that contour without drawing extrusion triangulation.
    magazineBody.userData.hull = true
    magazine.add(magazineBody)
    // Two pressed ribs per side follow the same continuous sweep.
    for (const x of [-0.0165, 0.0165]) {
      for (const offset of [-0.007, 0.011]) {
        const rib = new THREE.CubicBezierCurve3(
          new THREE.Vector3(x, -0.02, offset),
          new THREE.Vector3(x, -0.083, offset + 0.002),
          new THREE.Vector3(x, -0.129, offset + 0.031),
          new THREE.Vector3(x, -0.171, offset + 0.067),
        )
        magazine.add(path(rib.getPoints(14), penSeed(`ak-magazine-rib:${x}:${offset}`), 1.8))
      }
    }
    parts.magazine = magazine
    g.add(magazine)

    magazine.userData.grip = new THREE.Vector3(0, -0.075, 0.017)
    g.add(box(0.002, 0.025, 0.086, [0.0235, 0.089, 0.103], dark))
    const bolt = new THREE.Group()
    bolt.position.set(0.031, 0.089, 0.116)
    bolt.add(part(new THREE.CylinderGeometry(0.004, 0.004, 0.026, 8), metal, [0, 0, 0], [0, 0, 90]))
    bolt.add(box(0.012, 0.012, 0.02, [0.017, 0, 0], dark))
    bolt.userData.grip = new THREE.Vector3(0.035, 0.036, 0)
    parts.bolt = bolt
    g.add(bolt)
  })
  result.userData.support = new THREE.Vector3(0, -0.005, 0.27)
  return result
}
