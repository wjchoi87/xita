import CXitaCore
import Foundation

/// Swift ↔ Rust 브리지 (v0.5 §7-§9, Phase 2).
///
/// 호출은 전부 coarse-grained: 경로+스칼라/문자열 인자 → UTF-8 JSON 문자열.
/// 반환 포인터는 반드시 `xita_free_string` 로 해제한다. 오류는
/// `{ok:false, code, message, recoverable}` 로 typed error 계약을 전달한다.
public enum XitaBridgeError: Error, CustomStringConvertible {
    case rust(code: String?, message: String)
    case invalidResponse

    public var description: String {
        switch self {
        case .rust(let code, let message):
            return "xita-core error [\(code ?? "-")]: \(message)"
        case .invalidResponse:
            return "xita-core: invalid bridge response"
        }
    }
}

public final class XitaBridge {
    public init() {}

    /// 단일 C 호출 래퍼: C 문자열 인자를 만들고, JSON 응답을 [String: Any] 로 디코드.
    private func call(_ fn: (UnsafeMutablePointer<CChar>?) -> UnsafeMutablePointer<CChar>?) throws -> [String: Any] {
        guard let raw = fn(nil) else { throw XitaBridgeError.invalidResponse }
        defer { xita_free_string(raw) }
        let swift = String(cString: raw)
        guard let data = swift.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            throw XitaBridgeError.invalidResponse
        }
        if let ok = obj["ok"] as? Bool, !ok {
            throw XitaBridgeError.rust(code: obj["code"] as? String, message: obj["message"] as? String ?? swift)
        }
        return obj
    }

    // ---- public API ------------------------------------------------------

    public func openWorkspace(path: String) throws -> [String: Any] {
        try path.withCString { p in
            try call { _ in xita_ws_open(p) }
        }
    }

    public func applyOperation(
        path: String,
        opId: String,
        deviceId: String,
        target: String,
        targetId: String,
        baseRevision: UInt64,
        kind: String,
        fieldKey: String,
        fieldValue: String
    ) throws -> [String: Any] {
        try path.withCString { pathC in
            try opId.withCString { opC in
                try deviceId.withCString { devC in
                    try target.withCString { targetC in
                        try targetId.withCString { tidC in
                            try kind.withCString { kindC in
                                try fieldKey.withCString { keyC in
                                    try fieldValue.withCString { valC in
                                        try call { _ in
                                            xita_ws_apply_op(pathC, opC, devC, targetC, tidC, baseRevision, kindC, keyC, valC)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    public func pull(path: String, cursor: UInt64) throws -> [String: Any] {
        try path.withCString { p in
            try call { _ in xita_ws_pull(p, cursor) }
        }
    }

    public func indexRebuild(path: String) throws -> [String: Any] {
        try path.withCString { p in
            try call { _ in xita_ws_index_rebuild(p) }
        }
    }
}
// MARK: - v0.5 Phase 6 확장 (multi-field / handoff / agents / git)

public extension XitaBridge {
    struct Field {
        public let key: String
        public let value: String
        public init(_ key: String, _ value: String) {
            self.key = key
            self.value = value
        }
    }

    /// fields 를 `key\tvalue\n` TSV 로 인코딩 (Rust parse_fields_tsv 와 짝).
    private static func encodeFields(_ fields: [Field]) -> String {
        fields
            .map { f in
                let v = f.value.replacingOccurrences(of: "\t", with: " ").replacingOccurrences(of: "\n", with: " ")
                return "\(f.key)\t\(v)"
            }
            .joined(separator: "\n")
    }

    @discardableResult
    func applyOperationMulti(
        path: String, opId: String, deviceId: String, target: String, targetId: String,
        baseRevision: UInt64, kind: String, fields: [Field]
    ) throws -> [String: Any] {
        let tsv = Self.encodeFields(fields)
        return try path.withCString { pathC in
            try opId.withCString { opC in
                try deviceId.withCString { devC in
                    try target.withCString { targetC in
                        try targetId.withCString { tidC in
                            try kind.withCString { kindC in
                                try tsv.withCString { tsvC in
                                    try call { _ in
                                        xita_ws_apply_op_multi(pathC, opC, devC, targetC, tidC, baseRevision, kindC, tsvC)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /// canonical Agent Handoff(markdown)
    func buildHandoff(path: String, product: String, change: String) throws -> String {
        let out = try path.withCString { p in
            try product.withCString { pr in
                try change.withCString { c in
                    try call { _ in xita_build_handoff(p, pr, c) }
                }
            }
        }
        return out["markdown"] as? String ?? ""
    }

    func detectAgents() throws -> [String] {
        let out = try call { _ in xita_detect_agents() }
        return out["agents"] as? [String] ?? []
    }

    struct GitInfo {
        public let isRepo: Bool
        public let branch: String?
        public let remote: String?
        public let head: String?
    }

    func gitInspect(dir: String) throws -> GitInfo {
        let out = try dir.withCString { d in
            try call { _ in xita_git_inspect(d) }
        }
        return GitInfo(
            isRepo: out["is_repo"] as? Bool ?? false,
            branch: out["branch"] as? String,
            remote: out["remote"] as? String,
            head: out["head"] as? String
        )
    }
}

// MARK: - conflicts / doc detail / transitions / body

public extension XitaBridge {
    struct DocDetail {
        public let fields: [String: String]
        public let body: String
    }

    func conflicts(path: String) throws -> [[String: Any]] {
        let out = try path.withCString { p in try call { _ in xita_ws_conflicts(p) } }
        return out["conflicts"] as? [[String: Any]] ?? []
    }

    func getDoc(path: String, target: String, id: String) throws -> DocDetail {
        let out = try path.withCString { p in
            try target.withCString { t in
                try id.withCString { i in
                    try call { _ in xita_ws_get_doc(p, t, i) }
                }
            }
        }
        return DocDetail(fields: out["fields"] as? [String: String] ?? [:], body: out["body"] as? String ?? "")
    }

    func validTransitions(from status: String) -> [String] {
        guard let out = try? status.withCString({ s in try call { _ in xita_valid_transitions(s) } }) else { return [] }
        return out["transitions"] as? [String] ?? []
    }

    @discardableResult
    func setBody(path: String, target: String, id: String, body: String) throws -> [String: Any] {
        try path.withCString { p in
            try target.withCString { t in
                try id.withCString { i in
                    try body.withCString { b in
                        try call { _ in xita_ws_set_body(p, t, i, b) }
                    }
                }
            }
        }
    }

    @discardableResult
    func deleteDoc(path: String, target: String, id: String) throws -> [String: Any] {
        try applyOperationMulti(
            path: path, opId: "del-\(UUID().uuidString)", deviceId: "xita-macos",
            target: target, targetId: id, baseRevision: 0, kind: "delete", fields: []
        )
    }
}

// MARK: - readiness / ship template

public extension XitaBridge {
    struct ReadinessSummary {
        public let overall: Int
        public let blockers: [String]
    }

    @discardableResult
    func applyShipTemplate(path: String, product: String, productType: String = "MOBILE_SAAS") throws -> Int {
        let out = try path.withCString { p in
            try product.withCString { pr in
                try productType.withCString { t in
                    try call { _ in xita_apply_ship_template(p, pr, t) }
                }
            }
        }
        return out["groups"] as? Int ?? 0
    }

    @discardableResult
    func patchReadiness(path: String, product: String, kind: String, item: String, status: String, progress: UInt64) throws -> Bool {
        let out = try path.withCString { p in
            try product.withCString { pr in
                try kind.withCString { k in
                    try item.withCString { i in
                        try status.withCString { s in
                            try call { _ in xita_patch_readiness(p, pr, k, i, s, progress) }
                        }
                    }
                }
            }
        }
        return out["changed"] as? Bool ?? false
    }

    func readiness(path: String, product: String) throws -> ReadinessSummary {
        let out = try path.withCString { p in
            try product.withCString { pr in
                try call { _ in xita_ws_readiness(p, pr) }
            }
        }
        return ReadinessSummary(
            overall: out["overall"] as? Int ?? 0,
            blockers: out["blockers"] as? [String] ?? []
        )
    }
}

public extension XitaBridge {
    @discardableResult
    func approveChange(path: String, changeId: String) throws -> [String: Any] {
        try path.withCString { p in
            try changeId.withCString { c in
                try call { _ in xita_ws_approve_change(p, c) }
            }
        }
    }
}

public extension XitaBridge {
    struct TemplateGroup {
        public let kind: String
        public let items: [String]
    }

    static func shipTemplatePreview(type: String) -> [TemplateGroup] {
        let bridge = XitaBridge()
        guard let out = try? type.withCString({ t in
            try bridge.call { _ in xita_ship_template_preview(t) }
        }) else { return [] }
        let groups = out["groups"] as? [[String: Any]] ?? []
        return groups.map { g in
            TemplateGroup(kind: g["kind"] as? String ?? "", items: g["items"] as? [String] ?? [])
        }
    }
}
