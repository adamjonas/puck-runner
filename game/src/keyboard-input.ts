import type { Lane } from '@shared/protocol'
import type { GameState } from './game-state'
import { shouldSuppressGlobalKeydown } from './dom-utils'

interface KeyboardInputOptions {
  onLatencyExportRequested?: () => void
  onStartRequested?: (now: number) => void
  onMenuRequested?: () => void
}

export class KeyboardInput {
  private keyboardLane: Lane = 'center'
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null

  constructor(
    private readonly state: GameState,
    private readonly options: KeyboardInputOptions = {},
  ) {}

  setup(): void {
    if (this.keydownHandler) return

    this.keydownHandler = (e) => {
      if (shouldSuppressGlobalKeydown(e.target, e.key)) return

      if (e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        this.options.onLatencyExportRequested?.()
        return
      }

      if (this.state.screen === 'game_over') {
        if (e.key === 'Escape' || e.key.toLowerCase() === 'm') {
          e.preventDefault()
          if (this.options.onMenuRequested) {
            this.options.onMenuRequested()
          } else {
            this.state.reset()
          }
          this.reset()
          return
        }
      }

      if (this.state.screen === 'title' || this.state.screen === 'game_over') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          if (!this.state.tutorialActive) {
            const now = performance.now()
            if (this.options.onStartRequested) {
              this.options.onStartRequested(now)
            } else {
              this.state.start(now)
            }
            this.reset()
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
    }

    window.addEventListener('keydown', this.keydownHandler)
  }

  reset(): void {
    this.keyboardLane = 'center'
  }

  destroy(): void {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler)
      this.keydownHandler = null
    }
  }
}
