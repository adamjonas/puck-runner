import SwiftUI

/// 4-step calibration: center, left edge, right edge, pull-back.
/// Captures ball positions at each step to set lane thresholds and deke boundaries.
struct CalibrationView: View {
    @EnvironmentObject var ballDetector: BallDetector
    @EnvironmentObject var positionClassifier: PositionClassifier
    @Environment(\.dismiss) private var dismiss

    @State private var currentStep: CalibrationStep = .center
    @State private var centerX: CGFloat?
    @State private var leftX: CGFloat?
    @State private var rightX: CGFloat?
    @State private var pullBackY: CGFloat?
    @State private var isCapturing = false
    @State private var capturedSamples: [CGPoint] = []
    @State private var captureTimer: Timer?
    @State private var showCompleted = false

    private let samplesNeeded = 15  // ~0.5s at 30fps

    enum CalibrationStep: Int, CaseIterable {
        case center = 0
        case leftEdge = 1
        case rightEdge = 2
        case pullBack = 3

        var title: String {
            switch self {
            case .center: return "Step 1: Center"
            case .leftEdge: return "Step 2: Left Edge"
            case .rightEdge: return "Step 3: Right Edge"
            case .pullBack: return "Step 4: Pull Back"
            }
        }

        var instruction: String {
            switch self {
            case .center:
                return "Place the ball in the CENTER of the playing area and hold it still."
            case .leftEdge:
                return "Move the ball to the LEFT EDGE of the playing area and hold it still."
            case .rightEdge:
                return "Move the ball to the RIGHT EDGE of the playing area and hold it still."
            case .pullBack:
                return "Pull the ball TOWARDS YOU (close to the camera) for the deke zone and hold it still."
            }
        }

        var iconName: String {
            switch self {
            case .center: return "circle.circle"
            case .leftEdge: return "arrow.left.to.line"
            case .rightEdge: return "arrow.right.to.line"
            case .pullBack: return "arrow.down.to.line"
            }
        }
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                // Progress indicator
                HStack(spacing: 12) {
                    ForEach(CalibrationStep.allCases, id: \.rawValue) { step in
                        Circle()
                            .fill(stepColor(for: step))
                            .frame(width: 12, height: 12)
                    }
                }
                .padding(.top)

                if showCompleted {
                    completedView
                } else {
                    stepView
                }

                Spacer()
            }
            .navigationTitle("Calibration")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        captureTimer?.invalidate()
                        dismiss()
                    }
                }
            }
        }
    }

    // MARK: - Step View

    private var stepView: some View {
        VStack(spacing: 20) {
            Image(systemName: currentStep.iconName)
                .font(.system(size: 48))
                .foregroundColor(.accentColor)

            Text(currentStep.title)
                .font(.title2.bold())

            Text(currentStep.instruction)
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            // Confidence indicator
            if ballDetector.confidence > 0.1 {
                VStack(spacing: 4) {
                    Text("Ball detected")
                        .font(.caption)
                        .foregroundColor(.green)
                    Text("Position: (\(String(format: "%.3f", ballDetector.smoothedPosition.x)), \(String(format: "%.3f", ballDetector.smoothedPosition.y)))")
                        .font(.caption.monospaced())
                        .foregroundColor(.secondary)
                }
            } else {
                Text("No ball detected — move ball into frame")
                    .font(.caption)
                    .foregroundColor(.orange)
            }

            // Capture button
            Button {
                startCapture()
            } label: {
                HStack {
                    if isCapturing {
                        ProgressView()
                            .tint(.white)
                        Text("Capturing... (\(capturedSamples.count)/\(samplesNeeded))")
                    } else {
                        Image(systemName: "scope")
                        Text("Capture Position")
                    }
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(isCapturing ? Color.orange : Color.accentColor)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .disabled(isCapturing || ballDetector.confidence < 0.2)
            .padding(.horizontal, 32)
        }
    }

    // MARK: - Completed View

    private var completedView: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundColor(.green)

            Text("Calibration Complete")
                .font(.title2.bold())

            VStack(alignment: .leading, spacing: 8) {
                if let cx = centerX { calibrationRow("Center X", value: cx) }
                if let lx = leftX { calibrationRow("Left edge", value: lx) }
                if let rx = rightX { calibrationRow("Right edge", value: rx) }
                if let py = pullBackY { calibrationRow("Deke Y", value: py) }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
            .padding(.horizontal, 32)

            Button {
                applyCalibration()
                dismiss()
            } label: {
                Text("Apply & Close")
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.green)
                    .foregroundColor(.white)
                    .cornerRadius(12)
            }
            .padding(.horizontal, 32)
        }
    }

    private func calibrationRow(_ label: String, value: CGFloat) -> some View {
        HStack {
            Text(label)
                .foregroundColor(.secondary)
            Spacer()
            Text(String(format: "%.3f", value))
                .font(.body.monospaced())
        }
    }

    // MARK: - Capture Logic

    private func startCapture() {
        isCapturing = true
        capturedSamples.removeAll()
        ballDetector.resetSmoothing()

        // Sample the ball position over ~0.5s
        captureTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { _ in
            guard ballDetector.confidence > 0.2 else { return }
            capturedSamples.append(ballDetector.smoothedPosition)

            if capturedSamples.count >= samplesNeeded {
                captureTimer?.invalidate()
                captureTimer = nil
                finishCapture()
            }
        }
    }

    private func finishCapture() {
        isCapturing = false

        // Average the captured samples
        let avgX = capturedSamples.map(\.x).reduce(0, +) / CGFloat(capturedSamples.count)
        let avgY = capturedSamples.map(\.y).reduce(0, +) / CGFloat(capturedSamples.count)

        switch currentStep {
        case .center:
            centerX = avgX
            currentStep = .leftEdge
        case .leftEdge:
            leftX = avgX
            currentStep = .rightEdge
        case .rightEdge:
            rightX = avgX
            currentStep = .pullBack
        case .pullBack:
            pullBackY = avgY
            showCompleted = true
        }
    }

    // MARK: - Apply Calibration

    private func applyCalibration() {
        guard let cx = centerX, let lx = leftX, let rx = rightX, let py = pullBackY else { return }

        // Calculate lane boundaries from calibrated positions
        // Left boundary = midpoint between left edge and center
        // Right boundary = midpoint between center and right edge
        // Add dead zones of ~10% of the gap width

        let leftCenter = (lx + cx) / 2.0
        let rightCenter = (cx + rx) / 2.0

        let leftGap = cx - lx
        let rightGap = rx - cx
        let deadZoneWidth: CGFloat = 0.03  // ~3% dead zone

        positionClassifier.leftBoundary = leftCenter
        positionClassifier.deadZoneLeftBoundary = leftCenter + deadZoneWidth
        positionClassifier.deadZoneRightBoundary = rightCenter - deadZoneWidth
        positionClassifier.rightBoundary = rightCenter

        // Deke threshold from pull-back position
        // Enter threshold is the calibrated pull-back Y, exit is 40% further out
        positionClassifier.dekeEnterThreshold = py
        positionClassifier.dekeExitThreshold = py + (py * 0.4)

        // Persist calibration
        let defaults = UserDefaults.standard
        defaults.set(Double(positionClassifier.leftBoundary), forKey: "cal_leftBoundary")
        defaults.set(Double(positionClassifier.deadZoneLeftBoundary), forKey: "cal_deadZoneLeft")
        defaults.set(Double(positionClassifier.deadZoneRightBoundary), forKey: "cal_deadZoneRight")
        defaults.set(Double(positionClassifier.rightBoundary), forKey: "cal_rightBoundary")
        defaults.set(Double(positionClassifier.dekeEnterThreshold), forKey: "cal_dekeEnter")
        defaults.set(Double(positionClassifier.dekeExitThreshold), forKey: "cal_dekeExit")

        print("[Calibration] Applied — left: \(positionClassifier.leftBoundary), right: \(positionClassifier.rightBoundary), deke: \(positionClassifier.dekeEnterThreshold)")
    }
}
