import fs from 'node:fs'
import path from 'node:path'
import { workspaceRoot } from '#v4/workspace'
import { admobClientPath, admobTokenPath } from '#portfolio/config'
import { atomicWrite } from '#v4/fs_util'

/*
 * 애드몹 수익 (planner revenue_status/admob_report 이관).
 * 애드몹 리포팅은 서비스 계정을 지원하지 않아 OAuth 사용자 동의가 필요하다.
 *   <admobDir>/admob-client.json  OAuth 클라이언트(데스크톱 앱) {"client_id","client_secret"}
 *   <admobDir>/admob-token.json   동의 완료 후 서버가 저장 {"client_id","client_secret","refresh_token"}
 * 토큰 내용은 응답에 절대 싣지 않는다.
 */

export const ADMOB_SCOPE = 'https://www.googleapis.com/auth/admob.readonly'

type MetricValue = { decimalValue?: string; microsValue?: string; integerValue?: string }

function metric(mv: MetricValue | undefined): number {
  if (!mv) return 0
  const n = mv.decimalValue ?? (mv.microsValue ? Number(mv.microsValue) / 1e6 : mv.integerValue)
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

async function httpJson(
  url: string,
  init: { body?: string; token?: string; ctype?: string; method?: string } = {}
): Promise<any> {
  const headers: Record<string, string> = {}
  if (init.token) headers.Authorization = `Bearer ${init.token}`
  if (init.body !== undefined) headers['Content-Type'] = init.ctype ?? 'application/json'
  const res = await fetch(url, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body,
    signal: AbortSignal.timeout(120_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`)
  return text.trim() ? JSON.parse(text) : {}
}

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

/*
 * 변경 전 정책: 최근 7일 앱별 합계만 그때그때 조회, 아무것도 저장하지 않음.
 * 변경 후 정책: 기간(1~90일) 선택, 날짜×앱 단위로 받아 <workspace>/revenue/admob-daily.json 에 병합 저장.
 *   조회가 실패해도 저장된 기록으로 화면·모니터링이 동작한다(stale 표시). 최근 며칠 값은 애드몹이 확정 전이라 매번 덮어쓴다.
 * 변경 이유: 추이·eCPM 변화·홍보 전후 비교와 수익 모니터링(조언)에 일 단위 기록이 필요.
 * 영향 범위: GET /portfolio/revenue 응답(기존 필드 유지 + daily·apps[].appId/project/daily·stale).
 */
export interface AppRef {
  label: string
  project?: string
}

type Day = Record<string, { e: number; i: number }>
interface History {
  updated_at: string | null
  days: Record<string, Day>
}

const historyPath = () => path.join(workspaceRoot(), 'revenue', 'admob-daily.json')

export function loadRevenueHistory(): History {
  try {
    const h = JSON.parse(fs.readFileSync(historyPath(), 'utf8')) as History
    return { updated_at: h.updated_at ?? null, days: h.days ?? {} }
  } catch {
    return { updated_at: null, days: {} }
  }
}

async function mergeHistory(fresh: Record<string, Day>) {
  const h = loadRevenueHistory()
  for (const [date, apps] of Object.entries(fresh)) h.days[date] = apps
  h.updated_at = new Date().toISOString()
  fs.mkdirSync(path.dirname(historyPath()), { recursive: true })
  await atomicWrite(historyPath(), JSON.stringify(h, null, 1) + '\n')
}

const ymdStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 저장된 기록 → 화면 응답 형태 (기간 days, 오늘 포함) */
export function summarizeRevenue(h: History, apps: Map<string, AppRef>, days: number) {
  const today = new Date()
  const dates: string[] = []
  for (let k = days - 1; k >= 0; k--) dates.push(ymdStr(new Date(today.getTime() - k * 86400_000)))
  const per = new Map<
    string,
    {
      appId: string
      label: string
      project: string | null
      earnings: number
      impressions: number
      daily: number[]
    }
  >()
  const daily = dates.map((date, idx) => {
    let e = 0
    let i = 0
    for (const [appId, v] of Object.entries(h.days[date] ?? {})) {
      e += v.e
      i += v.i
      const ref = apps.get(appId)
      const row = per.get(appId) ?? {
        appId,
        label: ref?.label ?? (appId || '(알 수 없음)'),
        project: ref?.project ?? null,
        earnings: 0,
        impressions: 0,
        daily: dates.map(() => 0),
      }
      row.earnings += v.e
      row.impressions += v.i
      row.daily[idx] += v.e
      per.set(appId, row)
    }
    return { date, earnings: e, impressions: i, recorded: date in h.days }
  })
  const list = [...per.values()]
  return {
    available: true,
    days,
    until: dates.at(-1),
    total: {
      earnings: list.reduce((n, a) => n + a.earnings, 0),
      impressions: list.reduce((n, a) => n + a.impressions, 0),
    },
    daily,
    apps: list,
    updated_at: h.updated_at,
  }
}

export async function admobReport(apps: Map<string, AppRef>, days = 7) {
  const tok = readJson(admobTokenPath())
  const tokenRes = await httpJson('https://oauth2.googleapis.com/token', {
    body: new URLSearchParams({
      client_id: tok.client_id,
      client_secret: tok.client_secret,
      refresh_token: tok.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
    ctype: 'application/x-www-form-urlencoded',
  })
  const access = tokenRes.access_token as string

  const accounts = await httpJson('https://admob.googleapis.com/v1/accounts', { token: access })
  const publisherIds: string[] = (accounts.account ?? []).map((a: { name: string }) =>
    a.name.split('/').pop()
  )
  if (!publisherIds.length) throw new Error('연결된 애드몹 계정이 없습니다')

  const today = new Date()
  const start = new Date(today.getTime() - (days - 1) * 86400_000)
  const ymd = (d: Date) => ({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() })
  const spec = {
    reportSpec: {
      dateRange: { startDate: ymd(start), endDate: ymd(today) },
      dimensions: ['DATE', 'APP'],
      // v1 메트릭명: v2의 AD_IMPRESSIONS 가 아니라 IMPRESSIONS.
      metrics: ['ESTIMATED_EARNINGS', 'IMPRESSIONS'],
    },
  }

  const fresh: Record<string, Day> = {}
  // 조회 범위의 날짜는 0 이라도 기록해 둔다 (수익 없는 날 ≠ 조회 안 한 날)
  for (let k = 0; k < days; k++) fresh[ymdStr(new Date(start.getTime() + k * 86400_000))] = {}
  for (const pid of publisherIds) {
    const rep = await httpJson(
      `https://admob.googleapis.com/v1/accounts/${pid}/networkReport:generate`,
      { body: JSON.stringify(spec), token: access }
    )
    // 응답은 [{header}, {row}..., {footer}] 청크 배열이다.
    for (const chunk of Array.isArray(rep) ? rep : []) {
      const row = chunk.row
      if (!row) continue
      const raw: string = row.dimensionValues?.DATE?.value ?? ''
      const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}` : raw
      const appId: string = row.dimensionValues?.APP?.value ?? ''
      const day = (fresh[date] ??= {})
      const cur = day[appId] ?? { e: 0, i: 0 }
      cur.e += metric(row.metricValues?.ESTIMATED_EARNINGS)
      cur.i += Math.trunc(metric(row.metricValues?.IMPRESSIONS))
      day[appId] = cur
    }
  }
  await mergeHistory(fresh)
  return summarizeRevenue(loadRevenueHistory(), apps, days)
}

export async function revenueStatus(apps: Map<string, AppRef>, days = 7) {
  if (!fs.existsSync(admobClientPath())) {
    return {
      available: false,
      client: false,
      reason: '애드몹 리포팅은 OAuth 사용자 동의가 필요합니다 (서비스 계정 미지원).',
      detail:
        'Google Cloud Console에서 OAuth 클라이언트(데스크톱 앱)를 만들고 ' +
        `${admobClientPath()} 에 {"client_id", "client_secret"} 을 저장하면 '애드몹 연결' 버튼이 활성화됩니다.`,
    }
  }
  if (!fs.existsSync(admobTokenPath())) {
    return {
      available: false,
      client: true,
      reason: '아직 연결되지 않았습니다.',
      detail: "'애드몹 연결' 버튼을 눌러 Google 계정 동의를 완료하세요.",
    }
  }
  try {
    return await admobReport(apps, days)
  } catch (e) {
    // 저장된 기록이 있으면 그걸로 보여 준다 (stale)
    const h = loadRevenueHistory()
    if (Object.keys(h.days).length)
      return {
        ...summarizeRevenue(h, apps, days),
        stale: true,
        reason: `조회 실패: ${(e as Error).message}`,
      }
    return {
      available: false,
      client: true,
      connected: true,
      reason: `조회 실패: ${(e as Error).message}`,
      detail: `동의가 만료됐으면 ${admobTokenPath()} 을 지우고 다시 연결하세요.`,
    }
  }
}

export function authUrl(redirectUri: string): string {
  const client = readJson(admobClientPath())
  const q = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ADMOB_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`
}

export async function exchangeCode(code: string, redirectUri: string) {
  const client = readJson(admobClientPath())
  const tok = await httpJson('https://oauth2.googleapis.com/token', {
    body: new URLSearchParams({
      code,
      client_id: client.client_id,
      client_secret: client.client_secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
    ctype: 'application/x-www-form-urlencoded',
  })
  if (!tok.refresh_token)
    throw new Error('refresh_token 을 받지 못했습니다 (동의 화면에서 다시 시도)')
  await atomicWrite(
    admobTokenPath(),
    JSON.stringify({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: tok.refresh_token,
    })
  )
  fs.chmodSync(admobTokenPath(), 0o600)
}
