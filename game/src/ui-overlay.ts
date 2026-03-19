/**
 * HTML/CSS overlay UI for Puck Runner.
 *
 * Creates and manages DOM elements positioned over the Three.js canvas.
 * All elements are built programmatically — index.html is not modified.
 */

import { GameState } from './game-state'
import type { Announcer } from './announcer'
import { loadProfiles, addProfile, type PlayerProfile } from './profiles'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT_TEXT = "-apple-system, system-ui, 'BlinkMacSystemFont', sans-serif"
const FONT_MONO = "'SF Mono', 'Menlo', monospace"
const GOLD = '#FFD700'
const RED = '#e74c3c'
const GREEN = '#2ecc71'
const GRAY = '#555'
const Z_HUD = 100
const Z_OVERLAY = 200

// ---------------------------------------------------------------------------
// Element references
// ---------------------------------------------------------------------------

let root: HTMLDivElement

// HUD elements (visible during gameplay)
let scoreEl: HTMLDivElement
let multiplierEl: HTMLDivElement
let livesEl: HTMLDivElement
let dekeEl: HTMLDivElement
let comboEl: HTMLDivElement
let announcerBarEl: HTMLDivElement
let announcerTextEl: HTMLSpanElement
let speedEl: HTMLDivElement
let stickhandlingEl: HTMLDivElement

// Full-screen overlays
let titleOverlay: HTMLDivElement
let gameOverOverlay: HTMLDivElement
let countdownOverlay: HTMLDivElement

// Player select (within title overlay)
let playerListEl: HTMLDivElement
let selectedProfile: string | null = null

// Internal state for combo fade
let lastComboText = ''
let comboFadeTimeout: ReturnType<typeof setTimeout> | null = null

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// createOverlay
// ---------------------------------------------------------------------------

export function createOverlay(): void {
  root = div({
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: String(Z_HUD),
  })
  document.body.appendChild(root)

  createHUD()
  createTitleOverlay()
  createGameOverOverlay()
  createCountdownOverlay()
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function createHUD(): void {
  // Score (top right)
  scoreEl = div({
    position: 'absolute',
    top: '16px',
    right: '16px',
    fontFamily: FONT_MONO,
    fontSize: '36px',
    fontWeight: '800',
    color: '#fff',
    textAlign: 'right',
    textShadow: '0 2px 8px rgba(0,0,0,0.6)',
  })
  root.appendChild(scoreEl)

  // Multiplier badge (below score)
  multiplierEl = div({
    position: 'absolute',
    top: '60px',
    right: '16px',
    fontFamily: FONT_MONO,
    fontSize: '18px',
    fontWeight: '700',
    color: GOLD,
    textAlign: 'right',
    padding: '2px 10px',
    borderRadius: '12px',
    background: 'rgba(255, 215, 0, 0.15)',
    opacity: '0',
    transition: 'opacity 0.3s ease',
  })
  root.appendChild(multiplierEl)

  // Lives (top left)
  livesEl = div({
    position: 'absolute',
    top: '16px',
    left: '16px',
    fontSize: '28px',
    letterSpacing: '4px',
    textShadow: '0 2px 8px rgba(0,0,0,0.6)',
  })
  root.appendChild(livesEl)

  // Deke indicator (bottom center)
  dekeEl = div({
    position: 'absolute',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: FONT_TEXT,
    fontSize: '16px',
    fontWeight: '700',
    color: '#fff',
    padding: '6px 18px',
    borderRadius: '20px',
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(4px)',
    transition: 'opacity 0.3s ease, background 0.3s ease, color 0.3s ease',
    opacity: '0',
  })
  root.appendChild(dekeEl)

  // Combo text (center)
  comboEl = div({
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontFamily: FONT_TEXT,
    fontSize: '48px',
    fontWeight: '900',
    color: GOLD,
    textAlign: 'center',
    textShadow: '0 2px 16px rgba(255, 215, 0, 0.4)',
    opacity: '0',
    transition: 'opacity 0.4s ease',
    whiteSpace: 'nowrap',
  })
  root.appendChild(comboEl)

  // Announcer bar (lower third)
  announcerBarEl = div({
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
  announcerTextEl = span('', {
    fontFamily: FONT_TEXT,
    fontSize: '20px',
    fontWeight: '600',
    color: '#fff',
    whiteSpace: 'nowrap',
  })
  announcerBarEl.appendChild(announcerTextEl)
  root.appendChild(announcerBarEl)

  // Speed badge (bottom right)
  speedEl = div({
    position: 'absolute',
    bottom: '24px',
    right: '16px',
    fontFamily: FONT_MONO,
    fontSize: '14px',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    padding: '4px 10px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.1)',
  })
  root.appendChild(speedEl)

  // Stickhandling indicator (bottom left)
  stickhandlingEl = div({
    position: 'absolute',
    bottom: '24px',
    left: '16px',
    fontFamily: FONT_MONO,
    fontSize: '14px',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    padding: '4px 10px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.1)',
    opacity: '0',
    transition: 'opacity 0.3s ease',
  })
  root.appendChild(stickhandlingEl)
}

// ---------------------------------------------------------------------------
// Title overlay
// ---------------------------------------------------------------------------

function createTitleOverlay(): void {
  titleOverlay = div({
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

  // Title
  const title = div({
    fontFamily: FONT_TEXT,
    fontSize: '64px',
    fontWeight: '900',
    color: '#fff',
    letterSpacing: '4px',
    marginBottom: '8px',
    textShadow: '0 0 30px rgba(255,215,0,0.3)',
  })
  title.textContent = 'PUCK RUNNER'
  titleOverlay.appendChild(title)

  // Subtitle
  const subtitle = div({
    fontFamily: FONT_TEXT,
    fontSize: '18px',
    fontWeight: '400',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: '32px',
  })
  subtitle.textContent = 'Hockey Endless Runner'
  titleOverlay.appendChild(subtitle)

  // Player select area
  playerListEl = div({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '24px',
    maxHeight: '200px',
    overflowY: 'auto',
    pointerEvents: 'auto',
  })
  titleOverlay.appendChild(playerListEl)

  // High score line (filled dynamically)
  const highScoreLine = div({
    fontFamily: FONT_MONO,
    fontSize: '16px',
    color: GOLD,
    marginBottom: '24px',
  })
  highScoreLine.id = 'overlay-high-score'
  titleOverlay.appendChild(highScoreLine)

  // Instructions
  const instructions = div({
    fontFamily: FONT_TEXT,
    fontSize: '16px',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: '1.6',
  })
  instructions.innerHTML =
    'Move your hockey stick left &amp; right to steer<br>' +
    'Collect coins &bull; Dodge obstacles &bull; Build combos<br><br>' +
    '<span style="color:rgba(255,255,255,0.8);font-weight:600;">Press SPACE to start</span>'
  titleOverlay.appendChild(instructions)

  root.appendChild(titleOverlay)
}

// ---------------------------------------------------------------------------
// Game Over overlay
// ---------------------------------------------------------------------------

function createGameOverOverlay(): void {
  gameOverOverlay = div({
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
  })

  // "GAME OVER"
  const heading = div({
    fontFamily: FONT_TEXT,
    fontSize: '48px',
    fontWeight: '900',
    color: RED,
    letterSpacing: '3px',
    marginBottom: '24px',
  })
  heading.textContent = 'GAME OVER'
  gameOverOverlay.appendChild(heading)

  // Final score
  const scoreLine = div({
    fontFamily: FONT_MONO,
    fontSize: '36px',
    fontWeight: '800',
    color: '#fff',
    marginBottom: '8px',
  })
  scoreLine.id = 'go-score'
  gameOverOverlay.appendChild(scoreLine)

  // Time survived
  const timeLine = div({
    fontFamily: FONT_MONO,
    fontSize: '18px',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: '16px',
  })
  timeLine.id = 'go-time'
  gameOverOverlay.appendChild(timeLine)

  // High score badge
  const highBadge = div({
    fontFamily: FONT_TEXT,
    fontSize: '22px',
    fontWeight: '700',
    color: GOLD,
    marginBottom: '32px',
    opacity: '0',
    transition: 'opacity 0.5s ease',
  })
  highBadge.id = 'go-highscore'
  highBadge.textContent = 'NEW HIGH SCORE!'
  gameOverOverlay.appendChild(highBadge)

  // Prompt
  const prompt = div({
    fontFamily: FONT_TEXT,
    fontSize: '16px',
    color: 'rgba(255,255,255,0.5)',
  })
  prompt.textContent = 'Press SPACE to continue'
  gameOverOverlay.appendChild(prompt)

  root.appendChild(gameOverOverlay)
}

// ---------------------------------------------------------------------------
// Countdown overlay
// ---------------------------------------------------------------------------

function createCountdownOverlay(): void {
  countdownOverlay = div({
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
  })

  const number = div({
    fontFamily: FONT_MONO,
    fontSize: '120px',
    fontWeight: '900',
    color: '#fff',
    textShadow: '0 0 40px rgba(255,255,255,0.3)',
  })
  number.id = 'cd-number'
  countdownOverlay.appendChild(number)

  root.appendChild(countdownOverlay)
}

// ---------------------------------------------------------------------------
// Player select
// ---------------------------------------------------------------------------

function renderPlayerSelect(): void {
  playerListEl.innerHTML = ''

  const profiles = loadProfiles()

  // Label
  const label = div({
    fontFamily: FONT_TEXT,
    fontSize: '14px',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: '4px',
  })
  label.textContent = 'Select Player'
  playerListEl.appendChild(label)

  // Profile buttons
  profiles.forEach((p: PlayerProfile) => {
    const btn = document.createElement('button')
    css(btn, {
      fontFamily: FONT_TEXT,
      fontSize: '16px',
      fontWeight: '600',
      color: selectedProfile === p.name ? '#000' : '#fff',
      background: selectedProfile === p.name ? GOLD : 'rgba(255,255,255,0.1)',
      border: 'none',
      borderRadius: '8px',
      padding: '8px 24px',
      cursor: 'pointer',
      minWidth: '180px',
      transition: 'background 0.2s ease, color 0.2s ease',
      pointerEvents: 'auto',
    })
    btn.textContent = `${p.name}  (${p.highScore})`
    btn.addEventListener('click', () => {
      selectedProfile = p.name
      renderPlayerSelect()
    })
    playerListEl.appendChild(btn)
  })

  // "+" Add new player button
  const addBtn = document.createElement('button')
  css(addBtn, {
    fontFamily: FONT_TEXT,
    fontSize: '20px',
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
    const name = window.prompt('Enter player name (1-20 characters):')
    if (name) {
      const profile = addProfile(name)
      if (profile) {
        selectedProfile = profile.name
        renderPlayerSelect()
      }
    }
  })
  playerListEl.appendChild(addBtn)
}

export function getSelectedProfile(): string | null {
  return selectedProfile
}

// ---------------------------------------------------------------------------
// updateOverlay — called every frame
// ---------------------------------------------------------------------------

export function updateOverlay(state: GameState, announcer: Announcer): void {
  const now = performance.now()

  // ----- Screen-level visibility -----

  // Title
  if (state.screen === 'title') {
    titleOverlay.style.opacity = '1'
    titleOverlay.style.pointerEvents = 'auto'
    renderPlayerSelect()

    // Show high score
    const hsEl = document.getElementById('overlay-high-score')
    if (hsEl) {
      hsEl.textContent = state.highScore > 0 ? `HIGH SCORE: ${state.highScore}` : ''
    }
  } else {
    titleOverlay.style.opacity = '0'
    titleOverlay.style.pointerEvents = 'none'
  }

  // Countdown
  if (state.screen === 'countdown') {
    countdownOverlay.style.opacity = '1'
    const remaining = Math.ceil((state.countdownEnd - now) / 1000)
    const cdNum = document.getElementById('cd-number')
    if (cdNum) {
      const clamped = Math.max(1, Math.min(3, remaining))
      cdNum.textContent = String(clamped)
    }
  } else {
    countdownOverlay.style.opacity = '0'
  }

  // Game over
  if (state.screen === 'game_over') {
    gameOverOverlay.style.opacity = '1'
    gameOverOverlay.style.pointerEvents = 'auto'

    const goScore = document.getElementById('go-score')
    if (goScore) goScore.textContent = String(state.score)

    const goTime = document.getElementById('go-time')
    if (goTime) {
      const secs = Math.floor(state.elapsed / 1000)
      const mins = Math.floor(secs / 60)
      const remSecs = secs % 60
      goTime.textContent = `Time: ${mins}:${String(remSecs).padStart(2, '0')}`
    }

    const goBadge = document.getElementById('go-highscore')
    if (goBadge) {
      goBadge.style.opacity = state.score >= state.highScore && state.score > 0 ? '1' : '0'
    }
  } else {
    gameOverOverlay.style.opacity = '0'
    gameOverOverlay.style.pointerEvents = 'none'
  }

  // ----- HUD (only during playing) -----

  const isPlaying = state.screen === 'playing'

  // Score
  scoreEl.textContent = String(state.score)
  scoreEl.style.color = state.multiplier > 1 ? GOLD : '#fff'
  scoreEl.style.opacity = isPlaying ? '1' : '0'

  // Multiplier badge
  if (state.multiplier > 1 && isPlaying) {
    multiplierEl.textContent = `${state.multiplier}x`
    multiplierEl.style.opacity = '1'
  } else {
    multiplierEl.style.opacity = '0'
  }

  // Lives
  if (isPlaying) {
    let hearts = ''
    for (let i = 0; i < 3; i++) {
      hearts += i < state.lives
        ? '\u2764\uFE0F'  // red heart
        : '\u{1F5A4}'     // black heart (lost)
      hearts += ' '
    }
    livesEl.textContent = hearts.trim()
    livesEl.style.opacity = '1'
  } else {
    livesEl.style.opacity = '0'
  }

  // Deke indicator
  if (isPlaying) {
    if (!state.isDekeUnlocked) {
      // Show time until unlock
      const remaining = Math.ceil((GameState.DEKE_UNLOCK_MS - state.elapsed) / 1000)
      dekeEl.textContent = `DEKE in ${remaining}s`
      dekeEl.style.background = 'rgba(0,0,0,0.5)'
      dekeEl.style.color = 'rgba(255,255,255,0.4)'
      dekeEl.style.opacity = '1'
    } else if (state.isDekeReady) {
      dekeEl.textContent = '\u2193 DEKE'
      dekeEl.style.background = `rgba(46, 204, 113, 0.3)`
      dekeEl.style.color = GREEN
      dekeEl.style.opacity = '1'
    } else {
      // Cooldown
      const cdRemaining = Math.max(0, state.dekeCooldownUntil - now)
      const cdSecs = (cdRemaining / 1000).toFixed(1)
      dekeEl.textContent = `DEKE ${cdSecs}s`
      dekeEl.style.background = 'rgba(0,0,0,0.5)'
      dekeEl.style.color = 'rgba(255,255,255,0.4)'
      dekeEl.style.opacity = '1'
    }
  } else {
    dekeEl.style.opacity = '0'
  }

  // Combo text
  if (isPlaying && state.comboText && now < state.comboTextUntil) {
    if (state.comboText !== lastComboText) {
      lastComboText = state.comboText
      comboEl.textContent = state.comboText
      comboEl.style.opacity = '1'

      // Clear any pending fade
      if (comboFadeTimeout !== null) {
        clearTimeout(comboFadeTimeout)
      }

      // Fade out after visible duration
      const displayMs = state.comboTextUntil - now
      comboFadeTimeout = setTimeout(() => {
        comboEl.style.opacity = '0'
        comboFadeTimeout = null
      }, Math.max(0, displayMs - 400)) // start fading 400ms before expiry
    }
  } else if (!state.comboText || now >= state.comboTextUntil) {
    if (lastComboText) {
      comboEl.style.opacity = '0'
      lastComboText = ''
    }
  }

  // Announcer bar
  const announcerText = announcer.getCurrentText()
  if (announcerText) {
    announcerTextEl.textContent = announcerText
    announcerBarEl.style.opacity = '1'
  } else {
    announcerBarEl.style.opacity = '0'
  }

  // Speed badge
  if (isPlaying) {
    speedEl.textContent = `${state.speed.toFixed(1)}x`
    speedEl.style.opacity = '1'
  } else {
    speedEl.style.opacity = '0'
  }

  // Stickhandling indicator
  if (isPlaying && state.stickhandlingActive) {
    stickhandlingEl.textContent = `STICKHANDLING ${state.stickhandlingFrequency.toFixed(1)}Hz`
    stickhandlingEl.style.opacity = '1'
  } else {
    stickhandlingEl.style.opacity = '0'
  }
}

// ---------------------------------------------------------------------------
// Show / Hide HUD (for transitions)
// ---------------------------------------------------------------------------

export function hideOverlayHUD(): void {
  scoreEl.style.opacity = '0'
  multiplierEl.style.opacity = '0'
  livesEl.style.opacity = '0'
  dekeEl.style.opacity = '0'
  comboEl.style.opacity = '0'
  announcerBarEl.style.opacity = '0'
  speedEl.style.opacity = '0'
  stickhandlingEl.style.opacity = '0'
}

export function showOverlayHUD(): void {
  scoreEl.style.opacity = '1'
  livesEl.style.opacity = '1'
  speedEl.style.opacity = '1'
}
