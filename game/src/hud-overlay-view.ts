import { GameState } from './game-state'
import type { Announcer } from './announcer'
import type { PlayerProfile } from './profiles'
import { createHudOverlayElements } from './hud-overlay-parts'
import {
  formatProfileLabel,
  GOLD,
  GREEN,
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
  private readonly latencyEl: HTMLDivElement
  private readonly playerNameEl: HTMLDivElement
  private readonly tutorialInstructionEl: HTMLDivElement
  private readonly countdownOverlay: HTMLDivElement
  private readonly countdownReadyEl: HTMLDivElement
  private readonly countdownNumberEl: HTMLDivElement

  private lastComboText = ''
  private lastComboUntil = 0
  private comboFadeTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(options: HudOverlayViewOptions) {
    const elements = createHudOverlayElements(options.root)
    this.scoreEl = elements.scoreEl
    this.multiplierEl = elements.multiplierEl
    this.livesEl = elements.livesEl
    this.dekeEl = elements.dekeEl
    this.comboEl = elements.comboEl
    this.announcerBarEl = elements.announcerBarEl
    this.announcerTextEl = elements.announcerTextEl
    this.speedEl = elements.speedEl
    this.stickhandlingEl = elements.stickhandlingEl
    this.latencyEl = elements.latencyEl
    this.playerNameEl = elements.playerNameEl
    this.tutorialInstructionEl = elements.tutorialInstructionEl
    this.countdownOverlay = elements.countdownOverlay
    this.countdownReadyEl = elements.countdownReadyEl
    this.countdownNumberEl = elements.countdownNumberEl
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

    if (state.latencyBreakdown) {
      this.latencyEl.textContent = state.latencyBreakdown
      this.latencyEl.style.opacity = '1'
    } else {
      this.latencyEl.style.opacity = '0'
    }

    if (state.screen === 'tutorial' && state.tutorialText) {
      this.tutorialInstructionEl.textContent = state.tutorialText
      this.tutorialInstructionEl.style.opacity = '1'
    } else {
      this.tutorialInstructionEl.style.opacity = '0'
    }
  }
}
