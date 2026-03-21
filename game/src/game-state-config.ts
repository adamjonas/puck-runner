import type { Lane } from '@shared/protocol'

export const BASE_SCROLL_SPEED = 0.15
export const SPEED_RAMP_RATE = 0.167
export const DEKE_INVINCIBLE_MS = 1000
export const DEKE_COOLDOWN_MS = 10000
export const SILKY_MITTS_THRESHOLD_MS = 5000
export const STREAK_FOR_MULTIPLIER = 10
export const MAX_MULTIPLIER = 5
export const DEKE_UNLOCK_MS = 60000
export const LANE_X: Record<Lane, number> = {
  left: 0.2,
  center: 0.5,
  right: 0.8,
}
export const LANE_TRANSITION_SPEED = 0.005
export const LANE_TRANSITION_MS = 200
export const GAME_OVER_ACTION_HOLD_MS = 700
