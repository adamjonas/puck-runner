import type { TrackingInput, Lane } from '@shared/protocol'
import type { GameState } from './game-state'

/**
 * Input manager: handles WebSocket input from iPhone tracker + keyboard fallback.
 *
 * Input flow:
 *   iPhone ──WS──▶ Vite relay ──WS──▶ InputManager ──▶ GameState
 *   Keyboard ──────────────────────────▶ InputManager ──▶ GameState
 */

interface InputSample {
  x: number
  y: number
  lane: Lane
  deke: boolean
  confidence: number
  ts: number
  serverTs: number
}

export class InputManager {
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private reconnectDelay = 1000
  private readonly maxReconnectDelay = 10000

  private prev: InputSample | null = null
  private curr: InputSample | null = null

  private inputCount = 0
  private inputRateTimer = 0
  private _inputRate = 0

  private keyboardLane: Lane = 'center'

  // Deke tracking
  private prevDeke = false

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
      this.reconnectDelay = 1000
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

    this.ws.onerror = () => {}
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      this.connect()
    }, this.reconnectDelay)
  }

  private handleTrackingInput(input: TrackingInput): void {
    const now = performance.now()
    this.state.syncTime(now)

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
    this.state.latency = now - input.ts

    if (this.state.screen === 'game_over') {
      const action = this.state.updateGameOverAction(
        input.confidence >= 0.5 ? input.lane : null,
        input.confidence,
      )
      if (action === 'replay') {
        this.keyboardLane = 'center'
        this.state.start(now)
      } else if (action === 'menu') {
        this.keyboardLane = 'center'
        this.state.reset()
      }
      this.prevDeke = input.deke
      this.inputCount++
      return
    }

    if (input.confidence >= 0.5 && this.state.screen === 'playing') {
      this.state.setLane(input.lane, now)

      // Deke: trigger on rising edge (false → true)
      if (input.deke && !this.prevDeke) {
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

  updateInputRate(now: number): void {
    if (now - this.inputRateTimer >= 1000) {
      this._inputRate = this.inputCount
      this.inputCount = 0
      this.inputRateTimer = now
    }
  }

  setupKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (this.state.screen === 'game_over') {
        if (e.key === 'Escape' || e.key.toLowerCase() === 'm') {
          e.preventDefault()
          this.state.reset()
          this.keyboardLane = 'center'
          return
        }
      }

      // Start game from title or game over (but not if tutorial just started)
      if (this.state.screen === 'title' || this.state.screen === 'game_over') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          if (!this.state.tutorialActive) {
            this.state.start(performance.now())
            this.keyboardLane = 'center'
          }
          return
        }
      }

      if (this.state.screen !== 'playing' && this.state.screen !== 'tutorial') return

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          if (this.keyboardLane === 'right') this.keyboardLane = 'center'
          else if (this.keyboardLane === 'center') this.keyboardLane = 'left'
          this.state.setLane(this.keyboardLane, performance.now())
          break
        case 'ArrowRight':
          e.preventDefault()
          if (this.keyboardLane === 'left') this.keyboardLane = 'center'
          else if (this.keyboardLane === 'center') this.keyboardLane = 'right'
          this.state.setLane(this.keyboardLane, performance.now())
          break
        case 'ArrowDown':
          e.preventDefault()
          this.state.activateDeke(performance.now())
          break
        case 's':
        case 'S':
          // Simulate stickhandling toggle (for testing without tracker)
          e.preventDefault()
          this.state.stickhandlingActive = !this.state.stickhandlingActive
          if (this.state.stickhandlingActive) {
            this.state.stickhandlingFrequency = 3.0
            if (this.state.stickhandlingStreakStart === 0) {
              this.state.stickhandlingStreakStart = performance.now()
            }
          } else {
            this.state.stickhandlingFrequency = 0
            this.state.stickhandlingStreakStart = 0
            this.state.silkyMittsAwarded = false
          }
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
