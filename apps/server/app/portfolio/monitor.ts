import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { workspaceRoot } from '#v4/workspace'
import { atomicWrite } from '#v4/fs_util'
import { aiChat, extractJson, usageSummary } from '#v4/ai_router'
import { V4Ops } from '#v4/ops'
import { MarkdownStore } from '#v4/markdown_store'
import { PortfolioService, type ProjectCard } from '#portfolio/service'
import { admobTokenPath } from '#portfolio/config'
import { revenueStatus, loadRevenueHistory, type AppRef } from '#portfolio/revenue'
import { inspectProject } from '#portfolio/inspect'

/*
 * 상시 모니터링 · 수익 극대화 조언.
 *
 * 정책:
 *   - 서버가 떠 있는 동안 주기적으로(기본 6시간, XITA_MONITOR_HOURS, 0 = 끔) 실행. 테스트·ace 명령에서는 돌지 않는다.
 *   - 1단계(비용 0): 애드몹 기록 갱신(읽기 전용) → 규칙으로 신호 추출
 *       테스트 광고 ID 로 라이브 / 출시 대기 방치 / 수익 급감 / 노출 0 / 출시 준비물 누락 / 오래 멈춘 작업 / 기한 지난 마일스톤 / AI provider 연속 실패
 *   - 2단계: 신호가 지난번과 달라졌을 때만 AI(작업 'advice', sensitive → 내 장비·네트워크 모델만)가 우선순위 조언을 쓴다.
 *     AI 가 없으면 규칙 신호를 그대로 조언으로 쓴다.
 *   - 하루 한 번 Play 스토어 버전 조회(읽기 전용 job)도 건다.
 *   - 결과: <workspace>/monitor/latest.json + 날짜별 사본. 조언 '처리함/숨김' 은 monitor/state.json.
 *   - 자동으로 고치거나 배포하지 않는다. 사람이 누를 버튼(링크)만 제시한다.
 */

export interface Signal {
  key: string
  project: string | null
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  action?: { label: string; href: string }
}

export interface Advice {
  id: string
  project: string | null
  impact: 'high' | 'medium' | 'low'
  title: string
  why: string
  action: string
  href?: string
}

export interface MonitorReport {
  at: string
  ok: boolean
  signals: Signal[]
  advice: Advice[]
  source: string
  signalsHash: string
  revenue: { fetched: boolean; reason?: string; total7d?: number; prev7d?: number }
  errors: string[]
}

const dir = () => path.join(workspaceRoot(), 'monitor')
const latestPath = () => path.join(dir(), 'latest.json')
const statePath = () => path.join(dir(), 'state.json')

function readJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function latestReport(): MonitorReport | null {
  return readJson<MonitorReport | null>(latestPath(), null)
}

type State = { dismissed: Record<string, string>; lastStoreRefresh?: string }
const loadState = () => readJson<State>(statePath(), { dismissed: {} })
async function saveState(s: State) {
  fs.mkdirSync(dir(), { recursive: true })
  await atomicWrite(statePath(), JSON.stringify(s, null, 2) + '\n')
}

export async function dismissAdvice(id: string) {
  const s = loadState()
  s.dismissed[id] = new Date().toISOString()
  await saveState(s)
}

/** 화면용: 숨긴 조언은 빼고 */
export function visibleReport() {
  const r = latestReport()
  if (!r) return null
  const dismissed = loadState().dismissed
  return { ...r, advice: r.advice.filter((a) => !dismissed[a.id]) }
}

const DAY = 86400_000
const usd = (n: number) => `$${n.toFixed(2)}`

/** 규칙 신호 — 순수 함수(테스트 대상) */
export function ruleSignals(input: {
  cards: ProjectCard[]
  changes: Array<{ id: string; product: string; name: string; status: string; updated_at: string }>
  milestones: Array<{
    id: string
    product: string
    name: string
    status: string
    target_date: string | null
  }>
  aiFailures: Array<{ provider: string; model: string; calls: number; failures: number }>
  now?: number
}): Signal[] {
  const now = input.now ?? Date.now()
  const out: Signal[] = []
  const enc = encodeURIComponent
  for (const p of input.cards.filter((c) => !c.archived)) {
    const live = String(p.status).toUpperCase() === 'PRODUCTION'
    const ad = p.adIds
    const testAds = ad?.found && !(ad.banner || ad.interstitial || ad.rewarded || ad.native)
    if (live && p.kind === 'android' && testAds) {
      out.push({
        key: `test-ads:${p.id}`,
        project: p.id,
        severity: 'high',
        title: `${p.name}: 라이브인데 테스트 광고 ID`,
        detail: '실광고 ID 가 없어서 노출돼도 수익이 0 입니다.',
        action: { label: '광고 ID 넣기', href: `#/projects/${enc(p.id)}/ads` },
      })
    }
    if (p.pendingRelease && p.store?.production) {
      out.push({
        key: `pending:${p.id}:${p.versionCode}`,
        project: p.id,
        severity: 'medium',
        title: `${p.name}: 새 빌드가 프로덕션에 안 나감`,
        detail: `로컬 ${p.versionCode} · 프로덕션 ${p.store.production}. 고친 내용이 사용자에게 닿지 않고 있어요.`,
        action: { label: '배포', href: `#/projects/${enc(p.id)}/deploy` },
      })
    }
    const r = p.revenue7d
    if (r && r.prev >= 0.05 && r.earnings < r.prev * 0.5) {
      out.push({
        key: `rev-drop:${p.id}`,
        project: p.id,
        severity: 'high',
        title: `${p.name}: 7일 수익 ${Math.round((1 - r.earnings / r.prev) * 100)}% 감소`,
        detail: `${usd(r.prev)} → ${usd(r.earnings)}. 광고 노출·크래시·순위 변화를 확인하세요.`,
        action: { label: '수익 보기', href: '#/revenue' },
      })
    }
    if (
      live &&
      p.kind === 'android' &&
      ad?.found &&
      !testAds &&
      r &&
      r.impressions === 0 &&
      r.prev === 0
    ) {
      out.push({
        key: `no-impr:${p.id}`,
        project: p.id,
        severity: 'medium',
        title: `${p.name}: 14일간 광고 노출 0`,
        detail:
          '실광고 ID 는 있는데 노출이 없습니다. 사용자가 없거나 광고가 안 뜨는 상태일 수 있어요.',
        action: { label: '프로젝트 보기', href: `#/projects/${enc(p.id)}` },
      })
    }
    if (live && p.kind === 'android') {
      const miss = [
        !p.privacy && '개인정보처리방침',
        !p.listing && '스토어 문구',
        !p.graphic && '피처 그래픽',
      ].filter(Boolean)
      if (miss.length)
        out.push({
          key: `assets:${p.id}:${miss.join(',')}`,
          project: p.id,
          severity: 'low',
          title: `${p.name}: 출시 준비물 누락 (${miss.join(', ')})`,
          detail: '스토어 전환율·심사에 영향을 줍니다.',
          action: { label: '프로젝트 보기', href: `#/projects/${enc(p.id)}` },
        })
    }
  }
  for (const c of input.changes) {
    if (c.status !== 'BUILD') continue
    const age = now - Date.parse(c.updated_at)
    if (age > 14 * DAY)
      out.push({
        key: `stale:${c.id}`,
        project: c.product,
        severity: 'low',
        title: `'${c.name}' 진행 중으로 ${Math.floor(age / DAY)}일째`,
        detail: '끝낼지, 보류할지, 범위를 줄일지 정하세요.',
        action: { label: '작업 보기', href: `#/projects/${enc(c.product)}/work` },
      })
  }
  for (const m of input.milestones) {
    if (m.status === 'done' || !m.target_date) continue
    if (Date.parse(m.target_date) + DAY < now)
      out.push({
        key: `overdue:${m.id}`,
        project: m.product,
        severity: 'medium',
        title: `마일스톤 '${m.name}' 기한 지남 (${m.target_date})`,
        detail: '기한을 다시 잡거나 범위를 줄이세요.',
        action: { label: '작업 보기', href: `#/projects/${enc(m.product)}/work` },
      })
  }
  for (const f of input.aiFailures) {
    if (f.calls >= 3 && f.failures / f.calls >= 0.8)
      out.push({
        key: `ai-fail:${f.provider}:${f.model}`,
        project: null,
        severity: 'low',
        title: `AI ${f.provider}/${f.model} 이 계속 실패`,
        detail: `최근 ${f.calls}번 중 ${f.failures}번 실패. 키·쿼터·주소를 확인하거나 체인에서 빼세요.`,
        action: { label: 'AI 설정', href: '#/settings' },
      })
  }
  const rank = { high: 0, medium: 1, low: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity])
}

const ADVICE_SYSTEM = `너는 1인 앱 개발자의 수익 코치다. 주어진 포트폴리오 신호와 수치만 근거로, 이번 주에 할 일을 우선순위대로 제안한다.
규칙:
- 한국어, 짧고 구체적으로. 수익에 직접 영향이 큰 것부터. 최대 6개.
- 근거 없는 추측·지어낸 수치 금지. 신호에 없는 사실은 "확인 필요"로.
- 각 항목: 무엇을(action), 왜(why — 숫자 근거), 기대 효과 크기(impact high|medium|low), 관련 프로젝트 id(project, 없으면 null).
출력은 JSON 하나: {"advice":[{"title":"","why":"","action":"","impact":"high","project":null}]}`

function adviceId(a: { title: string; project: string | null }) {
  return crypto
    .createHash('sha1')
    .update(`${a.project ?? ''}\u0000${a.title}`)
    .digest('hex')
    .slice(0, 12)
}

function fromSignals(signals: Signal[]): Advice[] {
  return signals.slice(0, 8).map((s) => ({
    id: adviceId({ title: s.title, project: s.project }),
    project: s.project,
    impact: s.severity,
    title: s.title,
    why: s.detail,
    action: s.action?.label ?? '확인',
    href: s.action?.href,
  }))
}

let running: Promise<MonitorReport> | null = null

export function runMonitor(opts: { force?: boolean } = {}): Promise<MonitorReport> {
  // 겹쳐 돌지 않게 — 진행 중이면 그 결과를 같이 기다린다
  if (!running) running = doRun(opts).finally(() => (running = null))
  return running
}

async function doRun(opts: { force?: boolean }): Promise<MonitorReport> {
  const errors: string[] = []
  const svc = new PortfolioService()
  const ops = new V4Ops()

  // 1) 애드몹 기록 갱신 (연결돼 있을 때만, 읽기 전용)
  const revenue: MonitorReport['revenue'] = { fetched: false }
  if (fs.existsSync(admobTokenPath())) {
    try {
      const apps = new Map<string, AppRef>()
      for (const p of await svc.listCards(true)) {
        const appId = inspectProject(p.path).adIds.appId
        if (appId) apps.set(appId, { label: p.name, project: p.id })
      }
      const r = (await revenueStatus(apps, 14)) as {
        available?: boolean
        stale?: boolean
        reason?: string
      }
      revenue.fetched = !!r.available && !r.stale
      if (!revenue.fetched) revenue.reason = r.reason
    } catch (e) {
      errors.push(`수익 조회: ${(e as Error).message}`)
    }
  } else revenue.reason = '애드몹 미연결'

  // 2) 하루 한 번 스토어 버전 조회 (job — 끝나면 카드에 반영)
  const state = loadState()
  if (!state.lastStoreRefresh || Date.now() - Date.parse(state.lastStoreRefresh) > 20 * 3600_000) {
    try {
      await svc.storeRefresh()
      state.lastStoreRefresh = new Date().toISOString()
      await saveState(state)
    } catch (e) {
      errors.push(`스토어 조회: ${(e as Error).message}`)
    }
  }

  // 3) 규칙 신호
  const cards = await svc.listCards(false)
  const changeDocs = await new MarkdownStore('change').list()
  const changes = changeDocs.map((c) => ({
    id: c.id,
    product: String(c.meta.product ?? ''),
    name: String(c.meta.name ?? c.id),
    status: String(c.meta.status ?? ''),
    updated_at: String(c.meta.updated_at ?? ''),
  }))
  const msDocs = await ops.milestones()
  const milestones = msDocs.map((m) => ({
    id: m.id,
    product: String(m.meta.product ?? ''),
    name: String(m.meta.name ?? m.id),
    status: String(m.meta.status ?? ''),
    target_date: (m.meta.target_date as string | null) ?? null,
  }))
  const usage = await usageSummary(3)
  const signals = ruleSignals({ cards, changes, milestones, aiFailures: usage.byProvider })
  const h = loadRevenueHistory()
  const sum = (from: number, to: number) => {
    let n = 0
    for (let k = from; k < to; k++) {
      const d = new Date(Date.now() - k * DAY)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      for (const v of Object.values(h.days[key] ?? {})) n += v.e
    }
    return n
  }
  revenue.total7d = sum(0, 7)
  revenue.prev7d = sum(7, 14)

  // 4) 신호가 바뀌었을 때만 AI 조언
  const signalsHash = crypto
    .createHash('sha1')
    .update(JSON.stringify(signals.map((s) => s.key)))
    .digest('hex')
  const prev = latestReport()
  let advice: Advice[]
  let source = 'rule'
  if (!opts.force && prev && prev.signalsHash === signalsHash && prev.advice.length) {
    advice = prev.advice
    source = prev.source
  } else {
    const facts = {
      revenue_7d_usd: Number(revenue.total7d.toFixed(3)),
      revenue_prev_7d_usd: Number(revenue.prev7d.toFixed(3)),
      projects: cards.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        kind: p.kind,
        monetization: p.monetization,
        revenue_7d: p.revenue7d ? Number(p.revenue7d.earnings.toFixed(3)) : null,
        revenue_prev_7d: p.revenue7d ? Number(p.revenue7d.prev.toFixed(3)) : null,
        impressions_7d: p.revenue7d?.impressions ?? null,
        pending_release: p.pendingRelease,
        work: p.work,
      })),
      signals: signals.map((s) => ({
        severity: s.severity,
        project: s.project,
        title: s.title,
        detail: s.detail,
      })),
    }
    const out = await aiChat({
      task: 'advice',
      sensitive: true,
      json: true,
      temperature: 0.3,
      messages: [
        { role: 'system', content: ADVICE_SYSTEM },
        { role: 'user', content: JSON.stringify(facts) },
      ],
    })
    const j = out ? extractJson<{ advice?: Array<Partial<Advice>> }>(out.text) : null
    const valid = (j?.advice ?? []).filter((a) => typeof a.title === 'string' && a.title.trim())
    if (out && valid.length) {
      const hrefOf = (project: string | null) =>
        signals.find((s) => s.project === project)?.action?.href
      const ids = new Set(cards.map((c) => c.id))
      advice = valid.slice(0, 6).map((a) => {
        const project = a.project && ids.has(String(a.project)) ? String(a.project) : null
        return {
          id: adviceId({ title: String(a.title), project }),
          project,
          impact: (['high', 'medium', 'low'].includes(String(a.impact))
            ? a.impact
            : 'medium') as Advice['impact'],
          title: String(a.title).trim(),
          why: String(a.why ?? '').trim(),
          action: String(a.action ?? '').trim(),
          href: project
            ? (hrefOf(project) ?? `#/projects/${encodeURIComponent(project)}`)
            : undefined,
        }
      })
      source = `${out.provider}/${out.model}`
    } else {
      advice = fromSignals(signals)
    }
  }

  const report: MonitorReport = {
    at: new Date().toISOString(),
    ok: errors.length === 0,
    signals,
    advice,
    source,
    signalsHash,
    revenue,
    errors,
  }
  fs.mkdirSync(dir(), { recursive: true })
  await atomicWrite(latestPath(), JSON.stringify(report, null, 2) + '\n')
  await atomicWrite(
    path.join(dir(), `${report.at.slice(0, 10)}.json`),
    JSON.stringify(report, null, 2) + '\n'
  )
  return report
}

/* ---- 스케줄러 ---------------------------------------------------------------- */
let timer: NodeJS.Timeout | null = null

export function startMonitorLoop() {
  const hours = Number(process.env.XITA_MONITOR_HOURS ?? 6)
  if (!(hours > 0) || timer) return
  const tick = () =>
    runMonitor().catch((e) => {
      // 모니터 실패가 서버를 멈추지 않는다 — 다음 주기에 다시
      console.error('[monitor]', (e as Error).message)
    })
  // 부팅 직후 바로 돌지 않고 1분 뒤 (서버 기동·HMR 재시작 폭주 방지), 마지막 실행이 주기 안이면 건너뜀
  const last = latestReport()
  const due = !last || Date.now() - Date.parse(last.at) > hours * 3600_000
  setTimeout(() => due && tick(), 60_000).unref()
  timer = setInterval(tick, hours * 3600_000)
  timer.unref()
}
