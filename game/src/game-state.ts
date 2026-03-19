import type { Lane, GameScreenState } from '@shared/protocol'

/**
 * Central GameState — single source of truth for all mutable game state.
 *
 * State machine:
 *   title → countdown → playing → game_over → title
 *                          ↕
 *                       paused
 */

export interface Obstacle {
  lane: Lane
  y: number // 0.0 = top (far), 1.0 = bottom (near player)
  type: 'boards' | 'zamboni' | 'crack' | 'snow' | 'gate'
  active: boolean // object pool flag
  passed: boolean // already scored past
  width: number // 1 = single lane, 2 = two lanes (gate only)
  secondLane?: Lane // for two-lane obstacles
}

export interface Coin {
  lane: Lane
  y: number
  active: boolean
  collected: boolean
}

export class GameState {
  // Screen state
  screen: GameScreenState = 'title'

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

  // Speed (increases over time)
  speed = 1.0 // multiplier, starts at 1.0
  static readonly BASE_SCROLL_SPEED = 0.15 // pixels per ms
  static readonly SPEED_RAMP_RATE = 0.02 // speed increase per 10 seconds

  // Deke
  dekeActive = false
  dekeInvincibleUntil = 0 // timestamp
  dekeCooldownUntil = 0 // timestamp
  static readonly DEKE_INVINCIBLE_MS = 1000
  static readonly DEKE_COOLDOWN_MS = 3000

  // Stickhandling
  stickhandlingActive = false
  stickhandlingFrequency = 0
  stickhandlingStreakStart = 0
  silkyMittsAwarded = false
  static readonly SILKY_MITTS_THRESHOLD_MS = 5000

  // Coin streaks & multiplier
  coinStreak = 0
  multiplier = 1
  static readonly STREAK_FOR_MULTIPLIER = 10
  static readonly MAX_MULTIPLIER = 5

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

  static readonly LANE_TRANSITION_SPEED = 0.005 // ~200ms full transition
  static readonly LANE_TRANSITION_MS = 200

  get currentSpeed(): number {
    return GameState.BASE_SCROLL_SPEED * this.speed
  }

  get isDekeReady(): boolean {
    return performance.now() > this.dekeCooldownUntil
  }

  get isDekeInvincible(): boolean {
    return performance.now() < this.dekeInvincibleUntil
  }

  get isLaneTransitioning(): boolean {
    return performance.now() < this.transitionEnd
  }

  reset(): void {
    this.screen = 'title'
    this.avatarX = 0.5
    this.targetAvatarX = 0.5
    this.lane = 'center'
    this.isTransitioning = false
    this.transitionEnd = 0
    this.rawX = 0.5
    this.rawY = 0.5
    this.confidence = 0
    this.startTime = 0
    this.elapsed = 0
    this.score = 0
    this.lives = 3
    this.speed = 1.0
    this.dekeActive = false
    this.dekeInvincibleUntil = 0
    this.dekeCooldownUntil = 0
    this.stickhandlingActive = false
    this.stickhandlingFrequency = 0
    this.stickhandlingStreakStart = 0
    this.silkyMittsAwarded = false
    this.coinStreak = 0
    this.multiplier = 1
    this.lastDekeSuccessTime = 0
    this.lastCoinCollectTime = 0
    this.comboText = ''
    this.comboTextUntil = 0
    this.obstacles = []
    this.coins = []
  }

  start(): void {
    this.reset()
    this.screen = 'countdown'
    this.countdownEnd = performance.now() + 3000
  }

  beginPlaying(): void {
    this.screen = 'playing'
    this.startTime = performance.now()
    this.elapsed = 0
  }

  setLane(lane: Lane): void {
    if (this.lane !== lane) {
      this.lane = lane
      this.targetAvatarX = GameState.LANE_X[lane]
      this.transitionEnd = performance.now() + GameState.LANE_TRANSITION_MS
    }
  }

  activateDeke(now: number): boolean {
    if (now < this.dekeCooldownUntil) return false
    this.dekeActive = true
    this.dekeInvincibleUntil = now + GameState.DEKE_INVINCIBLE_MS
    this.dekeCooldownUntil = now + GameState.DEKE_COOLDOWN_MS
    return true
  }

  updatePosition(dt: number): void {
    const diff = this.targetAvatarX - this.avatarX
    if (Math.abs(diff) < 0.001) {
      this.avatarX = this.targetAvatarX
    } else {
      this.avatarX += diff * Math.min(1, dt * GameState.LANE_TRANSITION_SPEED)
    }
  }

  updateSpeed(): void {
    const tenSecIntervals = Math.floor(this.elapsed / 10000)
    this.speed = 1.0 + tenSecIntervals * GameState.SPEED_RAMP_RATE
  }

  addScore(points: number): void {
    this.score += points * this.multiplier
  }

  collectCoin(): void {
    this.coinStreak++
    if (this.coinStreak >= GameState.STREAK_FOR_MULTIPLIER) {
      this.multiplier = Math.min(
        this.multiplier + 1,
        GameState.MAX_MULTIPLIER,
      )
      this.coinStreak = 0
    }
    this.addScore(10)
    this.lastCoinCollectTime = performance.now()
  }

  breakStreak(): void {
    this.coinStreak = 0
    this.multiplier = 1
  }

  loseLife(): void {
    this.lives--
    if (this.lives <= 0) {
      this.screen = 'game_over'
      // Update high score
      if (this.score > this.highScore) {
        this.highScore = this.score
      }
    }
  }
}
