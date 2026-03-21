import type { TrackingInput } from '@shared/protocol'
import type { GameState } from './game-state'
import {
  resolveControllableTracking,
  resolveGameOverActionLane,
} from './input-rules'
import { KalmanAxis } from './kalman'
import { LatencyProfiler } from './latency-profiler'
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

interface InputManagerOptions {
  onLatencyExportRequested?: () => void
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
  private clockSyncTimer: number | null = null

  // Deke tracking
  private prevDeke = false

  // Kalman filters for position prediction (one per axis)
  private kalmanX: KalmanAxis | null = null
  private kalmanY: KalmanAxis | null = null
  private lastKalmanTime = 0

  // Jitter buffer (disabled by default)
  private readonly jitterBuffer: JitterBuffer<TrackingInput>
  private readonly latencyProfiler = new LatencyProfiler()

  constructor(
    private readonly state: GameState,
    private readonly options: InputManagerOptions = {},
  ) {
    this.jitterBuffer = new JitterBuffer(options.jitterBufferMs ?? 0)
    this.trackerConnection = new TrackerConnection({
      onTrackingInput: (input, recvTs) => this.receiveTrackingInput(input, recvTs),
      onClockSyncResponse: (message, recvTs) => {
        this.latencyProfiler.recordClockSyncResponse(message, recvTs)
        this.state.latencyBreakdown = this.latencyProfiler.getStatusText()
      },
      onTrackerConnected: () => {
        this.state.trackerConnected = true
      },
      onTrackerDisconnected: () => {
        this.state.trackerConnected = false
        this.state.latencyBreakdown = ''
      },
    })
    this.keyboardInput = new KeyboardInput(this.state, {
      onLatencyExportRequested: options.onLatencyExportRequested,
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
    this.startClockSync()
  }

  /** Route incoming input through jitter buffer or process immediately. */
  private receiveTrackingInput(input: TrackingInput, recvTs: number): void {
    this.latencyProfiler.recordReceived(input, recvTs)
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
    this.state.latency = this.latencyProfiler.hasClockSync()
      ? this.state.latency
      : (Date.now() - input.ts)
    this.latencyProfiler.recordApplied(input, now)
    this.state.latencyBreakdown = this.latencyProfiler.getStatusText()

    // Feed Kalman filter with measurement (confidence scales noise)
    this.updateKalman(input.raw.x, input.raw.y, input.confidence, now)

    if (this.state.screen === 'game_over') {
      this.handleGameOverInput(input, now)
      this.prevDeke = input.deke
      this.inputCount++
      return
    }

    const trackingResolution = resolveControllableTracking({
      screen: this.state.screen,
      confidence: input.confidence,
      inputDeke: input.deke,
      prevDeke: this.prevDeke,
      stickhandlingActive: input.stickhandling.active,
      stickhandlingFrequency: input.stickhandling.frequency,
      stickhandlingStreakStart: this.state.stickhandlingStreakStart,
      silkyMittsAwarded: this.state.silkyMittsAwarded,
      now,
    })

    if (trackingResolution.shouldApplyControls) {
      this.state.setLane(input.lane, now)

      if (trackingResolution.shouldTriggerDeke) {
        this.state.activateDeke(now)
      }

      this.state.stickhandlingActive = trackingResolution.stickhandlingActive
      this.state.stickhandlingFrequency = trackingResolution.stickhandlingFrequency
      this.state.stickhandlingStreakStart = trackingResolution.stickhandlingStreakStart
      this.state.silkyMittsAwarded = trackingResolution.silkyMittsAwarded
    }

    this.prevDeke = input.deke
    this.inputCount++
  }

  private handleGameOverInput(input: TrackingInput, now: number): void {
    const action = this.state.updateGameOverAction(
      resolveGameOverActionLane(input.lane, input.confidence),
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

  recordRenderedFrame(now: number): void {
    const snapshot = this.latencyProfiler.finalizeRenderedSamples(now)
    if (!snapshot) return

    this.state.latency = snapshot.average.totalMs
    this.state.latencyBreakdown = snapshot.summaryText
  }

  exportLatencyCsv(): void {
    const exported = this.latencyProfiler.downloadCsv()
    this.state.latencyBreakdown = exported
      ? `${this.latencyProfiler.getStatusText()} | EXPORTED CSV`
      : 'LAT no samples to export yet'
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
    if (this.clockSyncTimer !== null) {
      clearInterval(this.clockSyncTimer)
      this.clockSyncTimer = null
    }
    this.trackerConnection.destroy()
    this.keyboardInput.destroy()
    this.resetTrackingState()
  }

  private startClockSync(): void {
    if (this.clockSyncTimer !== null) return

    const sendSync = () => {
      this.trackerConnection.send(
        this.latencyProfiler.createClockSyncRequest(performance.now()),
      )
    }

    sendSync()
    this.clockSyncTimer = window.setInterval(sendSync, 2000)
  }
}
