import type { TrackingInput, Lane } from '@shared/protocol'
import type { GameState } from './game-state'

/**
 * Input manager: handles WebSocket input from iPhone tracker + keyboard fallback.
 *
 * Input flow:
 *   iPhone ──WS──▶ Vite relay ──WS──▶ InputManager ──▶ GameState
 *   Keyboard ──────────────────────────▶ InputManager ──▶ GameState
 *
 * Interpolation: stores last two input positions + timestamps.
 * On each render frame, lerps between them for smooth 30Hz→60fps.
 */

interface InputSample {
  x: number
  y: number
  lane: Lane
  deke: boolean
  confidence: number
  ts: number // local timestamp (performance.now())
  serverTs: number // iPhone timestamp
}

export class InputManager {
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private reconnectDelay = 1000
  private readonly maxReconnectDelay = 10000

  private prev: InputSample | null = null
  private curr: InputSample | null = null

  // Input rate tracking
  private inputCount = 0
  private inputRateTimer = 0
  private _inputRate = 0

  // Keyboard state
  private keyboardLane: Lane = 'center'

  constructor(private state: GameState) {}

  get inputRate(): number {
    return this._inputRate
  }

  connect(): void {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${location.host}/ws/game`

    try {
      this.ws = new WebSocket(url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      console.log('[input] Connected to relay')
      this.reconnectDelay = 1000 // reset backoff
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'input') {
          this.handleTrackingInput(msg as TrackingInput)
        } else if (msg.type === 'tracker_connected') {
          this.state.trackerConnected = true
        } else if (msg.type === 'tracker_disconnected') {
          this.state.trackerConnected = false
        }
      } catch {
        // Drop malformed messages
      }
    }

    this.ws.onclose = () => {
      console.log('[input] Disconnected from relay')
      this.ws = null
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose will fire after this
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return
    console.log(`[input] Reconnecting in ${this.reconnectDelay}ms...`)
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      this.connect()
    }, this.reconnectDelay)
  }

  private handleTrackingInput(input: TrackingInput): void {
    const now = performance.now()

    this.prev = this.curr
    this.curr = {
      x: input.raw.x,
      y: input.raw.y,
      lane: input.lane,
      deke: input.deke,
      confidence: input.confidence,
      ts: now,
      serverTs: input.ts,
    }

    this.state.trackerConnected = true
    this.state.lastInputTime = now
    this.state.confidence = input.confidence
    this.state.rawX = input.raw.x
    this.state.rawY = input.raw.y
    this.state.latency = now - input.ts // approximate (clock skew exists)

    // Update lane from tracker
    if (input.confidence >= 0.5) {
      this.state.setLane(input.lane)
    }

    this.inputCount++
  }

  /** Interpolated raw position for rendering (30Hz→60fps) */
  getInterpolatedPosition(now: number): { x: number; y: number } | null {
    if (!this.curr) return null
    if (!this.prev) return { x: this.curr.x, y: this.curr.y }

    const inputInterval = this.curr.ts - this.prev.ts
    if (inputInterval <= 0) return { x: this.curr.x, y: this.curr.y }

    const elapsed = now - this.curr.ts
    const t = Math.min(1, elapsed / inputInterval)

    return {
      x: this.curr.x + (this.curr.x - this.prev.x) * t,
      y: this.curr.y + (this.curr.y - this.prev.y) * t,
    }
  }

  /** Update input rate measurement (call once per second) */
  updateInputRate(now: number): void {
    if (now - this.inputRateTimer >= 1000) {
      this._inputRate = this.inputCount
      this.inputCount = 0
      this.inputRateTimer = now
    }
  }

  /** Set up keyboard controls for testing without iPhone */
  setupKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (this.state.screen === 'title') {
        if (e.key === ' ' || e.key === 'Enter') {
          this.state.start()
          return
        }
      }

      if (this.state.screen !== 'playing') return

      switch (e.key) {
        case 'ArrowLeft':
          if (this.keyboardLane === 'right') this.keyboardLane = 'center'
          else if (this.keyboardLane === 'center') this.keyboardLane = 'left'
          this.state.setLane(this.keyboardLane)
          break
        case 'ArrowRight':
          if (this.keyboardLane === 'left') this.keyboardLane = 'center'
          else if (this.keyboardLane === 'center') this.keyboardLane = 'right'
          this.state.setLane(this.keyboardLane)
          break
      }
    })
  }

  destroy(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
    }
    this.ws?.close()
  }
}
