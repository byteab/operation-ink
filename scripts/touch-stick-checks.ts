import assert from 'node:assert/strict'
import { touchStick, touchLookStick } from '../src/player/touch-stick'

const speed = (x: number, y: number) => {
  const stick = touchStick(x, y, 100)
  return Math.hypot(stick.x, stick.forward) * (stick.sprint ? 7.6 : 4.2)
}
assert.equal(speed(0, 0), 0)
assert.equal(speed(5, 10), 0, 'Resting thumb jitter must not move the player')
assert(speed(0, -40) > 0 && speed(0, -40) < 4.2, 'Partial tilt allows slow walking')
assert.equal(speed(0, -72), 4.2)
assert(Math.abs(speed(0, -72.001) - speed(0, -71.999)) < 0.001, 'Crossing the run ring cannot jump in speed')
assert.equal(speed(0, -100), 7.6)
assert(Math.abs(speed(100, -100) - 7.6) < 1e-10, 'Diagonal input never exceeds maximum speed')
assert.equal(speed(0, -1000), 7.6, 'Dragging outside the stick stays clamped')
assert(touchStick(-50, 50, 100).x < 0 && touchStick(-50, 50, 100).forward < 0, 'Backward and strafe directions are preserved')
for (let distance = 1; distance <= 150; distance++) {
  assert(speed(0, -distance) >= speed(0, 1 - distance), 'Speed must increase monotonically')
}
for (const [x, y, radius] of [[NaN, 0, 100], [0, Infinity, 100], [100, 100, 0]]) {
  const stick = touchStick(x, y, radius)
  assert.equal(stick.x, 0); assert.equal(stick.forward, 0)
}
console.log('PASS touch dead zone, continuous walk/run speed, directions, diagonal cap and invalid input')

const movementSpeed = (reach: number, sensitivity: number) => {
  const input = touchStick(reach, 0, 100, sensitivity)
  return input.x * (input.sprint ? 7.6 : 4.2)
}
assert(movementSpeed(55, 2) > movementSpeed(55, 1) && movementSpeed(55, 1) > movementSpeed(55, 0.5), 'Movement sensitivity changes the response to partial tilt')
for (const sensitivity of [0.5, 1, 2]) {
  assert.equal(movementSpeed(5, sensitivity), 0, 'Sensitivity preserves the resting dead zone')
  assert.equal(movementSpeed(100, sensitivity), 7.6, 'Every setting still reaches full running speed')
  assert.equal(movementSpeed(500, sensitivity), 7.6, 'Sensitivity cannot exceed the game running speed')
  assert.equal(touchStick(55, 0, 100, sensitivity).knobX, 55, 'Sensitivity does not detach the knob from the thumb')
}
console.log('PASS movement sensitivity adjusts partial tilt while preserving the dead zone, thumb position and maximum speed')

assert.equal(touchLookStick(5, 5, 100).x, 0, 'Resting thumb jitter cannot turn the camera')
const slow = touchLookStick(25, 0, 100), fast = touchLookStick(100, 0, 100)
assert(slow.x > 0 && slow.x < fast.x / 4, 'Small tilts allow precise aiming')
assert.equal(fast.x, 1200)
assert.equal(touchLookStick(1000, 0, 100).x, fast.x, 'Camera speed stays capped outside the stick')
assert.equal(touchLookStick(0, -100, 100).y, -900, 'Upward tilts preserve the pitch direction')
const diagonal = touchLookStick(100, 100, 100)
assert(Math.abs(Math.hypot(diagonal.x / 1200, diagonal.y / 900) - 1) < 1e-10, 'Diagonal aim has no speed boost')
for (let distance = 1; distance <= 150; distance++) {
  assert(touchLookStick(distance, 0, 100).x >= touchLookStick(distance - 1, 0, 100).x, 'More tilt cannot slow the camera')
}
for (const [x, y, radius] of [[NaN, 0, 100], [0, Infinity, 100], [100, 100, 0]]) {
  assert.deepEqual(touchLookStick(x, y, radius), { x: 0, y: 0, knobX: 0, knobY: 0 })
}
console.log('PASS camera stick dead zone, fine aim, progressive speed, direction and bounded diagonal input')
