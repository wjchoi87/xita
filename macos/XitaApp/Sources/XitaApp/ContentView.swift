import SwiftUI
import AppKit
import XitaCoreBridge

/// XITA macOS — ContentView (ContentView 분해, 2026-09 구조 리팩토링)
/// 동작 변경 없음: 상위 선언 단위 이동만. 원본 이력은 git log ContentView.swift.

import SwiftUI
import XitaCoreBridge
import AppKit

/// XITA macOS — selection 기반 Human Control Plane (v0.5 §4, v0.3 §0.4).
struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    @State private var selection: AppModel.Selection? = .home
    /// '할 일' 섹션 펼침 상태 — 제품 수에 비례해 길어지므로 기본 접힘, 사용자가 연 상태는 보존
    @AppStorage("xita.sidebar.tasksExpanded") private var tasksExpanded = false
    @State private var newProductName = ""
    @State private var newProductTemplate = ""
    @State private var showNewProduct = false


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

    /* 사이드바 구조 (2026-10 내비게이션 감사)
     * 변경 전 정책: 홈은 selection == nil 일 때만 보임(돌아갈 항목 없음) · 에이전트/없음 행은 .tag(nil) 죽은 클릭에
     *   원시 상태코드("에이전트 RUNNING") 노출 · '할 일' 섹션 항상 펼침 · 설정이 메모함 위 무제목 섹션
     * 변경 후 정책: 맨 위 '홈' 고정 항목(.home) · 에이전트 대기 행 → 에이전트 화면 이동, 상태는 XUI.termStatus 한국어 ·
     *   '없음' 행은 선택 불가(tag 없음) · 제품은 portfolio 값별 그룹(없으면 기타, 보관됨은 맨 끝) ·
     *   '할 일' 섹션 접기/펼치기(기본 접힘, 상태는 AppStorage 보존) · 메모함 다음 맨 아래 '앱' 섹션에 설정
     * 변경 이유: 언제든 홈 복귀, 클릭하면 반드시 어딘가로 가는 행, 제품 수에 비례해 커지는 목록 제어
     * 영향 범위: 사이드바 표시·선택만. 데이터/스키마 무변경 */
    private var sidebar: some View {
        List(selection: $selection) {
            Section {
                Label("홈", systemImage: "house")
                    .tag(AppModel.Selection.home)
            }
            Section("내가 결정할 일 (\(model.needsYouCount))") {
                if model.conflicts.isEmpty && reviewChanges.isEmpty && model.waitingDispatches.isEmpty && model.pendingProposals.isEmpty {
                    // tag 없음 = 선택 불가 행 (죽은 클릭 방지)
                    Label("없음 — 괜찮습니다", systemImage: "checkmark.circle")
                        .foregroundStyle(.secondary)
                }
                /* dispatch 대기 = "에이전트가 나를 기다린다" — 방치하면 조용히 죽는 병목 (VK Needs Attention) */
                ForEach(model.waitingDispatches) { d in
                    Label("에이전트 \(XUI.termStatus(d.status)): \(d.name)", systemImage: "bubble.exclamation")
                        .foregroundStyle(d.status.uppercased() == "AWAITING_INPUT" ? Color.red : Color.orange)
                        .tag(AppModel.Selection.agents)
                }
                ForEach(model.conflicts) { c in
                    Label("어긋남: \(model.item("changes", c.targetId)?.name ?? c.targetId)", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .tag(AppModel.Selection.change(c.targetId))
                }
                ForEach(model.pendingProposals) { pr in
                    Label("제안: \(pr.name)", systemImage: "arrow.triangle.turn.up.right.diamond")
                        .foregroundStyle(.purple)
                        .tag(AppModel.Selection.change(pr.id.hasSuffix("-") ? String(pr.id.dropLast()) : pr.id))
                }
                ForEach(reviewChanges) { c in
                    Label(c.name, systemImage: "eye")
                        .tag(AppModel.Selection.change(c.id))
                }
            }
            Section("제품") {
                let groups = PortfolioLogic.groups(model.portfolioCards)
                // portfolio 필드가 하나도 없으면(그룹 = 기타 1개 또는 0개) 기존처럼 평면 목록
                if groups.isEmpty || (groups.count == 1 && groups[0].name == PortfolioLogic.otherGroup) {
                    ForEach(model.products) { p in productRow(p) }
                } else {
                    ForEach(groups, id: \.name) { g in
                        Text(g.name)
                            .font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                        ForEach(g.cards) { c in
                            if let p = model.item("products", c.id) { productRow(p) }
                        }
                    }
                }
                HStack {
                    TextField("+ 새 제품", text: $newProductName)
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
            Section(isExpanded: $tasksExpanded) {
                ForEach(activeChanges) { c in
                    VStack(alignment: .leading, spacing: 1) {
                        Text(c.name)
                        Text("\(model.item("products", c.product)?.name ?? c.product) · \(XUI.termStatus(c.status))")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    .tag(AppModel.Selection.change(c.id))
                }
            } header: {
                Text("할 일 (\(activeChanges.count))")
            }
            Section("에이전트") {
                Label("에이전트 위임 · 어긋남 감시", systemImage: "cpu")
                    .tag(AppModel.Selection.agents)
                HStack {
                    Text(model.availableAgents().isEmpty ? "감지된 에이전트: 없음" : "감지된 에이전트: \(model.availableAgents().joined(separator: ", "))")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
            Section("메모함") {
                ForEach(model.workbenchItems.filter { !["promoted", "archived"].contains($0.status) }) { w in
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(w.name)
                            Text(XUI.termStatus(w.status)).font(.caption2).foregroundStyle(.secondary)
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
            Section("앱") {
                Label("설정", systemImage: "gearshape")
                    .tag(AppModel.Selection.settings)
            }
        }
    }

    private func productRow(_ p: AppModel.Item) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(p.name)
                Text("\(model.changes(for: p.id).count)개의 할 일")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            Spacer()
            // 카드와 같은 기준: 운영 상태(production_status)가 있으면 그것, 없으면 문서 status
            let status = model.portfolioCard(p.id).map(\.productionStatus).flatMap { $0.isEmpty ? nil : $0 } ?? p.status
            Text(XUI.termStatus(status)).font(.caption2.monospaced()).foregroundStyle(.secondary)
        }
        .tag(AppModel.Selection.product(p.id))
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
        case .home?, nil:
            PortfolioSummaryView(review: reviewChanges, selection: $selection)
        }
    }
}

private struct DeletedPlaceholder: View {
    var body: some View {
        ContentUnavailableView("삭제됨", systemImage: "tray", description: Text("선택한 항목이 더 이상 없습니다."))
    }
}


/// Linear 스타일 마일스톤 행: focus(◆ 강조)·가중 진행률·target date·overdue·change 그룹핑
// ---- Dispatch 상태 색 / Scorecard 채점 폼 (research wave1-2 반영) --------------

/// 마일스톤 이동 공용 — 실패를 조용히 묻지 않고 안내한다
@MainActor
func trySetMilestone(_ model: AppModel, _ changeId: String, _ milestoneId: String?) {
    do { try model.setMilestone(changeId: changeId, milestoneId: milestoneId) }
    catch { model.lastError = "옮기지 못했습니다 — \(error)" }
}

/// 대기 중(나를 기다림/결과 확인/실패)이 맨 위 — 사람이 볼 순서
func dispatchBoardOrder(_ ds: [AppModel.Item]) -> [AppModel.Item] {
    let rank: [String: Int] = ["AWAITING_INPUT": 0, "RESULT_READY": 1, "FAILED": 2]
    return ds.sorted { (rank[$0.status.uppercased()] ?? 3, $0.id) < (rank[$1.status.uppercased()] ?? 3, $1.id) }
}
