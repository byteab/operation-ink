import type { Vec3 } from './types'

export interface RescueLayout {
  hostageSpawns: [Vec3]
  escortRoute: Vec3[]
  jeepSeats: [Vec3]
  jeepBoardPoint: Vec3
  escapeRoute: Vec3[]
  cameras: { id: string; position: Vec3; yaw: number; arc: number; range: number; wallMount?: Vec3 }[]
}

/** Shared authored route; feet positions follow the physical detention staircase. */
export const RESCUE_LAYOUT: RescueLayout = {
  hostageSpawns: [[110.5, -4.2, -21]],
  escortRoute: [[117, -4.2, -26], [117, -4.2, -21], [117, -4.2, -19.8],
    ...Array.from({ length: 18 }, (_, i): Vec3 => [117, -4.2 + (i + 1) * 0.24, -19.5 + i * 0.6]),
    [117, 0.12, -8.5], [117, 0.12, -4], [127, 0.05, 11],
    // Approach outside the wheels and the passenger door's outward swing.
    [153, 0.05, 13.7], [155.02, 0.05, 13.7], [155.02, 0.05, 12.55]],
  // Seated hips sit 0.371 m behind the feet/root anchor, directly on the cushion.
  jeepSeats: [[155.021, 0.371, 11.46]],
  jeepBoardPoint: [155.02, 0.05, 12.55],
  escapeRoute: [[155, 0.05, 11], [161, 0.05, 11], [169, 0.05, 11], [175, 0.05, 11]],
  cameras: [
    { id: 'detention-camera', position: [124.9, 3.15, -4.65], yaw: -0.65, arc: 0.65, range: 19 },
    { id: 'jeep-camera', position: [160.6, 3.1, 4.5], yaw: -0.7, arc: 0.75, range: 20 },
    { id: 'security-camera', position: [150.7, 3.15, -40.2], yaw: -0.2, arc: 0.65, range: 18 },
    { id: 'mess-hall-exit-camera', position: [-20.16, 3.45, -35.66], yaw: -1.05, arc: 0.65, range: 23,
      wallMount: [-20.325, 3.45, -36] },
  ],
}

export const DETENTION_STAIR_HOLE = { minX: 115.4, maxX: 118.6, minZ: -20.1, maxZ: -9 }
