import type { Lane, GameScreenState } from '@shared/protocol'
import { TRACKING_CONFIDENCE_MIN } from './runtime-config'

interface ControllableTrackingParams {
  screen: GameScreenState
  confidence: number
  inputDeke: boolean
  prevDeke: boolean
  stickhandlingActive: boolean
  stickhandlingFrequency: number
  stickhandlingStreakStart: number
  silkyMittsAwarded: boolean
  now: number
}

export interface ControllableTrackingResolution {
  shouldApplyControls: boolean
  shouldTriggerDeke: boolean
  stickhandlingActive: boolean
  stickhandlingFrequency: number
  stickhandlingStreakStart: number
  silkyMittsAwarded: boolean
}

export function isControllableTrackingScreen(screen: GameScreenState): boolean {
  return screen === 'playing' || screen === 'tutorial'
}

export function resolveControllableTracking(
  params: ControllableTrackingParams,
): ControllableTrackingResolution {
  if (
    params.confidence < TRACKING_CONFIDENCE_MIN ||
    !isControllableTrackingScreen(params.screen)
  ) {
    return {
      shouldApplyControls: false,
      shouldTriggerDeke: false,
      stickhandlingActive: params.stickhandlingActive,
      stickhandlingFrequency: params.stickhandlingFrequency,
      stickhandlingStreakStart: params.stickhandlingStreakStart,
      silkyMittsAwarded: params.silkyMittsAwarded,
    }
  }

  const stickhandlingStreakStart = params.stickhandlingActive
    ? (params.stickhandlingStreakStart === 0 ? params.now : params.stickhandlingStreakStart)
    : 0

  return {
    shouldApplyControls: true,
    shouldTriggerDeke: params.screen === 'playing' && params.inputDeke && !params.prevDeke,
    stickhandlingActive: params.stickhandlingActive,
    stickhandlingFrequency: params.stickhandlingFrequency,
    stickhandlingStreakStart,
    silkyMittsAwarded: params.stickhandlingActive ? params.silkyMittsAwarded : false,
  }
}

export function resolveGameOverActionLane(
  lane: Lane,
  confidence: number,
): Lane | null {
  return confidence >= TRACKING_CONFIDENCE_MIN ? lane : null
}
