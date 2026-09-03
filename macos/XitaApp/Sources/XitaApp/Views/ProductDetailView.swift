import SwiftUI
import AppKit
import XitaCoreBridge

/// XITA macOS — ProductDetailView (ContentView 분해, 2026-09 구조 리팩토링)
/// 동작 변경 없음: 상위 선언 단위 이동만. 원본 이력은 git log ContentView.swift.


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
            VStack(alignment: .leading, spacing: 16) {
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
        .confirmationDialog("제품 '\(product.name)'을(를) 삭제?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("삭제", role: .destructive) {
                do { try model.deleteProduct(id: product.id) }
                catch { model.lastError = "삭제하지 못했습니다 — \(error)" }
            }
        }
    }

    private var header: some View {
        HStack {
            Text(product.name).font(.title2.bold())
            Text(XUI.termStatus(product.status)).font(.caption.monospaced())
                .padding(.horizontal, 8).padding(.vertical, 2)
                .background(.quaternary, in: Capsule())
            if let v = model.profile(product.id)["version"] { Text(v).font(.caption).foregroundStyle(.secondary) }
            Spacer()
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
            healthChip("출시 준비", h.launchReadiness >= 80 ? "healthy" : h.launchReadiness >= 40 ? "warning" : "critical", value: "\(h.launchReadiness)%")
            healthChip("컨텍스트", h.contextDrift == 0 && h.pendingProposals == 0 ? "healthy" : "warning", value: "어긋남 \(h.contextDrift)·제안 \(h.pendingProposals)")
        }
        XCard("다음 출시 \u{2014} \(h.nextRelease ?? "계획 없음")") {
            VStack(alignment: .leading, spacing: 4) {
                if let nr = model.nextRelease(product.id) {
                    let rr = model.releaseReadiness(nr.id, productId: product.id)
                    Text("\(nr.name) · \(XUI.termStatus(nr.status)) — 할 일 \(rr.shipped)/\(rr.total)")
                    ForEach(rr.blockers, id: \.self) { Label($0, systemImage: "lock.fill").font(.caption).foregroundStyle(.red) }
                } else {
                    Text("출시 기록 탭에서 계획을 만드세요").font(.caption).foregroundStyle(.secondary)
                }
            }
            .padding(4)
        }
        XCard("지금 진행 중") {
            VStack(alignment: .leading, spacing: 4) {
                let act = model.changes(for: product.id).filter { ["BUILD", "REVIEW", "SHIP_READY"].contains($0.status) }
                if act.isEmpty { Text("지금 진행 중인 할 일 없음").font(.caption).foregroundStyle(.secondary) }
                ForEach(act) { c in
                    HStack { Text(c.name); Spacer(); Text(XUI.termStatus(c.status)).font(.caption2.monospaced()) }
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

    // ---- Roadmap (milestone × change — Linear projects 스타일) -------------------
    @State private var newMilestoneName = ""
    @State private var newMilestoneDate = ""
    @State private var newMilestoneDesc = ""

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
                    subtitle: focus.map { ($0.desc.isEmpty ? $0.name : $0.desc) + ($0.targetDate.map { " · \(String($0.prefix(10)))까지" } ?? "") } ?? "마일스톤이 없으면 여기서 만드세요",
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
                        Button("+ 첫 마일스톤 만들기") { showMilestoneForm = true }
                            .controlSize(.small)
                            .popover(isPresented: $showMilestoneForm) { milestoneForm }
                        Text("마일스톤은 \"이걸 끝내면 여기 지나갑니다\"라는 약속입니다")
                            .font(.caption2).foregroundStyle(.tertiary)
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
            TextField("이 마일스톤은 무엇을 끝내면 지나는 단계인가?", text: $newMilestoneDesc)
            TextField("목표일 2026-10-01 (선택)", text: $newMilestoneDate)
            Button("추가") {
                let n = newMilestoneName.trimmingCharacters(in: .whitespaces)
                guard !n.isEmpty else { return }
                do { try model.createMilestone(productId: product.id, name: n,
                                           targetDate: newMilestoneDate.isEmpty ? nil : newMilestoneDate,
                                           desc: newMilestoneDesc.isEmpty ? nil : newMilestoneDesc) }
                catch { model.lastError = "마일스톤을 만들지 못했습니다 — \(error)" }
                newMilestoneName = ""; newMilestoneDate = ""; newMilestoneDesc = ""; showMilestoneForm = false
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
                    // 운영 상태: 값은 정본(영문) 유지, 라벨만 사용자어 — label≠schema
                    Picker("", selection: $prodStatus) {
                        Text("운영 중").tag("PRODUCTION")
                        Text("베타").tag("BETA")
                        Text("개발 중").tag("DEVELOPMENT")
                        Text("관리 모드").tag("MAINTENANCE")
                    }.labelsHidden().frame(width: 160)
                }
                fieldRow("플랫폼", $platforms, "iOS · Android · 웹 · API — 세미콜론으로 나열")
                VStack(alignment: .leading, spacing: 2) {
                    Text("배포처 — 한 줄에 환경·대상·주소").font(.caption).foregroundStyle(.secondary)
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
                        do {
                            try model.updateProfile(id: product.id, fields: [
                                .init("production_status", prodStatus),
                                .init("platforms", platforms),
                                .init("deployments", deployments.replacingOccurrences(of: "\n", with: ";")),
                                .init("repo", repo),
                                .init("vision", vision),
                            ])
                        } catch { model.lastError = "저장하지 못했습니다 — \(error)" }
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
        XCard("현재 배포 현황 (실측)") {
            VStack(alignment: .leading, spacing: 3) {
                let p = model.profile(product.id)
                Text("Production 버전: \(p["version"] ?? "-")")
                    .font(.headline)
                let deps = (p["deployments"] ?? "").split(separator: ";").map(String.init)
                ForEach(deps, id: \.self) { line in
                    Text("  · \(line)").font(.caption.monospaced())
                }
                if deps.isEmpty { Text("배포처 미기록").font(.caption).foregroundStyle(.secondary) }
                Text("플랫폼: \(p["platforms"] ?? "-") · 코드 저장소: \(p["repo"] ?? "-")")
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
        XCard("예정된 할 일 — 다음에 만들 것") {
            VStack(alignment: .leading, spacing: 4) {
                let plan = model.roadmap(product.id)
                if plan.isEmpty { Text("예정 없음 — 메모 승격 또는 아래에서 생성").font(.caption).foregroundStyle(.secondary) }
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
                        Text(docPriority(c.id)).font(.caption2)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(.blue.opacity(0.12), in: Capsule())
                        Menu("우선순위") {
                            let prios: [(String,String)] = [("critical","최우선"),("high","높음"),("normal","보통"),("low","나중")]
 ForEach(prios, id: \.0) { pair in
                                Button(pair.1) { try? model.setPriority(changeId: c.id, priority: pair.0) }
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
                            Text(XUI.termStatus(c.status)).font(.caption2.monospaced())
                            Button("열기") {}
                                .buttonStyle(.link)
                        }
                        HStack(spacing: 6) {
                            let msId = model.docFields(type: "change", id: c.id)["milestone_id"] ?? ""
                            Text(msId.isEmpty ? "마일스톤 없음" : (model.item("milestones", msId)?.name ?? "마일스톤"))
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
                        do { try model.createChange(productId: product.id, title: t) }
                        catch { model.lastError = "할 일을 만들지 못했습니다 — \(error)" }
                        newChangeTitle = ""
                    }
                }
            }
        }
    }

    private func docPriority(_ changeId: String) -> String {
        switch model.docFields(type: "change", id: changeId)["priority"] ?? "normal" {
        case "critical": return "최우선"
        case "high": return "높음"
        case "low": return "나중"
        default: return "보통"
        }
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
                    do { try model.createRelease(productId: product.id, name: n, notes: newReleaseNotes) }
                    catch { model.lastError = "출시를 만들지 못했습니다 — \(error)" }
                    newReleaseName = ""
                    newReleaseNotes = ""
                }
            }
        }
        /* 출시 기록 = changelog 형식 (Raycast/AnnounceKit VERIFIED 패턴: 월 헤더 + 버전칩)
         * 변경 전 정책: 릴리스 카드 나열 — '언제 무엇을 세상에 냈나'의 시간 구조가 없음
         * 변경 후 정책: release_date(없으면 생성시점) 기준 내림차순 + `YYYY년 M월` 헤더 그룹.
         *   출시 기록 표면에만 날짜를 둔다(계획 레인은 날짜 금지 규칙의 대칭)
         * 영향 범위: 렌더만. release 문서 필드 무변경 */
        let rels = model.releases(for: product.id)
        let grouped = Dictionary(grouping: rels) { r in
            let f = model.docFields(type: "release", id: r.id)
            // 날짜 우선순위: 실제 출시 → 목표일 → 생성일 (빈 문자열은 건너뜀)
            let d = ["released_at", "release_date", "target_date", "created_at"]
                .compactMap { f[$0] }.first { !$0.isEmpty } ?? ""
            return String(d.prefix(7))
        }
        ForEach(grouped.keys.sorted(by: >), id: \.self) { month in
            if !month.isEmpty {
                Text(monthLabel(month)).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                    .padding([.top, .leading], 4)
            }
            ForEach(grouped[month] ?? []) { r in
                releaseCard(r)
            }
        }
    }

    private func monthLabel(_ ym: String) -> String {
        let parts = ym.split(separator: "-")
        guard parts.count == 2, let m = Int(parts[1]) else { return ym }
        return "\(parts[0])년 \(m)월"
    }

    private func releaseCard(_ r: AppModel.Item) -> some View {
        let rr = model.releaseReadiness(r.id, productId: product.id)
        let included = model.releaseChangeIds(r.id)
        return XCard {
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(r.name).font(.headline.monospaced())
                    Text(XUI.termStatus(r.status)).font(.caption.monospaced())
                        .padding(.horizontal, 6).padding(.vertical, 1)
                        .background(r.status == "RELEASED" ? Color.green.opacity(0.18) : .orange.opacity(0.15), in: Capsule())
                    // 절대 날짜 — 출시 카드에만 (Raycast: 버전칩 + 날짜)
                    if let rd = model.docFields(type: "release", id: r.id)["released_at"]?.prefix(10), !rd.isEmpty {
                        Text(String(rd)).font(.caption2.monospaced()).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Menu("상태 변경") {
                        let states: [(String,String)] = [("PLANNED","예정"),("PREPARING","준비 중"),("READY","제출 대기"),("SUBMITTED","제출됨"),("RELEASED","나갔음 ✓"),("ROLLED_BACK","되돌림")]
 ForEach(states, id: \.0) { pair in
                            Button(pair.1) { try? model.setReleaseStatus(id: r.id, status: pair.0) }
                        }
                    }
                    .frame(width: 90)
                }
                // 정체: 메모가 이 릴리스의 한 줄 설명이다
                if let note = model.docFields(type: "release", id: r.id)["notes"], !note.isEmpty {
                    Text(String(note.prefix(60))).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Text("할 일 \(rr.shipped)/\(rr.total) 완료 \(rr.ready ? "· 출시 가능 ✓" : "· 준비 대기")")
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
                        do { try model.addChangeToRelease(releaseId: r.id, changeId: includeChange) }
                        catch { model.lastError = "추가하지 못했습니다 — \(error)" }
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
        relatedSection("문서 — 릴리즈 노트·스펙", type: "artifacts")
        relatedSection("참조/자산", type: "references")
        XCard("자취 — 최근 기록") {
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
        return XCard("지식 — 관찰/가설 (\(ins.count))") {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    TextField("무엇을 관찰/가정했나", text: $insTitle)
                    Picker("", selection: $insKind) {
                        ForEach(["OBSERVATION", "INTERVIEW", "SECONDARY", "DERIVED", "RETRO", "OPPORTUNITY", "ASSUMPTION"], id: \.self) { k in
                            Text(XUI.termKind(k)).tag(k)
                        }
                    }
                    .labelsHidden().frame(width: 140)
                    Button("추가") {
                        guard insTitle.count >= 2, insContent.count >= 4 else { return }
                        do { try model.addInsight(productId: product.id, title: insTitle, kind: insKind, content: insContent) }
                        catch { model.lastError = "기록하지 못했습니다 — \(error)" }
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
                        Text(XUI.termKind(model.docFields(type: "insight", id: i.id)["kind"] ?? "?"))
                            .font(.caption2).foregroundStyle(.secondary)
                        if let body = model.doc(type: "insight", id: i.id)?.body.split(separator: "\n").first(where: { !$0.hasPrefix("#") }), !body.isEmpty {
                            Text(String(body.prefix(30))).font(.caption2).foregroundStyle(.tertiary).lineLimit(1)
                        }
                        Spacer()
                        Button(XUI.termStatus(i.status)) { try? model.cycleInsightStatus(id: i.id) }
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
                        do { try model.addDecision(productId: product.id, title: decTitle, decision: decDecision, reason: "") }
                        catch { model.lastError = "기록하지 못했습니다 — \(error)" }
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
                        do { try model.addCapability(productId: product.id, name: n) }
                        catch { model.lastError = "기능을 추가하지 못했습니다 — \(error)" }
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
                    Button("출시 기준 템플릿 적용") {
                        do { _ = try model.applyShipTemplate(productId: product.id) }
                        catch { model.lastError = "템플릿을 적용하지 못했습니다 — \(error)" }
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
                        Text(XUI.termStatus(r.status)).font(.caption2.monospaced()).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}
