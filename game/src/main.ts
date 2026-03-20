import { GameSessionController } from './game-session-controller'

const canvas = document.getElementById('game') as HTMLCanvasElement

try {
  const session = new GameSessionController(canvas)
  session.start()
  console.log('[puck-runner] Phase 3 ready — press SPACE to start')
} catch (err) {
  console.error('[puck-runner] Failed to initialize:', err)
  const msg = document.createElement('div')
  msg.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'color:#e74c3c;font-family:-apple-system,sans-serif;font-size:1.2rem;text-align:center;padding:2rem;'
  msg.textContent = 'WebGL is required to run Puck Runner. Please use a browser with GPU acceleration enabled.'
  document.body.appendChild(msg)
}
