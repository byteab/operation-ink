import type { StationKind, Vec3 } from './types'
import { RESCUE_LAYOUT } from './rescue-layout'

export const CAMERA_SHUTDOWN_SECONDS = 60
export const SIGNALS_COMPUTER_ID = 'signals-office-computer'

export type HostageState = { id: string; status: 'captive' | 'following' | 'loaded'; position: Vec3; routeIndex: number }
export type MissionState = {
  phase: 'active' | 'dead' | 'complete'
  camerasActive: boolean; camerasDisabledUntil: number | null; alarm: 'inactive' | 'active' | 'silenced'; alarmElapsed: number
  silencedElapsed: number; alarmPosition: Vec3 | null; reservesDispatched: number
  gateOpen: boolean; hostages: HostageState[]; jeep: 'waiting' | 'boarding' | 'escaping' | 'escaped'; escapeProgress: number
  detentionFound: boolean; cellsReached: boolean
  health: number; elapsed: number; supplies: string[]; distractionUntil: number
  shots: number; kills: number; detections: number
}
export const initialMission = (): MissionState => ({
  phase: 'active', camerasActive: true, camerasDisabledUntil: null, alarm: 'inactive', alarmElapsed: 0, silencedElapsed: 0,
  alarmPosition: null, reservesDispatched: 0, gateOpen: false,
  hostages: RESCUE_LAYOUT.hostageSpawns.map((position, index) => ({ id: `hostage-${index + 1}`, status: 'captive', position: [...position], routeIndex: index < 2 ? 1 : 0 })),
  jeep: 'waiting', escapeProgress: 0, detentionFound: false, cellsReached: false,
  health: 100, elapsed: 0, supplies: [], distractionUntil: 0, shots: 0, kills: 0, detections: 0,
})
export const loadedCount = (state: MissionState) => state.hostages.filter(h => h.status === 'loaded').length
export const releasedCount = (state: MissionState) => state.hostages.filter(h => h.status !== 'captive').length

export function stationLabel(state: MissionState, kind: StationKind, id: string): string | null {
  if (state.phase !== 'active' || state.jeep === 'escaping') return null
  switch (kind) {
    case 'hostage': return state.hostages.find(h => h.id === id)?.status === 'captive' ? 'Unlock' : null
    case 'cameras': return state.camerasActive || (id !== SIGNALS_COMPUTER_ID && state.camerasDisabledUntil !== null)
      ? id === SIGNALS_COMPUTER_ID ? 'Disable cameras · 60s' : 'Disable cameras' : null
    case 'alarm': return state.alarm === 'active' ? 'Silence alarm' : null
    case 'gate': return state.gateOpen ? null : 'Open gate'
    case 'jeep': return loadedCount(state) < state.hostages.length ? 'Hostage needed' : !state.gateOpen ? 'Open gate first' : 'Board jeep'
    case 'rally': return state.hostages.some(h => h.status === 'following') ? 'Regroup hostage' : null
    case 'supply': return state.supplies.includes(id) ? null : 'Heal'
    case 'distraction': return state.elapsed < state.distractionUntil ? null : 'Ring bell'
    default: return null
  }
}

/** Geometry is validated by PlayerActions and runtime; transitions are independently idempotent. */
export function useStation(state: MissionState, kind: StationKind, id: string): { changed: boolean; message: string } {
  if (!stationLabel(state, kind, id)) return { changed: false, message: '' }
  switch (kind) {
    case 'hostage': {
      const hostage = state.hostages.find(h => h.id === id)!
      hostage.status = 'following'; state.detentionFound = state.cellsReached = true
      return { changed: true, message: 'Cell unlocked. Wait for him to stand, then lead him upstairs to the jeep.' }
    }
    case 'cameras': {
      state.camerasActive = false
      state.camerasDisabledUntil = id === SIGNALS_COMPUTER_ID ? state.elapsed + CAMERA_SHUTDOWN_SECONDS : null
      return { changed: true, message: `${state.camerasDisabledUntil === null ? 'Camera network disabled.' : 'Camera network offline for 60 seconds.'} An active alarm must be silenced at a wall panel.` }
    }
    case 'alarm': state.alarm = 'silenced'; state.silencedElapsed = 0; return { changed: true, message: 'Alarm silenced. Guards will search their last known contact, then return to duty.' }
    case 'gate': state.gateOpen = true; return { changed: true, message: 'Exit gate opening. Bring the hostage to the jeep.' }
    case 'jeep':
      if (loadedCount(state) !== state.hostages.length) return { changed: false, message: 'The hostage must be aboard. Lead him along the marked rescue route.' }
      if (!state.gateOpen) return { changed: false, message: 'Open the exit gate at the nearby panel first.' }
      state.jeep = 'escaping'; state.escapeProgress = 0
      return { changed: true, message: 'Hostage aboard. Escaping through the east gate.' }
    case 'rally': return { changed: true, message: 'Regrouping. Return along the rescue route to bring the hostage forward.' }
    case 'supply':
      if (state.health === 100) return { changed: false, message: 'Health is full. Leave the dressing for later.' }
      state.supplies.push(id); state.health = 100; return { changed: true, message: 'Field dressing used. Health restored.' }
    case 'distraction': state.distractionUntil = state.elapsed + 25; return { changed: true, message: 'Service bell ringing. Nearby guards will investigate.' }
    default: return { changed: false, message: '' }
  }
}

export function missionObjective(state: MissionState) {
  if (state.phase === 'dead') return 'Rescue interrupted. Retry the insertion checkpoint.'
  if (state.phase === 'complete') return 'Hostage extracted. Mission complete.'
  if (state.jeep === 'escaping') return 'Escape the compound'
  if (releasedCount(state) < state.hostages.length) {
    if (!state.detentionFound) return 'Find the detention building in the east annex'
    if (!state.cellsReached) return 'Reach the underground cells'
    return 'Release the hostage in cell 01'
  }
  if (loadedCount(state) < state.hostages.length) return 'Escort the hostage to the jeep'
  if (!state.gateOpen) return 'Open the exit gate'
  return 'Board the jeep and escape'
}

export function advanceMission(state: MissionState, dt: number) {
  if (state.phase !== 'active') return false
  state.elapsed += Math.max(0, dt)
  if (state.camerasDisabledUntil !== null && state.elapsed >= state.camerasDisabledUntil) {
    state.camerasActive = true
    state.camerasDisabledUntil = null
  }
  return true
}

/** Only the vehicle crossing the exit, with its full manifest, can finish the mission. */
export function completeEscape(state: MissionState, crossedGate: boolean) {
  if (state.phase !== 'active' || state.jeep !== 'escaping' || !state.gateOpen || loadedCount(state) !== state.hostages.length || !crossedGate) return false
  state.jeep = 'escaped'; state.phase = 'complete'; return true
}

export function damageMission(state: MissionState, amount: number) {
  if (state.phase !== 'active' || amount <= 0) return false
  state.health = Math.max(0, state.health - amount)
  if (!state.health) state.phase = 'dead'
  return true
}
