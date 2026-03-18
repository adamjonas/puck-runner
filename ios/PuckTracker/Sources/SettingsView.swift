import SwiftUI

/// Settings view for entering the Mac's IP address for WebSocket connection.
struct SettingsView: View {
    @EnvironmentObject var webSocketManager: WebSocketManager
    @Environment(\.dismiss) private var dismiss

    @AppStorage("serverHost") private var serverHost: String = "192.168.1.100"
    @State private var editingHost: String = ""
    @State private var showResetConfirmation = false

    var body: some View {
        NavigationView {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Server IP Address")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        TextField("e.g. 192.168.1.100", text: $editingHost)
                            .keyboardType(.decimalPad)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .font(.body.monospaced())
                            .padding(8)
                            .background(Color(.systemGray6))
                            .cornerRadius(8)
                    }

                    HStack {
                        Text("Port")
                            .foregroundColor(.secondary)
                        Spacer()
                        Text("5173")
                            .font(.body.monospaced())
                            .foregroundColor(.secondary)
                    }

                    HStack {
                        Text("Endpoint")
                            .foregroundColor(.secondary)
                        Spacer()
                        Text("/ws/tracker")
                            .font(.body.monospaced())
                            .foregroundColor(.secondary)
                    }
                } header: {
                    Text("WebSocket Connection")
                } footer: {
                    Text("Enter the IP address of the Mac running the game. The port and endpoint are fixed.")
                }

                Section {
                    HStack {
                        Text("Status")
                        Spacer()
                        HStack(spacing: 6) {
                            Circle()
                                .fill(statusColor)
                                .frame(width: 8, height: 8)
                            Text(webSocketManager.connectionState.rawValue.capitalized)
                                .foregroundColor(.secondary)
                        }
                    }

                    Button("Reconnect Now") {
                        saveAndReconnect()
                    }
                    .disabled(editingHost.isEmpty)
                } header: {
                    Text("Connection Status")
                }

                Section {
                    Button("Reset Calibration to Defaults") {
                        showResetConfirmation = true
                    }
                    .foregroundColor(.red)
                } header: {
                    Text("Calibration")
                } footer: {
                    Text("Resets lane boundaries and deke thresholds to default values from the protocol.")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        saveAndReconnect()
                        dismiss()
                    }
                }
            }
            .onAppear {
                editingHost = serverHost
            }
            .alert("Reset Calibration?", isPresented: $showResetConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Reset", role: .destructive) {
                    resetCalibration()
                }
            } message: {
                Text("This will reset all lane boundaries and deke thresholds to their default values.")
            }
        }
    }

    private var statusColor: Color {
        switch webSocketManager.connectionState {
        case .connected: return .green
        case .connecting: return .yellow
        case .disconnected: return .red
        }
    }

    private func saveAndReconnect() {
        let trimmed = editingHost.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        serverHost = trimmed
        webSocketManager.updateHost(trimmed)
    }

    private func resetCalibration() {
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: "cal_leftBoundary")
        defaults.removeObject(forKey: "cal_deadZoneLeft")
        defaults.removeObject(forKey: "cal_deadZoneRight")
        defaults.removeObject(forKey: "cal_rightBoundary")
        defaults.removeObject(forKey: "cal_dekeEnter")
        defaults.removeObject(forKey: "cal_dekeExit")
    }
}
