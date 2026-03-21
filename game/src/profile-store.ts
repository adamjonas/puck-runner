import type { PlayerProfile } from './profiles'

const STORAGE_KEY = 'puck-runner-profiles'
const SCORE_RESET_MIGRATION_KEY = 'puck-runner-score-reset-cora-colby-v1'
const BUILTIN_SCORE_RESET_NAMES = new Set(['cora', 'colby'])

interface ProfileStoreOptions {
  isValidProfile: (value: unknown) => value is PlayerProfile
}

export function loadStoredProfiles(options: ProfileStoreOptions): PlayerProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.warn('puck-runner: corrupted profile data — resetting')
      localStorage.removeItem(STORAGE_KEY)
      return []
    }

    return parsed.filter(options.isValidProfile)
  } catch {
    console.warn('puck-runner: failed to load profiles — resetting')
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage completely unavailable
    }
    return []
  }
}

export function saveStoredProfiles(profiles: PlayerProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('puck-runner: localStorage quota exceeded — profiles not saved')
    } else {
      console.warn('puck-runner: failed to save profiles', err)
    }
  }
}

export function applyBuiltinScoreReset(profiles: PlayerProfile[]): PlayerProfile[] {
  if (hasAppliedScoreResetMigration()) {
    return profiles
  }

  let changed = false
  const nextProfiles = profiles.map((profile) => {
    if (!BUILTIN_SCORE_RESET_NAMES.has(profile.name.toLowerCase())) {
      return profile
    }
    if (profile.highScore === 0) {
      return profile
    }
    changed = true
    return {
      ...profile,
      highScore: 0,
    }
  })

  markScoreResetMigrationApplied()

  if (changed) {
    saveStoredProfiles(nextProfiles)
  }

  return nextProfiles
}

function hasAppliedScoreResetMigration(): boolean {
  try {
    return localStorage.getItem(SCORE_RESET_MIGRATION_KEY) === '1'
  } catch {
    return true
  }
}

function markScoreResetMigrationApplied(): void {
  try {
    localStorage.setItem(SCORE_RESET_MIGRATION_KEY, '1')
  } catch {
    // Storage unavailable; avoid blocking profile reads.
  }
}
