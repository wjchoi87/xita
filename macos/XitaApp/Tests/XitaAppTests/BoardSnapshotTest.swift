import XCTest
import SwiftUI
import AppKit
@testable import XitaApp

/// 화면 산출물 검증 — 보드 컴포넌트를 실제 dev workspace 데이터로 렌더해 PNG로 남긴다.
/// (UI 테스트를 "빌드 성공"으로 대체하지 않기 위한 장치)
@MainActor
final class BoardSnapshotTest: XCTestCase {
    func testBoardRendersFromDevWorkspace() throws {
        let ws = "/Users/wjchoi/workspace/xita/apps/server/.xita-workspace"
        guard FileManager.default.fileExists(atPath: ws) else { throw XCTSkip("dev workspace 없음") }
        let model = AppModel(workspaceDir: ws)
        try model.refresh()
        let novel = try XCTUnwrap(model.items.first { $0.type == "products" && $0.id == "novel" })
        let stages = ["IDEA", "PLAN", "BUILD", "REVIEW", "SHIP_READY"]
        let board = HStack(alignment: .top, spacing: 10) {
            ForEach(stages, id: \.self) { stage in
                BoardColumn(
                    stage: stage,
                    changes: model.changes(for: novel.id).filter { $0.status == stage },
                    all: model.milestones(for: novel.id)
                )
            }
        }
        .padding()
        .frame(width: 1200, height: 700)
        .environmentObject(model)
        let renderer = ImageRenderer(content: board)
        renderer.scale = 2
        guard let image = renderer.nsImage,
              let tiff = image.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else {
            return XCTFail("ImageRenderer produced nothing")
        }
        let out = "/tmp/xita-board-snapshot.png"
        try png.write(to: URL(fileURLWithPath: out))
        XCTAssertGreaterThan(png.count, 20_000, "snapshot suspiciously small")
        print("board snapshot → \(out)")
    }

    func testPlanLanesRender() throws {
        let ws = "/Users/wjchoi/workspace/xita/apps/server/.xita-workspace"
        guard FileManager.default.fileExists(atPath: ws) else { throw XCTSkip("dev workspace 없음") }
        let model = AppModel(workspaceDir: ws)
        try model.refresh()
        let novel = try XCTUnwrap(model.items.first { $0.type == "products" && $0.id == "novel" })
        let ms = model.milestones(for: novel.id).filter { $0.status != "done" }
        let lanes = HStack(alignment: .top, spacing: 10) {
            PlanLane(title: "지금 (Now)", subtitle: ms.first?.name ?? "포커스 마일스톤 없음",
                     count: ms.first?.changes.count ?? 0, weeks: 0, overdue: false) {
                ForEach(ms.first?.changes ?? []) { c in PlanChangeRow(change: c, milestones: ms) }
                QuickAddChangeRow(productId: novel.id, milestoneId: ms.first?.milestoneId)
            }
            PlanLane(title: "나중 (Later)", subtitle: "아직 약속 안 한 할 일",
                     count: model.unassignedChanges(novel.id).count, weeks: 0, overdue: false) {
                ForEach(model.unassignedChanges(novel.id)) { c in PlanChangeRow(change: c, milestones: ms) }
            }
        }.padding().frame(width: 700, height: 420).environmentObject(model)
        let r = ImageRenderer(content: lanes)
        r.scale = 2
        guard let img = r.nsImage, let tiff = img.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else {
            return XCTFail("plan render failed")
        }
        try png.write(to: URL(fileURLWithPath: "/tmp/xita-plan-snapshot.png"))
        XCTAssertGreaterThan(png.count, 10_000)
    }

    func testPlanLaneWithMilestoneDescSnapshot() throws {
        let dir = NSTemporaryDirectory() + "xita-snap-" + UUID().uuidString
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.createMilestone(productId: "novel", name: "Internal alpha", targetDate: "2026-11-15", desc: "지인이 써볼 수 있는 상태")
        try model.createChange(productId: "novel", title: "오프라인 초안 저장", intent: "기내에서도 집필")
        if let ch = model.items.first(where: { $0.name == "오프라인 초안 저장" }) {
            try model.setMilestone(changeId: ch.id, milestoneId: "novel-m-internal-alpha")
            try model.scoreChange(changeId: ch.id, pop: 7, need: 8, strat: 9, effort: 3, conf: 7)
        }
        let ms = model.milestones(for: "novel").filter { $0.status != "done" }
        let lane = PlanLane(title: "지금 (Now)",
                            subtitle: (ms.first.map { ($0.desc.isEmpty ? $0.name : $0.desc) + " · " + (($0.targetDate ?? "").isEmpty ? "" : String(($0.targetDate ?? "").prefix(10)) + "까지") }) ?? "",
                            count: ms.first?.changes.count ?? 0, weeks: 1, overdue: false, done: Double(ms.first?.progress ?? 0)) {
            ForEach(ms.first?.changes ?? []) { c in PlanChangeRow(change: c, milestones: ms) }
            QuickAddChangeRow(productId: "novel", milestoneId: ms.first?.milestoneId)
        }.frame(width: 300, height: 260).environmentObject(model)
        let r = ImageRenderer(content: lane)
        r.scale = 2
        guard let img = r.nsImage, let tiff = img.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else {
            return XCTFail("lane render failed")
        }
        try png.write(to: URL(fileURLWithPath: "/tmp/xita-nowlane-snapshot.png"))
        XCTAssertGreaterThan(png.count, 8_000)
    }

    func testUserHomeWorkspaceRender() throws {
        let ws = NSHomeDirectory() + "/.xita-workspace"
        guard FileManager.default.fileExists(atPath: ws) else { throw XCTSkip("no user ws") }
        let model = AppModel(workspaceDir: ws)
        try model.refresh()
        let prods = model.products
        guard let p0 = prods.first else { return }
        let ms = model.milestones(for: p0.id)
        let view = VStack(alignment: .leading, spacing: 12) {
            Text(p0.name).font(.title2.bold())
            Text("\(model.changes(for: p0.id).count)개의 할 일").font(.caption)
            ForEach(ms) { m in
                VStack(alignment: .leading, spacing: 2) {
                    Text(m.name).font(.headline)
                    Text("진행률 \(m.progress)% · 초점 \(m.isFocus ? "예" : "아니오") · 상태 \(XUI.termStatus(m.status))")
                        .font(.caption)
                }.padding().background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
            }
        }.padding().frame(width: 520, height: 400, alignment: .topLeading).environmentObject(model)
        let r = ImageRenderer(content: view)
        r.scale = 2
        guard let img = r.nsImage, let tiff = img.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else {
            return XCTFail("user-ws render failed")
        }
        try png.write(to: URL(fileURLWithPath: "/tmp/xita-userws-snapshot.png"))
    }

    func testTimelineTwoLayerRender() throws {
        let ws = "/Users/wjchoi/workspace/xita/apps/server/.xita-workspace"
        guard FileManager.default.fileExists(atPath: ws) else { throw XCTSkip("dev workspace 없음") }
        let model = AppModel(workspaceDir: ws)
        try model.refresh()
        let view = VStack(alignment: .leading) {
            Text("자취 — Novel").font(.headline)
            TimelineSection(productId: "novel")
        }.padding().frame(width: 420, height: 520).environmentObject(model)
        let r = ImageRenderer(content: view)
        r.scale = 2
        guard let img = r.nsImage, let tiff = img.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else {
            return XCTFail("timeline render failed")
        }
        try png.write(to: URL(fileURLWithPath: "/tmp/xita-timeline-snapshot.png"))
    }
}
