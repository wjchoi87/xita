/* 표시 용어 계층 — macOS XUI.term과 1:1 동일 원리 (화면은 사용자 언어, 데이터 키 불변)
 * 근거: 경쟁 5제품 공통 — 진행/추상명사를 그릇명으로 안 씀(셀 수 있는 명사만). 'Change'→'할 일' */
const TERM: Record<string, string> = {
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
}
export function term(k: string): string {
  return TERM[k] ?? k
}
export function statusKo(s?: string): string {
  if (!s) return '-'
  return STATUS_KO[s] ?? STATUS_KO[s.toUpperCase()] ?? s
}
