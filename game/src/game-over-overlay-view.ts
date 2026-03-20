import type { GameState } from './game-state'
import type { PlayerProfile } from './profiles'
import {
  css,
  div,
  easeOutCubic,
  FONT_MONO,
  FONT_TEXT,
  formatProfileLabel,
  GOLD,
  RED,
  scaled,
  Z_OVERLAY,
} from './overlay-utils'

const GAME_OVER_SCORE_COUNT_MS = 1200

export function formatGameDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(1, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function buildGameOverMessage(
  playerName: string,
  elapsedMs: number,
  isHighScore: boolean,
): string {
  const seconds = Math.max(1, Math.floor(elapsedMs / 1000))

  if (isHighScore) {
    return `${playerName} set the pace. New personal best in ${formatGameDuration(elapsedMs)}.`
  }
  if (seconds < 15) {
    return `Nice try! You lasted ${seconds}s. One clean dodge streak and you are right back in it.`
  }
  if (seconds < 30) {
    return `Good shift. You battled for ${seconds}s. Stay loose and attack the next run.`
  }
  if (seconds < 60) {
    return `Strong effort. You held on for ${seconds}s. That was close to a heater.`
  }
  return `Great run. You stayed alive for ${formatGameDuration(elapsedMs)}. Keep pushing for the next breakthrough.`
}

interface GameOverOverlayViewOptions {
  root: HTMLDivElement
  onReplay: () => void
  onMenu: () => void
}

export class GameOverOverlayView {
  readonly overlay: HTMLDivElement

  private readonly gameOverScoreEl: HTMLDivElement
  private readonly gameOverTimeEl: HTMLDivElement
  private readonly gameOverHighBadgeEl: HTMLDivElement
  private readonly gameOverMessageEl: HTMLDivElement
  private readonly gameOverGlowEl: HTMLDivElement
  private readonly gameOverConfettiEl: HTMLDivElement
  private readonly gameOverMenuCardEl: HTMLDivElement
  private readonly gameOverReplayCardEl: HTMLDivElement
  private readonly gameOverMenuFillEl: HTMLDivElement
  private readonly gameOverReplayFillEl: HTMLDivElement

  private previousScreen: GameState['screen'] = 'title'
  private animationStart = 0
  private finalScore = 0
  private isHighScore = false
  private message = ''

  constructor(options: GameOverOverlayViewOptions) {
    this.overlay = div({
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: String(Z_OVERLAY),
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(12px)',
      transition: 'opacity 0.4s ease',
      opacity: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
    })

    this.gameOverGlowEl = div({
      position: 'absolute',
      inset: '10%',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,215,0,0.32) 0%, rgba(255,215,0,0.08) 38%, rgba(255,215,0,0) 70%)',
      filter: 'blur(22px)',
      opacity: '0',
      animation: 'overlay-celebration-glow 2.8s ease-in-out infinite',
      pointerEvents: 'none',
    })
    this.overlay.appendChild(this.gameOverGlowEl)

    this.gameOverConfettiEl = div({
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
    })
    this.overlay.appendChild(this.gameOverConfettiEl)

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
      this.gameOverConfettiEl.appendChild(piece)
    }

    const content = div({
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
    content.appendChild(heading)

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
    content.appendChild(scoreLabel)

    this.gameOverScoreEl = div({
      fontFamily: FONT_MONO,
      fontSize: scaled(64),
      fontWeight: '800',
      color: '#fff',
      marginBottom: '10px',
      textShadow: '0 10px 30px rgba(0,0,0,0.35)',
      animation: 'overlay-score-pop 0.7s ease-out',
    })
    content.appendChild(this.gameOverScoreEl)

    this.gameOverTimeEl = div({
      fontFamily: FONT_MONO,
      fontSize: scaled(18),
      color: 'rgba(255,255,255,0.6)',
      marginBottom: '14px',
    })
    content.appendChild(this.gameOverTimeEl)

    this.gameOverHighBadgeEl = div({
      fontFamily: FONT_TEXT,
      fontSize: scaled(22),
      fontWeight: '700',
      color: GOLD,
      marginBottom: '14px',
      opacity: '0',
      transition: 'opacity 0.5s ease',
    })
    this.gameOverHighBadgeEl.textContent = 'NEW PERSONAL BEST!'
    content.appendChild(this.gameOverHighBadgeEl)

    this.gameOverMessageEl = div({
      fontFamily: FONT_TEXT,
      fontSize: scaled(18),
      color: 'rgba(255,255,255,0.82)',
      maxWidth: '520px',
      lineHeight: '1.5',
      marginBottom: '28px',
      animation: 'overlay-message-rise 0.6s ease-out',
    })
    content.appendChild(this.gameOverMessageEl)

    const actionsEl = div({
      display: 'flex',
      gap: '16px',
      alignItems: 'stretch',
      justifyContent: 'center',
      width: 'min(92vw, 720px)',
      marginBottom: '28px',
      flexWrap: 'wrap',
    })

    const menuAction = this.buildActionCard(
      'Hold Left For Main Menu',
      'Move the ball into the left lane and hold to go back.',
      'linear-gradient(90deg, rgba(125,211,252,0.95), rgba(125,211,252,0.35))',
      () => options.onMenu(),
    )
    this.gameOverMenuCardEl = menuAction.card
    this.gameOverMenuFillEl = menuAction.fill
    actionsEl.appendChild(this.gameOverMenuCardEl)

    const replayAction = this.buildActionCard(
      'Hold Right To Play Again',
      'Move the ball into the right lane and hold to jump straight into the next run.',
      'linear-gradient(90deg, rgba(255,215,0,0.95), rgba(255,215,0,0.35))',
      () => options.onReplay(),
    )
    this.gameOverReplayCardEl = replayAction.card
    this.gameOverReplayFillEl = replayAction.fill
    actionsEl.appendChild(this.gameOverReplayCardEl)
    content.appendChild(actionsEl)

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
    content.appendChild(prompt)

    this.overlay.appendChild(content)
    options.root.appendChild(this.overlay)
  }

  update(state: GameState, activeProfile: PlayerProfile | null): void {
    if (state.screen !== this.previousScreen) {
      if (state.screen === 'game_over') {
        this.beginCelebration(state, activeProfile)
      }
      this.previousScreen = state.screen
    }

    if (state.screen === 'game_over') {
      this.overlay.style.opacity = '1'
      this.overlay.style.pointerEvents = 'auto'

      const now = state.now
      const countProgress = Math.min(1, Math.max(0, (now - this.animationStart) / GAME_OVER_SCORE_COUNT_MS))
      const animatedScore = Math.round(this.finalScore * easeOutCubic(countProgress))
      this.gameOverScoreEl.textContent = String(animatedScore)

      const secs = Math.floor(state.elapsed / 1000)
      const mins = Math.floor(secs / 60)
      const remSecs = secs % 60
      this.gameOverTimeEl.textContent = `Time: ${mins}:${String(remSecs).padStart(2, '0')}`
      this.gameOverHighBadgeEl.style.opacity = this.isHighScore ? '1' : '0'
      this.gameOverMessageEl.textContent = this.message
      this.gameOverGlowEl.style.opacity = this.isHighScore ? '1' : '0'
      this.gameOverConfettiEl.style.opacity = this.isHighScore ? '1' : '0'
      this.updateActionCards(state)
      return
    }

    this.overlay.style.opacity = '0'
    this.overlay.style.pointerEvents = 'none'
  }

  private beginCelebration(state: GameState, activeProfile: PlayerProfile | null): void {
    this.animationStart = state.now
    this.finalScore = state.score
    this.isHighScore = state.score > state.highScore && state.score > 0
    this.message = this.buildMessage(state, activeProfile, this.isHighScore)
    this.gameOverScoreEl.style.animation = 'none'
    this.gameOverMessageEl.style.animation = 'none'
    void this.gameOverScoreEl.offsetWidth
    this.gameOverScoreEl.style.animation = 'overlay-score-pop 0.7s ease-out'
    this.gameOverMessageEl.style.animation = 'overlay-message-rise 0.6s ease-out'
  }

  private buildMessage(state: GameState, activeProfile: PlayerProfile | null, isHighScore: boolean): string {
    const playerName = activeProfile
      ? formatProfileLabel(activeProfile, true)
      : (state.playerName || 'Player')
    return buildGameOverMessage(playerName, state.elapsed, isHighScore)
  }

  private updateActionCards(state: GameState): void {
    const isMenuActive = state.gameOverAction === 'menu'
    const isReplayActive = state.gameOverAction === 'replay'
    const menuProgress = isMenuActive ? state.gameOverActionProgress : 0
    const replayProgress = isReplayActive ? state.gameOverActionProgress : 0

    this.gameOverMenuCardEl.style.borderColor = isMenuActive ? 'rgba(125, 211, 252, 0.95)' : 'rgba(255,255,255,0.14)'
    this.gameOverMenuCardEl.style.transform = isMenuActive ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)'
    this.gameOverMenuCardEl.style.background = isMenuActive ? 'rgba(125, 211, 252, 0.16)' : 'rgba(255,255,255,0.06)'

    this.gameOverReplayCardEl.style.borderColor = isReplayActive ? 'rgba(255, 215, 0, 0.95)' : 'rgba(255,255,255,0.14)'
    this.gameOverReplayCardEl.style.transform = isReplayActive ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)'
    this.gameOverReplayCardEl.style.background = isReplayActive ? 'rgba(255, 215, 0, 0.16)' : 'rgba(255,255,255,0.06)'

    this.gameOverMenuFillEl.style.transform = `scaleX(${menuProgress})`
    this.gameOverReplayFillEl.style.transform = `scaleX(${replayProgress})`
  }

  private buildActionCard(
    title: string,
    subtitle: string,
    accent: string,
    onClick: () => void,
  ): { card: HTMLDivElement; fill: HTMLDivElement } {
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

  private formatDuration(elapsedMs: number): string {
    return formatGameDuration(elapsedMs)
  }
}
