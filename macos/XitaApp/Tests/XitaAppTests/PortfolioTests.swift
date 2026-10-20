import XCTest
import SwiftUI
@testable import XitaApp

/// 테마 매핑 · store_tracks 파싱 · 포트폴리오 그룹핑 · 웹 콘솔 주소 (planner 흡수, 2026-10)
@MainActor
final class PortfolioTests: XCTestCase {

    // ---- 화면 테마 ----

    func testAppearanceMapping() {
        XCTAssertNil(AppAppearance.system.colorScheme, "시스템은 nil 이어야 OS 설정을 따른다")
        XCTAssertEqual(AppAppearance.light.colorScheme, .light)
        XCTAssertEqual(AppAppearance.dark.colorScheme, .dark)
        XCTAssertNil(AppAppearance.system.nsAppearanceName)
        XCTAssertEqual(AppAppearance.light.nsAppearanceName, .aqua)
        XCTAssertEqual(AppAppearance.dark.nsAppearanceName, .darkAqua)
        XCTAssertEqual(AppAppearance.allCases.map(\.label), ["시스템", "라이트", "다크"])
        XCTAssertEqual(AppAppearance.storageKey, "xita.appearance")
    }

    func testAppearanceFromUnknownFallsBackToSystem() {
        XCTAssertEqual(AppAppearance.from("dark"), .dark)
        XCTAssertEqual(AppAppearance.from(""), .system)
        XCTAssertEqual(AppAppearance.from("sepia"), .system)
    }

    // ---- store_tracks ----

    func testStoreTracksParsing() {
        XCTAssertEqual(PortfolioCard.parseStoreTracks(#"{"production":104,"internal":2}"#), ["production": 104, "internal": 2])
        // frontmatter 에 따옴표로 감싸 저장된 경우(Rust scalar 는 따옴표를 벗기지 않음)
        XCTAssertEqual(PortfolioCard.parseStoreTracks(#"'{"production":104}'"#), ["production": 104])
        XCTAssertEqual(PortfolioCard.parseStoreTracks(#""{\"beta\":7}""#), ["beta": 7])
        // 문자열 숫자 허용, 비숫자/불리언 무시
        XCTAssertEqual(PortfolioCard.parseStoreTracks(#"{"production":"12","alpha":null,"x":true}"#), ["production": 12])
        // 비었거나 깨진 값 → 빈 맵(카드가 깨지지 않음)
        XCTAssertEqual(PortfolioCard.parseStoreTracks(nil), [:])
        XCTAssertEqual(PortfolioCard.parseStoreTracks(""), [:])
        XCTAssertEqual(PortfolioCard.parseStoreTracks("{broken"), [:])
        XCTAssertEqual(PortfolioCard.parseStoreTracks("null"), [:])
    }

    func testCardFieldsCleanAndArchived() {
        let c = PortfolioCard(id: "beamlink", name: "BeamLink", fields: [
            "codename": "BeamLink", "portfolio": "auto-money", "version": "1.2.0",
            "production_status": "PRODUCTION", "monetization": "\"ads\"", "repo_path": "null",
            "archived": "true", "store_tracks": #"{"production":104}"#,
        ], activeChanges: 3, repoExists: false)
        XCTAssertEqual(c.monetization, "ads", "감싼 따옴표 제거")
        XCTAssertEqual(c.repoPath, "", "null 은 빈 값")
        XCTAssertTrue(c.archived)
        XCTAssertEqual(c.storeProduction, 104)
        XCTAssertEqual(c.activeChanges, 3)
        let none = PortfolioCard(id: "x", name: "X", fields: [:], activeChanges: 0, repoExists: false)
        XCTAssertFalse(none.archived)
        XCTAssertNil(none.storeProduction)
    }

    // ---- 그룹핑 ----

    private func card(_ id: String, portfolio: String = "", archived: Bool = false) -> PortfolioCard {
        PortfolioCard(id: id, name: id, fields: ["portfolio": portfolio, "archived": archived ? "true" : "false"],
                      activeChanges: 0, repoExists: false)
    }

    func testPortfolioGroupingOrder() {
        let groups = PortfolioLogic.groups([
            card("a", portfolio: "zeta"), card("b"), card("c", portfolio: "auto-money"),
            card("d", portfolio: "auto-money", archived: true), card("e", portfolio: "zeta"),
        ])
        XCTAssertEqual(groups.map(\.name), ["auto-money", "zeta", "기타", "보관됨"], "이름순 → 기타 → 보관됨")
        XCTAssertEqual(groups[0].cards.map(\.id), ["c"], "보관된 d 는 portfolio 그룹에서 빠진다")
        XCTAssertEqual(groups[1].cards.map(\.id), ["a", "e"])
        XCTAssertEqual(groups[2].cards.map(\.id), ["b"])
        XCTAssertEqual(groups[3].cards.map(\.id), ["d"])
    }

    func testPortfolioGroupingWithoutPortfolioIsSingleOtherGroup() {
        let groups = PortfolioLogic.groups([card("a"), card("b")])
        XCTAssertEqual(groups.map(\.name), ["기타"], "포트폴리오 필드가 없으면 사이드바는 평면 목록")
        XCTAssertTrue(PortfolioLogic.groups([]).isEmpty)
    }

    // ---- 웹 콘솔 주소 ----

    func testWebConsoleURL() {
        XCTAssertEqual(PortfolioLogic.webConsoleURL(env: [:])?.absoluteString, "http://localhost:3333/app/")
        XCTAssertEqual(PortfolioLogic.webConsoleURL(env: ["XITA_HOST": "http://127.0.0.1:4000/"])?.absoluteString, "http://127.0.0.1:4000/app/")
        XCTAssertEqual(PortfolioLogic.webConsoleURL(env: ["XITA_HOST": "localhost:5000"])?.absoluteString, "http://localhost:5000/app/")
        XCTAssertEqual(PortfolioLogic.webConsoleURL(env: ["XITA_HOST": "4100"])?.absoluteString, "http://localhost:4100/app/")
        XCTAssertEqual(PortfolioLogic.webConsoleURL(env: ["XITA_HOST": "  "])?.absoluteString, "http://localhost:3333/app/")
    }

    // ---- 모델 통합: refresh 캐시 ----

    func testRefreshCachesPortfolioCards() throws {
        let dir = NSTemporaryDirectory() + "xita-portfolio-" + UUID().uuidString
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(atPath: dir) }
        let model = AppModel(workspaceDir: dir)
        try model.bootstrapDemo()
        try model.updateProduct(id: "novel", fields: [
            .init("portfolio", "auto-money"), .init("codename", "Novel"),
            .init("repo_path", dir), .init("monetization", "ads"),
            .init("production_status", "BETA"),
            .init("store_tracks", #"{"production":104,"internal":2}"#),
        ])
        let c = try XCTUnwrap(model.portfolioCard("novel"))
        XCTAssertEqual(c.portfolio, "auto-money")
        XCTAssertEqual(c.monetization, "ads")
        XCTAssertEqual(c.productionStatus, "BETA")
        XCTAssertEqual(c.storeProduction, 104, "store_tracks JSON 이 정본 왕복 후에도 파싱돼야 한다")
        XCTAssertTrue(c.repoExists, "실제 존재하는 폴더")
        XCTAssertEqual(c.activeChanges, 1, "데모 할 일(IDEA) 1건")
        XCTAssertFalse(c.archived)

        try model.updateProduct(id: "novel", fields: [.init("archived", "true")])
        XCTAssertTrue(try XCTUnwrap(model.portfolioCard("novel")).archived)
        XCTAssertEqual(PortfolioLogic.groups(model.portfolioCards).map(\.name), ["보관됨"])
    }

    func testHomeSelectionIsDistinct() {
        XCTAssertNotEqual(AppModel.Selection.home, AppModel.Selection.settings)
        XCTAssertNotEqual(AppModel.Selection?.some(.home), nil)
    }
}
