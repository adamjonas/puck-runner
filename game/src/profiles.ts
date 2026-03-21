/**
 * Builtin family profiles plus custom player profiles stored in localStorage.
 */

import {
  applyBuiltinScoreReset,
  loadStoredProfiles,
  saveStoredProfiles,
} from './profile-store'

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
  jerseyNumber?: number
  avatar?: string
  tagline?: string
  nickname?: string
}

export const BUILTIN_PROFILES: PlayerProfile[] = [
  {
    name: 'Cora',
    jerseyNumber: 12,
    avatar: '/avatars/cora.jpg',
    tagline: 'Scores goals and plays violin — on the same day!',
    highScore: 0,
    gamesPlayed: 0,
    bestCombo: '',
    tutorialComplete: false,
  },
  {
    name: 'Colby',
    nickname: 'Zamboni Car',
    jerseyNumber: 27,
    avatar: '/avatars/colby.jpg',
    tagline: 'Goes side to side. Favorite move: one foot stop.',
    highScore: 0,
    gamesPlayed: 0,
    bestCombo: '',
    tutorialComplete: false,
  },
]

const BUILTIN_NAME_SET = new Set(BUILTIN_PROFILES.map((profile) => profile.name.toLowerCase()))

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load builtin profiles merged with saved progress, followed by custom profiles. */
export function loadProfiles(): PlayerProfile[] {
  const storedProfiles = applyBuiltinScoreReset(loadStoredProfiles({ isValidProfile }))
  const storedByName = new Map(
    storedProfiles.map((profile) => [profile.name.toLowerCase(), profile]),
  )

  const builtinProfiles = BUILTIN_PROFILES.map((profile) =>
    mergeBuiltinProfile(profile, storedByName.get(profile.name.toLowerCase())),
  )

  const customProfiles = storedProfiles
    .filter((profile) => !isBuiltinProfileName(profile.name))
    .map(normalizeCustomProfile)

  return [...builtinProfiles, ...dedupeProfiles(customProfiles)]
}

/** Persist profiles to localStorage. */
export function saveProfiles(profiles: PlayerProfile[]): void {
  saveStoredProfiles(buildPersistedProfiles(profiles))
}

export function addProfile(name: string): PlayerProfile | null {
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 20) {
    console.warn('puck-runner: profile name must be 1-20 characters')
    return null
  }

  const profiles = loadProfiles()
  if (profiles.some((profile) => profile.name.toLowerCase() === trimmed.toLowerCase())) {
    console.warn(`puck-runner: profile "${trimmed}" already exists`)
    return null
  }

  const customProfileCount = profiles.filter(
    (profile) => !isBuiltinProfileName(profile.name),
  ).length

  if (customProfileCount >= MAX_PROFILES) {
    console.warn(`puck-runner: maximum of ${MAX_PROFILES} profiles reached`)
    return null
  }

  const profile = normalizeCustomProfile({
    name: trimmed,
    highScore: 0,
    gamesPlayed: 0,
    bestCombo: '',
    tutorialComplete: false,
  })

  saveProfiles([...profiles, profile])
  return profile
}

export function deleteProfile(name: string): boolean {
  if (isBuiltinProfileName(name)) {
    console.warn(`puck-runner: cannot delete builtin profile "${name}"`)
    return false
  }

  const profiles = loadProfiles()
  const nextProfiles = profiles.filter(
    (profile) => profile.name.toLowerCase() !== name.toLowerCase(),
  )

  if (nextProfiles.length === profiles.length) {
    console.warn(`puck-runner: profile "${name}" not found`)
    return false
  }

  saveProfiles(nextProfiles)
  return true
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
  return updateStoredProfile(name, (profile) => {
    profile.gamesPlayed++

    if (score > profile.highScore) {
      profile.highScore = score
    }

    if (combo && (!profile.bestCombo || combo !== profile.bestCombo)) {
      profile.bestCombo = combo
    }

    if (tutorialComplete !== undefined) {
      profile.tutorialComplete = tutorialComplete
    }
  })
}

interface RunResultUpdate {
  score: number
  combo?: string
}

export function recordRunResult(
  name: string,
  result: RunResultUpdate,
): PlayerProfile | null {
  return updateStoredProfile(name, (profile) => {
    profile.gamesPlayed++

    if (result.score > profile.highScore) {
      profile.highScore = result.score
    }

    if (result.combo && (!profile.bestCombo || result.combo !== profile.bestCombo)) {
      profile.bestCombo = result.combo
    }
  })
}

/**
 * Mark a player's tutorial as complete without affecting gamesPlayed or score.
 *
 * @returns The updated profile, or `null` if not found.
 */
export function setTutorialComplete(name: string): PlayerProfile | null {
  return updateStoredProfile(name, (profile) => {
    profile.tutorialComplete = true
  })
}

export function markTutorialComplete(name: string): PlayerProfile | null {
  return setTutorialComplete(name)
}

/** Return all profiles sorted by high score descending. */
export function getLeaderboard(): PlayerProfile[] {
  const profiles = loadProfiles()
  return [...profiles].sort((a, b) => b.highScore - a.highScore)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function updateStoredProfile(
  name: string,
  mutate: (profile: PlayerProfile) => void,
): PlayerProfile | null {
  const profiles = loadProfiles()
  const profile = profiles.find(
    (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
  )

  if (!profile) {
    console.warn(`puck-runner: profile "${name}" not found`)
    return null
  }

  mutate(profile)
  saveProfiles(profiles)
  return { ...profile }
}

function isBuiltinProfileName(name: string): boolean {
  return BUILTIN_NAME_SET.has(name.toLowerCase())
}

function mergeBuiltinProfile(
  builtin: PlayerProfile,
  saved?: PlayerProfile,
): PlayerProfile {
  return {
    ...builtin,
    highScore: saved?.highScore ?? builtin.highScore,
    gamesPlayed: saved?.gamesPlayed ?? builtin.gamesPlayed,
    bestCombo: saved?.bestCombo ?? builtin.bestCombo,
    tutorialComplete: saved?.tutorialComplete ?? builtin.tutorialComplete,
  }
}

function normalizeCustomProfile(profile: PlayerProfile): PlayerProfile {
  return {
    name: profile.name.trim(),
    highScore: profile.highScore,
    gamesPlayed: profile.gamesPlayed,
    bestCombo: profile.bestCombo,
    tutorialComplete: profile.tutorialComplete,
  }
}

function dedupeProfiles(profiles: PlayerProfile[]): PlayerProfile[] {
  const seen = new Set<string>()
  const deduped: PlayerProfile[] = []

  for (const profile of profiles) {
    const key = profile.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(profile)
  }

  return deduped
}

function buildPersistedProfiles(profiles: PlayerProfile[]): PlayerProfile[] {
  return [
    ...BUILTIN_PROFILES.map((profile) =>
      mergeBuiltinProfile(
        profile,
        profiles.find((candidate) => candidate.name.toLowerCase() === profile.name.toLowerCase()),
      ),
    ),
    ...dedupeProfiles(
      profiles
        .filter((profile) => !isBuiltinProfileName(profile.name))
        .map(normalizeCustomProfile),
    ),
  ]
}

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
  if (typeof obj.tutorialComplete !== 'boolean') {
    obj.tutorialComplete = false
  }
  return true
}
