// Regression: ISSUE-003 — Coin spawn interval re-randomized every frame
// Found by /qa on 2026-03-19
// Report: .gstack/qa-reports/qa-report-localhost-2026-03-19.md

import { describe, it, expect, vi } from 'vitest'
import { GameState } from './game-state'
import { createCoinPool, spawnCoins } from './coins'
import { createObstaclePool } from './obstacles'

function makePlayingState(): GameState {
  const state = new GameState()
  state.coins = createCoinPool()
  state.obstacles = createObstaclePool()
  state.screen = 'playing'
  state.elapsed = 0
  state.speed = 1.0
  return state
}

describe('ISSUE-003: coin spawn interval stability', () => {
  it('does not spawn coins before the stored interval elapses', () => {
    const state = makePlayingState()
    // Force a known interval
    state.run.nextCoinSpawnInterval = 2500
    state.run.lastCoinSpawnTime = 1000

    // Call at 3400ms (only 2400ms elapsed, less than 2500 interval)
    // Before the fix, Math.random() could produce a short interval and spawn early
    vi.spyOn(Math, 'random').mockReturnValue(0) // would produce interval=2000 if recalculated

    spawnCoins(state, 3400)

    const activeCoins = state.coins.filter((c) => c.active)
    expect(activeCoins.length).toBe(0)

    vi.restoreAllMocks()
  })

  it('spawns coins once the stored interval elapses and picks a new interval', () => {
    const state = makePlayingState()
    state.run.nextCoinSpawnInterval = 2500
    state.run.lastCoinSpawnTime = 1000

    // Call at 3600ms (2600ms elapsed, > 2500 interval)
    spawnCoins(state, 3600)

    const activeCoins = state.coins.filter((c) => c.active)
    expect(activeCoins.length).toBeGreaterThan(0)

    // Verify a new interval was chosen
    expect(state.run.lastCoinSpawnTime).toBe(3600)
    expect(state.run.nextCoinSpawnInterval).toBeGreaterThanOrEqual(2000)
    expect(state.run.nextCoinSpawnInterval).toBeLessThanOrEqual(3000)
  })
})
