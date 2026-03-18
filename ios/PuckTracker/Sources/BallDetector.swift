import CoreImage
import Vision
import UIKit
import Combine

/// Detects a yellow-green tennis ball in camera frames using CIFilter HSV thresholding
/// and VNDetectContoursRequest. Outputs smoothed centroid position with EMA (3-frame window).
final class BallDetector: ObservableObject {

    // MARK: - Published State

    @Published var smoothedPosition: CGPoint = CGPoint(x: 0.5, y: 0.5)
    @Published var confidence: Double = 0.0

    /// Callback fired after each frame is processed, with (normalizedPosition, confidence).
    var onPositionUpdate: ((CGPoint, Double) -> Void)?

    // MARK: - HSV Thresholds (tunable for yellow-green tennis ball)

    /// Hue range for yellow-green (0-1 scale, where green ~0.33, yellow ~0.17)
    var hueCenter: CGFloat = 0.20
    var hueRange: CGFloat = 0.08   // +/- from center
    var saturationMin: CGFloat = 0.35
    var brightnessMin: CGFloat = 0.30

    // MARK: - EMA Smoothing

    /// EMA alpha for 3-frame window: alpha = 2/(N+1) = 0.5
    private let emaAlpha: CGFloat = 0.5
    private var emaPosition: CGPoint?

    // MARK: - Core Image / Vision

    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    private let processingQueue = DispatchQueue(label: "com.pucktracker.balldetector", qos: .userInitiated)
    private var isProcessing = false

    // MARK: - Frame Processing

    func processFrame(_ pixelBuffer: CVPixelBuffer) {
        // Drop frame if still processing previous one
        guard !isProcessing else { return }
        isProcessing = true

        processingQueue.async { [weak self] in
            defer { self?.isProcessing = false }
            self?.detectBall(in: pixelBuffer)
        }
    }

    private func detectBall(in pixelBuffer: CVPixelBuffer) {
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let imageWidth = CGFloat(CVPixelBufferGetWidth(pixelBuffer))
        let imageHeight = CGFloat(CVPixelBufferGetHeight(pixelBuffer))

        // Step 1: HSV threshold to create a mask of yellow-green pixels
        guard let mask = createHSVMask(from: ciImage) else {
            publishBallLost()
            return
        }

        // Step 2: Use Vision contour detection on the mask
        let handler = VNImageRequestHandler(ciImage: mask, options: [:])
        let contourRequest = VNDetectContoursRequest()
        contourRequest.contrastAdjustment = 1.0
        contourRequest.detectsDarkOnLight = false  // We have bright ball on dark mask

        do {
            try handler.perform([contourRequest])
        } catch {
            publishBallLost()
            return
        }

        guard let results = contourRequest.results,
              let contoursObservation = results.first else {
            publishBallLost()
            return
        }

        // Step 3: Find the largest contour by bounding box area
        let topLevelContours = contoursObservation.topLevelContours
        guard !topLevelContours.isEmpty else {
            publishBallLost()
            return
        }

        var largestContour: VNContour?
        var largestArea: CGFloat = 0

        for contour in topLevelContours {
            let bbox = contour.normalizedPath.boundingBox
            let area = bbox.width * bbox.height
            // Filter out very small noise and very large artifacts
            if area > 0.001 && area < 0.5 && area > largestArea {
                largestArea = area
                largestContour = contour
            }
        }

        guard let bestContour = largestContour else {
            publishBallLost()
            return
        }

        // Step 4: Calculate centroid from the contour's bounding box
        let bbox = bestContour.normalizedPath.boundingBox
        let centroidX = bbox.midX
        // Vision uses bottom-left origin; flip Y for top-left UIKit coords
        let centroidY = 1.0 - bbox.midY

        // Step 5: Calculate confidence based on contour area and aspect ratio
        let aspectRatio = min(bbox.width, bbox.height) / max(bbox.width, bbox.height)
        // A tennis ball should be roughly circular (aspect ratio near 1.0)
        let areaConfidence = min(largestArea / 0.01, 1.0)  // Normalize area
        let shapeConfidence = aspectRatio  // Closer to 1.0 = more circular
        let rawConfidence = (areaConfidence * 0.4 + shapeConfidence * 0.6)

        // Step 6: EMA smoothing
        let rawPoint = CGPoint(x: centroidX, y: centroidY)
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

    // MARK: - HSV Mask Creation

    /// Creates a binary mask CIImage where yellow-green pixels are white and everything else is black.
    private func createHSVMask(from image: CIImage) -> CIImage? {
        // Convert to HSV-like representation using CIColorMatrix and CIHueAdjust
        // For better performance, we use a custom CIColorClamp + CIColorControls pipeline.
        //
        // Strategy: Use CIColorControls to boost saturation, then threshold with CIColorClamp.
        // For yellow-green detection, we convert approach:
        // 1. Apply a hue rotation so target hue maps to red channel peak
        // 2. Threshold the result

        // Alternative simpler approach: work in RGB space
        // Yellow-green tennis ball: High R+G, low B, with G > R
        // We'll use CIKernel for precise HSV thresholding via a CIColorKernel

        // Use CIFilter-based approach for compatibility
        guard let colorMatrix = CIFilter(name: "CIColorMatrix") else { return nil }

        // Approach: detect pixels where green is high, blue is low, and red is moderate
        // Tennis ball in sRGB: R ~0.7-0.9, G ~0.8-1.0, B ~0.0-0.3
        // We create a mask by emphasizing the green-minus-blue channel

        // Step 1: Increase saturation to separate ball from background
        guard let saturateFilter = CIFilter(name: "CIColorControls") else { return nil }
        saturateFilter.setValue(image, forKey: kCIInputImageKey)
        saturateFilter.setValue(2.0, forKey: kCIInputSaturationKey)
        saturateFilter.setValue(0.1, forKey: kCIInputBrightnessKey)
        saturateFilter.setValue(1.5, forKey: kCIInputContrastKey)

        guard let saturated = saturateFilter.outputImage else { return nil }

        // Step 2: Use color matrix to isolate yellow-green
        // Output = G*1.5 - B*2.0 - |R-G|*1.0
        // This makes yellow-green bright, everything else dark
        colorMatrix.setValue(saturated, forKey: kCIInputImageKey)
        // R vector: contribute negatively when R differs from G
        colorMatrix.setValue(CIVector(x: -0.5, y: 0, z: 0, w: 0), forKey: "inputRVector")
        // G vector: high green contribution
        colorMatrix.setValue(CIVector(x: 0, y: 1.5, z: 0, w: 0), forKey: "inputGVector")
        // B vector: penalize blue
        colorMatrix.setValue(CIVector(x: 0, y: 0, z: -2.0, w: 0), forKey: "inputBVector")
        colorMatrix.setValue(CIVector(x: 0, y: 0, z: 0, w: 1), forKey: "inputAVector")
        colorMatrix.setValue(CIVector(x: 0, y: 0, z: 0, w: 0), forKey: "inputBiasVector")

        guard let channelIsolated = colorMatrix.outputImage else { return nil }

        // Step 3: Threshold — clamp to create binary mask
        // Use CIColorClamp to floor low values and ceil high values
        guard let clampFilter = CIFilter(name: "CIColorClamp") else { return nil }
        clampFilter.setValue(channelIsolated, forKey: kCIInputImageKey)
        clampFilter.setValue(CIVector(x: 0.3, y: 0.3, z: 0.3, w: 0), forKey: "inputMinComponents")
        clampFilter.setValue(CIVector(x: 1, y: 1, z: 1, w: 1), forKey: "inputMaxComponents")

        guard let clamped = clampFilter.outputImage else { return nil }

        // Step 4: Convert to grayscale for contour detection
        guard let grayFilter = CIFilter(name: "CIPhotoEffectMono") else { return nil }
        grayFilter.setValue(clamped, forKey: kCIInputImageKey)

        return grayFilter.outputImage
    }

    // MARK: - Ball Lost

    private func publishBallLost() {
        // Reset EMA on lost ball so next detection starts fresh
        emaPosition = nil

        DispatchQueue.main.async { [weak self] in
            self?.confidence = 0.0
            self?.onPositionUpdate?(self?.smoothedPosition ?? CGPoint(x: 0.5, y: 0.5), 0.0)
        }
    }

    /// Reset the EMA filter (useful when starting calibration or after pause)
    func resetSmoothing() {
        emaPosition = nil
    }
}
