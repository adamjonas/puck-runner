import type { TrackingInput } from '@shared/protocol'
import type { GameState } from './game-state'
import { KalmanAxis } from './kalman'
import { JitterBuffer } from './jitter-buffer'
import { KeyboardInput } from './keyboard-input'
import { TrackerConnection } from './tracker-connection'

/**
 * Input manager: handles WebSocket input from iPhone tracker + keyboard fallback.
 *
 * Input flow:
 *   iPhone ──WS──▶ Vite relay ──WS──▶ InputManager ──▶ GameState
 *   Keyboard ──────────────────────────▶ InputManager ──▶ GameState
 *
 * Pipeline: WS → JitterBuffer → Kalman update → state
 * Each frame: Kalman predict → state.rawX/rawY
 */

/** Minimum confidence to accept any input (below = ball lost) */
const CONFIDENCE_MIN = 0.15

interface InputManagerOptions {
  onStartRequested?: (now: number) => void
  onReplayRequested?: (now: number) => void
  onMenuRequested?: () => void
  /** Jitter buffer delay in ms. 0 = disabled (default). */
  jitterBufferMs?: number
}

export class InputManager {
  private inputCount = 0
  private inputRateTimer = 0
  private _inputRate = 0

  // Deke tracking
  private prevDeke = false

  // Kalman filters for position prediction (one per axis)
  private kalmanX: KalmanAxis | null = null
  private kalmanY: KalmanAxis | null = null
  private lastKalmanTime = 0

  // Jitter buffer (disabled by default)
  private readonly jitterBuffer: JitterBuffer<TrackingInput>

  constructor(
    private readonly state: GameState,
    private readonly options: InputManagerOptions = {},
  ) {
    this.jitterBuffer = new JitterBuffer(options.jitterBufferMs ?? 0)
    this.trackerConnection = new TrackerConnection({
      onTrackingInput: (input) => this.receiveTrackingInput(input),
      onTrackerConnected: () => { this.state.trackerConnected = true },
      onTrackerDisconnected: () => { this.state.trackerConnected = false },
    })
    this.keyboardInput = new KeyboardInput(this.state, {
      onStartRequested: options.onStartRequested,
      onMenuRequested: options.onMenuRequested,
    })
  }

  private readonly trackerConnection: TrackerConnection
  private readonly keyboardInput: KeyboardInput

  get inputRate(): number {
    return this._inputRate
  }

  connect(): void {
    this.trackerConnection.connect()
  }

  /** Route incoming input through jitter buffer or process immediately. */
  private receiveTrackingInput(input: TrackingInput): void {
    if (this.jitterBuffer.enabled) {
      this.jitterBuffer.push(input, performance.now())
    } else {
      this.handleTrackingInput(input)
    }
  }

  /** Consume any buffered samples. Call from game loop before updateInterpolatedPosition. */
  processBufferedInput(now: number): void {
    if (!this.jitterBuffer.enabled) return
    for (const input of this.jitterBuffer.consume(now)) {
      this.handleTrackingInput(input)
    }
  }

  private handleTrackingInput(input: TrackingInput): void {
    const now = performance.now()
    this.state.syncTime(now)

    this.state.trackerConnected = true
    this.state.lastInputTime = now
    this.state.confidence = input.confidence
    this.state.rawX = input.raw.x
    this.state.rawY = input.raw.y
    this.state.latency = Date.now() - input.ts

    // Feed Kalman filter with measurement (confidence scales noise)
    this.updateKalman(input.raw.x, input.raw.y, input.confidence, now)

    if (this.state.screen === 'game_over') {
      this.handleGameOverInput(input, now)
      this.prevDeke = input.deke
      this.inputCount++
      return
    }

    const isControllableScreen = this.state.screen === 'playing' || this.state.screen === 'tutorial'

    if (input.confidence >= CONFIDENCE_MIN && isControllableScreen) {
      this.state.setLane(input.lane, now)

      // Deke: trigger on rising edge (false → true)
      if (this.state.screen === 'playing' && input.deke && !this.prevDeke) {
        this.state.activateDeke(now)
      }

      // Stickhandling
      this.state.stickhandlingActive = input.stickhandling.active
      this.state.stickhandlingFrequency = input.stickhandling.frequency

      if (input.stickhandling.active) {
        if (this.state.stickhandlingStreakStart === 0) {
          this.state.stickhandlingStreakStart = now
        }
      } else {
        this.state.stickhandlingStreakStart = 0
        this.state.silkyMittsAwarded = false
      }
    }

    this.prevDeke = input.deke
    this.inputCount++
  }

  private handleGameOverInput(input: TrackingInput, now: number): void {
    const action = this.state.updateGameOverAction(
      input.confidence >= CONFIDENCE_MIN ? input.lane : null,
      input.confidence,
    )

    if (action === 'replay') {
      this.keyboardInput.reset()
      if (this.options.onReplayRequested) {
        this.options.onReplayRequested(now)
      } else {
        this.state.start(now)
      }
      return
    }

    if (action === 'menu') {
      this.keyboardInput.reset()
      if (this.options.onMenuRequested) {
        this.options.onMenuRequested()
      } else {
        this.state.reset()
      }
    }
  }

  /** Initialize or update Kalman filters with a new measurement. */
  private updateKalman(x: number, y: number, confidence: number, now: number): void {
    if (!this.kalmanX || !this.kalmanY) {
      this.kalmanX = new KalmanAxis(x)
      this.kalmanY = new KalmanAxis(y)
      this.lastKalmanTime = now
      return
    }

    // Predict to current time
    const dt = (now - this.lastKalmanTime) / 1000 // convert ms to seconds
    if (dt > 0) {
      this.kalmanX.predict(dt)
      this.kalmanY.predict(dt)
    }
    this.lastKalmanTime = now

    // Update with measurement (confidence scales noise)
    this.kalmanX.update(x, confidence)
    this.kalmanY.update(y, confidence)
  }

  getInterpolatedPosition(now: number): { x: number; y: number } | null {
    if (!this.kalmanX || !this.kalmanY) return null

    const dt = (now - this.lastKalmanTime) / 1000
    return {
      x: this.kalmanX.position + this.kalmanX.velocity * dt,
      y: this.kalmanY.position + this.kalmanY.velocity * dt,
    }
  }

  updateInterpolatedPosition(now: number): void {
    const pos = this.getInterpolatedPosition(now)
    if (pos) {
      this.state.rawX = pos.x
      this.state.rawY = pos.y
    }
  }

  updateInputRate(now: number): void {
    if (now - this.inputRateTimer >= 1000) {
      this._inputRate = this.inputCount
      this.inputCount = 0
      this.inputRateTimer = now
    }
  }

  setupKeyboard(): void {
    this.keyboardInput.setup()
  }

  resetTrackingState(): void {
    this.kalmanX = null
    this.kalmanY = null
    this.lastKalmanTime = 0
    this.prevDeke = false
    this.jitterBuffer.reset()
    this.keyboardInput.reset()
  }

  destroy(): void {
    this.trackerConnection.destroy()
    this.keyboardInput.destroy()
    this.resetTrackingState()
  }
}
