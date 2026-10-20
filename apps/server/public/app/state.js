/*
 * XITA 웹 콘솔 — 전역 상태와 로더
 * overview(포트폴리오 전체) · needs-you(결정할 일) 를 한 곳에서 들고, 바뀌면 구독자에게 알린다.
 */
import { pf, v4 } from './lib.js'

export const S = {
  overview: null,        // GET /portfolio/overview
  overviewError: null,
  needs: [],             // GET /v4/needs-you
  needsError: null,
  archived: null,        // GET /portfolio/projects?archived=1 (보관됨 필터에서만 lazy)
  ready: false,
}

const listeners = new Set()
export const onChange = (fn) => listeners.add(fn)
const emit = () => listeners.forEach((fn) => fn())

export async function loadOverview() {
  try {
    S.overview = await pf('/overview')
    S.overviewError = null
  } catch (e) {
    S.overviewError = e
  }
}

export async function loadNeeds() {
  try {
    const d = await v4('/needs-you')
    S.needs = Array.isArray(d) ? d : []
    S.needsError = null
  } catch (e) {
    S.needsError = e
  }
}

export async function loadArchived() {
  try {
    const list = await pf('/projects?archived=1')
    S.archived = Array.isArray(list) ? list : []
  } catch {
    S.archived = []
  }
}

/** 전체 새로고침 (작업 완료·변경 후) */
export async function refreshAll() {
  await Promise.all([loadOverview(), loadNeeds(), S.archived ? loadArchived() : null])
  S.ready = true
  emit()
}

export const projects = () => S.overview?.projects ?? []
export const tracks = () => S.overview?.tracks?.length ? S.overview.tracks : ['internal', 'alpha', 'beta', 'production']
export const playKey = () => !!S.overview?.playKey

export function findProject(id) {
  return projects().find((p) => p.id === id) ?? S.archived?.find((p) => p.id === id) ?? null
}

/** product id → 표시명 (없으면 id) */
export function productName(id) {
  if (!id) return '포트폴리오 공통'
  return findProject(id)?.name || id
}

// ── 프로젝트 파생 상태 ─────────────────────────────────────────────────────
/** 광고 상태: live(실광고) / test(테스트 ID) / none(미사용) — planner 판정 로직 유지 */
export function adStatus(p) {
  const a = p.adIds ?? {}
  if (a.found) return a.banner || a.interstitial || a.rewarded || a.native ? 'live' : 'test'
  return a.live ? 'live' : 'none'
}

/** Android 출시 준비물 중 빠진 항목 라벨 */
export function missingAssets(p) {
  if (p.kind !== 'android') return []
  const out = []
  if (!p.keystore) out.push('키스토어')
  if (!p.privacy) out.push('개인정보처리방침')
  if (!p.listing) out.push('스토어 문구')
  if (!p.graphic) out.push('피처 그래픽')
  return out
}

export const isLive = (p) => ['PRODUCTION', 'LIVE'].includes(String(p.status ?? '').toUpperCase())
