import AVFoundation
import UIKit

/// Manages AVFoundation camera capture at 30fps, delivering CVPixelBuffer frames via callback.
final class CameraManager: NSObject, ObservableObject {
    let session = AVCaptureSession()

    @Published var permissionStatus: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
    @Published var isRunning = false

    /// Called on each captured frame with the pixel buffer. Set by ContentView to wire into BallDetector.
    var onFrame: ((CVPixelBuffer) -> Void)?

    private let sessionQueue = DispatchQueue(label: "com.pucktracker.camera", qos: .userInitiated)
    private var isConfigured = false

    // MARK: - Permission

    func requestPermission() {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        permissionStatus = status

        switch status {
        case .authorized:
            configureAndStart()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    self?.permissionStatus = granted ? .authorized : .denied
                    if granted {
                        self?.configureAndStart()
                    }
                }
            }
        case .denied, .restricted:
            break
        @unknown default:
            break
        }
    }

    // MARK: - Session Configuration

    private func configureAndStart() {
        guard !isConfigured else {
            startSession()
            return
        }

        sessionQueue.async { [weak self] in
            self?.configureSession()
            self?.startSession()
        }
    }

    private func configureSession() {
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        session.sessionPreset = .hd1280x720

        // Camera input — prefer wide-angle back camera
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            print("[CameraManager] No back camera available")
            return
        }

        do {
            // Lock for configuration to set frame rate
            try camera.lockForConfiguration()
            // Target 30fps
            let targetFPS = CMTimeMake(value: 1, timescale: 30)
            camera.activeVideoMinFrameDuration = targetFPS
            camera.activeVideoMaxFrameDuration = targetFPS
            // Disable auto-focus hunting (fixed focus is more stable for tracking)
            if camera.isFocusModeSupported(.continuousAutoFocus) {
                camera.focusMode = .continuousAutoFocus
            }
            // Lock exposure for consistent detection
            if camera.isExposureModeSupported(.continuousAutoExposure) {
                camera.exposureMode = .continuousAutoExposure
            }
            camera.unlockForConfiguration()

            let input = try AVCaptureDeviceInput(device: camera)
            if session.canAddInput(input) {
                session.addInput(input)
            }
        } catch {
            print("[CameraManager] Failed to configure camera: \(error)")
            return
        }

        // Video output
        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: sessionQueue)

        if session.canAddOutput(output) {
            session.addOutput(output)
        }

        // Keep captured buffers in portrait camera space.
        // The detector and preview each rotate into the app's landscape coordinate space explicitly.
        if let connection = output.connection(with: .video) {
            if connection.isVideoOrientationSupported {
                connection.videoOrientation = .portrait
            }
        }

        isConfigured = true
    }

    func startSession() {
        sessionQueue.async { [weak self] in
            guard let self, !self.session.isRunning else { return }
            self.session.startRunning()
            DispatchQueue.main.async {
                self.isRunning = true
            }
        }
    }

    func stopSession() {
        sessionQueue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning()
            DispatchQueue.main.async {
                self.isRunning = false
            }
        }
    }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension CameraManager: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        onFrame?(pixelBuffer)
    }

    func captureOutput(
        _ output: AVCaptureOutput,
        didDrop sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        // Frames dropped — acceptable, we just skip
    }
}
