// Regression: ISSUE-001 — High score celebration never triggers
// Found by /qa on 2026-03-19
// Report: .gstack/qa-reports/qa-report-localhost-2026-03-19.md

import { describe, it, expect } from 'vitest'
import { GameState } from './game-state'

describe('ISSUE-001: isNewHighScore flag', () => {
  it('sets isNewHighScore when score exceeds previous high score on death', () => {
    const state = new GameState()
    state.start(1000)
    state.beginPlaying(4000)
    state.score = 100
    state.highScore = 50

    state.loseLife() // 3 → 2 (no game over yet)
    state.loseLife() // 2 → 1
    state.loseLife() // 1 → 0 → game_over

    expect(state.screen).toBe('game_over')
    expect(state.isNewHighScore).toBe(true)
    expect(state.highScore).toBe(100)
  })

  it('does not set isNewHighScore when score is below high score', () => {
    const state = new GameState()
    state.start(1000)
    state.beginPlaying(4000)
    state.score = 30
    state.highScore = 50

    state.loseLife()
    state.loseLife()
    state.loseLife()

    expect(state.screen).toBe('game_over')
    expect(state.isNewHighScore).toBe(false)
    expect(state.highScore).toBe(50)
  })

  it('resets isNewHighScore on reset()', () => {
    const state = new GameState()
    state.start(1000)
    state.beginPlaying(4000)
    state.score = 100
    state.highScore = 0
    state.loseLife()
    state.loseLife()
    state.loseLife()

    expect(state.isNewHighScore).toBe(true)

    state.reset()
    expect(state.isNewHighScore).toBe(false)
  })

  it('does not set isNewHighScore when score equals high score', () => {
    const state = new GameState()
    state.start(1000)
    state.beginPlaying(4000)
    state.score = 50
    state.highScore = 50

    state.loseLife()
    state.loseLife()
    state.loseLife()

    expect(state.isNewHighScore).toBe(false)
  })
})
