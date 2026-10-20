import SwiftUI
import AppKit

/// XITA macOS — 화면 테마 + 포트폴리오(planner 흡수) 순수 로직.
/// 뷰는 이 파일의 값/함수만 쓰고, 파싱·그룹핑 규칙은 단위 테스트로 고정한다.

// ---- 화면 테마 (시스템 / 라이트 / 다크) ---------------------------------------

/// @AppStorage("xita.appearance") 에 rawValue 로 저장된다.
enum AppAppearance: String, CaseIterable, Identifiable {
    case system, light, dark

    static let storageKey = "xita.appearance"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "시스템"
        case .light: return "라이트"
        case .dark: return "다크"
        }
    }

    /// .preferredColorScheme 값 — 시스템은 nil(OS 설정을 따른다)
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }

    /// macOS 는 preferredColorScheme(nil) 로 되돌릴 때 창이 이전 모드에 남는 경우가 있어
    /// NSApp.appearance 도 함께 맞춘다(시스템 = nil).
    var nsAppearanceName: NSAppearance.Name? {
        switch self {
        case .system: return nil
        case .light: return .aqua
        case .dark: return .darkAqua
        }
    }

    /// 저장값이 비었거나 알 수 없으면 시스템
    static func from(_ raw: String) -> AppAppearance {
        AppAppearance(rawValue: raw) ?? .system
    }
}

/// 테마 적용 — WindowGroup / MenuBarExtra / Settings 콘텐츠 공용
struct AppearanceApplier: ViewModifier {
    @AppStorage(AppAppearance.storageKey) private var appearanceRaw = AppAppearance.system.rawValue

    func body(content: Content) -> some View {
        let a = AppAppearance.from(appearanceRaw)
        content
            .preferredColorScheme(a.colorScheme)
            .onAppear { Self.sync(a) }
            .onChange(of: appearanceRaw) { _, new in Self.sync(AppAppearance.from(new)) }
    }

    static func sync(_ a: AppAppearance) {
        NSApplication.shared.appearance = a.nsAppearanceName.flatMap { NSAppearance(named: $0) }
    }
}

extension View {
    func xitaAppearance() -> some View { modifier(AppearanceApplier()) }
}

/// 설정 화면의 테마 선택 (segmented)
struct AppearancePicker: View {
    @AppStorage(AppAppearance.storageKey) private var appearanceRaw = AppAppearance.system.rawValue

    var body: some View {
        Picker("화면 테마", selection: $appearanceRaw) {
            ForEach(AppAppearance.allCases) { a in
                Text(a.label).tag(a.rawValue)
            }
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 280)
    }
}

// ---- 포트폴리오 카드 (Product frontmatter 확장 필드) ---------------------------

/// Product 1개의 포트폴리오 투영. refresh() 때 한 번 계산해 캐시한다(뷰가 프레임마다 FFI 호출하지 않도록).
struct PortfolioCard: Identifiable, Equatable {
    let id: String
    let name: String
    let codename: String
    let portfolio: String
    let version: String
    let productionStatus: String
    let monetization: String
    let repoPath: String
    let repoExists: Bool
    let archived: Bool
    let activeChanges: Int
    let storeTracks: [String: Int]

    /// Play production 트랙 versionCode (store_tracks 없으면 nil)
    var storeProduction: Int? { storeTracks["production"] }

    init(id: String, name: String, fields: [String: String], activeChanges: Int, repoExists: Bool) {
        self.id = id
        self.name = name
        codename = Self.clean(fields["codename"])
        portfolio = Self.clean(fields["portfolio"])
        version = Self.clean(fields["version"])
        productionStatus = Self.clean(fields["production_status"])
        monetization = Self.clean(fields["monetization"])
        repoPath = Self.clean(fields["repo_path"])
        self.repoExists = repoExists
        archived = Self.parseBool(fields["archived"])
        self.activeChanges = activeChanges
        storeTracks = Self.parseStoreTracks(fields["store_tracks"])
    }

    /// 앞뒤 공백·감싼 따옴표 제거, "null" 은 빈 값
    static func clean(_ raw: String?) -> String {
        var s = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if s.count >= 2, let f = s.first, let l = s.last, (f == "\"" && l == "\"") || (f == "'" && l == "'") {
            s = String(s.dropFirst().dropLast())
        }
        return s == "null" ? "" : s
    }

    static func parseBool(_ raw: String?) -> Bool {
        ["true", "yes", "1"].contains(clean(raw).lowercased())
    }

    /// store_tracks — frontmatter 에 JSON 문자열로 저장된다: {"production":104,"internal":2}
    /// Rust 파서는 scalar 따옴표를 벗기지 않으므로 '…' / "…"(\" 이스케이프) 감싼 형태도 허용.
    /// 숫자 아닌 값·깨진 JSON 은 무시(빈 맵) — 카드가 깨지지 않게 한다.
    static func parseStoreTracks(_ raw: String?) -> [String: Int] {
        var s = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if s.count >= 2, let f = s.first, let l = s.last, (f == "\"" && l == "\"") || (f == "'" && l == "'") {
            s = String(s.dropFirst().dropLast()).replacingOccurrences(of: "\\\"", with: "\"")
        }
        guard s.hasPrefix("{"), let data = s.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        var out: [String: Int] = [:]
        for (k, v) in obj {
            if let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() { out[k] = n.intValue }
            else if let str = v as? String, let n = Int(str) { out[k] = n }
        }
        return out
    }
}

enum PortfolioLogic {
    static let otherGroup = "기타"
    static let archivedGroup = "보관됨"

    /// 사이드바 제품 그룹 — portfolio 값별(이름순), portfolio 없는 제품은 "기타", 보관된 제품은 맨 끝 "보관됨".
    /// 아무 제품도 portfolio 를 갖지 않고 보관된 것도 없으면 그룹 1개(기타) → 뷰는 평면 목록으로 그린다.
    static func groups(_ cards: [PortfolioCard]) -> [(name: String, cards: [PortfolioCard])] {
        let live = cards.filter { !$0.archived }
        let named = Dictionary(grouping: live.filter { !$0.portfolio.isEmpty }, by: \.portfolio)
        var out: [(name: String, cards: [PortfolioCard])] = named.keys.sorted().map { ($0, named[$0] ?? []) }
        let other = live.filter { $0.portfolio.isEmpty }
        if !other.isEmpty { out.append((otherGroup, other)) }
        let archived = cards.filter(\.archived)
        if !archived.isEmpty { out.append((archivedGroup, archived)) }
        return out
    }

    /// 웹 콘솔 주소 — env XITA_HOST(예: http://localhost:4000 · localhost:4000 · 4000), 기본 http://localhost:3333
    static func webConsoleURL(env: [String: String] = ProcessInfo.processInfo.environment) -> URL? {
        var host = (env["XITA_HOST"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if host.isEmpty { host = "http://localhost:3333" }
        else if Int(host) != nil { host = "http://localhost:\(host)" }
        else if !host.contains("://") { host = "http://\(host)" }
        while host.hasSuffix("/") { host.removeLast() }
        return URL(string: host + "/app/")
    }
}
