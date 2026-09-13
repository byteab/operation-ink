import * as THREE from 'three'
import type { Rig } from '../rig'
import type { Gun } from './models'

// Reused each frame; no bone positions or animation length factors are changed by the solve.
const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), wrist = new THREE.Vector3()
const upperDirection = new THREE.Vector3(), foreDirection = new THREE.Vector3()
const target = new THREE.Vector3(), axis = new THREE.Vector3(), bend = new THREE.Vector3()
const offset = new THREE.Vector3(), solvedElbow = new THREE.Vector3(), solvedWrist = new THREE.Vector3()
const upperWorld = new THREE.Quaternion(), foreWorld = new THREE.Quaternion(), handWorld = new THREE.Quaternion()
const parentWorld = new THREE.Quaternion(), solvedUpper = new THREE.Quaternion(), solvedFore = new THREE.Quaternion()
const local = new THREE.Quaternion()
const supportTarget = new THREE.Vector3()
const supportOrientation = new THREE.Quaternion()
// Fingers follow the fore-end; the palm faces upward beneath it.
const cradle = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)))
const leftPole = new THREE.Vector3(0.65, -1, -0.15)
export type HandPlacement = { orientation?: THREE.Quaternion; pole?: THREE.Vector3; maxWristAngle?: number }
const EPSILON = 1e-7

/** Keep the support fist on its gun-local anchor after the pose animation has been applied. */
export function supportHand(rig: Rig, gun: Gun, support = gun.userData.support, weight = 1): void {
  if (!support || gun.parent !== rig.bones['hand.R']) return
  gun.updateWorldMatrix(true, false)
  gun.localToWorld(supportTarget.copy(support))
  gun.getWorldQuaternion(supportOrientation).multiply(cradle)
  placeHand(rig, 'L', supportTarget, weight, { orientation: supportOrientation, pole: leftPole.clone().transformDirection(rig.root.matrixWorld), maxWristAngle: 75 })
}

/** Reach a fist without stretching; optional wrist frame and elbow pole keep contacts natural. */
export function placeHand(rig: Rig, side: 'L' | 'R', targetWorld: THREE.Vector3, weight = 1, placement: HandPlacement = {}): void {
  if (!Number.isFinite(weight) || weight <= 0) return
  const influence = Math.min(1, weight)
  const upper = rig.bones[`upper_arm.${side}`], fore = rig.bones[`forearm.${side}`], hand = rig.bones[`hand.${side}`]
  if (!upper.parent) return

  rig.root.updateMatrixWorld(true)
  upper.getWorldPosition(shoulder)
  fore.getWorldPosition(elbow)
  hand.getWorldPosition(wrist)
  upper.getWorldQuaternion(upperWorld)
  fore.getWorldQuaternion(foreWorld)
  hand.getWorldQuaternion(handWorld)
  if (placement.orientation) handWorld.slerp(placement.orientation, influence)
  upper.parent.getWorldQuaternion(parentWorld)

  upperDirection.subVectors(elbow, shoulder)
  foreDirection.subVectors(wrist, elbow)
  const upperLength = upperDirection.length(), foreLength = foreDirection.length()
  if (!Number.isFinite(upperLength + foreLength) || upperLength < EPSILON || foreLength < EPSILON) return

  // The rig's hand origin is the wrist; its fist centre lies 3.5 cm along hand-local +Y.
  offset.set(0, 0.035, 0).applyQuaternion(handWorld)
  target.copy(targetWorld).sub(offset).lerp(wrist, 1 - influence)
  axis.subVectors(target, shoulder)
  const requestedReach = axis.length()
  if (!Number.isFinite(requestedReach)) return
  if (requestedReach < EPSILON) {
    axis.subVectors(wrist, shoulder)
    if (axis.lengthSq() < EPSILON * EPSILON) axis.copy(upperDirection)
  }
  axis.normalize()

  // Preserve the animated elbow plane. Its normal crossed with the new reach direction
  // gives the elbow's bend side; straight or folded poses use their existing arm orientation.
  if (placement.pole) bend.copy(placement.pole).addScaledVector(axis, -placement.pole.dot(axis))
  else bend.subVectors(wrist, shoulder).cross(upperDirection).cross(axis)
  if (bend.lengthSq() < EPSILON * EPSILON) {
    bend.copy(upperDirection).addScaledVector(axis, -upperDirection.dot(axis))
  }
  if (bend.lengthSq() < EPSILON * EPSILON) {
    bend.set(1, 0, 0).applyQuaternion(upperWorld)
    bend.addScaledVector(axis, -bend.dot(axis))
  }
  if (bend.lengthSq() < EPSILON * EPSILON) {
    bend.set(0, 0, 1).applyQuaternion(upperWorld)
    bend.addScaledVector(axis, -bend.dot(axis))
  }
  bend.normalize()

  // Stay just inside both triangle limits so even impossible targets give finite rotations.
  const margin = Math.min(1e-5, Math.min(upperLength, foreLength) * 0.001)
  const reach = THREE.MathUtils.clamp(requestedReach,
    Math.abs(upperLength - foreLength) + margin, upperLength + foreLength - margin)
  const along = (upperLength * upperLength - foreLength * foreLength + reach * reach) / (2 * reach)
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along))
  solvedElbow.copy(shoulder).addScaledVector(axis, along).addScaledVector(bend, height)
  solvedWrist.copy(shoulder).addScaledVector(axis, reach)

  offset.subVectors(solvedElbow, shoulder).normalize()
  solvedUpper.setFromUnitVectors(upperDirection.normalize(), offset).multiply(upperWorld)
  offset.subVectors(solvedWrist, solvedElbow).normalize()
  solvedFore.setFromUnitVectors(foreDirection.normalize(), offset).multiply(foreWorld)

  upper.quaternion.copy(local.copy(parentWorld).invert().multiply(solvedUpper))
  fore.quaternion.copy(local.copy(solvedUpper).invert().multiply(solvedFore))
  hand.quaternion.copy(local.copy(solvedFore).invert().multiply(handWorld))
  upper.updateWorldMatrix(false, true)

  // A fist can reach the right point while its wrist folds backward. Relax only the
  // free/support hand's swing, then solve its wrist again so contact stays exact.
  if (placement.maxWristAngle !== undefined) {
    const fingers = new THREE.Vector3(0, 1, 0).applyQuaternion(handWorld)
    const foreward = solvedWrist.clone().sub(solvedElbow).normalize()
    const angle = fingers.angleTo(foreward), limit = THREE.MathUtils.degToRad(placement.maxWristAngle)
    if (angle > limit) {
      const correction = new THREE.Quaternion().setFromUnitVectors(fingers, foreward)
      const relaxed = new THREE.Quaternion().slerp(correction, (angle - limit) / angle).multiply(handWorld)
      const centre = hand.localToWorld(new THREE.Vector3(0, 0.035, 0))
      placeHand(rig, side, centre, 1, { ...placement, orientation: relaxed, maxWristAngle: undefined })
    }
  }
}
