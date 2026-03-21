import type { Lane } from '@shared/protocol'
import {
  BASE_SCROLL_SPEED,
  DEKE_UNLOCK_MS,
  GAME_OVER_ACTION_HOLD_MS,
  LANE_TRANSITION_SPEED,
  MAX_MULTIPLIER,
  SPEED_RAMP_RATE,
  STREAK_FOR_MULTIPLIER,
} from './game-state-config'
import type { GameOverAction, RunState } from './game-state-types'

interface CoinCollectionState {
  coinStreak: number
  multiplier: number
}

interface GameOverActionState {
  screen: string
  now: number
  lane: Lane | null
  confidence: number
  gameOverAction: GameOverAction
  gameOverActionStartedAt: number
}

export interface GameOverActionUpdate {
  action: GameOverAction
  startedAt: number
  progress: number
  resolvedAction: GameOverAction
}

export interface ResetStateValues {
  screen: 'title'
  avatarX: number
  targetAvatarX: number
  lane: Lane
  isTransitioning: boolean
  transitionEnd: number
  rawX: number
  rawY: number
  confidence: number
  startTime: number
  elapsed: number
  score: number
  lives: number
  speed: number
  dekeActive: boolean
  dekeInvincibleUntil: number
  dekeCooldownUntil: number
  stickhandlingActive: boolean
  stickhandlingFrequency: number
  stickhandlingStreakStart: number
  silkyMittsAwarded: boolean
  coinStreak: number
  multiplier: number
  lastDekeSuccessTime: number
  lastCoinCollectTime: number
  comboText: string
  comboTextUntil: number
  isNewHighScore: boolean
  gameOverAction: GameOverAction
  gameOverActionStartedAt: number
  gameOverActionProgress: number
  tutorialActive: boolean
  tutorialText: string
  run: RunState
}

export function createRunState(random: () => number = Math.random): RunState {
  return {
    lastSurvivalTick: 0,
    lastStickhandlingTick: 0,
    lastSpeedMilestone: 1.0,
    firstCoinAnnounced: false,
    dekeUnlockAnnounced: false,
    onFireAnnounced: false,
    lastObstacleSpawnTime: 0,
    nextObstacleSpawnInterval: 3000 + random() * 1000,
    lastCoinSpawnTime: 0,
    nextCoinSpawnInterval: 2000 + random() * 1000,
  }
}

export function createResetStateValues(): ResetStateValues {
  return {
    screen: 'title',
    avatarX: 0.5,
    targetAvatarX: 0.5,
    lane: 'center',
    isTransitioning: false,
    transitionEnd: 0,
    rawX: 0.5,
    rawY: 0.5,
    confidence: 0,
    startTime: 0,
    elapsed: 0,
    score: 0,
    lives: 3,
    speed: 1.0,
    dekeActive: false,
    dekeInvincibleUntil: 0,
    dekeCooldownUntil: 0,
    stickhandlingActive: false,
    stickhandlingFrequency: 0,
    stickhandlingStreakStart: 0,
    silkyMittsAwarded: false,
    coinStreak: 0,
    multiplier: 1,
    lastDekeSuccessTime: 0,
    lastCoinCollectTime: 0,
    comboText: '',
    comboTextUntil: 0,
    isNewHighScore: false,
    gameOverAction: null,
    gameOverActionStartedAt: 0,
    gameOverActionProgress: 0,
    tutorialActive: false,
    tutorialText: '',
    run: createRunState(),
  }
}

export function getCurrentSpeed(speed: number): number {
  return BASE_SCROLL_SPEED * speed
}

export function isDekeUnlocked(elapsed: number): boolean {
  return elapsed >= DEKE_UNLOCK_MS
}

export function updateAvatarPosition(
  avatarX: number,
  targetAvatarX: number,
  dt: number,
): number {
  const diff = targetAvatarX - avatarX
  if (Math.abs(diff) < 0.001) {
    return targetAvatarX
  }

  return avatarX + diff * Math.min(1, dt * LANE_TRANSITION_SPEED)
}

export function computeSpeed(elapsed: number): number {
  const tenSecIntervals = Math.floor(elapsed / 10000)
  return 1.0 + tenSecIntervals * SPEED_RAMP_RATE
}

export function applyCoinCollection(state: CoinCollectionState): CoinCollectionState & { scoreDelta: number } {
  let coinStreak = state.coinStreak + 1
  let multiplier = state.multiplier

  if (coinStreak >= STREAK_FOR_MULTIPLIER) {
    multiplier = Math.min(multiplier + 1, MAX_MULTIPLIER)
    coinStreak = 0
  }

  return {
    coinStreak,
    multiplier,
    scoreDelta: 10 * multiplier,
  }
}

export function updateGameOverActionState(state: GameOverActionState): GameOverActionUpdate {
  if (state.screen !== 'game_over') {
    return {
      action: null,
      startedAt: 0,
      progress: 0,
      resolvedAction: null,
    }
  }

  if (state.confidence < 0.5 || state.lane === null || state.lane === 'center') {
    return {
      action: null,
      startedAt: 0,
      progress: 0,
      resolvedAction: null,
    }
  }

  const action: GameOverAction = state.lane === 'left' ? 'menu' : 'replay'
  if (state.gameOverAction !== action) {
    return {
      action,
      startedAt: state.now,
      progress: 0,
      resolvedAction: null,
    }
  }

  const elapsed = state.now - state.gameOverActionStartedAt
  const progress = Math.min(1, elapsed / GAME_OVER_ACTION_HOLD_MS)
  return {
    action,
    startedAt: state.gameOverActionStartedAt,
    progress,
    resolvedAction: progress >= 1 ? action : null,
  }
}

export function resolveLifeLost(params: {
  lives: number
  score: number
  highScore: number
}): { lives: number; screen: 'playing' | 'game_over'; highScore: number; isNewHighScore: boolean } {
  const lives = params.lives - 1
  if (lives > 0) {
    return {
      lives,
      screen: 'playing',
      highScore: params.highScore,
      isNewHighScore: false,
    }
  }

  const isNewHighScore = params.score > params.highScore
  return {
    lives,
    screen: 'game_over',
    highScore: isNewHighScore ? params.score : params.highScore,
    isNewHighScore,
  }
}
