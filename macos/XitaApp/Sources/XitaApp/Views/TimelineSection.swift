import SwiftUI
import AppKit
import XitaCoreBridge

/// XITA macOS — TimelineSection (ContentView 분해, 2026-09 구조 리팩토링)
/// 동작 변경 없음: 상위 선언 단위 이동만. 원본 이력은 git log ContentView.swift.


/// §16 Timeline — events.jsonl 은 서버/.xita 에 있으나 Mac 워크스페이스엔 Mac 이벤트가 core 기록 분기 외 없음 → pull 기반 최신순 대체
/* 생애 타임라인 — Two-Layer History (Figma VERIFIED, run 20260830 Tier G)
 * 변경 전 정책: 릴리즈 행+change 행을 따로 붙인 목록 — "무엇이 있었나"의 시간이 없음
 * 변경 후 정책: events.jsonl 단일 스트림에 ① 인간 마커(결정/출시/승인/위임/관찰/충돌)는 펼침
 *   ② 그 외 자동 이벤트는 시간 그룹으로 접힘(카운트만) ③ 과거는 "Show older" append만 (스크러버 금지)
 *   ④ 행 4필드: 시각·타입 아이콘·문장·(마커만 강조). XITA는 이벤트 자동発生이라 메타데이터 작성 0 = Figma보다 부담 아래
 * 영향 범위: TimelineSection 렌더만. events 포맷 무변경 */
struct TimelineSection: View {
    @EnvironmentObject private var model: AppModel
    let productId: String
    @State private var limit = 40
    @State private var showMechanical = false

    private static let markerTypes: Set<String> = [
        "MAJOR_DECISION", "RELEASED", "CHANGE_APPROVED", "CHANGE_SHIPPED",
        "DISPATCHED", "DISPATCH_UPDATED", "INSIGHT_CREATED", "ARTIFACT_PATCHED",
        "PROPOSAL_CREATED", "SHIP_BLOCKER", "CONFLICT", "DECISION_SUPERSEDED", "CHANGE_SCORED",
    ]

    var body: some View {
        // 제품 자취 탭은 이 제품의 이벤트만 — product 태그가 없는 구형 이벤트는 열어둔다
        let all = model.eventLog(limit: limit).filter { productId.isEmpty || $0.product.isEmpty || $0.product == productId }
        let markers = all.filter { Self.markerTypes.contains($0.type) }
        let mechanical = all.filter { !Self.markerTypes.contains($0.type) }
        VStack(alignment: .leading, spacing: 5) {
            ForEach(Array(markers.enumerated()), id: \.offset) { _, e in
                HStack(alignment: .top, spacing: 6) {
                    Image(systemName: Self.icon(e.type)).font(.caption2)
                        .foregroundStyle(Self.markerColor(e.type))
                        .frame(width: 14)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(e.title).font(.caption)
                        Text(String(e.ts.prefix(16).replacingOccurrences(of: "T", with: " ")))
                            .font(.caption2).foregroundStyle(.tertiary)
                    }
                }
            }
            if !mechanical.isEmpty {
                Button {
                    showMechanical.toggle()
                } label: {
                    Label("그 밖의 움직임 \(mechanical.count)건", systemImage: showMechanical ? "chevron.up" : "chevron.down")
                        .font(.caption2).foregroundStyle(.tertiary)
                }.buttonStyle(.plain)
                if showMechanical {
                    ForEach(Array(mechanical.prefix(25).enumerated()), id: \.offset) { _, e in
                        Text("· \(String(e.ts.prefix(10))) \(e.title)")
                            .font(.caption2).foregroundStyle(.quaternary)
                    }
                }
            }
            Button("이전 기록 보기") { limit += 80 }
                .buttonStyle(.plain).font(.caption2).foregroundStyle(.secondary)
            if limit > 40 { Text("처음으로") .font(.caption2).foregroundStyle(.tertiary)
                .onTapGesture { limit = 40 } }
        }
    }

    static func icon(_ t: String) -> String {
        switch t {
        case "MAJOR_DECISION", "DECISION_SUPERSEDED": return "brain.head.profile"
        case "RELEASED": return "shippingbox.fill"
        case "CHANGE_APPROVED", "CHANGE_SHIPPED": return "checkmark.seal.fill"
        case "DISPATCHED", "DISPATCH_UPDATED": return "paperplane.fill"
        case "INSIGHT_CREATED": return "eye"
        case "ARTIFACT_PATCHED": return "doc.badge.gearshape"
        case "PROPOSAL_CREATED": return "arrow.triangle.branch"
        case "SHIP_BLOCKER", "CONFLICT": return "exclamationmark.triangle.fill"
        case "CHANGE_SCORED": return "star"
        default: return "circle"
        }
    }
    static func markerColor(_ t: String) -> Color {
        switch t {
        case "SHIP_BLOCKER", "CONFLICT": return .red
        case "RELEASED", "CHANGE_SHIPPED": return .green
        case "MAJOR_DECISION", "DECISION_SUPERSEDED": return .purple
        case "DISPATCHED", "DISPATCH_UPDATED": return .blue
        default: return .secondary
        }
    }
}

struct ReadinessGroupRow: View {
    @EnvironmentObject private var model: AppModel
    let productId: String
    let kind: String
    let onPatch: () -> Void

    var items: [String] {
        guard let doc = model.doc(type: "readiness", id: "\(productId)-\(kind.lowercased())") else { return [] }
        return (doc.fields["items"] ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { $0.contains("|") }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(kind).font(.caption.bold())
            ForEach(items, id: \.self) { line in
                let parts = line.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
                if parts.count >= 2 {
                    HStack(spacing: 6) {
                        Button {
                            do { try model.cycleReadinessItem(productId: productId, kind: kind, item: parts[0]) }
                            catch { model.lastError = "출시 기준 항목을 바꾸지 못했습니다 — \(error)" }
                            onPatch()
                        } label: {
                            Image(systemName: statusIcon(parts[1]))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(statusColor(parts[1]))
                        Text(parts[0])
                        Spacer()
                        Text("\(parts.count > 2 ? parts[2] : "0")%").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func statusIcon(_ s: String) -> String {
        switch s {
        case "DONE": return "checkmark.circle.fill"
        case "IN_PROGRESS": return "circle.lefthalf.filled"
        case "BLOCKED": return "xmark.octagon.fill"
        default: return "circle"
        }
    }

    private func statusColor(_ s: String) -> Color {
        switch s {
        case "DONE": return .green
        case "IN_PROGRESS": return .blue
        case "BLOCKED": return .red
        default: return .secondary
        }
    }
}
