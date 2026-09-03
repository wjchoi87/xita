import SwiftUI
import AppKit
import XitaCoreBridge

/// XITA macOS — ChangeDetailView (ContentView 분해, 2026-09 구조 리팩토링)
/// 동작 변경 없음: 상위 선언 단위 이동만. 원본 이력은 git log ContentView.swift.


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
                    Text(XUI.termStatus(change.status)).font(.caption.monospaced())
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(XUI.statusColor(change.status).opacity(0.18), in: Capsule())
                    if let pn = model.item("products", change.product)?.name, !pn.isEmpty {
                        Text(pn).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
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
                            Button("→ \(XUI.termStatus(t))") {
                                do { try model.setStage(itemId: change.id, targetType: "changes", status: t) }
                                catch { model.lastError = "옮기지 못했습니다 — \(error)" }
                            }
                        }
                        if transitions.isEmpty {
                            Text("이미 \(XUI.termStatus(change.status)) — 되돌릴 수는 운영 탭 문서 편집에서").foregroundStyle(.secondary)
                        }
                    }
                    .frame(width: 110)
                    Text("지금: \(XUI.termStatus(change.status))").font(.caption).foregroundStyle(.secondary)
                }

                XCard("세부 내용") {
                    VStack(spacing: 8) {
                        field("제목", $title)
                        field("이유 (왜 만드나)", $intent)
                        field("목표 (완료 후 상태)", $goal)
                        field("배경", $context)
                        field("범위", $scope)
                        field("완료 기준", $acceptance)
                        HStack {
                            Text("중요도").font(.caption).foregroundStyle(.secondary).frame(width: 140, alignment: .leading)
                            Picker("", selection: $priority) {
                                Text("나중").tag("low")
                                Text("보통").tag("normal")
                                Text("높음").tag("high")
                                Text("최우선").tag("critical")
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
                            Button("위임 문서 만들기") { generate() }
                            Button("클립보드 복사") {
                                let pb = NSPasteboard.general
                                pb.clearContents()
                                pb.setString(handoffMarkdown, forType: .string)
                            }.disabled(handoffMarkdown.isEmpty)
                            Spacer()
                            if !agents.isEmpty {
                                Text("에이전트:").font(.caption)
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
            Button("삭제", role: .destructive) {
                do { try model.deleteChange(id: change.id) }
                catch { model.lastError = "삭제하지 못했습니다 — \(error)" }
            }
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
                        Text("두 곳에서 동시에 바뀌었습니다 — 내 기준 \(c.baseRevision) vs 현재 \(c.canonicalRevision)")
                            .font(.caption)
                    }
                    HStack {
                        Button("Mac 버전 유지") {
                            do { try model.resolveConflictKeepCanonical(targetId: change.id) }
                            catch { model.lastError = "충돌을 정리하지 못했습니다 — \(error)" }
                        }
                        Menu("내 상태 반영…") {
                            ForEach(["PLAN", "BUILD", "REVIEW", "SHIPPED"], id: \.self) { s in
                                Button(XUI.termStatus(s)) {
                                    if let c = related.first {
                                        do { try model.resolveConflictApplyMine(conflict: c, status: s) }
                                        catch { model.lastError = "충돌을 정리하지 못했습니다 — \(error)" }
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

    private func decide(_ id: String, _ status: String) {
        do { try model.resolveProposal(id: id, status: status) }
        catch { model.lastError = "제안을 처리하지 못했습니다 — \(error)" }
    }

    private var proposalsCard: some View {
        let mine = model.proposals(for: change.id)
        let pending = mine.filter { $0.status == "pending" }
        let decided = mine.filter { $0.status != "pending" }.sorted { $0.revision > $1.revision }
        return XCard("제안 — 결정 대기 (\(pending.count))") {
            VStack(alignment: .leading, spacing: 6) {
                if pending.isEmpty {
                    Text("대기 중인 제안 없음").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(decided.prefix(3)) { pr in
                    HStack {
                        Image(systemName: pr.status == "approved" ? "checkmark.circle" : "xmark.circle")
                            .foregroundStyle(pr.status == "approved" ? Color.green : Color.secondary)
                        Text(pr.name).font(.caption).strikethrough(pr.status == "rejected")
                        Spacer()
                        Text(XUI.termStatus(pr.status)).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                ForEach(pending) { pr in
                    if let doc = model.doc(type: "proposal", id: pr.id) {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(doc.fields["name"] ?? pr.name).font(.headline)
                                Text(XUI.termKind(doc.fields["kind"] ?? "DIRECTION")).font(.caption2)
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
                                Button("승인") { decide(pr.id, "approved") }
                                    .buttonStyle(.borderedProminent).controlSize(.small)
                                Button("수정 지시") { decide(pr.id, "modified") }
                                    .controlSize(.small)
                                Button("거절") { decide(pr.id, "rejected") }
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
                                Text(XUI.termStatus(r.status)).font(.caption2.monospaced())
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
                                    Button("승인하고 기능에 반영") {
                                        do { try model.approveChange(id: change.id) }
                                        catch { model.lastError = "승인 조건이 안 됩니다 — 검토 중인 할 일만 승인할 수 있습니다" }
                                    }
                                        .buttonStyle(.borderedProminent).controlSize(.small)
                                    Button("재작업 요청") {
                                        do { try model.requestChangesOn(id: change.id) }
                                        catch { model.lastError = "요청을 기록하지 못했습니다 — \(error)" }
                                    }
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
        XCard("이거 만들어주기 — 에이전트에 위임") {
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
                    Button("문서만 전달") { dispatch(start: false) }
                    Button("전달 + 에이전트 시작") { dispatch(start: true) }
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
            model.lastError = "위임 실패: \(error) — 경로와 쓰기 권한을 확인하세요"
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
        do { try saveInner() } catch { model.lastError = "저장하지 못했습니다 — \(error)" }
    }
    private func saveInner() throws {
        try model.updateChange(id: change.id, fields: [
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
            do { try model.saveBody(type: "change", id: change.id, body: tv.string) }
            catch { model.lastError = "본문을 저장하지 못했습니다 — \(error)" }
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
