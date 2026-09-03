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
        // 관찰/가설
        case "OPEN": return "열림"
        case "VALIDATED": return "검증됨"
        case "OUTDATED": return "지난 것"
        // 위임(에이전트) 런 상태
        case "DISPATCHED": return "보냄"
        case "AWAITING_INPUT": return "나를 기다림"
        case "RESULT_READY": return "결과 확인 필요"
        case "WORKING": return "작업 중"
        case "MERGED": return "반영됨"
        case "CLOSED": return "끝남"
        case "FAILED": return "실패"
        // 출시 (PLANNED는 아래 마일스톤과 공유)
        case "PREPARING": return "준비 중"
        case "READY": return "제출 대기"
        case "SUBMITTED": return "제출됨"
        case "RELEASED": return "나갔음"
        case "ROLLED_BACK": return "되돌림"
        // 메모함(워크벤치)
        case "CAPTURED": return "담김"
        case "PROMOTED": return "승격됨"
        case "ARCHIVED": return "보관함"
        case "DISCARDED": return "버림"
        // 제안
        case "PENDING": return "내 판단 대기"
        case "APPROVED": return "승인함"
        case "REJECTED": return "거절함"
        // 마일스톤/제품 운영 상태
        case "PLANNED": return "예정"
        case "ACTIVE": return "진행"
        case "DONE": return "완료"
        case "PRODUCTION": return "운영 중"
        case "BETA": return "베타"
        case "DEVELOPMENT": return "개발 중"
        case "MAINTENANCE": return "관리 모드"
        case "RETIRED": return "은퇴"
        case "OK": return "정상"
        case "DRIFT": return "컨텍스트 어긋남"
        case "OFFLINE": return "오프라인"
        default: return status
        }
    }

    /// kind/유형 원시값 → 사용자어 (OBSERVATION 같은 코드를 화면에 그대로 안 낸다)
    static func termKind(_ k: String) -> String {
        switch k.uppercased() {
        case "OBSERVATION": return "관찰"
        case "INTERVIEW": return "인터뷰"
        case "FOCUS_GROUP": return "포커스 그룹"
        case "SECONDARY": return "다른 곳에서 얻은 자료"
        case "DERIVED": return "따져낸 것"
        case "RETRO": return "회고"
        case "OPPORTUNITY": return "기회"
        case "ASSUMPTION": return "가정"
        case "DIRECTION": return "방향"
        case "SCOPE": return "범위"
        case "ARCHITECTURE": return "구조"
        case "UX": return "경험"
        case "DECISION": return "결정"
        case "REVIEW": return "리뷰"
        case "RELEASE": return "출시"
        case "CONTEXT_DRIFT": return "컨텍스트가 어긋남"
        case "ARTIFACT_CONFLICT": return "문서 충돌"
        case "SHIP_BLOCKER": return "출시 차단"
        case "SYNC_CONFLICT": return "동기화 충돌"
        case "AGENT_WAITING": return "에이전트 대기"
        case "GITHUB": return "깃허브"
        case "FIGMA": return "피그마"
        case "LINEAR": return "리니어"
        case "GENERIC": return "일반"
        case "PAGE": return "페이지"
        case "LINK": return "링크"
        case "ASSET": return "자산"
        case "MOBILE_SAAS": return "모바일 서비스"
        case "WEB_SAAS": return "웹 서비스"
        default: return k
        }
    }

    /// 토큰 원천 — §42 기록(8pt 그리드: pad 12 · gap 10, 카드 radius 10)과 동일하게 고정.
    /// 개별 뷰가 이 값들을 우회해 하드코딩하지 않도록 한다(2026-09 감사 P3).
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
        case "SHIPPED", "DONE", "APPLIED", "APPROVED", "ACTIVE", "MERGED": return .green
        case "REVIEW", "SHIP_READY", "PENDING", "SUBMITTED", "PREPARING", "RESULT_READY": return .orange
        case "BUILD", "WORKING": return .blue
        case "PLAN", "READY": return .purple
        case "BLOCKED", "CONFLICT", "CRITICAL", "AWAITING_INPUT", "FAILED": return .red
        case "CANCELLED", "ROLLED_BACK", "SUPERSEDED", "REJECTED", "ARCHIVED", "DISMISSED": return .gray
        default: return Color(nsColor: .secondaryLabelColor)
        }
    }

    static func statusChip(_ status: String) -> some View {
        Text(XUI.termStatus(status))
            .font(.caption2)
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
