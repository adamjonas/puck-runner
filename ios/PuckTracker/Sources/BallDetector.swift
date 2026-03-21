import CoreImage
import UIKit
import Combine

struct DetectionTiming {
    let frameId: Int64
    let captureTs: Double
    let detectDoneTs: Double
}

/// Detects a tracking object (bright tennis ball or dark puck) using color/brightness
/// thresholds with ROI tracking. Supports two detection modes:
///   - `.brightBall`: HSV color match for yellow-green tennis ball
///   - `.darkPuck`: low-brightness match for black puck on light surface
final class BallDetector: ObservableObject {

    // MARK: - Detection Mode

    enum DetectionMode: String, CaseIterable {
        case brightBall  // yellow-green tennis ball (HSV color match)
        case darkPuck    // black puck on light surface (low brightness)
    }

    @Published var mode: DetectionMode = .brightBall {
        didSet { if mode != oldValue { resetSmoothing() } }
    }

    // MARK: - Published State

    @Published var smoothedPosition: CGPoint = CGPoint(x: 0.5, y: 0.5)
    @Published var confidence: Double = 0.0

    /// Callback fired after each frame is processed
    var onPositionUpdate: ((CGPoint, Double, DetectionTiming) -> Void)?

    // MARK: - Bright Ball Thresholds (HSV, for yellow-green tennis ball)
    var minHue: Double = 35.0     // degrees (yellow end)
    var maxHue: Double = 85.0     // degrees (green end)
    var minSaturation: Double = 0.25
    var minValue: Double = 0.20

    // RGB pre-filter for bright ball (fast rejection)
    private let preFilterMinG: UInt8 = 80
    private let preFilterMinRG: UInt8 = 100

    // MARK: - Dark Puck Thresholds (brightness-based)
    /// Maximum brightness (0-255) for a pixel to count as "dark"
    var maxDarkBrightness: UInt8 = 80
    /// Dark puck candidates should be notably darker than their local surroundings.
    private let minDarkPuckContrast: Double = 35.0
    /// Reject tiny specks and overly large dark blobs.
    private let minDarkPuckMatchCount = 12
    private let maxDarkPuckMatchCount = 140
    /// Dark puck should look like a compact, roughly round cluster.
    private let minDarkPuckFillRatio: Double = 0.45
    private let maxDarkPuckAspectRatio: Double = 1.8

    // MARK: - ROI Tracking

    private let gridCols = 16
    private let gridRows = 16
    /// Last detected grid cell (for ROI search on next frame)
    private var lastGX: Int = -1
    private var lastGY: Int = -1
    /// ROI search radius in grid cells
    private let roiRadius = 2
    /// Consecutive ROI misses before falling back to full scan
    private var roiMissCount = 0
    private let roiMissThreshold = 3

    // MARK: - 1-Euro Filter Smoothing
    // Adapts smoothing dynamically: low cutoff when still (smooth), high when fast (responsive).
    // Reference: Casiez et al., "1€ Filter", CHI 2012.

    private let oneEuroMinCutoff: Double = 1.0    // Hz — cutoff when stationary (lower = smoother)
    private let oneEuroBeta: Double = 0.007       // speed coefficient (higher = less lag when moving)
    private let oneEuroDCutoff: Double = 1.0      // Hz — cutoff for derivative estimation
    private var filterX: OneEuroFilterState?
    private var filterY: OneEuroFilterState?

    // MARK: - Processing

    private let processingQueue = DispatchQueue(label: "com.pucktracker.balldetector", qos: .userInitiated)
    private var isProcessing = false

    /// Downsample factor — skip pixels for speed. 4 = check every 4th pixel.
    private let sampleStep = 4

    // MARK: - Frame Processing

    func processFrame(_ frame: CapturedFrame) {
        guard !isProcessing else { return }
        isProcessing = true

        processingQueue.async { [weak self] in
            defer { self?.isProcessing = false }
            self?.detectBall(in: frame)
        }
    }

    // MARK: - Pixel Matching

    /// Routes to the appropriate matcher based on current detection mode.
    @inline(__always)
    private func isMatchingPixel(r: UInt8, g: UInt8, b: UInt8) -> Bool {
        switch mode {
        case .brightBall: return isBrightBallPixel(r: r, g: g, b: b)
        case .darkPuck:   return isDarkPuckPixel(r: r, g: g, b: b)
        }
    }

    @inline(__always)
    private func pixelBrightness(r: UInt8, g: UInt8, b: UInt8) -> UInt8 {
        max(r, g, b)
    }

    /// Bright ball: HSV color match for yellow-green tennis ball.
    @inline(__always)
    private func isBrightBallPixel(r: UInt8, g: UInt8, b: UInt8) -> Bool {
        guard g >= preFilterMinG && max(r, g) >= preFilterMinRG else { return false }

        let ri = Int(r), gi = Int(g), bi = Int(b)
        let maxC = max(ri, gi, bi)
        let delta = maxC - min(ri, gi, bi)

        guard maxC >= Int(minValue * 255.0) else { return false }
        guard maxC > 0 else { return false }
        guard delta * 100 >= maxC * Int(minSaturation * 100.0) else { return false }
        guard delta > 0 else { return false }

        let hue: Double
        if maxC == ri {
            let sector = Double(gi - bi) / Double(delta)
            hue = 60.0 * (sector < 0 ? sector + 6.0 : sector)
        } else if maxC == gi {
            hue = 60.0 * (Double(bi - ri) / Double(delta) + 2.0)
        } else {
            return false
        }

        return hue >= minHue && hue <= maxHue
    }

    /// Dark puck: matches pixels darker than `maxDarkBrightness` on any channel.
    @inline(__always)
    private func isDarkPuckPixel(r: UInt8, g: UInt8, b: UInt8) -> Bool {
        return pixelBrightness(r: r, g: g, b: b) <= maxDarkBrightness
    }

    // MARK: - Detection

    private func detectBall(in frame: CapturedFrame) {
        let pixelBuffer = frame.pixelBuffer
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            publishBallLost(frame)
            return
        }

        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
        let pixelFormat = CVPixelBufferGetPixelFormatType(pixelBuffer)

        let isBGRA = pixelFormat == kCVPixelFormatType_32BGRA
        let buffer = baseAddress.assumingMemoryBound(to: UInt8.self)
        let step = sampleStep

        let cellW = width / gridCols
        let cellH = height / gridRows

        // ---- ROI Search: try near last known position first ----
        var bestGX = 0, bestGY = 0, bestCount = 0
        var totalMatched = 0
        var usedROI = false

        if lastGX >= 0 && lastGY >= 0 && roiMissCount < roiMissThreshold {
            let roiResult = scanGridRegion(
                buffer: buffer, isBGRA: isBGRA,
                width: width, height: height, bytesPerRow: bytesPerRow, step: step,
                cellW: cellW, cellH: cellH,
                gxMin: max(0, lastGX - roiRadius), gxMax: min(gridCols - 1, lastGX + roiRadius),
                gyMin: max(0, lastGY - roiRadius), gyMax: min(gridRows - 1, lastGY + roiRadius)
            )

            if roiResult.bestCount >= 3 {
                bestGX = roiResult.bestGX
                bestGY = roiResult.bestGY
                bestCount = roiResult.bestCount
                totalMatched = roiResult.totalMatched
                usedROI = true
                roiMissCount = 0
            } else {
                roiMissCount += 1
            }
        }

        // ---- Full Scan: fallback when ROI fails or no prior position ----
        if !usedROI {
            let fullResult = scanGridRegion(
                buffer: buffer, isBGRA: isBGRA,
                width: width, height: height, bytesPerRow: bytesPerRow, step: step,
                cellW: cellW, cellH: cellH,
                gxMin: 0, gxMax: gridCols - 1,
                gyMin: 0, gyMax: gridRows - 1
            )

            bestGX = fullResult.bestGX
            bestGY = fullResult.bestGY
            bestCount = fullResult.bestCount
            totalMatched = fullResult.totalMatched
        }

        guard bestCount >= 3 else {
            publishBallLost(frame)
            return
        }

        // Store for next frame's ROI
        lastGX = bestGX
        lastGY = bestGY

        // ---- Pass 2: Compute centroid in 3×3 neighborhood around best cell ----
        let regionMinX = max(0, (bestGX - 1) * cellW)
        let regionMaxX = min(width, (bestGX + 2) * cellW)
        let regionMinY = max(0, (bestGY - 1) * cellH)
        let regionMaxY = min(height, (bestGY + 2) * cellH)

        var sumX: Double = 0
        var sumY: Double = 0
        var matchCount: Double = 0
        var sampledCount = 0
        var totalBrightness: Double = 0
        var matchedBrightness: Double = 0
        var matchedMinX = Int.max
        var matchedMaxX = Int.min
        var matchedMinY = Int.max
        var matchedMaxY = Int.min

        for y in stride(from: regionMinY, to: regionMaxY, by: step) {
            let rowOffset = y * bytesPerRow
            for x in stride(from: regionMinX, to: regionMaxX, by: step) {
                let pixelOffset = rowOffset + x * 4

                let r: UInt8, g: UInt8, b: UInt8
                if isBGRA {
                    b = buffer[pixelOffset]
                    g = buffer[pixelOffset + 1]
                    r = buffer[pixelOffset + 2]
                } else {
                    r = buffer[pixelOffset]
                    g = buffer[pixelOffset + 1]
                    b = buffer[pixelOffset + 2]
                }

                let brightness = Double(pixelBrightness(r: r, g: g, b: b))
                sampledCount += 1
                totalBrightness += brightness

                if isMatchingPixel(r: r, g: g, b: b) {
                    sumX += Double(x)
                    sumY += Double(y)
                    matchCount += 1
                    matchedBrightness += brightness
                    matchedMinX = min(matchedMinX, x)
                    matchedMaxX = max(matchedMaxX, x)
                    matchedMinY = min(matchedMinY, y)
                    matchedMaxY = max(matchedMaxY, y)
                }
            }
        }

        guard matchCount >= 5 else {
            publishBallLost(frame)
            return
        }

        if mode == .darkPuck {
            let darkPuckValid = isValidDarkPuckCandidate(
                matchCount: Int(matchCount),
                sampledCount: sampledCount,
                matchedBrightness: matchedBrightness,
                totalBrightness: totalBrightness,
                matchedMinX: matchedMinX,
                matchedMaxX: matchedMaxX,
                matchedMinY: matchedMinY,
                matchedMaxY: matchedMaxY,
                step: step
            )
            guard darkPuckValid else {
                publishBallLost(frame)
                return
            }
        }

        // Centroid, normalized to 0.0 - 1.0 in the camera buffer's native portrait space
        let centroidX = CGFloat(sumX / matchCount) / CGFloat(width)
        let centroidY = CGFloat(sumY / matchCount) / CGFloat(height)

        // Rotate portrait-buffer coordinates into the app's LandscapeRight screen space
        let screenX = centroidY
        let screenY = 1.0 - centroidX

        // Confidence stays on the same scale whether we used ROI or full-frame search.
        let totalSampled = Double((width / step) * (height / step))
        let matchRatio = Double(totalMatched) / totalSampled
        let rawConfidence = min(matchRatio / 0.005, 1.0)

        // 1-Euro filter smoothing (adapts: smooth when still, responsive when fast)
        let timestamp = ProcessInfo.processInfo.systemUptime
        let smoothed: CGPoint
        if filterX != nil, filterY != nil {
            let sx = filterX!.filter(value: Double(screenX), timestamp: timestamp,
                                     minCutoff: oneEuroMinCutoff, beta: oneEuroBeta, dCutoff: oneEuroDCutoff)
            let sy = filterY!.filter(value: Double(screenY), timestamp: timestamp,
                                     minCutoff: oneEuroMinCutoff, beta: oneEuroBeta, dCutoff: oneEuroDCutoff)
            smoothed = CGPoint(x: sx, y: sy)
        } else {
            filterX = OneEuroFilterState(value: Double(screenX), timestamp: timestamp)
            filterY = OneEuroFilterState(value: Double(screenY), timestamp: timestamp)
            smoothed = CGPoint(x: screenX, y: screenY)
        }

        let clampedConfidence = min(max(rawConfidence, 0.0), 1.0)
        let detectionTiming = DetectionTiming(
            frameId: frame.frameId,
            captureTs: frame.captureTs,
            detectDoneTs: currentUptimeMs()
        )

        DispatchQueue.main.async { [weak self] in
            self?.smoothedPosition = smoothed
            self?.confidence = clampedConfidence
            self?.onPositionUpdate?(smoothed, clampedConfidence, detectionTiming)
        }
    }

    // MARK: - Grid Region Scan

    private struct GridScanResult {
        let bestGX: Int
        let bestGY: Int
        let bestCount: Int
        let totalMatched: Int
    }

    /// Scan a rectangular region of grid cells and return the densest cell.
    private func scanGridRegion(
        buffer: UnsafePointer<UInt8>, isBGRA: Bool,
        width: Int, height: Int, bytesPerRow: Int, step: Int,
        cellW: Int, cellH: Int,
        gxMin: Int, gxMax: Int, gyMin: Int, gyMax: Int
    ) -> GridScanResult {
        let pixelMinX = gxMin * cellW
        let pixelMaxX = min(width, (gxMax + 1) * cellW)
        let pixelMinY = gyMin * cellH
        let pixelMaxY = min(height, (gyMax + 1) * cellH)

        // Count matches per grid cell
        let regionCols = gxMax - gxMin + 1
        let regionRows = gyMax - gyMin + 1
        var cellCounts = [Int](repeating: 0, count: regionCols * regionRows)
        var total = 0

        for y in stride(from: pixelMinY, to: pixelMaxY, by: step) {
            let rowOffset = y * bytesPerRow
            let gy = min((y - pixelMinY) * regionRows / max(pixelMaxY - pixelMinY, 1), regionRows - 1)

            for x in stride(from: pixelMinX, to: pixelMaxX, by: step) {
                let pixelOffset = rowOffset + x * 4

                let r: UInt8, g: UInt8, b: UInt8
                if isBGRA {
                    b = buffer[pixelOffset]
                    g = buffer[pixelOffset + 1]
                    r = buffer[pixelOffset + 2]
                } else {
                    r = buffer[pixelOffset]
                    g = buffer[pixelOffset + 1]
                    b = buffer[pixelOffset + 2]
                }

                if isMatchingPixel(r: r, g: g, b: b) {
                    let gx = min((x - pixelMinX) * regionCols / max(pixelMaxX - pixelMinX, 1), regionCols - 1)
                    cellCounts[gy * regionCols + gx] += 1
                    total += 1
                }
            }
        }

        // Find densest cell
        var bestIdx = 0, bestCount = 0
        for i in 0..<cellCounts.count {
            if cellCounts[i] > bestCount {
                bestCount = cellCounts[i]
                bestIdx = i
            }
        }

        let localGY = bestIdx / regionCols
        let localGX = bestIdx % regionCols

        return GridScanResult(
            bestGX: gxMin + localGX,
            bestGY: gyMin + localGY,
            bestCount: bestCount,
            totalMatched: total
        )
    }

    private func isValidDarkPuckCandidate(
        matchCount: Int,
        sampledCount: Int,
        matchedBrightness: Double,
        totalBrightness: Double,
        matchedMinX: Int,
        matchedMaxX: Int,
        matchedMinY: Int,
        matchedMaxY: Int,
        step: Int
    ) -> Bool {
        guard matchCount >= minDarkPuckMatchCount && matchCount <= maxDarkPuckMatchCount else {
            return false
        }
        guard sampledCount > matchCount else { return false }
        guard matchedMinX <= matchedMaxX && matchedMinY <= matchedMaxY else { return false }

        let bboxWidthSamples = ((matchedMaxX - matchedMinX) / step) + 1
        let bboxHeightSamples = ((matchedMaxY - matchedMinY) / step) + 1
        guard bboxWidthSamples > 0 && bboxHeightSamples > 0 else { return false }

        let bboxSampleCount = bboxWidthSamples * bboxHeightSamples
        let fillRatio = Double(matchCount) / Double(max(bboxSampleCount, 1))
        let aspectRatio = Double(max(bboxWidthSamples, bboxHeightSamples))
            / Double(max(min(bboxWidthSamples, bboxHeightSamples), 1))

        let matchedAverageBrightness = matchedBrightness / Double(matchCount)
        let surroundingBrightness = totalBrightness - matchedBrightness
        let surroundingAverageBrightness = surroundingBrightness / Double(sampledCount - matchCount)
        let contrast = surroundingAverageBrightness - matchedAverageBrightness

        return fillRatio >= minDarkPuckFillRatio
            && aspectRatio <= maxDarkPuckAspectRatio
            && contrast >= minDarkPuckContrast
    }

    // MARK: - Ball Lost

    private func publishBallLost(_ frame: CapturedFrame) {
        resetSmoothing()
        let detectionTiming = DetectionTiming(
            frameId: frame.frameId,
            captureTs: frame.captureTs,
            detectDoneTs: currentUptimeMs()
        )

        DispatchQueue.main.async { [weak self] in
            self?.confidence = 0.0
            self?.onPositionUpdate?(
                self?.smoothedPosition ?? CGPoint(x: 0.5, y: 0.5),
                0.0,
                detectionTiming
            )
        }
    }

    func resetSmoothing() {
        filterX = nil
        filterY = nil
        lastGX = -1
        lastGY = -1
        roiMissCount = 0
    }
}

// MARK: - 1-Euro Filter

/// Minimal single-axis 1-Euro filter state.
/// Implements the algorithm from Casiez et al., CHI 2012.
struct OneEuroFilterState {
    private var prevValue: Double
    private var prevDerivative: Double
    private var prevTimestamp: Double

    init(value: Double, timestamp: Double) {
        self.prevValue = value
        self.prevDerivative = 0.0
        self.prevTimestamp = timestamp
    }

    mutating func filter(value: Double, timestamp: Double,
                         minCutoff: Double, beta: Double, dCutoff: Double) -> Double {
        let dt = max(timestamp - prevTimestamp, 1e-6)
        prevTimestamp = timestamp

        // Estimate derivative with low-pass filter
        let rawDerivative = (value - prevValue) / dt
        let alphaD = smoothingFactor(dt: dt, cutoff: dCutoff)
        let derivative = alphaD * rawDerivative + (1 - alphaD) * prevDerivative
        prevDerivative = derivative

        // Adaptive cutoff: increase cutoff (= less smoothing) when speed is high
        let cutoff = minCutoff + beta * abs(derivative)
        let alpha = smoothingFactor(dt: dt, cutoff: cutoff)

        let filtered = alpha * value + (1 - alpha) * prevValue
        prevValue = filtered
        return filtered
    }

    private func smoothingFactor(dt: Double, cutoff: Double) -> Double {
        let tau = 1.0 / (2.0 * .pi * cutoff)
        return 1.0 / (1.0 + tau / dt)
    }
}
