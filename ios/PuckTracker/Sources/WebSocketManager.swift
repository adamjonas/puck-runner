import Foundation
import Combine

/// Manages WebSocket connection to the game server using URLSessionWebSocketTask.
/// Sends TrackingInput JSON at 30Hz. Auto-reconnects with exponential backoff.
final class WebSocketManager: ObservableObject {

    enum ConnectionState: String {
        case connected
        case connecting
        case disconnected
    }

    // MARK: - Published State

    @Published var connectionState: ConnectionState = .disconnected

    // MARK: - Configuration

    private let port = SharedTrackerConfig.WebSocket.port
    private let path = SharedTrackerConfig.WebSocket.trackerPath

    // MARK: - Reconnection (exponential backoff)

    private let initialBackoff: TimeInterval = 1.0
    private let maxBackoff: TimeInterval = 10.0
    private var currentBackoff: TimeInterval = 1.0
    private var reconnectTask: Task<Void, Never>?
    private var shouldReconnect = false

    // MARK: - WebSocket

    private var webSocketTask: URLSessionWebSocketTask?
    private let session: URLSession
    private var host: String = ""
    private let encoder = JSONEncoder()

    // MARK: - Rate Limiting

    /// Throttle sends to prevent flooding. At 60fps camera, we send at most 60Hz.
    private var lastSendTime: TimeInterval = 0
    private let minSendInterval: TimeInterval = 1.0 / 66.0  // ~60Hz with slight margin

    // MARK: - Init

    init() {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
    }

    deinit {
        disconnect()
    }

    // MARK: - Connect / Disconnect

    func connect(host: String) {
        self.host = host
        shouldReconnect = true
        currentBackoff = initialBackoff
        establishConnection()
    }

    func disconnect() {
        shouldReconnect = false
        reconnectTask?.cancel()
        reconnectTask = nil
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        DispatchQueue.main.async { [weak self] in
            self?.connectionState = .disconnected
        }
    }

    func updateHost(_ newHost: String) {
        disconnect()
        connect(host: newHost)
    }

    // MARK: - Send

    func send(_ message: TrackingMessage) {
        guard connectionState == .connected else { return }

        // Rate limit
        let now = ProcessInfo.processInfo.systemUptime
        guard now - lastSendTime >= minSendInterval else { return }
        lastSendTime = now
        var outboundMessage = message
        if var timing = outboundMessage.debugTiming {
            timing.sendTs = currentUptimeMs()
            outboundMessage.debugTiming = timing
        }

        do {
            let data = try encoder.encode(outboundMessage)
            guard let jsonString = String(data: data, encoding: .utf8) else { return }
            webSocketTask?.send(.string(jsonString)) { [weak self] error in
                if let error {
                    print("[WebSocket] Send error: \(error.localizedDescription)")
                    self?.handleDisconnection()
                }
            }
        } catch {
            print("[WebSocket] Encoding error: \(error)")
        }
    }

    // MARK: - Connection Management

    private func establishConnection() {
        guard shouldReconnect else { return }

        let urlString = "ws://\(host):\(port)\(path)"
        guard let url = URL(string: urlString) else {
            print("[WebSocket] Invalid URL: \(urlString)")
            return
        }

        DispatchQueue.main.async { [weak self] in
            self?.connectionState = .connecting
        }

        let task = session.webSocketTask(with: url)
        self.webSocketTask = task
        task.resume()

        // Start listening for messages (to detect disconnection and receive game state)
        listenForMessages()

        // Confirm connection by sending a ping
        task.sendPing { [weak self] error in
            if let error {
                print("[WebSocket] Ping failed: \(error.localizedDescription)")
                self?.handleDisconnection()
            } else {
                DispatchQueue.main.async {
                    self?.connectionState = .connected
                    self?.currentBackoff = self?.initialBackoff ?? 1.0
                }
                print("[WebSocket] Connected to \(urlString)")
            }
        }
    }

    private func listenForMessages() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    // Handle incoming game state messages if needed
                    self?.handleReceivedMessage(text)
                case .data:
                    break  // Not expected
                @unknown default:
                    break
                }
                // Continue listening
                self?.listenForMessages()

            case .failure(let error):
                print("[WebSocket] Receive error: \(error.localizedDescription)")
                self?.handleDisconnection()
            }
        }
    }

    private func handleReceivedMessage(_ text: String) {
        if let data = text.data(using: .utf8),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let type = object["type"] as? String,
           type == "clock_sync_request",
           let t1Value = object["t1"] as? NSNumber {
            sendClockSyncResponse(t1: t1Value.doubleValue)
            return
        }

        #if DEBUG
        print("[WebSocket] Received: \(text.prefix(100))")
        #endif
    }

    private func sendClockSyncResponse(t1: Double) {
        guard connectionState == .connected else { return }

        let response = ClockSyncResponseMessage(
            type: "clock_sync_response",
            t1: t1,
            t2: currentUptimeMs()
        )

        do {
            let data = try encoder.encode(response)
            guard let jsonString = String(data: data, encoding: .utf8) else { return }
            webSocketTask?.send(.string(jsonString)) { [weak self] error in
                if let error {
                    print("[WebSocket] Clock sync send error: \(error.localizedDescription)")
                    self?.handleDisconnection()
                }
            }
        } catch {
            print("[WebSocket] Clock sync encoding error: \(error)")
        }
    }

    // MARK: - Reconnection with Exponential Backoff

    private func handleDisconnection() {
        webSocketTask?.cancel(with: .abnormalClosure, reason: nil)
        webSocketTask = nil

        DispatchQueue.main.async { [weak self] in
            self?.connectionState = .disconnected
        }

        scheduleReconnect()
    }

    private func scheduleReconnect() {
        guard shouldReconnect else { return }

        reconnectTask?.cancel()

        let delay = currentBackoff
        // Exponential backoff: 1s, 2s, 4s, 8s, capped at 10s
        currentBackoff = min(currentBackoff * 2, maxBackoff)

        print("[WebSocket] Reconnecting in \(delay)s...")

        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.establishConnection()
        }
    }
}

// MARK: - TrackingMessage (mirrors protocol.ts TrackingInput)

struct TrackingMessage: Codable {
    let type: String
    let ts: Int64
    let raw: RawPosition
    let lane: String
    let deke: Bool
    let confidence: Double
    let stickhandling: Stickhandling
    var debugTiming: DebugTiming?

    struct RawPosition: Codable {
        let x: Double
        let y: Double
    }

    struct Stickhandling: Codable {
        let active: Bool
        let frequency: Double
        let amplitude: Double
    }

    struct DebugTiming: Codable {
        let frameId: Int64
        let captureTs: Double
        let detectDoneTs: Double
        var sendTs: Double
    }
}

struct ClockSyncResponseMessage: Codable {
    let type: String
    let t1: Double
    let t2: Double
}
