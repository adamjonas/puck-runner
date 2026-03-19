import { describe, it, expect, vi } from 'vitest'
import { GameState } from './game-state'
import type { Coin } from './game-state'
import {
  createCoinPool,
  spawnCoins,
  updateCoins,
  collectCoins,
} from './coins'
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

/** Place an active coin directly for collection tests. */
function placeCoin(
  state: GameState,
  overrides: Partial<Coin>,
): Coin {
  const coin = state.coins.find((c) => !c.active)!
  Object.assign(coin, {
    active: true,
    collected: false,
    y: 0.75, // PLAYER_Y
    lane: 'center',
    ...overrides,
  })
  return coin
}

describe('createCoinPool', () => {
  it('returns 30 inactive coins', () => {
    const pool = createCoinPool()
    expect(pool).toHaveLength(30)
    for (const coin of pool) {
      expect(coin.active).toBe(false)
      expect(coin.collected).toBe(false)
    }
  })
})

describe('spawnCoins', () => {
  it('spawns a group of coins when playing', () => {
    const state = makePlayingState()
    // Use a large `now` to bypass module-level lastSpawnTime
    spawnCoins(state, 500_000)

    const active = state.coins.filter((c) => c.active)
    expect(active.length).toBeGreaterThanOrEqual(3)
    expect(active.length).toBeLessThanOrEqual(5)
  })

  it('does not spawn when screen is not playing', () => {
    const state = makePlayingState()
    state.screen = 'title'
    spawnCoins(state, 500_000)

    const active = state.coins.filter((c) => c.active)
    expect(active).toHaveLength(0)
  })

  it('spawned coins share the same lane', () => {
    const state = makePlayingState()
    spawnCoins(state, 600_000)

    const active = state.coins.filter((c) => c.active)
    expect(active.length).toBeGreaterThan(0)

    const lane = active[0].lane
    for (const coin of active) {
      expect(coin.lane).toBe(lane)
    }
  })

  it('spawns coins in a lane without nearby obstacles', () => {
    const state = makePlayingState()
    // Block left and center lanes with obstacles near the top
    state.obstacles[0].active = true
    state.obstacles[0].lane = 'left'
    state.obstacles[0].y = 0.1
    state.obstacles[1].active = true
    state.obstacles[1].lane = 'center'
    state.obstacles[1].y = 0.1

    spawnCoins(state, 700_000)

    const active = state.coins.filter((c) => c.active)
    if (active.length > 0) {
      // All coins should be in the 'right' lane (the only safe lane)
      for (const coin of active) {
        expect(coin.lane).toBe('right')
      }
    }
  })

  it('coins are staggered vertically', () => {
    const state = makePlayingState()
    spawnCoins(state, 800_000)

    const active = state.coins.filter((c) => c.active)
    expect(active.length).toBeGreaterThanOrEqual(3)

    // First coin should be at y=0, subsequent coins at negative y values
    for (let i = 1; i < active.length; i++) {
      expect(active[i].y).toBeLessThan(active[i - 1].y)
    }
  })
})

describe('updateCoins', () => {
  it('moves active coins downward', () => {
    const state = makePlayingState()
    const coin = placeCoin(state, { y: 0.3, lane: 'center' })

    updateCoins(state, 100, 800)
    expect(coin.y).toBeGreaterThan(0.3)
  })

  it('deactivates coins that go off-screen (y > 1.2)', () => {
    const state = makePlayingState()
    const coin = placeCoin(state, { y: 1.19, lane: 'center' })

    // Large dt to push past 1.2
    updateCoins(state, 500, 800)
    expect(coin.active).toBe(false)
  })

  it('does not move inactive coins', () => {
    const state = makePlayingState()
    const coin = state.coins[0]
    coin.y = 0.5
    coin.active = false

    updateCoins(state, 100, 800)
    expect(coin.y).toBe(0.5) // unchanged
  })
})

describe('collectCoins', () => {
  it('collects coins near player Y in matching lane', () => {
    const state = makePlayingState()
    state.lane = 'center'
    state.avatarX = GameState.LANE_X.center

    placeCoin(state, { lane: 'center', y: 0.75 })

    const collected = collectCoins(state)
    expect(collected).toBe(1)
  })

  it('does not collect coins in different lanes', () => {
    const state = makePlayingState()
    state.lane = 'left'
    state.avatarX = GameState.LANE_X.left

    placeCoin(state, { lane: 'right', y: 0.75 })

    const collected = collectCoins(state)
    expect(collected).toBe(0)
  })

  it('does not collect coins outside the Y threshold', () => {
    const state = makePlayingState()
    state.lane = 'center'

    // PLAYER_Y=0.75, COLLECT_THRESHOLD=0.05, so y=0.3 is far out of range
    placeCoin(state, { lane: 'center', y: 0.3 })

    const collected = collectCoins(state)
    expect(collected).toBe(0)
  })

  it('does not collect already-collected coins', () => {
    const state = makePlayingState()
    state.lane = 'center'

    placeCoin(state, { lane: 'center', y: 0.75, collected: true })

    const collected = collectCoins(state)
    expect(collected).toBe(0)
  })

  it('calls state.collectCoin() for each collected coin', () => {
    const state = makePlayingState()
    state.lane = 'center'
    state.avatarX = GameState.LANE_X.center

    const spy = vi.spyOn(state, 'collectCoin')

    placeCoin(state, { lane: 'center', y: 0.74 })
    placeCoin(state, { lane: 'center', y: 0.75 })
    placeCoin(state, { lane: 'center', y: 0.76 })

    const collected = collectCoins(state)
    expect(collected).toBe(3)
    expect(spy).toHaveBeenCalledTimes(3)

    spy.mockRestore()
  })

  it('adds score when coins are collected', () => {
    const state = makePlayingState()
    state.lane = 'center'
    state.avatarX = GameState.LANE_X.center
    state.score = 0

    placeCoin(state, { lane: 'center', y: 0.75 })
    collectCoins(state)

    expect(state.score).toBe(10)
  })

  it('marks collected coins as collected', () => {
    const state = makePlayingState()
    state.lane = 'center'
    state.avatarX = GameState.LANE_X.center

    const coin = placeCoin(state, { lane: 'center', y: 0.75 })
    collectCoins(state)

    expect(coin.collected).toBe(true)
  })

  it('collects multiple coins in same lane at once', () => {
    const state = makePlayingState()
    state.lane = 'left'
    state.avatarX = GameState.LANE_X.left

    placeCoin(state, { lane: 'left', y: 0.74 })
    placeCoin(state, { lane: 'left', y: 0.75 })

    const collected = collectCoins(state)
    expect(collected).toBe(2)
  })
})
