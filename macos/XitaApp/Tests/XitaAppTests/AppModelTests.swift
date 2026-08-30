import XCTest
@testable import XitaApp
import XitaCoreBridge

@MainActor
final class AppModelTests: XCTestCase {
    private var dir: String = ""

    override func setUpWithError() throws {
        dir = NSTemporaryDirectory() + "xita-app-" + UUID().uuidString
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: dir)
    }

    func testBootstrapAndRefresh() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        XCTAssertTrue(model.items.contains { $0.type == "products" && $0.name == "Novel" })
        XCTAssertTrue(model.items.contains { $0.type == "changes" && $0.id == "ai-recommendation" })
        XCTAssertGreaterThan(model.workspaceRevision, 0)
    }

    func testStageTransitionValid() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        let change = try XCTUnwrap(model.items.first { $0.id == "ai-recommendation" })
        try model.setStage(itemId: change.id, targetType: "changes", status: "BUILD")
        let updated = try XCTUnwrap(model.items.first { $0.id == "ai-recommendation" })
        XCTAssertEqual(updated.status, "BUILD")
    }

    func testInvalidTransitionIsRejected() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        let change = try XCTUnwrap(model.items.first { $0.id == "ai-recommendation" })
        XCTAssertEqual(change.status, "IDEA")
        XCTAssertFalse(model.validTransitions(from: "IDEA").contains("SHIPPED"))
        try model.setStage(itemId: change.id, targetType: "changes", status: "SHIPPED")
        let after = try XCTUnwrap(model.items.first { $0.id == "ai-recommendation" })
        XCTAssertEqual(after.status, "IDEA", "잘못된 전이는 거부되어야 함")
        XCTAssertNotNil(model.lastError)
    }

    func testChangeLinksSelectedProduct_notHardcoded() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.createProduct(name: "CarBook", version: "v2.3.1", description: "차량 예약")
        try model.createChange(productId: "carbook", title: "Reservation Renewal", intent: "예약 갱신", goal: "갱신 플로우")
        let c = try XCTUnwrap(model.items.first { $0.id == "reservation-renewal" })
        XCTAssertEqual(c.product, "carbook", "novel 고정이면 실패")
        XCTAssertEqual(model.changes(for: "carbook").count, 1)
        XCTAssertEqual(model.changes(for: "novel").count, 1)
    }

    func testProductEditAndDelete() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.updateProduct(id: "novel", fields: [.init("version", "v1.5.0"), .init("direction", "구독 강화")])
        let doc = try XCTUnwrap(model.doc(type: "product", id: "novel"))
        XCTAssertEqual(doc.fields["version"], "v1.5.0")
        XCTAssertEqual(doc.fields["direction"], "구독 강화")
        try model.deleteProduct(id: "novel")
        XCTAssertNil(model.item("products", "novel"))
    }

    func testBodyEditingPersists() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.saveBody(type: "change", id: "ai-recommendation", body: "# 목표\n cold start 해결")
        let doc = try XCTUnwrap(model.doc(type: "change", id: "ai-recommendation"))
        XCTAssertTrue(doc.body.contains("cold start"))
    }

    func testWorkbenchPromoteToChange() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.capture(title: "갱신 UX 리서치", content: "마찰 조사")
        let w = try XCTUnwrap(model.items.first { $0.type == "workbench" })
        try model.promoteWorkbench(id: w.id, toProductChange: "novel", title: "Renewal UX")
        let c = try XCTUnwrap(model.items.first { $0.id == "renewal-ux" })
        XCTAssertEqual(c.product, "novel")
        let promoted = try XCTUnwrap(model.items.first { $0.id == w.id })
        XCTAssertEqual(promoted.status, "promoted")
    }

    func testHandoffAndGit() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        let change = try XCTUnwrap(model.items.first { $0.id == "ai-recommendation" })
        let md = try model.handoff(product: change.product, change: change.id)
        XCTAssertTrue(md.contains("# Agent Handoff"))
        XCTAssertTrue(md.contains("Novel"))
        let info = model.gitInfo(dir: "/Users/wjchoi/workspace/xita")
        XCTAssertEqual(info?.isRepo, true)
        XCTAssertEqual(info?.branch, "main")
    }

    func testCapabilitiesAndReadinessFlow() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.addCapability(productId: "novel", name: "Payment Recovery")
        XCTAssertEqual(model.capabilities(for: "novel").map(\.name), ["Payment Recovery"])

        let created = try model.applyShipTemplate(productId: "novel", type: "MOBILE_SAAS")
        XCTAssertEqual(created, 7)
        XCTAssertEqual(try model.applyShipTemplate(productId: "novel", type: "MOBILE_SAAS"), 0, "멱등")
        var sum = try XCTUnwrap(model.readinessSummary(productId: "novel"))
        XCTAssertEqual(sum.overall, 0)
        // cycle PENDING → IN_PROGRESS
        try model.cycleReadinessItem(productId: "novel", kind: "TECH", item: "Backup")
        sum = try XCTUnwrap(model.readinessSummary(productId: "novel"))
        XCTAssertGreaterThan(sum.overall, 0, "IN_PROGRESS 30/32 ≈ 1%")
        // cycle → DONE (30 → 100)
        try model.cycleReadinessItem(productId: "novel", kind: "TECH", item: "Backup")
        sum = try XCTUnwrap(model.readinessSummary(productId: "novel"))
        XCTAssertGreaterThanOrEqual(sum.overall, 3, "DONE 100/32 ≈ 3%")
    }

    func testProposalResolveViaCore() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        _ = try model.applyMulti(
            target: "proposal", targetId: "ai-recommendation-db-change", baseRevision: 0, kind: "create",
            fields: [.init("product", "novel"), .init("name", "테이블 추가 제안"), .init("status", "pending"), .init("kind", "ARCHITECTURE"), .init("severity", "HIGH"), .init("proposal", "payment_recovery_attempts 테이블 추가"), .init("reason", "idempotency 추적")]
        )
        XCTAssertEqual(model.pendingProposals.count, 1)
        try model.resolveProposal(id: "ai-recommendation-db-change", status: "approved")
        XCTAssertEqual(model.pendingProposals.count, 0)
    }

    func testDispatchWritesHandoffFile() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        let change = try XCTUnwrap(model.items.first { $0.id == "ai-recommendation" })
        let dest = dir + "/worktree"
        try FileManager.default.createDirectory(atPath: dest, withIntermediateDirectories: true)
        let file = try model.dispatchChange(change: change, destPath: dest, instruction: "스펙 먼저 읽어라", branch: nil, startAgent: false)
        let content = try String(contentsOfFile: file, encoding: .utf8)
        XCTAssertTrue(content.contains("# Agent Handoff"))
        XCTAssertTrue(content.contains("## Instruction"))
        XCTAssertTrue(content.contains("스펙 먼저 읽어라"))
    }

    func testGitHubParseAndApply() throws {
        let json = #"[{"number":101,"title":"추천 엔진","html_url":"https://gh/x/101","state":"open","merged_at":null},{"number":102,"title":"고침","html_url":"https://gh/x/102","state":"closed","merged_at":"2026-01-01"},{"nope":1}]"#
        let refs = GitHubObserve.parsePulls(Data(json.utf8))
        XCTAssertEqual(refs.count, 2)
        XCTAssertEqual(refs[1].state, "merged", "merged_at → merged")

        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        let r1 = GitHubObserve.apply(refs, to: model, product: "novel", repo: "cli/cli")
        XCTAssertEqual(r1.created, 2)
        let ref = try XCTUnwrap(model.items.first { $0.id == "novel-gh-cli-cli-101" })
        XCTAssertEqual(ref.status, "open")
        let r2 = GitHubObserve.apply(refs, to: model, product: "novel", repo: "cli/cli")
        XCTAssertEqual(r2.created, 0)
        XCTAssertEqual(r2.updated, 2, "재관측은 update")
    }

    func testMacApproveEndToEnd() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.addCapability(productId: "novel", name: "Billing")
        try model.attachCapability(changeId: "ai-recommendation", capabilityId: "novel-billing", action: "DEPRECATE")
        // review 생성 (서버 importAgentResult 와 동일 필자세)
        _ = try model.applyMulti(
            target: "review", targetId: "ai-recommendation-r1", baseRevision: 0, kind: "create",
            fields: [
                .init("change", "ai-recommendation"), .init("name", "구현 리뷰"),
                .init("status", "ready_for_review"),
                .init("delivered", "[\"API\",\"UI\"]"),
                .init("not_delivered", "[\"Cold Start\"]"),
                .init("tests", "[\"43/43\"]"),
            ]
        )
        try model.approveChange(id: "ai-recommendation")
        let cap = try XCTUnwrap(model.items.first { $0.id == "novel-billing" })
        XCTAssertEqual(cap.status, "deprecated", "§51: DEPRECATE 적용")
        let ch = try XCTUnwrap(model.items.first { $0.id == "ai-recommendation" })
        XCTAssertEqual(ch.status, "SHIPPED")
        let rv = try XCTUnwrap(model.items.first { $0.id == "ai-recommendation-r1" })
        XCTAssertEqual(rv.status, "approved")
    }

    func testReleaseLifecycleAndVersionSync() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.createRelease(productId: "novel", name: "v1.5", notes: "추천+구독")
        let rel = try XCTUnwrap(model.releases(for: "novel").first)
        XCTAssertEqual(rel.status, "PLANNED")
        try model.addChangeToRelease(releaseId: rel.id, changeId: "ai-recommendation")
        XCTAssertEqual(model.releaseChangeIds(rel.id), ["ai-recommendation"])
        var rr = model.releaseReadiness(rel.id, productId: "novel")
        XCTAssertEqual(rr.total, 1)
        XCTAssertEqual(rr.shipped, 0)
        XCTAssertFalse(rr.ready)
        // §51 승인 후
        try model.approveChange(id: "ai-recommendation")
        rr = model.releaseReadiness(rel.id, productId: "novel")
        XCTAssertEqual(rr.shipped, 1)
        XCTAssertTrue(rr.ready, "차단 없음 시 출시 가능")
        // RELEASED → 버전 동기 (§9)
        try model.setReleaseStatus(id: rel.id, status: "RELEASED")
        XCTAssertEqual(model.profile("novel")["version"], "v1.5")
        XCTAssertEqual(model.profile("novel")["current_release_id"], rel.id)
        XCTAssertEqual(model.nextRelease("novel"), nil, "미출시 릴리즈 없음")
    }

    func testNextReleaseTracksPlanAndClosest() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.createRelease(productId: "novel", name: "v1.5")
        XCTAssertEqual(model.nextRelease("novel")?.name, "v1.5")
        XCTAssertEqual(model.health("novel").nextRelease, "v1.5")
        try model.setReleaseStatus(id: "novel-v1-5", status: "RELEASED")
        XCTAssertNil(model.nextRelease("novel"))
        // Closest to Ship 소스 데이터 확인
        try model.setStage(itemId: "ai-recommendation", targetType: "changes", status: "BUILD")
        XCTAssertTrue(model.items.contains { $0.type == "changes" && ["SHIP_READY", "REVIEW", "BUILD"].contains($0.status) })
    }

    func testProfileOperationsAndHealth() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.updateProfile(id: "novel", fields: [
            .init("production_status", "PRODUCTION"),
            .init("platforms", "iOS;Android;Web"),
            .init("deployments", "prod|web|https://novel.app;prod|ios|AppStore"),
            .init("repo", "https://github.com/x/novel"),
        ])
        let h = model.health("novel")
        XCTAssertEqual(h.productionStatus, "PRODUCTION")
        XCTAssertEqual(h.operations, "healthy", "배포처 기록 → 운영 healthy")
        XCTAssertEqual(h.distribution, "warning", "PRODUCTION 인데 릴리즈 없음 → 주의")
    }

    func testRoadmapPriorityOrdering() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.createChange(productId: "novel", title: "Low prio", intent: nil, goal: nil)
        try model.createChange(productId: "novel", title: "Critical prio")
        try model.setPriority(changeId: "critical-prio", priority: "critical")
        let plan = model.roadmap("novel")
        XCTAssertEqual(plan.first?.id, "critical-prio", "critical 이 먼저")
    }

    func testDecisionSupersedeChain() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.addDecision(productId: "novel", title: "Paddle 사용", decision: "Paddle", reason: "수수료")
        try model.addDecision(productId: "novel", title: "Stripe로 전환", decision: "Stripe", reason: "국내 카드")
        let oldD = try XCTUnwrap(model.decisions(for: "novel").first { $0.id == "novel-d-paddle" })
        let newD = try XCTUnwrap(model.decisions(for: "novel").first { $0.id == "novel-d-stripe" })
        try model.supersedeDecision(oldId: oldD.id, newId: newD.id)
        XCTAssertEqual(model.decisions(for: "novel").first { $0.id == oldD.id }?.status, "SUPERSEDED")
        XCTAssertEqual(model.docFields(type: "decision", id: newD.id)["supersedes"], oldD.id)
    }

    func testDispatchRecordsAndDrift() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        let change = try XCTUnwrap(model.items.first { $0.id == "ai-recommendation" })
        let dest = dir + "/wt2"
        try FileManager.default.createDirectory(atPath: dest, withIntermediateDirectories: true)
        _ = try model.dispatchChange(change: change, destPath: dest, instruction: "read spec", branch: nil, startAgent: false)
        XCTAssertEqual(model.items.filter { $0.type == "dispatches" }.count, 1, "§67 Dispatches 이력")
        // drift: dispatched 1 < current 2
        _ = try model.applyMulti(
            target: "artifact", targetId: "spec-a", baseRevision: 0, kind: "create",
            fields: [.init("product", "novel"), .init("name", "스펙"), .init("current_revision", "2"), .init("last_dispatched_revision", "1")]
        )
        let rows = model.drifts()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.severity, "MEDIUM")
    }

    func testFigmaParseAndApply() throws {
        let json = "{\"name\":\"Novel Design\",\"children\":[{\"id\":\"0:1\",\"name\":\"Cover\",\"type\":\"PAGE\"},{\"id\":\"1:2\",\"name\":\"Flows\",\"type\":\"PAGE\"},{\"id\":\"x\",\"type\":\"CANVAS\"}]}".data(using: .utf8)!
        // 재사용: json 변수가 이미 Data
        let parsed = FigmaObserve.parseFile(json)
        XCTAssertEqual(parsed.name, "Novel Design")
        XCTAssertEqual(parsed.pages.count, 2, "PAGE 만")
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        let n = FigmaObserve.apply(model: model, product: "novel", fileKey: "ABC123", parsed: parsed)
        XCTAssertEqual(n, 3, "FILE+PAGE2")
        XCTAssertEqual(model.items.filter { $0.type == "references" && $0.product == "novel" }.count, 3)
    }

    func testSettingsRoundTripAndAgentCmd() throws {
        let model = AppModel(workspaceDir: dir)
        try model.ensureWorkspace()
        model.saveSettings(.init(agentCmd: "echo hi", defaultDest: "/tmp/x"))
        let loaded = model.loadSettings()
        XCTAssertEqual(loaded.agentCmd, "echo hi")
        XCTAssertEqual(loaded.defaultDest, "/tmp/x")
        // env 우선: 이 테스트 프로세스에 XITA_AGENT_CMD 가 없으면 settings 값이 effective
        if ProcessInfo.processInfo.environment["XITA_AGENT_CMD"] == nil {
            XCTAssertEqual(model.effectiveAgentCmd(), "echo hi")
        }
    }

    func testCreateProductWithTemplateAppliesDoS() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.createProduct(name: "CarBook", productType: "WEB_SAAS")
        // 템플릿 자동 적용 → readiness 그룹 5개 + overall 0
        let sum = try XCTUnwrap(model.readinessSummary(productId: "carbook"))
        XCTAssertEqual(sum.overall, 0)
        let groups = model.items.filter { $0.type == "readiness" && $0.product == "carbook" }
        XCTAssertEqual(groups.count, 5)
    }

    func testShipTemplatePreviewFromCore() {
        let mobile = XitaBridge.shipTemplatePreview(type: "MOBILE_SAAS")
        let web = XitaBridge.shipTemplatePreview(type: "WEB_SAAS")
        XCTAssertEqual(mobile.count, 7)
        XCTAssertEqual(web.count, 5)
        XCTAssertTrue(mobile.contains { $0.kind == "STORE" && $0.items.contains("Play Store") })
    }

    func testMilestonesWeightedProgressAndFocus() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.createMilestone(productId: "novel", name: "Beta 1", targetDate: "2030-01-01")
        var ms = model.milestones(for: "novel")
        XCTAssertEqual(ms.count, 1)
        XCTAssertTrue(ms[0].isFocus, "미완료 첫 마일스톤 = focus")
        XCTAssertFalse(ms[0].isOverdue)
        XCTAssertEqual(ms[0].progress, 0)

        // ai-recommendation(BUILD 0.5) 할당 → 50%
        try model.setStage(itemId: "ai-recommendation", targetType: "changes", status: "BUILD")
        try model.setMilestone(changeId: "ai-recommendation", milestoneId: ms[0].milestoneId)
        ms = model.milestones(for: "novel")
        XCTAssertEqual(ms[0].progress, 50, "가중 진행률")
        XCTAssertEqual(ms[0].changes.count, 1)

        // 새 IDEA change(0.1) 추가 → (0.5+0.1)/2 = 30%
        try model.createChange(productId: "novel", title: "Second Thing")
        try model.setMilestone(changeId: "second-thing", milestoneId: ms[0].milestoneId)
        ms = model.milestones(for: "novel")
        XCTAssertEqual(ms[0].progress, 30)
        XCTAssertEqual(model.unassignedChanges("novel").count, 0)

        // done → focus 해제 + 상태 침
        try model.setMilestoneStatus(id: ms[0].milestoneId, status: "done")
        ms = model.milestones(for: "novel")
        XCTAssertFalse(ms[0].isFocus)
        XCTAssertEqual(ms[0].status, "done")
    }

    func testOverdueMilestone() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.createMilestone(productId: "novel", name: "Past due", targetDate: "2020-01-01")
        let ms = model.milestones(for: "novel")
        XCTAssertTrue(ms[0].isOverdue)
    }

    func testLocalAskAndSummary() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.addDecision(productId: "novel", title: "Paddle 채택", decision: "Paddle", reason: "글로벌 세금")
        let r1 = model.askLocal("왜 Paddle을 사용하고 있지?")
        XCTAssertEqual(r1.intent, "decision")
        XCTAssertTrue(r1.answer.contains("Paddle"), r1.answer)
        XCTAssertTrue(r1.sources.contains { $0.kind == "decision" }, "§87 근거")
        let r2 = model.askLocal("현재 운영중인 제품 버전은?")
        XCTAssertEqual(r2.intent, "version")
        XCTAssertTrue(r2.answer.contains("Novel"), r2.answer)
        XCTAssertTrue(model.summaryText().contains("최근"))
    }

    func testConflictRecordedAndResolved() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        // stale(base 0, canonical 1) + status(semantic) → CONFLICT
        _ = try model.applyMulti(target: "change", targetId: "ai-recommendation", baseRevision: 0, kind: "update_status", fields: [.init("status", "SHIPPED")])
        XCTAssertEqual(model.conflicts.count, 1)
        let c = try XCTUnwrap(model.conflicts.first)
        XCTAssertEqual(c.targetId, "ai-recommendation")
        // keep canonical → 기록 정리
        try model.resolveConflictKeepCanonical(targetId: c.targetId)
        XCTAssertEqual(model.conflicts.count, 0)
        // status 는 CONFLICT 로 미변경 (canonical IDEA-1step 후 REVIEW? bootstrap 후 BUILD? — 어쨌든 SHIPPED 아님)
        let after = try XCTUnwrap(model.items.first { $0.id == "ai-recommendation" })
        XCTAssertNotEqual(after.status, "SHIPPED")
    }

    // ---- Research wave1/2 반영: insight / scorecard / dispatch 런 루프 ----

    func testInsightCreateAndCycle() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.addInsight(productId: "novel", title: "3일차 이탈 집중", kind: "observation", content: "온보딩 미완성 62% 이탈")
        let ins = model.insights(for: "novel")
        XCTAssertEqual(ins.count, 1)
        XCTAssertEqual(ins[0].status, "OPEN")
        XCTAssertEqual(model.docFields(type: "insight", id: ins[0].id)["kind"], "OBSERVATION")
        try model.cycleInsightStatus(id: ins[0].id)
        XCTAssertEqual(model.docFields(type: "insight", id: ins[0].id)["status"], "VALIDATED")
    }

    func testValueScoreDrivesRoadmapOrder() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.createChange(productId: "novel", title: "low prio but scored")
        try model.createChange(productId: "novel", title: "critical unscored")
        let scored = try XCTUnwrap(model.items.first { $0.name == "low prio but scored" })
        try model.setPriority(changeId: scored.id, priority: "low")
        let unscored = try XCTUnwrap(model.items.first { $0.name == "critical unscored" })
        try model.setPriority(changeId: unscored.id, priority: "critical")
        // 채점 전: critical 우선
        XCTAssertEqual(model.roadmap("novel").first?.id, unscored.id)
        // Aha 공식: (8+9+7-4)×(8/10) = 16.0 → critical priority 역전
        try model.scoreChange(changeId: scored.id, pop: 8, need: 9, strat: 7, effort: 4, conf: 8)
        XCTAssertEqual(try XCTUnwrap(model.valueScore(scored.id)), 16.0, accuracy: 0.01)
        XCTAssertEqual(model.roadmap("novel").first?.id, scored.id)
    }

    func testEventLogFeedsTwoLayerTimeline() throws {
        // Two-Layer: dev workspace의 events.jsonl에 마커 타입이 실재해야 펼침 목록이 생긴다
        let ws = "/Users/wjchoi/workspace/xita/apps/server/.xita-workspace"
        guard FileManager.default.fileExists(atPath: ws) else { return }
        let model = AppModel(workspaceDir: ws)
        let events = model.eventLog(limit: 60)
        let markers = ["MAJOR_DECISION", "RELEASED", "CHANGE_APPROVED", "DISPATCHED", "INSIGHT_CREATED", "CHANGE_SCORED"]
        XCTAssertTrue(events.contains { e in markers.contains(e.type) }, "타임라인 마커 없음: \(events.count)건")
    }

    func testDispatchAwaitingPromotesToNeedsYou() throws {
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        let before = model.needsYouCount
        let change = try XCTUnwrap(model.items.first { $0.id == "ai-recommendation" })
        try model.dispatchChange(change: change, destPath: dir, instruction: "", branch: nil, startAgent: false)
        let d = try XCTUnwrap(model.dispatchItems.first)
        XCTAssertEqual(d.status, "DISPATCHED")
        XCTAssertEqual(model.needsYouCount, before, "DISPATCHED 는 대기 아님")
        try model.setDispatchStatus(id: d.id, status: "AWAITING_INPUT")
        XCTAssertEqual(model.waitingDispatches.count, 1)
        XCTAssertEqual(model.needsYouCount, before + 1)
    }
}
