import SwiftUI
import AppKit
import XitaCoreBridge

/// XITA macOS — CommandPalette (ContentView 분해, 2026-09 구조 리팩토링)
/// 동작 변경 없음: 상위 선언 단위 이동만. 원본 이력은 git log ContentView.swift.


/// ⌘K 커맨드 팔레트 — 대상 직점프 + Ask 즉시 실행 (Linear/CrystalSpec/Raycast 공통 패턴 이식)
struct CommandPalette: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selection: AppModel.Selection?
    let close: () -> Void
    @State private var q = ""
    @State private var cursor = 0
    @FocusState private var focused: Bool

    private var results: [AppModel.Item] {
        let needle = q.trimmingCharacters(in: .whitespaces).lowercased()
        guard !needle.isEmpty else { return [] }
        return model.items.filter {
            $0.name.lowercased().contains(needle) || $0.id.lowercased().contains(needle)
        }.prefix(12).map { $0 }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("할 일 · 제품 · 메모 검색, 또는 질문 입력…", text: $q)
                    .textFieldStyle(.plain).font(.title3).focused($focused)
                    .onSubmit(submit)
                    .onChange(of: q) { _, _ in cursor = 0 }
                if looksLikeQuestion {
                    Button("Ask 실행 ↵") { askNow() }.buttonStyle(.borderedProminent).controlSize(.small)
                }
                Button("esc") { close() }.buttonStyle(.borderless).font(.caption)
            }
            .padding(12)
            /* ↑↓ 로 목록 이동 — 키보드만으로 도달 (Type Travel) */
            .background(
                Button("") { moveCursor(-1) }.keyboardShortcut(.upArrow, modifiers: []).opacity(0)
            )
            .background(
                Button("") { moveCursor(1) }.keyboardShortcut(.downArrow, modifiers: []).opacity(0)
            )
            Divider()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 1) {
                    if q.isEmpty {
                        paletteHint("⌘K — 이름으로 도약. 질문은 Enter 한 번으로.")
                    }
                    ForEach(Array(results.enumerated()), id: \.1.id) { idx, it in
                        Button { jump(it) } label: {
                            HStack {
                                Text(XUI.term(singular(it.type))).font(.caption2.monospaced())
                                    .padding(.horizontal, 5).padding(.vertical, 1)
                                    .background(.quaternary.opacity(0.5), in: Capsule())
                                Text(it.name)
                                Spacer()
                                Text(XUI.termStatus(it.status)).font(.caption2).foregroundStyle(.secondary)
                            }
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(idx == cursor ? Color.accentColor.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 6))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    if looksLikeQuestion {
                        Button { askNow() } label: {
                            HStack { Image(systemName: "sparkles"); Text("Ask: \"\(q)\"").italic() }
                                .padding(.horizontal, 12).padding(.vertical, 7)
                        }.buttonStyle(.plain)
                    }
                    if !q.trimmingCharacters(in: .whitespaces).isEmpty && !looksLikeQuestion {
                        Button { memoNow() } label: {
                            HStack { Image(systemName: "square.and.pencil"); Text("메모 담기: \"\(q)\"").italic() }
                                .padding(.horizontal, 12).padding(.vertical, 7)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
        .frame(width: 520)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .shadow(radius: 24)
        .padding(.horizontal, 40)
        .onAppear { focused = true }
    }

    private var looksLikeQuestion: Bool {
        q.contains("?") || q.hasPrefix("왜") || q.contains("뭐") || q.count > 12
    }

    private func moveCursor(_ delta: Int) {
        guard !results.isEmpty else { return }
        cursor = min(max(cursor + delta, 0), results.count - 1)
    }

    private func submit() {
        if !results.isEmpty { jump(results[min(cursor, results.count - 1)]) }
        else if looksLikeQuestion { askNow() }
    }

    private func singular(_ type: String) -> String {
        type.hasSuffix("s") ? String(type.dropLast()) : type
    }

    private func paletteHint(_ t: String) -> some View {
        Text(t).font(.caption).foregroundStyle(.tertiary).padding(12)
    }

    private func jump(_ it: AppModel.Item) {
        switch it.type {
        case "products": selection = .product(it.id)
        case "changes": selection = .change(it.id)
        case "workbench": selection = .workbench(it.id)
        default:
            if let pid = model.docFields(type: singular(it.type), id: it.id)["product"], !pid.isEmpty {
                selection = .product(pid)
            }
        }
        close()
    }

    private func askNow() {
        model.paletteQuestion = q
        selection = .product(model.products.first?.id ?? "")
        close()
    }

    /// 캡처 무결정 원칙(Drafts): 제품 귀속은 승인 때 — 메모함(workbench)으로 즉시 담는다
    private func memoNow() {
        let t = q.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        do { try model.capture(title: t, content: "") }
        catch { model.lastError = "메모를 담지 못했습니다 — \(error)" }
        close()
    }
}
