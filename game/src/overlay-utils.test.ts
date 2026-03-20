// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  scaled,
  formatProfileLabel,
  easeOutCubic,
  css,
  div,
  span,
  ensureOverlayStyles,
  createProfileAvatar,
  FONT_TEXT,
  FONT_MONO,
  GOLD,
  RED,
  GREEN,
  Z_HUD,
  Z_OVERLAY,
} from './overlay-utils'
import type { PlayerProfile } from './profiles'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('FONT_TEXT includes system-ui', () => {
    expect(FONT_TEXT).toContain('system-ui')
  })

  it('FONT_MONO includes Menlo', () => {
    expect(FONT_MONO).toContain('Menlo')
  })

  it('GOLD is the correct hex value', () => {
    expect(GOLD).toBe('#FFD700')
  })

  it('RED is the correct hex value', () => {
    expect(RED).toBe('#e74c3c')
  })

  it('GREEN is the correct hex value', () => {
    expect(GREEN).toBe('#2ecc71')
  })

  it('Z_HUD is 100', () => {
    expect(Z_HUD).toBe(100)
  })

  it('Z_OVERLAY is 200', () => {
    expect(Z_OVERLAY).toBe(200)
  })

  it('Z_OVERLAY is higher than Z_HUD', () => {
    expect(Z_OVERLAY).toBeGreaterThan(Z_HUD)
  })
})

// ---------------------------------------------------------------------------
// scaled()
// ---------------------------------------------------------------------------

describe('scaled()', () => {
  it('returns a CSS clamp() string', () => {
    expect(scaled(100)).toMatch(/^clamp\(/)
    expect(scaled(100)).toMatch(/\)$/)
  })

  it('min is 55% of input rounded to nearest integer', () => {
    // 100 * 0.55 = 55
    expect(scaled(100)).toContain('55px')
    // 40 * 0.55 = 22
    expect(scaled(40)).toContain('22px')
    // 20 * 0.55 = 11
    expect(scaled(20)).toContain('11px')
  })

  it('max is the input px value', () => {
    expect(scaled(100)).toContain('100px')
    expect(scaled(40)).toContain('40px')
    expect(scaled(200)).toContain('200px')
  })

  it('vw value is px / 19.2 rounded to 2 decimal places', () => {
    // 100 / 19.2 = 5.21 (rounded to 2 dp)
    expect(scaled(100)).toContain('5.21vw')
    // 40 / 19.2 = 2.08
    expect(scaled(40)).toContain('2.08vw')
    // 192 / 19.2 = 10
    expect(scaled(192)).toContain('10vw')
  })

  it('produces a well-formed clamp() for a known input', () => {
    // 100 / 19.2 = 5.208… → 5.21, min = 55
    expect(scaled(100)).toBe('clamp(55px, 5.21vw, 100px)')
  })

  it('produces a well-formed clamp() for another known input', () => {
    // 40 / 19.2 = 2.083… → 2.08, min = 22
    expect(scaled(40)).toBe('clamp(22px, 2.08vw, 40px)')
  })
})

// ---------------------------------------------------------------------------
// formatProfileLabel()
// ---------------------------------------------------------------------------

describe('formatProfileLabel()', () => {
  const profileWithJersey: Pick<PlayerProfile, 'name' | 'jerseyNumber'> = {
    name: 'Cora',
    jerseyNumber: 12,
  }

  const profileWithoutJersey: Pick<PlayerProfile, 'name' | 'jerseyNumber'> = {
    name: 'Wayne',
    jerseyNumber: undefined,
  }

  it('includes jersey number when present', () => {
    expect(formatProfileLabel(profileWithJersey)).toBe('Cora #12')
  })

  it('omits jersey number when absent', () => {
    expect(formatProfileLabel(profileWithoutJersey)).toBe('Wayne')
  })

  it('defaults to lowercase (no uppercase flag)', () => {
    expect(formatProfileLabel(profileWithJersey)).toBe('Cora #12')
  })

  it('uppercases the name when uppercase=true', () => {
    expect(formatProfileLabel(profileWithJersey, true)).toBe('CORA #12')
  })

  it('uppercases name only, not the # prefix', () => {
    const result = formatProfileLabel(profileWithJersey, true)
    expect(result).toContain('#12')
    expect(result.startsWith('CORA')).toBe(true)
  })

  it('uppercase=false preserves original casing', () => {
    const mixed = { name: 'McGregor', jerseyNumber: 99 }
    expect(formatProfileLabel(mixed, false)).toBe('McGregor #99')
  })

  it('uppercase=true with no jersey number', () => {
    expect(formatProfileLabel(profileWithoutJersey, true)).toBe('WAYNE')
  })
})

// ---------------------------------------------------------------------------
// easeOutCubic()
// ---------------------------------------------------------------------------

describe('easeOutCubic()', () => {
  it('returns 0 at t=0', () => {
    expect(easeOutCubic(0)).toBe(0)
  })

  it('returns 1 at t=1', () => {
    expect(easeOutCubic(1)).toBe(1)
  })

  it('returns ~0.5 at midpoint (t=0.206) — known cubic root', () => {
    // easeOutCubic(t) = 0.5 when 1 - (1-t)^3 = 0.5 → t = 1 - (0.5)^(1/3) ≈ 0.2063
    const t = 1 - Math.pow(0.5, 1 / 3)
    expect(easeOutCubic(t)).toBeCloseTo(0.5, 10)
  })

  it('is monotonically increasing', () => {
    const steps = 20
    for (let i = 0; i < steps; i++) {
      const t1 = i / steps
      const t2 = (i + 1) / steps
      expect(easeOutCubic(t1)).toBeLessThan(easeOutCubic(t2))
    }
  })

  it('output at t=0.5 is greater than 0.5 (ease-out accelerates early)', () => {
    // ease-out means most progress happens early, so at t=0.5 we're past 50%
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })

  it('known value at t=0.5', () => {
    // 1 - (0.5)^3 = 1 - 0.125 = 0.875
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10)
  })
})

// ---------------------------------------------------------------------------
// css()
// ---------------------------------------------------------------------------

describe('css()', () => {
  it('applies styles to an element', () => {
    const el = document.createElement('div')
    css(el, { color: 'red', fontSize: '16px' })
    expect(el.style.color).toBe('red')
    expect(el.style.fontSize).toBe('16px')
  })

  it('does not remove existing styles not mentioned', () => {
    const el = document.createElement('div')
    el.style.fontWeight = 'bold'
    css(el, { color: 'blue' })
    expect(el.style.fontWeight).toBe('bold')
    expect(el.style.color).toBe('blue')
  })

  it('can overwrite an existing style', () => {
    const el = document.createElement('div')
    css(el, { opacity: '0.5' })
    css(el, { opacity: '1' })
    expect(el.style.opacity).toBe('1')
  })

  it('accepts an empty styles object without throwing', () => {
    const el = document.createElement('div')
    expect(() => css(el, {})).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// div()
// ---------------------------------------------------------------------------

describe('div()', () => {
  it('creates an HTMLDivElement', () => {
    const el = div()
    expect(el.tagName).toBe('DIV')
    expect(el instanceof HTMLDivElement).toBe(true)
  })

  it('creates a div with no styles when called with no arguments', () => {
    const el = div()
    expect(el.style.color).toBe('')
  })

  it('applies styles when provided', () => {
    const el = div({ color: 'green', fontSize: '24px' })
    expect(el.style.color).toBe('green')
    expect(el.style.fontSize).toBe('24px')
  })

  it('applies multiple style properties', () => {
    const el = div({ display: 'flex', alignItems: 'center', justifyContent: 'center' })
    expect(el.style.display).toBe('flex')
    expect(el.style.alignItems).toBe('center')
    expect(el.style.justifyContent).toBe('center')
  })
})

// ---------------------------------------------------------------------------
// span()
// ---------------------------------------------------------------------------

describe('span()', () => {
  it('creates an HTMLSpanElement', () => {
    const el = span('hello')
    expect(el.tagName).toBe('SPAN')
    expect(el instanceof HTMLSpanElement).toBe(true)
  })

  it('sets the text content', () => {
    const el = span('hello world')
    expect(el.textContent).toBe('hello world')
  })

  it('applies styles when provided', () => {
    const el = span('text', { color: 'gold', fontWeight: 'bold' })
    expect(el.style.color).toBe('gold')
    expect(el.style.fontWeight).toBe('bold')
  })

  it('creates a span with no extra styles when styles are omitted', () => {
    const el = span('text')
    expect(el.style.color).toBe('')
  })

  it('handles empty string text', () => {
    const el = span('')
    expect(el.textContent).toBe('')
  })
})

// ---------------------------------------------------------------------------
// ensureOverlayStyles()
// ---------------------------------------------------------------------------

describe('ensureOverlayStyles()', () => {
  // Note: the module-level `overlayStylesInjected` flag persists across tests
  // within the same module instance. Tests are ordered to account for this.

  it('injects a <style> element into document.head on first call', () => {
    const beforeCount = document.head.querySelectorAll('style').length
    ensureOverlayStyles()
    const afterCount = document.head.querySelectorAll('style').length
    // The very first call adds exactly one style element
    expect(afterCount).toBe(beforeCount + 1)
  })

  it('injected style contains the expected keyframe names', () => {
    // ensureOverlayStyles() was already called in the previous test;
    // calling again is a no-op but the element is still in document.head
    ensureOverlayStyles()
    const styles = Array.from(document.head.querySelectorAll('style'))
    const styleText = styles
      .map((s) => s.textContent || s.innerHTML || '')
      .join('\n')
    expect(styleText).toContain('overlay-score-pop')
    expect(styleText).toContain('overlay-message-rise')
    expect(styleText).toContain('overlay-celebration-glow')
    expect(styleText).toContain('overlay-confetti-fall')
  })

  it('is idempotent — calling multiple times does not add more style elements', () => {
    ensureOverlayStyles()
    const countAfterFirst = document.head.querySelectorAll('style').length

    ensureOverlayStyles()
    ensureOverlayStyles()
    const countAfterMore = document.head.querySelectorAll('style').length

    expect(countAfterMore).toBe(countAfterFirst)
  })
})

// ---------------------------------------------------------------------------
// createProfileAvatar()
// ---------------------------------------------------------------------------

describe('createProfileAvatar()', () => {
  const baseProfile: PlayerProfile = {
    name: 'Cora',
    highScore: 0,
    gamesPlayed: 0,
    bestCombo: '',
    tutorialComplete: false,
    jerseyNumber: 12,
  }

  it('returns an <img> element when profile has an avatar URL', () => {
    const profile: PlayerProfile = { ...baseProfile, avatar: '/avatars/cora.jpg' }
    const el = createProfileAvatar(profile, false)
    expect(el.tagName).toBe('IMG')
  })

  it('sets img src to the avatar URL', () => {
    const profile: PlayerProfile = { ...baseProfile, avatar: '/avatars/cora.jpg' }
    const el = createProfileAvatar(profile, false) as HTMLImageElement
    expect(el.src).toContain('/avatars/cora.jpg')
  })

  it('sets img alt text to "{name} avatar"', () => {
    const profile: PlayerProfile = { ...baseProfile, avatar: '/avatars/cora.jpg' }
    const el = createProfileAvatar(profile, false) as HTMLImageElement
    expect(el.alt).toBe('Cora avatar')
  })

  it('returns a <div> placeholder when profile has no avatar', () => {
    const el = createProfileAvatar(baseProfile, false)
    expect(el.tagName).toBe('DIV')
  })

  it('placeholder shows first letter of name', () => {
    const el = createProfileAvatar(baseProfile, false)
    expect(el.textContent).toBe('C')
  })

  it('placeholder shows "?" when name is empty', () => {
    const profile: PlayerProfile = { ...baseProfile, name: '' }
    const el = createProfileAvatar(profile, false)
    expect(el.textContent).toBe('?')
  })

  it('placeholder shows first letter of trimmed name', () => {
    const profile: PlayerProfile = { ...baseProfile, name: '  Wayne' }
    const el = createProfileAvatar(profile, false)
    expect(el.textContent).toBe('W')
  })

  it('selected avatar gets gold border', () => {
    const profile: PlayerProfile = { ...baseProfile, avatar: '/avatars/cora.jpg' }
    const el = createProfileAvatar(profile, true) as HTMLImageElement
    expect(el.style.border.replace(/\s/g, '')).toContain('255,215,0')
  })

  it('unselected avatar gets white-ish border', () => {
    const profile: PlayerProfile = { ...baseProfile, avatar: '/avatars/cora.jpg' }
    const el = createProfileAvatar(profile, false) as HTMLImageElement
    expect(el.style.border.replace(/\s/g, '')).toContain('255,255,255')
  })

  it('selected placeholder gets gold border', () => {
    const el = createProfileAvatar(baseProfile, true)
    expect(el.style.border.replace(/\s/g, '')).toContain('255,215,0')
  })

  it('unselected placeholder gets white-ish border', () => {
    const el = createProfileAvatar(baseProfile, false)
    expect(el.style.border.replace(/\s/g, '')).toContain('255,255,255')
  })

  it('avatar image has borderRadius 50%', () => {
    const profile: PlayerProfile = { ...baseProfile, avatar: '/avatars/cora.jpg' }
    const el = createProfileAvatar(profile, false) as HTMLImageElement
    expect(el.style.borderRadius).toBe('50%')
  })

  it('placeholder div has borderRadius 50%', () => {
    const el = createProfileAvatar(baseProfile, false)
    expect(el.style.borderRadius).toBe('50%')
  })
})
