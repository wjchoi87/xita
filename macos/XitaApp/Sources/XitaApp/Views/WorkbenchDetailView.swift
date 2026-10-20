import SwiftUI
import AppKit
import XitaCoreBridge

/// XITA macOS — WorkbenchDetailView (ContentView 분해, 2026-09 구조 리팩토링)
/// 동작 변경 없음: 상위 선언 단위 이동만. 원본 이력은 git log ContentView.swift.


// ---- Workbench detail --------------------------------------------------------

struct WorkbenchDetailView: View {
    @EnvironmentObject private var model: AppModel
    let item: AppModel.Item
    @State private var bodyText = ""
    @State private var promoteProductName = ""
    @State private var promoteAsChange = true
    @State private var selectedProductId = ""
    @State private var confirmDelete = false
    @State private var loaded = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(item.name).font(.title2.bold())
                    Text(XUI.termStatus(item.status)).font(.caption.monospaced())
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(.quaternary, in: Capsule())
                    Spacer()
                    Button("삭제", role: .destructive) { confirmDelete = true }
                        .buttonStyle(.borderless).tint(.red)
                }
                XCard("내용 (markdown)") {
                    TextEditor(text: $bodyText)
                        .font(.body.monospaced())
                        .frame(minHeight: 160)
                        .overlay(RoundedRectangle(cornerRadius: 5).stroke(.separator))
                    HStack {
                        Button("저장") {
                            do { try model.saveBody(type: "workbench", id: item.id, body: bodyText) }
                            catch { model.lastError = "저장하지 못했습니다 — \(error)" }
                        }
                        if let err = model.lastError {
                            Text(err).font(.caption).foregroundStyle(.red)
                        }
                    }
                    .padding(.top, 4)
                }
                if item.isStale && item.status != "promoted" {
                    XCard("오래된 항목 — 정리 제안 (자동 삭제 없음)") {
                        HStack {
                            Text("30일 이상 변경이 없습니다").font(.caption).foregroundStyle(.secondary)
                            Spacer()
                            Button("유지") {
                                do { try model.keepWorkbench(id: item.id) }
                                catch { model.lastError = "유지로 표시하지 못했습니다 — \(error)" }
                            }.controlSize(.small)
                            Button("아카이브") {
                                do { try model.archiveWorkbench(id: item.id) }
                                catch { model.lastError = "보관하지 못했습니다 — \(error)" }
                            }
                                .controlSize(.small).tint(.orange)
                        }
                    }
                }
                XCard("승격 (Promote) — Human Trigger") {
                    VStack(alignment: .leading, spacing: 8) {
                        Picker("", selection: $promoteAsChange) {
                            Text("기존 제품의 할 일로").tag(true)
                            Text("새 제품으로").tag(false)
                        }.labelsHidden().pickerStyle(.radioGroup).horizontalRadioGroupLayout()
                        if promoteAsChange {
                            Picker("제품", selection: $selectedProductId) {
                                Text("선택…").tag("")
                                ForEach(model.products) { p in
                                    Text(p.name).tag(p.id)
                                }
                            }
                            HStack {
                                TextField("할 일 제목 (비우면 항목 이름)", text: $promoteProductName)
                                    .textFieldStyle(.roundedBorder)
                                Button("승격") { promote() }
                                    .disabled(selectedProductId.isEmpty)
                            }
                        } else {
                            HStack {
                                TextField("새 제품 이름", text: $promoteProductName)
                                    .textFieldStyle(.roundedBorder)
                                Button("승격") {
                                    let n = promoteProductName.trimmingCharacters(in: .whitespaces)
                                    guard !n.isEmpty else { return }
                                    do { try model.promoteWorkbench(id: item.id, toNewProductNamed: n) }
                                    catch { model.lastError = "승격하지 못했습니다 — \(error)" }
                                    promoteProductName = ""
                                }
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .confirmationDialog("메모 '\(item.name)' 삭제?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("삭제", role: .destructive) {
                do { try model.deleteWorkbench(id: item.id) }
                catch { model.lastError = "삭제하지 못했습니다 — \(error)" }
            }
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            bodyText = model.doc(type: "workbench", id: item.id)?.body ?? ""
            selectedProductId = model.products.first?.id ?? ""
        }
    }

    private func promote() {
        let t = promoteProductName.trimmingCharacters(in: .whitespaces)
        do { try model.promoteWorkbench(id: item.id, toProductChange: selectedProductId, title: t.isEmpty ? item.name : t) }
        catch { model.lastError = "승격하지 못했습니다 — \(error)" }
        promoteProductName = ""
    }
}
