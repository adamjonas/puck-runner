import type { GameState } from './game-state'

/**
 * Canvas 2D renderer for Phase 1 PoC.
 *
 * Renders:
 * - Dark ice-like surface with 3 lanes
 * - Colored dot (avatar) that moves between lanes
 * - Lane dividers
 * - Raw tracker position indicator (small crosshair)
 *
 * Will be replaced by Three.js in Phase 3.
 */
export class Renderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private width = 0
  private height = 0

  // Colors
  private readonly ICE_COLOR = '#1a2332'
  private readonly LANE_LINE_COLOR = 'rgba(168, 216, 234, 0.3)'
  private readonly AVATAR_COLOR = '#2ecc71'
  private readonly AVATAR_GLOW = 'rgba(46, 204, 113, 0.3)'
  private readonly RAW_INDICATOR_COLOR = 'rgba(255, 200, 50, 0.5)'
  private readonly RINK_MARKING_COLOR = 'rgba(200, 60, 60, 0.15)'

  // Rink scroll
  private scrollOffset = 0
  private readonly SCROLL_SPEED = 0.15 // pixels per ms

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
    const { ctx, width, height } = this

    // Clear
    ctx.fillStyle = this.ICE_COLOR
    ctx.fillRect(0, 0, width, height)

    if (state.screen === 'title') {
      this.renderTitle(ctx, width, height)
      return
    }

    if (state.screen === 'playing') {
      this.scrollOffset += dt * this.SCROLL_SPEED
    }

    // Draw rink markings (scrolling)
    this.renderRinkMarkings(ctx, width, height)

    // Draw lane dividers
    this.renderLaneDividers(ctx, width, height)

    // Draw rink boards (left and right edges)
    this.renderBoards(ctx, width, height)

    // Draw raw tracker position (small crosshair)
    if (state.trackerConnected && state.confidence > 0) {
      this.renderRawIndicator(ctx, state.rawX * width, state.rawY * height)
    }

    // Draw avatar (dot)
    this.renderAvatar(ctx, state.avatarX * width, height * 0.75)

    // Draw paused overlay
    if (state.screen === 'paused') {
      this.renderOverlay(ctx, width, height, 'PAUSED', 'Move ball back into view')
    }

    if (state.screen === 'game_over') {
      this.renderOverlay(ctx, width, height, 'GAME OVER', 'Press Space to play again')
    }
  }

  private renderTitle(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Title text
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('PUCK RUNNER', w / 2, h * 0.35)

    // Subtitle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.font = '20px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('Phase 1 — Proof of Concept', w / 2, h * 0.42)

    // Instructions
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.font = '16px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText('Connect iPhone tracker or use keyboard (← → arrow keys)', w / 2, h * 0.55)
    ctx.fillText('Press SPACE or ENTER to start', w / 2, h * 0.60)

    // Connection status
    ctx.font = '14px SF Mono, Menlo, monospace'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.fillText('Waiting for connections on ws://[your-ip]:5173/ws/tracker', w / 2, h * 0.75)
  }

  private renderRinkMarkings(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    const markingSpacing = 300
    const offset = this.scrollOffset % markingSpacing

    ctx.strokeStyle = this.RINK_MARKING_COLOR
    ctx.lineWidth = 3

    // Horizontal lines scrolling downward (center red line, blue lines)
    for (let y = -markingSpacing + offset; y < h + markingSpacing; y += markingSpacing) {
      ctx.beginPath()
      ctx.moveTo(w * 0.05, y)
      ctx.lineTo(w * 0.95, y)
      ctx.stroke()
    }

    // Center circle (scrolls with markings)
    const circleY = (-markingSpacing / 2 + offset) % markingSpacing
    for (
      let cy = circleY;
      cy < h + markingSpacing;
      cy += markingSpacing
    ) {
      ctx.beginPath()
      ctx.arc(w / 2, cy, 60, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  private renderLaneDividers(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    ctx.strokeStyle = this.LANE_LINE_COLOR
    ctx.lineWidth = 2
    ctx.setLineDash([20, 15])

    // Left divider (at ~33% width)
    ctx.beginPath()
    ctx.moveTo(w * 0.333, 0)
    ctx.lineTo(w * 0.333, h)
    ctx.stroke()

    // Right divider (at ~67% width)
    ctx.beginPath()
    ctx.moveTo(w * 0.667, 0)
    ctx.lineTo(w * 0.667, h)
    ctx.stroke()

    ctx.setLineDash([])
  }

  private renderBoards(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    const boardWidth = w * 0.03

    // Left board
    const leftGrad = ctx.createLinearGradient(0, 0, boardWidth, 0)
    leftGrad.addColorStop(0, '#2c3e50')
    leftGrad.addColorStop(1, 'rgba(44, 62, 80, 0.3)')
    ctx.fillStyle = leftGrad
    ctx.fillRect(0, 0, boardWidth, h)

    // Right board
    const rightGrad = ctx.createLinearGradient(w - boardWidth, 0, w, 0)
    rightGrad.addColorStop(0, 'rgba(44, 62, 80, 0.3)')
    rightGrad.addColorStop(1, '#2c3e50')
    ctx.fillStyle = rightGrad
    ctx.fillRect(w - boardWidth, 0, boardWidth, h)
  }

  private renderRawIndicator(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    const size = 8
    ctx.strokeStyle = this.RAW_INDICATOR_COLOR
    ctx.lineWidth = 1.5
    // Crosshair
    ctx.beginPath()
    ctx.moveTo(x - size, y)
    ctx.lineTo(x + size, y)
    ctx.moveTo(x, y - size)
    ctx.lineTo(x, y + size)
    ctx.stroke()
  }

  private renderAvatar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    const radius = 18

    // Glow
    ctx.beginPath()
    ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2)
    ctx.fillStyle = this.AVATAR_GLOW
    ctx.fill()

    // Main dot
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = this.AVATAR_COLOR
    ctx.fill()

    // Highlight
    ctx.beginPath()
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.35, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.fill()
  }

  private renderOverlay(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    title: string,
    subtitle: string,
  ): void {
    // Dim background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.fillRect(0, 0, w, h)

    // Title
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 40px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(title, w / 2, h / 2 - 20)

    // Subtitle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.font = '18px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillText(subtitle, w / 2, h / 2 + 20)
  }
}
