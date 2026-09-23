import assert from 'node:assert/strict'
import { clampSensitivity, loadInputSettings, saveInputSettings, SENSITIVITY_STORAGE_KEY } from '../src/player/input-settings'

const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
let saved: string | null = null
try {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => { assert.equal(key, SENSITIVITY_STORAGE_KEY); return saved },
    setItem: (key: string, value: string) => { assert.equal(key, SENSITIVITY_STORAGE_KEY); saved = value },
  } })
  assert.deepEqual(loadInputSettings(), { mouse: 1, move: 1, look: 1, invertMouse: false, invertTouch: false })
  const settings = { mouse: 0.75, move: 1.5, look: 2, invertMouse: true, invertTouch: false }
  saveInputSettings(settings)
  assert.deepEqual(loadInputSettings(), settings, 'All three independent settings survive a new load')
  saveInputSettings({ ...settings, invertMouse: false, invertTouch: true })
  assert.deepEqual(loadInputSettings(), { ...settings, invertMouse: false, invertTouch: true }, 'Mouse and touch inversion persist independently')
  saved = '{invalid'
  assert.deepEqual(loadInputSettings(), { mouse: 1, move: 1, look: 1, invertMouse: false, invertTouch: false })
  saved = JSON.stringify({ mouse: 500, move: -1, look: 'bad', invertMouse: 'true', invertTouch: 1 })
  assert.deepEqual(loadInputSettings(), { mouse: 3, move: 0.5, look: 1, invertMouse: false, invertTouch: false }, 'Invalid stored values cannot create unsafe input rates')
  saved = JSON.stringify({ mouse: 0.5 })
  assert.deepEqual(loadInputSettings(), { mouse: 0.5, move: 1, look: 1, invertMouse: false, invertTouch: false }, 'Missing settings retain defaults')
  assert.equal(clampSensitivity('mouse', Infinity), 1)
  assert.equal(clampSensitivity('look', NaN), 1)
  assert.equal(clampSensitivity('move', 1.234), 1.25)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked') } })
  assert.deepEqual(loadInputSettings(), { mouse: 1, move: 1, look: 1, invertMouse: false, invertTouch: false })
  assert.doesNotThrow(() => saveInputSettings(settings), 'Blocked storage cannot break the settings menu')
  console.log('PASS independent sensitivity persistence, bounds, defaults, malformed data and unavailable storage')
} finally {
  if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
  else Reflect.deleteProperty(globalThis, 'localStorage')
}
