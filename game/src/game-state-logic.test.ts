import { describe, expect, it } from 'vitest'
import {
  applyCoinCollection,
  computeSpeed,
  createResetStateValues,
  createRunState,
  resolveLifeLost,
  updateAvatarPosition,
  updateGameOverActionState,
} from './game-state-logic'

describe('game-state-logic', () => {
  it('creates randomized run state through the injected random source', () => {
    const run = createRunState(() => 0.5)
    expect(run.nextObstacleSpawnInterval).toBe(3500)
    expect(run.nextCoinSpawnInterval).toBe(2500)
  })

  it('builds reset values without touching persistent profile/debug fields', () => {
    const resetState = createResetStateValues()
    expect(resetState.screen).toBe('title')
    expect(resetState.lives).toBe(3)
    expect(resetState.run.lastSurvivalTick).toBe(0)
  })

  it('computes avatar interpolation and speed as pure functions', () => {
    expect(updateAvatarPosition(0.5, 0.2, 16)).toBeLessThan(0.5)
    expect(computeSpeed(0)).toBe(1)
    expect(computeSpeed(20000)).toBeCloseTo(1.334)
  })

  it('applies coin streak multiplier progression and score delta', () => {
    const nextState = applyCoinCollection({ coinStreak: 9, multiplier: 1 })
    expect(nextState.coinStreak).toBe(0)
    expect(nextState.multiplier).toBe(2)
    expect(nextState.scoreDelta).toBe(20)
  })

  it('updates game over hold progress and resolves replay when complete', () => {
    const pending = updateGameOverActionState({
      screen: 'game_over',
      now: 1000,
      lane: 'right',
      confidence: 0.9,
      gameOverAction: null,
      gameOverActionStartedAt: 0,
    })
    expect(pending.action).toBe('replay')
    expect(pending.resolvedAction).toBeNull()

    const complete = updateGameOverActionState({
      screen: 'game_over',
      now: 1700,
      lane: 'right',
      confidence: 0.9,
      gameOverAction: 'replay',
      gameOverActionStartedAt: 1000,
    })
    expect(complete.progress).toBe(1)
    expect(complete.resolvedAction).toBe('replay')
  })

  it('resolves life loss and high score transitions', () => {
    expect(resolveLifeLost({ lives: 3, score: 100, highScore: 90 })).toEqual({
      lives: 2,
      screen: 'playing',
      highScore: 90,
      isNewHighScore: false,
    })

    expect(resolveLifeLost({ lives: 1, score: 100, highScore: 90 })).toEqual({
      lives: 0,
      screen: 'game_over',
      highScore: 100,
      isNewHighScore: true,
    })
  })
})
