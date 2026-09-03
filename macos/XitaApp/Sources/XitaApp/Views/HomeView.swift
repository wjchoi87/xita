import SwiftUI
import AppKit
import XitaCoreBridge

/// XITA macOS — HomeView (ContentView 분해, 2026-09 구조 리팩토링)
/// 동작 변경 없음: 상위 선언 단위 이동만. 원본 이력은 git log ContentView.swift.


// ---- Portfolio summary -------------------------------------------------------

struct PortfolioSummaryView: View {
    @EnvironmentObject private var model: AppModel
    let review: [AppModel.Item]
    @State private var captureTitle = ""
    @State private var captureBody = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("내 제품판").font(.title2.bold())
                Text(model.summaryText()).font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 16) {
                    stat("\(model.products.count)개", "제품")
                    stat("\(model.items.filter { $0.type == "changes" }.count)개", "할 일")
                    stat("\(model.needsYouCount)건", "결정 대기", accent: model.needsYouCount > 0)
                    stat("\(model.items.filter { $0.type == "capabilities" }.count)개", "기능")
                }
                Divider()
                Text("메모 남기기 — 먼저 담고 나중에 옮깁니다").font(.headline)
                TextField("제목", text: $captureTitle)
                    .textFieldStyle(.roundedBorder)
                TextEditor(text: $captureBody)
                    .font(.body.monospaced())
                    .frame(minHeight: 90)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(.separator))
                HStack {
                    Button("저장") {
                        let t = captureTitle.trimmingCharacters(in: .whitespaces)
                        guard !t.isEmpty else { return }
                        try? model.capture(title: t, content: captureBody)
                        captureTitle = ""
                        captureBody = ""
                    }
                    .disabled(captureTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                    if let err = model.lastError {
                        Text(err).font(.caption).foregroundStyle(.red)
                    }
                }
                if !review.isEmpty || !model.waitingDispatches.isEmpty || !model.conflicts.isEmpty {
                    Divider()
                    Text("내가 결정할 일").font(.headline)
                    /* 에이전트 대기 줄 — "방치하면 조용히 죽는 병목"을 Home 1면에 (VK Needs Attention) */
                    ForEach(model.waitingDispatches) { d in
                        Label("에이전트가 \(XUI.termStatus(d.status)) — \(d.name)", systemImage: "bubble.exclamation")
                            .foregroundStyle(d.status.uppercased() == "AWAITING_INPUT" ? Color.red : Color.orange)
                    }
                    ForEach(model.conflicts) { c in
                        Label("어긋남: \(model.item("changes", c.targetId)?.name ?? c.targetId)", systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                    }
                    ForEach(review) { c in
                        Label("\(c.name) — \(XUI.termStatus(c.status))", systemImage: "eye")
                            .foregroundStyle(.orange)
                    }
                }
                if !model.rejectedProposals.isEmpty {
                    Divider()
                    Text("거절한 제안 — 기각도 이력입니다").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                    ForEach(model.rejectedProposals.prefix(5)) { pr in
                        HStack {
                            Image(systemName: "xmark.circle").foregroundStyle(.secondary)
                            Text(pr.name).strikethrough().foregroundStyle(.secondary)
                            Spacer()
                            Text(XUI.termStatus(pr.status)).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
                askCard
                portfolioInsights
                Spacer()
            }
            .padding()
            .onAppear(perform: consumePaletteQuestion)
        }
    }

    /// ⌘K 팔레트가 건넨 질문을 Ask 카드가 소비 (미소비 결함 수정 — 팔레트→Ask 폐루프 완성)
    private func consumePaletteQuestion() {
        let q = model.paletteQuestion.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        model.paletteQuestion = ""
        askQuery = q
        runAsk()
    }

    @State private var askQuery = ""
    @State private var askAnswer: AppModel.AskResult?

    private var askCard: some View {
        XCard("물어보세요 — 왜? 막힌 건? 지금 몇 개?") {
            VStack(alignment: .leading, spacing: 6) {
                TextField("예: 왜 Paddle을 사용하나 / 추천 관련 변경 / 현재 버전", text: $askQuery)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { runAsk() }
                HStack {
                    Button("검색") { runAsk() }
                    Text("엔터도 됩니다").font(.caption2).foregroundStyle(.secondary)
                }
                if let r = askAnswer {
                    Text("[\(r.intent)]").font(.caption2.monospaced()).foregroundStyle(.blue)
                    Text(r.answer).textSelection(.enabled)
                    if !r.sources.isEmpty {
                        Text("근거").font(.caption2.bold()).foregroundStyle(.secondary)
                        ForEach(r.sources, id: \.id) { src in
                            Text("· \(src.kind): \(src.title) (\(src.id))").font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private func runAsk() {
        let q = askQuery.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        askAnswer = model.askLocal(q)
    }

    /// §67 Home: Closest to Ship + 제품 운영 개요 (health/version/next release)
    private var portfolioInsights: some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            Text("Closest to Ship").font(.headline)
            let act = model.items.filter { $0.type == "changes" && ["SHIP_READY", "REVIEW", "BUILD"].contains($0.status) }
            if act.isEmpty { Text("완주 직전 항목 없음").font(.caption).foregroundStyle(.secondary) }
            ForEach(act.prefix(5)) { c in
                HStack {
                    Text(c.name)
                    Spacer()
                    Text(XUI.termStatus(c.status)).font(.caption2.monospaced())
                    if let pn = model.item("products", c.product)?.name {
                        Text(pn).font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            Divider()
            Text("제품 개요").font(.headline)
            ForEach(model.products) { p in
                let h = model.health(p.id)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(p.name).fontWeight(.medium)
                        Text(h.productionStatus).font(.caption2.monospaced()).foregroundStyle(.secondary)
                        if h.version != "-" { Text(h.version).font(.caption2).foregroundStyle(.secondary) }
                        Spacer()
                        if let nr = h.nextRelease {
                            Text("next: \(nr)").font(.caption2).foregroundStyle(.blue)
                        }
                    }
                    HStack(spacing: 10) {
                        mini("개발", h.development)
                        mini("운영", h.operations)
                        mini("배포", h.distribution)
                        mini("출시 준비", h.launchReadiness >= 80 ? "충분" : h.launchReadiness >= 40 ? "부족함" : "막힘", "\(h.launchReadiness)%")
                        mini("컨텍스트", (h.contextDrift + h.pendingProposals) == 0 ? "healthy" : "warning")
                    }
                }
                .padding(6)
                .background(.background.secondary, in: RoundedRectangle(cornerRadius: 6))
            }
        }
    }

    private func mini(_ label: String, _ state: String, _ value: String? = nil) -> some View {
        HStack(spacing: 3) {
            Circle().fill(state == "healthy" ? Color.green : state == "warning" ? .orange : .red).frame(width: 6, height: 6)
            Text(value ?? "\(label)").font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func stat(_ value: String, _ label: String, accent: Bool = false) -> some View {
        VStack {
            Text(value).font(.title.bold()).foregroundStyle(accent ? .orange : .primary)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(10)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 8))
    }
}
