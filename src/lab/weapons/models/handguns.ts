import * as THREE from 'three'
import { box, dark, gun, metal, part, tube, wood } from './common'

/** A full-size service pistol. The grip stays at the fist; the slide travels along Z. */
export function buildPistol() {
  return gun('pistol', 'pistol', false, [0, 0.084, 0.197], [0.023, 0.089, 0.025], (g, parts) => {
    const grip = new THREE.Group()
    grip.rotation.x = THREE.MathUtils.degToRad(-14)
    grip.add(box(0.034, 0.105, 0.039, [0, 0, 0], dark))
    for (const side of [-1, 1]) {
      grip.add(box(0.002, 0.074, 0.03, [side * 0.0178, -0.004, 0], dark))
      for (let i = 0; i < 3; i++) {
        grip.add(box(0.002, 0.004, 0.025, [side * 0.019, -0.023 + i * 0.018, 0], metal))
      }
    }
    g.add(grip)

    const magazine = new THREE.Group()
    magazine.rotation.x = grip.rotation.x
    magazine.add(box(0.027, 0.09, 0.03, [0, -0.009, 0], metal))
    magazine.add(box(0.04, 0.01, 0.045, [0, -0.057, 0], dark))
    parts.magazine = magazine
    magazine.userData.grip = new THREE.Vector3(0, -0.057, 0)
    g.add(magazine)

    g.add(box(0.038, 0.027, 0.181, [0, 0.045, 0.052], dark))
    g.add(box(0.034, 0.014, 0.071, [0, 0.051, 0.142], dark))
    g.add(box(0.039, 0.014, 0.037, [0, 0.045, -0.044], dark))

    // Separate rails leave an actual opening around the trigger.
    g.add(box(0.017, 0.008, 0.061, [0, -0.014, 0.049], dark))
    g.add(box(0.017, 0.049, 0.008, [0, 0.0065, 0.0795], dark))
    g.add(box(0.017, 0.03, 0.008, [0, -0.003, 0.019], dark))
    g.add(box(0.007, 0.023, 0.008, [0, 0.02, 0.047], metal, [-18, 0, 0]))
    g.add(box(0.007, 0.012, 0.008, [0, 0.005, 0.044], metal, [22, 0, 0]))

    // The complete upper assembly recoils together, including its sights.
    const slide = new THREE.Group()
    slide.add(box(0.009, 0.036, 0.244, [-0.017, 0.082, 0.055]))
    slide.add(box(0.009, 0.016, 0.244, [0.017, 0.072, 0.055]))
    slide.add(box(0.009, 0.02, 0.068, [0.017, 0.09, -0.033]))
    slide.add(box(0.009, 0.02, 0.129, [0.017, 0.09, 0.1125]))
    slide.add(box(0.043, 0.012, 0.244, [0, 0.103, 0.055]))
    slide.add(box(0.043, 0.009, 0.018, [0, 0.065, 0.168]))
    slide.add(box(0.034, 0.029, 0.025, [0, 0.082, -0.0545]))
    slide.add(box(0.028, 0.007, 0.047, [0, 0.076, 0.0245], dark))
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        slide.add(box(0.002, 0.027, 0.003, [side * 0.022, 0.083, -0.048 + i * 0.009], dark))
      }
    }
    slide.add(box(0.038, 0.006, 0.014, [0, 0.112, -0.054], dark))
    slide.add(box(0.007, 0.011, 0.014, [-0.012, 0.118, -0.054], dark))
    slide.add(box(0.007, 0.011, 0.014, [0.012, 0.118, -0.054], dark))
    slide.add(box(0.008, 0.014, 0.012, [0, 0.116, 0.153], dark))
    parts.slide = slide
    slide.userData.grip = new THREE.Vector3(0.035, 0.142, -0.03)
    g.add(slide)

    // An open tube, front rim, and recessed bore avoid a solid plugged barrel.
    g.add(part(new THREE.CylinderGeometry(0.0095, 0.0095, 0.177, 12, 1, true), metal, [0, 0.084, 0.1085], [90, 0, 0]))
    g.add(part(new THREE.RingGeometry(0.0062, 0.0095, 12), metal, [0, 0.084, 0.197]))
    g.add(part(new THREE.CircleGeometry(0.0062, 12), dark, [0, 0.084, 0.184]))
    g.add(tube(0.005, 0.016, [0, 0.063, 0.179], dark))
    g.add(box(0.005, 0.009, 0.027, [-0.022, 0.048, -0.006], metal))
  })
}

/** A six-shot revolver with an exposed cylinder and a barrel aligned to its top chamber. */
export function buildRevolver() {
  return gun('revolver', 'pistol', false, [0, 0.094, 0.209], [0, 0.075, 0.01], (g, parts) => {
    const grip = new THREE.Group()
    grip.position.set(0, -0.002, -0.011)
    grip.rotation.x = THREE.MathUtils.degToRad(-20)
    grip.add(box(0.033, 0.113, 0.04, [0, 0, 0], dark))
    grip.add(box(0.04, 0.102, 0.036, [0, -0.003, 0], wood))
    grip.add(box(0.041, 0.011, 0.042, [0, -0.052, 0], wood))
    for (const side of [-1, 1]) {
      grip.add(part(new THREE.CylinderGeometry(0.004, 0.004, 0.002, 8), metal, [side * 0.021, -0.007, 0], [0, 0, 90]))
    }
    g.add(grip)

    // The frame surrounds the cylinder without hiding its silhouette.
    g.add(box(0.034, 0.065, 0.027, [0, 0.073, -0.012]))
    g.add(box(0.035, 0.044, 0.024, [0, 0.065, 0.087]))
    g.add(box(0.034, 0.011, 0.133, [0, 0.111, 0.038]))
    g.add(box(0.03, 0.01, 0.107, [0, 0.04, 0.037]))
    g.add(box(0.035, 0.024, 0.037, [0, 0.028, -0.013]))

    g.add(box(0.017, 0.008, 0.062, [0, -0.005, 0.042]))
    g.add(box(0.017, 0.041, 0.008, [0, 0.0115, 0.071]))
    g.add(box(0.017, 0.028, 0.008, [0, 0.005, 0.015]))
    g.add(box(0.007, 0.026, 0.009, [0, 0.024, 0.041], dark, [-20, 0, 0]))
    g.add(box(0.007, 0.011, 0.009, [0, 0.007, 0.037], dark, [20, 0, 0]))

    // Resting center is the pivot for chamber indexing (Z) and reload swing-out (X translation).
    const cylinder = new THREE.Group()
    cylinder.position.set(0, 0.075, 0.044)
    cylinder.add(tube(0.03, 0.068, [0, 0, 0]))
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3
      const x = Math.sin(angle)
      const y = Math.cos(angle)
      cylinder.add(box(0.009, 0.002, 0.047, [x * 0.0295, y * 0.0295, 0], dark, [0, 0, -i * 60]))
      cylinder.add(part(new THREE.CircleGeometry(0.0063, 12), dark, [x * 0.019, y * 0.019, 0.0342]))
      cylinder.add(part(new THREE.CircleGeometry(0.0063, 12), wood, [x * 0.019, y * 0.019, -0.0342], [0, 180, 0]))
      cylinder.add(part(new THREE.CircleGeometry(0.0023, 8), dark, [x * 0.019, y * 0.019, -0.0344], [0, 180, 0]))
    }
    cylinder.add(tube(0.005, 0.011, [0, 0, 0.039], dark))
    parts.cylinder = cylinder
    cylinder.userData.grip = new THREE.Vector3(0.045, 0.015, 0)
    g.add(cylinder)

    g.add(box(0.026, 0.02, 0.129, [0, 0.076, 0.1435]))
    g.add(box(0.021, 0.009, 0.127, [0, 0.108, 0.1455]))
    g.add(part(new THREE.CylinderGeometry(0.0105, 0.0105, 0.131, 12, 1, true), metal, [0, 0.094, 0.1435], [90, 0, 0]))
    g.add(part(new THREE.RingGeometry(0.0065, 0.0105, 12), metal, [0, 0.094, 0.209]))
    g.add(part(new THREE.CircleGeometry(0.0065, 12), dark, [0, 0.094, 0.195]))
    g.add(tube(0.0045, 0.1, [0, 0.061, 0.127], dark))
    g.add(box(0.008, 0.013, 0.02, [0, 0.119, 0.189], dark))
    g.add(box(0.032, 0.006, 0.014, [0, 0.119, -0.017], dark))
    g.add(box(0.006, 0.008, 0.014, [-0.011, 0.124, -0.017], dark))
    g.add(box(0.006, 0.008, 0.014, [0.011, 0.124, -0.017], dark))
    g.add(box(0.006, 0.012, 0.016, [-0.02, 0.076, -0.007], dark))

    const hammer = new THREE.Group()
    hammer.position.set(0, 0.095, -0.03)
    hammer.add(box(0.011, 0.027, 0.013, [0, 0.009, -0.001], dark, [-28, 0, 0]))
    hammer.add(box(0.02, 0.009, 0.02, [0, 0.022, -0.008], dark))
    parts.hammer = hammer
    g.add(hammer)
  })
}
