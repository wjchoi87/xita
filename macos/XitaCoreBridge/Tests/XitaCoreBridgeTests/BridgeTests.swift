import XCTest
@testable import XitaCoreBridge

final class BridgeTests: XCTestCase {
    private var workspaceDir: String = ""

    override func setUpWithError() throws {
        let dir = NSTemporaryDirectory() + "xita-bridge-" + UUID().uuidString
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        workspaceDir = dir
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: workspaceDir)
    }

    func testOpenWorkspace() throws {
        let bridge = XitaBridge()
        let out = try bridge.openWorkspace(path: workspaceDir)
        XCTAssertEqual(out["ok"] as? Bool, true)
        XCTAssertEqual(out["schema_version"] as? Int, 1)
    }

    func testCreateThenSafeUpdate() throws {
        let bridge = XitaBridge()
        _ = try bridge.openWorkspace(path: workspaceDir)

        let created = try bridge.applyOperation(
            path: workspaceDir, opId: "op-1", deviceId: "ios-01", target: "change",
            targetId: "c1", baseRevision: 0, kind: "create", fieldKey: "status", fieldValue: "IDEA"
        )
        XCTAssertEqual(created["status"] as? String, "APPLIED")
        XCTAssertEqual(created["entity_revision"] as? Int, 1)

        let updated = try bridge.applyOperation(
            path: workspaceDir, opId: "op-2", deviceId: "ios-01", target: "change",
            targetId: "c1", baseRevision: 1, kind: "update_status", fieldKey: "status", fieldValue: "BUILD"
        )
        XCTAssertEqual(updated["verdict"] as? String, "SAFE")
    }

    func testStaleStatusConflictAndTypedError() throws {
        let bridge = XitaBridge()
        _ = try bridge.openWorkspace(path: workspaceDir)
        _ = try bridge.applyOperation(
            path: workspaceDir, opId: "op-1", deviceId: "ios-01", target: "change",
            targetId: "c1", baseRevision: 0, kind: "create", fieldKey: "status", fieldValue: "IDEA"
        )
        // stale base(0, canonical 은 1) + status(semantic) → CONFLICT
        let conflict = try bridge.applyOperation(
            path: workspaceDir, opId: "op-3", deviceId: "ios-01", target: "change",
            targetId: "c1", baseRevision: 0, kind: "update_status", fieldKey: "status", fieldValue: "SHIPPED"
        )
        XCTAssertEqual(conflict["status"] as? String, "CONFLICT")
        XCTAssertEqual(conflict["verdict"] as? String, "CONFLICT")

        // 워크스페이스 없음 → typed error (XitaBridgeError.rust)
        do {
            _ = try bridge.openWorkspace(path: workspaceDir + "/does-not-exist")
            XCTFail("expected typed error")
        } catch let XitaBridgeError.rust(code, _) {
            XCTAssertEqual(code, "WORKSPACE_NOT_FOUND")
        }
    }

    func testPullIncremental() throws {
        let bridge = XitaBridge()
        _ = try bridge.openWorkspace(path: workspaceDir)
        _ = try bridge.applyOperation(
            path: workspaceDir, opId: "op-p", deviceId: "ios-01", target: "product",
            targetId: "novel", baseRevision: 0, kind: "create", fieldKey: "name", fieldValue: "Novel"
        )
        _ = try bridge.indexRebuild(path: workspaceDir)

        let pulled = try bridge.pull(path: workspaceDir, cursor: 0)
        XCTAssertEqual(pulled["ok"] as? Bool, true)
        let changes = pulled["changes"] as? [[String: Any]]
        XCTAssertEqual(changes?.count, 1)
        XCTAssertEqual(changes?.first?["type"] as? String, "products")
    }
}