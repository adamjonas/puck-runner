// Regression: ISSUE-008 — Moving zamboni lane field stale for spawn safety
// Found by /qa on 2026-03-19
// Report: .gstack/qa-reports/qa-report-localhost-2026-03-19.md

import { describe, it, expect } from 'vitest'
import { GameState } from './game-state'
import type { Obstacle } from './game-state'
import { createObstaclePool, updateObstacles } from './obstacles'

function makePlayingState(): GameState {
  const state = new GameState()
  state.obstacles = createObstaclePool()
  state.screen = 'playing'
  state.elapsed = 0
  state.speed = 1.0
  return state
}

describe('ISSUE-008: moving zamboni lane tracks current position', () => {
  it('updates lane as zamboni moves from left to right', () => {
    const state = makePlayingState()
    const obs = state.obstacles[0]

    // Set up moving zamboni starting at left lane
    Object.assign(obs, {
      active: true,
      passed: false,
      y: 0.1,
      width: 1,
      type: 'zamboni',
      lane: 'left',
      moving: true,
      movingX: GameState.LANE_X.left,  // 0.2
      movingTargetX: GameState.LANE_X.right,  // 0.8
      movingSpeed: 0.001,
    })

    expect(obs.lane).toBe('left')

    // Simulate enough time for the zamboni to reach center (0.5)
    // From 0.2 to 0.5 = 0.3 distance at 0.001/ms = 300ms
    updateObstacles(state, 350, 800)

    expect(obs.lane).toBe('center')
  })

  it('updates lane as zamboni moves from right to left', () => {
    const state = makePlayingState()
    const obs = state.obstacles[0]

    Object.assign(obs, {
      active: true,
      passed: false,
      y: 0.1,
      width: 1,
      type: 'zamboni',
      lane: 'right',
      moving: true,
      movingX: GameState.LANE_X.right,  // 0.8
      movingTargetX: GameState.LANE_X.left,  // 0.2
      movingSpeed: 0.001,
    })

    expect(obs.lane).toBe('right')

    // Move past center toward left
    updateObstacles(state, 500, 800)

    // movingX: 0.8 - 0.001*500 = 0.3 → closest to left (0.2)
    expect(obs.lane).toBe('left')
  })
})
