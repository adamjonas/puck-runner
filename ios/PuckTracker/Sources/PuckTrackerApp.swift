import SwiftUI

@main
struct PuckTrackerApp: App {
    @StateObject private var cameraManager = CameraManager()
    @StateObject private var ballDetector = BallDetector()
    @StateObject private var positionClassifier = PositionClassifier()
    @StateObject private var webSocketManager = WebSocketManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(cameraManager)
                .environmentObject(ballDetector)
                .environmentObject(positionClassifier)
                .environmentObject(webSocketManager)
                .onAppear {
                    // Lock to landscape, keep screen awake while app is open
                    UIApplication.shared.isIdleTimerDisabled = true
                }
                .onDisappear {
                    UIApplication.shared.isIdleTimerDisabled = false
                }
        }
    }
}
