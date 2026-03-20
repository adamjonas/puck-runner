import type { Lane } from '@shared/protocol'
import { GameState } from './game-state'
import { Renderer } from './renderer'
import { InputManager } from './input'
import { createObstaclePool, spawnObstacle, updateObstacles, checkCollisions } from './obstacles'
import { createCoinPool, spawnCoins, updateCoins, collectCoins } from './coins'
import { ComboDetector } from './combos'
import type { GameEvent } from './combos'
import { initAudio, playSound, muteAudio, unmuteAudio } from './audio'
import { loadProfiles, updateProfile } from './profiles'
import {
  Announcer,
  announceCombo,
  announceDekeSuccess,
  announceDekeUnlocked,
  announceFirstCoin,
  announceGameOver,
  announceGameStart,
  announceLifeLost,
  announceMultiplier5x,
  announceNewHighScore,
  announceSpeedMilestone,
  announceTutorialCoins,
  announceTutorialLanes,
  announceTutorialObstacles,
  announceTutorialStickhandling,
} from './announcer'
import { TutorialManager, TutorialStep } from './tutorial'
import { OverlayController } from './ui-overlay'

const BALL_LOST_GRACE_MS = 1000
const TUTORIAL_LANES: Lane[] = ['left', 'center', 'right']
const TUTORIAL_BASE_SPEED = 0.6
const TUTORIAL_OBSTACLE_SPEED = 1.0
const PRACTICE_COIN_START_Y = 0.54
const PRACTICE_COIN_SPACING = 0.08

export class GameSessionController {
  readonly state: GameState

  private readonly renderer: Renderer
  private readonly input: InputManager
  private readonly comboDetector = new ComboDetector()
  private readonly announcer = new Announcer()
  private readonly tutorial = new TutorialManager()
  private readonly overlay: OverlayController

  private lastTutorialStep: TutorialStep | null = null
  private practiceMode = false
  private tutorialObstacleCount = 0
  private audioReady = false
  private lastTime = performance.now()
  private frameCount = 0
  private fpsTimer = 0

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.state = new GameState()
    this.renderer = new Renderer(canvas)
    this.input = new InputManager(this.state, {
      onStartRequested: (now) => this.startNewRun(now),
      onReplayRequested: (now) => this.startNewRun(now),
      onMenuRequested: () => this.returnToMainMenu(),
    })
    this.overlay = new OverlayController({
      onReplay: () => this.startNewRun(performance.now()),
      onMenu: () => this.returnToMainMenu(),
      onPractice: () => this.startPractice(),
    })

    this.initializeState()
    this.connectInput()
    this.setupAudio()
  }

  start(): void {
    requestAnimationFrame(this.gameLoop)
  }

  startTutorial(): void {
    this.beginTutorial(false)
  }

  startPractice(): void {
    this.beginTutorial(true)
    this.state.playerName = ''
  }

  private initializeState(): void {
    const profiles = loadProfiles()
    if (profiles.length > 0) {
      this.state.highScore = Math.max(...profiles.map((profile) => profile.highScore))
    }

    this.state.obstacles = createObstaclePool()
    this.state.coins = createCoinPool()
  }

  private connectInput(): void {
    this.input.connect()
    this.input.setupKeyboard()
  }

  private setupAudio(): void {
    const ensureAudio = () => {
      if (!this.audioReady) {
        initAudio()
        this.audioReady = true
      }
    }

    window.addEventListener('keydown', ensureAudio, { once: true })
    window.addEventListener('click', ensureAudio, { once: true })
  }

  private readonly gameLoop = (now: number): void => {
    const dt = Math.min(now - this.lastTime, 50)
    this.lastTime = now

    this.update(now, dt)
    this.renderer.render(this.state, dt)
    this.overlay.update(this.state, this.announcer)

    requestAnimationFrame(this.gameLoop)
  }

  private startNewRun(now: number): void {
    this.practiceMode = false
    this.comboDetector.reset()
    this.announcer.clear()

    const name = this.state.playerName
    if (name) {
      const profiles = loadProfiles()
      const profile = profiles.find(
        (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
      )
      if (profile && !profile.tutorialComplete) {
        this.beginTutorial(false)
        return
      }
    }

    this.state.start(now)
  }

  private returnToMainMenu(): void {
    this.practiceMode = false
    this.comboDetector.reset()
    this.announcer.clear()
    this.lastTutorialStep = null
    this.tutorialObstacleCount = 0
    this.state.reset()
  }

  private beginTutorial(isPractice: boolean): void {
    this.practiceMode = isPractice
    this.comboDetector.reset()
    this.announcer.clear()
    const now = performance.now()

    this.state.syncTime(now)
    this.state.reset()
    this.state.screen = 'tutorial'
    this.state.tutorialActive = true
    this.state.startTime = now
    this.state.speed = this.getTutorialStepSpeed(TutorialStep.LANES)

    this.tutorial.start(this.state)
    this.lastTutorialStep = TutorialStep.LANES
    this.tutorialObstacleCount = 0
    announceTutorialLanes(this.announcer)
  }

  private update(now: number, dt: number): void {
    this.state.syncTime(now)
    const viewportHeight = this.canvas.clientHeight || window.innerHeight || 1

    if (this.state.screen === 'tutorial') {
      this.updateTutorial(now, dt, viewportHeight)
      return
    }

    this.updateCountdown(now, dt)

    if (this.state.screen === 'playing') {
      this.updatePlaying(now, dt, viewportHeight)
    }

    if (this.state.screen === 'paused') {
      this.updatePaused(now)
    }

    this.announcer.update(now)
    this.updatePerformanceMetrics(now)
  }

  private updateTutorial(now: number, dt: number, viewportHeight: number): void {
    this.state.speed = this.getTutorialStepSpeed(this.tutorial.getStep())
    this.state.elapsed = now - this.state.startTime
    this.state.updatePosition(dt)

    updateObstacles(this.state, dt, viewportHeight)
    updateCoins(this.state, dt, viewportHeight)

    this.state.tutorialText = this.tutorial.getOverlayText()
    this.tutorial.onLaneVisited(this.state.lane)

    if (this.tutorial.getStep() === TutorialStep.OBSTACLES) {
      const livesBefore = this.state.lives
      const screenBefore = this.state.screen
      const result = checkCollisions(this.state, now)
      if (result === 'passed') {
        this.tutorial.onObstacleDodged()
        playSound('coin')
      }
      if (result === 'hit') {
        this.state.lives = livesBefore
        this.state.screen = screenBefore
      }
    }

    if (this.tutorial.getStep() === TutorialStep.COINS) {
      const collected = collectCoins(this.state)
      if (collected > 0) {
        playSound('coin')
        for (let i = 0; i < collected; i++) {
          this.tutorial.onCoinCollected()
        }
      }
    }

    if (this.tutorial.getStep() === TutorialStep.STICKHANDLING && this.state.stickhandlingActive) {
      if (this.state.stickhandlingStreakStart > 0) {
        this.tutorial.onStickhandlingDuration(now - this.state.stickhandlingStreakStart)
      }
    }

    this.spawnTutorialObjects(now)
    this.announceTutorialStepTransitions()

    if (this.tutorial.isComplete()) {
      this.completeTutorial(now)
    }

    this.announcer.update(now)
    this.updatePerformanceMetrics(now)
  }

  private updateCountdown(now: number, dt: number): void {
    if (this.state.screen !== 'countdown') return

    if (now >= this.state.countdownEnd) {
      this.state.beginPlaying(now)
      unmuteAudio()
      playSound('go')
      announceGameStart(this.announcer)
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

    if (this.state.trackerConnected && this.state.lastInputTime > 0) {
      const timeSinceInput = now - this.state.lastInputTime
      if (timeSinceInput > BALL_LOST_GRACE_MS && this.state.confidence < 0.5) {
        this.state.screen = 'paused'
      }
    }

    this.state.updatePosition(dt)

    spawnObstacle(this.state, now)
    updateObstacles(this.state, dt, viewportHeight)
    spawnCoins(this.state, now)
    updateCoins(this.state, dt, viewportHeight)

    const collisionResult = checkCollisions(this.state, now)
    const events: GameEvent[] = []

    if (collisionResult === 'hit') {
      this.handleHit(now)
    } else if (collisionResult === 'deke_success') {
      playSound('deke')
      this.state.addScore(25)
      events.push({ type: 'deke_success', time: now })
      announceDekeSuccess(this.announcer)
    }

    this.collectPlayingCoins(now, events)
    this.updateComboAnnouncements(events)
    this.updateStickhandlingScoring(now)
    this.updateSurvivalScore(now)
    this.updateDekeState(now)
    this.updateSpeedAnnouncements()
  }

  private handleHit(now: number): void {
    playSound('hit')
    if (this.state.lives > 0) {
      playSound('life_lost')
      announceLifeLost(this.announcer)
    } else {
      playSound('game_over')
      this.announcer.clear()
      announceGameOver(this.announcer)
      muteAudio()
      if (this.state.score >= this.state.highScore && this.state.score > 0) {
        announceNewHighScore(this.announcer)
      }
      const name = this.state.playerName || 'Player'
      updateProfile(name, this.state.score)
    }

    this.state.breakStreak()
  }

  private collectPlayingCoins(now: number, events: GameEvent[]): void {
    const collected = collectCoins(this.state)
    if (collected <= 0) return

    playSound('coin')
    if (!this.state.run.firstCoinAnnounced) {
      announceFirstCoin(this.announcer)
      this.state.run.firstCoinAnnounced = true
    }

    for (let i = 0; i < collected; i++) {
      events.push({ type: 'coin_collected', time: now, lane: this.state.lane })
    }

    if (this.state.multiplier < 5) {
      this.state.run.onFireAnnounced = false
    } else if (!this.state.run.onFireAnnounced) {
      this.state.run.onFireAnnounced = true
      announceMultiplier5x(this.announcer)
    }
  }

  private updateComboAnnouncements(events: GameEvent[]): void {
    for (const event of events) {
      const combo = this.comboDetector.check(this.state, event)
      if (!combo) continue
      playSound('combo')
      announceCombo(this.announcer, combo)
    }
  }

  private updateStickhandlingScoring(now: number): void {
    if (this.state.stickhandlingActive && this.state.screen === 'playing') {
      if (now - this.state.run.lastStickhandlingTick >= 1000) {
        const rate = this.state.stickhandlingFrequency >= 4.0 ? 10 : 5
        this.state.addScore(rate)
        this.state.run.lastStickhandlingTick = now
      }

      if (
        this.state.stickhandlingStreakStart > 0 &&
        !this.state.silkyMittsAwarded &&
        now - this.state.stickhandlingStreakStart >= GameState.SILKY_MITTS_THRESHOLD_MS
      ) {
        this.state.silkyMittsAwarded = true
        this.state.addScore(50)
        this.state.comboText = 'SILKY MITTS!'
        this.state.comboTextUntil = now + 2000
        playSound('silky_mitts')
      }
      return
    }

    this.state.run.lastStickhandlingTick = now
  }

  private updateSurvivalScore(now: number): void {
    if (now - this.state.run.lastSurvivalTick >= 1000) {
      this.state.score += 1
      this.state.run.lastSurvivalTick = now
    }
  }

  private updateDekeState(now: number): void {
    if (this.state.dekeActive && now > this.state.dekeInvincibleUntil) {
      this.state.dekeActive = false
    }
  }

  private updateSpeedAnnouncements(): void {
    if (this.state.speed >= this.state.run.lastSpeedMilestone + 0.5) {
      this.state.run.lastSpeedMilestone = Math.floor(this.state.speed * 2) / 2
      announceSpeedMilestone(this.announcer)
    }

    if (this.state.isDekeUnlocked && !this.state.run.dekeUnlockAnnounced) {
      this.state.run.dekeUnlockAnnounced = true
      announceDekeUnlocked(this.announcer)
    }
  }

  private updatePaused(now: number): void {
    if (this.state.confidence >= 0.5) {
      const timeSinceInput = now - this.state.lastInputTime
      if (timeSinceInput < 200) {
        this.state.screen = 'playing'
      }
    }
  }

  private updatePerformanceMetrics(now: number): void {
    this.input.updateInputRate(now)

    this.frameCount++
    if (now - this.fpsTimer >= 1000) {
      this.state.fps = this.frameCount
      this.frameCount = 0
      this.fpsTimer = now
    }
    this.state.inputRate = this.input.inputRate
  }

  private laneHasTutorialObstacleConflict(lane: Lane): boolean {
    for (const obstacle of this.state.obstacles) {
      if (!obstacle.active) continue
      if (obstacle.y > 0.95) continue
      if (obstacle.lane === lane || obstacle.secondLane === lane) {
        return true
      }
    }
    return false
  }

  private getTutorialStepSpeed(step: TutorialStep): number {
    return step === TutorialStep.OBSTACLES ? TUTORIAL_OBSTACLE_SPEED : TUTORIAL_BASE_SPEED
  }

  private spawnTutorialObjects(now: number): void {
    const step = this.tutorial.getStep()

    if (step === TutorialStep.OBSTACLES) {
      const hasActive = this.state.obstacles.some((obstacle) => obstacle.active)
      if (!hasActive) {
        const obstacle = this.state.obstacles.find((candidate) => !candidate.active)
        if (!obstacle) return

        let lane: Lane = 'center'
        if (!this.practiceMode) {
          this.tutorialObstacleCount++
          const playerLane = this.state.lane
          if (this.tutorialObstacleCount % 2 === 1) {
            const safeLanes = TUTORIAL_LANES.filter((candidate) => candidate !== playerLane)
            lane = safeLanes[Math.floor(Math.random() * safeLanes.length)]
          } else {
            lane = playerLane
          }
        }

        obstacle.lane = lane
        obstacle.y = 0
        obstacle.type = 'boards'
        obstacle.active = true
        obstacle.passed = false
        obstacle.width = 1
        obstacle.secondLane = undefined
        obstacle.moving = false
        obstacle.movingX = GameState.LANE_X[lane]
        obstacle.movingTargetX = GameState.LANE_X[lane]
        obstacle.movingSpeed = 0
      }
      return
    }

    if (step !== TutorialStep.COINS) return

    const hasActive = this.state.coins.some((coin) => coin.active)
    if (hasActive) return

    const safeLanes = TUTORIAL_LANES.filter(
      (lane) => !this.laneHasTutorialObstacleConflict(lane),
    )
    if (safeLanes.length === 0) return

    const moveLanes = safeLanes.filter((lane) => lane !== this.state.lane)
    const lane = moveLanes.length > 0
      ? moveLanes[Math.floor(Math.random() * moveLanes.length)]
      : safeLanes[Math.floor(Math.random() * safeLanes.length)]

    const available: typeof this.state.coins[number][] = []
    for (const coin of this.state.coins) {
      if (!coin.active) {
        available.push(coin)
        if (available.length >= 3) break
      }
    }
    if (available.length < 3) return

    for (let i = 0; i < 3; i++) {
      const coin = available[i]
      coin.lane = lane
      coin.y = this.practiceMode
        ? PRACTICE_COIN_START_Y - i * PRACTICE_COIN_SPACING
        : -(i * 0.08)
      coin.active = true
      coin.collected = false
    }
  }

  private announceTutorialStepTransitions(): void {
    const currentStep = this.tutorial.getStep()
    if (this.lastTutorialStep === null || currentStep === this.lastTutorialStep) {
      return
    }

    this.lastTutorialStep = currentStep
    if (currentStep === TutorialStep.OBSTACLES) {
      this.clearTutorialObjects()
      this.tutorialObstacleCount = 0
      announceTutorialObstacles(this.announcer)
    } else if (currentStep === TutorialStep.COINS) {
      this.clearTutorialObjects()
      announceTutorialCoins(this.announcer)
    } else if (currentStep === TutorialStep.STICKHANDLING) {
      this.clearTutorialObjects()
      announceTutorialStickhandling(this.announcer)
    }
  }

  private completeTutorial(now: number): void {
    this.state.tutorialActive = false
    this.state.screen = 'countdown'
    this.state.countdownEnd = now + 3000
    this.clearTutorialObjects()
    this.announcer.announce('🎯 You\'re ready! Let\'s go!', null, 5)

    const name = this.state.playerName
    if (name) {
      updateProfile(name, 0, undefined, true)
    }
  }

  private clearTutorialObjects(): void {
    for (const obstacle of this.state.obstacles) {
      obstacle.active = false
      obstacle.passed = false
    }
    for (const coin of this.state.coins) {
      coin.active = false
      coin.collected = false
    }
  }
}
