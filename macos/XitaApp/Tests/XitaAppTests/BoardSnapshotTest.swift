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
