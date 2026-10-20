/* 표시 용어 계층 — macOS XUI.term과 1:1 동일 원리 (화면은 사용자 언어, 데이터 키 불변)
 * 근거: 경쟁 5제품 공통 — 진행/추상명사를 그릇명으로 안 씀(셀 수 있는 명사만). 'Change'→'할 일' */
const TERM: Record<string, string> = {
  product: '제품',
  portfolio: '포트폴리오',
  change: '할 일',
  workbench: '메모',
  proposal: '제안',
  milestone: '마일스톤',
  release: '출시',
  capability: '기능',
  dispatch: '위임',
  insight: '관찰',
  decision: '결정',
  artifact: '문서',
  reference: '참조',
}
const STATUS_KO: Record<string, string> = {
  IDEA: '아이디어',
  PLAN: '계획',
  BUILD: '만드는 중',
  REVIEW: '리뷰 중',
  SHIP_READY: '출시 직전',
  SHIPPED: '출시됨',
  PAUSED: '잠시 멈춤',
  CANCELLED: '하지 않음',
  pending: '대기',
  approved: '승인됨',
  rejected: '거절됨',
  active: '진행',
  paused: '보류',
  archived: '보관됨',
  // 제품 운영 상태 (product.production_status — 대문자 정규화로 'production' 도 매칭)
  PRODUCTION: '운영 중',
  BETA: '베타',
  ALPHA: '알파',
  INTERNAL: '내부 테스트',
  DEVELOPMENT: '개발 중',
  MAINTENANCE: '유지보수',
  DEPRECATED: '지원 종료',
}
/** 상태 전이 버튼 = 동사형 (상태 어휘와 티어 분리 — Status Vocabulary by Tier). */
const ACTION_KO: Record<string, string> = {
  PLAN: '계획으로',
  BUILD: '만들기',
  REVIEW: '검토 요청',
  SHIP_READY: '검토 통과',
  SHIPPED: '출시',
}
export function term(k: string): string {
  return TERM[k] ?? k
}
export function actionKo(s: string): string {
  return ACTION_KO[s.toUpperCase()] ?? statusKo(s)
}
export function statusKo(s?: string): string {
  if (!s) return '-'
  return STATUS_KO[s] ?? STATUS_KO[s.toUpperCase()] ?? s
}
