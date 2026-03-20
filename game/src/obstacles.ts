import type { Lane } from '@shared/protocol'
import type { Obstacle } from './game-state'
import { GameState } from './game-state'
import { activateObstacle, createInactiveObstacle, resetObstacle } from './world-entities'

const POOL_SIZE = 20
const LANES: Lane[] = ['left', 'center', 'right']
const OBSTACLE_TYPES: Obstacle['type'][] = ['boards', 'zamboni', 'crack', 'snow']
const PLAYER_Y = 0.75
const HIT_THRESHOLD = 0.05
const MIN_SPAWN_INTERVAL = 500 // ms at current speed

export type CollisionResult = 'hit' | 'deke_success' | 'passed' | null

export function createObstaclePool(): Obstacle[] {
  const pool: Obstacle[] = []
  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push(createInactiveObstacle())
  }
  return pool
}

function getInactiveObstacle(state: GameState): Obstacle | null {
  for (const obs of state.obstacles) {
    if (!obs.active) return obs
  }
  return null
}

function randomLane(): Lane {
  return LANES[Math.floor(Math.random() * 3)]
}

function adjacentLane(lane: Lane): Lane {
  if (lane === 'left') return 'center'
  if (lane === 'right') return 'center'
  // center — pick left or right randomly
  return Math.random() < 0.5 ? 'left' : 'right'
}

/** Returns the set of lanes currently blocked by active obstacles near the top. */
function lanesBlockedNearTop(state: GameState): Set<Lane> {
  const blocked = new Set<Lane>()
  for (const obs of state.obstacles) {
    if (!obs.active) continue
    if (obs.y < 0.15) {
      blocked.add(obs.lane)
      if (obs.secondLane) blocked.add(obs.secondLane)
    }
  }
  return blocked
}

export function spawnObstacle(state: GameState, now: number): void {
  if (state.screen !== 'playing') return

  // Enforce minimum interval
  const interval = MIN_SPAWN_INTERVAL / state.speed
  if (now - state.run.lastObstacleSpawnTime < interval) return

  // Determine spawn timing based on elapsed time
  const elapsed = state.elapsed / 1000 // in seconds
  let spawnChance: number

  if (elapsed < 30) {
    // First 30 seconds: ~1 obstacle every 3-4 seconds
    if (now - state.run.lastObstacleSpawnTime < state.run.nextObstacleSpawnInterval) return
    spawnChance = 1 // guaranteed if interval passed
  } else {
    // After 30s: density increases with speed
    const targetInterval = Math.max(800, 2500 / state.speed)
    if (now - state.run.lastObstacleSpawnTime < targetInterval) return
    spawnChance = 1
  }

  if (Math.random() > spawnChance) return

  const obs = getInactiveObstacle(state)
  if (!obs) return

  // Decide type
  let type: Obstacle['type']
  const isAdvancedEligible = elapsed >= 60
  let isMovingZamboni = false
  if (isAdvancedEligible && Math.random() < 0.12) {
    // 12% chance of moving zamboni (drives across the rink)
    type = 'zamboni'
    isMovingZamboni = true
  } else if (isAdvancedEligible && Math.random() < 0.15) {
    type = 'gate'
  } else {
    type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)]
  }

  // Pick lane
  let lane = randomLane()
  const blocked = lanesBlockedNearTop(state)

  // For gates, pick a lane pair that doesn't block all 3
  if (type === 'gate') {
    const second = adjacentLane(lane)
    // Check we don't block all 3 lanes
    const wouldBlock = new Set(blocked)
    wouldBlock.add(lane)
    wouldBlock.add(second)
    if (wouldBlock.size >= 3) {
      // Find a pair that leaves at least one lane open
      const pairs: [Lane, Lane][] = [
        ['left', 'center'],
        ['center', 'right'],
      ]
      let placed = false
      for (const [a, b] of pairs) {
        const test = new Set(blocked)
        test.add(a)
        test.add(b)
        if (test.size < 3) {
          lane = a
          obs.secondLane = b
          placed = true
          break
        }
      }
      if (!placed) return // can't safely place a gate
    } else {
      obs.secondLane = second
    }
    obs.width = 2
  } else {
    // Single-lane obstacle — make sure we don't block all 3
    const wouldBlock = new Set(blocked)
    wouldBlock.add(lane)
    if (wouldBlock.size >= 3) {
      // Pick a lane that's not blocked
      for (const l of LANES) {
        if (!blocked.has(l)) {
          lane = l
          break
        }
      }
    }
    obs.width = 1
    obs.secondLane = undefined
  }

  // Moving zamboni: starts on one side, drives to the other
  if (isMovingZamboni) {
    const startLeft = Math.random() < 0.5
    const movingX = startLeft ? GameState.LANE_X.left : GameState.LANE_X.right
    const movingTargetX = startLeft ? GameState.LANE_X.right : GameState.LANE_X.left
    activateObstacle(obs, {
      lane: startLeft ? 'left' : 'right',
      y: 0,
      type,
      width: obs.width,
      secondLane: obs.secondLane,
      moving: true,
      movingX,
      movingTargetX,
      movingSpeed: 0.0002 + Math.random() * 0.0001,
    })
  } else {
    activateObstacle(obs, {
      lane,
      y: 0,
      type,
      width: obs.width,
      secondLane: obs.secondLane,
      movingX: GameState.LANE_X[lane],
      movingTargetX: GameState.LANE_X[lane],
    })
  }

  state.run.lastObstacleSpawnTime = now
  state.run.nextObstacleSpawnInterval = 3000 + Math.random() * 1000
}

export function updateObstacles(state: GameState, dt: number, viewportHeight: number): void {
  const speed = state.currentSpeed / Math.max(viewportHeight, 1)
  for (const obs of state.obstacles) {
    if (!obs.active) continue
    obs.y += speed * dt
    if (obs.y > 1.2) {
      resetObstacle(obs)
      continue
    }

    // Animate moving zamboni across lanes
    if (obs.moving) {
      const dir = obs.movingTargetX > obs.movingX ? 1 : -1
      obs.movingX += dir * obs.movingSpeed * dt
      // Check if reached target
      if ((dir > 0 && obs.movingX >= obs.movingTargetX) ||
          (dir < 0 && obs.movingX <= obs.movingTargetX)) {
        obs.movingX = obs.movingTargetX
      }
      // Update lane to match current position (for spawn-safety checks)
      let closestLane: Lane = obs.lane
      let closestDist = Infinity
      for (const l of LANES) {
        const d = Math.abs(obs.movingX - GameState.LANE_X[l])
        if (d < closestDist) {
          closestDist = d
          closestLane = l
        }
      }
      obs.lane = closestLane
    }
  }
}

/** Check if player's X position overlaps with an obstacle's X position */
function isPlayerOverlapping(obs: Obstacle, state: GameState): boolean {
  const hitWidth = 0.12 // how close in X the player needs to be to collide

  if (obs.moving) {
    // Moving obstacle: check continuous X position
    return Math.abs(state.avatarX - obs.movingX) < hitWidth
  }

  // Static obstacle: check lane match
  const inLane = obs.lane === state.lane ||
    (obs.secondLane !== undefined && obs.secondLane === state.lane)
  return inLane
}

export function checkCollisions(
  state: GameState,
  now: number,
): CollisionResult {
  // Process ALL obstacles per frame (priority: hit > deke_success > passed)
  let result: CollisionResult = null

  for (const obs of state.obstacles) {
    if (!obs.active || obs.passed) continue
    if (state.screen === 'game_over') break

    // Check if obstacle has passed the player line
    if (obs.y > PLAYER_Y + HIT_THRESHOLD) {
      obs.passed = true

      // Was the player overlapping this obstacle when it passed?
      const overlapping = isPlayerOverlapping(obs, state)

      if (!overlapping) {
        if (!result) result = 'passed'
        continue
      }

      if (state.isDekeInvincible) {
        state.lastDekeSuccessTime = now
        if (result !== 'hit') result = 'deke_success'
        continue
      }

      if (state.isLaneTransitioning) continue

      // Obstacle passed through player — collision
      state.loseLife()
      result = 'hit'
      continue
    }

    // Check active collision zone
    const inHitZone = Math.abs(obs.y - PLAYER_Y) < HIT_THRESHOLD
    if (!inHitZone) continue

    if (!isPlayerOverlapping(obs, state)) continue

    // Skip during invincibility or lane transition
    if (state.isDekeInvincible) {
      obs.passed = true
      state.lastDekeSuccessTime = now
      if (result !== 'hit') result = 'deke_success'
      continue
    }

    if (state.isLaneTransitioning) continue

    // Collision!
    obs.passed = true
    state.loseLife()
    result = 'hit'
  }

  return result
}
