/*
 * XITA 웹 콘솔 — 공용 유틸 (API · 안전한 HTML 템플릿 · 표시 라벨 · 포맷)
 * 빌드 단계 없는 vanilla ES module. DOM 에 넣는 모든 데이터는 html`` 템플릿으로 escape 한다.
 */

// ── 안전한 HTML 템플릿 ─────────────────────────────────────────────────────
// html`...${v}...` : 보간값은 기본 escape. 이미 안전한 조각(Safe)·배열만 그대로 이어 붙인다.
class Safe {
  constructor(s) { this.s = s }
  toString() { return this.s }
}

export const raw = (s) => new Safe(String(s ?? ''))

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

function part(v) {
  if (v === null || v === undefined || v === false || v === true) return ''
  if (v instanceof Safe) return v.s
  if (Array.isArray(v)) return v.map(part).join('')
  return esc(v)
}

export function html(strings, ...vals) {
  let out = strings[0]
  for (let i = 0; i < vals.length; i++) out += part(vals[i]) + strings[i + 1]
  return new Safe(out)
}

/** el 의 내용을 html`` 결과로 교체 */
export function mount(el, tpl) {
  if (el) el.innerHTML = String(tpl)
}

export const $ = (s, root = document) => root.querySelector(s)
export const $$ = (s, root = document) => [...root.querySelectorAll(s)]

// ── API ───────────────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

/** 서버 에러 응답 → 사람이 읽을 메시지. 포트폴리오 {error}, v4 {message}, vine {errors:[{message}]} 모두 수용 */
function errorMessage(data, status) {
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string') return data.error
    if (data.error && typeof data.error.message === 'string') return data.error.message
    if (typeof data.message === 'string') return data.message
    if (Array.isArray(data.errors) && data.errors[0]?.message) return data.errors[0].message
  }
  if (status === 403) return '이 작업은 이 컴퓨터(localhost)에서만 실행할 수 있습니다.'
  if (status === 404) return '요청한 항목을 찾을 수 없습니다.'
  return `요청이 실패했습니다 (HTTP ${status}).`
}

export async function api(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers: body !== undefined
        ? { 'Content-Type': 'application/json', Accept: 'application/json' }
        : { Accept: 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('XITA 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.', 0)
  }
  let data = null
  const text = await res.text()
  if (text) {
    try { data = JSON.parse(text) } catch { data = null }
  }
  if (!res.ok || (data && typeof data.error === 'string')) {
    throw new ApiError(errorMessage(data, res.status), res.status)
  }
  return data
}

/** /api/v1/portfolio/* — 응답 그대로 */
export const pf = (path, opts) => api(`/portfolio${path}`, opts)

/** /api/v1/v4/* — { data } 래핑을 벗긴다 */
export async function v4(path, opts) {
  const r = await api(`/v4${path}`, opts)
  return r && typeof r === 'object' && 'data' in r ? r.data : r
}

// ── 표시 라벨 (원시 enum 은 화면에 노출하지 않는다) ───────────────────────────
const STATUS = {
  PRODUCTION: '라이브', LIVE: '라이브', BETA: '베타', ALPHA: '알파',
  DEVELOPMENT: '개발 중', DEV: '개발 중', PLANNING: '기획 중', IDEA: '아이디어',
  MAINTENANCE: '유지보수', PAUSED: '보류', DEPRECATED: '종료', ARCHIVED: '보관됨',
}
export const statusLabel = (s) => (s ? STATUS[String(s).toUpperCase()] ?? '기타 상태' : '상태 미정')
export const statusTone = (s) => {
  const k = String(s ?? '').toUpperCase()
  if (k === 'PRODUCTION' || k === 'LIVE') return 'ok'
  if (k === 'BETA' || k === 'ALPHA') return 'info'
  if (k === 'DEPRECATED' || k === 'ARCHIVED' || k === 'PAUSED') return 'muted'
  return 'warn'
}

const TRACK = { internal: '내부 테스트', alpha: '알파', beta: '베타', production: '프로덕션' }
export const trackLabel = (t) => TRACK[t] ?? '기타 트랙'
export const TRACK_ORDER = ['internal', 'alpha', 'beta', 'production']

const KIND = {
  android: 'Android', node: 'Node.js', rust: 'Rust', go: 'Go', swift: 'Swift',
  python: 'Python', generic: '일반', missing: '폴더 없음',
}
export const kindLabel = (k) => KIND[k] ?? '일반'

const MONETIZATION = {
  AD: '광고', ADS: '광고', ADMOB: '광고', IAP: '인앱 결제', SUBSCRIPTION: '구독',
  FREE: '무료', PAID: '유료', NONE: '수익 없음', FREEMIUM: '부분 유료',
}
// 수익 모델은 README 의 자유 문구일 수 있으므로 enum 이 아니면 원문 그대로
export const monetizationLabel = (m) => (m ? MONETIZATION[String(m).toUpperCase()] ?? String(m) : '')

const CHANGE_STATUS = {
  IDEA: '아이디어', PLAN: '계획', BUILD: '만드는 중', REVIEW: '검토 대기',
  SHIP_READY: '출시 승인 대기', SHIPPED: '출시됨', PAUSED: '보류', CANCELLED: '취소됨',
}
export const changeStatusLabel = (s) => CHANGE_STATUS[String(s ?? '').toUpperCase()] ?? '진행 중'

const PRIORITY = { LOW: '낮음', NORMAL: '보통', HIGH: '높음', CRITICAL: '긴급' }
export const priorityLabel = (p) => PRIORITY[String(p ?? '').toUpperCase()] ?? '보통'
export const priorityTone = (p) => ({ CRITICAL: 'bad', HIGH: 'warn', NORMAL: 'muted', LOW: 'muted' }[String(p ?? '').toUpperCase()] ?? 'muted')

const NEEDS_TYPE = {
  DIRECTION: '방향 결정', SCOPE: '범위 결정', ARCHITECTURE: '구조 결정', UX: 'UX 결정',
  DECISION: '결정', REVIEW: '검토', RELEASE: '출시 승인', CONTEXT_DRIFT: '맥락 갱신',
  ARTIFACT_CONFLICT: '문서 충돌', SHIP_BLOCKER: '출시 차단', SYNC_CONFLICT: '동기화 충돌',
  AGENT_WAITING: '에이전트 대기',
}
export const needsTypeLabel = (t) => NEEDS_TYPE[String(t ?? '').toUpperCase()] ?? '확인 필요'

const DOC_TYPE = {
  product: '프로젝트', change: '할 일', artifact: '문서', decision: '결정', workbench: '메모',
  release: '릴리스', capability: '기능', readiness: '출시 준비', proposal: '제안', review: '리뷰',
  reference: '참고자료', dispatch: '에이전트 작업', patch: '수정 제안', milestone: '마일스톤',
  insight: '인사이트',
}
export const docTypeLabel = (t) => DOC_TYPE[t] ?? '항목'

const ARTIFACT_KIND = {
  spec: '기획서', doc: '문서', docs: '문서', readme: 'README', idea: '아이디어', ideas: '아이디어',
  note: '노트', guide: '가이드', plan: '계획', log: '기록', research: '조사',
}
export const artifactKindLabel = (k) => (k ? ARTIFACT_KIND[String(k).toLowerCase()] ?? '문서' : '문서')

const EVENT = {
  APP_LOG: '앱 기록', APP_LOG_REMOVED: '기록 삭제', PRODUCTION_DETECTED: '라이브 확인', PROJECT_IMPORTED: '가져옴', PROJECT_REGISTERED: '프로젝트 등록',
  PROJECT_ARCHIVED: '보관', PROJECT_RESTORED: '복원', CHANGE_APPROVED: '승인', CHANGES_REQUESTED: '수정 요청',
  CHANGE_SCORED: '우선순위', RELEASED: '출시', RELEASE_PLANNED: '출시 계획', RELEASE_STATUS: '출시 상태',
  SHIP_BLOCKER: '출시 차단', MAJOR_DECISION: '주요 결정', DECISION_SUPERSEDED: '결정 변경',
  PROPOSAL_CREATED: '제안', PROPOSAL_RESOLVED: '제안 처리', ARTIFACT_PATCHED: '문서 수정',
  ARTIFACT_PATCH_SUGGESTED: '문서 수정 제안', ARTIFACT_REVIEW: '문서 검토', CAPABILITY_ADDED: '기능 추가',
  CAPABILITY_CHANGED: '기능 변경', DISPATCHED: '에이전트 전달', DISPATCH_UPDATED: '에이전트 진행',
  AGENT_RESULT_IMPORTED: '에이전트 결과', INSIGHT_CREATED: '인사이트', MILESTONE_CREATED: '마일스톤',
  GITHUB_OBSERVED: 'GitHub', LINEAR_OBSERVED: 'Linear', FIGMA_OBSERVED: 'Figma',
}
export const eventLabel = (e) => EVENT[String(e ?? '').toUpperCase()] ?? '활동'

// ── 포맷 ──────────────────────────────────────────────────────────────────
export const fmtMB = (b) => `${(Number(b || 0) / 1024 / 1024).toFixed(1)}MB`
export const fmtNum = (n) => Number(n || 0).toLocaleString('ko-KR')
export const fmtUSD = (n) => `$${Number(n || 0).toFixed(2)}`

export function fmtUnix(sec) {
  if (!sec) return ''
  return new Date(sec * 1000).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** ISO/문자열 시각 → "3분 전" / "어제" / "9월 3일" */
export function fmtRelative(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return '방금'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 86400 * 2) return '어제'
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

export function fmtDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return String(dateStr)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((today - d) / 86400000)
  const label = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
  if (days === 0) return `오늘 · ${label}`
  if (days === 1) return `어제 · ${label}`
  return label
}

/** 배열을 key 함수로 묶어 [key, items][] (입력 순서 유지) */
export function groupBy(items, keyFn) {
  const m = new Map()
  for (const it of items) {
    const k = keyFn(it)
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(it)
  }
  return [...m.entries()]
}

export function debounce(fn, ms) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

// ── localStorage (실패해도 동작) ─────────────────────────────────────────────
export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key)
    localStorage.setItem(key, value)
  } catch { /* private mode 등 */ }
  return null
}
