import { GameSessionController } from './game-session-controller'

const canvas = document.getElementById('game') as HTMLCanvasElement
const session = new GameSessionController(canvas)

session.start()

console.log('[puck-runner] Phase 3 ready — press SPACE to start')
