import { div, FONT_MONO, FONT_TEXT, GOLD, RED, scaled } from './overlay-utils'

export interface GameOverDecorationElements {
  overlay: HTMLDivElement
  glowEl: HTMLDivElement
  confettiEl: HTMLDivElement
  contentEl: HTMLDivElement
  scoreEl: HTMLDivElement
  timeEl: HTMLDivElement
  highBadgeEl: HTMLDivElement
  messageEl: HTMLDivElement
  actionsEl: HTMLDivElement
}

export interface GameOverActionElements {
  card: HTMLDivElement
  fill: HTMLDivElement
}

export function createGameOverDecorationElements(): GameOverDecorationElements {
  const overlay = div({
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '200',
    background: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(12px)',
    transition: 'opacity 0.4s ease',
    opacity: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
  })

  const glowEl = div({
    position: 'absolute',
    inset: '10%',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,215,0,0.32) 0%, rgba(255,215,0,0.08) 38%, rgba(255,215,0,0) 70%)',
    filter: 'blur(22px)',
    opacity: '0',
    animation: 'overlay-celebration-glow 2.8s ease-in-out infinite',
    pointerEvents: 'none',
  })
  overlay.appendChild(glowEl)

  const confettiEl = div({
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    opacity: '0',
    pointerEvents: 'none',
  })
  overlay.appendChild(confettiEl)

  for (let i = 0; i < 18; i++) {
    const piece = div({
      position: 'absolute',
      top: '-12%',
      left: `${4 + i * 5.2}%`,
      width: i % 3 === 0 ? '10px' : '6px',
      height: i % 2 === 0 ? '18px' : '12px',
      borderRadius: '999px',
      background: [GOLD, '#7dd3fc', '#fca5a5', '#86efac'][i % 4],
      opacity: '0',
      transform: 'translate3d(0, -10vh, 0)',
      animation: `overlay-confetti-fall ${2.4 + (i % 4) * 0.35}s linear ${i * 0.08}s infinite`,
    })
    piece.style.setProperty('--drift', `${(i % 2 === 0 ? 1 : -1) * (24 + (i % 5) * 10)}px`)
    confettiEl.appendChild(piece)
  }

  const contentEl = div({
    position: 'relative',
    zIndex: '1',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    textAlign: 'center',
  })

  const heading = div({
    fontFamily: FONT_TEXT,
    fontSize: scaled(48),
    fontWeight: '900',
    color: RED,
    letterSpacing: '3px',
    marginBottom: '24px',
  })
  heading.textContent = 'GAME OVER'
  contentEl.appendChild(heading)

  const scoreLabel = div({
    fontFamily: FONT_TEXT,
    fontSize: scaled(13),
    fontWeight: '700',
    letterSpacing: '4px',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: '10px',
  })
  scoreLabel.textContent = 'Final Score'
  contentEl.appendChild(scoreLabel)

  const scoreEl = div({
    fontFamily: FONT_MONO,
    fontSize: scaled(64),
    fontWeight: '800',
    color: '#fff',
    marginBottom: '10px',
    textShadow: '0 10px 30px rgba(0,0,0,0.35)',
    animation: 'overlay-score-pop 0.7s ease-out',
  })
  contentEl.appendChild(scoreEl)

  const timeEl = div({
    fontFamily: FONT_MONO,
    fontSize: scaled(18),
    color: 'rgba(255,255,255,0.6)',
    marginBottom: '14px',
  })
  contentEl.appendChild(timeEl)

  const highBadgeEl = div({
    fontFamily: FONT_TEXT,
    fontSize: scaled(22),
    fontWeight: '700',
    color: GOLD,
    marginBottom: '14px',
    opacity: '0',
    transition: 'opacity 0.5s ease',
  })
  highBadgeEl.textContent = 'NEW PERSONAL BEST!'
  contentEl.appendChild(highBadgeEl)

  const messageEl = div({
    fontFamily: FONT_TEXT,
    fontSize: scaled(18),
    color: 'rgba(255,255,255,0.82)',
    maxWidth: '520px',
    lineHeight: '1.5',
    marginBottom: '28px',
    animation: 'overlay-message-rise 0.6s ease-out',
  })
  contentEl.appendChild(messageEl)

  const actionsEl = div({
    display: 'flex',
    gap: '16px',
    alignItems: 'stretch',
    justifyContent: 'center',
    width: 'min(92vw, 720px)',
    marginBottom: '28px',
    flexWrap: 'wrap',
  })
  contentEl.appendChild(actionsEl)

  const prompt = div({
    fontFamily: FONT_TEXT,
    fontSize: scaled(16),
    color: 'rgba(255,255,255,0.5)',
    lineHeight: '1.7',
    textAlign: 'center',
  })
  prompt.innerHTML =
    'Tracker controls stay live here.<br>' +
    '<span style="color:rgba(255,255,255,0.72);">Keyboard fallback: SPACE to replay, M or ESC for menu</span>'
  contentEl.appendChild(prompt)

  overlay.appendChild(contentEl)

  return {
    overlay,
    glowEl,
    confettiEl,
    contentEl,
    scoreEl,
    timeEl,
    highBadgeEl,
    messageEl,
    actionsEl,
  }
}

export function createGameOverActionCard(
  title: string,
  subtitle: string,
  accent: string,
  onClick: () => void,
): GameOverActionElements {
  const card = div({
    position: 'relative',
    flex: '1 1 280px',
    minWidth: '240px',
    padding: '18px 18px 20px',
    borderRadius: '18px',
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    transition: 'transform 0.18s ease, border-color 0.18s ease, background 0.18s ease',
    pointerEvents: 'auto',
    cursor: 'pointer',
  })
  card.tabIndex = 0
  card.setAttribute('role', 'button')
  card.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick()
  })
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      onClick()
    }
  })

  const fill = div({
    position: 'absolute',
    inset: '0',
    transformOrigin: 'left center',
    transform: 'scaleX(0)',
    background: accent,
    opacity: '0.2',
    transition: 'transform 0.08s linear',
    pointerEvents: 'none',
  })
  card.appendChild(fill)

  const titleEl = div({
    position: 'relative',
    fontFamily: FONT_TEXT,
    fontSize: scaled(18),
    fontWeight: '800',
    color: '#fff',
    marginBottom: '6px',
    letterSpacing: '0.5px',
  })
  titleEl.textContent = title
  card.appendChild(titleEl)

  const subtitleEl = div({
    position: 'relative',
    fontFamily: FONT_TEXT,
    fontSize: scaled(14),
    lineHeight: '1.5',
    color: 'rgba(255,255,255,0.72)',
  })
  subtitleEl.textContent = subtitle
  card.appendChild(subtitleEl)

  return { card, fill }
}
