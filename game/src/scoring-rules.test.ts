import { describe, expect, it } from 'vitest'
import {
  resolveCoinCollectionEffects,
  resolveHitEffects,
  resolveSpeedAnnouncements,
  resolveStickhandlingUpdate,
  resolveSurvivalScore,
} from './scoring-rules'

describe('scoring-rules', () => {
  it('returns life-lost effects when lives remain', () => {
    expect(resolveHitEffects({
      lives: 2,
      score: 50,
      highScore: 100,
      playerName: 'Cora',
    })).toEqual({
      sounds: ['hit', 'life_lost'],
      announcements: ['life_lost'],
      clearAnnouncer: false,
      muteAudio: false,
      persistRunScore: null,
    })
  })

  it('returns game-over effects and persistence when no lives remain', () => {
    expect(resolveHitEffects({
      lives: 0,
      score: 120,
      highScore: 120,
      playerName: 'Cora',
    })).toEqual({
      sounds: ['hit', 'game_over'],
      announcements: ['game_over', 'new_high_score'],
      clearAnnouncer: true,
      muteAudio: true,
      persistRunScore: 120,
    })
  })

  it('resolves first-coin and on-fire announcements from collection events', () => {
    expect(resolveCoinCollectionEffects({
      collected: 2,
      firstCoinAnnounced: false,
      multiplier: 5,
      onFireAnnounced: false,
      lane: 'left',
      now: 1000,
    })).toEqual({
      events: [
        { type: 'coin_collected', time: 1000, lane: 'left' },
        { type: 'coin_collected', time: 1000, lane: 'left' },
      ],
      sounds: ['coin'],
      announcements: ['first_coin', 'multiplier_5x'],
      firstCoinAnnounced: true,
      onFireAnnounced: true,
    })
  })

  it('resolves stickhandling score and silky mitts bonus', () => {
    expect(resolveStickhandlingUpdate({
      screen: 'playing',
      stickhandlingActive: true,
      stickhandlingFrequency: 4.2,
      lastStickhandlingTick: 0,
      stickhandlingStreakStart: 0,
      silkyMittsAwarded: false,
      now: 1000,
    }).scoreDelta).toBe(10)

    expect(resolveStickhandlingUpdate({
      screen: 'playing',
      stickhandlingActive: true,
      stickhandlingFrequency: 4.2,
      lastStickhandlingTick: 1000,
      stickhandlingStreakStart: 1000,
      silkyMittsAwarded: false,
      now: 6100,
    })).toMatchObject({
      scoreDelta: 60,
      silkyMittsAwarded: true,
      comboText: 'SILKY MITTS!',
      comboTextUntil: 8100,
      sound: 'silky_mitts',
    })
  })

  it('resolves survival and speed announcement updates', () => {
    expect(resolveSurvivalScore({ lastSurvivalTick: 1000, now: 2000 })).toEqual({
      scoreDelta: 1,
      lastSurvivalTick: 2000,
    })

    expect(resolveSpeedAnnouncements({
      speed: 1.5,
      lastSpeedMilestone: 1,
      isDekeUnlocked: true,
      dekeUnlockAnnounced: false,
    })).toEqual({
      announcements: ['speed_milestone', 'deke_unlocked'],
      lastSpeedMilestone: 1.5,
      dekeUnlockAnnounced: true,
    })
  })
})
