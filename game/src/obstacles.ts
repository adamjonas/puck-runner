import type { Lane } from '@shared/protocol'
import type { Obstacle } from './game-state'
import { GameState } from './game-state'

const POOL_SIZE = 20
const LANES: Lane[] = ['left', 'center', 'right']
const OBSTACLE_TYPES: Obstacle['type'][] = ['boards', 'zamboni', 'crack', 'snow']
const PLAYER_Y = 0.75
const HIT_THRESHOLD = 0.05
const MIN_SPAWN_INTERVAL = 500 // ms at current speed

let lastSpawnTime = 0

export function createObstaclePool(): Obstacle[] {
  const pool: Obstacle[] = []
  for (let i = 0; i < POOL_SIZE; i++) {
    pool.push({
      lane: 'center',
      y: 0,
      type: 'boards',
      active: false,
      passed: false,
      width: 1,
      moving: false,
      movingX: 0.5,
      movingTargetX: 0.5,
      movingSpeed: 0,
    })
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
  if (now - lastSpawnTime < interval) return

  // Determine spawn timing based on elapsed time
  const elapsed = state.elapsed / 1000 // in seconds
  let spawnChance: number

  if (elapsed < 30) {
    // First 30 seconds: ~1 obstacle every 3-4 seconds
    // With 60fps calls, we need probability per frame
    const targetInterval = 3000 + Math.random() * 1000 // 3-4 seconds in ms
    if (now - lastSpawnTime < targetInterval) return
    spawnChance = 1 // guaranteed if interval passed
  } else {
    // After 30s: density increases with speed
    const targetInterval = Math.max(800, 2500 / state.speed)
    if (now - lastSpawnTime < targetInterval) return
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

  obs.lane = lane
  obs.y = 0
  obs.type = type
  obs.active = true
  obs.passed = false

  // Moving zamboni: starts on one side, drives to the other
  if (isMovingZamboni) {
    obs.moving = true
    const startLeft = Math.random() < 0.5
    obs.movingX = startLeft ? GameState.LANE_X.left : GameState.LANE_X.right
    obs.movingTargetX = startLeft ? GameState.LANE_X.right : GameState.LANE_X.left
    obs.movingSpeed = 0.0002 + Math.random() * 0.0001 // varies slightly
    obs.lane = startLeft ? 'left' : 'right' // initial lane for fallback
  } else {
    obs.moving = false
    obs.movingX = GameState.LANE_X[lane]
    obs.movingTargetX = GameState.LANE_X[lane]
    obs.movingSpeed = 0
  }

  lastSpawnTime = now
}

export function updateObstacles(state: GameState, dt: number, viewportHeight: number): void {
  const speed = state.currentSpeed / Math.max(viewportHeight, 1)
  for (const obs of state.obstacles) {
    if (!obs.active) continue
    obs.y += speed * dt
    if (obs.y > 1.2) {
      obs.active = false
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
): 'hit' | 'deke_success' | 'passed' | null {
  for (const obs of state.obstacles) {
    if (!obs.active || obs.passed) continue

    // Check if obstacle has passed the player line
    if (obs.y > PLAYER_Y + HIT_THRESHOLD) {
      obs.passed = true

      // Was the player overlapping this obstacle when it passed?
      const overlapping = isPlayerOverlapping(obs, state)

      if (!overlapping) {
        return 'passed'
      }

      if (state.isDekeInvincible) {
        state.lastDekeSuccessTime = now
        return 'deke_success'
      }

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
      return 'deke_success'
    }

    if (state.isLaneTransitioning) continue

    // Collision!
    obs.passed = true
    state.loseLife()
    return 'hit'
  }

  return null
}
