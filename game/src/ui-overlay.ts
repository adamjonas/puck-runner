/**
 * HTML/CSS overlay UI for Puck Runner.
 *
 * OverlayController coordinates focused overlay views for title/profile selection,
 * gameplay HUD/countdown, and the game-over experience.
 */

import { GameState } from './game-state'
import type { Announcer } from './announcer'
import type { PlayerProfile } from './profiles'
import { div, ensureOverlayStyles, Z_HUD } from './overlay-utils'
import { GameOverOverlayView } from './game-over-overlay-view'
import { HudOverlayView } from './hud-overlay-view'
import { TitleOverlayView, resolveSelectedProfile } from './title-overlay-view'

interface OverlayControllerOptions {
  onReplay?: () => void
  onMenu?: () => void
  onPractice?: () => void
}

export { resolveSelectedProfile }

export class OverlayController {
  private readonly root: HTMLDivElement
  private readonly titleOverlay: TitleOverlayView
  private readonly hudOverlay: HudOverlayView
  private readonly gameOverOverlay: GameOverOverlayView

  constructor(options: OverlayControllerOptions = {}) {
    ensureOverlayStyles()

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

    this.hudOverlay = new HudOverlayView({ root: this.root })
    this.titleOverlay = new TitleOverlayView({
      root: this.root,
      onPractice: options.onPractice ?? (() => {}),
    })
    this.gameOverOverlay = new GameOverOverlayView({
      root: this.root,
      onReplay: options.onReplay ?? (() => {}),
      onMenu: options.onMenu ?? (() => {}),
    })
  }

  getSelectedProfile(): string | null {
    return this.titleOverlay.getSelectedProfile()
  }

  update(state: GameState, announcer: Announcer): void {
    const isTitle = state.screen === 'title'
    this.titleOverlay.update(isTitle, state)

    const activeProfile = this.getActiveProfile(state.playerName)
    this.hudOverlay.update(state, announcer, activeProfile)
    this.gameOverOverlay.update(state, activeProfile)
  }

  private getActiveProfile(name: string): PlayerProfile | null {
    return this.titleOverlay.getActiveProfile(name)
  }
}
