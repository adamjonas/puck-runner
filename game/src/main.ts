import { GameState } from './game-state'
import { Renderer } from './renderer'
import { InputManager } from './input'

/**
 * Main entry point — game loop.
 *
 * Loop:
 *   requestAnimationFrame → update(dt) → render(state) → repeat
 */

const canvas = document.getElementById('game') as HTMLCanvasElement
const debugEl = document.getElementById('debug')!
const statusEl = document.getElementById('status')!

const state = new GameState()
const renderer = new Renderer(canvas)
const input = new InputManager(state)

// Connect to WS relay and set up keyboard fallback
input.connect()
input.setupKeyboard()

// FPS tracking
let frameCount = 0
let fpsTimer = 0
let lastTime = performance.now()

// Ball-lost grace period (1 second grace, then freeze)
const BALL_LOST_GRACE_MS = 1000

function update(now: number, dt: number): void {
  if (state.screen === 'playing') {
    state.elapsed = now - state.startTime

    // Ball-lost detection: if tracker is connected but no input for >1s, pause
    if (state.trackerConnected && state.lastInputTime > 0) {
      const timeSinceInput = now - state.lastInputTime
      if (timeSinceInput > BALL_LOST_GRACE_MS && state.confidence < 0.5) {
        state.screen = 'paused'
      }
    }

    // Smooth avatar position toward target lane
    state.updatePosition(dt)
  }

  if (state.screen === 'paused') {
    // Resume if we get fresh input with good confidence
    if (state.confidence >= 0.5) {
      const timeSinceInput = performance.now() - state.lastInputTime
      if (timeSinceInput < 200) {
        state.screen = 'playing'
      }
    }
  }

  // Update input rate measurement
  input.updateInputRate(now)

  // FPS measurement
  frameCount++
  if (now - fpsTimer >= 1000) {
    state.fps = frameCount
    frameCount = 0
    fpsTimer = now
  }
  state.inputRate = input.inputRate
}

function renderDebugInfo(): void {
  const lines = [
    `FPS: ${state.fps}`,
    `Input: ${state.inputRate} msg/s`,
    `Lane: ${state.lane}`,
    `Avatar X: ${state.avatarX.toFixed(3)}`,
  ]

  if (state.trackerConnected) {
    lines.push(`Raw: (${state.rawX.toFixed(2)}, ${state.rawY.toFixed(2)})`)
    lines.push(`Confidence: ${state.confidence.toFixed(2)}`)
    lines.push(`Latency: ~${Math.abs(state.latency).toFixed(0)}ms`)
  }

  if (state.screen === 'playing') {
    lines.push(`Time: ${(state.elapsed / 1000).toFixed(1)}s`)
  }

  debugEl.textContent = lines.join('\n')

  // Connection status
  if (state.trackerConnected) {
    statusEl.textContent = '● Tracker connected'
    statusEl.className = 'connected'
  } else {
    statusEl.textContent = '○ Keyboard mode (← →)'
    statusEl.className = 'waiting'
  }
}

function gameLoop(now: number): void {
  const dt = now - lastTime
  lastTime = now

  update(now, dt)
  renderer.render(state, dt)
  renderDebugInfo()

  requestAnimationFrame(gameLoop)
}

// Start loop
requestAnimationFrame(gameLoop)

console.log('[puck-runner] Phase 1 PoC started')
console.log('[puck-runner] Use arrow keys ← → to test lane switching')
console.log('[puck-runner] Press SPACE or ENTER to start')
