import SwiftUI
import AppKit
import XitaCoreBridge

/// XITA macOS — ProductComponents (ContentView 분해, 2026-09 구조 리팩토링)
/// 동작 변경 없음: 상위 선언 단위 이동만. 원본 이력은 git log ContentView.swift.


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
        do {
            try model.scoreChange(
                changeId: changeId,
                pop: Int(cache["s_pop"] ?? 5), need: Int(cache["s_need"] ?? 5),
                strat: Int(cache["s_strat"] ?? 5), effort: Int(cache["s_effort"] ?? 5),
                conf: Int(cache["s_conf"] ?? 5)
            )
        } catch {
            model.lastError = "점수를 저장하지 못했습니다 — \(error)"
        }
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
                Text(XUI.termStatus(stage)).font(.caption.bold())
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
                if let why = fields["intent"], !why.isEmpty {
                    Text(String(why.prefix(22))).font(.caption2).foregroundStyle(.tertiary).lineLimit(1)
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
                Label("이유 미기입", systemImage: "questionmark.diamond")
                    .font(.caption2).foregroundStyle(XUI.caution)
                    .help("만드는 중 이상인데 이유가 비면 '내가 결정할 일'로 올라옵니다 — 우클릭으로 상세에서 채우세요")
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: XUI.cardRadius))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(.separator.opacity(0.5)))
        .contextMenu {
            /* 유효 전이만 노출 — Rust lifecycle 단일소스와 동일 검증 */
            ForEach(model.validTransitions(from: change.status).filter { ["IDEA", "PLAN", "BUILD", "REVIEW", "SHIP_READY", "SHIPPED", "PAUSED", "CANCELLED"].contains($0) }, id: \.self) { to in
                Button("→ \(XUI.termStatus(to))") {
                    do { try model.setStage(itemId: change.id, targetType: "changes", status: to) }
                    catch { model.lastError = "옮기지 못했습니다 — \(error)" }
                }
            }
            Divider()
            Menu("마일스톤") {
                Button("해제") { trySetMilestone(model, change.id, nil) }
                ForEach(milestones.filter { $0.status != "done" }) { m in
                    Button(m.name) { trySetMilestone(model, change.id, m.milestoneId) }
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
                    Text("\(count)개").font(.caption).foregroundStyle(.secondary)
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
                    if let why = fields["intent"], !why.isEmpty {
                    Text(String(why.prefix(22))).font(.caption2).foregroundStyle(.tertiary).lineLimit(1)
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
            Button("완료 표시") {
                do { try model.setStage(itemId: change.id, targetType: "changes", status: "SHIPPED") }
                catch { model.lastError = "지금 상태에서는 완료로 옮길 수 없습니다" }
            }
            Button("여기서 잠시 멈춤") {
                do { try model.setStage(itemId: change.id, targetType: "changes", status: "PAUSED") }
                catch { model.lastError = "옮기지 못했습니다 — \(error)" }
            }
            Divider()
            Menu("마일스톤 옮기기") {
                Button("나중(Later)으로") { trySetMilestone(model, change.id, nil) }
                ForEach(milestones) { m in
                    Button(m.name) { trySetMilestone(model, change.id, m.milestoneId) }
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
                    do {
                        let id = try model.createChange(productId: productId, title: t)
                        if let m = milestoneId { trySetMilestone(model, id, m) }
                        text = ""
                    } catch {
                        model.lastError = "할 일을 만들지 못했습니다 — \(error)"
                    }
                }
        }
        .padding(8)
        .background(.quaternary.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
    }
}
