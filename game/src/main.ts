import { GameState } from './game-state'
import { Renderer } from './renderer'
import { InputManager } from './input'
import { createObstaclePool, spawnObstacle, updateObstacles, checkCollisions } from './obstacles'
import { createCoinPool, spawnCoins, updateCoins, collectCoins } from './coins'
import { ComboDetector } from './combos'
import type { GameEvent } from './combos'
import { initAudio, playSound, muteAudio, unmuteAudio } from './audio'
import { loadProfiles, updateProfile } from './profiles'
import { Announcer, announceGameStart, announceFirstCoin, announceMultiplier5x, announceDekeSuccess, announceCombo, announceHitObstacle, announceGameOver, announceNewHighScore, announceSpeedMilestone, announceLifeLost, announceDekeUnlocked } from './announcer'
import { createOverlay, updateOverlay } from './ui-overlay'

const canvas = document.getElementById('game') as HTMLCanvasElement

const state = new GameState()
const renderer = new Renderer(canvas)
const input = new InputManager(state)
const comboDetector = new ComboDetector()
const announcer = new Announcer()

// Load high score from profiles
const profiles = loadProfiles()
if (profiles.length > 0) {
  state.highScore = Math.max(...profiles.map(p => p.highScore))
}

// Init pools
state.obstacles = createObstaclePool()
state.coins = createCoinPool()

// Connect and set up input
input.connect()
input.setupKeyboard()

// Create UI overlay
createOverlay()

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
let lastTime = performance.now()
let frameCount = 0
let fpsTimer = 0

// Gameplay timers
let lastSurvivalTick = 0
let lastStickhandlingTick = 0
let lastSpeedMilestone = 1.0
let firstCoinAnnounced = false
let dekeUnlockAnnounced = false

// Ball-lost grace period
const BALL_LOST_GRACE_MS = 1000

function update(now: number, dt: number): void {
  const viewportHeight = canvas.clientHeight || window.innerHeight || 1

  // Countdown → playing transition
  if (state.screen === 'countdown') {
    if (now >= state.countdownEnd) {
      state.beginPlaying()
      unmuteAudio()
      playSound('go')
      announceGameStart(announcer)
      firstCoinAnnounced = false
      dekeUnlockAnnounced = false
      lastSpeedMilestone = 1.0
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
        announceLifeLost(announcer)
      } else {
        playSound('game_over')
        muteAudio() // silence after game over sound
        announceGameOver(announcer)
        if (state.score >= state.highScore && state.score > 0) {
          announceNewHighScore(announcer)
        }
        const name = state.playerName || 'Player'
        updateProfile(name, state.score)
      }
      state.breakStreak()
    } else if (collisionResult === 'deke_success') {
      playSound('deke')
      state.addScore(25)
      events.push({ type: 'deke_success', time: now })
      announceDekeSuccess(announcer)
    }

    // Collect coins
    const collected = collectCoins(state)
    if (collected > 0) {
      playSound('coin')
      if (!firstCoinAnnounced) {
        announceFirstCoin(announcer)
        firstCoinAnnounced = true
      }
      for (let i = 0; i < collected; i++) {
        events.push({ type: 'coin_collected', time: now, lane: state.lane })
      }
    }

    // 5x multiplier announcement
    if (state.multiplier >= 5) {
      announceMultiplier5x(announcer)
    }

    // Check combos
    for (const event of events) {
      const combo = comboDetector.check(state, event)
      if (combo) {
        playSound('combo')
        announceCombo(announcer, combo)
      }
    }

    // Stickhandling scoring
    if (state.stickhandlingActive && state.screen === 'playing') {
      if (now - lastStickhandlingTick >= 1000) {
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

    // Deke active state
    if (state.dekeActive && now > state.dekeInvincibleUntil) {
      state.dekeActive = false
    }

    // Speed milestone announcements
    if (state.speed >= lastSpeedMilestone + 0.5) {
      lastSpeedMilestone = Math.floor(state.speed * 2) / 2
      announceSpeedMilestone(announcer)
    }

    // Deke unlock announcement
    if (state.isDekeUnlocked && !dekeUnlockAnnounced) {
      dekeUnlockAnnounced = true
      announceDekeUnlocked(announcer)
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

  // Announcer update
  announcer.update(now)

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

function gameLoop(now: number): void {
  const dt = Math.min(now - lastTime, 50)
  lastTime = now

  update(now, dt)
  renderer.render(state, dt)
  updateOverlay(state, announcer)

  requestAnimationFrame(gameLoop)
}

requestAnimationFrame(gameLoop)
console.log('[puck-runner] Phase 3 ready — press SPACE to start')
