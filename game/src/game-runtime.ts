import type { Announcer } from './announcer'
import { playSound, unmuteAudio } from './audio'
import { spawnCoins, updateCoins } from './coins'
import type { GameState } from './game-state'
import type { InputManager } from './input'
import { checkCollisions, spawnObstacle, updateObstacles } from './obstacles'
import {
  BALL_LOST_GRACE_MS,
  PAUSE_RESUME_INPUT_WINDOW_MS,
  TRACKING_CONFIDENCE_MIN,
} from './runtime-config'
import type { RunScoringSystem } from './run-scoring-system'
import type { TutorialSession } from './tutorial-session'

interface GameRuntimeDependencies {
  announcer: Pick<Announcer, 'announce' | 'update'>
  input: Pick<InputManager, 'processBufferedInput' | 'updateInterpolatedPosition' | 'updateInputRate' | 'inputRate'>
  scoring: Pick<RunScoringSystem, 'update'>
  tutorial: Pick<TutorialSession, 'update'>
}

export class GameRuntime {
  private frameCount = 0
  private fpsTimer = 0

  constructor(
    private readonly state: GameState,
    private readonly canvas: Pick<HTMLCanvasElement, 'clientHeight'>,
    private readonly deps: GameRuntimeDependencies,
  ) {}

  update(now: number, dt: number): void {
    this.state.syncTime(now)
    this.deps.input.processBufferedInput(now)
    this.deps.input.updateInterpolatedPosition(now)
    const viewportHeight = this.canvas.clientHeight || window.innerHeight || 1

    if (this.state.screen === 'tutorial') {
      this.deps.tutorial.update(now, dt, viewportHeight)
      this.finalizeFrame(now)
      return
    }

    if (this.state.screen === 'countdown') {
      this.updateCountdown(now, dt)
    }

    if (this.state.screen === 'playing') {
      this.updatePlaying(now, dt, viewportHeight)
    }

    if (this.state.screen === 'paused') {
      this.updatePaused(now)
    }

    this.finalizeFrame(now)
  }

  private finalizeFrame(now: number): void {
    this.deps.announcer.update(now)
    this.updatePerformanceMetrics(now)
  }

  private updateCountdown(now: number, dt: number): void {
    if (now >= this.state.countdownEnd) {
      this.state.beginPlaying(now)
      unmuteAudio()
      playSound('go')
      this.deps.announcer.announce('🏒 Drop the puck!', null, 5)
      return
    }

    const remaining = Math.ceil((this.state.countdownEnd - now) / 1000)
    const prev = Math.ceil((this.state.countdownEnd - (now - dt)) / 1000)
    if (remaining !== prev && remaining > 0) {
      playSound('countdown')
    }
  }

  private updatePlaying(now: number, dt: number, viewportHeight: number): void {
    this.state.elapsed = now - this.state.startTime
    this.state.updateSpeed()

    if (this.shouldPauseForLostTracking(now)) {
      this.state.screen = 'paused'
    }

    this.state.updatePosition(dt)

    spawnObstacle(this.state, now)
    updateObstacles(this.state, dt, viewportHeight)
    spawnCoins(this.state, now)
    updateCoins(this.state, dt, viewportHeight)
    this.deps.scoring.update(now, checkCollisions(this.state, now))
  }

  private shouldPauseForLostTracking(now: number): boolean {
    if (!this.state.trackerConnected || this.state.lastInputTime <= 0) {
      return false
    }

    const timeSinceInput = now - this.state.lastInputTime
    return timeSinceInput > BALL_LOST_GRACE_MS && this.state.confidence < TRACKING_CONFIDENCE_MIN
  }

  private updatePaused(now: number): void {
    if (this.state.confidence < TRACKING_CONFIDENCE_MIN) {
      return
    }

    const timeSinceInput = now - this.state.lastInputTime
    if (timeSinceInput < PAUSE_RESUME_INPUT_WINDOW_MS) {
      this.state.screen = 'playing'
    }
  }

  private updatePerformanceMetrics(now: number): void {
    this.deps.input.updateInputRate(now)

    this.frameCount++
    if (now - this.fpsTimer >= 1000) {
      this.state.fps = this.frameCount
      this.frameCount = 0
      this.fpsTimer = now
    }
    this.state.inputRate = this.deps.input.inputRate
  }
}
