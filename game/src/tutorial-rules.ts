import type { Lane } from '@shared/protocol'
import type { Obstacle } from './game-state'
import { TutorialStep } from './tutorial'

const TUTORIAL_LANES: Lane[] = ['left', 'center', 'right']
const TUTORIAL_BASE_SPEED = 0.6
const TUTORIAL_OBSTACLE_SPEED = 1.0
const PRACTICE_COIN_START_Y = 0.54
const PRACTICE_COIN_SPACING = 0.08
const RUN_COIN_SPACING = 0.08

interface RandomSource {
  random?: () => number
}

export function getTutorialStepSpeed(step: TutorialStep): number {
  return step === TutorialStep.OBSTACLES ? TUTORIAL_OBSTACLE_SPEED : TUTORIAL_BASE_SPEED
}

export function laneHasTutorialObstacleConflict(
  obstacles: Obstacle[],
  lane: Lane,
): boolean {
  for (const obstacle of obstacles) {
    if (!obstacle.active) continue
    if (obstacle.y > 0.95) continue
    if (obstacle.lane === lane || obstacle.secondLane === lane) {
      return true
    }
  }
  return false
}

export function selectTutorialObstacleLane(params: {
  practiceMode: boolean
  obstacleCount: number
  playerLane: Lane
} & RandomSource): Lane {
  const { practiceMode, obstacleCount, playerLane } = params
  const random = params.random ?? Math.random

  if (practiceMode) {
    return 'center'
  }

  if (obstacleCount % 2 === 0) {
    return playerLane
  }

  const safeLanes = TUTORIAL_LANES.filter((candidate) => candidate !== playerLane)
  return safeLanes[Math.floor(random() * safeLanes.length)]
}

export function selectTutorialCoinLane(params: {
  obstacles: Obstacle[]
  playerLane: Lane
} & RandomSource): Lane | null {
  const { obstacles, playerLane } = params
  const random = params.random ?? Math.random

  const safeLanes = TUTORIAL_LANES.filter((lane) => !laneHasTutorialObstacleConflict(obstacles, lane))
  if (safeLanes.length === 0) {
    return null
  }

  const moveLanes = safeLanes.filter((lane) => lane !== playerLane)
  const lanePool = moveLanes.length > 0 ? moveLanes : safeLanes
  return lanePool[Math.floor(random() * lanePool.length)]
}

export function getTutorialCoinY(index: number, practiceMode: boolean): number {
  return practiceMode
    ? PRACTICE_COIN_START_Y - index * PRACTICE_COIN_SPACING
    : -(index * RUN_COIN_SPACING)
}
