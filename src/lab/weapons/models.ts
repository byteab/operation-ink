import * as THREE from 'three'
import { palette } from '../../render/ink'

/**
 * Procedural guns in the ink look. Gun frame: +Z = barrel forward, +Y = up, origin = centre of the fist on the grip.
 * Sizes in metres (hand ~8 cm). `muzzle` / `eject` are gun-local points; named `parts` are animated by guns.ts.
 */
export type GunName = 'pistol' | 'revolver' | 'smg' | 'ak' | 'shotgun' | 'sniper'
export type GunClass = 'pistol' | 'ak' | 'shotgun' | 'sniper'
export type Gun = THREE.Group & {
  userData: { name: GunName; cls: GunClass; twoHanded: boolean; muzzle: THREE.Vector3; eject: THREE.Vector3; parts: Record<string, THREE.Object3D> }
}

const metal = new THREE.MeshBasicMaterial({ color: 0x4b555d })
const dark = new THREE.MeshBasicMaterial({ color: 0x353d44 })
const wood = new THREE.MeshBasicMaterial({ color: 0x8c7355 })
const edge = new THREE.LineBasicMaterial({ color: palette.ink })

type V = [number, number, number]
/** Mesh + hard-edge ink lines. */
function part(geom: THREE.BufferGeometry, mat: THREE.Material, pos: V, rot: V = [0, 0, 0]) {
  const m = new THREE.Mesh(geom, mat)
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), edge))
  m.position.set(...pos)
  m.rotation.set(rot[0] * THREE.MathUtils.DEG2RAD, rot[1] * THREE.MathUtils.DEG2RAD, rot[2] * THREE.MathUtils.DEG2RAD)
  return m
}
const box = (w: number, h: number, d: number, pos: V, mat = metal, rot?: V) => part(new THREE.BoxGeometry(w, h, d), mat, pos, rot)
/** Cylinder along +Z (barrels, tubes, scopes). */
const tube = (r: number, len: number, pos: V, mat = metal, rot: V = [90, 0, 0]) => part(new THREE.CylinderGeometry(r, r, len, 12), mat, pos, rot)

function gun(name: GunName, cls: GunClass, twoHanded: boolean, muzzle: V, eject: V, build: (g: THREE.Group, parts: Record<string, THREE.Object3D>) => void): Gun {
  const g = new THREE.Group() as Gun
  const parts: Record<string, THREE.Object3D> = {}
  build(g, parts)
  g.name = `gun:${name}`
  g.userData = { name, cls, twoHanded, muzzle: new THREE.Vector3(...muzzle), eject: new THREE.Vector3(...eject), parts }
  return g
}

export const builders: Record<GunName, () => Gun> = {
  pistol: () => gun('pistol', 'pistol', false, [0, 0.055, 0.13], [0.02, 0.07, 0.0], (g, parts) => {
    g.add(box(0.026, 0.09, 0.034, [0, 0, 0], dark, [-15, 0, 0]))            // grip (fist here)
    g.add(box(0.03, 0.025, 0.12, [0, 0.045, 0.03]))                         // frame
    parts.slide = box(0.03, 0.03, 0.17, [0, 0.07, 0.045])                   // slide
    g.add(parts.slide)
    g.add(tube(0.006, 0.02, [0, 0.062, 0.125]))                              // barrel tip
    g.add(box(0.006, 0.03, 0.035, [0, 0.015, 0.045], dark))                  // trigger guard
    g.add(box(0.006, 0.01, 0.01, [0, 0.09, -0.03]))                          // rear sight
  }),
  revolver: () => gun('revolver', 'pistol', false, [0, 0.06, 0.14], [0, 0, 0], g => {
    g.add(box(0.026, 0.085, 0.03, [0, -0.005, -0.01], wood, [-20, 0, 0]))   // grip
    g.add(box(0.028, 0.04, 0.07, [0, 0.05, 0.02]))                           // frame
    g.add(tube(0.02, 0.045, [0, 0.055, 0.02], dark))                          // cylinder
    g.add(box(0.014, 0.018, 0.12, [0, 0.06, 0.08]))                           // barrel shroud
    g.add(tube(0.006, 0.125, [0, 0.06, 0.08]))                                 // barrel
    g.add(box(0.008, 0.02, 0.012, [0, 0.085, -0.02], dark, [30, 0, 0]))     // hammer
    g.add(box(0.006, 0.03, 0.03, [0, 0.02, 0.03], dark))                     // trigger guard
  }),
  smg: () => gun('smg', 'pistol', false, [0, 0.055, 0.18], [0.02, 0.07, 0.02], g => {
    g.add(box(0.03, 0.2, 0.035, [0, -0.06, 0], dark, [-8, 0, 0]))            // grip + magazine (Uzi style)
    g.add(box(0.045, 0.055, 0.26, [0, 0.055, 0.03]))                         // receiver
    g.add(tube(0.008, 0.06, [0, 0.055, 0.17]))                                 // barrel
    g.add(box(0.006, 0.03, 0.035, [0, 0.015, 0.05], dark))                    // trigger guard
    g.add(box(0.05, 0.012, 0.12, [0, 0.09, -0.02], dark))                     // folded stock rail
    g.add(box(0.008, 0.015, 0.01, [0, 0.09, 0.13]))                            // front sight
  }),
  ak: () => gun('ak', 'ak', true, [0, 0.075, 0.58], [0.02, 0.09, 0.08], g => {
    g.add(box(0.028, 0.09, 0.035, [0, -0.01, -0.01], wood, [-20, 0, 0]))     // pistol grip
    g.add(box(0.04, 0.06, 0.24, [0, 0.07, 0.11]))                             // receiver
    g.add(box(0.05, 0.05, 0.16, [0, 0.07, 0.3], wood))                        // wooden handguard
    g.add(tube(0.01, 0.16, [0, 0.105, 0.3]))                                    // gas tube
    g.add(tube(0.009, 0.22, [0, 0.075, 0.48]))                                  // barrel
    g.add(box(0.014, 0.03, 0.012, [0, 0.11, 0.53]))                            // front sight post
    g.add(box(0.028, 0.03, 0.028, [0, 0.075, 0.565], dark))                    // muzzle brake
    g.add(box(0.036, 0.06, 0.18, [0, 0.055, -0.14], wood, [0, 0, 0]))         // stock
    g.add(box(0.036, 0.11, 0.035, [0, 0.03, -0.24], wood))                     // butt
    g.add(box(0.006, 0.03, 0.05, [0, 0.03, 0.03], dark))                       // trigger guard
    // curved 30-round magazine: three stepped segments
    const mag = new THREE.Group()
    mag.add(box(0.026, 0.07, 0.05, [0, -0.03, 0]))
    mag.add(box(0.026, 0.07, 0.05, [0, -0.09, 0.02], metal, [-18, 0, 0]))
    mag.add(box(0.026, 0.07, 0.05, [0, -0.145, 0.06], metal, [-36, 0, 0]))
    mag.position.set(0, 0.04, 0.1)
    g.add(mag)
  }),
  shotgun: () => gun('shotgun', 'shotgun', true, [0, 0.075, 0.6], [0.02, 0.085, 0.03], (g, parts) => {
    g.add(box(0.036, 0.055, 0.15, [0, 0.07, 0.03]))                            // receiver
    g.add(tube(0.011, 0.5, [0, 0.085, 0.35]))                                   // barrel
    g.add(tube(0.009, 0.45, [0, 0.06, 0.33]))                                   // tube magazine
    parts.pump = box(0.04, 0.045, 0.11, [0, 0.07, 0.26], wood)                   // pump handle (slides -Z)
    g.add(parts.pump)
    g.add(box(0.036, 0.055, 0.14, [0, 0.055, -0.13], wood, [8, 0, 0]))         // stock
    g.add(box(0.036, 0.11, 0.035, [0, 0.025, -0.23], wood))                     // butt
    g.add(box(0.03, 0.06, 0.03, [0, 0.01, -0.02], wood, [-25, 0, 0]))          // grip swell (fist here)
    g.add(box(0.006, 0.03, 0.045, [0, 0.03, 0.02], dark))                       // trigger guard
    g.add(box(0.01, 0.012, 0.01, [0, 0.1, 0.58]))                                // bead
  }),
  sniper: () => gun('sniper', 'sniper', true, [0, 0.08, 0.8], [0.02, 0.11, -0.02], (g, parts) => {
    g.add(box(0.04, 0.06, 0.34, [0, 0.055, 0.14], wood))                        // stock fore-end
    g.add(box(0.04, 0.06, 0.16, [0, 0.05, -0.12], wood, [6, 0, 0]))            // stock rear
    g.add(box(0.04, 0.11, 0.035, [0, 0.02, -0.22], wood))                        // butt
    g.add(box(0.03, 0.05, 0.03, [0, -0.01, -0.02], wood, [-25, 0, 0]))          // grip (fist here)
    g.add(box(0.032, 0.03, 0.2, [0, 0.095, 0.0]))                                 // receiver
    g.add(tube(0.01, 0.5, [0, 0.095, 0.55]))                                       // barrel
    g.add(tube(0.017, 0.16, [0, 0.145, 0.0]))                                      // scope
    g.add(tube(0.022, 0.03, [0, 0.145, 0.06]))                                     // scope objective ring
    g.add(tube(0.02, 0.025, [0, 0.145, -0.07]))                                    // scope eyepiece
    g.add(box(0.01, 0.02, 0.02, [0, 0.125, 0.03], dark))                           // scope mount
    g.add(box(0.03, 0.05, 0.06, [0, 0.055, 0.08], dark))                           // magazine box
    parts.bolt = part(new THREE.CylinderGeometry(0.005, 0.005, 0.045, 8), metal, [0.025, 0.1, -0.04], [0, 0, 90])  // bolt handle (sticks out right)
    g.add(parts.bolt)
    g.add(box(0.006, 0.03, 0.045, [0, 0.025, 0.0], dark))                          // trigger guard
  }),
}
