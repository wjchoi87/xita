import SwiftUI
import AppKit

@main
struct XitaApp: App {
    @StateObject private var model = AppModel(workspaceDir: defaultWorkspace())

    init() {
        // `swift run` 바이너리는 .app bundle 이 아니라 accessory policy 로 떠서
        // 창이 뒤로 가고 Dock/⌘Tab 에도 안 잡힌다. regular policy + activate 로
        // 정상 foreground 앱처럼 동작시킨다 (사용자 보고: 빌드/실행 오류 없으나 창 미노출).
        //
        // 주의: NSApp(전역 IUO)은 App.init 시점에 아직 nil 이라 force-unwrap 크래시 →
        // NSApplication.shared 를 직접 참조해 생성을 보장한다.
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        DispatchQueue.main.async {
            app.activate(ignoringOtherApps: true)
        }
    }

    var body: some Scene {
        WindowGroup("XITA", id: "main") {
            ContentView()
                .environmentObject(model)
                .frame(minWidth: 720, minHeight: 480)
                .task {
                    do {
                        try model.bootstrapDemo()
                        try model.refresh()
                    } catch {
                        model.lastError = "\(error)"
                    }
                }
        }
        .defaultPosition(.center)
        .windowResizability(.contentMinSize)
    }
}

/// 캐노니컬 workspace 기본 경로 (env XITA_WS 우선).
func defaultWorkspace() -> String {
    if let env = ProcessInfo.processInfo.environment["XITA_WS"], !env.isEmpty {
        return env
    }
    return (NSHomeDirectory() as NSString).appendingPathComponent(".xita-workspace")
}