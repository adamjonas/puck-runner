import type { Lane, GameScreenState } from '@shared/protocol'
import {
  BASE_SCROLL_SPEED as BASE_SCROLL_SPEED_VALUE,
  DEKE_COOLDOWN_MS as DEKE_COOLDOWN_MS_VALUE,
  DEKE_INVINCIBLE_MS as DEKE_INVINCIBLE_MS_VALUE,
  DEKE_UNLOCK_MS as DEKE_UNLOCK_MS_VALUE,
  GAME_OVER_ACTION_HOLD_MS as GAME_OVER_ACTION_HOLD_MS_VALUE,
  LANE_TRANSITION_MS as LANE_TRANSITION_MS_VALUE,
  LANE_TRANSITION_SPEED as LANE_TRANSITION_SPEED_VALUE,
  LANE_X as LANE_X_VALUE,
  MAX_MULTIPLIER as MAX_MULTIPLIER_VALUE,
  SILKY_MITTS_THRESHOLD_MS as SILKY_MITTS_THRESHOLD_MS_VALUE,
  SPEED_RAMP_RATE as SPEED_RAMP_RATE_VALUE,
  STREAK_FOR_MULTIPLIER as STREAK_FOR_MULTIPLIER_VALUE,
} from './game-state-config'
import {
  applyCoinCollection,
  computeSpeed,
  createResetStateValues,
  createRunState as createRunStateValue,
  getCurrentSpeed,
  isDekeUnlocked as isDekeUnlockedValue,
  resolveLifeLost,
  updateAvatarPosition,
  updateGameOverActionState,
} from './game-state-logic'
import type { Coin, GameOverAction, Obstacle, RunState } from './game-state-types'
import { resetCoin, resetObstacle } from './world-entities'
export type { Coin, GameOverAction, Obstacle, RunState } from './game-state-types'

/**
 * Central GameState — single source of truth for all mutable game state.
 *
 * State machine:
 *   title → countdown → playing → game_over → title
 *                          ↕
 *                       paused
 */

export class GameState {
  private _now = 0

  // Screen state
  screen: GameScreenState = 'title'

  // Tutorial
  tutorialActive = false
  tutorialText = '' // current instruction text, set by TutorialManager via main.ts

  // Avatar position (0.0 = left edge, 1.0 = right edge)
  avatarX = 0.5
  targetAvatarX = 0.5
  lane: Lane = 'center'
  isTransitioning = false
  transitionEnd = 0

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
  countdownEnd = 0

  // Score
  score = 0
  lives = 3
  highScore = 0
  isNewHighScore = false

  // Speed (increases over time)
  speed = 1.0 // multiplier, starts at 1.0
  static readonly BASE_SCROLL_SPEED = BASE_SCROLL_SPEED_VALUE
  static readonly SPEED_RAMP_RATE = SPEED_RAMP_RATE_VALUE

  // Deke
  dekeActive = false
  dekeInvincibleUntil = 0 // timestamp
  dekeCooldownUntil = 0 // timestamp
  static readonly DEKE_INVINCIBLE_MS = DEKE_INVINCIBLE_MS_VALUE
  static readonly DEKE_COOLDOWN_MS = DEKE_COOLDOWN_MS_VALUE

  // Stickhandling
  stickhandlingActive = false
  stickhandlingFrequency = 0
  stickhandlingStreakStart = 0
  silkyMittsAwarded = false
  static readonly SILKY_MITTS_THRESHOLD_MS = SILKY_MITTS_THRESHOLD_MS_VALUE

  // Coin streaks & multiplier
  coinStreak = 0
  multiplier = 1
  static readonly STREAK_FOR_MULTIPLIER = STREAK_FOR_MULTIPLIER_VALUE
  static readonly MAX_MULTIPLIER = MAX_MULTIPLIER_VALUE

  // Combo tracking
  lastDekeSuccessTime = 0
  lastCoinCollectTime = 0
  comboText = ''
  comboTextUntil = 0

  // Obstacles & coins (managed by spawner, rendered by renderer)
  obstacles: Obstacle[] = []
  coins: Coin[] = []

  // Player profile
  playerName = ''

  // Game-over gesture selection
  gameOverAction: GameOverAction = null
  gameOverActionStartedAt = 0
  gameOverActionProgress = 0

  // Debug
  fps = 0
  inputRate = 0
  latency = 0
  latencyBreakdown = ''

  // Per-run timers and flags
  run: RunState = createRunStateValue()

  // Lane positions (X coordinate for each lane center)
  static readonly LANE_X: Record<Lane, number> = LANE_X_VALUE
  static readonly LANE_TRANSITION_SPEED = LANE_TRANSITION_SPEED_VALUE
  static readonly LANE_TRANSITION_MS = LANE_TRANSITION_MS_VALUE
  static readonly GAME_OVER_ACTION_HOLD_MS = GAME_OVER_ACTION_HOLD_MS_VALUE

  static createRunState(): RunState {
    return createRunStateValue()
  }

  get now(): number {
    return this._now
  }

  syncTime(now: number): void {
    this._now = now
  }

  get currentSpeed(): number {
    return getCurrentSpeed(this.speed)
  }

  /** Deke unlocks after 60 seconds of play */
  static readonly DEKE_UNLOCK_MS = DEKE_UNLOCK_MS_VALUE

  get isDekeUnlocked(): boolean {
    return isDekeUnlockedValue(this.elapsed)
  }

  get isDekeReady(): boolean {
    return this.isDekeUnlocked && this.now > this.dekeCooldownUntil
  }

  get isDekeInvincible(): boolean {
    return this.now < this.dekeInvincibleUntil
  }

  get isLaneTransitioning(): boolean {
    return this.now < this.transitionEnd
  }

  reset(): void {
    Object.assign(this, createResetStateValues())
    this.resetWorldObjects()
  }

  start(now: number): void {
    this.startCountdown(now)
  }

  startCountdown(now: number): void {
    this.syncTime(now)
    this.reset()
    this.screen = 'countdown'
    this.countdownEnd = now + 3000
  }

  enterTutorial(now: number, speed: number): void {
    this.syncTime(now)
    this.reset()
    this.screen = 'tutorial'
    this.tutorialActive = true
    this.startTime = now
    this.speed = speed
  }

  beginPlaying(now: number): void {
    this.syncTime(now)
    this.screen = 'playing'
    this.startTime = now
    this.elapsed = 0
    this.stickhandlingStreakStart = 0
    this.silkyMittsAwarded = false
    this.run.lastSurvivalTick = now
    this.run.lastStickhandlingTick = now
  }

  setLane(lane: Lane, now: number): void {
    this.syncTime(now)
    if (this.lane !== lane) {
      this.lane = lane
      this.targetAvatarX = GameState.LANE_X[lane]
      this.transitionEnd = now + GameState.LANE_TRANSITION_MS
    }
  }

  activateDeke(now: number): boolean {
    this.syncTime(now)
    if (!this.isDekeUnlocked) return false
    if (now < this.dekeCooldownUntil) return false
    this.dekeActive = true
    this.dekeInvincibleUntil = now + GameState.DEKE_INVINCIBLE_MS
    this.dekeCooldownUntil = now + GameState.DEKE_COOLDOWN_MS
    return true
  }

  updatePosition(dt: number): void {
    this.avatarX = updateAvatarPosition(this.avatarX, this.targetAvatarX, dt)
  }

  updateSpeed(): void {
    this.speed = computeSpeed(this.elapsed)
  }

  addScore(points: number): void {
    this.score += points * this.multiplier
  }

  collectCoin(now: number): void {
    this.syncTime(now)
    const nextState = applyCoinCollection({
      coinStreak: this.coinStreak,
      multiplier: this.multiplier,
    })
    this.coinStreak = nextState.coinStreak
    this.multiplier = nextState.multiplier
    this.score += nextState.scoreDelta
    this.lastCoinCollectTime = now
  }

  updateGameOverAction(lane: Lane | null, confidence: number): GameOverAction | null {
    const nextState = updateGameOverActionState({
      screen: this.screen,
      now: this.now,
      lane,
      confidence,
      gameOverAction: this.gameOverAction,
      gameOverActionStartedAt: this.gameOverActionStartedAt,
    })
    this.gameOverAction = nextState.action
    this.gameOverActionStartedAt = nextState.startedAt
    this.gameOverActionProgress = nextState.progress
    return nextState.resolvedAction
  }

  breakStreak(): void {
    this.coinStreak = 0
    this.multiplier = 1
  }

  loseLife(): void {
    const result = resolveLifeLost({
      lives: this.lives,
      score: this.score,
      highScore: this.highScore,
    })
    this.lives = result.lives
    this.screen = result.screen
    this.highScore = result.highScore
    this.isNewHighScore = result.isNewHighScore
  }

  resetWorldObjects(): void {
    for (const obstacle of this.obstacles) {
      resetObstacle(obstacle)
    }
    for (const coin of this.coins) {
      resetCoin(coin)
    }
  }
}
