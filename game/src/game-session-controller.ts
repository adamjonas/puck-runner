import { GameState } from './game-state'
import { GameRuntime } from './game-runtime'
import { Renderer } from './renderer'
import { InputManager } from './input'
import { createObstaclePool } from './obstacles'
import { createCoinPool } from './coins'
import { initAudio } from './audio'
import { loadProfiles } from './profiles'
import { Announcer } from './announcer'
import { OverlayController } from './ui-overlay'
import { RunScoringSystem } from './run-scoring-system'
import { TutorialSession } from './tutorial-session'

export class GameSessionController {
  readonly state: GameState

  private readonly renderer: Renderer
  private readonly runtime: GameRuntime
  private readonly input: InputManager
  private readonly announcer = new Announcer()
  private readonly scoring: RunScoringSystem
  private readonly tutorial: TutorialSession
  private readonly overlay: OverlayController

  private audioReady = false
  private lastTime = performance.now()

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
    this.runtime = new GameRuntime(this.state, canvas, {
      announcer: this.announcer,
      input: this.input,
      scoring: this.scoring,
      tutorial: this.tutorial,
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

    this.runtime.update(now, dt)
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

  private resetSessionSystems(): void {
    this.scoring.resetSession()
    this.tutorial.reset()
    this.input.resetTrackingState()
  }
}
