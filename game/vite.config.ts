import { defineConfig } from 'vite'
import path from 'path'
import { wsRelayPlugin } from './server/ws-plugin'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  plugins: [wsRelayPlugin()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three'
          }

          if (
            id.includes('/game/src/renderer') ||
            id.includes('/game/src/rink-view') ||
            id.includes('/game/src/avatar-view') ||
            id.includes('/game/src/particle-effects') ||
            id.includes('/game/src/obstacle-view-pool') ||
            id.includes('/game/src/coin-view-pool')
          ) {
            return 'rendering'
          }

          if (
            id.includes('/game/src/title-overlay') ||
            id.includes('/game/src/hud-overlay') ||
            id.includes('/game/src/game-over-overlay') ||
            id.includes('/game/src/overlay-utils') ||
            id.includes('/game/src/ui-overlay')
          ) {
            return 'overlay'
          }
        },
      },
    },
  },
  server: {
    host: '0.0.0.0', // Allow connections from other devices on the network
    port: 5173,
  },
})
