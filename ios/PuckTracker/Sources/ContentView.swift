import SwiftUI
import AVFoundation

// MARK: - Main Content View

struct ContentView: View {
    @EnvironmentObject var cameraManager: CameraManager
    @EnvironmentObject var ballDetector: BallDetector
    @EnvironmentObject var positionClassifier: PositionClassifier
    @EnvironmentObject var webSocketManager: WebSocketManager

    @State private var showSettings = false
    @State private var showCalibration = false

    var body: some View {
        ZStack {
            // Camera preview layer
            CameraPreviewView(session: cameraManager.session)
                .ignoresSafeArea()

            // Tracking overlay
            TrackingOverlayView(
                ballPosition: ballDetector.smoothedPosition,
                confidence: ballDetector.confidence,
                lane: positionClassifier.currentLane,
                deke: positionClassifier.isDekeActive
            )

            // HUD
            VStack {
                HStack {
                    ConnectionStatusBadge(state: webSocketManager.connectionState)
                    Spacer()
                    HStack(spacing: 12) {
                        Button {
                            showCalibration = true
                        } label: {
                            Image(systemName: "scope")
                                .font(.title2)
                                .foregroundColor(.white)
                                .padding(8)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                        Button {
                            showSettings = true
                        } label: {
                            Image(systemName: "gearshape")
                                .font(.title2)
                                .foregroundColor(.white)
                                .padding(8)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                    }
                }
                .padding()

                Spacer()

                // Debug info bar
                DebugInfoBar(
                    confidence: ballDetector.confidence,
                    lane: positionClassifier.currentLane,
                    deke: positionClassifier.isDekeActive,
                    stickhandling: positionClassifier.stickhandlingActive,
                    frequency: positionClassifier.stickhandlingFrequency,
                    rawPosition: ballDetector.smoothedPosition
                )
                .padding(.horizontal)
                .padding(.bottom, 8)
            }

            // Camera permission overlay
            if cameraManager.permissionStatus != .authorized {
                CameraPermissionOverlay(status: cameraManager.permissionStatus)
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(webSocketManager)
        }
        .sheet(isPresented: $showCalibration) {
            CalibrationView()
                .environmentObject(ballDetector)
                .environmentObject(positionClassifier)
        }
        .onAppear {
            startPipeline()
        }
        .onDisappear {
            stopPipeline()
        }
    }

    private func startPipeline() {
        cameraManager.requestPermission()

        // Wire up the pipeline: camera → detector → classifier → websocket
        cameraManager.onFrame = { [weak ballDetector] pixelBuffer in
            ballDetector?.processFrame(pixelBuffer)
        }

        ballDetector.onPositionUpdate = { [weak positionClassifier, weak webSocketManager] position, confidence in
            guard let classifier = positionClassifier,
                  let ws = webSocketManager else { return }

            classifier.update(position: position, confidence: confidence)

            let message = TrackingMessage(
                type: "input",
                ts: Int64(Date().timeIntervalSince1970 * 1000),
                raw: .init(x: position.x, y: position.y),
                lane: classifier.currentLane.rawValue,
                deke: classifier.isDekeActive,
                confidence: confidence,
                stickhandling: .init(
                    active: classifier.stickhandlingActive,
                    frequency: classifier.stickhandlingFrequency,
                    amplitude: classifier.stickhandlingAmplitude
                )
            )
            ws.send(message)
        }

        // Connect WebSocket with stored host
        let host = UserDefaults.standard.string(forKey: "serverHost") ?? "192.168.1.100"
        webSocketManager.connect(host: host)
    }

    private func stopPipeline() {
        cameraManager.stopSession()
        webSocketManager.disconnect()
    }
}

// MARK: - Camera Preview (UIViewRepresentable)

struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> CameraPreviewUIView {
        let view = CameraPreviewUIView()
        view.previewLayer.session = session
        return view
    }

    func updateUIView(_ uiView: CameraPreviewUIView, context: Context) {
        uiView.previewLayer.session = session
        uiView.setNeedsLayout()
    }
}

final class CameraPreviewUIView: UIView {
    let previewLayer = AVCaptureVideoPreviewLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        commonInit()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        previewLayer.videoGravity = .resizeAspectFill
        layer.addSublayer(previewLayer)
    }

    override func layoutSubviews() {
        super.layoutSubviews()

        // Keep the preview in portrait capture space, then rotate it into the app's landscape UI.
        if let connection = previewLayer.connection, connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }

        previewLayer.setAffineTransform(.identity)
        previewLayer.bounds = CGRect(origin: .zero, size: CGSize(width: bounds.height, height: bounds.width))
        previewLayer.position = CGPoint(x: bounds.midX, y: bounds.midY)
        previewLayer.setAffineTransform(CGAffineTransform(rotationAngle: -.pi / 2))
    }
}

// MARK: - Tracking Overlay

struct TrackingOverlayView: View {
    let ballPosition: CGPoint
    let confidence: Double
    let lane: Lane
    let deke: Bool

    var body: some View {
        GeometryReader { geo in
            // Lane dividers
            let leftEdge = geo.size.width * 0.3
            let leftDeadEnd = geo.size.width * 0.33
            let rightDeadStart = geo.size.width * 0.67
            let rightEdge = geo.size.width * 0.7

            // Dead zone shading
            Rectangle()
                .fill(Color.yellow.opacity(0.15))
                .frame(width: leftDeadEnd - leftEdge)
                .position(x: (leftEdge + leftDeadEnd) / 2, y: geo.size.height / 2)

            Rectangle()
                .fill(Color.yellow.opacity(0.15))
                .frame(width: rightEdge - rightDeadStart)
                .position(x: (rightDeadStart + rightEdge) / 2, y: geo.size.height / 2)

            // Lane lines
            ForEach([leftEdge, leftDeadEnd, rightDeadStart, rightEdge], id: \.self) { xPos in
                Path { path in
                    path.move(to: CGPoint(x: xPos, y: 0))
                    path.addLine(to: CGPoint(x: xPos, y: geo.size.height))
                }
                .stroke(Color.white.opacity(0.3), style: StrokeStyle(lineWidth: 1, dash: [5, 5]))
            }

            // Deke line
            let dekeY = geo.size.height * 0.25
            let dekeExitY = geo.size.height * 0.35
            Path { path in
                path.move(to: CGPoint(x: 0, y: dekeY))
                path.addLine(to: CGPoint(x: geo.size.width, y: dekeY))
            }
            .stroke(Color.red.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [8, 4]))

            Path { path in
                path.move(to: CGPoint(x: 0, y: dekeExitY))
                path.addLine(to: CGPoint(x: geo.size.width, y: dekeExitY))
            }
            .stroke(Color.orange.opacity(0.3), style: StrokeStyle(lineWidth: 1, dash: [8, 4]))

            // Ball crosshair
            if confidence > 0.1 {
                let bx = ballPosition.x * geo.size.width
                let by = ballPosition.y * geo.size.height

                Circle()
                    .stroke(crosshairColor, lineWidth: 2)
                    .frame(width: 30, height: 30)
                    .position(x: bx, y: by)

                // Crosshair lines
                Path { path in
                    path.move(to: CGPoint(x: bx - 20, y: by))
                    path.addLine(to: CGPoint(x: bx + 20, y: by))
                    path.move(to: CGPoint(x: bx, y: by - 20))
                    path.addLine(to: CGPoint(x: bx, y: by + 20))
                }
                .stroke(crosshairColor, lineWidth: 1)
            }
        }
        .allowsHitTesting(false)
    }

    private var crosshairColor: Color {
        if deke { return .red }
        switch lane {
        case .left: return .blue
        case .center: return .green
        case .right: return .orange
        }
    }
}

// MARK: - Connection Status Badge

struct ConnectionStatusBadge: View {
    let state: WebSocketManager.ConnectionState

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
            Text(statusText)
                .font(.caption)
                .foregroundColor(.white)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial, in: Capsule())
    }

    private var statusColor: Color {
        switch state {
        case .connected: return .green
        case .connecting: return .yellow
        case .disconnected: return .red
        }
    }

    private var statusText: String {
        switch state {
        case .connected: return "Connected"
        case .connecting: return "Connecting..."
        case .disconnected: return "Disconnected"
        }
    }
}

// MARK: - Debug Info Bar

struct DebugInfoBar: View {
    let confidence: Double
    let lane: Lane
    let deke: Bool
    let stickhandling: Bool
    let frequency: Double
    let rawPosition: CGPoint

    var body: some View {
        HStack(spacing: 16) {
            Text("Conf: \(String(format: "%.0f%%", confidence * 100))")
            Text("Lane: \(lane.rawValue)")
            if deke {
                Text("DEKE")
                    .foregroundColor(.red)
                    .fontWeight(.bold)
            }
            if stickhandling {
                Text("Stickhandling \(String(format: "%.1fHz", frequency))")
                    .foregroundColor(.cyan)
            }
            Spacer()
            Text("(\(String(format: "%.2f", rawPosition.x)), \(String(format: "%.2f", rawPosition.y)))")
        }
        .font(.caption.monospaced())
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Camera Permission Overlay

struct CameraPermissionOverlay: View {
    let status: AVAuthorizationStatus

    var body: some View {
        ZStack {
            Color.black.opacity(0.85)
                .ignoresSafeArea()

            VStack(spacing: 20) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 48))
                    .foregroundColor(.gray)

                Text(titleText)
                    .font(.title2.bold())
                    .foregroundColor(.white)

                Text(bodyText)
                    .font(.body)
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)

                if status == .denied || status == .restricted {
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
    }

    private var titleText: String {
        switch status {
        case .notDetermined: return "Camera Access Required"
        case .denied: return "Camera Access Denied"
        case .restricted: return "Camera Restricted"
        default: return "Camera Unavailable"
        }
    }

    private var bodyText: String {
        switch status {
        case .notDetermined:
            return "PuckTracker needs camera access to track the ball position. Please grant access when prompted."
        case .denied:
            return "Camera access was denied. Please enable it in Settings to use PuckTracker."
        case .restricted:
            return "Camera access is restricted on this device. PuckTracker cannot function without camera access."
        default:
            return "An unexpected camera state occurred."
        }
    }
}
