import type { Lane, GameScreenState } from '@shared/protocol'

/**
 * Central GameState — single source of truth for all mutable game state.
 *
 * State machine:
 *   title → playing → game_over → title
 *              ↕
 *           paused
 */
export class GameState {
  // Screen state
  screen: GameScreenState = 'title'

  // Avatar position (0.0 = left edge, 1.0 = right edge)
  avatarX = 0.5
  targetAvatarX = 0.5
  lane: Lane = 'center'

  // Raw tracker input
  rawX = 0.5
  rawY = 0.5
  confidence = 0

  // Tracker connection
  trackerConnected = false
  lastInputTime = 0

  // Timing
  startTime = 0
  elapsed = 0

  // Debug
  fps = 0
  inputRate = 0
  latency = 0

  // Lane positions (X coordinate for each lane center)
  static readonly LANE_X: Record<Lane, number> = {
    left: 0.2,
    center: 0.5,
    right: 0.8,
  }

  // Lane transition speed (fraction of distance per ms)
  static readonly LANE_TRANSITION_SPEED = 0.005 // ~200ms full transition

  reset(): void {
    this.screen = 'title'
    this.avatarX = 0.5
    this.targetAvatarX = 0.5
    this.lane = 'center'
    this.rawX = 0.5
    this.rawY = 0.5
    this.confidence = 0
    this.startTime = 0
    this.elapsed = 0
  }

  start(): void {
    this.screen = 'playing'
    this.startTime = performance.now()
    this.elapsed = 0
  }

  setLane(lane: Lane): void {
    if (this.lane !== lane) {
      this.lane = lane
      this.targetAvatarX = GameState.LANE_X[lane]
    }
  }

  /** Update avatar position toward target (smooth lane transition) */
  updatePosition(dt: number): void {
    const diff = this.targetAvatarX - this.avatarX
    if (Math.abs(diff) < 0.001) {
      this.avatarX = this.targetAvatarX
    } else {
      this.avatarX += diff * Math.min(1, dt * GameState.LANE_TRANSITION_SPEED)
    }
  }
}
