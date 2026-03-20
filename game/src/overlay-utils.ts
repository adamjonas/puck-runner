import type { PlayerProfile } from './profiles'

export const FONT_TEXT = "-apple-system, system-ui, 'BlinkMacSystemFont', sans-serif"
export const FONT_MONO = "'SF Mono', 'Menlo', monospace"
export const GOLD = '#FFD700'
export const RED = '#e74c3c'
export const GREEN = '#2ecc71'
export const Z_HUD = 100
export const Z_OVERLAY = 200

let overlayStylesInjected = false

/** Returns a CSS clamp() that scales `px` between small laptops and TVs. */
export function scaled(px: number): string {
  const vw = +(px / 19.2).toFixed(2)
  const min = Math.round(px * 0.55)
  return `clamp(${min}px, ${vw}vw, ${px}px)`
}

export function css(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, styles)
}

export function div(styles?: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div')
  if (styles) css(el, styles)
  return el
}

export function span(text: string, styles?: Partial<CSSStyleDeclaration>): HTMLSpanElement {
  const el = document.createElement('span')
  el.textContent = text
  if (styles) css(el, styles)
  return el
}

export function ensureOverlayStyles(): void {
  if (overlayStylesInjected) return
  const style = document.createElement('style')
  style.textContent = `
    @keyframes overlay-score-pop {
      0% { transform: scale(0.92); opacity: 0; }
      65% { transform: scale(1.06); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes overlay-message-rise {
      0% { transform: translateY(12px); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }
    @keyframes overlay-celebration-glow {
      0%, 100% { transform: scale(0.95); opacity: 0.2; }
      50% { transform: scale(1.08); opacity: 0.8; }
    }
    @keyframes overlay-confetti-fall {
      0% { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 0; }
      10% { opacity: 1; }
      100% { transform: translate3d(var(--drift), 110vh, 0) rotate(540deg); opacity: 0; }
    }
  `
  document.head.appendChild(style)
  overlayStylesInjected = true
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function formatProfileLabel(
  profile: Pick<PlayerProfile, 'name' | 'jerseyNumber'>,
  uppercase = false,
): string {
  const name = uppercase ? profile.name.toUpperCase() : profile.name
  return profile.jerseyNumber ? `${name} #${profile.jerseyNumber}` : name
}

export function createProfileAvatar(
  profile: PlayerProfile,
  isSelected: boolean,
): HTMLElement {
  const avatarBorder = isSelected
    ? '3px solid rgba(255,215,0,0.82)'
    : '3px solid rgba(255,255,255,0.16)'

  if (profile.avatar) {
    const avatar = document.createElement('img')
    avatar.src = profile.avatar
    avatar.alt = `${profile.name} avatar`
    css(avatar, {
      width: 'clamp(112px, 18vw, 148px)',
      height: 'clamp(112px, 18vw, 148px)',
      borderRadius: '50%',
      objectFit: 'cover',
      border: avatarBorder,
      boxShadow: '0 10px 28px rgba(0,0,0,0.3)',
      background: 'rgba(255,255,255,0.08)',
    })
    return avatar
  }

  const placeholder = div({
    width: 'clamp(112px, 18vw, 148px)',
    height: 'clamp(112px, 18vw, 148px)',
    borderRadius: '50%',
    border: avatarBorder,
    boxShadow: '0 10px 28px rgba(0,0,0,0.3)',
    background: 'linear-gradient(135deg, rgba(125,211,252,0.28) 0%, rgba(255,255,255,0.08) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: FONT_TEXT,
    fontSize: scaled(40),
    fontWeight: '900',
    color: 'rgba(255,255,255,0.94)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  })
  placeholder.textContent = profile.name.trim().charAt(0) || '?'
  return placeholder
}
