import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadProfiles,
  addProfile,
  updateProfile,
  getLeaderboard,
  deleteProfile,
} from './profiles'

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------

const storage = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
})

beforeEach(() => {
  storage.clear()
})

// ---------------------------------------------------------------------------
// loadProfiles
// ---------------------------------------------------------------------------

describe('loadProfiles', () => {
  it('returns empty array when no profiles saved', () => {
    expect(loadProfiles()).toEqual([])
  })

  it('returns saved profiles', () => {
    storage.set(
      'puck-runner-profiles',
      JSON.stringify([
        { name: 'Alice', highScore: 100, gamesPlayed: 5, bestCombo: '' },
      ]),
    )
    const profiles = loadProfiles()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('Alice')
  })

  it('handles corrupted localStorage gracefully (invalid JSON)', () => {
    storage.set('puck-runner-profiles', 'not valid json{{{')
    const profiles = loadProfiles()
    expect(profiles).toEqual([])
  })

  it('handles corrupted localStorage gracefully (not an array)', () => {
    storage.set('puck-runner-profiles', JSON.stringify({ name: 'bad' }))
    const profiles = loadProfiles()
    expect(profiles).toEqual([])
  })

  it('filters out entries with invalid shape', () => {
    storage.set(
      'puck-runner-profiles',
      JSON.stringify([
        { name: 'Valid', highScore: 50, gamesPlayed: 1, bestCombo: '' },
        { name: 123, highScore: 'bad' }, // invalid
        null,
        'string-entry',
      ]),
    )
    const profiles = loadProfiles()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('Valid')
  })
})

// ---------------------------------------------------------------------------
// addProfile
// ---------------------------------------------------------------------------

describe('addProfile', () => {
  it('creates a new profile with name, highScore=0, gamesPlayed=0', () => {
    const profile = addProfile('Wayne')
    expect(profile).not.toBeNull()
    expect(profile!.name).toBe('Wayne')
    expect(profile!.highScore).toBe(0)
    expect(profile!.gamesPlayed).toBe(0)
    expect(profile!.bestCombo).toBe('')
  })

  it('persists the profile to localStorage', () => {
    addProfile('Wayne')
    const stored = loadProfiles()
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('Wayne')
  })

  it('trims whitespace from names', () => {
    const profile = addProfile('  Wayne  ')
    expect(profile).not.toBeNull()
    expect(profile!.name).toBe('Wayne')
  })

  it('rejects empty names', () => {
    expect(addProfile('')).toBeNull()
    expect(addProfile('   ')).toBeNull()
  })

  it('rejects names longer than 20 characters', () => {
    const longName = 'A'.repeat(21)
    expect(addProfile(longName)).toBeNull()
  })

  it('accepts names exactly 20 characters', () => {
    const name = 'A'.repeat(20)
    expect(addProfile(name)).not.toBeNull()
  })

  it('rejects duplicate names (case-insensitive)', () => {
    addProfile('Wayne')
    expect(addProfile('wayne')).toBeNull()
    expect(addProfile('WAYNE')).toBeNull()
    expect(addProfile('Wayne')).toBeNull()
  })

  it('enforces max 20 profiles', () => {
    for (let i = 0; i < 20; i++) {
      expect(addProfile(`Player${i}`)).not.toBeNull()
    }
    expect(addProfile('Player20')).toBeNull()
    expect(loadProfiles()).toHaveLength(20)
  })
})

// ---------------------------------------------------------------------------
// updateProfile
// ---------------------------------------------------------------------------

describe('updateProfile', () => {
  beforeEach(() => {
    addProfile('Wayne')
  })

  it('updates highScore if new score is higher', () => {
    const updated = updateProfile('Wayne', 500)
    expect(updated).not.toBeNull()
    expect(updated!.highScore).toBe(500)
  })

  it('does NOT update highScore if new score is lower', () => {
    updateProfile('Wayne', 500)
    const updated = updateProfile('Wayne', 200)
    expect(updated).not.toBeNull()
    expect(updated!.highScore).toBe(500)
  })

  it('does NOT update highScore if new score is equal', () => {
    updateProfile('Wayne', 500)
    const updated = updateProfile('Wayne', 500)
    expect(updated).not.toBeNull()
    expect(updated!.highScore).toBe(500)
  })

  it('increments gamesPlayed', () => {
    updateProfile('Wayne', 100)
    updateProfile('Wayne', 200)
    const updated = updateProfile('Wayne', 50)
    expect(updated).not.toBeNull()
    expect(updated!.gamesPlayed).toBe(3)
  })

  it('updates bestCombo when provided', () => {
    const updated = updateProfile('Wayne', 100, 'THE SNIPE')
    expect(updated).not.toBeNull()
    expect(updated!.bestCombo).toBe('THE SNIPE')
  })

  it('returns null for non-existent profile', () => {
    expect(updateProfile('Nobody', 100)).toBeNull()
  })

  it('finds profile case-insensitively', () => {
    const updated = updateProfile('wayne', 300)
    expect(updated).not.toBeNull()
    expect(updated!.highScore).toBe(300)
  })

  it('persists changes to localStorage', () => {
    updateProfile('Wayne', 999)
    const stored = loadProfiles()
    expect(stored[0].highScore).toBe(999)
    expect(stored[0].gamesPlayed).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// getLeaderboard
// ---------------------------------------------------------------------------

describe('getLeaderboard', () => {
  it('returns profiles sorted by highScore descending', () => {
    addProfile('Alice')
    addProfile('Bob')
    addProfile('Charlie')
    updateProfile('Alice', 100)
    updateProfile('Bob', 300)
    updateProfile('Charlie', 200)

    const board = getLeaderboard()
    expect(board).toHaveLength(3)
    expect(board[0].name).toBe('Bob')
    expect(board[0].highScore).toBe(300)
    expect(board[1].name).toBe('Charlie')
    expect(board[1].highScore).toBe(200)
    expect(board[2].name).toBe('Alice')
    expect(board[2].highScore).toBe(100)
  })

  it('returns empty array when no profiles exist', () => {
    expect(getLeaderboard()).toEqual([])
  })

  it('handles profiles with equal scores', () => {
    addProfile('Alice')
    addProfile('Bob')
    updateProfile('Alice', 100)
    updateProfile('Bob', 100)

    const board = getLeaderboard()
    expect(board).toHaveLength(2)
    // Both have 100, just verify they're both present
    expect(board.every((p) => p.highScore === 100)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// deleteProfile
// ---------------------------------------------------------------------------

describe('deleteProfile', () => {
  it('removes the profile', () => {
    addProfile('Wayne')
    expect(deleteProfile('Wayne')).toBe(true)
    expect(loadProfiles()).toHaveLength(0)
  })

  it('returns false for non-existent profile', () => {
    expect(deleteProfile('Nobody')).toBe(false)
  })

  it('finds profile case-insensitively', () => {
    addProfile('Wayne')
    expect(deleteProfile('wayne')).toBe(true)
    expect(loadProfiles()).toHaveLength(0)
  })

  it('only removes the targeted profile', () => {
    addProfile('Alice')
    addProfile('Bob')
    deleteProfile('Alice')

    const remaining = loadProfiles()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].name).toBe('Bob')
  })

  it('persists deletion to localStorage', () => {
    addProfile('Wayne')
    deleteProfile('Wayne')
    // Re-load from storage to verify
    const stored = loadProfiles()
    expect(stored).toHaveLength(0)
  })
})
