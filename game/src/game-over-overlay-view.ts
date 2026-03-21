import type { GameState } from './game-state'
import type { PlayerProfile } from './profiles'
import {
  createGameOverActionCard,
  createGameOverDecorationElements,
} from './game-over-overlay-parts'
import {
  easeOutCubic,
  formatProfileLabel,
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
    const elements = createGameOverDecorationElements()
    this.overlay = elements.overlay
    this.overlay.style.zIndex = String(Z_OVERLAY)
    this.gameOverGlowEl = elements.glowEl
    this.gameOverConfettiEl = elements.confettiEl
    this.gameOverScoreEl = elements.scoreEl
    this.gameOverTimeEl = elements.timeEl
    this.gameOverHighBadgeEl = elements.highBadgeEl
    this.gameOverMessageEl = elements.messageEl

    const menuAction = createGameOverActionCard(
      'Hold Left For Main Menu',
      'Move the ball into the left lane and hold to go back.',
      'linear-gradient(90deg, rgba(125,211,252,0.95), rgba(125,211,252,0.35))',
      () => options.onMenu(),
    )
    this.gameOverMenuCardEl = menuAction.card
    this.gameOverMenuFillEl = menuAction.fill
    elements.actionsEl.appendChild(this.gameOverMenuCardEl)

    const replayAction = createGameOverActionCard(
      'Hold Right To Play Again',
      'Move the ball into the right lane and hold to jump straight into the next run.',
      'linear-gradient(90deg, rgba(255,215,0,0.95), rgba(255,215,0,0.35))',
      () => options.onReplay(),
    )
    this.gameOverReplayCardEl = replayAction.card
    this.gameOverReplayFillEl = replayAction.fill
    elements.actionsEl.appendChild(this.gameOverReplayCardEl)
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
    this.isHighScore = state.isNewHighScore && state.score > 0
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

  private formatDuration(elapsedMs: number): string {
    return formatGameDuration(elapsedMs)
  }
}
