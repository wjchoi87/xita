import SwiftUI

/// 공용 디자인 토큰 — 8pt 그리드, 통일 card/section/여백. 전체 화면이 이 하나를 쓴다.
enum XUI {
    /* ======================================================================
     * 표시 용어 계층 (Terminology layer) — research run 20260830
     * 변경 전 정책: 데이터 모델 명사(change/dispatch/capability...)가 화면에 그대로 노출
     *   — 사용자 진언: "changes라는 개념이 확 와 닿지가 않아"
     * 변경 후 정책: 화면은 사용자 언어(Korean everyday noun), 정본 frontmatter/REST/스키마는
     *   기존 영문 키 불변. 근거: Plane은 UI라벨만 work item으로 바꾸고 내부 id는 issue를
     *   유지했다(docs 슬러그 잔존 실측); Jira는 계층명 개칭이 앱을 깨뜨릴 수 있다고 공식 경고.
     *   → 용어는 표시 문제이지 스키마 문제가 아니다.
     * 변경 이유: 업계 4개 소스(Canny/Beamer/AnnounceKit/Productboard) 공통으로 'change'를
     *   최상위 명칭으로 쓰지 않고 '현재 기능/진행 중 계획/출시 기록'으로 분해함
     * 영향 범위: ContentView/AppModel 오류문구 전체. type·target·REST 경로·파일명 무변경
     * ==================================================================== */
    static func term(_ model: String) -> String {
        switch model {
        case "change": return "할 일"           // Plane: "fundamental unit of work"의 한국식
        case "workbench": return "메모"
        case "milestone": return "마일스톤"       // 일상어 정착(Linear/Plane 모두 유지) — Shortcut 이상어 강요 실패의 반대편
        case "capability": return "기능"
        case "release": return "출시"
        case "dispatch": return "위임"            // 에이전트에 넘긴 일
        case "proposal": return "제안"
        case "insight": return "관찰"
        case "decision": return "결정"
        case "artifact": return "문서"
        case "reference": return "참조"
        case "patch": return "문서 보완"
        case "readiness": return "출시 준비"
        case "product": return "제품"
        default: return model
        }
    }

    /// 열거값 상태 → 한국어 한 단락 (isometric: 데이터는 영문 대문자 불변)
    static func termStatus(_ status: String) -> String {
        switch status.uppercased() {
        case "IDEA": return "아이디어"
        case "PLAN": return "계획"
        case "BUILD": return "만드는 중"
        case "REVIEW": return "리뷰 중"
        case "SHIP_READY": return "출시 직전"
        case "SHIPPED": return "출시됨"
        case "PAUSED": return "잠시 멈춤"
        case "CANCELLED": return "하지 않음"
        case "OPEN": return "열림"
        case "VALIDATED": return "검증됨"
        case "OUTDATED": return "지난 것"
        case "AWAITING_INPUT": return "나를 기다림"
        case "RESULT_READY": return "결과 확인 필요"
        case "WORKING": return "작업 중"
        case "MERGED": return "반영됨"
        case "FAILED": return "실패"
        default: return status
        }
    }

    static let pad: CGFloat = 12
    static let gap: CGFloat = 10
    static let cardRadius: CGFloat = 10
    static let chipRadius: CGFloat = 6

    static func card<Content: View>(_ content: () -> Content) -> some View {
        content()
            .padding(pad)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: cardRadius))
    }

    static func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.secondary)
            .textCase(nil)
            .padding(.bottom, 2)
    }

    static func statusColor(_ status: String) -> Color {
        switch status.uppercased() {
        case "SHIPPED", "DONE", "APPLIED", "APPROVED", "ACTIVE": return .green
        case "REVIEW", "SHIP_READY", "PENDING", "SUBMITTED", "PREPARING": return .orange
        case "BUILD": return .blue
        case "PLAN", "READY": return .purple
        case "BLOCKED", "CONFLICT", "CRITICAL": return .red
        case "CANCELLED", "ROLLED_BACK", "SUPERSEDED", "REJECTED", "ARCHIVED", "DISMISSED": return .gray
        default: return Color(nsColor: .secondaryLabelColor)
        }
    }

    static func statusChip(_ status: String) -> some View {
        Text(status)
            .font(.caption2.monospaced())
            .padding(.horizontal, 7).padding(.vertical, 2)
            .foregroundStyle(statusColor(status))
            .background(statusColor(status).opacity(0.14), in: Capsule())
    }
}

/// 카드 셸 — GroupBox 대체 표준
struct XCard<Content: View>: View {
    let title: String?
    let trailing: AnyView?
    @ViewBuilder let content: () -> Content

    init(_ title: String? = nil, trailing: AnyView? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.trailing = trailing
        self.content = content
    }

    var body: some View {
    VStack(alignment: .leading, spacing: XUI.gap) {
            if let title {
                HStack {
                    Text(title).font(.subheadline.weight(.semibold))
                    Spacer()
                    if let trailing { trailing }
                }
            }
            content()
        }
        .padding(XUI.pad)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: XUI.cardRadius))
    }
}
