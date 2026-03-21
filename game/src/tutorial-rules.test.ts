import { describe, expect, it } from 'vitest'
import { TutorialStep } from './tutorial'
import {
  getTutorialCoinY,
  getTutorialStepSpeed,
  laneHasTutorialObstacleConflict,
  selectTutorialCoinLane,
  selectTutorialObstacleLane,
} from './tutorial-rules'
import { createInactiveObstacle } from './world-entities'

describe('tutorial-rules', () => {
  it('uses the faster speed for obstacle practice', () => {
    expect(getTutorialStepSpeed(TutorialStep.LANES)).toBe(0.6)
    expect(getTutorialStepSpeed(TutorialStep.OBSTACLES)).toBe(1)
  })

  it('detects obstacle conflicts for either occupied lane', () => {
    const obstacle = createInactiveObstacle()
    obstacle.active = true
    obstacle.lane = 'left'
    obstacle.secondLane = 'center'
    obstacle.y = 0.5

    expect(laneHasTutorialObstacleConflict([obstacle], 'left')).toBe(true)
    expect(laneHasTutorialObstacleConflict([obstacle], 'center')).toBe(true)
    expect(laneHasTutorialObstacleConflict([obstacle], 'right')).toBe(false)
  })

  it('keeps practice obstacles in the center lane', () => {
    expect(selectTutorialObstacleLane({
      practiceMode: true,
      obstacleCount: 1,
      playerLane: 'left',
    })).toBe('center')
  })

  it('alternates tutorial obstacles between a safe lane and the player lane', () => {
    expect(selectTutorialObstacleLane({
      practiceMode: false,
      obstacleCount: 1,
      playerLane: 'center',
      random: () => 0,
    })).toBe('left')

    expect(selectTutorialObstacleLane({
      practiceMode: false,
      obstacleCount: 2,
      playerLane: 'center',
      random: () => 0,
    })).toBe('center')
  })

  it('prefers coin lanes that make the player move', () => {
    const obstacle = createInactiveObstacle()
    obstacle.active = true
    obstacle.lane = 'right'
    obstacle.y = 0.4

    expect(selectTutorialCoinLane({
      obstacles: [obstacle],
      playerLane: 'left',
      random: () => 0,
    })).toBe('center')
  })

  it('returns null when all tutorial coin lanes are blocked', () => {
    const left = createInactiveObstacle()
    left.active = true
    left.lane = 'left'
    left.y = 0.2

    const center = createInactiveObstacle()
    center.active = true
    center.lane = 'center'
    center.y = 0.2

    const right = createInactiveObstacle()
    right.active = true
    right.lane = 'right'
    right.y = 0.2

    expect(selectTutorialCoinLane({
      obstacles: [left, center, right],
      playerLane: 'center',
    })).toBeNull()
  })

  it('computes tutorial coin Y positions for practice and run modes', () => {
    expect(getTutorialCoinY(0, true)).toBeCloseTo(0.54)
    expect(getTutorialCoinY(2, true)).toBeCloseTo(0.38)
    expect(getTutorialCoinY(2, false)).toBeCloseTo(-0.16)
  })
})
