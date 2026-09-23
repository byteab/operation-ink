/** Radial dead zone, full walk at the inner ring, then a continuous ramp to sprint. */
export function touchStick(x: number, y: number, radius: number, sensitivity = 1) {
  const distance = Math.hypot(x, y)
  if (!Number.isFinite(distance) || radius <= 0 || !Number.isFinite(radius)) return { x: 0, forward: 0, sprint: false, knobX: 0, knobY: 0 }
  let reach = Math.min(1, distance / radius)
  // Adjust response after the dead zone; full tilt still reaches the same run speed.
  if (reach > 0.13 && sensitivity !== 1) {
    const response = Number.isFinite(sensitivity) ? Math.max(0.5, Math.min(2, sensitivity)) : 1
    reach = 0.13 + 0.87 * Math.pow((reach - 0.13) / 0.87, 1 / response)
  }
  const knobScale = distance > 0 ? Math.min(distance, radius) / distance : 0
  const sprint = reach > 0.72
  const speed = reach <= 0.13 ? 0 : sprint
    ? (4.2 + (7.6 - 4.2) * (reach - 0.72) / 0.28) / 7.6
    : (reach - 0.13) / (0.72 - 0.13)
  return { x: distance ? x / distance * speed : 0, forward: distance ? -y / distance * speed : 0,
    sprint, knobX: x * knobScale, knobY: y * knobScale }
}

/** A held camera tilt controls speed, with fine aim near the center. */
export function touchLookStick(x: number, y: number, radius: number) {
  const distance = Math.hypot(x, y)
  if (!Number.isFinite(distance) || radius <= 0 || !Number.isFinite(radius)) return { x: 0, y: 0, knobX: 0, knobY: 0 }
  const reach = Math.min(1, distance / radius)
  const speed = Math.pow(Math.max(0, (reach - 0.1) / 0.9), 1.5)
  const scale = distance > 0 ? Math.min(distance, radius) / distance : 0
  return { x: distance ? x / distance * speed * 1200 : 0, y: distance ? y / distance * speed * 900 : 0,
    knobX: x * scale, knobY: y * scale }
}
