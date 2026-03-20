import Foundation
import Combine

/// Classifies normalized ball position into lanes, detects dekes with hysteresis,
/// and detects stickhandling (oscillation frequency analysis).
final class PositionClassifier: ObservableObject {

    // MARK: - Lane Constants (from protocol.ts)

    enum Constants {
        static let leftMax = SharedTrackerConfig.LaneBoundaries.leftMax
        static let deadZoneLeft = SharedTrackerConfig.LaneBoundaries.deadZoneLeft
        static let deadZoneRight = SharedTrackerConfig.LaneBoundaries.deadZoneRight
        static let rightMin = SharedTrackerConfig.LaneBoundaries.rightMin

        // Deke thresholds (Y-axis, hysteresis)
        static let dekeEnter = SharedTrackerConfig.DekeThresholds.enter
        static let dekeExit = SharedTrackerConfig.DekeThresholds.exit

        // Stickhandling detection
        static let minOscillationFrequency: Double = 1.5   // Hz — below this is just movement
        static let maxOscillationFrequency: Double = 8.0    // Hz — above this is noise
        static let oscillationWindowSize: Int = 30          // frames (~1 second at 30fps)
        static let minAmplitude: CGFloat = 0.03             // minimum X displacement to count
    }

    // MARK: - Published State

    @Published var currentLane: Lane = .center
    @Published var isDekeActive: Bool = false
    @Published var stickhandlingActive: Bool = false
    @Published var stickhandlingFrequency: Double = 0.0
    @Published var stickhandlingAmplitude: Double = 0.0

    // MARK: - Internal State

    /// Previous lane — used for dead zone hysteresis (stay in previous lane while in dead zone)
    private var previousLane: Lane = .center

    /// Stickhandling detection: ring buffer of recent X positions
    private var xHistory: [CGFloat] = []
    private var xTimestamps: [TimeInterval] = []

    // MARK: - Calibration Overrides

    /// These can be overridden by CalibrationView
    var leftBoundary: CGFloat = Constants.leftMax
    var deadZoneLeftBoundary: CGFloat = Constants.deadZoneLeft
    var deadZoneRightBoundary: CGFloat = Constants.deadZoneRight
    var rightBoundary: CGFloat = Constants.rightMin
    var dekeEnterThreshold: CGFloat = Constants.dekeEnter
    var dekeExitThreshold: CGFloat = Constants.dekeExit

    // MARK: - Init

    init() {
        loadCalibration()
    }

    /// Load persisted calibration values from UserDefaults (if any).
    private func loadCalibration() {
        let defaults = UserDefaults.standard
        if defaults.object(forKey: "cal_leftBoundary") != nil {
            leftBoundary = CGFloat(defaults.double(forKey: "cal_leftBoundary"))
            deadZoneLeftBoundary = CGFloat(defaults.double(forKey: "cal_deadZoneLeft"))
            deadZoneRightBoundary = CGFloat(defaults.double(forKey: "cal_deadZoneRight"))
            rightBoundary = CGFloat(defaults.double(forKey: "cal_rightBoundary"))
            dekeEnterThreshold = CGFloat(defaults.double(forKey: "cal_dekeEnter"))
            dekeExitThreshold = CGFloat(defaults.double(forKey: "cal_dekeExit"))
            print("[PositionClassifier] Loaded calibration from UserDefaults")
        }
    }

    // MARK: - Update

    func update(position: CGPoint, confidence: Double) {
        guard confidence > 0.1 else {
            // Low confidence — don't update classification, but still mark stickhandling off
            stickhandlingActive = false
            return
        }

        classifyLane(x: position.x)
        classifyDeke(y: position.y)
        detectStickhandling(x: position.x)
    }

    // MARK: - Lane Classification

    private func classifyLane(x: CGFloat) {
        let newLane: Lane

        if x < leftBoundary {
            newLane = .left
        } else if x < deadZoneLeftBoundary {
            // Dead zone between left and center — maintain previous lane (hysteresis)
            newLane = previousLane == .center || previousLane == .left ? previousLane : .center
        } else if x < deadZoneRightBoundary {
            newLane = .center
        } else if x < rightBoundary {
            // Dead zone between center and right — maintain previous lane (hysteresis)
            newLane = previousLane == .center || previousLane == .right ? previousLane : .center
        } else {
            newLane = .right
        }

        if newLane != currentLane {
            previousLane = currentLane
            currentLane = newLane
        }
    }

    // MARK: - Deke Detection (Hysteresis)

    private func classifyDeke(y: CGFloat) {
        if isDekeActive {
            // Exit deke when ball moves back beyond exit threshold
            if y > dekeExitThreshold {
                isDekeActive = false
            }
        } else {
            // Enter deke when ball goes below enter threshold
            if y < dekeEnterThreshold {
                isDekeActive = true
            }
        }
    }

    // MARK: - Stickhandling Detection (Oscillation Frequency)

    private func detectStickhandling(x: CGFloat) {
        let now = ProcessInfo.processInfo.systemUptime

        // Append to ring buffer
        xHistory.append(x)
        xTimestamps.append(now)

        // Trim to window size
        while xHistory.count > Constants.oscillationWindowSize {
            xHistory.removeFirst()
            xTimestamps.removeFirst()
        }

        // Need at least half the window to make a determination
        guard xHistory.count >= Constants.oscillationWindowSize / 2 else {
            stickhandlingActive = false
            stickhandlingFrequency = 0.0
            stickhandlingAmplitude = 0.0
            return
        }

        // Count zero-crossings (direction changes) in X movement
        // A direction change indicates one half-cycle of oscillation
        var directionChanges = 0
        var maxX: CGFloat = xHistory[0]
        var minX: CGFloat = xHistory[0]
        var lastDirection: Int = 0  // +1 = increasing, -1 = decreasing

        for i in 1..<xHistory.count {
            let diff = xHistory[i] - xHistory[i - 1]
            let direction: Int
            if diff > 0.005 {
                direction = 1
            } else if diff < -0.005 {
                direction = -1
            } else {
                direction = lastDirection  // noise dead band
            }

            if direction != 0 && direction != lastDirection && lastDirection != 0 {
                directionChanges += 1
            }
            if direction != 0 {
                lastDirection = direction
            }

            maxX = max(maxX, xHistory[i])
            minX = min(minX, xHistory[i])
        }

        let amplitude = maxX - minX
        let timeSpan = xTimestamps.last! - xTimestamps.first!

        guard timeSpan > 0.1 else {
            stickhandlingActive = false
            return
        }

        // Each pair of direction changes = one full oscillation cycle
        let fullCycles = Double(directionChanges) / 2.0
        let frequency = fullCycles / timeSpan

        stickhandlingFrequency = frequency
        stickhandlingAmplitude = Double(amplitude)

        stickhandlingActive = frequency >= Constants.minOscillationFrequency
            && frequency <= Constants.maxOscillationFrequency
            && amplitude >= Constants.minAmplitude
    }

    // MARK: - Reset

    func reset() {
        currentLane = .center
        previousLane = .center
        isDekeActive = false
        stickhandlingActive = false
        stickhandlingFrequency = 0.0
        stickhandlingAmplitude = 0.0
        xHistory.removeAll()
        xTimestamps.removeAll()
    }
}

// MARK: - Lane Enum

enum Lane: String, Codable {
    case left
    case center
    case right
}
