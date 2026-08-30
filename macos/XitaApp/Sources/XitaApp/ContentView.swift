import SwiftUI
import XitaCoreBridge
import AppKit

/// XITA macOS — selection 기반 Human Control Plane (v0.5 §4, v0.3 §0.4).
struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    @State private var selection: AppModel.Selection?
    @State private var newProductName = ""
    @State private var newProductTemplate = ""
    @State private var showNewProduct = false

    private func createProductFromHome() {
        let n = newProductName.trimmingCharacters(in: .whitespaces)
        guard !n.isEmpty else { return }
        try? model.createProduct(name: n, productType: newProductTemplate.isEmpty ? nil : newProductTemplate)
        newProductName = ""
    }

    @State private var showPalette = false

    var body: some View {
        NavigationSplitView {
            sidebar
                .navigationTitle("XITA")
        } detail: {
            detail
        }
        /* ⌘K 커맨드 팔레트 — Linear(Cmd+K 직점프)/CrystalSpec(객체타입 결과)/Raycast(command-driven) 3사 공통 1순위 패턴.
         * 브리핑 §11 'Low navigation cost'의 정답: 내비 부채(Prodeology 30유령페이지) 없이 모든 객체로 곧장.
         * 변경 전 정책: 사이드바 스크롤 대상 탐색만 가능
         * 변경 후 정책: ⌘K → 할 일/제품/메모/문서/결정 전 타입 횡단 검색 + 액션(새 할 일/새 메모) + Ask 실행
         * 영향 범위: 화면 레이어만. 데이터 무변경. Esc 닫기, Enter 첫 결과 이동 */
        .overlay(alignment: .top) {
            if showPalette {
                CommandPalette(selection: $selection, close: { showPalette = false })
                    .padding(.top, 80)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .background(
            Button("") { showPalette.toggle() }
                .keyboardShortcut("k", modifiers: .command)
                .opacity(0)
        )
        .animation(.snappy(duration: 0.18), value: showPalette)
    }

    // ---- Sidebar -----------------------------------------------------------

    private var reviewChanges: [AppModel.Item] {
        model.items.filter { $0.type == "changes" && ["REVIEW", "SHIP_READY"].contains($0.status) }
    }

    private var activeChanges: [AppModel.Item] {
        model.items.filter { $0.type == "changes" && ["IDEA", "PLAN", "BUILD"].contains($0.status) }
    }

    private var sidebar: some View {
        List(selection: $selection) {
            Section("Needs You (\(model.needsYouCount))") {
                if model.conflicts.isEmpty && reviewChanges.isEmpty && model.waitingDispatches.isEmpty {
                    Label("없음 — 괜찮습니다", systemImage: "checkmark.circle")
                        .foregroundStyle(.secondary).tag(Optional<AppModel.Selection>.none)
                }
                /* dispatch 대기 = "에이전트가 나를 기다린다" — 방치하면 조용히 죽는 병목 (VK Needs Attention) */
                ForEach(model.waitingDispatches) { d in
                    Label("에이전트 \(d.status.uppercased()): \(d.name)", systemImage: "bubble.exclamation")
                        .foregroundStyle(d.status.uppercased() == "AWAITING_INPUT" ? Color.red : Color.orange)
                        .tag(Optional<AppModel.Selection>.none)
                }
                ForEach(model.conflicts) { c in
                    Label("충돌: \(c.targetId)", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .tag(AppModel.Selection.change(c.targetId))
                }
                ForEach(model.pendingProposals) { pr in
                    Label("Proposal: \(pr.name)", systemImage: "arrow.triangle.turn.up.right.diamond")
                        .foregroundStyle(.purple)
                        .tag(AppModel.Selection.change(pr.id.hasSuffix("-") ? String(pr.id.dropLast()) : pr.id))
                }
                ForEach(reviewChanges) { c in
                    Label(c.name, systemImage: "eye")
                        .tag(AppModel.Selection.change(c.id))
                }
            }
            Section("Products") {
                ForEach(model.products) { p in
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(p.name)
                            Text("\(model.changes(for: p.id).count) changes")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(p.status).font(.caption2.monospaced()).foregroundStyle(.secondary)
                    }
                    .tag(AppModel.Selection.product(p.id))
                }
                HStack {
                    TextField("+ 새 Product", text: $newProductName)
                        .textFieldStyle(.plain)
                        .onSubmit { showNewProduct = true }
                    Button("만들기") { showNewProduct = true }
                        .buttonStyle(.borderless).font(.caption)
                        .help("4문장 온보딩 — 이름을 짓기 전에 이유를 적는다 (Leantime/Shape Up)")
                }
                .sheet(isPresented: $showNewProduct) {
                    NewProductSheet(prefill: $newProductName)
                }
            }
            Section("Changes") {
                ForEach(activeChanges) { c in
                    VStack(alignment: .leading, spacing: 1) {
                        Text(c.name)
                        Text("\(c.product) · \(c.status)")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    .tag(AppModel.Selection.change(c.id))
                }
            }
            Section("Agents") {
                Label("Handoffs · Dispatches · Drift", systemImage: "cpu")
                    .tag(AppModel.Selection.agents)
                HStack {
                    Text("감지된 Agent: \(model.availableAgents().joined(separator: ", ").isEmpty ? "없음" : model.availableAgents().joined(separator: ", "))")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            Section("") {
                Label("Settings", systemImage: "gearshape")
                    .tag(AppModel.Selection.settings)
            }
            Section("Workbench") {
                ForEach(model.workbenchItems.filter { !["promoted", "archived"].contains($0.status) }) { w in
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(w.name)
                            Text(w.status).font(.caption2).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if w.isStale {
                            Text("30일+").font(.caption2)
                                .padding(.horizontal, 5).padding(.vertical, 1)
                                .background(.yellow.opacity(0.25), in: Capsule())
                        }
                    }
                    .tag(AppModel.Selection.workbench(w.id))
                }
            }
        }
    }

    // ---- Detail ------------------------------------------------------------

    @ViewBuilder
    private var detail: some View {
        switch selection {
        case let .product(id)?:
            if let p = model.item("products", id) {
                ProductDetailView(product: p)
            } else {
                DeletedPlaceholder()
            }
        case let .change(id)?:
            if let c = model.item("changes", id) {
                ChangeDetailView(change: c)
            } else {
                DeletedPlaceholder()
            }
        case let .workbench(id)?:
            if let w = model.item("workbench", id) {
                WorkbenchDetailView(item: w)
            } else {
                DeletedPlaceholder()
            }
        case .agents:
            AgentsDashboardView()
        case .settings:
            SettingsView()
        case nil:
            PortfolioSummaryView(review: reviewChanges)
        }
    }
}

/// §67 Agents — Handoffs / Dispatches / Context Drift / Local Execution
struct AgentsDashboardView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Agents").font(.title2.bold())
                XCard("Local Execution — 감지된 코딩 Agent (§16 opt-in)") {
                    let agents = model.availableAgents()
                    HStack(spacing: 8) {
                        if agents.isEmpty {
                            Text("PATH 에서 감지된 agent 없음 — XITA_AGENT_CMD 로 실행 커맨드 지정 가능")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        ForEach(agents, id: \.self) { a in
                            Text(a).font(.caption).padding(.horizontal, 8).padding(.vertical, 3)
                                .background(.blue.opacity(0.12), in: Capsule())
                        }
                    }
                }
                XCard("Context Drift (§45/§46)") {
                    let rows = model.drifts()
                    VStack(alignment: .leading, spacing: 4) {
                        if rows.isEmpty {
                            Text("오래된 Agent Context 없음").font(.caption).foregroundStyle(.green)
                        }
                        ForEach(rows) { r in
                            HStack {
                                Label(r.name, systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                                Spacer()
                                Text("dispatched \(r.dispatchedRevision) → current \(r.currentRevision)")
                                    .font(.caption2.monospaced())
                                Text(r.severity).font(.caption2.bold())
                                    .foregroundStyle(r.severity == "HIGH" ? Color.red : .orange)
                            }
                            .font(.callout)
                        }
                    }
                }
                /* Dispatch 런 보드 — Vibe Kanban(Running/Idle/Needs Attention)+Conductor checks 벤치마크.
                 * 에이전트 상태는 사람이 이 메뉴로 갱신하거나 CLI `xita agent-update`로 보낸다.
                 * AWAITING_INPUT/RESULT_READY/FAILED 는 Home Needs You 로 자동 승격된다(서버와 동일 규칙). */
                XCard("Dispatches — 런 보드 (§40/§67)") {
                    let ds = model.items.filter { $0.type == "dispatches" }
                        .sorted { ($0.status.uppercased() == "AWAITING_INPUT" ? 0 : $0.status.uppercased() == "RESULT_READY" ? 1 : $0.status.uppercased() == "FAILED" ? 2 : 3, $0.id) < ($1.status.uppercased() == "AWAITING_INPUT" ? 0 : $1.status.uppercased() == "RESULT_READY" ? 1 : $1.status.uppercased() == "FAILED" ? 2 : 3, $1.id) }
                    VStack(alignment: .leading, spacing: 4) {
                        if ds.isEmpty { Text("위임 기록 없음 — 할 일 상세의 Build This 에서 생성").font(.caption).foregroundStyle(.secondary) }
                        ForEach(ds) { d in
                            HStack {
                                Text(d.name).font(.callout)
                                Spacer()
                                Text(d.status.uppercased())
                                    .font(.caption2.monospaced())
                                    .padding(.horizontal, 5).padding(.vertical, 1)
                                    .foregroundStyle(dispatchStatusColor(d.status))
                                    .background(dispatchStatusColor(d.status).opacity(0.12), in: Capsule())
                                Menu("상태 변경") {
                                    ForEach(["WORKING", "AWAITING_INPUT", "RESULT_READY", "MERGED", "FAILED", "CANCELLED"], id: \.self) { s in
                                        Button(s) { try? model.setDispatchStatus(id: d.id, status: s) }
                                    }
                                }
                                .menuStyle(.borderlessButton).frame(width: 74)
                            }
                        }
                    }
                }
                XCard("Handoff 산출물 (workspace .xita/handoffs)") {
                    let files = model.handoffFiles()
                    VStack(alignment: .leading, spacing: 3) {
                        if files.isEmpty { Text("없음").font(.caption).foregroundStyle(.secondary) }
                        ForEach(files.prefix(15), id: \.self) { f in
                            Text(f).font(.caption2.monospaced())
                        }
                    }
                }
                XCard("Activity (events.jsonl §16)") {
                    VStack(alignment: .leading, spacing: 3) {
                        let evs = model.eventLog(limit: 12)
                        if evs.isEmpty { Text("이벤트 없음").font(.caption).foregroundStyle(.secondary) }
                        ForEach(evs, id: \.ts) { e in
                            Text("\(String(e.ts.prefix(16))) [\(e.type)] \(e.title)").font(.caption2).lineLimit(1)
                        }
                    }
                }
            }
            .padding()
        }
    }
}

private struct DeletedPlaceholder: View {
    var body: some View {
        ContentUnavailableView("삭제됨", systemImage: "tray", description: Text("선택한 항목이 더 이상 없습니다."))
    }
}

// ---- Portfolio summary -------------------------------------------------------

struct PortfolioSummaryView: View {
    @EnvironmentObject private var model: AppModel
    let review: [AppModel.Item]
    @State private var captureTitle = ""
    @State private var captureBody = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Portfolio").font(.title2.bold())
                Text(model.summaryText()).font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 16) {
                    stat("\(model.products.count)", "Products")
                    stat("\(model.items.filter { $0.type == "changes" }.count)", "Changes")
                    stat("\(model.needsYouCount)", "Needs You", accent: model.needsYouCount > 0)
                    stat("\(model.workspaceRevision)", "Workspace Rev")
                }
                Divider()
                Text("Quick Capture — Workbench 로 쌓입니다").font(.headline)
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
                if !review.isEmpty {
                    Divider()
                    Text("결정 대기").font(.headline)
                    ForEach(review) { c in
                        Label("\(c.name) — \(c.status)", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                }
                askCard
                portfolioInsights
                Spacer()
            }
            .padding()
        }
    }

    @State private var askQuery = ""
    @State private var askAnswer: AppModel.AskResult?

    private var askCard: some View {
        XCard("물어보세요 — 왜? 막힌 건? 버전? (Ask §18)") {
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
                    Text(c.status).font(.caption2.monospaced())
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
                        mini("출시준비", h.launchReadiness >= 80 ? "healthy" : h.launchReadiness >= 40 ? "warning" : "critical", "\(h.launchReadiness)%")
                        mini("Context", (h.contextDrift + h.pendingProposals) == 0 ? "healthy" : "warning")
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

// ---- Product detail ----------------------------------------------------------

struct ProductDetailView: View {
    @EnvironmentObject private var model: AppModel
    let product: AppModel.Item
    @State private var newChangeTitle = ""
    @State private var confirmDelete = false
    @State private var tab: ProductTab = .overview

    enum ProductTab: Hashable { case overview, board, roadmap, operations, changes, releases, state, records }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                header
                Picker("", selection: $tab) {
                    Text("개요").tag(ProductTab.overview)
                    Text("보드").tag(ProductTab.board)
                    Text("계획").tag(ProductTab.roadmap)
                    Text("운영").tag(ProductTab.operations)
                    Text("할 일").tag(ProductTab.changes)
                    Text("출시 기록").tag(ProductTab.releases)
                    Text("되는 것").tag(ProductTab.state)
                    Text("자취").tag(ProductTab.records)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 520)

                switch tab {
                case .overview: overviewTab
                case .board: boardTab
                case .roadmap: roadmapTab
                case .operations: operationsTab
                case .changes: changesTab
                case .releases: releasesTab
                case .state: stateTab
                case .records: recordsTab
                }
            }
            .padding()
        }
        .confirmationDialog("Product '\(product.name)' 삭제?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("삭제", role: .destructive) { try? model.deleteProduct(id: product.id) }
        }
    }

    private var header: some View {
        HStack {
            Text(product.name).font(.title2.bold())
            Text(product.status).font(.caption.monospaced())
                .padding(.horizontal, 8).padding(.vertical, 2)
                .background(.quaternary, in: Capsule())
            if let v = model.profile(product.id)["version"] { Text(v).font(.caption).foregroundStyle(.secondary) }
            Spacer()
            Text("rev \(product.revision)").font(.caption2).foregroundStyle(.secondary)
            Button("삭제", role: .destructive) { confirmDelete = true }
                .buttonStyle(.borderless).tint(.red)
        }
    }

    // ---- Overview (Health §97 + Next Release + 요약) --------------------------
    @ViewBuilder private var overviewTab: some View {
        let h = model.health(product.id)
        HStack(spacing: 10) {
            healthChip("개발", h.development)
            healthChip("운영", h.operations)
            healthChip("배포", h.distribution)
            healthChip("출시준비", h.launchReadiness >= 80 ? "healthy" : h.launchReadiness >= 40 ? "warning" : "critical", value: "\(h.launchReadiness)%")
            healthChip("Context", h.contextDrift == 0 && h.pendingProposals == 0 ? "healthy" : "warning", value: "drift \(h.contextDrift)·제안 \(h.pendingProposals)")
        }
        XCard("다음 릴리즈 \u{2014} \(h.nextRelease ?? "계획 없음")") {
            VStack(alignment: .leading, spacing: 4) {
                if let nr = model.nextRelease(product.id) {
                    let rr = model.releaseReadiness(nr.id, productId: product.id)
                    Text("\(nr.name) [\(nr.status)] — change \(rr.shipped)/\(rr.total)")
                    ForEach(rr.blockers, id: \.self) { Label($0, systemImage: "lock.fill").font(.caption).foregroundStyle(.red) }
                } else {
                    Text("릴리즈 탭에서 계획을 만드세요").font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(4)
            frameCard
        }
        XCard("지금 진행 중") {
            VStack(alignment: .leading, spacing: 4) {
                let act = model.changes(for: product.id).filter { ["BUILD", "REVIEW", "SHIP_READY"].contains($0.status) }
                if act.isEmpty { Text("지금 진행 중인 할 일 없음").font(.caption).foregroundStyle(.secondary) }
                ForEach(act) { c in
                    HStack { Text(c.name); Spacer(); Text(c.status).font(.caption2.monospaced()) }
                }
            }
        }
        if let err = model.lastError { Label(err, systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(.red) }
    }

    private func healthChip(_ label: String, _ state: String, value: String? = nil) -> some View {
        VStack(spacing: 2) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            HStack(spacing: 3) {
                Circle().fill(state == "healthy" ? Color.green : state == "warning" ? .orange : .red).frame(width: 7, height: 7)
                Text(value ?? (state == "healthy" ? "정상" : state == "warning" ? "주의" : state == "pending" ? "대기" : "위험")).font(.caption)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(8)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 8))
    }

    private var frameCard: EmptyModifierView { EmptyModifierView() }

    // ---- Roadmap (milestone × change — Linear projects 스타일) -------------------
    @State private var newMilestoneName = ""
    @State private var newMilestoneDate = ""

    /* 보드 — Shape Up betting + Linear stage flow 벤치마크 (research synthesis)
     * 변경 전 정책: Change 목록이 탭 산개(로드맵=IDEA/PLAN, 개발=전체) — "어디가 어디까지 됐나"를 표로 못 봄
     * 후 정책: 스테이지 5열 칸반. 카드는 score/appetite/milestone/stale를 달고,
     *   우클릭(컨텍스트 메뉴)으로 lifecycle 유효 전이만 이동. 열 헤더에 Σappetite weeks = 베팅 용량.
     * 이유: "기능 단위 관리가 힘들다"의 직관 해법 — 면이 아니라 흐름으로 보는 것 (경쟁사 전부 보드 기본)
     * 범위: 이 제품 전체 changes. SHIPPED/CANCELLED 제외(과거는 로드맵 탭), PAUSED는 휴지통 열 없음→context menu로复位 */
    @ViewBuilder private var boardTab: some View {
        let stages = ["IDEA", "PLAN", "BUILD", "REVIEW", "SHIP_READY"]
        let boardChanges = model.changes(for: product.id)
            .filter { stages.contains($0.status) || $0.status == "PAUSED" }
        XCard("보드 — 기능이 지금 어디까지 (우클릭으로 이동)") {
            ScrollView(.horizontal, showsIndicators: true) {
                HStack(alignment: .top, spacing: 10) {
                    ForEach(stages, id: \.self) { stage in
                        BoardColumn(
                            stage: stage,
                            changes: boardChanges
                                .filter { $0.status == stage }
                                .sorted { (model.valueScore($0.id) ?? -99) > (model.valueScore($1.id) ?? -99) },
                            all: model.milestones(for: product.id)
                        )
                    }
                    if boardChanges.contains(where: { $0.status == "PAUSED" }) {
                        BoardColumn(stage: "PAUSED", changes: boardChanges.filter { $0.status == "PAUSED" },
                                   all: model.milestones(for: product.id))
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    /* 계획 탭 — 3레인 재구축 (research run 20260830 통합 스펙)
     * 변경 전 정책: 마일스톤 카드 세로 나열 + 미배정 리스트 — "진행 중 로드맵과 그 안 세부사항"을
     *   한 시야에 못 잡음. 레인=마일스톤이 아니라 상태/시간 그릇이어야 함(Canny/Beamer/AnnounceKit 실측)
     * 변경 후 정책: Now(포커스 마일스톤의 할 일) / Next(다음 마일스톤들) / Later(미배정 아이디어·계획)
     *   3레인. 헤더에 카운트+Σappetite+overdue 신호, 빈 레인은 명시적 플레이스홀더(Linear Gray 원칙),
     *   Now 레인 하단 = Enter 즉시생성 퀵애드 행(Plane: "타이틀+Enter, refine later"),
     *   카드는 마일스톤 배지/이동 인라인. '마일스톤 만들기'는 Next 헤더 버튼으로 축소.
     * 변경 이유: 사용자 요구 "현재 진행 중인 로드맵 + 해당 로드맵 내 세부 구현사항 관리를 편하게"
     * 영향 범위: 이 탭 한정. 데이터 규칙(setMilestone/createChange) 재사용, 스키마 무변경 */
    @ViewBuilder private var roadmapTab: some View {
        let ms = model.milestones(for: product.id).filter { $0.status != "done" }
        let focus = ms.first
        let nextMs = Array(ms.dropFirst())
        let un = model.unassignedChanges(product.id)
        ScrollView(.horizontal, showsIndicators: true) {
            HStack(alignment: .top, spacing: 10) {
                PlanLane(
                    title: "지금 (Now)",
                    subtitle: focus.map { $0.name + ($0.targetDate.map { " · \(String($0.prefix(10)))" } ?? "") } ?? "포커스 마일스톤 없음",
                    count: focus?.changes.count ?? 0,
                    weeks: (focus?.changes ?? []).reduce(0) { $0 + (Int(model.docFields(type: "change", id: $1.id)["appetite_weeks"] ?? "") ?? 0) },
                    overdue: focus?.isOverdue ?? false,
                    done: focus.map { Double($0.progress) }
                ) {
                    ForEach(focus?.changes ?? []) { c in PlanChangeRow(change: c, milestones: ms) }
                    QuickAddChangeRow(productId: product.id, milestoneId: focus?.milestoneId)
                }
                PlanLane(
                    title: "다음 (Next)",
                    subtitle: nextMs.isEmpty ? "마일스톤 추가하면 여기 쌓입니다" : nextMs.map(\.name).joined(separator: " → "),
                    count: nextMs.reduce(0) { $0 + $1.changes.count },
                    weeks: nextMs.flatMap(\.changes).reduce(0) { $0 + (Int(model.docFields(type: "change", id: $1.id)["appetite_weeks"] ?? "") ?? 0) },
                    overdue: nextMs.contains(where: \.isOverdue)
                ) {
                    ForEach(nextMs) { m in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 5) {
                                Image(systemName: "flag").font(.caption2).foregroundStyle(m.isOverdue ? Color.red : Color.secondary)
                                Text(m.name).font(.caption.bold()).foregroundStyle(.secondary)
                                Text("\(m.progress)%").font(.caption2.monospaced()).foregroundStyle(.tertiary)
                            }
                            ForEach(m.changes) { c in PlanChangeRow(change: c, milestones: ms) }
                        }
                    }
                    if !nextMs.isEmpty {
                        Menu("+ 마일스톤") {
                            Button("새 마일스톤 (이름: Beta 1 / 목표일 선택)") { showMilestoneForm = true }
                        }.menuStyle(.borderlessButton).fixedSize()
                        .popover(isPresented: $showMilestoneForm) { milestoneForm }
                    }
                }
                PlanLane(
                    title: "나중 (Later)",
                    subtitle: "아직 약속 안 한 할 일",
                    count: un.count,
                    weeks: un.reduce(0) { $0 + (Int(model.docFields(type: "change", id: $1.id)["appetite_weeks"] ?? "") ?? 0) },
                    overdue: false
                ) {
                    ForEach(un) { c in PlanChangeRow(change: c, milestones: ms) }
                    if ms.isEmpty {
                        Menu("+ 마일스톤 만들기") {
                            Button("열기") { showMilestoneForm = true }
                        }.menuStyle(.borderlessButton).fixedSize().popover(isPresented: $showMilestoneForm) { milestoneForm }
                    }
                }
            }
            .frame(minWidth: 900)
        }
    }

    @State private var showMilestoneForm = false

    private var milestoneForm: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("새 마일스톤").font(.headline)
            TextField("이름 (예: Internal alpha)", text: $newMilestoneName)
            TextField("목표일 2026-10-01 (선택)", text: $newMilestoneDate)
            Button("추가") {
                let n = newMilestoneName.trimmingCharacters(in: .whitespaces)
                guard !n.isEmpty else { return }
                try? model.createMilestone(productId: product.id, name: n,
                                           targetDate: newMilestoneDate.isEmpty ? nil : newMilestoneDate)
                newMilestoneName = ""; newMilestoneDate = ""; showMilestoneForm = false
            }
            .disabled(newMilestoneName.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(12).frame(width: 280)
    }

    // ---- Operations (§10 Declared/Observed — 플랫폼·배포처·버전) -----------------
    @State private var prodStatus = "PRODUCTION"
    @State private var platforms = ""
    @State private var deployments = ""
    @State private var repo = ""
    @State private var vision = ""
    @State private var opsLoaded = false

    @ViewBuilder private var operationsTab: some View {
        XCard("운영 프로필") {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("운영 상태").frame(width: 120, alignment: .leading).font(.caption).foregroundStyle(.secondary)
                    Picker("", selection: $prodStatus) {
                        ForEach(AppModel.ProductionStatus.allCases, id: \.rawValue) { Text($0.rawValue).tag($0.rawValue) }
                    }.labelsHidden().frame(width: 160)
                }
                fieldRow("플랫폼 (; 구분)", $platforms, "iOS;Android;Web;API")
                VStack(alignment: .leading, spacing: 2) {
                    Text("배포처 — 한 줄에 `env|target|url`").font(.caption).foregroundStyle(.secondary)
                    TextEditor(text: $deployments).font(.body.monospaced()).frame(minHeight: 70)
                        .overlay(RoundedRectangle(cornerRadius: 5).stroke(.separator))
                }
                fieldRow("저장소", $repo, "https://github.com/…")
                VStack(alignment: .leading, spacing: 2) {
                    Text("Vision (왜 존재하는가)").font(.caption).foregroundStyle(.secondary)
                    TextEditor(text: $vision).frame(minHeight: 50)
                        .overlay(RoundedRectangle(cornerRadius: 5).stroke(.separator))
                }
                HStack {
                    Button("저장") {
                        try? model.updateProfile(id: product.id, fields: [
                            .init("production_status", prodStatus),
                            .init("platforms", platforms),
                            .init("deployments", deployments.replacingOccurrences(of: "\n", with: ";")),
                            .init("repo", repo),
                            .init("vision", vision),
                        ])
                    }
                }
            }
        }
        .onAppear {
            guard !opsLoaded else { return }
            opsLoaded = true
            let p = model.profile(product.id)
            prodStatus = p["production_status"] ?? p["status"] ?? "PRODUCTION"
            platforms = p["platforms"] ?? ""
            deployments = (p["deployments"] ?? "").split(separator: ";").joined(separator: "\n")
            repo = p["repo"] ?? ""
            vision = p["vision"] ?? ""
        }
        currentVersionCard
    }

    private var currentVersionCard: some View {
        XCard("현재 배포 현황 (§10 Observed)") {
            VStack(alignment: .leading, spacing: 3) {
                let p = model.profile(product.id)
                Text("Production 버전: \(p["version"] ?? "-")")
                    .font(.headline)
                let deps = (p["deployments"] ?? "").split(separator: ";").map(String.init)
                ForEach(deps, id: \.self) { line in
                    Text("  · \(line)").font(.caption.monospaced())
                }
                if deps.isEmpty { Text("배포처 미기록").font(.caption).foregroundStyle(.secondary) }
                Text("플랫폼: \(p["platforms"] ?? "-") · 저장소: \(p["repo"] ?? "-")")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private func fieldRow(_ label: String, _ text: Binding<String>, _ prompt: String) -> some View {
        HStack {
            Text(label).font(.caption).foregroundStyle(.secondary).frame(width: 120, alignment: .leading)
            TextField(prompt, text: text).textFieldStyle(.roundedBorder)
        }
    }

    // ---- Changes + Roadmap (FUTURE 축) ---------------------------------------
    @ViewBuilder private var changesTab: some View {
        XCard("할 일 풀 — 다음에 만들 것") {
            VStack(alignment: .leading, spacing: 4) {
                let plan = model.roadmap(product.id)
                if plan.isEmpty { Text("BACKLOG 없음 — Workbench 승격 또는 아래에서 생성").font(.caption).foregroundStyle(.secondary) }
                ForEach(plan) { c in
                    HStack {
                        Text(c.name)
                        if let days = model.staleDays("change", c.id), days > 30 {
                            Text("\(days)d 정체").font(.caption2)
                                .foregroundStyle(.orange)
                        }
                        Spacer()
                        /* Aha scorecard 파생 점수 (P+N+S−E)×C — 채점하면 이 줄이 위로 정렬된다 */
                        if let score = model.valueScore(c.id) {
                            Text(String(format: "%.1f", score)).font(.caption2.monospaced().bold())
                                .padding(.horizontal, 5).padding(.vertical, 1)
                                .background(.green.opacity(0.15), in: Capsule())
                        }
                        Text(docPriority(c.id)).font(.caption2.monospaced())
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(.blue.opacity(0.12), in: Capsule())
                        Menu("우선순위") {
                            ForEach(["critical", "high", "normal", "low"], id: \.self) { p in
                                Button(p) { try? model.setPriority(changeId: c.id, priority: p) }
                            }
                        }
                        .menuStyle(.borderlessButton).frame(width: 70)
                        ScoreEditorMenu(changeId: c.id)
                    }
                }
            }
        }
        XCard("할 일 전체") {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(model.changes(for: product.id)) { c in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(c.name).fontWeight(.medium)
                            Spacer()
                            Text(c.status).font(.caption2.monospaced())
                            Button("열기") {}
                                .buttonStyle(.link)
                        }
                        HStack(spacing: 6) {
                            let msId = model.docFields(type: "change", id: c.id)["milestone_id"] ?? ""
                            Text(msId.isEmpty ? "마일스톤 없음" : msId.components(separatedBy: "-m-").last ?? msId)
                                .font(.caption2)
                                .padding(.horizontal, 5).padding(.vertical, 1)
                                .background(.quaternary.opacity(0.5), in: Capsule())
                            Text("· 우선순위 \(docPriority(c.id))").font(.caption2).foregroundStyle(.secondary)
                            Spacer()
                            Menu("이동") {
                                ForEach(model.milestones(for: product.id)) { m in
                                    Button(m.name) { try? model.setMilestone(changeId: c.id, milestoneId: m.milestoneId) }
                                }
                                Divider()
                                Button("해제") { try? model.setMilestone(changeId: c.id, milestoneId: nil) }
                            }
                            .frame(width: 50)
                        }
                    }
                }
                HStack {
                    TextField("새 할 일 제목", text: $newChangeTitle).textFieldStyle(.roundedBorder)
                    Button("추가") {
                        let t = newChangeTitle.trimmingCharacters(in: .whitespaces)
                        guard !t.isEmpty else { return }
                        try? model.createChange(productId: product.id, title: t)
                        newChangeTitle = ""
                    }
                }
            }
        }
    }

    private func docPriority(_ changeId: String) -> String {
        model.docFields(type: "change", id: changeId)["priority"] ?? "normal"
    }

    // ---- Releases ------------------------------------------------------------
    @State private var newReleaseName = ""
    @State private var newReleaseNotes = ""
    @State private var includeChange = ""

    @ViewBuilder private var releasesTab: some View {
        XCard("새 버전 묶기") {
            HStack {
                TextField("버전 (v1.6)", text: $newReleaseName).textFieldStyle(.roundedBorder)
                TextField("메모", text: $newReleaseNotes).textFieldStyle(.roundedBorder)
                Button("생성") {
                    let n = newReleaseName.trimmingCharacters(in: .whitespaces)
                    guard !n.isEmpty else { return }
                    try? model.createRelease(productId: product.id, name: n, notes: newReleaseNotes)
                    newReleaseName = ""
                    newReleaseNotes = ""
                }
            }
        }
        ForEach(model.releases(for: product.id)) { r in
            releaseCard(r)
        }
    }

    private func releaseCard(_ r: AppModel.Item) -> some View {
        let rr = model.releaseReadiness(r.id, productId: product.id)
        let included = model.releaseChangeIds(r.id)
        return XCard {
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(r.name).font(.headline)
                    Text(r.status).font(.caption.monospaced())
                        .padding(.horizontal, 6).padding(.vertical, 1)
                        .background(r.status == "RELEASED" ? Color.green.opacity(0.18) : .orange.opacity(0.15), in: Capsule())
                    Spacer()
                    Menu("상태 변경") {
                        ForEach(["PLANNED", "PREPARING", "READY", "SUBMITTED", "RELEASED", "ROLLED_BACK"], id: \.self) { st in
                            Button(st) { try? model.setReleaseStatus(id: r.id, status: st) }
                        }
                    }
                    .frame(width: 90)
                }
                Text("change \(rr.shipped)/\(rr.total) 완료 \(rr.ready ? "· 출시 가능 ✓" : "· 준비 대기")")
                    .font(.caption)
                    .foregroundStyle(rr.ready ? .green : .secondary)
                ForEach(rr.blockers, id: \.self) { b in
                    Label(b, systemImage: "lock.fill").font(.caption).foregroundStyle(.red)
                }
                ForEach(included, id: \.self) { cid in
                    HStack(spacing: 6) {
                        Image(systemName: model.item("changes", cid)?.status == "SHIPPED" ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(model.item("changes", cid)?.status == "SHIPPED" ? .green : .secondary)
                        Text(model.item("changes", cid)?.name ?? cid).font(.caption)
                    }
                }
                HStack {
                    Picker("할 일 포함", selection: $includeChange) {
                        Text("선택…").tag("")
                        ForEach(model.changes(for: product.id)) { c in
                            Text(c.name).tag(c.id)
                        }
                    }
                    .frame(width: 220)
                    Button("추가") {
                        guard !includeChange.isEmpty else { return }
                        try? model.addChangeToRelease(releaseId: r.id, changeId: includeChange)
                        includeChange = ""
                    }
                }
            }
        }
    }

    // ---- Capabilities + Readiness + GitHub (기존 카드 재사용) -------------------
    @ViewBuilder private var stateTab: some View {
        githubObserveCard
        capabilitiesCard
        readinessCard
    }

    // ---- Records -------------------------------------------------------------
    @ViewBuilder private var recordsTab: some View {
        knowledgeCard
        decisionsCard
        relatedSection("릴리즈 문서 등 (Artifacts)", type: "artifacts")
        relatedSection("참조/자산 (References)", type: "references")
        XCard("Timeline (최근)") {
            TimelineSection(productId: product.id)
        }
    }

    @State private var insTitle = ""
    @State private var insKind = "OBSERVATION"
    @State private var insContent = ""

    /* Knowledge(Insight) — 관찰/가설/기회를 1급 객체로. Leantime 5분류 + Torres OST kind 확장.
     * Capture→Change 사이에 없던 층: "왜 이걸 만드는가"의 근거가 여기 쌓인다. */
    private var knowledgeCard: some View {
        let ins = model.insights(for: product.id)
        return XCard("Knowledge — 관찰/가설 (\(ins.count))") {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    TextField("무엇을 관찰/가정했나", text: $insTitle)
                    Picker("", selection: $insKind) {
                        ForEach(["OBSERVATION", "INTERVIEW", "SECONDARY", "DERIVED", "RETRO", "OPPORTUNITY", "ASSUMPTION"], id: \.self) { k in
                            Text(k).tag(k)
                        }
                    }
                    .labelsHidden().frame(width: 140)
                    Button("추가") {
                        guard insTitle.count >= 2, insContent.count >= 4 else { return }
                        try? model.addInsight(productId: product.id, title: insTitle, kind: insKind, content: insContent)
                        insTitle = ""
                        insContent = ""
                    }
                    .disabled(insTitle.count < 2 || insContent.count < 4)
                }
                TextField("근거/내용 (한 줄 이상)", text: $insContent)
                    .font(.caption).textFieldStyle(.roundedBorder)
                if ins.isEmpty {
                    Text("기록 0 — 챗에서 잃어버리는 관찰이 이곳의 연료입니다. AI 답변(Ask)의 근거가 됩니다").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(ins) { i in
                    HStack {
                        Text(i.name).font(.callout)
                        Text(model.docFields(type: "insight", id: i.id)["kind"] ?? "?")
                            .font(.caption2).foregroundStyle(.secondary)
                        Spacer()
                        Button(i.status) { try? model.cycleInsightStatus(id: i.id) }
                            .buttonStyle(.borderless)
                            .foregroundStyle(i.status == "VALIDATED" ? Color.green : i.status == "OUTDATED" ? Color.secondary : Color.orange)
                            .help("탭: OPEN→VALIDATED→OUTDATED")
                    }
                }
            }
        }
    }

    @State private var decTitle = ""
    @State private var decDecision = ""

    private var decisionsCard: some View {
        let ds = model.decisions(for: product.id)
        let active = ds.filter { $0.status == "ACTIVE" }
        let superseded = ds.filter { $0.status == "SUPERSEDED" }
        return XCard("결정 (Decisions) \u{2014} 유효 \(active.count) · 대체됨 \(superseded.count)") {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(active) { dd in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text(model.docFields(type: "decisions", id: dd.id)["title"] ?? dd.name)
                            Spacer()
                            if ds.count > 1 {
                                Menu("대체…") {
                                    ForEach(active.filter { $0.id != dd.id }) { other in
                                        Button("이걸로 대체: \(other.name)") { try? model.supersedeDecision(oldId: dd.id, newId: other.id) }
                                    }
                                }
                                .menuStyle(.borderlessButton).frame(width: 80)
                            }
                        }
                        if let why = model.docFields(type: "decisions", id: dd.id)["reason"], !why.isEmpty {
                            Text("사유: \(why)").font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
                ForEach(superseded) { dd in
                    HStack {
                        Text(dd.name).strikethrough().foregroundStyle(.secondary)
                        Spacer()
                        Text("SUPERSEDED").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                HStack {
                    TextField("제목", text: $decTitle).textFieldStyle(.roundedBorder)
                    TextField("결정 내용", text: $decDecision).textFieldStyle(.roundedBorder)
                    Button("기록") {
                        guard !decTitle.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                        try? model.addDecision(productId: product.id, title: decTitle, decision: decDecision, reason: "")
                        decTitle = ""
                        decDecision = ""
                    }
                }
            }
        }
    }

    // ==== 기존 카드들 ====
    @State private var newCapability = ""
    @State private var ghRepo = ""
    @State private var figmaKey = ""
    @State private var ghResult: String?

    private var githubObserveCard: some View {
        XCard("GitHub 관측 (참조 요약만 저장)") {
            HStack {
                TextField("owner/repo", text: $ghRepo).textFieldStyle(.roundedBorder)
                Button("관측") {
                    let repo = ghRepo.trimmingCharacters(in: .whitespaces)
                    guard repo.contains("/") else { ghResult = "owner/repo 형식"; return }
                    Task {
                        do {
                            let r = try await GitHubObserve.observe(
                                model: model, product: product.id, repo: repo,
                                token: ProcessInfo.processInfo.environment["XITA_GITHUB_TOKEN"]
                            )
                            await MainActor.run { ghResult = "+\(r.created) ~\(r.updated)" }
                        } catch {
                            await MainActor.run { ghResult = "실패: \(error.localizedDescription)" }
                        }
                    }
                }
                if let ghResult { Text(ghResult).font(.caption).foregroundStyle(.secondary) }
            }
            HStack {
                TextField("Figma fileKey", text: $figmaKey).textFieldStyle(.roundedBorder)
                Button("Figma 관측") {
                    let key = figmaKey.trimmingCharacters(in: .whitespaces)
                    guard !key.isEmpty, let tok = ProcessInfo.processInfo.environment["XITA_FIGMA_TOKEN"] else {
                        ghResult = "fileKey/XITA_FIGMA_TOKEN 확인"
                        return
                    }
                    Task {
                        do {
                            let n = try await FigmaObserve.observe(model: model, product: product.id, fileKey: key, token: tok)
                            await MainActor.run { ghResult = "figma +\(n)" }
                        } catch {
                            await MainActor.run { ghResult = "figma 실패: \(error.localizedDescription)" }
                        }
                    }
                }
            }
        }
    }

    /* 되는 것 — '탑재된 기능 리스트' 화면 (research run 20260830: Canny 레인 + Raycast 도메인 원리)
     * 변경 전 정책: Capabilities 나열 + 상태 하드코딩 'active' — 지금 뭘 보유/준비 중인지 구분 불가
     * 변경 후 정책: 실제 status로 4레인 — 되는 중(=보유) · 준비 중 · 실험 · 중단. 행 탭 1회로 상태 순환.
     * 카피 어휘는 solo-plain-language 7검사 통과 명사만 ('백로그' 등 은어 배격)
     * 영향 범위: capabilities docs 의 status 실값 사용뿐, 스키마 무변경 */
    private var capabilitiesCard: some View {
        let caps = model.capabilities(for: product.id)
        let lanes: [(String, [String], Color)] = [
            ("되는 중 — 지금 쓸 수 있는", ["active", "shipped"], .green),
            ("준비 중", ["planned"], .blue),
            ("실험", ["experiment", "exploring"], .purple),
            ("중단", ["deprecated"], .secondary),
        ]
        return XCard("되는 것 — 이 제품의 기능 (\(caps.count))") {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(lanes, id: \.0) { lane in
                    let group = caps.filter { lane.1.contains($0.status.lowercased()) }
                    if !group.isEmpty {
                        HStack(spacing: 5) {
                            Circle().fill(lane.2).frame(width: 7, height: 7)
                            Text(lane.0).font(.caption.bold()).foregroundStyle(.secondary)
                            Text("\(group.count)").font(.caption.monospaced()).foregroundStyle(.tertiary)
                        }
                        ForEach(group) { c in
                            HStack {
                                Text(c.name).font(.callout)
                                Spacer()
                                Button(capStatusLabel(c.status)) {
                                    try? model.cycleCapability(productId: product.id, name: c.name)
                                }
                                .buttonStyle(.borderless)
                                .foregroundStyle(lane.2)
                                .help("탭: 되는중→준비→실험→중단 순환 (서버 승인은 SHIPPED로 찍힙니다)")
                            }
                            .padding(.leading, 12)
                        }
                    }
                }
                let uncategorized = caps.filter { c in !lanes.contains { $0.1.contains(c.status.lowercased()) } }
                if !uncategorized.isEmpty {
                    Text("나머지 상태 \(uncategorized.count)").font(.caption2).foregroundStyle(.tertiary)
                }
                if caps.isEmpty {
                    Text("아직 기능 선언 없음 — 할 일이 완료되면 여기 쌓입니다").font(.caption).foregroundStyle(.tertiary)
                }
                HStack {
                    TextField("+ 새 기능 선언", text: $newCapability).textFieldStyle(.roundedBorder)
                    Button("추가") {
                        let n = newCapability.trimmingCharacters(in: .whitespaces)
                        guard !n.isEmpty else { return }
                        try? model.addCapability(productId: product.id, name: n)
                        newCapability = ""
                    }
                }
            }
        }
    }

    private func capStatusLabel(_ s: String) -> String {
        switch s.lowercased() {
        case "active", "shipped": return "되는 중"
        case "planned": return "준비 중"
        case "experiment", "exploring": return "실험"
        case "deprecated": return "중단"
        default: return s
        }
    }

    @State private var rdyOverall: Int = -1
    @State private var rdyBlockers: [String] = []
    @State private var rdyGroups: [AppModel.Item] = []

    private var readinessCard: some View {
        XCard("Definition of Ship \u{2014} \(rdyOverall >= 0 ? "\(rdyOverall)%" : "미적용")") {
            VStack(alignment: .leading, spacing: 6) {
                if rdyOverall < 0 {
                    Button("DoS 템플릿 적용 (MOBILE_SAAS)") {
                        try? model.applyShipTemplate(productId: product.id)
                        reloadReadiness()
                    }
                } else {
                    ProgressView(value: Double(rdyOverall), total: 100)
                    Text("상태 버튼을 누를 때마다 PENDING→진행→완료로 순환합니다")
                        .font(.caption).foregroundStyle(.secondary)
                    ForEach(rdyBlockers, id: \.self) { b in
                        Label(b, systemImage: "lock.fill").font(.caption).foregroundStyle(.red)
                    }
                    ForEach(rdyGroups) { g in
                        ReadinessGroupRow(productId: product.id, kind: g.kind.isEmpty ? g.name : g.kind) { reloadReadiness() }
                    }
                }
            }
        }
        .onAppear { reloadReadiness() }
    }

    private func reloadReadiness() {
        if let sum = model.readinessSummary(productId: product.id) {
            rdyOverall = sum.overall
            rdyBlockers = sum.blockers
        } else {
            rdyOverall = -1
            rdyBlockers = []
        }
        rdyGroups = model.items.filter { $0.type == "readiness" && $0.product == product.id }
    }

    private func relatedSection(_ title: String, type: String) -> some View {
        let related = model.items.filter { $0.type == type && $0.product == product.id }
        return XCard("\(title) (\(related.count))") {
            VStack(alignment: .leading, spacing: 4) {
                if related.isEmpty {
                    Text("없음").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(related) { r in
                    HStack {
                        Text(r.name)
                        Spacer()
                        Text(r.status).font(.caption2.monospaced()).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}

struct EmptyModifierView: View { var body: some View { EmptyView() } }

/// §16 Timeline — events.jsonl 은 서버/.xita 에 있으나 Mac 워크스페이스엔 Mac 이벤트가 core 기록 분기 외 없음 → pull 기반 최신순 대체
/* 생애 타임라인 — Two-Layer History (Figma VERIFIED, run 20260830 Tier G)
 * 변경 전 정책: 릴리즈 행+change 행을 따로 붙인 목록 — "무엇이 있었나"의 시간이 없음
 * 변경 후 정책: events.jsonl 단일 스트림에 ① 인간 마커(결정/출시/승인/위임/관찰/충돌)는 펼침
 *   ② 그 외 자동 이벤트는 시간 그룹으로 접힘(카운트만) ③ 과거는 "Show older" append만 (스크러버 금지)
 *   ④ 행 4필드: 시각·타입 아이콘·문장·(마커만 강조). XITA는 이벤트 자동発生이라 메타데이터 작성 0 = Figma보다 부담 아래
 * 영향 범위: TimelineSection 렌더만. events 포맷 무변경 */
struct TimelineSection: View {
    @EnvironmentObject private var model: AppModel
    let productId: String
    @State private var limit = 40
    @State private var showMechanical = false

    private static let markerTypes: Set<String> = [
        "MAJOR_DECISION", "RELEASED", "CHANGE_APPROVED", "CHANGE_SHIPPED",
        "DISPATCHED", "DISPATCH_UPDATED", "INSIGHT_CREATED", "ARTIFACT_PATCHED",
        "PROPOSAL_CREATED", "SHIP_BLOCKER", "CONFLICT", "DECISION_SUPERSEDED", "CHANGE_SCORED",
    ]

    var body: some View {
        let all = model.eventLog(limit: limit).filter { productId.isEmpty || $0.title.contains(productId) || true }
        let markers = all.filter { Self.markerTypes.contains($0.type) }
        let mechanical = all.filter { !Self.markerTypes.contains($0.type) }
        VStack(alignment: .leading, spacing: 5) {
            ForEach(Array(markers.enumerated()), id: \.offset) { _, e in
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: Self.icon(e.type)).font(.caption2)
                        .foregroundStyle(Self.markerColor(e.type))
                        .frame(width: 14)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(e.title).font(.caption)
                        Text(String(e.ts.prefix(16).replacingOccurrences(of: "T", with: " ")))
                            .font(.caption2).foregroundStyle(.tertiary)
                    }
                }
            }
            if !mechanical.isEmpty {
                Button {
                    showMechanical.toggle()
                } label: {
                    Label("그 밖의 움직임 \(mechanical.count)건", systemImage: showMechanical ? "chevron.up" : "chevron.down")
                        .font(.caption2).foregroundStyle(.tertiary)
                }.buttonStyle(.plain)
                if showMechanical {
                    ForEach(Array(mechanical.prefix(25).enumerated()), id: \.offset) { _, e in
                        Text("· \(String(e.ts.prefix(10))) \(e.title)")
                            .font(.caption2).foregroundStyle(.quaternary)
                    }
                }
            }
            Button("먼저 일 Show older") { limit += 80 }
                .buttonStyle(.plain).font(.caption2).foregroundStyle(.secondary)
            if limit > 40 { Text("처음으로") .font(.caption2).foregroundStyle(.tertiary)
                .onTapGesture { limit = 40 } }
        }
    }

    static func icon(_ t: String) -> String {
        switch t {
        case "MAJOR_DECISION", "DECISION_SUPERSEDED": return "brain.head.profile"
        case "RELEASED": return "shippingbox.fill"
        case "CHANGE_APPROVED", "CHANGE_SHIPPED": return "checkmark.seal.fill"
        case "DISPATCHED", "DISPATCH_UPDATED": return "paperplane.fill"
        case "INSIGHT_CREATED": return "eye"
        case "ARTIFACT_PATCHED": return "doc.badge.gearshape"
        case "PROPOSAL_CREATED": return "arrow.triangle.branch"
        case "SHIP_BLOCKER", "CONFLICT": return "exclamationmark.triangle.fill"
        case "CHANGE_SCORED": return "star"
        default: return "circle"
        }
    }
    static func markerColor(_ t: String) -> Color {
        switch t {
        case "SHIP_BLOCKER", "CONFLICT": return .red
        case "RELEASED", "CHANGE_SHIPPED": return .green
        case "MAJOR_DECISION", "DECISION_SUPERSEDED": return .purple
        case "DISPATCHED", "DISPATCH_UPDATED": return .blue
        default: return .secondary
        }
    }
}

struct ReadinessGroupRow: View {
    @EnvironmentObject private var model: AppModel
    let productId: String
    let kind: String
    let onPatch: () -> Void

    var items: [String] {
        guard let doc = model.doc(type: "readiness", id: "\(productId)-\(kind.lowercased())") else { return [] }
        return (doc.fields["items"] ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { $0.contains("|") }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(kind).font(.caption.bold())
            ForEach(items, id: \.self) { line in
                let parts = line.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
                if parts.count >= 2 {
                    HStack(spacing: 6) {
                        Button {
                            try? model.cycleReadinessItem(productId: productId, kind: kind, item: parts[0])
                            onPatch()
                        } label: {
                            Image(systemName: statusIcon(parts[1]))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(statusColor(parts[1]))
                        Text(parts[0])
                        Spacer()
                        Text("\(parts.count > 2 ? parts[2] : "0")%").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func statusIcon(_ s: String) -> String {
        switch s {
        case "DONE": return "checkmark.circle.fill"
        case "IN_PROGRESS": return "circle.lefthalf.filled"
        case "BLOCKED": return "xmark.octagon.fill"
        default: return "circle"
        }
    }

    private func statusColor(_ s: String) -> Color {
        switch s {
        case "DONE": return .green
        case "IN_PROGRESS": return .blue
        case "BLOCKED": return .red
        default: return .secondary
        }
    }
}

// ---- Change detail -----------------------------------------------------------

struct ChangeDetailView: View {
    @EnvironmentObject private var model: AppModel
    let change: AppModel.Item
    @State private var title = ""
    @State private var intent = ""
    @State private var goal = ""
    @State private var context = ""
    @State private var scope = ""
    @State private var acceptance = ""
    @State private var priority = "normal"
    @State private var transitions: [String] = []
    @State private var handoffMarkdown = ""
    @State private var agents: [String] = []
    @State private var confirmDelete = false
    @State private var loaded = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(change.name).font(.title2.bold())
                    Text(change.status).font(.caption.monospaced())
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(Color.statusFor(change.status).opacity(0.18), in: Capsule())
                    Text("product: \(change.product.isEmpty ? "—" : change.product)")
                        .font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Text("rev \(change.revision)").font(.caption2).foregroundStyle(.secondary)
                    Button("삭제", role: .destructive) { confirmDelete = true }
                        .buttonStyle(.borderless).tint(.red)
                }

                if let err = model.lastError {
                    Label(err, systemImage: "exclamationmark.triangle").foregroundStyle(.red).font(.caption)
                }

                conflictBanner

                HStack(spacing: 8) {
                    Menu("상태 전이") {
                        ForEach(transitions, id: \.self) { t in
                            Button(t) { try? model.setStage(itemId: change.id, targetType: "changes", status: t) }
                        }
                        if transitions.isEmpty {
                            Text("전이 불가 (\(change.status) 종결 상태)").foregroundStyle(.secondary)
                        }
                    }
                    .frame(width: 110)
                    Text("현재: \(change.status)").font(.caption).foregroundStyle(.secondary)
                }

                XCard("세부 내용") {
                    VStack(spacing: 8) {
                        field("제목", $title)
                        field("Intent (왜)", $intent)
                        field("Goal (완료 후 상태)", $goal)
                        field("Context", $context)
                        field("Scope", $scope)
                        field("Acceptance", $acceptance)
                        HStack {
                            Text("Priority").font(.caption).foregroundStyle(.secondary).frame(width: 140, alignment: .leading)
                            Picker("", selection: $priority) {
                                ForEach(["low", "normal", "high", "critical"], id: \.self) { Text($0).tag($0) }
                            }.labelsHidden().frame(width: 120)
                        }
                        HStack {
                            Button("저장") { save() }
                            Button("본문(markdown) 편집") { bodyEditor() }
                        }
                    }
                }

                proposalsCard
                reviewsCard
                buildThisCard

                XCard("Agent Handoff") {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Button("Handoff 생성") { generate() }
                            Button("클립보드 복사") {
                                let pb = NSPasteboard.general
                                pb.clearContents()
                                pb.setString(handoffMarkdown, forType: .string)
                            }.disabled(handoffMarkdown.isEmpty)
                            Spacer()
                            if !agents.isEmpty {
                                Text("Agents:").font(.caption)
                                ForEach(agents, id: \.self) { a in
                                    Text(a).font(.caption2).padding(.horizontal, 6).padding(.vertical, 2)
                                        .background(.blue.opacity(0.12), in: Capsule())
                                }
                            }
                        }
                        if !handoffMarkdown.isEmpty {
                            ScrollView {
                                Text(handoffMarkdown)
                                    .font(.system(.body, design: .monospaced))
                                    .textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .frame(maxHeight: 260)
                        }
                    }
                }
            }
            .padding()
        }
        .confirmationDialog("할 일 '\(change.name)' 삭제?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("삭제", role: .destructive) { try? model.deleteChange(id: change.id) }
        }
        .onAppear(perform: load)
        .onChange(of: change.status) { _, _ in reloadTransitions() }
        .onChange(of: change.revision) { _, _ in load() }
    }

    @ViewBuilder
    private var conflictBanner: some View {
        let related = model.conflicts.filter { $0.targetId == change.id }
        if !related.isEmpty {
            XCard("확인 필요 — 동기화 충돌") {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(related) { c in
                        Text("incoming \(c.kind) (base \(c.baseRevision)) vs canonical rev \(c.canonicalRevision) — 상태가 두 곳에서 변경됐습니다")
                            .font(.caption.monospaced())
                    }
                    HStack {
                        Button("Mac 버전 유지") {
                            try? model.resolveConflictKeepCanonical(targetId: change.id)
                        }
                        Menu("내 상태 반영…") {
                            ForEach(["PLAN", "BUILD", "REVIEW", "SHIPPED"], id: \.self) { s in
                                Button(s) {
                                    if let c = related.first {
                                        try? model.resolveConflictApplyMine(conflict: c, status: s)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    @State private var destPath = "~/Desktop"
    @State private var instruction = ""
    @State private var branch = ""
    @State private var dispatchedFile: String?
    @State private var destGit: XitaBridge.GitInfo?

    private var proposalsCard: some View {
        let pending = model.proposals(for: change.id).filter { $0.status == "pending" }
        return XCard("Proposals — 결정 대기 (\(pending.count))") {
            VStack(alignment: .leading, spacing: 6) {
                if pending.isEmpty {
                    Text("Agent/Person 이 올린 Proposal 없음").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(pending) { pr in
                    if let doc = model.doc(type: "proposal", id: pr.id) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(doc.fields["name"] ?? pr.name).font(.headline)
                                Text(doc.fields["kind"] ?? "DIRECTION").font(.caption2)
                                    .padding(.horizontal, 6).padding(.vertical, 1)
                                    .background(.orange.opacity(0.18), in: Capsule())
                                Spacer()
                                Text(doc.fields["severity"] ?? "").font(.caption2).foregroundStyle(.secondary)
                            }
                            Text(doc.fields["proposal"] ?? "").font(.callout)
                            if let r = doc.fields["reason"], !r.isEmpty {
                                Text("사유: \(r)").font(.caption).foregroundStyle(.secondary)
                            }
                            HStack(spacing: 8) {
                                Button("승인") { try? model.resolveProposal(id: pr.id, status: "approved") }
                                    .buttonStyle(.borderedProminent).controlSize(.small)
                                Button("수정 지시") { try? model.resolveProposal(id: pr.id, status: "modified") }
                                    .controlSize(.small)
                                Button("거절") { try? model.resolveProposal(id: pr.id, status: "rejected") }
                                    .buttonStyle(.borderless).tint(.red).controlSize(.small)
                            }
                        }
                        .padding(6)
                        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 6))
                    }
                }
            }
        }
    }

    private func stringList(_ raw: String?) -> [String] {
        guard let raw, let data = raw.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [String] else { return [] }
        return arr
    }

    private var reviewsCard: some View {
        let revs = model.reviews(for: change.id)
        return XCard("Review Packages (\(revs.count))") {
            VStack(alignment: .leading, spacing: 6) {
                if revs.isEmpty {
                    Text("Agent 결과 없음 — 서버 /v4/changes/:id/agent-result 로 Import 가능 (CLI: xita agent-result)").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(revs) { r in
                    if let doc = model.doc(type: "review", id: r.id) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(doc.fields["name"] ?? r.name).font(.headline)
                                Spacer()
                                Text(doc.fields["assessment"] ?? "").font(.caption2).foregroundStyle(.secondary)
                                Text(r.status).font(.caption2.monospaced())
                            }
                            let delivered = stringList(doc.fields["delivered"])
                            let notDelivered = stringList(doc.fields["not_delivered"])
                            if !delivered.isEmpty {
                                Text("Delivered").font(.caption.bold()).foregroundStyle(.green)
                                ForEach(delivered, id: \.self) { Text("  ✓ \($0)").font(.caption) }
                            }
                            if !notDelivered.isEmpty {
                                Text("Not delivered").font(.caption.bold()).foregroundStyle(.orange)
                                ForEach(notDelivered, id: \.self) { Text("  ○ \($0)").font(.caption) }
                            }
                            let tests = stringList(doc.fields["tests"])
                            if !tests.isEmpty {
                                Text("Tests: \(tests.joined(separator: " · "))").font(.caption2).foregroundStyle(.secondary)
                            }
                            if r.status == "ready_for_review" {
                                HStack {
                                    Button("승인 (Apply to State §51)") { try? model.approveChange(id: change.id) }
                                        .buttonStyle(.borderedProminent).controlSize(.small)
                                    Button("재작업 요청") { try? model.requestChangesOn(id: change.id) }
                                        .controlSize(.small)
                                }
                            }
                        }
                        .padding(6)
                        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 6))
                    }
                }
            }
        }
    }

    private var buildThisCard: some View {
        XCard("Build This — Dispatch (Human Trigger)") {
            VStack(spacing: 6) {
                HStack {
                    Text("Destination").font(.caption).foregroundStyle(.secondary).frame(width: 100, alignment: .leading)
                    TextField("~/Desktop", text: $destPath).textFieldStyle(.roundedBorder)
                        .onChange(of: destPath) { _, v in destGit = model.gitInfo(dir: v) }
                    Button("...") {
                        let panel = NSOpenPanel()
                        panel.canChooseDirectories = true
                        panel.canChooseFiles = false
                        if panel.runModal() == .OK, let u = panel.url {
                            destPath = u.path
                            destGit = model.gitInfo(dir: u.path)
                        }
                    }
                }
                if let g = destGit, g.isRepo {
                    HStack(spacing: 10) {
                        Label(g.branch ?? "detached", systemImage: "arrow.triangle.branch").font(.caption2)
                        if let r = g.remote { Text(r).font(.caption2.monospaced()).foregroundStyle(.secondary).lineLimit(1) }
                        if let h = g.head { Text(String(h.prefix(8))).font(.caption2.monospaced()).foregroundStyle(.secondary) }
                    }
                    .foregroundStyle(.green)
                }
                HStack {
                    Text("Branch").font(.caption).foregroundStyle(.secondary).frame(width: 100, alignment: .leading)
                    TextField("(optional) feat/…", text: $branch).textFieldStyle(.roundedBorder)
                }
                HStack(alignment: .top) {
                    Text("Instruction").font(.caption).foregroundStyle(.secondary).frame(width: 100, alignment: .leading)
                    TextField("Agent 에게 줄 지시", text: $instruction).textFieldStyle(.roundedBorder)
                }
                HStack {
                    Button("Send Files") { dispatch(start: false) }
                    Button("Send & Start Agent") { dispatch(start: true) }
                        .buttonStyle(.borderedProminent)
                    if let f = dispatchedFile {
                        Text("→ \(f)").font(.caption2.monospaced()).foregroundStyle(.green).lineLimit(1)
                    }
                }
            }
        }
    }

    private func dispatch(start: Bool) {
        do {
            let file = try model.dispatchChange(
                change: change, destPath: destPath, instruction: instruction,
                branch: branch.isEmpty ? nil : branch, startAgent: start
            )
            dispatchedFile = file
            model.lastError = nil
        } catch {
            model.lastError = "dispatch 실패: \(error)"
        }
    }

    private func load() {
        transitions = model.validTransitions(from: change.status)
        agents = model.availableAgents()
        destGit = model.gitInfo(dir: destPath)
        guard !loaded else { return }
        loaded = true
        guard let doc = model.doc(type: "change", id: change.id) else { return }
        title = doc.fields["name"] ?? change.name
        intent = doc.fields["intent"] ?? ""
        goal = doc.fields["goal"] ?? ""
        context = doc.fields["context"] ?? ""
        scope = doc.fields["scope"] ?? ""
        acceptance = doc.fields["acceptance"] ?? ""
        priority = doc.fields["priority"] ?? "normal"
    }

    private func reloadTransitions() {
        transitions = model.validTransitions(from: change.status)
    }

    private func field(_ label: String, _ text: Binding<String>) -> some View {
        HStack {
            Text(label).font(.caption).foregroundStyle(.secondary).frame(width: 140, alignment: .leading)
            TextField(label, text: text).textFieldStyle(.roundedBorder)
        }
    }

    private func save() {
        try? model.updateChange(id: change.id, fields: [
            .init("name", title), .init("intent", intent), .init("goal", goal),
            .init("context", context), .init("scope", scope),
            .init("acceptance", acceptance), .init("priority", priority),
        ])
    }

    private func bodyEditor() {
        let doc = model.doc(type: "change", id: change.id)
        let alert = NSAlert()
        alert.messageText = "할 일 본문 (markdown 서술)"
        alert.addButton(withTitle: "저장")
        alert.addButton(withTitle: "취소")
        let scroll = NSScrollView(frame: NSRect(x: 0, y: 0, width: 520, height: 320))
        let tv = NSTextView(frame: scroll.bounds)
        tv.isRichText = false
        tv.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        tv.string = doc?.body ?? ""
        tv.isAutomaticQuoteSubstitutionEnabled = false
        scroll.documentView = tv
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        alert.accessoryView = scroll
        if alert.runModal() == .alertFirstButtonReturn {
            try? model.saveBody(type: "change", id: change.id, body: tv.string)
        }
    }

    private func generate() {
        guard !change.product.isEmpty else {
            model.lastError = "제품 연결이 없습니다 — 제품 정보에서 할 일을 만드세요"
            return
        }
        do {
            handoffMarkdown = try model.handoff(product: change.product, change: change.id)
        } catch {
            model.lastError = "\(error)"
        }
    }
}

extension Color {
    static func statusFor(_ status: String) -> Color {
        switch status {
        case "SHIPPED": return .green
        case "REVIEW", "SHIP_READY": return .orange
        case "BUILD": return .blue
        case "PLAN": return .purple
        case "CANCELLED": return .gray
        default: return .secondary
        }
    }
}

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
                    Text(item.status).font(.caption.monospaced())
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
                    HStack { Button("저장") { try? model.saveBody(type: "workbench", id: item.id, body: bodyText) } }
                        .padding(.top, 4)
                }
                if item.isStale && item.status != "promoted" {
                    XCard("오래된 항목 — 정리 제안 (자동 삭제 없음)") {
                        HStack {
                            Text("30일 이상 변경이 없습니다").font(.caption).foregroundStyle(.secondary)
                            Spacer()
                            Button("유지") { try? model.keepWorkbench(id: item.id) }.controlSize(.small)
                            Button("아카이브") { try? model.archiveWorkbench(id: item.id) }
                                .controlSize(.small).tint(.orange)
                        }
                    }
                }
                XCard("승격 (Promote) — Human Trigger") {
                    VStack(alignment: .leading, spacing: 8) {
                        Picker("", selection: $promoteAsChange) {
                            Text("기존 제품의 할 일로").tag(true)
                            Text("새 Product 로").tag(false)
                        }.labelsHidden().pickerStyle(.radioGroup).horizontalRadioGroupLayout()
                        if promoteAsChange {
                            Picker("Product", selection: $selectedProductId) {
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
                                TextField("새 Product 이름", text: $promoteProductName)
                                    .textFieldStyle(.roundedBorder)
                                Button("승격") {
                                    let n = promoteProductName.trimmingCharacters(in: .whitespaces)
                                    guard !n.isEmpty else { return }
                                    try? model.promoteWorkbench(id: item.id, toNewProductNamed: n)
                                    promoteProductName = ""
                                }
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .confirmationDialog("Workbench 항목 삭제?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("삭제", role: .destructive) { try? model.deleteWorkbench(id: item.id) }
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
        try? model.promoteWorkbench(id: item.id, toProductChange: selectedProductId, title: t.isEmpty ? item.name : t)
        promoteProductName = ""
    }
}

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

                XCard("Ship Templates (§20)") {
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
                            Text("Launch 는 opt-in — Send & Start 에서만 실행됩니다 (§16/§22)")
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


/// Linear 스타일 마일스톤 행: focus(◆ 강조)·가중 진행률·target date·overdue·change 그룹핑
struct MilestoneRow: View {
    @EnvironmentObject private var model: AppModel
    let ms: AppModel.MilestoneInfo
    let all: [AppModel.Item]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                if ms.isFocus { Image(systemName: "largecircle.fill.circle").foregroundStyle(.yellow) }
                Text(ms.name).font(.headline)
                XUI.statusChip(ms.status)
                if let t = ms.targetDate {
                    Text(String(t.prefix(10))).font(.caption2.monospaced())
                        .foregroundStyle(ms.isOverdue ? Color.red : Color.secondary)
                    if ms.isOverdue { Text("기한 초과").font(.caption2).foregroundStyle(.red) }
                }
                Spacer()
                Text("\(ms.progress)%").font(.caption.monospaced()).foregroundStyle(.secondary)
                Menu("…") {
                    Button("planned") { try? model.setMilestoneStatus(id: ms.milestoneId, status: "planned") }
                    Button("active") { try? model.setMilestoneStatus(id: ms.milestoneId, status: "active") }
                    Button("완료 처리") { try? model.setMilestoneStatus(id: ms.milestoneId, status: "done") }
                }
                .menuStyle(.borderlessButton).frame(width: 30)
            }
            ProgressView(value: Double(ms.progress), total: 100)
                .tint(ms.isOverdue ? .red : ms.progress == 100 ? .green : .accentColor)
            /* Shape Up 베팅: 이 마일스톤에 건 주수 합 — 사람이 보폭을 보는 유일한 숫자 */
            let betWeeks = ms.changes.reduce(0) { $0 + (Int(model.docFields(type: "change", id: $1.id)["appetite_weeks"] ?? "") ?? 0) }
            if betWeeks > 0 {
                HStack(spacing: 4) {
                    Text("베팅 \(betWeeks)w").font(.caption2.monospaced())
                        .foregroundStyle(betWeeks > 8 ? Color.red : Color.secondary)
                    if betWeeks > 8 { Text("과베팅 — 하나를 PAUSED로 빼거나 쪼개세요").font(.caption2).foregroundStyle(.red) }
                }
            }
            if ms.changes.isEmpty {
                Text("변경 없음 — 아래 목록에서 할당하세요").font(.caption2).foregroundStyle(.tertiary)
            }
            ForEach(ms.changes) { c in
                HStack(spacing: 6) {
                    Image(systemName: c.status == "SHIPPED" ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(c.status == "SHIPPED" ? Color.green : Color.secondary)
                        .font(.caption)
                    Text(c.name).font(.callout)
                    Spacer()
                    Text(c.status).font(.caption2.monospaced()).foregroundStyle(.secondary)
                    Menu("마일스톤") {
                        Button("해제") { try? model.setMilestone(changeId: c.id, milestoneId: nil) }
                    }
                    .menuStyle(.borderlessButton).frame(width: 64)
                }
                .padding(.leading, 4)
            }
            Text("완료 \(ms.changes.filter { $0.status == "SHIPPED" }.count)/\(ms.changes.count) · 가중 진행률(started부터)").font(.caption2).foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}

// ---- Dispatch 상태 색 / Scorecard 채점 폼 (research wave1-2 반영) --------------

func dispatchStatusColor(_ s: String) -> Color {
    switch s.uppercased() {
    case "AWAITING_INPUT": return .red
    case "RESULT_READY": return .orange
    case "FAILED": return .red
    case "MERGED": return .green
    case "WORKING": return .blue
    case "CANCELLED": return .secondary
    default: return .secondary // DISPATCHED
    }
}

/// Aha scorecard — 5메트릭(0-10) 채점. 총점은 파생, 원시값만 저장된다.
/// "가장 높은 점수가 곧 다음 일은 아니다" (Aha 문서) → 점수는 정렬 근거일 뿐 판단은 사람.
struct ScoreEditorMenu: View {
    let changeId: String
    @State private var show = false
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Button("채점") { show = true }
            .buttonStyle(.borderless)
            .popover(isPresented: $show, arrowEdge: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Value Scorecard").font(.headline)
                    scoreSlider("도달 범위 (Population)", key: "s_pop")
                    scoreSlider("긴급성 (Need)", key: "s_need")
                    scoreSlider("전략 적합 (Strategy)", key: "s_strat")
                    scoreSlider("노력 (Effort, 낮을수록 저렴)", key: "s_effort")
                    scoreSlider("확신 (Confidence)", key: "s_conf")
                    if let sc = model.valueScore(changeId) {
                        Text("파생 점수: \(String(format: "%.1f", sc)) · (P+N+S−E)×C")
                            .font(.caption.monospaced())
                    }
                    HStack {
                        Button("저장") { save(); show = false }
                        Button("취소") { show = false }
                    }
                }
                .padding(12)
                .frame(width: 320)
            }
    }

    private func scoreSlider(_ label: String, key: String) -> some View {
        HStack {
            Text(label).font(.caption).frame(width: 180, alignment: .leading)
            Slider(value: binding(key), in: 0...10, step: 1)
            Text("\(Int(binding(key).wrappedValue))").font(.caption.monospaced()).frame(width: 20)
        }
    }

    private func binding(_ key: String) -> Binding<Double> {
        if cache[key] == nil {
            cache[key] = Double(model.docFields(type: "change", id: changeId)[key] ?? "5") ?? 5
        }
        return Binding(get: { cache[key] ?? 5 }, set: { cache[key] = $0 })
    }

    @State private var cache: [String: Double] = [:]

    private func save() {
        try? model.scoreChange(
            changeId: changeId,
            pop: Int(cache["s_pop"] ?? 5), need: Int(cache["s_need"] ?? 5),
            strat: Int(cache["s_strat"] ?? 5), effort: Int(cache["s_effort"] ?? 5),
            conf: Int(cache["s_conf"] ?? 5)
        )
    }
}

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
            Text("새 Product — 시작하기").font(.title3.bold())
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
                    try? model.createProduct(name: n, productType: template.isEmpty ? nil : template)
                    let why: [AppModel.KV] = [
                        AppModel.KV("current_goal", goal.isEmpty ? (skipWhy ? "" : goal) : goal),
                        AppModel.KV("direction", worldDelta),
                    ].filter { !$0.value.isEmpty }
                    if !why.isEmpty { try? model.updateProduct(id: slug(n), fields: why) }
                    dismiss()
                }
                .keyboardShortcut(.defaultAction)
                .disabled(name.trimmingCharacters(in: .whitespaces).count < 2)
            }
        }
        .padding(16)
        .frame(width: 420)
    }
}

// ---- 보드 구성품 (research synthesis: Shape Up betting × Linear stage flow) ----

struct BoardColumn: View {
    @EnvironmentObject private var model: AppModel
    let stage: String
    let changes: [AppModel.Item]
    let all: [AppModel.MilestoneInfo]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle().fill(XUI.statusColor(stage)).frame(width: 8, height: 8)
                Text(stage == "SHIP_READY" ? "SHIP READY" : stage).font(.caption.bold().monospaced())
                Text("\(changes.count)").font(.caption).foregroundStyle(.secondary)
                Spacer()
                /* 베팅 용량: 이 열에 쌓인 주수 합 — Shape Up "같은 사이클에 다 넣으면 죽는다" */
                let weeks = changes.reduce(0) { $0 + (Int(model.docFields(type: "change", id: $1.id)["appetite_weeks"] ?? "") ?? 0) }
                if weeks > 0 {
                    Text("\(weeks)w").font(.caption2.monospaced())
                        .foregroundStyle(weeks > 6 ? Color.red : Color.secondary)
                        .help("Σ appetite weeks — 6주를 넘으면 과베팅 신호")
                }
            }
            .padding(.horizontal, 4)
            if changes.isEmpty {
                Text("비어있음")
                    .font(.caption2).foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 18)
                    .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 8))
            }
            ForEach(changes) { c in
                BoardCard(change: c, milestones: all)
            }
            Spacer(minLength: 0)
        }
        .frame(width: 210, alignment: .top)
        .padding(6)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }
}

struct BoardCard: View {
    @EnvironmentObject private var model: AppModel
    let change: AppModel.Item
    let milestones: [AppModel.MilestoneInfo]

    private var fields: [String: String] { model.docFields(type: "change", id: change.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(change.name).font(.callout).lineLimit(2)
            HStack(spacing: 4) {
                if let score = model.valueScore(change.id) {
                    Text(String(format: "%.1f", score))
                        .font(.caption2.monospaced().bold())
                        .padding(.horizontal, 4).padding(.vertical, 1)
                        .background(.green.opacity(0.15), in: Capsule())
                }
                if let app = fields["appetite"], !app.isEmpty {
                    Text(app.lowercased() + (fields["appetite_weeks"].map { "/\($0)w" } ?? ""))
                        .font(.caption2).foregroundStyle(.secondary)
                        .padding(.horizontal, 4).padding(.vertical, 1)
                        .background(.quaternary.opacity(0.5), in: Capsule())
                }
                if let days = model.staleDays("change", change.id), days > 30 {
                    Image(systemName: "hourglass").font(.caption2).foregroundStyle(.orange)
                        .help("\(days)일째 이 단계에 정체")
                }
                Spacer()
            }
            if let mid = fields["milestone_id"], let hit = milestones.first(where: { $0.milestoneId == mid }) {
                HStack(spacing: 3) {
                    Image(systemName: hit.isOverdue ? "exclamationmark.triangle" : "flag")
                        .font(.caption2)
                        .foregroundStyle(hit.isOverdue ? Color.red : Color.accentColor)
                    Text(hit.name).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            if (fields["intent"] ?? "").isEmpty && (fields["goal"] ?? "").isEmpty {
                Label("WHY 없음", systemImage: "questionmark.diamond")
                    .font(.caption2).foregroundStyle(.yellow)
                    .help("BUILD 이상에서 목적 없으면 Needs You에 승격됩니다 — 우클릭 → 목적 채우기")
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: XUI.cardRadius))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(.separator.opacity(0.5)))
        .contextMenu {
            /* 유효 전이만 노출 — Rust lifecycle 단일소스와 동일 검증 */
            ForEach(model.validTransitions(from: change.status).filter { ["IDEA", "PLAN", "BUILD", "REVIEW", "SHIP_READY", "SHIPPED", "PAUSED", "CANCELLED"].contains($0) }, id: \.self) { to in
                Button("→ \(to)") { try? model.setStage(itemId: change.id, targetType: "changes", status: to) }
            }
            Divider()
            Menu("마일스톤") {
                Button("해제") { try? model.setMilestone(changeId: change.id, milestoneId: nil) }
                ForEach(milestones.filter { $0.status != "done" }) { m in
                    Button(m.name) { try? model.setMilestone(changeId: change.id, milestoneId: m.milestoneId) }
                }
            }
        }
    }
}

// ---- 계획(Plan) 3레인 구성품 — Canny 레인헤더/AnnounceKit 빈레인/Plane 퀵애드 통합 ----

struct PlanLane<Content: View>: View {
    let title: String
    let subtitle: String
    let count: Int
    let weeks: Int
    let overdue: Bool
    var done: Double? = nil
    @ViewBuilder let rows: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(title).font(.subheadline.bold())
                    Text("\(count)").font(.caption.monospaced()).foregroundStyle(.secondary)
                    Spacer()
                    if weeks > 0 {
                        Text("Σ \(weeks)w").font(.caption2.monospaced())
                            .foregroundStyle(weeks > 8 ? Color.red : Color.secondary)
                            .help("이 레인에 건 주수 합 — 8주 초과 = 과베팅")
                    }
                }
                Text(subtitle).font(.caption2).foregroundStyle(overdue ? Color.red : .secondary).lineLimit(2)
                if let d = done {
                    ProgressView(value: d, total: 100).tint(overdue ? .red : .accentColor)
                }
            }
            .padding(8)
            .background(.quaternary.opacity(0.25), in: RoundedRectangle(cornerRadius: 8))

            if count == 0 {
                Text("여기엔 아직 없음")
                    .font(.caption2).foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(.quaternary.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
            }
            rows()
        }
        .frame(width: 280, alignment: .top)
        .padding(6)
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }
}

/// 계획 레인 안의 할 일 행 — 클릭 1회당 액션이 인라인 (화면 이동 없음)
struct PlanChangeRow: View {
    @EnvironmentObject private var model: AppModel
    let change: AppModel.Item
    let milestones: [AppModel.MilestoneInfo]

    private var fields: [String: String] { model.docFields(type: "change", id: change.id) }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: change.status == "SHIPPED" ? "checkmark.circle.fill" : "circle")
                .font(.caption)
                .foregroundStyle(change.status == "SHIPPED" ? Color.green : Color.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text(change.name).font(.callout).lineLimit(1)
                HStack(spacing: 4) {
                    Text(XUI.termStatus(change.status)).font(.caption2).foregroundStyle(.secondary)
                    if let score = model.valueScore(change.id) {
                        Text(String(format: "%.1f", score)).font(.caption2.monospaced()).foregroundStyle(.green)
                    }
                    if let app = fields["appetite"], !app.isEmpty {
                        Text(app.lowercased() + (fields["appetite_weeks"].map { "/\($0)w" } ?? ""))
                            .font(.caption2).foregroundStyle(.tertiary)
                    }
                }
            }
            Spacer()
        }
        .padding(6)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 8))
        .contentShape(Rectangle())
        .contextMenu {
            Button("완료 표시") { try? model.setStage(itemId: change.id, targetType: "changes", status: "SHIPPED") }
            Button("여기서 잠시 멈춤") { try? model.setStage(itemId: change.id, targetType: "changes", status: "PAUSED") }
            Divider()
            Menu("마일스톤 옮기기") {
                Button("나중(Later)으로") { try? model.setMilestone(changeId: change.id, milestoneId: nil) }
                ForEach(milestones) { m in
                    Button(m.name) { try? model.setMilestone(changeId: change.id, milestoneId: m.milestoneId) }
                }
            }
        }
    }
}

/// Plane 퀵애드 원칙: "타이틀 입력 + Enter 즉시 생성, 나중에 다듬기" — 모달/폼 강제 없음
struct QuickAddChangeRow: View {
    @EnvironmentObject private var model: AppModel
    let productId: String
    let milestoneId: String?
    @State private var text = ""

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "plus").font(.caption).foregroundStyle(.tertiary)
            TextField("할 일 추가 — Enter", text: $text)
                .textFieldStyle(.plain).font(.callout)
                .onSubmit {
                    let t = text.trimmingCharacters(in: .whitespaces)
                    guard t.count >= 2 else { return }
                    try? model.createChange(productId: productId, title: t)
                    if let m = milestoneId,
                       let made = model.items.first(where: { $0.type == "changes" && $0.name == t }) {
                        try? model.setMilestone(changeId: made.id, milestoneId: m)
                    }
                    text = ""
                }
        }
        .padding(8)
        .background(.quaternary.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
    }
}

/// ⌘K 커맨드 팔레트 — 대상 직점프 + Ask 즉시 실행 (Linear/CrystalSpec/Raycast 공통 패턴 이식)
struct CommandPalette: View {
    @EnvironmentObject private var model: AppModel
    @Binding var selection: AppModel.Selection?
    let close: () -> Void
    @State private var q = ""
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
                    .onSubmit {
                        if let first = results.first { jump(first) }
                        else if looksLikeQuestion { askNow() }
                    }
                if looksLikeQuestion {
                    Button("Ask 실행 ↵") { askNow() }.buttonStyle(.borderedProminent).controlSize(.small)
                }
                Button("esc") { close() }.buttonStyle(.borderless).font(.caption)
            }
            .padding(12)
            Divider()
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 1) {
                    if q.isEmpty {
                        paletteHint("⌘K — 이름으로 도약. 질문은 Enter 한 번으로.")
                    }
                    ForEach(results) { it in
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
}
