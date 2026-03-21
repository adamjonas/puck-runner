import trackerConfig from './tracker-config.json'

// Shared protocol types for WebSocket messages between iPhone tracker and game display.
// iPhone mirrors these types manually in Swift — this file is the single source of truth.

export interface TrackingDebugTiming {
  frameId: number
  captureTs: number
  detectDoneTs: number
  sendTs: number
}

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
  debugTiming?: TrackingDebugTiming
}

/** Game → iPhone: state updates */
export interface GameStateMessage {
  type: 'state'
  state: GameScreenState
  score: number
  event?: GameEvent
}

/** Browser → iPhone: estimate browser/phone monotonic clock offset */
export interface ClockSyncRequestMessage {
  type: 'clock_sync_request'
  t1: number
}

/** iPhone → Browser: immediate response with phone receive timestamp */
export interface ClockSyncResponseMessage {
  type: 'clock_sync_response'
  t1: number
  t2: number
}

export type Lane = 'left' | 'center' | 'right'

export type GameScreenState =
  | 'title'
  | 'calibrating'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'game_over'
  | 'tutorial'

export type GameEvent =
  | 'coin_collected'
  | 'obstacle_hit'
  | 'deke_success'
  | 'combo_triggered'
  | 'new_high_score'

/** Lane boundary constants (shared between tracker and game) */
export const LANE_BOUNDARIES = trackerConfig.laneBoundaries

/** Deke zone thresholds (Y-axis, hysteresis) */
export const DEKE_THRESHOLDS = trackerConfig.dekeThresholds

export const WS_ENDPOINTS = trackerConfig.webSocket

export const MESSAGE_TYPES = trackerConfig.messageTypes

export type ServerMessage =
  | TrackingInput
  | GameStateMessage
  | ClockSyncRequestMessage
  | ClockSyncResponseMessage
