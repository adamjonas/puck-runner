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

        // Stickhandling detection (peak/trough based)
        static let minOscillationFrequency: Double = 1.5   // Hz — below this is just movement
        static let maxOscillationFrequency: Double = 8.0    // Hz — above this is noise
        static let peakHistorySize: Int = 12                // max recent peaks/troughs to keep
        static let minAmplitude: CGFloat = 0.03             // minimum peak-to-trough displacement
        static let peakDeadBand: CGFloat = 0.002            // stays below the minimum valid 60fps motion step
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

    /// Stickhandling detection: peak/trough tracker
    private struct Extremum {
        let value: CGFloat
        let time: TimeInterval
        let isPeak: Bool
    }
    private var extrema: [Extremum] = []
    private var lastDirection: Int = 0  // +1 rising, -1 falling
    private var lastX: CGFloat = 0.5
    private var runningExtremum: CGFloat = 0.5
    private var hasFirstSample = false

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

    // MARK: - Stickhandling Detection (Peak/Trough Tracking)
    //
    // Tracks actual peaks and troughs in X movement rather than counting zero-crossings.
    // Benefits:
    //   - Responds faster (~2 cycles vs ~1 second window)
    //   - Handles non-sinusoidal motion patterns
    //   - Amplitude computed from actual peak-to-trough distances
    //   - Frequency from peak-to-peak timing (more accurate)

    private func detectStickhandling(x: CGFloat) {
        let now = ProcessInfo.processInfo.systemUptime

        if !hasFirstSample {
            lastX = x
            runningExtremum = x
            hasFirstSample = true
            return
        }

        let diff = x - lastX
        let deadBand = Constants.peakDeadBand

        // Determine movement direction (with dead band to reject noise)
        let direction: Int
        if diff > deadBand {
            direction = 1
        } else if diff < -deadBand {
            direction = -1
        } else {
            direction = lastDirection
        }

        // Track the running extremum in current direction
        if direction == 1 {
            runningExtremum = max(runningExtremum, x)
        } else if direction == -1 {
            runningExtremum = min(runningExtremum, x)
        }

        // Detect direction reversal → record the extremum
        if direction != 0 && lastDirection != 0 && direction != lastDirection {
            let isPeak = lastDirection == 1  // was going up, now going down → peak
            extrema.append(Extremum(value: runningExtremum, time: now, isPeak: isPeak))

            // Trim old extrema
            while extrema.count > Constants.peakHistorySize {
                extrema.removeFirst()
            }

            // Reset running extremum for new direction
            runningExtremum = x
        }

        if direction != 0 {
            lastDirection = direction
        }
        lastX = x

        // Prune extrema older than 1.5 seconds (stale data)
        extrema.removeAll { now - $0.time > 1.5 }

        // Need at least 3 extrema (peak-trough-peak or trough-peak-trough) for one full cycle
        guard extrema.count >= 3 else {
            stickhandlingActive = false
            stickhandlingFrequency = 0.0
            stickhandlingAmplitude = 0.0
            return
        }

        // Compute frequency from consecutive same-type extrema (peak-to-peak or trough-to-trough)
        var periodSum: TimeInterval = 0
        var periodCount = 0
        var amplitudeSum: CGFloat = 0
        var amplitudeCount = 0

        for i in 1..<extrema.count {
            // Period: time between consecutive same-type extrema
            if i >= 2 && extrema[i].isPeak == extrema[i - 2].isPeak {
                let period = extrema[i].time - extrema[i - 2].time
                if period > 0.05 { // reject impossibly fast
                    periodSum += period
                    periodCount += 1
                }
            }

            // Amplitude: distance between adjacent peak and trough
            if extrema[i].isPeak != extrema[i - 1].isPeak {
                amplitudeSum += abs(extrema[i].value - extrema[i - 1].value)
                amplitudeCount += 1
            }
        }

        guard periodCount > 0 && amplitudeCount > 0 else {
            stickhandlingActive = false
            stickhandlingFrequency = 0.0
            stickhandlingAmplitude = 0.0
            return
        }

        let avgPeriod = periodSum / Double(periodCount)
        let frequency = 1.0 / avgPeriod
        let avgAmplitude = amplitudeSum / CGFloat(amplitudeCount)

        stickhandlingFrequency = frequency
        stickhandlingAmplitude = Double(avgAmplitude)

        stickhandlingActive = frequency >= Constants.minOscillationFrequency
            && frequency <= Constants.maxOscillationFrequency
            && avgAmplitude >= Constants.minAmplitude
    }

    // MARK: - Reset

    func reset() {
        currentLane = .center
        previousLane = .center
        isDekeActive = false
        stickhandlingActive = false
        stickhandlingFrequency = 0.0
        stickhandlingAmplitude = 0.0
        extrema.removeAll()
        lastDirection = 0
        lastX = 0.5
        runningExtremum = 0.5
        hasFirstSample = false
    }
}

// MARK: - Lane Enum

enum Lane: String, Codable {
    case left
    case center
    case right
}
