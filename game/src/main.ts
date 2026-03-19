import { GameState } from './game-state'
import { Renderer } from './renderer'
import { InputManager } from './input'
import { createObstaclePool, spawnObstacle, updateObstacles, checkCollisions } from './obstacles'
import { createCoinPool, spawnCoins, updateCoins, collectCoins } from './coins'
import { ComboDetector } from './combos'
import type { GameEvent } from './combos'
import { initAudio, playSound } from './audio'
import { loadProfiles, updateProfile } from './profiles'

const canvas = document.getElementById('game') as HTMLCanvasElement
const debugEl = document.getElementById('debug')!
const statusEl = document.getElementById('status')!

const state = new GameState()
const renderer = new Renderer(canvas)
const input = new InputManager(state)
const comboDetector = new ComboDetector()

// Load high score from profiles
const profiles = loadProfiles()
if (profiles.length > 0) {
  state.highScore = profiles[0].highScore
}

// Init pools
state.obstacles = createObstaclePool()
state.coins = createCoinPool()

// Connect and set up input
input.connect()
input.setupKeyboard()

// Init audio on first interaction
let audioReady = false
const ensureAudio = () => {
  if (!audioReady) {
    initAudio()
    audioReady = true
  }
}
window.addEventListener('keydown', ensureAudio, { once: true })
window.addEventListener('click', ensureAudio, { once: true })

// Timing
let frameCount = 0
let fpsTimer = 0
let lastTime = performance.now()

// Ball-lost grace period
const BALL_LOST_GRACE_MS = 1000

// Survival points timer
let lastSurvivalTick = 0

// Stickhandling points timer
let lastStickhandlingTick = 0

function update(now: number, dt: number): void {
  const viewportHeight = canvas.clientHeight || window.innerHeight || 1

  // Countdown → playing transition
  if (state.screen === 'countdown') {
    if (now >= state.countdownEnd) {
      state.beginPlaying()
      playSound('go')
    } else {
      const remaining = Math.ceil((state.countdownEnd - now) / 1000)
      const prev = Math.ceil((state.countdownEnd - (now - dt)) / 1000)
      if (remaining !== prev && remaining > 0) {
        playSound('countdown')
      }
    }
  }

  if (state.screen === 'playing') {
    state.elapsed = now - state.startTime
    state.updateSpeed()

    // Ball-lost detection
    if (state.trackerConnected && state.lastInputTime > 0) {
      const timeSinceInput = now - state.lastInputTime
      if (timeSinceInput > BALL_LOST_GRACE_MS && state.confidence < 0.5) {
        state.screen = 'paused'
      }
    }

    // Update positions
    state.updatePosition(dt)

    // Spawn & update obstacles
    spawnObstacle(state, now)
    updateObstacles(state, dt, viewportHeight)

    // Spawn & update coins
    spawnCoins(state, now)
    updateCoins(state, dt, viewportHeight)

    // Check collisions
    const collisionResult = checkCollisions(state, now)
    const events: GameEvent[] = []

    if (collisionResult === 'hit') {
      playSound('hit')
      if (state.lives > 0) {
        playSound('life_lost')
      } else {
        playSound('game_over')
        // Save score
        const name = state.playerName || 'Player'
        updateProfile(name, state.score)
      }
      state.breakStreak()
    } else if (collisionResult === 'deke_success') {
      playSound('deke')
      state.addScore(25) // Bonus for deking through
      events.push({ type: 'deke_success', time: now })
    }

    // Collect coins
    const collected = collectCoins(state)
    if (collected > 0) {
      playSound('coin')
      for (let i = 0; i < collected; i++) {
        events.push({ type: 'coin_collected', time: now, lane: state.lane })
      }
    }

    // Check combos
    for (const event of events) {
      const combo = comboDetector.check(state, event)
      if (combo) {
        playSound('combo')
      }
    }

    // Stickhandling scoring
    if (state.stickhandlingActive && state.screen === 'playing') {
      if (now - lastStickhandlingTick >= 1000) {
        // Base: 5 pts/sec, doubles at 4+ Hz
        const rate = state.stickhandlingFrequency >= 4.0 ? 10 : 5
        state.addScore(rate)
        lastStickhandlingTick = now
      }

      // Silky Mitts check
      if (
        state.stickhandlingStreakStart > 0 &&
        !state.silkyMittsAwarded &&
        now - state.stickhandlingStreakStart >= GameState.SILKY_MITTS_THRESHOLD_MS
      ) {
        state.silkyMittsAwarded = true
        state.addScore(50)
        state.comboText = 'SILKY MITTS!'
        state.comboTextUntil = now + 2000
        playSound('silky_mitts')
      }
    } else {
      lastStickhandlingTick = now
    }

    // Survival bonus: +1 point per second
    if (now - lastSurvivalTick >= 1000) {
      state.score += 1
      lastSurvivalTick = now
    }

    // Deke active state (for rendering)
    if (state.dekeActive && now > state.dekeInvincibleUntil) {
      state.dekeActive = false
    }
  }

  // Resume from pause
  if (state.screen === 'paused') {
    if (state.confidence >= 0.5) {
      const timeSinceInput = now - state.lastInputTime
      if (timeSinceInput < 200) {
        state.screen = 'playing'
      }
    }
  }

  // Input rate
  input.updateInputRate(now)

  // FPS
  frameCount++
  if (now - fpsTimer >= 1000) {
    state.fps = frameCount
    frameCount = 0
    fpsTimer = now
  }
  state.inputRate = input.inputRate
}

function renderDebugInfo(): void {
  if (state.screen === 'playing' || state.screen === 'countdown') {
    debugEl.textContent = ''
    return
  }

  const lines = [
    `FPS: ${state.fps}`,
    `Input: ${state.inputRate} msg/s`,
  ]

  if (state.trackerConnected) {
    lines.push(`Conf: ${state.confidence.toFixed(2)}`)
    lines.push(`Latency: ~${Math.abs(state.latency).toFixed(0)}ms`)
  }

  debugEl.textContent = lines.join('\n')

  if (state.trackerConnected) {
    statusEl.textContent = '● Tracker'
    statusEl.className = 'connected'
  } else {
    statusEl.textContent = '○ Keyboard'
    statusEl.className = 'waiting'
  }
}

function gameLoop(now: number): void {
  const dt = Math.min(now - lastTime, 50) // Cap dt to prevent huge jumps
  lastTime = now

  update(now, dt)
  renderer.render(state, dt)
  renderDebugInfo()

  requestAnimationFrame(gameLoop)
}

requestAnimationFrame(gameLoop)
console.log('[puck-runner] Phase 2 ready — press SPACE to start')
