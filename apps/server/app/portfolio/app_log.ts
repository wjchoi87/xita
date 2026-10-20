import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { atomicWrite, readText } from '#v4/fs_util'

/*
 * 앱 기록 (<앱>/docs/app-log.md) — planner dashboard 포맷 그대로 (손으로 쓴 기록과 호환).
 * 앱 저장소 git 과 함께 관리되는 파일이 이 기록의 원본이고, XITA 는 같은 내용을
 * 제품 타임라인(APP_LOG 이벤트)에도 남겨 일대기에서 보이게 한다 (portfolio/service.ts).
 *
 *   ## 2026-10-15 14:03 · 배포 {#a1b2c3d4}
 *   트랙: internal · v1.1.5 (119)
 */

export interface LogEntry {
  id: string
  date: string
  kind: string
  body: string
}

export const LOG_HEADER =
  '# 앱 기록\n\n' +
  '<!-- 이 파일은 대시보드가 갱신한다. 손으로 고쳐도 되지만 항목 형식' +
  '(## 날짜 · 종류 {#id})은 유지할 것. -->'

const ENTRY_HEAD = /^## (\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?) · ([^\n{]+?)\s*(?:\{#([\w-]+)\})?\s*$/m

export function logPath(dir: string): string {
  return path.join(dir, 'docs', 'app-log.md')
}

/** 손으로 쓴 항목엔 섹션 내용 md5 앞 8자리를 id 로 쓴다 (planner 와 동일 → 같은 id). */
function entryId(section: string, explicit: string | undefined): string {
  return explicit || crypto.createHash('md5').update(section).digest('hex').slice(0, 8)
}

function sections(text: string): string[] {
  return text.split(/\n(?=## )/)
}

function headOf(section: string): RegExpMatchArray | null {
  // planner 의 re.match 처럼 섹션 맨 앞에서만 매치
  const m = section.match(ENTRY_HEAD)
  return m && m.index === 0 ? m : null
}

export function parseLog(text: string): LogEntry[] {
  const out: LogEntry[] = []
  for (const s of sections(text)) {
    const m = headOf(s)
    if (!m) continue
    out.push({
      id: entryId(s, m[3]),
      date: m[1],
      kind: m[2].trim(),
      body: s.slice(m[0].length).trim(),
    })
  }
  return out
}

export async function readLog(dir: string): Promise<LogEntry[]> {
  const text = await readText(logPath(dir))
  return text ? parseLog(text) : []
}

/*
 * 변경 전 정책: 서버 프로세스 시간대로 기록 → .env 의 TZ=UTC 때문에 "2026-10-16 16:53"(UTC)이 찍혔다.
 * 변경 후 정책: 앱 기록 시각은 사람의 벽시계 기준 — XITA_TZ → OS 시간대(/etc/localtime) → 프로세스 시간대 순.
 * 변경 이유: planner 는 로컬 시각으로 기록했다. 같은 파일에 UTC 가 섞이면 기록 순서·날짜가 틀어진다.
 * 영향 범위: app-log.md 새 항목의 날짜, 이관 시 과거 항목 → 타임라인 시각 변환.
 */
let cachedZone: string | null | undefined
export function wallClockZone(): string | undefined {
  if (process.env.XITA_TZ) return process.env.XITA_TZ
  if (cachedZone === undefined) {
    try {
      cachedZone = fs.readlinkSync('/etc/localtime').split('zoneinfo/')[1] ?? null
    } catch {
      cachedZone = null
    }
  }
  return cachedZone ?? undefined
}

function zoneParts(d: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? '00'
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute') }
}

export function stamp(d = new Date(), timeZone = wallClockZone()): string {
  const p = zoneParts(d, timeZone)
  return `${p.y}-${p.m}-${p.d} ${p.h}:${p.mi}`
}

/** "YYYY-MM-DD[ HH:MM]" (벽시계, timeZone 기준) → 실제 시각 */
export function stampToDate(value: string, timeZone = wallClockZone()): Date {
  const [date, time = '00:00'] = value.split(' ')
  const [y, mo, da] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, da, h, mi)
  const shown = zoneParts(new Date(guess), timeZone)
  const shownUtc = Date.UTC(+shown.y, +shown.m - 1, +shown.d, +shown.h, +shown.mi)
  return new Date(guess - (shownUtc - guess))
}

export function normalizeKind(kind: string): string {
  return (
    kind
      .replace(/[#\n·]/g, '')
      .trim()
      .slice(0, 20) || '메모'
  )
}

/** 새 항목을 헤더 바로 아래(맨 위)에 넣는다. 최신이 위. */
export function insertEntry(text: string | null, entry: LogEntry): string {
  const base = text ?? LOG_HEADER
  const idx = base.indexOf('\n## ')
  const header = idx >= 0 ? base.slice(0, idx) : base
  const tail = idx >= 0 ? base.slice(idx) : ''
  let section = `## ${entry.date} · ${entry.kind} {#${entry.id}}\n`
  if (entry.body) section += `${entry.body}\n`
  return `${header.replace(/\n+$/, '')}\n\n${section}${tail.replace(/^\n+/, '')}`
}

export async function appendLog(dir: string, kind: string, body = ''): Promise<LogEntry> {
  if (!fs.existsSync(dir)) throw new Error(`프로젝트 폴더가 없습니다: ${dir}`)
  const entry: LogEntry = {
    id: crypto.randomBytes(4).toString('hex'),
    date: stamp(),
    kind: normalizeKind(kind),
    body: body.trim(),
  }
  const f = logPath(dir)
  await atomicWrite(f, insertEntry(await readText(f), entry))
  return entry
}

export function removeEntry(text: string, id: string): string | null {
  const all = sections(text)
  const kept = all.filter((s) => {
    const m = headOf(s)
    return !(m && entryId(s, m[3]) === id)
  })
  if (kept.length === all.length) return null
  return (
    kept
      .filter((p) => p.trim())
      .map((p) => p.replace(/\n+$/, ''))
      .join('\n') + '\n'
  )
}

export async function deleteLog(dir: string, id: string): Promise<boolean> {
  const f = logPath(dir)
  const text = await readText(f)
  if (!text) return false
  const next = removeEntry(text, id)
  if (next === null) return false
  await atomicWrite(f, next)
  return true
}
