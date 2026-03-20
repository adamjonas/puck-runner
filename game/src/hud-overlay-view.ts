import { GameState } from './game-state'
import type { Announcer } from './announcer'
import type { PlayerProfile } from './profiles'
import {
  div,
  FONT_MONO,
  FONT_TEXT,
  formatProfileLabel,
  GOLD,
  GREEN,
  scaled,
} from './overlay-utils'

interface HudOverlayViewOptions {
  root: HTMLDivElement
}

export class HudOverlayView {
  private readonly scoreEl: HTMLDivElement
  private readonly multiplierEl: HTMLDivElement
  private readonly livesEl: HTMLDivElement
  private readonly dekeEl: HTMLDivElement
  private readonly comboEl: HTMLDivElement
  private readonly announcerBarEl: HTMLDivElement
  private readonly announcerTextEl: HTMLSpanElement
  private readonly speedEl: HTMLDivElement
  private readonly stickhandlingEl: HTMLDivElement
  private readonly playerNameEl: HTMLDivElement
  private readonly tutorialInstructionEl: HTMLDivElement
  private readonly countdownOverlay: HTMLDivElement
  private readonly countdownReadyEl: HTMLDivElement
  private readonly countdownNumberEl: HTMLDivElement

  private lastComboText = ''
  private lastComboUntil = 0
  private comboFadeTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(options: HudOverlayViewOptions) {
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
    options.root.appendChild(this.scoreEl)

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
    options.root.appendChild(this.multiplierEl)

    this.livesEl = div({
      position: 'absolute',
      top: '16px',
      left: '16px',
      fontSize: scaled(28),
      letterSpacing: '4px',
      textShadow: '0 2px 8px rgba(0,0,0,0.6)',
    })
    options.root.appendChild(this.livesEl)

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
    options.root.appendChild(this.playerNameEl)

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
    options.root.appendChild(this.dekeEl)

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
    options.root.appendChild(this.comboEl)

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
    this.announcerTextEl = document.createElement('span')
    this.announcerTextEl.textContent = ''
    Object.assign(this.announcerTextEl.style, {
      fontFamily: FONT_TEXT,
      fontSize: scaled(20),
      fontWeight: '600',
      color: '#fff',
      whiteSpace: 'nowrap',
    })
    this.announcerBarEl.appendChild(this.announcerTextEl)
    options.root.appendChild(this.announcerBarEl)

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
    options.root.appendChild(this.speedEl)

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
    options.root.appendChild(this.stickhandlingEl)

    this.tutorialInstructionEl = div({
      position: 'absolute',
      top: '20%',
      left: '50%',
      transform: 'translateX(-50%)',
      fontFamily: FONT_TEXT,
      fontSize: scaled(32),
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
    options.root.appendChild(this.tutorialInstructionEl)

    this.countdownOverlay = div({
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '200',
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
    options.root.appendChild(this.countdownOverlay)
  }

  update(state: GameState, announcer: Announcer, activeProfile: PlayerProfile | null): void {
    const now = state.now
    const isPlaying = state.screen === 'playing'

    if (state.screen === 'countdown') {
      this.countdownOverlay.style.opacity = '1'
      const remaining = Math.ceil((state.countdownEnd - now) / 1000)
      this.countdownNumberEl.textContent = String(Math.max(1, Math.min(3, remaining)))
      const name = activeProfile
        ? formatProfileLabel(activeProfile, true)
        : (state.playerName || 'Player')
      this.countdownReadyEl.textContent = `${name}, ready?!?`
    } else {
      this.countdownOverlay.style.opacity = '0'
    }

    this.playerNameEl.textContent = activeProfile
      ? formatProfileLabel(activeProfile, true)
      : (state.playerName || '')
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
      if (state.comboText !== this.lastComboText || state.comboTextUntil !== this.lastComboUntil) {
        this.lastComboText = state.comboText
        this.lastComboUntil = state.comboTextUntil
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

    if ((isPlaying || state.screen === 'tutorial') && state.stickhandlingActive) {
      this.stickhandlingEl.textContent = `STICKHANDLING ${state.stickhandlingFrequency.toFixed(1)}Hz`
      this.stickhandlingEl.style.opacity = '1'
    } else {
      this.stickhandlingEl.style.opacity = '0'
    }

    if (state.screen === 'tutorial' && state.tutorialText) {
      this.tutorialInstructionEl.textContent = state.tutorialText
      this.tutorialInstructionEl.style.opacity = '1'
    } else {
      this.tutorialInstructionEl.style.opacity = '0'
    }
  }
}
