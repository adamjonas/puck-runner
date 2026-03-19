import { GameState } from './game-state'
import type { Obstacle, Coin } from './game-state'

/**
 * Canvas 2D renderer for Phase 2.
 *
 * Renders: ice rink, avatar, obstacles, coins, HUD (score, lives,
 * deke cooldown, combo callouts, multiplier), game state overlays.
 */
export class Renderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private scrollOffset = 0

  private readonly ICE = '#1a2332'
  private readonly LANE_LINE = 'rgba(168, 216, 234, 0.3)'
  private readonly AVATAR = '#2ecc71'
  private readonly AVATAR_GLOW = 'rgba(46, 204, 113, 0.3)'
  private readonly AVATAR_DEKE = '#e74c3c'
  private readonly COIN_COLOR = '#FFD700'
  private readonly COIN_GLOW = 'rgba(255, 215, 0, 0.3)'
  private readonly OBSTACLE_COLOR = '#C0392B'
  private readonly OBSTACLE_ALT = '#E67E22'
  private readonly RINK_MARKING = 'rgba(200, 60, 60, 0.15)'
  private readonly BOARD_COLOR = '#2c3e50'

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.canvas.width = this.width * dpr
    this.canvas.height = this.height * dpr
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`
    this.ctx.scale(dpr, dpr)
  }

  render(state: GameState, dt: number): void {
    const { ctx, width: w, height: h } = this

    ctx.fillStyle = this.ICE
    ctx.fillRect(0, 0, w, h)

    if (state.screen === 'title') {
      this.renderTitle(ctx, w, h, state)
      return
    }

    if (state.screen === 'playing' || state.screen === 'countdown') {
      this.scrollOffset += dt * state.currentSpeed
    }

    this.renderRinkMarkings(ctx, w, h)
    this.renderLaneDividers(ctx, w, h)
    this.renderBoards(ctx, w, h)

    // Coins (render behind avatar)
    for (const coin of state.coins) {
      if (coin.active && !coin.collected) {
        this.renderCoin(ctx, coin, w, h)
      }
    }

    // Obstacles
    for (const obs of state.obstacles) {
      if (obs.active) {
        this.renderObstacle(ctx, obs, w, h)
      }
    }

    // Avatar
    const avatarColor = state.isDekeInvincible ? this.AVATAR_DEKE : this.AVATAR
    this.renderAvatar(ctx, state.avatarX * w, h * 0.75, avatarColor, state.isDekeInvincible)

    // HUD
    this.renderHUD(ctx, w, h, state)

    // Combo text
    if (state.comboText && performance.now() < state.comboTextUntil) {
      this.renderComboText(ctx, w, h, state.comboText)
    }

    // Overlays
    if (state.screen === 'countdown') {
      const remaining = Math.ceil((state.countdownEnd - performance.now()) / 1000)
      if (remaining > 0) {
        this.renderCountdown(ctx, w, h, remaining)
      }
    }

    if (state.screen === 'paused') {
      this.renderOverlay(ctx, w, h, 'PAUSED', 'Move ball back into view')
    }

    if (state.screen === 'game_over') {
      this.renderGameOver(ctx, w, h, state)
    }
  }

  private renderTitle(ctx: CanvasRenderingContext2D, w: number, h: number, state: GameState): void {
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('PUCK RUNNER', w / 2, h * 0.3)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.font = '20px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('Dodge obstacles • Collect coins • Deke for style', w / 2, h * 0.38)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('Use ← → to move, ↓ to deke', w / 2, h * 0.50)
    ctx.fillText('Press SPACE to start', w / 2, h * 0.55)

    if (state.highScore > 0) {
      ctx.fillStyle = this.COIN_COLOR
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, sans-serif'
      ctx.fillText(`High Score: ${state.highScore}`, w / 2, h * 0.65)
    }

    ctx.font = '14px SF Mono, Menlo, monospace'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    const connText = state.trackerConnected
      ? '● Tracker connected'
      : '○ Keyboard mode (← → ↓)'
    ctx.fillText(connText, w / 2, h * 0.80)
  }

  private renderRinkMarkings(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const spacing = 300
    const offset = this.scrollOffset % spacing

    ctx.strokeStyle = this.RINK_MARKING
    ctx.lineWidth = 3

    for (let y = -spacing + offset; y < h + spacing; y += spacing) {
      ctx.beginPath()
      ctx.moveTo(w * 0.05, y)
      ctx.lineTo(w * 0.95, y)
      ctx.stroke()
    }

    const circleY = (-spacing / 2 + offset) % spacing
    for (let cy = circleY; cy < h + spacing; cy += spacing) {
      ctx.beginPath()
      ctx.arc(w / 2, cy, 60, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  private renderLaneDividers(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.strokeStyle = this.LANE_LINE
    ctx.lineWidth = 2
    ctx.setLineDash([20, 15])

    ctx.beginPath()
    ctx.moveTo(w * 0.333, 0)
    ctx.lineTo(w * 0.333, h)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(w * 0.667, 0)
    ctx.lineTo(w * 0.667, h)
    ctx.stroke()

    ctx.setLineDash([])
  }

  private renderBoards(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const bw = w * 0.03
    const leftGrad = ctx.createLinearGradient(0, 0, bw, 0)
    leftGrad.addColorStop(0, this.BOARD_COLOR)
    leftGrad.addColorStop(1, 'rgba(44, 62, 80, 0.3)')
    ctx.fillStyle = leftGrad
    ctx.fillRect(0, 0, bw, h)

    const rightGrad = ctx.createLinearGradient(w - bw, 0, w, 0)
    rightGrad.addColorStop(0, 'rgba(44, 62, 80, 0.3)')
    rightGrad.addColorStop(1, this.BOARD_COLOR)
    ctx.fillStyle = rightGrad
    ctx.fillRect(w - bw, 0, bw, h)
  }

  private renderObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle, w: number, h: number): void {
    const laneX = this.laneToX(obs.lane, w)
    const y = obs.y * h
    const laneW = w * 0.28
    const obsH = h * 0.04

    // Main obstacle
    const color = obs.type === 'zamboni' ? this.OBSTACLE_ALT : this.OBSTACLE_COLOR
    ctx.fillStyle = color
    const radius = 6
    this.roundRect(ctx, laneX - laneW / 2, y - obsH / 2, laneW, obsH, radius)

    // Second lane for gate-type
    if (obs.secondLane) {
      const laneX2 = this.laneToX(obs.secondLane, w)
      this.roundRect(ctx, laneX2 - laneW / 2, y - obsH / 2, laneW, obsH, radius)
    }

    // Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.font = 'bold 11px -apple-system, sans-serif'
    ctx.textAlign = 'center'
    const labels: Record<string, string> = {
      boards: '▓ BOARDS',
      zamboni: '🧊 ZAMBONI',
      crack: '⚡ CRACK',
      snow: '❄ SNOW',
      gate: '🚧 GATE',
    }
    ctx.fillText(labels[obs.type] || obs.type, laneX, y + 4)
  }

  private renderCoin(ctx: CanvasRenderingContext2D, coin: Coin, w: number, h: number): void {
    const x = this.laneToX(coin.lane, w)
    const y = coin.y * h
    const r = 8

    // Glow
    ctx.beginPath()
    ctx.arc(x, y, r * 2, 0, Math.PI * 2)
    ctx.fillStyle = this.COIN_GLOW
    ctx.fill()

    // Coin
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = this.COIN_COLOR
    ctx.fill()

    // Dollar sign
    ctx.fillStyle = '#B8860B'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('$', x, y + 4)
  }

  private renderAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, invincible: boolean): void {
    const radius = 18

    // Glow (larger when invincible)
    ctx.beginPath()
    ctx.arc(x, y, invincible ? radius * 3.5 : radius * 2.5, 0, Math.PI * 2)
    ctx.fillStyle = invincible ? 'rgba(231, 76, 60, 0.3)' : this.AVATAR_GLOW
    ctx.fill()

    // Main dot
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    // Highlight
    ctx.beginPath()
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.35, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.fill()
  }

  private renderHUD(ctx: CanvasRenderingContext2D, w: number, h: number, state: GameState): void {
    // Score (top right)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 28px SF Mono, Menlo, monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`${state.score}`, w - 20, 40)

    // Multiplier
    if (state.multiplier > 1) {
      ctx.fillStyle = this.COIN_COLOR
      ctx.font = 'bold 18px SF Mono, Menlo, monospace'
      ctx.fillText(`${state.multiplier}x`, w - 20, 65)
    }

    // Lives (top left)
    ctx.textAlign = 'left'
    ctx.font = '22px sans-serif'
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < state.lives ? '#e74c3c' : 'rgba(255,255,255,0.2)'
      ctx.fillText('♥', 20 + i * 28, 38)
    }

    // Deke cooldown indicator
    const now = performance.now()
    if (state.dekeCooldownUntil > now) {
      const remaining = (state.dekeCooldownUntil - now) / GameState.DEKE_COOLDOWN_MS
      const cx = w / 2
      const cy = h * 0.75 + 35
      const r = 12

      // Background circle
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fill()

      // Cooldown arc
      ctx.beginPath()
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (1 - remaining) * Math.PI * 2)
      ctx.strokeStyle = '#2ecc71'
      ctx.lineWidth = 3
      ctx.stroke()
    } else if (state.screen === 'playing') {
      // Deke ready indicator
      ctx.fillStyle = 'rgba(46, 204, 113, 0.6)'
      ctx.font = '11px SF Mono, Menlo, monospace'
      ctx.textAlign = 'center'
      ctx.fillText('↓ DEKE', w / 2, h * 0.75 + 45)
    }

    // Stickhandling indicator
    if (state.stickhandlingActive) {
      ctx.fillStyle = 'rgba(52, 152, 219, 0.8)'
      ctx.font = 'bold 12px SF Mono, Menlo, monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`STICKHANDLING ${state.stickhandlingFrequency.toFixed(1)}Hz`, 20, h - 20)
    }

    // Speed indicator
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.font = '11px SF Mono, Menlo, monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`${state.speed.toFixed(1)}x`, w - 20, h - 20)
  }

  private renderComboText(ctx: CanvasRenderingContext2D, w: number, h: number, text: string): void {
    const elapsed = 2000 - (performance.now() - (performance.now() - (2000 - (ctx as any).__comboRemaining || 2000)))

    ctx.save()
    ctx.fillStyle = this.COIN_COLOR
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    ctx.shadowColor = 'rgba(255, 215, 0, 0.5)'
    ctx.shadowBlur = 20
    ctx.fillText(text, w / 2, h * 0.4)
    ctx.restore()
  }

  private renderCountdown(ctx: CanvasRenderingContext2D, w: number, h: number, n: number): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 96px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${n}`, w / 2, h / 2 + 30)
  }

  private renderGameOver(ctx: CanvasRenderingContext2D, w: number, h: number, state: GameState): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('GAME OVER', w / 2, h * 0.3)

    ctx.font = 'bold 32px SF Mono, Menlo, monospace'
    ctx.fillText(`${state.score}`, w / 2, h * 0.42)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.font = '16px -apple-system, sans-serif'
    ctx.fillText(`Time: ${(state.elapsed / 1000).toFixed(1)}s`, w / 2, h * 0.50)

    if (state.score >= state.highScore && state.score > 0) {
      ctx.fillStyle = this.COIN_COLOR
      ctx.font = 'bold 20px -apple-system, sans-serif'
      ctx.fillText('NEW HIGH SCORE!', w / 2, h * 0.58)
    } else if (state.highScore > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.font = '14px -apple-system, sans-serif'
      ctx.fillText(`Best: ${state.highScore}`, w / 2, h * 0.58)
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.font = '16px -apple-system, sans-serif'
    ctx.fillText('Press SPACE to play again', w / 2, h * 0.70)
  }

  private renderOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, title: string, subtitle: string): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 40px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(title, w / 2, h / 2 - 20)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.font = '18px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText(subtitle, w / 2, h / 2 + 20)
  }

  private laneToX(lane: string, w: number): number {
    switch (lane) {
      case 'left': return w * 0.2
      case 'right': return w * 0.8
      default: return w * 0.5
    }
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
    ctx.fill()
  }
}
