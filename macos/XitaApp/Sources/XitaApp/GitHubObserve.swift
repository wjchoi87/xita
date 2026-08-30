import Foundation
import XitaCoreBridge

/// GitHub 관측 (v0.3 §13/§55 — 참조 요약만, 복제 없음).
/// v0.5 §15: 네트워크 transport 는 플랫폼(Swift) 레이어, 쓰기는 Rust core ops.
public enum GitHubObserve {
    public struct Ref: Equatable {
        public let externalId: String
        public let title: String
        public let url: String
        public let state: String
    }

    /// pure function — 네트워크 없이 테스트 가능
    public static func parsePulls(_ data: Data) -> [Ref] {
        guard let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return arr.compactMap { p in
            guard let num = (p["number"] as? NSNumber)?.intValue else { return nil }
            let m = p["merged_at"]
            let merged = m != nil && !(m is NSNull)
            let stateRaw = (p["state"] as? String) ?? "open"
            return Ref(
                externalId: String(num),
                title: (p["title"] as? String) ?? "PR #\(num)",
                url: (p["html_url"] as? String) ?? "",
                state: merged ? "merged" : stateRaw
            )
        }
    }

    static func slug(_ s: String) -> String {
        s.lowercased().replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ".", with: "-")
    }

    /// refs 를 core ops 로 references 에 upsert. 반환 (created, updated)
    @MainActor @discardableResult
    public static func apply(_ refs: [Ref], to model: AppModel, product: String, repo: String) -> (created: Int, updated: Int) {
        var created = 0
        var updated = 0
        for r in refs {
            let id = "\(product)-gh-\(slug(repo))-\(r.externalId)"
            if let existing = model.item("references", id) {
                try? model.applyMulti(
                    target: "reference", targetId: id, baseRevision: existing.revision, kind: "update_field",
                    fields: [
                        .init("name", r.title), .init("url", r.url),
                        .init("status", r.state), .init("observed_at", ISO8601DateFormatter().string(from: Date())),
                    ]
                )
                updated += 1
            } else {
                try? model.applyMulti(
                    target: "reference", targetId: id, baseRevision: 0, kind: "create",
                    fields: [
                        .init("product", product), .init("name", r.title), .init("provider", "GITHUB"),
                        .init("url", r.url), .init("kind", "reference"), .init("object_type", "PR"),
                        .init("external_id", r.externalId), .init("repo", repo), .init("status", r.state),
                    ]
                )
                created += 1
            }
        }
        return (created, updated)
    }

    public static func fetchPullsJSON(repo: String, token: String?) async throws -> Data {
        guard let url = URL(string: "https://api.github.com/repos/\(repo)/pulls?state=all&per_page=15") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, _) = try await URLSession.shared.data(for: req)
        return data
    }

    @MainActor
    public static func observe(model: AppModel, product: String, repo: String, token: String?) async throws -> (created: Int, updated: Int) {
        let data = try await fetchPullsJSON(repo: repo, token: token)
        let refs = parsePulls(data)
        return apply(refs, to: model, product: product, repo: repo)
    }
}