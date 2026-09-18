import { builders, type Gun } from '../lab/weapons/models'
import type { WeaponName } from './types'

/** Mission and lab share original procedural meshes, including the scoped bolt rifle. */
export function createMissionGun(name: WeaponName): Gun {
  return builders[name]()
}
