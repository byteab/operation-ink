export type InputSensitivity = { mouse: number; move: number; look: number }
export type InputSettings = InputSensitivity & { invertMouse: boolean; invertTouch: boolean }
export type SensitivityKey = keyof InputSensitivity
export const SENSITIVITY_LIMITS = { mouse: [0.25, 3], move: [0.5, 2], look: [0.25, 3] } as const
export const SENSITIVITY_STORAGE_KEY = 'stickman.input-sensitivity.v1'

export function clampSensitivity(key: SensitivityKey, value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  const [min, max] = SENSITIVITY_LIMITS[key]
  return Math.max(min, Math.min(max, Math.round(value * 20) / 20))
}

export function loadInputSettings(): InputSettings {
  const settings: InputSettings = { mouse: 1, move: 1, look: 1, invertMouse: false, invertTouch: false }
  try {
    const saved = JSON.parse(localStorage.getItem(SENSITIVITY_STORAGE_KEY) ?? 'null')
    for (const key of ['mouse', 'move', 'look'] as const) settings[key] = clampSensitivity(key, saved?.[key])
    settings.invertMouse = saved?.invertMouse === true
    settings.invertTouch = saved?.invertTouch === true
  } catch { /* Defaults also work when browser storage is unavailable. */ }
  return settings
}

export function saveInputSettings(settings: InputSettings) {
  try { localStorage.setItem(SENSITIVITY_STORAGE_KEY, JSON.stringify(settings)) }
  catch { /* Keep the current session usable when storage is blocked. */ }
}
