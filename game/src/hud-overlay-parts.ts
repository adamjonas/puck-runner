import {
  div,
  FONT_MONO,
  FONT_TEXT,
  GOLD,
  GREEN,
  scaled,
} from './overlay-utils'

export interface HudOverlayElements {
  scoreEl: HTMLDivElement
  multiplierEl: HTMLDivElement
  livesEl: HTMLDivElement
  dekeEl: HTMLDivElement
  comboEl: HTMLDivElement
  announcerBarEl: HTMLDivElement
  announcerTextEl: HTMLSpanElement
  speedEl: HTMLDivElement
  stickhandlingEl: HTMLDivElement
  latencyEl: HTMLDivElement
  playerNameEl: HTMLDivElement
  tutorialInstructionEl: HTMLDivElement
  countdownOverlay: HTMLDivElement
  countdownReadyEl: HTMLDivElement
  countdownNumberEl: HTMLDivElement
}

export function createHudOverlayElements(root: HTMLDivElement): HudOverlayElements {
  const scoreEl = div({
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
  root.appendChild(scoreEl)

  const multiplierEl = div({
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
  root.appendChild(multiplierEl)

  const livesEl = div({
    position: 'absolute',
    top: '16px',
    left: '16px',
    fontSize: scaled(28),
    letterSpacing: '4px',
    textShadow: '0 2px 8px rgba(0,0,0,0.6)',
  })
  root.appendChild(livesEl)

  const playerNameEl = div({
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
  root.appendChild(playerNameEl)

  const dekeEl = div({
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
  root.appendChild(dekeEl)

  const comboEl = div({
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
  root.appendChild(comboEl)

  const announcerBarEl = div({
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
  const announcerTextEl = document.createElement('span')
  announcerTextEl.textContent = ''
  Object.assign(announcerTextEl.style, {
    fontFamily: FONT_TEXT,
    fontSize: scaled(20),
    fontWeight: '600',
    color: '#fff',
    whiteSpace: 'nowrap',
  })
  announcerBarEl.appendChild(announcerTextEl)
  root.appendChild(announcerBarEl)

  const speedEl = div({
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
  root.appendChild(speedEl)

  const stickhandlingEl = div({
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
  root.appendChild(stickhandlingEl)

  const latencyEl = div({
    position: 'absolute',
    top: '44px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: FONT_MONO,
    fontSize: scaled(11),
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    padding: '4px 10px',
    borderRadius: '10px',
    background: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(4px)',
    opacity: '0',
    transition: 'opacity 0.3s ease',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  })
  root.appendChild(latencyEl)

  const tutorialInstructionEl = div({
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
  root.appendChild(tutorialInstructionEl)

  const countdownOverlay = div({
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

  const countdownReadyEl = div({
    fontFamily: FONT_TEXT,
    fontSize: scaled(42),
    fontWeight: '800',
    color: GOLD,
    textShadow: '0 0 30px rgba(255, 215, 0, 0.4)',
    textAlign: 'center',
  })
  countdownOverlay.appendChild(countdownReadyEl)

  const countdownNumberEl = div({
    fontFamily: FONT_MONO,
    fontSize: scaled(120),
    fontWeight: '900',
    color: '#fff',
    textShadow: '0 0 40px rgba(255,255,255,0.3)',
  })
  countdownOverlay.appendChild(countdownNumberEl)
  root.appendChild(countdownOverlay)

  return {
    scoreEl,
    multiplierEl,
    livesEl,
    dekeEl,
    comboEl,
    announcerBarEl,
    announcerTextEl,
    speedEl,
    stickhandlingEl,
    latencyEl,
    playerNameEl,
    tutorialInstructionEl,
    countdownOverlay,
    countdownReadyEl,
    countdownNumberEl,
  }
}
