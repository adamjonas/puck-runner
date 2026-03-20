import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  BUILTIN_PROFILES,
  addProfile,
  deleteProfile,
  getLeaderboard,
  loadProfiles,
  updateProfile,
} from './profiles'

const storage = new Map<string, string>()
const SCORE_RESET_MIGRATION_KEY = 'puck-runner-score-reset-cora-colby-v1'

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
})

beforeEach(() => {
  storage.clear()
})

describe('loadProfiles', () => {
  it('returns builtin profiles when no profiles are saved', () => {
    expect(loadProfiles()).toEqual(BUILTIN_PROFILES)
  })

  it('merges saved builtin progress and appends custom profiles', () => {
    storage.set(SCORE_RESET_MIGRATION_KEY, '1')
    storage.set(
      'puck-runner-profiles',
      JSON.stringify([
        {
          name: 'Cora',
          highScore: 240,
          gamesPlayed: 5,
          bestCombo: 'THE SNIPE',
          tutorialComplete: true,
          avatar: '/avatars/not-cora.jpg',
        },
        {
          name: 'Colby',
          highScore: 80,
          gamesPlayed: 2,
          bestCombo: '',
          tutorialComplete: false,
        },
        {
          name: 'Wayne',
          highScore: 999,
          gamesPlayed: 9,
          bestCombo: 'LEGACY',
          tutorialComplete: true,
        },
      ]),
    )

    const profiles = loadProfiles()

    expect(profiles).toHaveLength(3)
    expect(profiles[0]).toMatchObject({
      name: 'Cora',
      highScore: 240,
      avatar: '/avatars/cora.jpg',
      jerseyNumber: 12,
    })
    expect(profiles[1]).toMatchObject({
      name: 'Colby',
      highScore: 80,
      avatar: '/avatars/colby.jpg',
      jerseyNumber: 27,
    })
    expect(profiles[2]).toMatchObject({
      name: 'Wayne',
      highScore: 999,
      gamesPlayed: 9,
      bestCombo: 'LEGACY',
      tutorialComplete: true,
    })
  })

  it('handles corrupted localStorage gracefully', () => {
    storage.set('puck-runner-profiles', 'not valid json{{{')

    expect(loadProfiles()).toEqual(BUILTIN_PROFILES)
  })

  it('resets saved scores for Cora and Colby once', () => {
    storage.set(
      'puck-runner-profiles',
      JSON.stringify([
        {
          name: 'Cora',
          highScore: 240,
          gamesPlayed: 5,
          bestCombo: 'THE SNIPE',
          tutorialComplete: true,
        },
        {
          name: 'Colby',
          highScore: 80,
          gamesPlayed: 2,
          bestCombo: 'WHEELS',
          tutorialComplete: true,
        },
        {
          name: 'Wayne',
          highScore: 999,
          gamesPlayed: 9,
          bestCombo: 'LEGACY',
          tutorialComplete: true,
        },
      ]),
    )

    const profiles = loadProfiles()

    expect(profiles[0]).toMatchObject({
      name: 'Cora',
      highScore: 0,
      gamesPlayed: 5,
      bestCombo: 'THE SNIPE',
    })
    expect(profiles[1]).toMatchObject({
      name: 'Colby',
      highScore: 0,
      gamesPlayed: 2,
      bestCombo: 'WHEELS',
    })
    expect(profiles[2]).toMatchObject({
      name: 'Wayne',
      highScore: 999,
    })
    expect(storage.get(SCORE_RESET_MIGRATION_KEY)).toBe('1')
  })
})

describe('addProfile', () => {
  it('creates and persists a custom profile', () => {
    const created = addProfile('Wayne')

    expect(created).toMatchObject({
      name: 'Wayne',
      highScore: 0,
      gamesPlayed: 0,
      bestCombo: '',
      tutorialComplete: false,
    })

    expect(loadProfiles().map((profile) => profile.name)).toEqual(['Cora', 'Colby', 'Wayne'])
  })

  it('rejects duplicates against builtin names', () => {
    expect(addProfile('cora')).toBeNull()
  })

  it('allows 20 custom profiles in addition to the builtin skaters', () => {
    for (let i = 0; i < 20; i++) {
      expect(addProfile(`Player${i}`)).not.toBeNull()
    }

    expect(addProfile('Player20')).toBeNull()
    expect(loadProfiles()).toHaveLength(22)
  })
})

describe('deleteProfile', () => {
  it('does not delete builtin profiles', () => {
    expect(deleteProfile('Cora')).toBe(false)
    expect(loadProfiles().map((profile) => profile.name)).toEqual(['Cora', 'Colby'])
  })

  it('deletes custom profiles only', () => {
    addProfile('Wayne')

    expect(deleteProfile('Wayne')).toBe(true)
    expect(loadProfiles().map((profile) => profile.name)).toEqual(['Cora', 'Colby'])
  })
})

describe('updateProfile', () => {
  it('updates a builtin profile and persists the changes', () => {
    const updated = updateProfile('Cora', 500, 'THE SNIPE', true)

    expect(updated).toMatchObject({
      name: 'Cora',
      highScore: 500,
      gamesPlayed: 1,
      bestCombo: 'THE SNIPE',
      tutorialComplete: true,
      avatar: '/avatars/cora.jpg',
      jerseyNumber: 12,
    })
  })

  it('updates custom profiles too', () => {
    addProfile('Wayne')

    const updated = updateProfile('wayne', 300)

    expect(updated?.name).toBe('Wayne')
    expect(updated?.highScore).toBe(300)
  })
})

describe('getLeaderboard', () => {
  it('returns builtin and custom profiles sorted by highScore descending', () => {
    addProfile('Wayne')
    updateProfile('Cora', 100)
    updateProfile('Colby', 300)
    updateProfile('Wayne', 200)

    const board = getLeaderboard()

    expect(board.map((profile) => `${profile.name}:${profile.highScore}`)).toEqual([
      'Colby:300',
      'Wayne:200',
      'Cora:100',
    ])
  })
})
