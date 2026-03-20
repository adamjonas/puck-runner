import type { Lane } from '@shared/protocol'
import type { Coin, Obstacle } from './game-state'

export function createInactiveObstacle(): Obstacle {
  return {
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
  }
}

export function resetObstacle(obstacle: Obstacle): void {
  obstacle.lane = 'center'
  obstacle.y = 0
  obstacle.type = 'boards'
  obstacle.active = false
  obstacle.passed = false
  obstacle.width = 1
  obstacle.secondLane = undefined
  obstacle.moving = false
  obstacle.movingX = 0.5
  obstacle.movingTargetX = 0.5
  obstacle.movingSpeed = 0
}

interface ObstacleActivation {
  lane: Lane
  y: number
  type: Obstacle['type']
  width?: number
  secondLane?: Lane
  moving?: boolean
  movingX?: number
  movingTargetX?: number
  movingSpeed?: number
}

export function activateObstacle(obstacle: Obstacle, config: ObstacleActivation): void {
  obstacle.lane = config.lane
  obstacle.y = config.y
  obstacle.type = config.type
  obstacle.active = true
  obstacle.passed = false
  obstacle.width = config.width ?? 1
  obstacle.secondLane = config.secondLane
  obstacle.moving = config.moving ?? false
  obstacle.movingX = config.movingX ?? 0.5
  obstacle.movingTargetX = config.movingTargetX ?? obstacle.movingX
  obstacle.movingSpeed = config.movingSpeed ?? 0
}

export function createInactiveCoin(): Coin {
  return {
    lane: 'center',
    y: 0,
    active: false,
    collected: false,
  }
}

export function resetCoin(coin: Coin): void {
  coin.lane = 'center'
  coin.y = 0
  coin.active = false
  coin.collected = false
}

export function activateCoin(coin: Coin, lane: Lane, y: number): void {
  coin.lane = lane
  coin.y = y
  coin.active = true
  coin.collected = false
}
