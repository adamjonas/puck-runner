/**
 * Family profiles with per-person high scores stored in localStorage.
 */

const STORAGE_KEY = 'puck-runner-profiles'
const MAX_PROFILES = 20

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerProfile {
  name: string
  highScore: number
  gamesPlayed: number
  bestCombo: string
  tutorialComplete: boolean
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load all profiles from localStorage. Returns [] on missing/corrupt data. */
export function loadProfiles(): PlayerProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.warn('puck-runner: corrupted profile data — resetting')
      localStorage.removeItem(STORAGE_KEY)
      return []
    }

    // Validate each entry
    return parsed.filter(isValidProfile)
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

/** Persist profiles to localStorage. */
export function saveProfiles(profiles: PlayerProfile[]): void {
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

/**
 * Create a new profile.
 *
 * @returns The new profile, or `null` if validation fails.
 */
export function addProfile(name: string): PlayerProfile | null {
  const trimmed = name.trim()

  // Validate name length
  if (trimmed.length < 1 || trimmed.length > 20) {
    console.warn('puck-runner: profile name must be 1-20 characters')
    return null
  }

  const profiles = loadProfiles()

  // Check for duplicates (case-insensitive)
  if (
    profiles.some(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    console.warn(`puck-runner: profile "${trimmed}" already exists`)
    return null
  }

  // Enforce max profiles
  if (profiles.length >= MAX_PROFILES) {
    console.warn(`puck-runner: maximum of ${MAX_PROFILES} profiles reached`)
    return null
  }

  const profile: PlayerProfile = {
    name: trimmed,
    highScore: 0,
    gamesPlayed: 0,
    bestCombo: '',
    tutorialComplete: false,
  }

  profiles.push(profile)
  saveProfiles(profiles)
  return profile
}

/**
 * Update a profile after a game.
 * Updates high score if beaten, increments gamesPlayed,
 * and optionally records the best combo name.
 *
 * @returns The updated profile, or `null` if not found.
 */
export function updateProfile(
  name: string,
  score: number,
  combo?: string,
  tutorialComplete?: boolean,
): PlayerProfile | null {
  const profiles = loadProfiles()
  const profile = profiles.find(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  )

  if (!profile) {
    console.warn(`puck-runner: profile "${name}" not found`)
    return null
  }

  profile.gamesPlayed++

  if (score > profile.highScore) {
    profile.highScore = score
  }

  if (combo && (!profile.bestCombo || combo !== profile.bestCombo)) {
    // Keep the "best" combo — prefer whichever was achieved most recently
    // when provided, since the caller only sends noteworthy combos.
    profile.bestCombo = combo
  }

  if (tutorialComplete !== undefined) {
    profile.tutorialComplete = tutorialComplete
  }

  saveProfiles(profiles)
  return { ...profile }
}

/** Return all profiles sorted by high score descending. */
export function getLeaderboard(): PlayerProfile[] {
  const profiles = loadProfiles()
  return profiles.sort((a, b) => b.highScore - a.highScore)
}

/**
 * Delete a profile by name.
 *
 * @returns `true` if the profile was found and removed.
 */
export function deleteProfile(name: string): boolean {
  const profiles = loadProfiles()
  const idx = profiles.findIndex(
    (p) => p.name.toLowerCase() === name.toLowerCase(),
  )

  if (idx === -1) {
    console.warn(`puck-runner: profile "${name}" not found`)
    return false
  }

  profiles.splice(idx, 1)
  saveProfiles(profiles)
  return true
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Runtime shape check for a single profile object. Backfills missing fields. */
function isValidProfile(value: unknown): value is PlayerProfile {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  const valid =
    typeof obj.name === 'string' &&
    typeof obj.highScore === 'number' &&
    typeof obj.gamesPlayed === 'number' &&
    typeof obj.bestCombo === 'string'
  if (!valid) return false
  // Backward compat: default tutorialComplete to false for old profiles
  if (typeof obj.tutorialComplete !== 'boolean') {
    obj.tutorialComplete = false
  }
  return true
}
