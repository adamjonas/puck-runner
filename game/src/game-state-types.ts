import type { Lane } from '@shared/protocol'

export interface Obstacle {
  lane: Lane
  y: number
  type: 'boards' | 'zamboni' | 'crack' | 'snow' | 'gate'
  active: boolean
  passed: boolean
  width: number
  secondLane?: Lane
  moving: boolean
  movingX: number
  movingTargetX: number
  movingSpeed: number
}

export interface Coin {
  lane: Lane
  y: number
  active: boolean
  collected: boolean
}

export interface RunState {
  lastSurvivalTick: number
  lastStickhandlingTick: number
  lastSpeedMilestone: number
  firstCoinAnnounced: boolean
  dekeUnlockAnnounced: boolean
  onFireAnnounced: boolean
  lastObstacleSpawnTime: number
  nextObstacleSpawnInterval: number
  lastCoinSpawnTime: number
  nextCoinSpawnInterval: number
}

export type GameOverAction = 'menu' | 'replay' | null
