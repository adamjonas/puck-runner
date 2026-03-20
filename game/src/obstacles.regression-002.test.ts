// Regression: ISSUE-002 — Obstacle collision skipped when passing player in one frame
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

describe('ISSUE-002: obstacle passes through player on low FPS', () => {
  it('registers a hit when obstacle jumps past the player while overlapping', () => {
    const state = makePlayingState()
    state.lane = 'center'
    state.avatarX = 0.5
    state.lives = 3

    // Place obstacle past the hit zone (simulating a frame skip)
    // PLAYER_Y = 0.75, HIT_THRESHOLD = 0.06, so > 0.81 means "passed"
    placeObstacle(state, { lane: 'center', y: 0.85 })

    const result = checkCollisions(state, 1000)

    expect(result).toBe('hit')
    expect(state.lives).toBe(2)
  })

  it('still grants deke_success when deke-invincible and obstacle passes through', () => {
    const state = makePlayingState()
    state.lane = 'center'
    state.avatarX = 0.5
    state.dekeInvincibleUntil = 2000 // still invincible
    state.syncTime(1000)

    placeObstacle(state, { lane: 'center', y: 0.85 })

    const result = checkCollisions(state, 1000)

    expect(result).toBe('deke_success')
    expect(state.lives).toBe(3) // no life lost
  })

  it('marks passed without hit when player is in a different lane', () => {
    const state = makePlayingState()
    state.lane = 'left'
    state.avatarX = 0.2

    placeObstacle(state, { lane: 'center', y: 0.85 })

    const result = checkCollisions(state, 1000)

    expect(result).toBe('passed')
    expect(state.lives).toBe(3)
  })
})
