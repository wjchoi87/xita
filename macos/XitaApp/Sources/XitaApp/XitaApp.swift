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
                .xitaAppearance()
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

        /* 표준 macOS 설정 창 (⌘,) — 일반 탭: 화면 테마 + 기존 설정(SettingsView 재사용).
         * 사이드바 '설정' 항목도 같은 SettingsView 를 그대로 보여준다. */
        Settings {
            TabView {
                SettingsView()
                    .tabItem { Label("일반", systemImage: "gearshape") }
            }
            .environmentObject(model)
            .frame(width: 600, height: 560)
            .xitaAppearance()
        }

        /* MenuBarExtra — 네이티브 capability(Q13): 앱을 열지 않고도 "나를 기다리는 것"이 보이고
         * 메모를 즉시 담는다(Drafts cold-open 정신). Needs You 0 이면 조용히 회색 아이콘. */
        MenuBarExtra {
            MenuBarContent(model: model)
                .xitaAppearance()
        } label: {
            Image(systemName: model.needsYouCount > 0 ? "bell.badge.fill" : "bell")
        }
        .menuBarExtraStyle(.window)
    }
}

/// 메뉴바 콘텐츠 — 결정 대기 요약 + 3초 캡처 + 앱 열기
struct MenuBarContent: View {
    @Environment(\.openWindow) private var openWindow
    @ObservedObject var model: AppModel
    @State private var memo = ""
    @State private var saved = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("내가 결정할 일").font(.headline)
                Spacer()
                Text("\(model.needsYouCount)건")
                    .font(.callout.monospaced().bold())
                    .foregroundStyle(model.needsYouCount > 0 ? Color.orange : Color.secondary)
            }
            if model.waitingDispatches.isEmpty && model.conflicts.isEmpty && model.pendingProposals.isEmpty {
                Text("없음 — 괜찮습니다").font(.caption).foregroundStyle(.secondary)
            }
            ForEach(model.waitingDispatches.prefix(3)) { d in
                Label(d.name, systemImage: "bubble.exclamation")
                    .font(.caption)
                    .foregroundStyle(d.status.uppercased() == "AWAITING_INPUT" ? Color.red : Color.orange)
            }
            ForEach(model.pendingProposals.prefix(3)) { pr in
                Label(pr.name, systemImage: "arrow.triangle.turn.up.right.diamond")
                    .font(.caption)
                    .foregroundStyle(.purple)
            }
            ForEach(model.conflicts.prefix(3)) { c in
                Label(model.item("changes", c.targetId)?.name ?? c.targetId, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            Divider()
            TextField("메모 한 줄 — ⏰ Enter 로 담기", text: $memo)
                .textFieldStyle(.roundedBorder)
                .onSubmit {
                    let t = memo.trimmingCharacters(in: .whitespaces)
                    guard !t.isEmpty else { return }
                    do {
                        try model.capture(title: t, content: "")
                        memo = ""
                        saved = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { saved = false }
                    } catch {
                        model.lastError = "메모를 담지 못했습니다 — \(error)"
                    }
                }
            if saved { Text("담았습니다 — 호스트 정본에 기록됩니다").font(.caption2).foregroundStyle(.green) }
            if let err = model.lastError {
                Text(err).font(.caption2).foregroundStyle(.red).lineLimit(2)
            }

            Divider()
            Button("XITA 열기") {
                NSApp.activate(ignoringOtherApps: true)
                openWindow(id: "main")
            }
        }
        .padding(12)
        .frame(width: 280)
        .onAppear { try? model.refresh() }
    }
}

/// 캐노니컬 workspace 기본 경로 (env XITA_WS 우선).
func defaultWorkspace() -> String {
    if let env = ProcessInfo.processInfo.environment["XITA_WS"], !env.isEmpty {
        return env
    }
    return (NSHomeDirectory() as NSString).appendingPathComponent(".xita-workspace")
}