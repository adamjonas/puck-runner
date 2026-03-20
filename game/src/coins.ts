import type { Lane } from '@shared/protocol'
import type { Coin } from './game-state'
import { GameState } from './game-state'
import { activateCoin, createInactiveCoin, resetCoin } from './world-entities'

const POOL_SIZE = 30
const LANES: Lane[] = ['left', 'center', 'right']
const PLAYER_Y = 0.75
const COLLECT_THRESHOLD = 0.05
const COIN_VERTICAL_SPACING = 0.08

export function createCoinPool(): Coin[] {
  const pool: Coin[] = []
  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push(createInactiveCoin())
  }
  return pool
}

function getInactiveCoins(state: GameState, count: number): Coin[] {
  const result: Coin[] = []
  for (const coin of state.coins) {
    if (!coin.active) {
      result.push(coin)
      if (result.length >= count) break
    }
  }
  return result
}

/** Check if a lane has an active obstacle near the spawn zone (top of screen). */
function laneHasObstacleNearby(state: GameState, lane: Lane): boolean {
  for (const obs of state.obstacles) {
    if (!obs.active) continue
    // Consider obstacles in the top portion of the screen as "nearby"
    if (obs.y < 0.3) {
      if (obs.lane === lane || obs.secondLane === lane) return true
    }
  }
  return false
}

export function spawnCoins(state: GameState, now: number): void {
  if (state.screen !== 'playing') return

  // Spawn every 2-3 seconds
  const interval = 2000 + Math.random() * 1000
  if (now - state.run.lastCoinSpawnTime < interval) return

  // Pick a lane that doesn't have an obstacle nearby
  const safeLanes = LANES.filter((l) => !laneHasObstacleNearby(state, l))
  if (safeLanes.length === 0) return

  const lane = safeLanes[Math.floor(Math.random() * safeLanes.length)]

  // Spawn a group of 3-5 coins
  const groupSize = 3 + Math.floor(Math.random() * 3) // 3, 4, or 5
  const available = getInactiveCoins(state, groupSize)
  if (available.length < groupSize) return

  for (let i = 0; i < groupSize; i++) {
    const coin = available[i]
    activateCoin(coin, lane, -(i * COIN_VERTICAL_SPACING))
  }

  state.run.lastCoinSpawnTime = now
}

export function updateCoins(state: GameState, dt: number, viewportHeight: number): void {
  const speed = state.currentSpeed / Math.max(viewportHeight, 1)
  for (const coin of state.coins) {
    if (!coin.active) continue
    coin.y += speed * dt

    if (coin.y > 1.2) {
      resetCoin(coin)
    }
  }
}

export function collectCoins(state: GameState): number {
  let collected = 0

  for (const coin of state.coins) {
    if (!coin.active || coin.collected) continue

    const inRange = Math.abs(coin.y - PLAYER_Y) < COLLECT_THRESHOLD
    if (!inRange) continue
    if (coin.lane !== state.lane) continue

    coin.collected = true
    state.collectCoin(state.now)
    collected++
  }

  return collected
}
