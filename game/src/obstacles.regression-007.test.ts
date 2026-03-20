// Regression: ISSUE-007 — Only first obstacle collision processed per frame
// Found by /qa on 2026-03-19
// Report: .gstack/qa-reports/qa-report-localhost-2026-03-19.md

import { describe, it, expect } from 'vitest'
import { GameState } from './game-state'
import type { Obstacle } from './game-state'
import { createObstaclePool, checkCollisions } from './obstacles'

function makePlayingState(): GameState {
  const state = new GameState()
  state.obstacles = createObstaclePool()
  state.screen = 'playing'
  state.elapsed = 0
  state.speed = 1.0
  return state
}

function placeObstacle(state: GameState, overrides: Partial<Obstacle>): Obstacle {
  const obs = state.obstacles.find((o) => !o.active)!
  Object.assign(obs, {
    active: true,
    passed: false,
    y: 0.75,
    width: 1,
    type: 'boards',
    lane: 'center',
    moving: false,
    movingX: 0,
    movingTargetX: 0,
    movingSpeed: 0,
    ...overrides,
  })
  return obs
}

describe('ISSUE-007: multiple obstacle collisions per frame', () => {
  it('processes two obstacles hitting the player in the same frame', () => {
    const state = makePlayingState()
    state.lane = 'center'
    state.avatarX = 0.5
    state.lives = 3

    // Both obstacles in the hit zone at the same Y
    placeObstacle(state, { lane: 'center', y: 0.75 })
    placeObstacle(state, { lane: 'center', y: 0.76 })

    const result = checkCollisions(state, 1000)

    expect(result).toBe('hit')
    // Both should have been processed — player loses 2 lives
    expect(state.lives).toBe(1)
  })

  it('stops processing after game_over', () => {
    const state = makePlayingState()
    state.lane = 'center'
    state.avatarX = 0.5
    state.lives = 1

    placeObstacle(state, { lane: 'center', y: 0.75 })
    placeObstacle(state, { lane: 'center', y: 0.76 })

    const result = checkCollisions(state, 1000)

    expect(result).toBe('hit')
    expect(state.screen).toBe('game_over')
    // Should not go negative
    expect(state.lives).toBe(0)
  })

  it('returns hit over deke_success when both happen in same frame', () => {
    const state = makePlayingState()
    state.lane = 'center'
    state.avatarX = 0.5
    state.lives = 3

    // First obstacle: player in different lane (passed, no collision)
    placeObstacle(state, { lane: 'left', y: 0.75 })
    // Second obstacle: player overlapping (hit)
    placeObstacle(state, { lane: 'center', y: 0.76 })

    const result = checkCollisions(state, 1000)

    expect(result).toBe('hit')
    expect(state.lives).toBe(2)
  })
})
