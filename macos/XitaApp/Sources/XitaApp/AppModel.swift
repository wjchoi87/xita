import Foundation
import XitaCoreBridge

/// macOS Human Control Plane ViewModel (v0.5 §4).
/// UI 는 canonical 파일을 직접 수정하지 않는다 — 모든 변경은 Rust Operation
/// Engine(멀티필드 op)으로, 표시는 pull projection.
@MainActor
public final class AppModel: ObservableObject {
    public struct Item: Identifiable, Equatable, Hashable {
        public let id: String
        public let type: String // 12 types: products/changes/... /capabilities/readiness/proposals/reviews/references/dispatches
        public let revision: UInt64
        public let name: String
        public let status: String
        public let product: String
        public let kind: String
        public let updatedAt: Date?

        /// §99: 30일 이상 미변경 항목은 stale 제안 대상 (자동 삭제 없음)
        public var isStale: Bool {
            guard let updatedAt else { return false }
            return Date().timeIntervalSince(updatedAt) > 30 * 86400
        }
    }

    public enum Selection: Hashable {
        case product(String)
        case change(String)
        case workbench(String)
        case agents
        case settings
    }

    /// ⌘K 팔레트가 Ask를 건네는 채널 (Home ask 카드가 소비 후 클리어)
    public var paletteQuestion = ""
    @Published public private(set) var items: [Item] = []
    @Published public private(set) var workspaceRevision: UInt64 = 0
    public struct ConflictInfo: Identifiable, Hashable {
        public var id: String { opId }
        public let opId: String
        public let targetId: String
        public let baseRevision: Int
        public let canonicalRevision: Int
        public let kind: String
    }

    @Published public private(set) var conflicts: [ConflictInfo] = []
    @Published public var lastError: String?

    public let workspaceDir: String
    private let bridge = XitaBridge()

    // ---- §67 Settings (agent cmd / 기본 dispatch 경로) ------------------------
    public struct AppSettings: Codable, Equatable {
        public var agentCmd: String
        public var defaultDest: String
        public init(agentCmd: String = "", defaultDest: String = "~/Desktop") {
            self.agentCmd = agentCmd
            self.defaultDest = defaultDest
        }
    }

    private var settingsFile: String { (workspaceDir as NSString).appendingPathComponent(".xita/settings.json") }

    public func loadSettings() -> AppSettings {
        guard let raw = try? String(contentsOfFile: settingsFile, encoding: .utf8),
              let data = raw.data(using: .utf8),
              let s = try? JSONDecoder().decode(AppSettings.self, from: data) else { return AppSettings() }
        return s
    }

    public func saveSettings(_ s: AppSettings) {
        try? FileManager.default.createDirectory(atPath: (workspaceDir as NSString).appendingPathComponent(".xita"), withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(s) {
            try? String(data: data, encoding: .utf8)?.write(toFile: settingsFile, atomically: true, encoding: .utf8)
        }
    }

    /// env(XITA_AGENT_CMD) 우선, 없으면 settings.agent_cmd (§16 launch opt-in 유지)
    public func effectiveAgentCmd() -> String? {
        if let e = ProcessInfo.processInfo.environment["XITA_AGENT_CMD"], !e.isEmpty { return e }
        let c = loadSettings().agentCmd
        return c.isEmpty ? nil : c
    }
    private static var opSeq = 0

    public init(workspaceDir: String) {
        self.workspaceDir = workspaceDir
    }

    // ---- helpers ----------------------------------------------------------

    private static func nextOp() -> String {
        opSeq += 1
        return "macos-op-\(Int(Date().timeIntervalSince1970))-\(opSeq)"
    }

    public struct KV {
        public let key: String
        public let value: String
        public init(_ k: String, _ v: String) {
            key = k
            value = v
        }
    }

    @discardableResult
    func applyMulti(
        target: String, targetId: String, baseRevision: UInt64,
        kind: String, fields: [KV]
    ) throws -> [String: Any] {
        let out = try bridge.applyOperationMulti(
            path: workspaceDir, opId: Self.nextOp(), deviceId: "xita-macos",
            target: target, targetId: targetId, baseRevision: baseRevision, kind: kind,
            fields: fields.map { XitaBridge.Field($0.key, $0.value) }
        )
        if let status = out["status"] as? String, status == "REJECTED" {
            lastError = "거부됨: \(out["message"] as? String ?? "")"
        } else if let status = out["status"] as? String, status == "CONFLICT" {
            lastError = "\(targetId) 의 수정이 정본과 어긋났습니다 — 기록했고 '내가 결정할 일'에 올렸습니다"
        } else {
            lastError = nil
        }
        try refresh()
        return out
    }

    func item(_ type: String, _ id: String) -> Item? {
        items.first { $0.type == type && $0.id == id }
    }

    // ---- lifecycle --------------------------------------------------------

    public func ensureWorkspace() throws {
        try FileManager.default.createDirectory(atPath: workspaceDir, withIntermediateDirectories: true)
        _ = try bridge.openWorkspace(path: workspaceDir)
    }

    public func refresh() throws {
        let out = try bridge.pull(path: workspaceDir, cursor: 0)
        workspaceRevision = (out["workspace_revision"] as? NSNumber)?.uint64Value ?? 0
        let changes = out["changes"] as? [[String: Any]] ?? []
        items = changes.map { c in
            Item(
                id: c["id"] as? String ?? "-",
                type: c["type"] as? String ?? "-",
                revision: (c["revision"] as? NSNumber)?.uint64Value ?? 0,
                name: Self.displayName(c["name"] as? String, id: c["id"] as? String ?? "-"),
                status: c["status"] as? String ?? "-",
                product: c["product"] as? String ?? "",
                kind: c["kind"] as? String ?? "",
                updatedAt: (c["updated_at"] as? String).flatMap { ISO8601DateFormatter().date(from: $0) }
            )
        }
        .sorted { ($0.type, $0.name) < ($1.type, $1.name) }
        let raw = (try? bridge.conflicts(path: workspaceDir)) ?? []
        conflicts = Dictionary(grouping: raw) { $0["target_id"] as? String ?? "?" }.map { ($0.value.first ?? [:]) }.map { c in
            ConflictInfo(
                opId: c["op_id"] as? String ?? "?",
                targetId: c["target_id"] as? String ?? "?",
                baseRevision: (c["base_revision"] as? NSNumber)?.intValue ?? 0,
                canonicalRevision: (c["canonical_revision"] as? NSNumber)?.intValue ?? 0,
                kind: c["kind"] as? String ?? "update"
            )
        }
    }

    /// 첫 실행 부트스트랩
    public func bootstrapDemo() throws {
        try ensureWorkspace()
        if !items.isEmpty { return }
        try? refresh()
        guard items.isEmpty else { return }
        try createProduct(name: "Novel", version: "v1.4.2", description: nil)
        try createChange(productId: "novel", title: "AI Recommendation", intent: "취향 기반 추천 도입", goal: "추천 API/UI 출시")
    }

    // ---- §18/§57/§64: 로컬 Ask & 요약 (Mac은 서버 없이 코어 파일로 답변) ------------
    public struct AskResult {
        public let intent: String
        public let answer: String
        public let sources: [(kind: String, id: String, title: String)]
    }

    public func askLocal(_ question: String) -> AskResult {
        let q = question.lowercased()
        let intent: String
        if q.range(of: "왜|이유|채택|결정", options: .regularExpression) != nil { intent = "decision" }
        else if q.range(of: "막혀|차단|블로커|blocker", options: .regularExpression) != nil { intent = "blockers" }
        else if q.range(of: "버전|version|운영|배포|서비스", options: .regularExpression) != nil { intent = "version" }
        else if q.range(of: "문서|artifact|스펙", options: .regularExpression) != nil { intent = "artifacts" }
        else if q.range(of: "최근|달라|요약", options: .regularExpression) != nil { intent = "timeline" }
        else { intent = "changes" }

        let stop: Set<String> = ["왜", "뭐지", "뭔지", "지금", "현재", "최근", "있는", "있지", "하는", "하고", "관련", "전부", "보여줘", "알려줘", "어디", "버전", "제품", "문서", "결정", "변경", "운영", "서비스", "차단", "이유", "채택", "스펙", "요약", "달라", " artifact", "what", "why", "show", "the"]
        let kws = question.lowercased()
            .components(separatedBy: CharacterSet(charactersIn: " ?.,!\n"))
            .filter { $0.count > 1 && !stop.contains($0) }

        func matchDoc(_ id: String, _ meta: [String: String], _ body: String) -> Bool {
            if kws.isEmpty { return true }
            let hay = (id + " " + meta.values.joined(separator: " ") + " " + body).lowercased()
            return kws.contains { hay.contains($0) }
        }

        var sources: [(String, String, String)] = []
        var answer = ""
        switch intent {
        case "decision":
            let all = items.filter { $0.type == "decisions" }.map { ($0, docFields(type: "decision", id: $0.id)) }
            let hits = all.filter { matchDoc($0.0.id, $0.1, "") }
            let shown = hits.isEmpty ? all.filter { $0.1["status"] == "ACTIVE" } : hits
            answer = shown.prefix(3).map { d in
                "\(d.1["title"] ?? d.0.name): \(d.1["decision"] ?? "")\(d.1["reason"].map { $0.isEmpty ? "" : " — 이유: \($0)" } ?? "")"
            }.joined(separator: "\n")
            sources = shown.prefix(5).map { ("decision", $0.0.id, $0.1["title"] ?? $0.0.name) }
            if answer.isEmpty { answer = "기록된 결정 없음" }
        case "version":
            let ps = items.filter { $0.type == "products" }.map { ($0, docFields(type: "product", id: $0.id)) }
            let hits = ps.filter { matchDoc($0.0.id, $0.1, "") }
            let shown = hits.isEmpty ? ps : hits
            answer = shown.map { "\($0.1["name"] ?? $0.0.name): \($0.1["production_status"] ?? $0.0.status) · \($0.1["version"] ?? "-")" }.joined(separator: "\n")
            sources = shown.map { ("product", $0.0.id, $0.1["name"] ?? $0.0.name) }
        case "timeline":
            answer = summaryText()
        case "blockers":
            var lines: [String] = []
            for p in items where p.type == "products" {
                for b in readinessSummary(productId: p.id)?.blockers ?? [] {
                    lines.append("\(p.name): \(b)")
                }
            }
            answer = lines.isEmpty ? "현재 차단 없음" : lines.joined(separator: "\n")
        default:
            let cs = items.filter { $0.type == "changes" }.map { ($0, docFields(type: "change", id: $0.id)) }
            let hits = cs.filter { matchDoc($0.0.id, $0.1, "") }
            answer = hits.isEmpty ? "관련 Change 없음" : hits.prefix(6).map { "\($0.1["name"] ?? $0.0.name) — \($0.0.status)" }.joined(separator: "\n")
            sources = hits.prefix(6).map { ("change", $0.0.id, $0.1["name"] ?? $0.0.name) }
        }
        return AskResult(intent: intent, answer: answer, sources: sources)
    }

    public func summaryText(days: Int = 90) -> String {
        let evs = eventLog(limit: 500)
        let cutoff = Date().addingTimeInterval(-Double(days) * 86400)
        let recent = evs.filter { (ev, _, _, _) in
            guard let d = ISO8601DateFormatter().date(from: ev) else { return true }
            return d >= cutoff
        }
        func n(_ t: String) -> Int { recent.filter { $0.1 == t }.count }
        return "최근 \(days)일 — 완료한 할 일 \(n("CHANGE_APPROVED") + n("CHANGE_SHIPPED"))건 · 출시 \(n("RELEASED"))건 · 새 결정 \(n("MAJOR_DECISION"))건 · 제안 \(n("PROPOSAL_CREATED"))건 · 차단 \(n("SHIP_BLOCKER"))건 · 이벤트 \(recent.count)건"
    }

    // ---- Milestones (Linear-style: weighted progress·focus·overdue) -------------
    public struct MilestoneInfo: Identifiable, Equatable {
        public var id: String { milestoneId }
        public let milestoneId: String
        public let name: String
        public let status: String
        public let targetDate: String?
        /// 마일스톤의 정체 — '무엇을 끝내면 여길 지나는가' 한 줄. 숫자만 보이는 불만 직시(2026-08-30)
        public let desc: String
        public var changes: [Item]
        public var progress: Int
        public var isOverdue: Bool
        public var isFocus: Bool

        public static func == (lhs: MilestoneInfo, rhs: MilestoneInfo) -> Bool { lhs.milestoneId == rhs.milestoneId }
    }

    /// 이름 없는 문서 대응: frontmatter name 없으면 id를 사람이 읽는 표기로 변환
    /// ("ai-recommendation"→"AI Recommendation"). id 원문 노출 금지(2026-08-30 오너 감사)
    static func displayName(_ raw: String?, id: String) -> String {
        if let r = raw, !r.isEmpty, r != id { return r }
        if id.contains("-m-"), let tail = id.split(separator: "-").last { return "마일스톤 \(tail)" }
        let words = id.split(whereSeparator: { "-_".contains($0) }).map { part -> String in
            guard !part.isEmpty else { return "" }
            let cap = part.prefix(1).uppercased() + part.dropFirst()
            return ["Ai": "AI", "Api": "API", "Mcp": "MCP", "Sso": "SSO", "Prd": "PRD"][cap] ?? cap
        }
        return words.joined(separator: " ")
    }

    /// ISO8601 full / date-only(2026-10-01) 모두 허용 (포매터 2개 직렬 시도)
    static func parseDateLoose(_ raw: String) -> Date? {
        let full = ISO8601DateFormatter()
        if let d = full.date(from: raw) { return d }
        let dayOnly = ISO8601DateFormatter()
        dayOnly.formatOptions = [.withFullDate]
        return dayOnly.date(from: String(raw.prefix(10)))
    }

    static let changeWeight: [String: Double] = ["SHIPPED": 1, "SHIP_READY": 0.75, "REVIEW": 0.75, "BUILD": 0.5, "PLAN": 0.3, "PAUSED": 0.2, "IDEA": 0.1]

    public func milestones(for productId: String) -> [MilestoneInfo] {
        let ms = items.filter { $0.type == "milestones" && $0.product == productId }
            .sorted { ($0.kind.isEmpty ? "9999" : dateOf($0.id)) < ($1.kind.isEmpty ? "9999" : dateOf($1.id)) }
        let changes = items.filter { $0.type == "changes" }
        var infos: [MilestoneInfo] = []
        for m in ms {
            let d = docFields(type: "milestone", id: m.id)
            let linked = changes.filter { docFields(type: "change", id: $0.id)["milestone_id"] == m.id }
            let weights = linked.compactMap { Self.changeWeight[$0.status] }
            let progress = weights.isEmpty ? 0 : Int((weights.reduce(0, +)/Double(weights.count)*100).rounded())
            let target = d["target_date"]
            let overdue = (target.flatMap { Self.parseDateLoose(String($0)) }.map { $0 < Date() }) ?? false
            infos.append(MilestoneInfo(milestoneId: m.id, name: m.name, status: m.status, targetDate: target,
                                       desc: d["description"] ?? "",
                                       changes: linked, progress: progress,
                                       isOverdue: overdue && m.status != "done",
                                       isFocus: false))
        }
        if let focusIdx = infos.firstIndex(where: { $0.status != "done" && $0.progress < 100 }) {
            infos[focusIdx].isFocus = true
        }
        return infos
    }

    private func dateOf(_ milestoneId: String) -> String {
        docFields(type: "milestone", id: milestoneId)["target_date"] ?? "9999"
    }

    public func createMilestone(productId: String, name: String, targetDate: String?, desc: String? = nil) throws {
        var fields: [KV] = [KV("product", productId), KV("name", name), KV("status", "planned")]
        if let targetDate { fields.append(KV("target_date", targetDate)) }
        if let desc, !desc.isEmpty { fields.append(KV("description", desc)) }
        _ = try applyMulti(target: "milestone", targetId: "\(productId)-m-\(slug(name))", baseRevision: 0, kind: "create", fields: fields)
    }

    public func setMilestone(changeId: String, milestoneId: String?) throws {
        guard let c = item("changes", changeId) else { return }
        if let milestoneId {
            _ = try applyMulti(target: "change", targetId: changeId, baseRevision: c.revision, kind: "update_field", fields: [KV("milestone_id", milestoneId)])
        } else {
            _ = try applyMulti(target: "change", targetId: changeId, baseRevision: c.revision, kind: "update_field", fields: [KV("milestone_id", "")])
        }
    }

    public func setMilestoneStatus(id: String, status: String) throws {
        guard let m = item("milestones", id) else { return }
        _ = try applyMulti(target: "milestone", targetId: id, baseRevision: m.revision, kind: "update_field", fields: [KV("status", status)])
    }

    public func unassignedChanges(_ productId: String) -> [Item] {
        items.filter { $0.type == "changes" && $0.product == productId && docFields(type: "change", id: $0.id)["milestone_id"].map { $0.isEmpty } ?? true }
    }

    // ---- Operations profile / Releases / Roadmap / Health ----------------------

    public enum ProductionStatus: String, CaseIterable { case idea = "IDEA", plan = "PLAN", beta = "BETA", production = "PRODUCTION", deprecated = "DEPRECATED" }

    /// 프로필 메타 갱신 (production_status/platforms/deployments/repo/vision/version...)
    public func updateProfile(id: String, fields: [KV]) throws {
        try updateProduct(id: id, fields: fields)
    }

    public func profile(_ productId: String) -> [String: String] {
        doc(type: "product", id: productId)?.fields ?? [:]
    }

    public func releases(for productId: String) -> [Item] {
        items
            .filter { $0.type == "releases" && $0.product == productId }
            .sorted { $0.revision > $1.revision }
    }

    public func nextRelease(_ productId: String) -> Item? {
        releases(for: productId).first { !["RELEASED", "ROLLED_BACK"].contains($0.status) }
    }

    public func createRelease(productId: String, name: String, notes: String = "") throws {
        _ = try applyMulti(
            target: "release", targetId: "\(productId)-\(slug(name))", baseRevision: 0, kind: "create",
            fields: [
                KV("product", productId), KV("name", name), KV("version_label", name),
                KV("status", "PLANNED"), KV("notes", notes),
            ]
        )
    }

    public func releaseChangeIds(_ releaseId: String) -> [String] {
        let raw = doc(type: "release", id: releaseId)?.fields["change_ids"] ?? ""
        return raw.split(separator: ";").map(String.init).filter { !$0.isEmpty && $0 != "null" }
    }

    public func addChangeToRelease(releaseId: String, changeId: String) throws {
        guard let r = item("releases", releaseId) else { return }
        var list = releaseChangeIds(releaseId)
        if !list.contains(changeId) { list.append(changeId) }
        _ = try applyMulti(target: "release", targetId: releaseId, baseRevision: r.revision, kind: "update_field", fields: [KV("change_ids", list.joined(separator: ";"))])
    }

    /* RELEASED 시점 stamp — 출시 기록 changelog 월-그룹의 날짜원(AnnounceKit/Raycast: 날짜는 출시 표면 전용)
     * target_date(계획 시점 표기)와 분리: 실제 RELEASED된 순간만 released_at 에 기록 */
    public func setReleaseStatus(id: String, status: String) throws {
        guard let r = item("releases", id) else { return }
        var fields: [KV] = [KV("status", status)]
        if status == "RELEASED", (docFields(type: "release", id: id)["released_at"] ?? "").isEmpty {
            fields.append(KV("released_at", ISO8601DateFormatter().string(from: Date())))
        }
        _ = try applyMulti(target: "release", targetId: id, baseRevision: r.revision, kind: "update_field", fields: fields)
        // RELEASED → 제품 version/current_release 동기 (§9)
        if status == "RELEASED" {
            let label = doc(type: "release", id: id)?.fields["version_label"] ?? r.name
            if let p = item("products", r.product) {
                _ = try applyMulti(target: "product", targetId: r.product, baseRevision: p.revision, kind: "update_field", fields: [KV("version", label), KV("current_release_id", id)])
            }
        }
    }

    public struct ReleaseReadiness: Equatable {
        public var shipped = 0
        public var total = 0
        public var blockers: [String] = []
        public var ready: Bool { total > 0 && shipped == total && blockers.isEmpty }
    }

    public func releaseReadiness(_ releaseId: String, productId: String) -> ReleaseReadiness {
        let ids = releaseChangeIds(releaseId)
        let shipped = ids.filter { item("changes", $0)?.status == "SHIPPED" }.count
        let sum = readinessSummary(productId: productId)
        return ReleaseReadiness(shipped: shipped, total: ids.count, blockers: sum?.blockers ?? [])
    }

    /// §97/98 Product Health (Swift aggregate — server ops.productHealth 와 동일 정의)
    public struct ProductHealth: Equatable {
        public var productionStatus = "-"
        public var version = "-"
        public var development = "-"
        public var operations = "-"
        public var distribution = "-"
        public var contextDrift = 0
        public var pendingProposals = 0
        public var launchReadiness = 0
        public var nextRelease: String?
    }

    public func health(_ productId: String) -> ProductHealth {
        var h = ProductHealth()
        let f = profile(productId)
        h.productionStatus = f["production_status"] ?? f["status"] ?? "-"
        h.version = f["version"] ?? "-"
        let mine = items.filter { $0.type == "changes" && $0.product == productId }
        h.development = mine.contains(where: { ["IDEA", "PLAN", "BUILD", "REVIEW", "SHIP_READY"].contains($0.status) }) ? "healthy" : "warning"
        h.operations = !(f["deployments"] ?? "").isEmpty ? "healthy" : "warning"
        let rels = releases(for: productId)
        h.distribution = rels.contains(where: { ["RELEASED", "SUBMITTED"].contains($0.status) }) ? "healthy" : (h.productionStatus == "PRODUCTION" ? "warning" : "pending")
        h.launchReadiness = readinessSummary(productId: productId)?.overall ?? 0
        var drift = 0
        for a in items where a.type == "artifacts" && a.product == productId {
            let d = docFields(type: "artifact", id: a.id)
            let cur = Int(d["current_revision"] ?? "") ?? 0
            let disp = Int(d["last_dispatched_revision"] ?? "") ?? 0
            if disp > 0, cur > disp { drift += 1 }
        }
        h.contextDrift = drift
        h.pendingProposals = pendingProposals.filter { $0.product == productId }.count
        h.nextRelease = nextRelease(productId)?.name
        return h
    }

    /// roadmap: FUTURE 축 — scorecard 파생 점수 우선, 없으면 priority (TS ops.roadmap과 동일 규칙)
    /// Aha 공식 (P+N+S−E)×C/10. Float 미저장(파생)이라 frontmatter 제약을 피한다.
    public func valueScore(_ changeId: String) -> Double? {
        let f = docFields(type: "change", id: changeId)
        guard let pop = Double(f["s_pop"] ?? ""), let need = Double(f["s_need"] ?? ""),
              let strat = Double(f["s_strat"] ?? ""), let effort = Double(f["s_effort"] ?? ""),
              let conf = Double(f["s_conf"] ?? ""), pop > 0, need > 0, strat > 0, conf > 0
        else { return nil }
        return ((pop + need + strat - effort) * conf / 10 * 10).rounded() / 10
    }

    public func staleDays(_ type: String, _ id: String) -> Int? {
        let raw = docFields(type: type, id: id)["updated_at"] ?? ""
        guard let t = Self.parseDateLoose(raw) else { return nil }
        return Int(Date().timeIntervalSince(t) / 86400)
    }

    public func roadmap(_ productId: String) -> [Item] {
        let rank: [String: Int] = ["critical": 0, "high": 1, "normal": 2, "low": 3]
        let future = items.filter { $0.type == "changes" && $0.product == productId && ["IDEA", "PLAN"].contains($0.status) }
        return future.sorted { a, b in
            let sa = valueScore(a.id), sb = valueScore(b.id)
            if let sa, let sb { return sa > sb }
            if sa != nil { return true }
            if sb != nil { return false }
            let pa = rank[docFields(type: "change", id: a.id)["priority"] ?? "normal"] ?? 2
            let pb = rank[docFields(type: "change", id: b.id)["priority"] ?? "normal"] ?? 2
            return pa < pb
        }
    }

    public func docFields(type: String, id: String) -> [String: String] {
        doc(type: type, id: id)?.fields ?? [:]
    }

    public func setPriority(changeId: String, priority: String) throws {
        guard let c = item("changes", changeId) else { return }
        _ = try applyMulti(target: "change", targetId: changeId, baseRevision: c.revision, kind: "update_field", fields: [KV("priority", priority)])
    }

    // ---- Products ----------------------------------------------------------

    public var products: [Item] { items.filter { $0.type == "products" } }
    public var workbenchItems: [Item] { items.filter { $0.type == "workbench" } }
    /* Needs You 집계 — 서버 needsYou()와 같은 4원천:
     * REVIEW/SHIP_READY change + sync conflict + dispatch 대기열(AWAITING_INPUT/RESULT_READY/FAILED)
     * + WHY 누락(BUILD+인데 intent/goal 없음, community wave2 P6) */
    public var needsYouCount: Int {
        let stage = items.filter { $0.type == "changes" && ["REVIEW", "SHIP_READY"].contains($0.status) }.count
        let waiting = items.filter {
            $0.type == "dispatches" && ["AWAITING_INPUT", "RESULT_READY", "FAILED"].contains($0.status.uppercased())
        }.count
        let whyMissing = items.filter {
            $0.type == "changes" && ["BUILD", "REVIEW", "SHIP_READY"].contains($0.status)
                && (docFields(type: "change", id: $0.id)["intent"] ?? "").isEmpty
                && (docFields(type: "change", id: $0.id)["goal"] ?? "").isEmpty
        }.count
        return stage + conflicts.count + waiting + whyMissing
    }

    /// Home Needs You 리스트용 — dispatch 대기 행만 별도 노출
    public var waitingDispatches: [Item] {
        items.filter {
            $0.type == "dispatches" && ["AWAITING_INPUT", "RESULT_READY", "FAILED"].contains($0.status.uppercased())
        }
    }

    public func changes(for productId: String) -> [Item] {
        items.filter { $0.type == "changes" && $0.product == productId }
    }

    public func createProduct(name: String, version: String? = nil, description: String? = nil, productType: String? = nil) throws {
        var fields: [KV] = [KV("name", name), KV("status", "production")]
        if let version { fields.append(KV("version", version)) }
        if let description, !description.isEmpty { fields.append(KV("description", description)) }
        if let productType { fields.append(KV("product_type", productType)) }
        _ = try applyMulti(target: "product", targetId: slug(name), baseRevision: 0, kind: "create", fields: fields)
        // §67 Product Templates — 생성 시 DoS 템플릿 자동 적용
        if let productType, !productType.isEmpty {
            try applyShipTemplate(productId: slug(name), type: productType)
        }
    }

    public func updateProduct(id: String, fields: [KV]) throws {
        guard let current = item("products", id) else { return }
        _ = try applyMulti(target: "product", targetId: id, baseRevision: current.revision, kind: "update_field", fields: fields)
    }

    public func deleteProduct(id: String) throws {
        _ = try applyMulti(target: "product", targetId: id, baseRevision: 0, kind: "delete", fields: [])
    }

    // ---- Changes ------------------------------------------------------------

    /// change id = 제품 독립 slug → 서로 다른 제품의 같은 제목이 같은 id 로 충돌하는 결함 수정.
    /// 서버 도메인(domain.ts createChange)과 동일한 unique-suffix 규칙(-2, -3…)을 쓴다.
    func uniqueChangeId(productId: String, title: String) -> String {
        let base = slug(title)
        var candidate = base
        var n = 2
        while item("changes", candidate) != nil || doc(type: "change", id: candidate) != nil {
            candidate = "\(base)-\(n)"
            n += 1
        }
        return candidate
    }

    /// 생성된 change id 를 돌려준다(퀵애드의 즉시 마일스톤 상속용).
    @discardableResult
    public func createChange(productId: String, title: String, intent: String? = nil, goal: String? = nil) throws -> String {
        var fields: [KV] = [KV("product", productId), KV("status", "IDEA"), KV("name", title)]
        if let intent, !intent.isEmpty { fields.append(KV("intent", intent)) }
        if let goal, !goal.isEmpty { fields.append(KV("goal", goal)) }
        let id = uniqueChangeId(productId: productId, title: title)
        _ = try applyMulti(target: "change", targetId: id, baseRevision: 0, kind: "create", fields: fields)
        return id
    }

    public func updateChange(id: String, fields: [KV]) throws {
        guard let current = item("changes", id) else { return }
        _ = try applyMulti(target: "change", targetId: id, baseRevision: current.revision, kind: "update_field", fields: fields)
    }

    public func setStage(itemId: String, targetType: String, status: String) throws {
        guard let current = item(targetType, itemId) else { return }
        _ = try applyMulti(target: targetType, targetId: itemId, baseRevision: current.revision, kind: "update_status", fields: [KV("status", status)])
    }

    public func deleteChange(id: String) throws {
        _ = try applyMulti(target: "change", targetId: id, baseRevision: 0, kind: "delete", fields: [])
    }

    // ---- Scorecard 채점 (research wave2 · Aha 공식) ----------------------------

    /// s_pop/s_need/s_strat/s_effort/s_conf 0-10 정수만 저장 — 파생 점수는 valueScore가 계산
    public func scoreChange(changeId: String, pop: Int, need: Int, strat: Int, effort: Int, conf: Int) throws {
        let c = Int(clamping: pop), n = Int(clamping: need), s = Int(clamping: strat)
        let e = Int(clamping: effort), k = Int(clamping: conf)
        _ = try applyMulti(target: "change", targetId: changeId, baseRevision: item("changes", changeId)?.revision ?? 0, kind: "update_field", fields: [
            KV("s_pop", String(c)), KV("s_need", String(n)), KV("s_strat", String(s)),
            KV("s_effort", String(e)), KV("s_conf", String(k)),
        ])
    }

    // ---- Insight (14번째 타입 — 관찰/가설/기회 1급 객체) -------------------------

    public var insightItems: [Item] { items.filter { $0.type == "insights" } }

    public func insights(for productId: String) -> [Item] {
        insightItems.filter { $0.product == productId }
    }

    /// kind: OBSERVATION|INTERVIEW|FOCUS_GROUP|SECONDARY|DERIVED|RETRO|OPPORTUNITY|ASSUMPTION
    /// (Leantime Insights 5분류 + Torres OST — insight가 트리 노드도 겸함, parent 필드로 엣지)
    public func addInsight(productId: String, title: String, kind: String, content: String, changeId: String? = nil, parent: String? = nil) throws {
        var fields: [KV] = [
            KV("product", productId), KV("name", title), KV("kind", kind.uppercased()),
            KV("status", "OPEN"), KV("source", "macos"),
        ]
        if let changeId, !changeId.isEmpty { fields.append(KV("change", changeId)) }
        if let parent, !parent.isEmpty { fields.append(KV("parent", parent)) }
        let id = "\(productId)-i-\(slug(title))"
        fields.append(KV("#body", "# \(title)\n\n\(content)\n"))
        _ = try applyMulti(target: "insight", targetId: id, baseRevision: 0, kind: "create", fields: fields)
    }

    public func cycleInsightStatus(id: String) throws {
        let cur = docFields(type: "insight", id: id)["status"] ?? "OPEN"
        let next = ["OPEN": "VALIDATED", "VALIDATED": "OUTDATED", "OUTDATED": "OPEN"][cur] ?? "OPEN"
        _ = try applyMulti(target: "insight", targetId: id, baseRevision: item("insights", id)?.revision ?? 0, kind: "update_field", fields: [KV("status", next)])
    }

    // ---- Dispatch 런 루프 (Vibe Kanban Needs Attention / Conductor Checks) -------

    public var dispatchItems: [Item] { items.filter { $0.type == "dispatches" } }

    public func setDispatchStatus(id: String, status: String) throws {
        guard let d = item("dispatches", id) else { return }
        _ = try applyMulti(target: "dispatch", targetId: id, baseRevision: d.revision, kind: "update_field", fields: [KV("status", status.uppercased())])
    }

    public func validTransitions(from status: String) -> [String] {
        bridge.validTransitions(from: status)
    }

    // ---- Workbench / promote -------------------------------------------------

    public func capture(title: String, content: String) throws {
        var fields: [KV] = [KV("status", "captured"), KV("name", title)]
        if !content.isEmpty { fields.append(KV("#body", content)) }
        _ = try applyMulti(target: "workbench", targetId: slug(title), baseRevision: 0, kind: "create", fields: fields)
    }

    /// Workbench → 새 Product 승격 (Human Trigger, v0.3 §27)
    public func promoteWorkbench(id: String, toNewProductNamed name: String) throws {
        try createProduct(name: name, description: "promoted from workbench: \(id)")
        try markWorkbenchPromoted(id: id)
    }

    public func promoteWorkbench(id: String, toProductChange productId: String, title: String) throws {
        try createChange(productId: productId, title: title)
        try markWorkbenchPromoted(id: id)
    }

    private func markWorkbenchPromoted(id: String) throws {
        guard let w = item("workbench", id) else { return }
        _ = try applyMulti(target: "workbench", targetId: id, baseRevision: w.revision, kind: "update_field", fields: [KV("status", "promoted")])
    }

    public func deleteWorkbench(id: String) throws {
        _ = try applyMulti(target: "workbench", targetId: id, baseRevision: 0, kind: "delete", fields: [])
    }

    /// §99 stale 항목 액션: 아카이브 / 유지(mature) — Agent 자동삭제 없음, Human Trigger
    public func archiveWorkbench(id: String) throws {
        guard let w = item("workbench", id) else { return }
        _ = try applyMulti(target: "workbench", targetId: id, baseRevision: w.revision, kind: "update_field", fields: [KV("status", "archived")])
    }

    public func keepWorkbench(id: String) throws {
        guard let w = item("workbench", id) else { return }
        _ = try applyMulti(target: "workbench", targetId: id, baseRevision: w.revision, kind: "update_field", fields: [KV("status", "mature")])
    }

    // ---- docs / body / handoff / conflicts ----------------------------------

    public func doc(type: String, id: String) -> XitaBridge.DocDetail? {
        try? bridge.getDoc(path: workspaceDir, target: type, id: id)
    }

    public func saveBody(type: String, id: String, body: String) throws {
        _ = try bridge.setBody(path: workspaceDir, target: type, id: id, body: body)
        try refresh()
    }

    public func handoff(product: String, change: String) throws -> String {
        try bridge.buildHandoff(path: workspaceDir, product: product, change: change)
    }

    public func availableAgents() -> [String] {
        (try? bridge.detectAgents()) ?? []
    }

    // ---- Capabilities / Proposals / Reviews (pull 기반 필터) ----------------

    /// "되는 것" 4레인(되는중/준비/실험/중단)이 실제로 채워지려면 전체를 돌려준다 —
    /// active 만 반환하던 결함은 준비/실험/중단 레인이 영원히 비는 버그였고,
    /// 탭 사이클로 상태를 바꾸면 항목이 화면에서 사라졌다(2026-09 감사).
    public func capabilities(for productId: String) -> [Item] {
        items.filter { $0.type == "capabilities" && $0.product == productId }
    }

    public func addCapability(productId: String, name: String) throws {
        _ = try applyMulti(
            target: "capability", targetId: "\(productId)-\(slug(name))", baseRevision: 0, kind: "create",
            fields: [KV("product", productId), KV("name", name), KV("status", "active")]
        )
    }

    /// 기능 상태 사이클 — 화면에서 한 탭으로 순환: 되는중(active)→준비(planned)→실험(experiment)→중단(deprecated)→되는중
    /// (서버 §51 approve 시 SHIPPED로 찍는 값도 active로 읽어 동일 레인에 묶음)
    public func cycleCapability(productId: String, name: String) throws {
        let id = "\(productId)-\(slug(name))"
        guard let c = item("capabilities", id) else { return }
        let order = ["active", "shipped", "planned", "experiment", "deprecated"]
        let cur = c.status.lowercased()
        let next = order[(order.firstIndex(of: cur) ?? -1) + 1 < order.count ? (order.firstIndex(of: cur) ?? -1) + 1 : 0] ?? "active"
        _ = try applyMulti(target: "capability", targetId: id, baseRevision: c.revision, kind: "update_field", fields: [KV("status", next)])
    }

    public var pendingProposals: [Item] { items.filter { $0.type == "proposals" && $0.status == "pending" } }

    /// 기각은 이력으로 남는다 ("왜 안 했나"의 원천 — UX_PATTERN_LIBRARY Rejected Stays Visible)
    public var rejectedProposals: [Item] {
        items.filter { $0.type == "proposals" && $0.status == "rejected" }
            .sorted { $0.revision > $1.revision }
    }

    public func proposals(for changeId: String) -> [Item] {
        items.filter { $0.type == "proposals" && $0.id.hasPrefix("\(changeId)-") }
    }

    public func resolveProposal(id: String, status: String) throws {
        guard let p = item("proposals", id) else { return }
        _ = try applyMulti(target: "proposal", targetId: id, baseRevision: p.revision, kind: "update_field", fields: [KV("status", status)])
    }

    public func reviews(for changeId: String) -> [Item] {
        items.filter { $0.type == "reviews" && $0.id.hasPrefix("\(changeId)-") }
    }

    // ---- Readiness ----------------------------------------------------------

    public func readinessSummary(productId: String) -> XitaBridge.ReadinessSummary? {
        try? bridge.readiness(path: workspaceDir, product: productId)
    }

    @discardableResult
    public func applyShipTemplate(productId: String, type: String = "MOBILE_SAAS") throws -> Int {
        defer { try? refresh() }
        return try bridge.applyShipTemplate(path: workspaceDir, product: productId, productType: type)
    }

    public func cycleReadinessItem(productId: String, kind: String, item: String) throws {
        guard let doc = doc(type: "readiness", id: "\(productId)-\(kind.lowercased())") else { return }
        // items 는 Rust getDoc 에서 "a|S|p|, b|S|p|" 로 join 되어 옴 → 앞두기 파이프 파싱
        let raw = doc.fields["items"] ?? ""
        let entries = raw.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { $0.contains("|") }
        for line in entries {
            let parts = line.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
            guard parts.count >= 3, parts[0] == item else { continue }
            let (status, progress) = next(stage: parts[1], progress: Int(parts[2]) ?? 0)
            _ = try bridge.patchReadiness(path: workspaceDir, product: productId, kind: kind, item: item, status: status, progress: UInt64(progress))
            try refresh()
            return
        }
    }

    private func next(stage: String, progress: Int) -> (String, Int) {
        switch stage {
        case "PENDING": return ("IN_PROGRESS", max(progress, 30))
        case "IN_PROGRESS": return ("DONE", 100)
        default: return ("PENDING", 0)
        }
    }

    // ---- Build This / Dispatch (platform-local, v0.5 §15) --------------------

    /// handoff 를 destination 에 배치 (+option branch / agent start). Send Files vs Send&Start 분리(§40).
    @discardableResult
    public func dispatchChange(change: Item, destPath: String, instruction: String, branch: String?, startAgent: Bool) throws -> String {
        let md = try bridge.buildHandoff(path: workspaceDir, product: change.product, change: change.id)
        let base = (destPath as NSString).expandingTildeInPath
        let dir = URL(fileURLWithPath: base).appendingPathComponent(".xita")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var body = md
        if !instruction.isEmpty {
            body += "\n\n## Instruction\n\n\(instruction)\n"
        }
        let file = dir.appendingPathComponent("\(change.id)-handoff.md")
        try body.write(to: file, atomically: true, encoding: .utf8)
        if let branch, !branch.isEmpty {
            run("/usr/bin/git", ["-C", base, "checkout", "-b", branch])
        }
        if startAgent, let cmd = effectiveAgentCmd(), !cmd.isEmpty {
            let parts = cmd.split(separator: " ").map(String.init)
            if let first = parts.first {
                run(first, Array(parts.dropFirst()), cwd: base)
            }
        }
        // §67 Agents > Dispatches — 이력 dispatch doc 으로 기록
        try applyMulti(
            target: "dispatch", targetId: "d-\(change.id)-\(String(Int(Date().timeIntervalSince1970), radix: 36))",
            baseRevision: 0, kind: "create",
            fields: [
                KV("product", change.product), KV("change", change.id),
                KV("name", "dispatch \(change.id)"), KV("mode", startAgent ? "send_and_start" : "send_files"),
                KV("destination_path", base), KV("branch", branch ?? ""),
                KV("handoff_file", file.path), KV("status", "DISPATCHED"),
            ]
        )
        return file.path
    }

    /// §45/§67 Context Drift — dispatch 된 artifact 의 revision vs current
    public struct DriftRow: Identifiable, Equatable {
        public var id: String { artifactId }
        public let artifactId: String
        public let name: String
        public let dispatchedRevision: Int
        public let currentRevision: Int
        public var severity: String {
            let delta = currentRevision - dispatchedRevision
            return delta > 2 ? "HIGH" : delta > 0 ? "MEDIUM" : "NONE"
        }
    }

    public func drifts() -> [DriftRow] {
        var rows: [DriftRow] = []
        for a in items where a.type == "artifacts" {
            let d = docFields(type: "artifact", id: a.id)
            let cur = Int(d["current_revision"] ?? "") ?? 0
            let disp = Int(d["last_dispatched_revision"] ?? "") ?? 0
            if disp > 0, cur > disp {
                rows.append(DriftRow(artifactId: a.id, name: a.name, dispatchedRevision: disp, currentRevision: cur))
            }
        }
        return rows.sorted { $0.currentRevision - $0.dispatchedRevision > $1.currentRevision - $1.dispatchedRevision }
    }

    /// .xita/handoffs — write_handoff/dispatch 산출물 파일 목록 (platform layer 파일 접근)
    public func handoffFiles() -> [String] {
        let dir = (workspaceDir as NSString).appendingPathComponent(".xita/handoffs")
        let files = (try? FileManager.default.contentsOfDirectory(atPath: dir)) ?? []
        return files.filter { $0.hasSuffix(".md") }.sorted(by: >)
    }

    /// Mac 워크스페이스 events.jsonl (server ops가 쓴 것 동일 포맷)
    public func eventLog(limit: Int = 40) -> [(ts: String, type: String, title: String, product: String)] {
        let path = (workspaceDir as NSString).appendingPathComponent(".xita/events.jsonl")
        guard let raw = try? String(contentsOfFile: path, encoding: .utf8) else { return [] }
        let lines = raw.split(separator: "\n").compactMap { line -> (String, String, String, String)? in
            guard let data = line.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
            /* events.jsonl 키 혼재 대응(TS=eventType / Rust=event_type) — 읽기측 양쪽 수용
             * 정규화는 서버 REST가 event_type로 흡수; 로컬 파서는 여기만 캐논 준수하면 된다 */
            return (
                String(obj["ts"] as? String ?? ""),
                String(obj["event_type"] as? String ?? obj["eventType"] as? String ?? ""),
                String(obj["title"] as? String ?? ""),
                String(obj["product"] as? String ?? "")
            )
        }
        return Array(lines.suffix(limit).reversed())
    }

    // ---- Decisions (§17/§76) -----------------------------------------------------
    public func decisions(for productId: String) -> [Item] {
        items.filter { $0.type == "decisions" && $0.product == productId }
    }

    public func addDecision(productId: String, title: String, decision: String, reason: String) throws {
        _ = try applyMulti(
            target: "decision", targetId: "\(productId)-d-\(slug(title))", baseRevision: 0, kind: "create",
            fields: [
                KV("product", productId), KV("title", title), KV("name", title),
                KV("decision", decision), KV("reason", reason), KV("status", "ACTIVE"),
                KV("decided_at", ISO8601DateFormatter().string(from: Date())),
            ]
        )
    }

    public func supersedeDecision(oldId: String, newId: String) throws {
        guard let oldD = item("decisions", oldId) else { return }
        _ = try applyMulti(target: "decision", targetId: oldId, baseRevision: oldD.revision, kind: "update_field", fields: [KV("status", "SUPERSEDED"), KV("superseded_by", newId)])
        if let n = item("decisions", newId) {
            _ = try applyMulti(target: "decision", targetId: newId, baseRevision: n.revision, kind: "update_field", fields: [KV("supersedes", oldId)])
        }
    }

    private func run(_ launchPath: String, _ args: [String], cwd: String? = nil) {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: launchPath)
        task.arguments = args
        if let cwd { task.currentDirectoryURL = URL(fileURLWithPath: cwd) }
        try? task.run()
    }

    /// change 에 capability 선언附加 (canonical: "id|ACTION" semicolon string — server/Rust 양쪽 파싱)
    public func attachCapability(changeId: String, capabilityId: String, action: String) throws {
        guard let c = item("changes", changeId) else { return }
        let existing = doc(type: "change", id: changeId)?.fields["capability_changes"] ?? ""
        let piece = "\(capabilityId)|\(action)"
        let next: String
        if existing.isEmpty { next = piece }
        else if existing.contains(piece) { next = existing }
        else { next = "\(existing);\(piece)" }
        _ = try applyMulti(target: "change", targetId: changeId, baseRevision: c.revision, kind: "update_field", fields: [KV("capability_changes", next)])
    }

    /// §51 승인 — Rust core 가 capability 적용→review 승인→SHIPPED→event
    public func approveChange(id: String) throws {
        _ = try bridge.approveChange(path: workspaceDir, changeId: id)
        lastError = nil
        try refresh()
    }

    public func requestChangesOn(id: String) throws {
        guard let c = item("changes", id) else { return }
        _ = try applyMulti(target: "change", targetId: id, baseRevision: c.revision, kind: "update_field", fields: [KV("status", "BUILD"), KV("review_note", "changes requested \(ISO8601DateFormatter().string(from: Date()))")])
    }

    public func gitInfo(dir: String) -> XitaBridge.GitInfo? {
        let expanded = (dir as NSString).expandingTildeInPath
        return try? bridge.gitInspect(dir: expanded)
    }

    /// conflict 처리: canonical 유지(기록 삭제) 또는 내 변경 강행 적용(force update_field — guard 우회)
    public func resolveConflictKeepCanonical(targetId: String) throws {
        _ = try applyMulti(target: "change", targetId: targetId, baseRevision: 0, kind: "resolve_conflict", fields: [KV("note", "keep canonical")])
    }

    public func resolveConflictApplyMine(conflict: ConflictInfo, status: String) throws {
        _ = try applyMulti(target: "change", targetId: conflict.targetId, baseRevision: UInt64(conflict.canonicalRevision), kind: "update_field", fields: [KV("status", status)])
        _ = try applyMulti(target: "change", targetId: conflict.targetId, baseRevision: 0, kind: "resolve_conflict", fields: [KV("note", "applied mine")])
    }
}

/// ASCII alphanumeric 전용 slug — 서버 TS slugify / Rust 파일 sanitize 와 동일 규칙
/// (한글 유지 & '.' 허용으로 교차-도구 id 가 발산하던 버그 수정).
func slug(_ s: String) -> String {
    let allowed = s.lowercased().map { ch -> Character in
        (ch.isASCII && (ch.isLetter || ch.isNumber)) ? ch : "-"
    }
    let collapsed = String(allowed).split(separator: "-").joined(separator: "-")
    return collapsed.isEmpty ? "item-\(Int(Date().timeIntervalSince1970).toHexString)" : collapsed
}

private extension Int {
    var toHexString: String { String(self, radix: 36) }
}