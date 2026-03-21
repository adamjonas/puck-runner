import { MESSAGE_TYPES, WS_ENDPOINTS, type TrackingInput } from '@shared/protocol'

interface TrackerConnectionHandlers {
  onTrackingInput: (input: TrackingInput) => void
  onTrackerConnected: () => void
  onTrackerDisconnected: () => void
}

export class TrackerConnection {
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private reconnectDelay = 1000
  private readonly maxReconnectDelay = 10000
  private destroyed = false

  constructor(private readonly handlers: TrackerConnectionHandlers) {}

  connect(): void {
    if (this.destroyed || this.ws) return

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${location.host}${WS_ENDPOINTS.gamePath}`

    try {
      this.ws = new WebSocket(url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      console.log('[input] Connected to relay')
      this.reconnectDelay = 1000
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === MESSAGE_TYPES.input) {
          this.handlers.onTrackingInput(msg as TrackingInput)
        } else if (msg.type === 'tracker_connected') {
          this.handlers.onTrackerConnected()
        } else if (msg.type === 'tracker_disconnected') {
          this.handlers.onTrackerDisconnected()
        }
      } catch {
        // Drop malformed messages
      }
    }

    this.ws.onclose = () => {
      console.log('[input] Disconnected from relay')
      this.ws = null
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {}
  }

  destroy(): void {
    this.destroyed = true

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer !== null) return

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      this.connect()
    }, this.reconnectDelay)
  }
}
