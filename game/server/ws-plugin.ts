import type { Plugin, ViteDevServer } from 'vite'
import { WebSocketServer, WebSocket } from 'ws'
import trackerConfig from '../../shared/tracker-config.json'

const {
  webSocket: { port, trackerPath, gamePath },
} = trackerConfig

/**
 * Vite plugin that runs a WebSocket relay server.
 *
 * Architecture:
 *   iPhone (tracker) ──WS──▶ Vite server ──WS──▶ Browser (game)
 *
 * The iPhone connects as a "tracker" client.
 * The browser connects as a "game" client.
 * Input messages from trackers are relayed to all game clients.
 * State messages from game clients are relayed to all trackers.
 */
export function wsRelayPlugin(): Plugin {
  let wss: WebSocketServer | null = null
  const trackers = new Set<WebSocket>()
  const games = new Set<WebSocket>()

  return {
    name: 'ws-relay',

    configureServer(server: ViteDevServer) {
      // Attach WS server to Vite's HTTP server
      wss = new WebSocketServer({ noServer: true })

      server.httpServer?.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url || '', `http://${request.headers.host}`)

        if (url.pathname === trackerPath) {
          wss!.handleUpgrade(request, socket, head, (ws) => {
            wss!.emit('connection', ws, request, 'tracker')
          })
        } else if (url.pathname === gamePath) {
          wss!.handleUpgrade(request, socket, head, (ws) => {
            wss!.emit('connection', ws, request, 'game')
          })
        }
        // Let Vite's own HMR WebSocket handle other paths
      })

      wss.on('connection', (ws: WebSocket, _request: unknown, role: string) => {
        if (role === 'tracker') {
          trackers.add(ws)
          console.log(`[ws-relay] Tracker connected (${trackers.size} tracker(s))`)

          ws.on('message', (data) => {
            // Relay tracker input to all game clients
            const msg = data.toString()
            for (const game of games) {
              if (game.readyState === WebSocket.OPEN) {
                game.send(msg)
              }
            }
          })

          ws.on('close', () => {
            trackers.delete(ws)
            console.log(`[ws-relay] Tracker disconnected (${trackers.size} tracker(s))`)
            // Notify games that tracker disconnected
            for (const game of games) {
              if (game.readyState === WebSocket.OPEN) {
                game.send(JSON.stringify({ type: 'tracker_disconnected' }))
              }
            }
          })
        } else if (role === 'game') {
          games.add(ws)
          console.log(`[ws-relay] Game connected (${games.size} game(s))`)

          ws.on('message', (data) => {
            // Relay game state to all trackers
            const msg = data.toString()
            for (const tracker of trackers) {
              if (tracker.readyState === WebSocket.OPEN) {
                tracker.send(msg)
              }
            }
          })

          ws.on('close', () => {
            games.delete(ws)
            console.log(`[ws-relay] Game disconnected (${games.size} game(s))`)
          })

          // If a tracker is already connected, notify the new game client
          if (trackers.size > 0) {
            ws.send(JSON.stringify({ type: 'tracker_connected' }))
          }
        }
      })

      console.log('[ws-relay] WebSocket relay ready')
      console.log(`[ws-relay]   Tracker endpoint: ws://<host>:${port}${trackerPath}`)
      console.log(`[ws-relay]   Game endpoint:    ws://<host>:${port}${gamePath}`)
    },
  }
}
