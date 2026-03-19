import CoreImage
import UIKit
import Combine

/// Detects a yellow-green tennis ball by scanning pixel colors directly.
/// Finds yellow-green pixels (high R, high G, low B), computes their centroid.
/// Simple, fast, reliable for a bright ball on a dark surface.
final class BallDetector: ObservableObject {

    // MARK: - Published State

    @Published var smoothedPosition: CGPoint = CGPoint(x: 0.5, y: 0.5)
    @Published var confidence: Double = 0.0

    /// Callback fired after each frame is processed
    var onPositionUpdate: ((CGPoint, Double) -> Void)?

    // MARK: - Color Thresholds (tunable for yellow-green tennis ball)
    // Tennis ball in RGB: R ~160-255, G ~180-255, B ~0-100
    var minR: UInt8 = 120
    var minG: UInt8 = 140
    var maxB: UInt8 = 120
    /// Minimum green-minus-blue gap to reject gray/white pixels
    var minGBGap: Int = 40

    // MARK: - EMA Smoothing

    private let emaAlpha: CGFloat = 0.5
    private var emaPosition: CGPoint?

    // MARK: - Processing

    private let processingQueue = DispatchQueue(label: "com.pucktracker.balldetector", qos: .userInitiated)
    private var isProcessing = false

    /// Downsample factor — skip pixels for speed. 4 = check every 4th pixel.
    private let sampleStep = 4

    // MARK: - Frame Processing

    func processFrame(_ pixelBuffer: CVPixelBuffer) {
        guard !isProcessing else { return }
        isProcessing = true

        processingQueue.async { [weak self] in
            defer { self?.isProcessing = false }
            self?.detectBall(in: pixelBuffer)
        }
    }

    private func detectBall(in pixelBuffer: CVPixelBuffer) {
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else {
            publishBallLost()
            return
        }

        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
        let pixelFormat = CVPixelBufferGetPixelFormatType(pixelBuffer)

        // BGRA format (most common from AVFoundation)
        let isBGRA = pixelFormat == kCVPixelFormatType_32BGRA

        let buffer = baseAddress.assumingMemoryBound(to: UInt8.self)
        let step = sampleStep

        // Pass 1: Count matching pixels in a coarse grid to find the densest cell
        let gridCols = 16
        let gridRows = 16
        var grid = [[Int]](repeating: [Int](repeating: 0, count: gridCols), count: gridRows)

        for y in stride(from: 0, to: height, by: step) {
            let rowOffset = y * bytesPerRow
            let gy = min(y * gridRows / height, gridRows - 1)
            for x in stride(from: 0, to: width, by: step) {
                let pixelOffset = rowOffset + x * 4

                let r: UInt8
                let g: UInt8
                let b: UInt8

                if isBGRA {
                    b = buffer[pixelOffset]
                    g = buffer[pixelOffset + 1]
                    r = buffer[pixelOffset + 2]
                } else {
                    r = buffer[pixelOffset]
                    g = buffer[pixelOffset + 1]
                    b = buffer[pixelOffset + 2]
                }

                if r >= minR && g >= minG && b <= maxB && (Int(g) - Int(b)) >= minGBGap {
                    let gx = min(x * gridCols / width, gridCols - 1)
                    grid[gy][gx] += 1
                }
            }
        }

        // Find the grid cell with the most matches
        var bestGX = 0, bestGY = 0, bestCount = 0
        for gy in 0..<gridRows {
            for gx in 0..<gridCols {
                if grid[gy][gx] > bestCount {
                    bestCount = grid[gy][gx]
                    bestGX = gx
                    bestGY = gy
                }
            }
        }

        guard bestCount >= 3 else {
            publishBallLost()
            return
        }

        // Pass 2: Compute centroid using only pixels near the best cell (+/- 1 cell)
        let cellW = width / gridCols
        let cellH = height / gridRows
        let minX = max(0, (bestGX - 1) * cellW)
        let maxX = min(width, (bestGX + 2) * cellW)
        let minY = max(0, (bestGY - 1) * cellH)
        let maxY = min(height, (bestGY + 2) * cellH)

        var sumX: Double = 0
        var sumY: Double = 0
        var matchCount: Double = 0

        for y in stride(from: minY, to: maxY, by: step) {
            let rowOffset = y * bytesPerRow
            for x in stride(from: minX, to: maxX, by: step) {
                let pixelOffset = rowOffset + x * 4

                let r: UInt8
                let g: UInt8
                let b: UInt8

                if isBGRA {
                    b = buffer[pixelOffset]
                    g = buffer[pixelOffset + 1]
                    r = buffer[pixelOffset + 2]
                } else {
                    r = buffer[pixelOffset]
                    g = buffer[pixelOffset + 1]
                    b = buffer[pixelOffset + 2]
                }

                if r >= minR && g >= minG && b <= maxB && (Int(g) - Int(b)) >= minGBGap {
                    sumX += Double(x)
                    sumY += Double(y)
                    matchCount += 1
                }
            }
        }

        guard matchCount >= 5 else {
            publishBallLost()
            return
        }

        // Centroid, normalized to 0.0 - 1.0 in the camera buffer's native portrait space.
        let centroidX = CGFloat(sumX / matchCount) / CGFloat(width)
        let centroidY = CGFloat(sumY / matchCount) / CGFloat(height)

        // Rotate portrait-buffer coordinates into the app's LandscapeRight screen space.
        let screenX = centroidY
        let screenY = 1.0 - centroidX

        // Total matches across entire grid for confidence
        let totalGrid = grid.flatMap { $0 }.reduce(0, +)
        let totalSampled = Double((width / step) * (height / step))
        let matchRatio = Double(totalGrid) / totalSampled

        // Confidence based on how many pixels matched (more = more confident).
        // Use a gentler ramp so smaller, farther balls still clear the classifier's 0.1 floor.
        let rawConfidence = min(matchRatio / 0.005, 1.0) // 0.5% coverage = full confidence

        // EMA smoothing
        let rawPoint = CGPoint(x: screenX, y: screenY)
        let smoothed: CGPoint
        if let prev = emaPosition {
            smoothed = CGPoint(
                x: emaAlpha * rawPoint.x + (1 - emaAlpha) * prev.x,
                y: emaAlpha * rawPoint.y + (1 - emaAlpha) * prev.y
            )
        } else {
            smoothed = rawPoint
        }
        emaPosition = smoothed

        let clampedConfidence = min(max(rawConfidence, 0.0), 1.0)

        DispatchQueue.main.async { [weak self] in
            self?.smoothedPosition = smoothed
            self?.confidence = clampedConfidence
            self?.onPositionUpdate?(smoothed, clampedConfidence)
        }
    }

    // MARK: - Ball Lost

    private func publishBallLost() {
        emaPosition = nil

        DispatchQueue.main.async { [weak self] in
            self?.confidence = 0.0
            self?.onPositionUpdate?(self?.smoothedPosition ?? CGPoint(x: 0.5, y: 0.5), 0.0)
        }
    }

    func resetSmoothing() {
        emaPosition = nil
    }
}
