import { GameState } from './game-state'
import { Renderer } from './renderer'
import { InputManager } from './input'
import { createObstaclePool, spawnObstacle, updateObstacles, checkCollisions } from './obstacles'
import { createCoinPool, spawnCoins, updateCoins } from './coins'
import { initAudio, playSound, unmuteAudio } from './audio'
import { loadProfiles } from './profiles'
import { Announcer, announceGameStart } from './announcer'
import { OverlayController } from './ui-overlay'
import { RunScoringSystem } from './run-scoring-system'
import { TutorialSession } from './tutorial-session'

const BALL_LOST_GRACE_MS = 1000

export class GameSessionController {
  readonly state: GameState

  private readonly renderer: Renderer
  private readonly input: InputManager
  private readonly announcer = new Announcer()
  private readonly scoring: RunScoringSystem
  private readonly tutorial: TutorialSession
  private readonly overlay: OverlayController

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
    this.scoring = new RunScoringSystem(this.state, this.announcer)
    this.tutorial = new TutorialSession(this.state, this.announcer)
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
    this.resetSessionSystems()

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

    this.state.startCountdown(now)
  }

  private returnToMainMenu(): void {
    this.resetSessionSystems()
    this.state.reset()
  }

  private beginTutorial(isPractice: boolean): void {
    this.resetSessionSystems()
    const now = performance.now()
    this.tutorial.start(isPractice, now)
  }

  private update(now: number, dt: number): void {
    this.state.syncTime(now)
    const viewportHeight = this.canvas.clientHeight || window.innerHeight || 1

    if (this.state.screen === 'tutorial') {
      this.tutorial.update(now, dt, viewportHeight)
      this.announcer.update(now)
      this.updatePerformanceMetrics(now)
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
    this.scoring.update(now, checkCollisions(this.state, now))
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

  private resetSessionSystems(): void {
    this.scoring.resetSession()
    this.tutorial.reset()
  }
}
