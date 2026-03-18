// Shared protocol types for WebSocket messages between iPhone tracker and game display.
// iPhone mirrors these types manually in Swift — this file is the single source of truth.

/** iPhone → Game: tracking input at 30Hz */
export interface TrackingInput {
  type: 'input'
  ts: number
  raw: { x: number; y: number }
  lane: Lane
  deke: boolean
  confidence: number
  stickhandling: {
    active: boolean
    frequency: number
    amplitude: number
  }
}

/** Game → iPhone: state updates */
export interface GameStateMessage {
  type: 'state'
  state: GameScreenState
  score: number
  event?: GameEvent
}

export type Lane = 'left' | 'center' | 'right'

export type GameScreenState =
  | 'title'
  | 'calibrating'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'game_over'

export type GameEvent =
  | 'coin_collected'
  | 'obstacle_hit'
  | 'deke_success'
  | 'combo_triggered'
  | 'new_high_score'

/** Lane boundary constants (shared between tracker and game) */
export const LANE_BOUNDARIES = {
  leftMax: 0.3,
  deadZoneLeft: 0.33,
  deadZoneRight: 0.67,
  rightMin: 0.7,
} as const

/** Deke zone thresholds (Y-axis, hysteresis) */
export const DEKE_THRESHOLDS = {
  enter: 0.25,
  exit: 0.35,
} as const

export type ServerMessage = TrackingInput | GameStateMessage
