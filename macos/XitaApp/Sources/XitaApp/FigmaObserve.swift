import Foundation

/// Figma 관측 (서버 observe/figma 와 동일 semantics — 참조만 저장).
public enum FigmaObserve {
    public struct PageInfo: Equatable {
        public let id: String
        public let name: String
    }

    /// pure: /v1/files/{key} 응답에서 파일명+페이지 추출
    public static func parseFile(_ data: Data) -> (name: String, pages: [PageInfo]) {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return ("", [])
        }
        let name = (obj["name"] as? String) ?? ""
        let children = (obj["children"] as? [[String: Any]]) ?? []
        let pages = children.filter { ($0["type"] as? String) == "PAGE" }.compactMap { c -> PageInfo? in
            guard let id = c["id"] as? String else { return nil }
            return PageInfo(id: id, name: (c["name"] as? String) ?? id)
        }
        return (name, pages)
    }

    public static func fetchFileJSON(fileKey: String, token: String) async throws -> Data {
        guard let url = URL(string: "https://api.figma.com/v1/files/\(fileKey)") else { throw URLError(.badURL) }
        var req = URLRequest(url: url)
        req.setValue(token, forHTTPHeaderField: "X-Figma-Token")
        let (data, resp) = try await URLSession.shared.data(for: req)
        if let h = resp as? HTTPURLResponse, !(200...299).contains(h.statusCode) {
            throw URLError(.badServerResponse)
        }
        return data
    }

    /// refs 를 references 로 upsert (provider FIGMA)
    @MainActor
    @discardableResult
    public static func apply(model: AppModel, product: String, fileKey: String, parsed: (name: String, pages: [PageInfo])) -> Int {
        var count = 0
        let slugKey = fileKey.lowercased()
        let entries: [PageInfo] = [PageInfo(id: fileKey, name: parsed.name.isEmpty ? fileKey : parsed.name)] + parsed.pages
        for e in entries {
            let id = "\(product)-fig-\(slugKey)-\(e.id.lowercased().replacingOccurrences(of: ":", with: "-"))"
            let url = "https://www.figma.com/file/\(fileKey)"
            if let existing = model.item("references", id) {
                try? model.applyMulti(
                    target: "reference", targetId: id, baseRevision: existing.revision, kind: "update_field",
                    fields: [.init("name", e.name), .init("status", "current")]
                )
            } else {
                try? model.applyMulti(
                    target: "reference", targetId: id, baseRevision: 0, kind: "create",
                    fields: [
                        .init("product", product), .init("name", e.name), .init("provider", "FIGMA"),
                        .init("url", url), .init("kind", "reference"),
                        .init("object_type", e.id == fileKey ? "FILE" : "PAGE"),
                        .init("external_id", e.id), .init("status", "current"),
                    ]
                )
            }
            count += 1
        }
        return count
    }

    @MainActor
    public static func observe(model: AppModel, product: String, fileKey: String, token: String) async throws -> Int {
        let data = try await fetchFileJSON(fileKey: fileKey, token: token)
        return apply(model: model, product: product, fileKey: fileKey, parsed: parseFile(data))
    }
}
