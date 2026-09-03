import SwiftUI
import AppKit
import XitaCoreBridge

/// XITA macOS — NewProductSheet (ContentView 분해, 2026-09 구조 리팩토링)
/// 동작 변경 없음: 상위 선언 단위 이동만. 원본 이력은 git log ContentView.swift.


/// 4문장 온보딩 — Leantime "Start Something New" 벤치마크 (research wave1 G-O3)
/// 변경 전 정책: 이름 한 줄로 Product 생성 → 3주 뒤엔 이게 왜 존재하는지 아무도 모름 (jira화)
/// 변경 후 정책: 이름+템플릿 외에 "무엇을 성취하나 / 이걸 이루면 세상은 어떻게 다른가"를
///   current_goal / direction(세계 변화 서술)으로 강제 유도(비우면 생성 버튼 비활성 대신
///   "나중에"로 명시적 회피 가능 — 개인 도구이므로 강요는 1회까지)
/// 영향 범위: products frontmatter(current_goal,direction — profile 에디터와 동일 필자), Ask/Health가 لاحق 활용
struct NewProductSheet: View {
    @EnvironmentObject private var model: AppModel
    @Binding var prefill: String
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var goal = ""
    @State private var worldDelta = ""
    @State private var template = ""
    @State private var skipWhy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("새 제품 — 시작하기").font(.title3.bold())
            TextField("이름", text: $name)
                .textFieldStyle(.roundedBorder)
                .onAppear { name = prefill; prefill = "" }
            if !skipWhy {
                VStack(alignment: .leading, spacing: 4) {
                    Text("이 제품으로 무엇을 성취하나? (goal)").font(.caption).foregroundStyle(.secondary)
                    TextField("예: 글쓰기 중단 없이 초안을 끝까지", text: $goal)
                        .textFieldStyle(.roundedBorder)
                    Text("성취하면 사용자의 세상은 어떻게 달라지나? (direction)").font(.caption).foregroundStyle(.secondary)
                    TextField("예: 아이디어→출고 리드타임 하루→1시간", text: $worldDelta)
                        .textFieldStyle(.roundedBorder)
                    Button("나중에 채울게") { skipWhy = true }
                        .buttonStyle(.plain).font(.caption2).foregroundStyle(.secondary)
                }
                .padding(8)
                .background(.yellow.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
            }
            Picker("템플릿", selection: $template) {
                Text("없음").tag("")
                Text("MOBILE_SAAS").tag("MOBILE_SAAS")
                Text("WEB_SAAS").tag("WEB_SAAS")
            }
            .pickerStyle(.segmented)
            HStack {
                Spacer()
                Button("취소") { dismiss() }
                Button("만들기") {
                    let n = name.trimmingCharacters(in: .whitespaces)
                    guard n.count >= 2 else { return }
                    do {
                        try model.createProduct(name: n, productType: template.isEmpty ? nil : template)
                        let why: [AppModel.KV] = [
                            AppModel.KV("current_goal", goal),
                            AppModel.KV("direction", worldDelta),
                        ].filter { !$0.value.isEmpty }
                        if !why.isEmpty { try model.updateProduct(id: slug(n), fields: why) }
                        dismiss()
                    } catch {
                        model.lastError = "제품을 만들지 못했습니다 — 같은 이름의 제품이 이미 있을 수 있습니다"
                    }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(name.trimmingCharacters(in: .whitespaces).count < 2)
            }
        }
        .padding(16)
        .frame(width: 420)
    }
}
