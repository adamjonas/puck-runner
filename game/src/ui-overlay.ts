/**
 * HTML/CSS overlay UI for Puck Runner.
 *
 * Creates and manages DOM elements positioned over the Three.js canvas.
 * All elements are built programmatically — index.html is not modified.
 */

import { GameState } from './game-state'
import type { Announcer } from './announcer'
import { loadProfiles, addProfile, type PlayerProfile } from './profiles'

const FONT_TEXT = "-apple-system, system-ui, 'BlinkMacSystemFont', sans-serif"
const FONT_MONO = "'SF Mono', 'Menlo', monospace"
const GOLD = '#FFD700'
const RED = '#e74c3c'
const GREEN = '#2ecc71'
const Z_HUD = 100
const Z_OVERLAY = 200
const GAME_OVER_SCORE_COUNT_MS = 1200

/** Returns a CSS clamp() that scales `px` between small laptops and TVs. */
function scaled(px: number): string {
  const vw = +(px / 19.2).toFixed(2)
  const min = Math.round(px * 0.55)
  return `clamp(${min}px, ${vw}vw, ${px}px)`
}

let overlayStylesInjected = false

function css(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  Object.assign(el.style, styles)
}

function div(styles?: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div')
  if (styles) css(el, styles)
  return el
}

function span(text: string, styles?: Partial<CSSStyleDeclaration>): HTMLSpanElement {
  const el = document.createElement('span')
  el.textContent = text
  if (styles) css(el, styles)
  return el
}

function ensureOverlayStyles(): void {
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

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

interface OverlayControllerOptions {
  onReplay?: () => void
  onMenu?: () => void
  onPractice?: () => void
}

export class OverlayController {
  private readonly root: HTMLDivElement

  private scoreEl!: HTMLDivElement
  private multiplierEl!: HTMLDivElement
  private livesEl!: HTMLDivElement
  private dekeEl!: HTMLDivElement
  private comboEl!: HTMLDivElement
  private announcerBarEl!: HTMLDivElement
  private announcerTextEl!: HTMLSpanElement
  private speedEl!: HTMLDivElement
  private stickhandlingEl!: HTMLDivElement
  private playerNameEl!: HTMLDivElement
  private tutorialInstructionEl!: HTMLDivElement

  private titleOverlay!: HTMLDivElement
  private gameOverOverlay!: HTMLDivElement
  private countdownOverlay!: HTMLDivElement

  private playerListEl!: HTMLDivElement
  private overlayHighScoreEl!: HTMLDivElement
  private countdownReadyEl!: HTMLDivElement
  private countdownNumberEl!: HTMLDivElement
  private gameOverScoreEl!: HTMLDivElement
  private gameOverTimeEl!: HTMLDivElement
  private gameOverHighBadgeEl!: HTMLDivElement
  private gameOverMessageEl!: HTMLDivElement
  private gameOverGlowEl!: HTMLDivElement
  private gameOverConfettiEl!: HTMLDivElement
  private gameOverActionsEl!: HTMLDivElement
  private gameOverMenuCardEl!: HTMLDivElement
  private gameOverReplayCardEl!: HTMLDivElement
  private gameOverMenuFillEl!: HTMLDivElement
  private gameOverReplayFillEl!: HTMLDivElement

  private selectedProfile: string | null = null
  private playerListDirty = true
  private titleVisibleLastFrame = false
  private lastComboText = ''
  private comboFadeTimeout: ReturnType<typeof setTimeout> | null = null
  private previousScreen: GameState['screen'] = 'title'
  private gameOverAnimationStart = 0
  private gameOverDisplayScore = 0
  private gameOverFinalScore = 0
  private gameOverIsHighScore = false
  private gameOverMessage = ''
  private readonly onReplay: () => void
  private readonly onMenu: () => void
  private readonly onPractice: () => void

  constructor(options: OverlayControllerOptions = {}) {
    ensureOverlayStyles()
    this.onReplay = options.onReplay ?? (() => {})
    this.onMenu = options.onMenu ?? (() => {})
    this.onPractice = options.onPractice ?? (() => {})
    this.root = div({
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: String(Z_HUD),
    })
    document.body.appendChild(this.root)

    this.createHUD()
    this.createTitleOverlay()
    this.createGameOverOverlay()
    this.createCountdownOverlay()
  }

  getSelectedProfile(): string | null {
    return this.selectedProfile
  }

  update(state: GameState, announcer: Announcer): void {
    const now = state.now
    const isTitle = state.screen === 'title'

    if (state.screen !== this.previousScreen) {
      if (state.screen === 'game_over') {
        this.beginGameOverCelebration(state)
      }
      this.previousScreen = state.screen
    }

    if (isTitle) {
      this.titleOverlay.style.opacity = '1'
      this.titleOverlay.style.pointerEvents = 'auto'
      if (!this.titleVisibleLastFrame || this.playerListDirty) {
        this.renderPlayerSelect()
      }
      state.playerName = this.selectedProfile ?? ''
      this.overlayHighScoreEl.textContent = state.highScore > 0 ? `HIGH SCORE: ${state.highScore}` : ''
    } else {
      this.titleOverlay.style.opacity = '0'
      this.titleOverlay.style.pointerEvents = 'none'
    }
    this.titleVisibleLastFrame = isTitle

    if (state.screen === 'countdown') {
      this.countdownOverlay.style.opacity = '1'
      const remaining = Math.ceil((state.countdownEnd - now) / 1000)
      this.countdownNumberEl.textContent = String(Math.max(1, Math.min(3, remaining)))
      const name = state.playerName || 'Player'
      this.countdownReadyEl.textContent = `${name}, ready?!?`
    } else {
      this.countdownOverlay.style.opacity = '0'
    }

    if (state.screen === 'game_over') {
      this.gameOverOverlay.style.opacity = '1'
      this.gameOverOverlay.style.pointerEvents = 'auto'
      const countProgress = Math.min(1, Math.max(0, (now - this.gameOverAnimationStart) / GAME_OVER_SCORE_COUNT_MS))
      const animatedScore = Math.round(this.gameOverFinalScore * easeOutCubic(countProgress))
      this.gameOverDisplayScore = animatedScore
      this.gameOverScoreEl.textContent = String(this.gameOverDisplayScore)

      const secs = Math.floor(state.elapsed / 1000)
      const mins = Math.floor(secs / 60)
      const remSecs = secs % 60
      this.gameOverTimeEl.textContent = `Time: ${mins}:${String(remSecs).padStart(2, '0')}`
      this.gameOverHighBadgeEl.style.opacity = this.gameOverIsHighScore ? '1' : '0'
      this.gameOverMessageEl.textContent = this.gameOverMessage
      this.gameOverGlowEl.style.opacity = this.gameOverIsHighScore ? '1' : '0'
      this.gameOverConfettiEl.style.opacity = this.gameOverIsHighScore ? '1' : '0'
      this.updateGameOverActionCards(state)
    } else {
      this.gameOverOverlay.style.opacity = '0'
      this.gameOverOverlay.style.pointerEvents = 'none'
    }

    const isPlaying = state.screen === 'playing'

    this.playerNameEl.textContent = state.playerName || ''
    this.playerNameEl.style.opacity = isPlaying && state.playerName ? '1' : '0'

    this.scoreEl.textContent = String(state.score)
    this.scoreEl.style.color = state.multiplier > 1 ? GOLD : '#fff'
    this.scoreEl.style.opacity = isPlaying ? '1' : '0'

    if (state.multiplier > 1 && isPlaying) {
      this.multiplierEl.textContent = `${state.multiplier}x`
      this.multiplierEl.style.opacity = '1'
    } else {
      this.multiplierEl.style.opacity = '0'
    }

    if (isPlaying) {
      let hearts = ''
      for (let i = 0; i < 3; i++) {
        hearts += i < state.lives ? '\u2764\uFE0F' : '\u{1F5A4}'
        hearts += ' '
      }
      this.livesEl.textContent = hearts.trim()
      this.livesEl.style.opacity = '1'
    } else {
      this.livesEl.style.opacity = '0'
    }

    if (isPlaying) {
      if (!state.isDekeUnlocked) {
        const remainingMs = GameState.DEKE_UNLOCK_MS - state.elapsed
        if (remainingMs <= 10000) {
          const remaining = Math.ceil(remainingMs / 1000)
          this.dekeEl.textContent = `🎯 DEKE in ${remaining}s`
          this.dekeEl.style.background = 'rgba(0,0,0,0.5)'
          this.dekeEl.style.color = 'rgba(255,255,255,0.4)'
          this.dekeEl.style.opacity = '1'
        } else {
          this.dekeEl.style.opacity = '0'
        }
      } else if (state.isDekeReady) {
        this.dekeEl.textContent = '\u2193 DEKE'
        this.dekeEl.style.background = 'rgba(46, 204, 113, 0.3)'
        this.dekeEl.style.color = GREEN
        this.dekeEl.style.opacity = '1'
      } else {
        const cdRemaining = Math.max(0, state.dekeCooldownUntil - now)
        const cdSecs = (cdRemaining / 1000).toFixed(1)
        this.dekeEl.textContent = `DEKE ${cdSecs}s`
        this.dekeEl.style.background = 'rgba(0,0,0,0.5)'
        this.dekeEl.style.color = 'rgba(255,255,255,0.4)'
        this.dekeEl.style.opacity = '1'
      }
    } else {
      this.dekeEl.style.opacity = '0'
    }

    if (isPlaying && state.comboText && now < state.comboTextUntil) {
      if (state.comboText !== this.lastComboText) {
        this.lastComboText = state.comboText
        this.comboEl.textContent = state.comboText
        this.comboEl.style.opacity = '1'

        if (this.comboFadeTimeout !== null) {
          clearTimeout(this.comboFadeTimeout)
        }

        const displayMs = state.comboTextUntil - now
        this.comboFadeTimeout = setTimeout(() => {
          this.comboEl.style.opacity = '0'
          this.comboFadeTimeout = null
        }, Math.max(0, displayMs - 400))
      }
    } else if (!state.comboText || now >= state.comboTextUntil) {
      if (this.lastComboText) {
        this.comboEl.style.opacity = '0'
        this.lastComboText = ''
      }
    }

    const announcerText = announcer.getCurrentText()
    if (announcerText) {
      this.announcerTextEl.textContent = announcerText
      this.announcerBarEl.style.opacity = '1'
    } else {
      this.announcerBarEl.style.opacity = '0'
    }

    if (isPlaying) {
      this.speedEl.textContent = `${state.speed.toFixed(1)}x`
      this.speedEl.style.opacity = '1'
    } else {
      this.speedEl.style.opacity = '0'
    }

    if (isPlaying && state.stickhandlingActive) {
      this.stickhandlingEl.textContent = `STICKHANDLING ${state.stickhandlingFrequency.toFixed(1)}Hz`
      this.stickhandlingEl.style.opacity = '1'
    } else {
      this.stickhandlingEl.style.opacity = '0'
    }

    // Tutorial instruction
    if (state.screen === 'tutorial' && state.tutorialText) {
      this.tutorialInstructionEl.textContent = state.tutorialText
      this.tutorialInstructionEl.style.opacity = '1'
    } else {
      this.tutorialInstructionEl.style.opacity = '0'
    }
  }

  private beginGameOverCelebration(state: GameState): void {
    this.gameOverAnimationStart = state.now
    this.gameOverDisplayScore = 0
    this.gameOverFinalScore = state.score
    this.gameOverIsHighScore = state.score >= state.highScore && state.score > 0
    this.gameOverMessage = this.buildGameOverMessage(state, this.gameOverIsHighScore)
    this.gameOverScoreEl.style.animation = 'none'
    this.gameOverMessageEl.style.animation = 'none'
    void this.gameOverScoreEl.offsetWidth
    this.gameOverScoreEl.style.animation = 'overlay-score-pop 0.7s ease-out'
    this.gameOverMessageEl.style.animation = 'overlay-message-rise 0.6s ease-out'
  }

  private buildGameOverMessage(state: GameState, isHighScore: boolean): string {
    const playerName = state.playerName || 'Player'
    const seconds = Math.max(1, Math.floor(state.elapsed / 1000))

    if (isHighScore) {
      return `${playerName} set the pace. New personal best in ${this.formatDuration(state.elapsed)}.`
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
    return `Great run. You stayed alive for ${this.formatDuration(state.elapsed)}. Keep pushing for the next breakthrough.`
  }

  private formatDuration(elapsedMs: number): string {
    const totalSeconds = Math.max(1, Math.floor(elapsedMs / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes === 0) return `${seconds}s`
    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  private updateGameOverActionCards(state: GameState): void {
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

  private createHUD(): void {
    this.scoreEl = div({
      position: 'absolute',
      top: '16px',
      right: '16px',
      fontFamily: FONT_MONO,
      fontSize: scaled(36),
      fontWeight: '800',
      color: '#fff',
      textAlign: 'right',
      textShadow: '0 2px 8px rgba(0,0,0,0.6)',
    })
    this.root.appendChild(this.scoreEl)

    this.multiplierEl = div({
      position: 'absolute',
      top: '60px',
      right: '16px',
      fontFamily: FONT_MONO,
      fontSize: scaled(18),
      fontWeight: '700',
      color: GOLD,
      textAlign: 'right',
      padding: '2px 10px',
      borderRadius: '12px',
      background: 'rgba(255, 215, 0, 0.15)',
      opacity: '0',
      transition: 'opacity 0.3s ease',
    })
    this.root.appendChild(this.multiplierEl)

    this.livesEl = div({
      position: 'absolute',
      top: '16px',
      left: '16px',
      fontSize: scaled(28),
      letterSpacing: '4px',
      textShadow: '0 2px 8px rgba(0,0,0,0.6)',
    })
    this.root.appendChild(this.livesEl)

    this.playerNameEl = div({
      position: 'absolute',
      top: '18px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: FONT_TEXT,
      fontSize: scaled(14),
      fontWeight: '600',
      color: 'rgba(255,255,255,0.45)',
      letterSpacing: '3px',
      textTransform: 'uppercase',
    })
    this.root.appendChild(this.playerNameEl)

    this.dekeEl = div({
      position: 'absolute',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: FONT_TEXT,
      fontSize: scaled(16),
      fontWeight: '700',
      color: '#fff',
      padding: '6px 18px',
      borderRadius: '20px',
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
      transition: 'opacity 0.3s ease, background 0.3s ease, color 0.3s ease',
      opacity: '0',
    })
    this.root.appendChild(this.dekeEl)

    this.comboEl = div({
      position: 'absolute',
      top: '40%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      fontFamily: FONT_TEXT,
      fontSize: scaled(48),
      fontWeight: '900',
      color: GOLD,
      textAlign: 'center',
      textShadow: '0 2px 16px rgba(255, 215, 0, 0.4)',
      opacity: '0',
      transition: 'opacity 0.4s ease',
      whiteSpace: 'nowrap',
    })
    this.root.appendChild(this.comboEl)

    this.announcerBarEl = div({
      position: 'absolute',
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(8px)',
      borderRadius: '8px',
      padding: '10px 28px',
      opacity: '0',
      transition: 'opacity 0.3s ease',
      maxWidth: '90vw',
    })
    this.announcerTextEl = span('', {
      fontFamily: FONT_TEXT,
      fontSize: scaled(20),
      fontWeight: '600',
      color: '#fff',
      whiteSpace: 'nowrap',
    })
    this.announcerBarEl.appendChild(this.announcerTextEl)
    this.root.appendChild(this.announcerBarEl)

    this.speedEl = div({
      position: 'absolute',
      bottom: '24px',
      right: '16px',
      fontFamily: FONT_MONO,
      fontSize: scaled(14),
      fontWeight: '600',
      color: 'rgba(255,255,255,0.7)',
      padding: '4px 10px',
      borderRadius: '10px',
      background: 'rgba(255,255,255,0.1)',
    })
    this.root.appendChild(this.speedEl)

    this.stickhandlingEl = div({
      position: 'absolute',
      bottom: '24px',
      left: '16px',
      fontFamily: FONT_MONO,
      fontSize: scaled(14),
      fontWeight: '600',
      color: 'rgba(255,255,255,0.7)',
      padding: '4px 10px',
      borderRadius: '10px',
      background: 'rgba(255,255,255,0.1)',
      opacity: '0',
      transition: 'opacity 0.3s ease',
    })
    this.root.appendChild(this.stickhandlingEl)

    // Tutorial instruction (persistent, center screen)
    this.tutorialInstructionEl = div({
      position: 'absolute',
      top: '20%',
      left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: FONT_TEXT,
      fontSize: '32px',
      fontWeight: '800',
      color: '#fff',
      textAlign: 'center',
      textShadow: '0 2px 16px rgba(0,0,0,0.7)',
      padding: '16px 32px',
      borderRadius: '16px',
      background: 'rgba(0, 0, 0, 0.55)',
      backdropFilter: 'blur(8px)',
      opacity: '0',
      transition: 'opacity 0.4s ease',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
    })
    this.root.appendChild(this.tutorialInstructionEl)
  }

  private createTitleOverlay(): void {
    this.titleOverlay = div({
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
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(12px)',
      transition: 'opacity 0.4s ease',
      pointerEvents: 'auto',
    })

    const title = div({
      fontFamily: FONT_TEXT,
      fontSize: scaled(64),
      fontWeight: '900',
      color: '#fff',
      letterSpacing: '4px',
      marginBottom: '8px',
      textShadow: '0 0 30px rgba(255,215,0,0.3)',
    })
    title.textContent = 'PUCK RUNNER'
    this.titleOverlay.appendChild(title)

    const subtitle = div({
      fontFamily: FONT_TEXT,
      fontSize: scaled(18),
      fontWeight: '400',
      color: 'rgba(255,255,255,0.6)',
      marginBottom: '32px',
    })
    subtitle.textContent = 'Hockey Endless Runner'
    this.titleOverlay.appendChild(subtitle)

    this.playerListEl = div({
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '24px',
      maxHeight: '300px',
      overflowY: 'auto',
      pointerEvents: 'auto',
    })
    this.titleOverlay.appendChild(this.playerListEl)

    this.overlayHighScoreEl = div({
      fontFamily: FONT_MONO,
      fontSize: scaled(16),
      color: GOLD,
      marginBottom: '24px',
    })
    this.titleOverlay.appendChild(this.overlayHighScoreEl)

    const instructions = div({
      fontFamily: FONT_TEXT,
      fontSize: scaled(16),
      color: 'rgba(255,255,255,0.5)',
      textAlign: 'center',
      lineHeight: '1.6',
    })
    instructions.innerHTML =
      'Track a real ball with your iPhone &mdash; or use arrow keys<br>' +
      'Dodge obstacles &bull; Collect coins &bull; Pull back to deke<br><br>' +
      '<span style="color:rgba(255,255,255,0.8);font-weight:600;">Press SPACE to start</span>'
    this.titleOverlay.appendChild(instructions)

    this.root.appendChild(this.titleOverlay)
  }

  private createGameOverOverlay(): void {
    this.gameOverOverlay = div({
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
    this.gameOverOverlay.appendChild(this.gameOverGlowEl)

    this.gameOverConfettiEl = div({
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
    })
    this.gameOverOverlay.appendChild(this.gameOverConfettiEl)

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

    this.gameOverActionsEl = div({
      display: 'flex',
      gap: '16px',
      alignItems: 'stretch',
      justifyContent: 'center',
      width: 'min(92vw, 720px)',
      marginBottom: '28px',
      flexWrap: 'wrap',
    })

    const buildActionCard = (
      title: string,
      subtitle: string,
      accent: string,
      onClick: () => void,
    ): { card: HTMLDivElement; fill: HTMLDivElement } => {
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

    const menuAction = buildActionCard(
      'Hold Left For Main Menu',
      'Move the ball into the left lane and hold to go back.',
      'linear-gradient(90deg, rgba(125,211,252,0.95), rgba(125,211,252,0.35))',
      () => this.onMenu(),
    )
    this.gameOverMenuCardEl = menuAction.card
    this.gameOverMenuFillEl = menuAction.fill
    this.gameOverActionsEl.appendChild(this.gameOverMenuCardEl)

    const replayAction = buildActionCard(
      'Hold Right To Play Again',
      'Move the ball into the right lane and hold to jump straight into the next run.',
      'linear-gradient(90deg, rgba(255,215,0,0.95), rgba(255,215,0,0.35))',
      () => this.onReplay(),
    )
    this.gameOverReplayCardEl = replayAction.card
    this.gameOverReplayFillEl = replayAction.fill
    this.gameOverActionsEl.appendChild(this.gameOverReplayCardEl)

    content.appendChild(this.gameOverActionsEl)

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

    this.gameOverOverlay.appendChild(content)
    this.root.appendChild(this.gameOverOverlay)
  }

  private createCountdownOverlay(): void {
    this.countdownOverlay = div({
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: String(Z_OVERLAY),
      opacity: '0',
      transition: 'opacity 0.2s ease',
      pointerEvents: 'none',
      flexDirection: 'column',
      gap: '16px',
    })

    this.countdownReadyEl = div({
      fontFamily: FONT_TEXT,
      fontSize: scaled(42),
      fontWeight: '800',
      color: GOLD,
      textShadow: '0 0 30px rgba(255, 215, 0, 0.4)',
      textAlign: 'center',
    })
    this.countdownOverlay.appendChild(this.countdownReadyEl)

    this.countdownNumberEl = div({
      fontFamily: FONT_MONO,
      fontSize: scaled(120),
      fontWeight: '900',
      color: '#fff',
      textShadow: '0 0 40px rgba(255,255,255,0.3)',
    })
    this.countdownOverlay.appendChild(this.countdownNumberEl)

    this.root.appendChild(this.countdownOverlay)
  }

  private renderPlayerSelect(): void {
    this.playerListEl.innerHTML = ''

    const profiles = loadProfiles()
    if (profiles.length > 0) {
      const selectedStillExists = this.selectedProfile !== null
        && profiles.some((profile) => profile.name === this.selectedProfile)
      if (!selectedStillExists) {
        this.selectedProfile = profiles[0].name
      }
    } else {
      this.selectedProfile = null
    }

    const label = div({
      fontFamily: FONT_TEXT,
      fontSize: scaled(14),
      color: 'rgba(255,255,255,0.5)',
      marginBottom: '4px',
    })
    label.textContent = profiles.length > 0 ? 'Select Player' : 'Add a player to track your scores!'
    this.playerListEl.appendChild(label)

    profiles.forEach((profile: PlayerProfile) => {
      const btn = document.createElement('button')
      css(btn, {
        fontFamily: FONT_TEXT,
        fontSize: scaled(16),
        fontWeight: '600',
        color: this.selectedProfile === profile.name ? '#000' : '#fff',
        background: this.selectedProfile === profile.name ? GOLD : 'rgba(255,255,255,0.1)',
        border: 'none',
        borderRadius: '8px',
        padding: '8px 24px',
        cursor: 'pointer',
        minWidth: '180px',
        transition: 'background 0.2s ease, color 0.2s ease',
        pointerEvents: 'auto',
      })
      btn.textContent = `${profile.name}  (${profile.highScore})`
      btn.addEventListener('click', () => {
        this.selectedProfile = profile.name
        this.playerListDirty = true
        this.renderPlayerSelect()
      })
      this.playerListEl.appendChild(btn)
    })

    const addBtn = document.createElement('button')
    css(addBtn, {
      fontFamily: FONT_TEXT,
      fontSize: scaled(20),
      fontWeight: '700',
      color: 'rgba(255,255,255,0.5)',
      background: 'rgba(255,255,255,0.05)',
      border: '2px dashed rgba(255,255,255,0.2)',
      borderRadius: '8px',
      padding: '6px 24px',
      cursor: 'pointer',
      minWidth: '180px',
      transition: 'background 0.2s ease',
      pointerEvents: 'auto',
    })
    addBtn.textContent = '+ Add Player'
    addBtn.addEventListener('click', () => {
      const input = document.createElement('input')
      css(input, {
        fontFamily: FONT_TEXT,
        fontSize: scaled(16),
        color: '#fff',
        background: 'rgba(255,255,255,0.1)',
        border: '2px solid rgba(46,204,113,0.5)',
        borderRadius: '8px',
        padding: '6px 12px',
        outline: 'none',
        minWidth: '180px',
        textAlign: 'center',
        pointerEvents: 'auto',
      })
      input.placeholder = 'Enter name...'
      input.maxLength = 20
      addBtn.replaceWith(input)
      input.focus()

      const submit = () => {
        const name = input.value.trim()
        if (name) {
          const profile = addProfile(name)
          if (profile) {
            this.selectedProfile = profile.name
            this.playerListDirty = true
          }
        }
        this.renderPlayerSelect()
      }

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          submit()
        }
        if (event.key === 'Escape') {
          this.renderPlayerSelect()
        }
        event.stopPropagation()
      })
      input.addEventListener('blur', submit)
    })
    this.playerListEl.appendChild(addBtn)

    // Practice button
    const practiceBtn = document.createElement('button')
    css(practiceBtn, {
      fontFamily: FONT_TEXT,
      fontSize: '16px',
      fontWeight: '600',
      color: GREEN,
      background: 'rgba(46, 204, 113, 0.1)',
      border: `2px solid ${GREEN}`,
      borderRadius: '8px',
      padding: '8px 24px',
      cursor: 'pointer',
      minWidth: '180px',
      transition: 'background 0.2s ease',
      pointerEvents: 'auto',
      marginTop: '8px',
    })
    practiceBtn.textContent = '🏒 Practice'
    practiceBtn.addEventListener('click', () => {
      this.onPractice()
    })
    this.playerListEl.appendChild(practiceBtn)

    this.playerListDirty = false
  }
}
