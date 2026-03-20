import type { Lane } from '@shared/protocol'
import { playSound } from './audio'
import { collectCoins, updateCoins } from './coins'
import { GameState } from './game-state'
import { markTutorialComplete } from './profiles'
import { checkCollisions, updateObstacles } from './obstacles'
import { TutorialManager, TutorialStep } from './tutorial'
import {
  Announcer,
  announceTutorialCoins,
  announceTutorialLanes,
  announceTutorialObstacles,
  announceTutorialStickhandling,
} from './announcer'
import { activateCoin, activateObstacle } from './world-entities'

const TUTORIAL_LANES: Lane[] = ['left', 'center', 'right']
const TUTORIAL_BASE_SPEED = 0.6
const TUTORIAL_OBSTACLE_SPEED = 1.0
const PRACTICE_COIN_START_Y = 0.54
const PRACTICE_COIN_SPACING = 0.08

export class TutorialSession {
  private readonly tutorial = new TutorialManager()
  private lastStep: TutorialStep | null = null
  private practiceMode = false
  private obstacleCount = 0

  constructor(
    private readonly state: GameState,
    private readonly announcer: Announcer,
  ) {}

  start(isPractice: boolean, now: number): void {
    this.practiceMode = isPractice
    this.state.enterTutorial(now, this.getStepSpeed(TutorialStep.LANES))
    this.tutorial.start(this.state)
    this.lastStep = TutorialStep.LANES
    this.obstacleCount = 0
    announceTutorialLanes(this.announcer)
  }

  reset(): void {
    this.practiceMode = false
    this.lastStep = null
    this.obstacleCount = 0
    this.state.resetWorldObjects()
  }

  update(now: number, dt: number, viewportHeight: number): void {
    this.state.speed = this.getStepSpeed(this.tutorial.getStep())
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

    this.spawnObjects()
    this.announceStepTransitions()

    if (this.tutorial.isComplete()) {
      this.complete(now)
    }
  }

  private getStepSpeed(step: TutorialStep): number {
    return step === TutorialStep.OBSTACLES ? TUTORIAL_OBSTACLE_SPEED : TUTORIAL_BASE_SPEED
  }

  private laneHasObstacleConflict(lane: Lane): boolean {
    for (const obstacle of this.state.obstacles) {
      if (!obstacle.active) continue
      if (obstacle.y > 0.95) continue
      if (obstacle.lane === lane || obstacle.secondLane === lane) {
        return true
      }
    }
    return false
  }

  private spawnObjects(): void {
    const step = this.tutorial.getStep()

    if (step === TutorialStep.OBSTACLES) {
      const hasActive = this.state.obstacles.some((obstacle) => obstacle.active)
      if (hasActive) return

      const obstacle = this.state.obstacles.find((candidate) => !candidate.active)
      if (!obstacle) return

      let lane: Lane = 'center'
      if (!this.practiceMode) {
        this.obstacleCount++
        const playerLane = this.state.lane
        if (this.obstacleCount % 2 === 1) {
          const safeLanes = TUTORIAL_LANES.filter((candidate) => candidate !== playerLane)
          lane = safeLanes[Math.floor(Math.random() * safeLanes.length)]
        } else {
          lane = playerLane
        }
      }

      activateObstacle(obstacle, {
        lane,
        y: 0,
        type: 'boards',
        movingX: GameState.LANE_X[lane],
        movingTargetX: GameState.LANE_X[lane],
      })
      return
    }

    if (step !== TutorialStep.COINS) return

    const hasActive = this.state.coins.some((coin) => coin.active)
    if (hasActive) return

    const safeLanes = TUTORIAL_LANES.filter((lane) => !this.laneHasObstacleConflict(lane))
    if (safeLanes.length === 0) return

    const moveLanes = safeLanes.filter((lane) => lane !== this.state.lane)
    const lane = moveLanes.length > 0
      ? moveLanes[Math.floor(Math.random() * moveLanes.length)]
      : safeLanes[Math.floor(Math.random() * safeLanes.length)]

    const available = this.state.coins.filter((coin) => !coin.active).slice(0, 3)
    if (available.length < 3) return

    for (let i = 0; i < 3; i++) {
      activateCoin(
        available[i],
        lane,
        this.practiceMode
          ? PRACTICE_COIN_START_Y - i * PRACTICE_COIN_SPACING
          : -(i * 0.08),
      )
    }
  }

  private announceStepTransitions(): void {
    const currentStep = this.tutorial.getStep()
    if (this.lastStep === null || currentStep === this.lastStep) {
      return
    }

    this.lastStep = currentStep
    if (currentStep === TutorialStep.OBSTACLES) {
      this.state.resetWorldObjects()
      this.obstacleCount = 0
      announceTutorialObstacles(this.announcer)
    } else if (currentStep === TutorialStep.COINS) {
      this.state.resetWorldObjects()
      announceTutorialCoins(this.announcer)
    } else if (currentStep === TutorialStep.STICKHANDLING) {
      this.state.resetWorldObjects()
      announceTutorialStickhandling(this.announcer)
    }
  }

  private complete(now: number): void {
    this.state.startCountdown(now)
    this.announcer.announce('🎯 You\'re ready! Let\'s go!', null, 5)

    const name = this.state.playerName
    if (name) {
      markTutorialComplete(name)
    }
  }
}
