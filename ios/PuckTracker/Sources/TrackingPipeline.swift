import Foundation
import CoreGraphics

enum TrackingPipeline {
    static func start(
        cameraManager: CameraManager,
        ballDetector: BallDetector,
        positionClassifier: PositionClassifier,
        webSocketManager: WebSocketManager
    ) {
        cameraManager.requestPermission()

        cameraManager.onFrame = { [weak ballDetector] frame in
            ballDetector?.processFrame(frame)
        }

        ballDetector.onPositionUpdate = { [weak positionClassifier, weak webSocketManager] position, confidence, timing in
            guard let classifier = positionClassifier,
                  let ws = webSocketManager else { return }

            classifier.update(position: position, confidence: confidence)
            ws.send(makeTrackingMessage(
                position: position,
                confidence: confidence,
                classifier: classifier,
                timing: timing
            ))
        }

        let host = UserDefaults.standard.string(forKey: "serverHost") ?? "192.168.1.100"
        webSocketManager.connect(host: host)
    }

    static func stop(
        cameraManager: CameraManager,
        ballDetector: BallDetector,
        webSocketManager: WebSocketManager
    ) {
        cameraManager.onFrame = nil
        ballDetector.onPositionUpdate = nil
        cameraManager.stopSession()
        webSocketManager.disconnect()
    }

    private static func makeTrackingMessage(
        position: CGPoint,
        confidence: Double,
        classifier: PositionClassifier,
        timing: DetectionTiming
    ) -> TrackingMessage {
        TrackingMessage(
            type: SharedTrackerConfig.MessageTypes.input,
            ts: Int64(Date().timeIntervalSince1970 * 1000),
            raw: .init(x: position.x, y: position.y),
            lane: classifier.currentLane.rawValue,
            deke: classifier.isDekeActive,
            confidence: confidence,
            stickhandling: .init(
                active: classifier.stickhandlingActive,
                frequency: classifier.stickhandlingFrequency,
                amplitude: classifier.stickhandlingAmplitude
            ),
            debugTiming: .init(
                frameId: timing.frameId,
                captureTs: timing.captureTs,
                detectDoneTs: timing.detectDoneTs,
                sendTs: 0
            )
        )
    }
}
