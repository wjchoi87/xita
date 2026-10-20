import SwiftUI
import AppKit
import XitaCoreBridge

/// XITA macOS — HomeView (ContentView 분해, 2026-09 구조 리팩토링)
/// 동작 변경 없음: 상위 선언 단위 이동만. 원본 이력은 git log ContentView.swift.


// ---- Portfolio summary -------------------------------------------------------

/* Home 1면 구성 (2026-10 내비게이션 감사 + 포트폴리오 흡수)
 * 변경 전 정책: 지표 → 메모 캡처 → (있을 때만) 결정할 일 → Ask 순. 캡처 실패는 try? 로 조용히 묻힘, 성공 표시 없음.
 * 변경 후 정책: 지표 → 내가 결정할 일(항상 노출, 행 클릭 시 해당 화면 이동) → 프로젝트 그리드(보관 제외, 카드 클릭 = 제품 선택)
 *   → 메모 캡처(실패는 model.lastError 로 표시, 성공 시 잠깐 확인 문구) → Ask → 나머지. 헤더에 '웹 콘솔 열기'.
 * 변경 이유: 사람이 먼저 봐야 할 것(결정)을 맨 위로, 여러 앱 저장소를 한눈에, 사용자 입력 실패를 숨기지 않기 위함
 * 영향 범위: Home 화면 표시/입력 피드백만. capture 데이터 규칙 무변경 */
struct PortfolioSummaryView: View {
    @EnvironmentObject private var model: AppModel
    let review: [AppModel.Item]
    @Binding var selection: AppModel.Selection?
    @State private var captureTitle = ""
    @State private var captureBody = ""
    @State private var captureSaved = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline) {
                    Text("내 제품판").font(.title2.bold())
                    Spacer()
                    Button {
                        openWebConsole()
                    } label: {
                        Label("웹 콘솔 열기", systemImage: "safari")
                    }
                    .help(PortfolioLogic.webConsoleURL()?.absoluteString ?? "")
                }
                Text(model.summaryText()).font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 16) {
                    stat("\(model.products.count)개", "제품")
                    stat("\(model.items.filter { $0.type == "changes" }.count)개", "할 일")
                    stat("\(model.needsYouCount)건", "결정 대기", accent: model.needsYouCount > 0)
                    stat("\(model.items.filter { $0.type == "capabilities" }.count)개", "기능")
                }
                Divider()
                decisionsSection
                Divider()
                projectsGrid
                Divider()
                Text("메모 남기기 — 먼저 담고 나중에 옮깁니다").font(.headline)
                TextField("제목", text: $captureTitle)
                    .textFieldStyle(.roundedBorder)
                TextEditor(text: $captureBody)
                    .font(.body.monospaced())
                    .frame(minHeight: 90)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(.separator))
                HStack {
                    Button("저장") { saveCapture() }
                        .disabled(captureTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                    if captureSaved {
                        Label("메모함에 담았습니다", systemImage: "checkmark.circle.fill")
                            .font(.caption).foregroundStyle(.green)
                    }
                    if let err = model.lastError {
                        Text(err).font(.caption).foregroundStyle(.red)
                    }
                }
                askCard
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
                portfolioInsights
                Spacer()
            }
            .padding()
            .onAppear(perform: consumePaletteQuestion)
        }
    }

    private func saveCapture() {
        let t = captureTitle.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        do {
            try model.capture(title: t, content: captureBody)
        } catch {
            model.lastError = "메모를 담지 못했습니다 — \(error)"
            return
        }
        // applyMulti 는 REJECTED/CONFLICT 를 throw 대신 lastError 로 알린다 → 그때는 입력을 지우지 않는다
        guard model.lastError == nil else { return }
        captureTitle = ""
        captureBody = ""
        captureSaved = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { captureSaved = false }
    }

    private func openWebConsole() {
        guard let url = PortfolioLogic.webConsoleURL() else {
            model.lastError = "웹 콘솔 주소가 올바르지 않습니다 — XITA_HOST 를 확인하세요"
            return
        }
        if !NSWorkspace.shared.open(url) {
            model.lastError = "웹 콘솔을 열지 못했습니다 — \(url.absoluteString)"
        }
    }

    // ---- 내가 결정할 일 (Home 1순위) -------------------------------------------

    @ViewBuilder private var decisionsSection: some View {
        Text("내가 결정할 일").font(.headline)
        if review.isEmpty && model.waitingDispatches.isEmpty && model.conflicts.isEmpty && model.pendingProposals.isEmpty {
            Label("없음 — 괜찮습니다", systemImage: "checkmark.circle")
                .font(.callout).foregroundStyle(.secondary)
        }
        /* 에이전트 대기 줄 — "방치하면 조용히 죽는 병목"을 Home 1면에 (VK Needs Attention) */
        ForEach(model.waitingDispatches) { d in
            decisionRow("에이전트가 \(XUI.termStatus(d.status)) — \(d.name)", icon: "bubble.exclamation",
                        color: d.status.uppercased() == "AWAITING_INPUT" ? .red : .orange, to: .agents)
        }
        ForEach(model.conflicts) { c in
            decisionRow("어긋남: \(model.item("changes", c.targetId)?.name ?? c.targetId)", icon: "exclamationmark.triangle.fill",
                        color: .orange, to: .change(c.targetId))
        }
        ForEach(model.pendingProposals) { pr in
            decisionRow("제안: \(pr.name)", icon: "arrow.triangle.turn.up.right.diamond",
                        color: .purple, to: .change(pr.id.hasSuffix("-") ? String(pr.id.dropLast()) : pr.id))
        }
        ForEach(review) { c in
            decisionRow("\(c.name) — \(XUI.termStatus(c.status))", icon: "eye", color: .orange, to: .change(c.id))
        }
    }

    private func decisionRow(_ text: String, icon: String, color: Color, to target: AppModel.Selection) -> some View {
        Button { selection = target } label: {
            HStack {
                Label(text, systemImage: icon).foregroundStyle(color)
                Spacer()
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // ---- 프로젝트 그리드 (포트폴리오) -------------------------------------------

    @ViewBuilder private var projectsGrid: some View {
        let cards = model.portfolioCards.filter { !$0.archived }
        HStack {
            Text("프로젝트").font(.headline)
            Text("\(cards.count)").font(.caption.monospaced()).foregroundStyle(.secondary)
        }
        if cards.isEmpty {
            Text("아직 제품이 없습니다 — 사이드바에서 새 제품을 만드세요").font(.caption).foregroundStyle(.secondary)
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: XUI.gap)], alignment: .leading, spacing: XUI.gap) {
                ForEach(cards) { c in
                    Button { selection = .product(c.id) } label: { ProjectCardView(card: c) }
                        .buttonStyle(.plain)
                }
            }
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

/// Home 프로젝트 그리드 카드 1장 — 값은 PortfolioCard 캐시만 읽는다(FFI 없음)
struct ProjectCardView: View {
    let card: PortfolioCard

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(card.name).font(.headline).lineLimit(1)
                if !card.codename.isEmpty && card.codename != card.name {
                    Text(card.codename).font(.caption2.monospaced()).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
                if !card.version.isEmpty {
                    Text(card.version).font(.caption2.monospaced()).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 6) {
                if !card.productionStatus.isEmpty { XUI.statusChip(card.productionStatus) }
                if !card.monetization.isEmpty {
                    Text(card.monetization).font(.caption2)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(.quaternary.opacity(0.5), in: Capsule())
                }
            }
            HStack(spacing: 10) {
                Label("할 일 \(card.activeChanges)", systemImage: "checklist")
                if let code = card.storeProduction {
                    Label("스토어 \(code)", systemImage: "bag")
                        .help("Play production 트랙 versionCode")
                }
                Spacer(minLength: 0)
                if card.repoPath.isEmpty {
                    Image(systemName: "folder.badge.questionmark").foregroundStyle(.tertiary)
                        .help("연결된 저장소 경로 없음")
                } else {
                    Image(systemName: card.repoExists ? "folder.fill" : "folder.badge.minus")
                        .foregroundStyle(card.repoExists ? Color.accentColor : XUI.caution)
                        .help(card.repoExists ? card.repoPath : "경로를 찾을 수 없음: \(card.repoPath)")
                }
            }
            .font(.caption).foregroundStyle(.secondary)
        }
        .padding(XUI.pad)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: XUI.cardRadius))
        .overlay(RoundedRectangle(cornerRadius: XUI.cardRadius).strokeBorder(.separator.opacity(0.5)))
        .contentShape(RoundedRectangle(cornerRadius: XUI.cardRadius))
    }
}
