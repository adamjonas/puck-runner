import type { Lane } from '@shared/protocol'
import type { GameState } from './game-state'

export enum TutorialStep {
  LANES = 0,
  OBSTACLES = 1,
  COINS = 2,
  STICKHANDLING = 3,
  READY = 4,
}

const STEP_NAMES: Record<TutorialStep, string> = {
  [TutorialStep.LANES]: 'LANES',
  [TutorialStep.OBSTACLES]: 'OBSTACLES',
  [TutorialStep.COINS]: 'COINS',
  [TutorialStep.STICKHANDLING]: 'STICKHANDLING',
  [TutorialStep.READY]: 'READY',
}

const OVERLAY_TEXT: Record<TutorialStep, string> = {
  [TutorialStep.LANES]: '🏒 Move left and right to switch lanes!',
  [TutorialStep.OBSTACLES]: '⚠️ Dodge the obstacles! Switch lanes to avoid them',
  [TutorialStep.COINS]: '💰 Collect coins for points! Move to the coin lane',
  [TutorialStep.STICKHANDLING]: '🏒 Stickhandle for bonus points!',
  [TutorialStep.READY]: '🎯 You\'re ready! Let\'s go!',
}

const OVERLAY_TEXT_KEYBOARD: Partial<Record<TutorialStep, string>> = {
  [TutorialStep.STICKHANDLING]: '🏒 Press S to stickhandle for bonus points!',
}

const STICKHANDLE_POINTS_PER = 5
const STICKHANDLING_DURATION_REQUIRED = 3000

export class TutorialManager {
  private step = TutorialStep.LANES
  private state: GameState | null = null

  // Step 1: LANES tracking
  private lanesVisited = new Set<Lane>()

  // Step 2: OBSTACLES tracking
  private obstaclesDodged = 0

  // Step 3: COINS tracking
  private coinsCollected = 0

  // Step 4: STICKHANDLING tracking
  private stickhandleCount = 0
  private stickhandlePointsAccum = 0
  private stickhandlingDurationMs = 0

  start(state: GameState): void {
    this.state = state
    this.step = TutorialStep.LANES
    this.lanesVisited.clear()
    this.obstaclesDodged = 0
    this.coinsCollected = 0
    this.stickhandleCount = 0
    this.stickhandlePointsAccum = 0
    this.stickhandlingDurationMs = 0
  }

  getStep(): TutorialStep {
    return this.step
  }

  getStepName(): string {
    return STEP_NAMES[this.step]
  }

  getStepIndex(): number {
    return this.step
  }

  getTotalSteps(_trackerConnected?: boolean): number {
    return 4 // LANES, OBSTACLES, COINS, STICKHANDLING (always shown)
  }

  getOverlayText(): string {
    if (!this.state?.trackerConnected) {
      const keyboardText = OVERLAY_TEXT_KEYBOARD[this.step]
      if (keyboardText) return keyboardText
    }
    return OVERLAY_TEXT[this.step]
  }

  isActive(): boolean {
    return this.step !== TutorialStep.READY
  }

  isComplete(): boolean {
    return this.step === TutorialStep.READY
  }

  getStickhandleCount(): number {
    return this.stickhandleCount
  }

  getStickhandlePoints(): number {
    return this.stickhandlePointsAccum
  }

  skip(): void {
    this.step = TutorialStep.READY
  }

  // --- Event handlers (called by the game loop) ---

  onLaneVisited(lane: Lane): void {
    if (this.step !== TutorialStep.LANES) return
    this.lanesVisited.add(lane)
    if (this.lanesVisited.size >= 3) {
      this.step = TutorialStep.OBSTACLES
    }
  }

  onObstacleDodged(): void {
    if (this.step !== TutorialStep.OBSTACLES) return
    this.obstaclesDodged++
    if (this.obstaclesDodged >= 2) {
      this.step = TutorialStep.COINS
    }
  }

  onCoinCollected(): void {
    if (this.step !== TutorialStep.COINS) return
    this.coinsCollected++
    if (this.coinsCollected >= 3) {
      this.advanceFromCoins()
    }
  }

  onStickhandle(): void {
    if (this.step !== TutorialStep.STICKHANDLING) return
    this.stickhandleCount++
    this.stickhandlePointsAccum += STICKHANDLE_POINTS_PER
  }

  onStickhandlingDuration(durationMs: number): void {
    if (this.step !== TutorialStep.STICKHANDLING) return
    this.stickhandlingDurationMs = durationMs
    if (durationMs >= STICKHANDLING_DURATION_REQUIRED) {
      this.step = TutorialStep.READY
    }
  }

  onStepTimeout(): void {
    if (this.step === TutorialStep.STICKHANDLING) {
      this.step = TutorialStep.READY
    }
  }

  // --- Internal ---

  private advanceFromCoins(): void {
    // Always show stickhandling step — keyboard players can use S key to simulate
    this.step = TutorialStep.STICKHANDLING
  }
}
