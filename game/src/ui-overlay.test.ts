import { describe, it, expect } from 'vitest'
import { resolveSelectedProfile } from './ui-overlay'
import type { PlayerProfile } from './profiles'

function makeProfile(name: string): PlayerProfile {
  return {
    name,
    highScore: 0,
    gamesPlayed: 0,
    bestCombo: '',
    tutorialComplete: false,
  }
}

describe('resolveSelectedProfile', () => {
  it('does not auto-select the first saved profile', () => {
    expect(resolveSelectedProfile(null, [makeProfile('Cora')])).toBeNull()
  })

  it('preserves an existing selected profile when it still exists', () => {
    expect(resolveSelectedProfile('Cora', [makeProfile('Cora'), makeProfile('Jonas')])).toBe('Cora')
  })

  it('clears the selection when the selected profile no longer exists', () => {
    expect(resolveSelectedProfile('Cora', [makeProfile('Jonas')])).toBeNull()
  })
})
