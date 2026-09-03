import SwiftUI
import AppKit
import XitaCoreBridge

/// XITA macOS — SettingsView (ContentView 분해, 2026-09 구조 리팩토링)
/// 동작 변경 없음: 상위 선언 단위 이동만. 원본 이력은 git log ContentView.swift.


/// §67 Settings — Integrations / Ship Templates / Agent Configuration
struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @State private var agentCmd = ""
    @State private var defaultDest = ""
    @State private var tplType = "MOBILE_SAAS"
    @State private var saved = false
    @State private var ghStatus = "확인"
    @State private var linStatus = "확인"
    @State private var figStatus = "확인"

    private var env: [String: String] { ProcessInfo.processInfo.environment }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Settings").font(.title2.bold())

                XCard("Integrations — 환경변수 기반 (토큰은 디스크에 저장하지 않음)") {
                    VStack(alignment: .leading, spacing: 6) {
                        integrationRow("GitHub", configured: env["XITA_GITHUB_TOKEN"] != nil, status: ghStatus) {
                            Task { await testGitHub() }
                        }
                        integrationRow("Linear", configured: env["XITA_LINEAR_TOKEN"] != nil, status: linStatus) {
                            Task { await testGraphQL() }
                        }
                        integrationRow("Figma", configured: env["XITA_FIGMA_TOKEN"] != nil, status: figStatus) {
                            Task { await testFigma() }
                        }
                    }
                }

                XCard("출시 기준 템플릿") {
                    VStack(alignment: .leading, spacing: 6) {
                        Picker("", selection: $tplType) {
                            Text("MOBILE_SAAS").tag("MOBILE_SAAS")
                            Text("WEB_SAAS").tag("WEB_SAAS")
                        }.pickerStyle(.segmented).labelsHidden().frame(maxWidth: 300)
                        ForEach(XitaBridge.shipTemplatePreview(type: tplType), id: \.kind) { g in
                            VStack(alignment: .leading, spacing: 1) {
                                Text(g.kind).font(.caption.bold())
                                Text(g.items.joined(separator: " · ")).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                XCard("Agent Configuration") {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("실행 커맨드").font(.caption).frame(width: 90, alignment: .leading)
                            TextField("예: opencode (env XITA_AGENT_CMD 우선)", text: $agentCmd).textFieldStyle(.roundedBorder)
                        }
                        HStack {
                            Text("기본 배포 경로").font(.caption).frame(width: 90, alignment: .leading)
                            TextField("~/Desktop", text: $defaultDest).textFieldStyle(.roundedBorder)
                        }
                        HStack {
                            Button("저장") {
                                model.saveSettings(.init(agentCmd: agentCmd, defaultDest: defaultDest))
                                saved = true
                                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { saved = false }
                            }
                            if saved { Text("저장됨").foregroundStyle(.green).font(.caption) }
                            Text("실행은 명시한 때만 — 보내기만 하면 에이전트는 시작하지 않습니다")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding()
        }
        .onAppear {
            agentCmd = model.loadSettings().agentCmd
            defaultDest = model.loadSettings().defaultDest
        }
    }

    private func integrationRow(_ name: String, configured: Bool, status: String, onTest: @escaping () -> Void) -> some View {
        HStack {
            Image(systemName: configured ? "checkmark.seal.fill" : "questionmark.seal")
                .foregroundStyle(configured ? .green : .secondary)
            Text(name)
            Text(configured ? "설정됨" : "미설정").font(.caption2).foregroundStyle(.secondary)
            Spacer()
            Text(status).font(.caption2).foregroundStyle(.secondary)
            Button("연결 테스트", action: onTest).disabled(!configured).controlSize(.small)
        }
    }

    private func testGitHub() async {
        await probe("https://api.github.com/rate_limit", header: ("Authorization", "Bearer " + (env["XITA_GITHUB_TOKEN"] ?? "public"))) { code in
            ghStatus = code == 200 ? "OK" : "HTTP \(code)"
        }
    }

    private func testFigma() async {
        await probe("https://api.figma.com/v1/me", header: ("X-Figma-Token", env["XITA_FIGMA_TOKEN"] ?? "")) { code in
            figStatus = code == 200 ? "OK" : "HTTP \(code)"
        }
    }

    private func probe(_ url: String, header: (String, String), _ done: @escaping (Int) -> Void) async {
        guard let u = URL(string: url) else { return }
        var req = URLRequest(url: u)
        req.setValue(header.1, forHTTPHeaderField: header.0)
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
            await MainActor.run { done(code) }
        } catch {
            await MainActor.run { done(-1) }
        }
    }

    private func testGraphQL() async {
        guard let token = env["XITA_LINEAR_TOKEN"] else { return }
        var req = URLRequest(url: URL(string: "https://api.linear.app/graphql")!)
        req.httpMethod = "POST"
        req.setValue(token, forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = Data("{\"query\":\"query{viewer{id}}\"}".utf8)
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
            await MainActor.run { linStatus = code == 200 ? "OK" : "HTTP \(code)" }
        } catch {
            await MainActor.run { linStatus = "실패" }
        }
    }
}
