import { GameState } from './game-state'
import type { Lane } from '@shared/protocol'
import { Renderer } from './renderer'
import { InputManager } from './input'
import { createObstaclePool, spawnObstacle, updateObstacles, checkCollisions } from './obstacles'
import { createCoinPool, spawnCoins, updateCoins, collectCoins } from './coins'
import { ComboDetector } from './combos'
import type { GameEvent } from './combos'
import { initAudio, playSound, muteAudio, unmuteAudio } from './audio'
import { loadProfiles, updateProfile } from './profiles'
import { Announcer, announceGameStart, announceFirstCoin, announceMultiplier5x, announceDekeSuccess, announceCombo, announceGameOver, announceNewHighScore, announceSpeedMilestone, announceLifeLost, announceDekeUnlocked, announceTutorialLanes, announceTutorialObstacles, announceTutorialCoins, announceTutorialStickhandling } from './announcer'
import { TutorialManager, TutorialStep } from './tutorial'
import { OverlayController } from './ui-overlay'

const canvas = document.getElementById('game') as HTMLCanvasElement

const state = new GameState()
const renderer = new Renderer(canvas)
const input = new InputManager(state)
const comboDetector = new ComboDetector()
const announcer = new Announcer()
const tutorial = new TutorialManager()

// Track last tutorial step for announcements
let lastTutorialStep: TutorialStep | null = null

const startNewRun = (now: number) => {
  // Check if the player needs the tutorial
  const name = state.playerName
  if (name) {
    const profiles = loadProfiles()
    const profile = profiles.find(p => p.name.toLowerCase() === name.toLowerCase())
    if (profile && !profile.tutorialComplete) {
      // Enter tutorial mode
      state.syncTime(now)
      state.reset()
      state.screen = 'tutorial'
      state.tutorialActive = true
      state.startTime = now
      state.speed = 0.6 // slow speed for tutorial
      tutorial.start(state)
      lastTutorialStep = TutorialStep.LANES
      announceTutorialLanes(announcer)
      return
    }
  }
  state.start(now)
}
const returnToMainMenu = () => {
  state.reset()
}

/** Start tutorial mode directly (callable from UI overlay) */
export function startTutorial(): void {
  const now = performance.now()
  state.syncTime(now)
  state.reset()
  state.screen = 'tutorial'
  state.tutorialActive = true
  state.startTime = now
  state.speed = 0.6
  tutorial.start(state)
  lastTutorialStep = TutorialStep.LANES
  announceTutorialLanes(announcer)
}

/** Start practice mode — enter tutorial regardless of profile completion */
export function startPractice(): void {
  startTutorial()
}
const overlay = new OverlayController({
  onReplay: () => startNewRun(performance.now()),
  onMenu: returnToMainMenu,
})

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

// Ball-lost grace period
const BALL_LOST_GRACE_MS = 1000

const TUTORIAL_LANES: Lane[] = ['left', 'center', 'right']
let tutorialObstacleCount = 0

function spawnTutorialObjects(state: GameState, tut: TutorialManager, now: number): void {
  const step = tut.getStep()

  if (step === TutorialStep.OBSTACLES) {
    // Spawn 1 slow obstacle at a time when none are active
    const hasActive = state.obstacles.some(o => o.active)
    if (!hasActive) {
      const obs = state.obstacles.find(o => !o.active)
      if (obs) {
        // Alternate: first obstacle in a different lane, second in player's lane
        tutorialObstacleCount++
        const playerLane = state.lane
        let lane: Lane
        if (tutorialObstacleCount % 2 === 1) {
          // Safe lane — pick a lane that's NOT the player's lane
          const safeLanes = TUTORIAL_LANES.filter(l => l !== playerLane)
          lane = safeLanes[Math.floor(Math.random() * safeLanes.length)]
        } else {
          // Player's lane — force them to dodge
          lane = playerLane
        }
        obs.lane = lane
        obs.y = 0
        obs.type = 'boards'
        obs.active = true
        obs.passed = false
        obs.width = 1
        obs.secondLane = undefined
        obs.moving = false
        obs.movingX = GameState.LANE_X[lane]
        obs.movingTargetX = GameState.LANE_X[lane]
        obs.movingSpeed = 0
      }
    }
  } else if (step === TutorialStep.COINS) {
    // Spawn a group of 3 coins when none are active
    const hasActive = state.coins.some(c => c.active)
    if (!hasActive) {
      // Pick a visible lane (prefer one that's not the player's current lane for movement)
      const otherLanes = TUTORIAL_LANES.filter(l => l !== state.lane)
      const lane = otherLanes.length > 0
        ? otherLanes[Math.floor(Math.random() * otherLanes.length)]
        : state.lane

      const available: typeof state.coins[number][] = []
      for (const c of state.coins) {
        if (!c.active) {
          available.push(c)
          if (available.length >= 3) break
        }
      }
      if (available.length >= 3) {
        for (let i = 0; i < 3; i++) {
          const coin = available[i]
          coin.lane = lane
          coin.y = -(i * 0.08)
          coin.active = true
          coin.collected = false
        }
      }
    }
  }
  // Other steps: no spawning needed
}

function update(now: number, dt: number): void {
  state.syncTime(now)
  const viewportHeight = canvas.clientHeight || window.innerHeight || 1

  // Tutorial mode
  if (state.screen === 'tutorial') {
    state.elapsed = now - state.startTime
    state.updatePosition(dt)

    // Update obstacles/coins during tutorial (tutorial controls spawning)
    updateObstacles(state, dt, viewportHeight)
    updateCoins(state, dt, viewportHeight)

    // Track lane visits for tutorial step 1
    tutorial.onLaneVisited(state.lane)

    // Check collisions during tutorial (obstacles step)
    if (tutorial.getStep() === TutorialStep.OBSTACLES) {
      const livesBefore = state.lives
      const screenBefore = state.screen
      const result = checkCollisions(state, now)
      if (result === 'passed') {
        tutorial.onObstacleDodged()
        playSound('coin') // positive feedback
      }
      // Don't lose lives during tutorial - restore if hit
      if (result === 'hit') {
        state.lives = livesBefore
        state.screen = screenBefore
      }
    }

    // Collect coins during tutorial (coins step)
    if (tutorial.getStep() === TutorialStep.COINS) {
      const collected = collectCoins(state)
      if (collected > 0) {
        playSound('coin')
        for (let i = 0; i < collected; i++) {
          tutorial.onCoinCollected()
        }
      }
    }

    // Stickhandling during tutorial
    if (tutorial.getStep() === TutorialStep.STICKHANDLING) {
      if (state.stickhandlingActive) {
        if (state.stickhandlingStreakStart > 0) {
          tutorial.onStickhandlingDuration(now - state.stickhandlingStreakStart)
        }
      }
    }

    // Spawn tutorial obstacles/coins based on step
    spawnTutorialObjects(state, tutorial, now)

    // Announce step transitions
    const currentStep = tutorial.getStep()
    if (lastTutorialStep !== null && currentStep !== lastTutorialStep) {
      lastTutorialStep = currentStep
      if (currentStep === TutorialStep.OBSTACLES) {
        // Clear lane-step objects
        for (const o of state.obstacles) { o.active = false; o.passed = false }
        for (const c of state.coins) { c.active = false; c.collected = false }
        tutorialObstacleCount = 0
        announceTutorialObstacles(announcer)
      } else if (currentStep === TutorialStep.COINS) {
        for (const o of state.obstacles) { o.active = false; o.passed = false }
        for (const c of state.coins) { c.active = false; c.collected = false }
        announceTutorialCoins(announcer)
      } else if (currentStep === TutorialStep.STICKHANDLING) {
        for (const o of state.obstacles) { o.active = false; o.passed = false }
        for (const c of state.coins) { c.active = false; c.collected = false }
        announceTutorialStickhandling(announcer)
      }
    }

    // Check if tutorial is complete
    if (tutorial.isComplete()) {
      state.tutorialActive = false
      state.screen = 'countdown'
      state.countdownEnd = now + 3000
      // Clear tutorial objects
      for (const o of state.obstacles) { o.active = false; o.passed = false }
      for (const c of state.coins) { c.active = false; c.collected = false }
      announcer.announce('🎯 You\'re ready! Let\'s go!', null, 5)
      // Mark tutorial complete in profile
      const name = state.playerName
      if (name) {
        updateProfile(name, 0, undefined, true)
      }
    }

    announcer.update(now)
    return // Skip normal game update
  }

  // Countdown → playing transition
  if (state.screen === 'countdown') {
    if (now >= state.countdownEnd) {
      state.beginPlaying(now)
      unmuteAudio()
      playSound('go')
      announceGameStart(announcer)
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
        announcer.clear() // stop any pending announcements
        announceGameOver(announcer) // this one gets through
        muteAudio() // silence everything after game over sound
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
      if (!state.run.firstCoinAnnounced) {
        announceFirstCoin(announcer)
        state.run.firstCoinAnnounced = true
      }
      for (let i = 0; i < collected; i++) {
        events.push({ type: 'coin_collected', time: now, lane: state.lane })
      }
    }

    if (state.multiplier < 5) {
      state.run.onFireAnnounced = false
    } else if (!state.run.onFireAnnounced) {
      state.run.onFireAnnounced = true
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
      if (now - state.run.lastStickhandlingTick >= 1000) {
        const rate = state.stickhandlingFrequency >= 4.0 ? 10 : 5
        state.addScore(rate)
        state.run.lastStickhandlingTick = now
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
      state.run.lastStickhandlingTick = now
    }

    // Survival bonus: +1 point per second
    if (now - state.run.lastSurvivalTick >= 1000) {
      state.score += 1
      state.run.lastSurvivalTick = now
    }

    // Deke active state
    if (state.dekeActive && now > state.dekeInvincibleUntil) {
      state.dekeActive = false
    }

    // Speed milestone announcements
    if (state.speed >= state.run.lastSpeedMilestone + 0.5) {
      state.run.lastSpeedMilestone = Math.floor(state.speed * 2) / 2
      announceSpeedMilestone(announcer)
    }

    // Deke unlock announcement
    if (state.isDekeUnlocked && !state.run.dekeUnlockAnnounced) {
      state.run.dekeUnlockAnnounced = true
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
  overlay.update(state, announcer)

  requestAnimationFrame(gameLoop)
}

requestAnimationFrame(gameLoop)
console.log('[puck-runner] Phase 3 ready — press SPACE to start')
