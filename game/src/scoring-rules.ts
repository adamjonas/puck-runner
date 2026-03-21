import type { Lane } from '@shared/protocol'
import type { GameEvent } from './combos'
import type { SoundName } from './audio'
import { SILKY_MITTS_THRESHOLD_MS } from './game-state-config'

export type ScoringAnnouncement =
  | 'deke_success'
  | 'first_coin'
  | 'multiplier_5x'
  | 'life_lost'
  | 'game_over'
  | 'new_high_score'
  | 'speed_milestone'
  | 'deke_unlocked'

export interface HitResolution {
  sounds: SoundName[]
  announcements: ScoringAnnouncement[]
  clearAnnouncer: boolean
  muteAudio: boolean
  persistRunScore: number | null
}

export interface CoinCollectionResolution {
  events: GameEvent[]
  sounds: SoundName[]
  announcements: ScoringAnnouncement[]
  firstCoinAnnounced: boolean
  onFireAnnounced: boolean
}

export interface StickhandlingResolution {
  scoreDelta: number
  lastStickhandlingTick: number
  silkyMittsAwarded: boolean
  comboText: string | null
  comboTextUntil: number | null
  sound: SoundName | null
}

export interface SurvivalResolution {
  scoreDelta: number
  lastSurvivalTick: number
}

export interface SpeedAnnouncementResolution {
  announcements: ScoringAnnouncement[]
  lastSpeedMilestone: number
  dekeUnlockAnnounced: boolean
}

export function resolveHitEffects(params: {
  lives: number
  score: number
  highScore: number
  playerName: string
}): HitResolution {
  const reachedNewHighScore = params.score >= params.highScore && params.score > 0

  if (params.lives > 0) {
    return {
      sounds: ['hit', 'life_lost'],
      announcements: ['life_lost'],
      clearAnnouncer: false,
      muteAudio: false,
      persistRunScore: null,
    }
  }

  return {
    sounds: ['hit', 'game_over'],
    announcements: reachedNewHighScore ? ['game_over', 'new_high_score'] : ['game_over'],
    clearAnnouncer: true,
    muteAudio: true,
    persistRunScore: params.playerName ? params.score : null,
  }
}

export function resolveCoinCollectionEffects(params: {
  collected: number
  firstCoinAnnounced: boolean
  multiplier: number
  onFireAnnounced: boolean
  lane: Lane
  now: number
}): CoinCollectionResolution {
  if (params.collected <= 0) {
    return {
      events: [],
      sounds: [],
      announcements: [],
      firstCoinAnnounced: params.firstCoinAnnounced,
      onFireAnnounced: params.onFireAnnounced,
    }
  }

  const events: GameEvent[] = []
  for (let i = 0; i < params.collected; i++) {
    events.push({ type: 'coin_collected', time: params.now, lane: params.lane })
  }

  const announcements: ScoringAnnouncement[] = []
  let firstCoinAnnounced = params.firstCoinAnnounced
  let onFireAnnounced = params.onFireAnnounced

  if (!firstCoinAnnounced) {
    announcements.push('first_coin')
    firstCoinAnnounced = true
  }

  if (params.multiplier < 5) {
    onFireAnnounced = false
  } else if (!onFireAnnounced) {
    announcements.push('multiplier_5x')
    onFireAnnounced = true
  }

  return {
    events,
    sounds: ['coin'],
    announcements,
    firstCoinAnnounced,
    onFireAnnounced,
  }
}

export function resolveStickhandlingUpdate(params: {
  screen: string
  stickhandlingActive: boolean
  stickhandlingFrequency: number
  lastStickhandlingTick: number
  stickhandlingStreakStart: number
  silkyMittsAwarded: boolean
  now: number
}): StickhandlingResolution {
  if (!(params.stickhandlingActive && params.screen === 'playing')) {
    return {
      scoreDelta: 0,
      lastStickhandlingTick: params.now,
      silkyMittsAwarded: params.silkyMittsAwarded,
      comboText: null,
      comboTextUntil: null,
      sound: null,
    }
  }

  let scoreDelta = 0
  let lastStickhandlingTick = params.lastStickhandlingTick
  let silkyMittsAwarded = params.silkyMittsAwarded
  let comboText: string | null = null
  let comboTextUntil: number | null = null
  let sound: SoundName | null = null

  if (params.now - params.lastStickhandlingTick >= 1000) {
    scoreDelta += params.stickhandlingFrequency >= 4.0 ? 10 : 5
    lastStickhandlingTick = params.now
  }

  if (
    params.stickhandlingStreakStart > 0 &&
    !silkyMittsAwarded &&
    params.now - params.stickhandlingStreakStart >= SILKY_MITTS_THRESHOLD_MS
  ) {
    silkyMittsAwarded = true
    scoreDelta += 50
    comboText = 'SILKY MITTS!'
    comboTextUntil = params.now + 2000
    sound = 'silky_mitts'
  }

  return {
    scoreDelta,
    lastStickhandlingTick,
    silkyMittsAwarded,
    comboText,
    comboTextUntil,
    sound,
  }
}

export function resolveSurvivalScore(params: {
  lastSurvivalTick: number
  now: number
}): SurvivalResolution {
  if (params.now - params.lastSurvivalTick < 1000) {
    return {
      scoreDelta: 0,
      lastSurvivalTick: params.lastSurvivalTick,
    }
  }

  return {
    scoreDelta: 1,
    lastSurvivalTick: params.now,
  }
}

export function resolveSpeedAnnouncements(params: {
  speed: number
  lastSpeedMilestone: number
  isDekeUnlocked: boolean
  dekeUnlockAnnounced: boolean
}): SpeedAnnouncementResolution {
  const announcements: ScoringAnnouncement[] = []
  let lastSpeedMilestone = params.lastSpeedMilestone
  let dekeUnlockAnnounced = params.dekeUnlockAnnounced

  if (params.speed >= lastSpeedMilestone + 0.5) {
    lastSpeedMilestone = Math.floor(params.speed * 2) / 2
    announcements.push('speed_milestone')
  }

  if (params.isDekeUnlocked && !dekeUnlockAnnounced) {
    dekeUnlockAnnounced = true
    announcements.push('deke_unlocked')
  }

  return {
    announcements,
    lastSpeedMilestone,
    dekeUnlockAnnounced,
  }
}
