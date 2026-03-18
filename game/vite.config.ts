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
  server: {
    host: '0.0.0.0', // Allow connections from other devices on the network
    port: 5173,
  },
})
