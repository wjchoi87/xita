import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { MarkdownStore, type StoredDoc } from '#v4/markdown_store'
import { V4Ops } from '#v4/ops'
import { atomicWrite } from '#v4/fs_util'
import slugify from '#utils/slug'
import {
  TRACKS,
  type Track,
  admobClientPath,
  admobDir,
  admobTokenPath,
  keystorePropsPath,
  playKeyPath,
  portfolioName,
  portfolioRoot,
  python,
  registryExportPath,
  secretsDir,
  toolsDir,
  workspaceRoot,
} from '#portfolio/config'
import {
  bumpVersionCode,
  detectCommands,
  inspectProject,
  writeAdIds,
  type Cmd,
  type ProjectFacts,
} from '#portfolio/inspect'
import { appendLog, deleteLog, readLog, type LogEntry } from '#portfolio/app_log'
import { loadRevenueHistory } from '#portfolio/revenue'
import { getJob, jobLine, runningFor, startJob, type Job, type Step } from '#portfolio/jobs'

const pexec = promisify(execFile)

/*
 * Portfolio — "모든 프로젝트를 관장" (planner dashboard 기능 흡수, docs/PORTFOLIO.md).
 *
 * 프로젝트 = XITA Product 문서 + 포트폴리오 필드(codename/repo_path/portfolio/cmds/store_tracks/archived).
 * 레지스트리의 원본은 products/*.md 이고, planner 호환 projects.json 은 derived export 다.
 * 사람이 의미 있는 사건(등록·배포·노트·광고·메모)은 앱 기록(app-log.md)과
 * 제품 타임라인(일대기)에 함께 남긴다.
 */

export interface ProjectCard extends Omit<ProjectFacts, 'path'> {
  id: string
  codename: string
  name: string
  desc: string
  path: string
  archived: boolean
  status: string | null
  monetization: string | null
  store: Partial<Record<Track, number>> | null
  storeCheckedAt: string | null
  pendingRelease: boolean
  activeChanges: number
  needsYou: number
  logCount: number
  lastActivity: { ts: string; title: string } | null
  /** 컨트롤 타워: 작업 현황 · 가장 최근 소식(타임라인/할 일/커밋 중 최신) · 7일 수익(저장된 기록) */
  work: { idea: number; todo: number; doing: number; review: number; doingTitles: string[] }
  latest: { ts: string; title: string; source: 'event' | 'work' | 'git' } | null
  revenue7d: { earnings: number; prev: number; impressions: number } | null
  running: string | null
}

const ACTIVE = ['IDEA', 'PLAN', 'BUILD', 'REVIEW', 'SHIP_READY']
const STATUS_KO: Record<string, string> = {
  IDEA: '아이디어',
  PLAN: '할 일',
  BUILD: '진행 중',
  REVIEW: '검토 대기',
  SHIP_READY: '출시 승인 대기',
  SHIPPED: '완료',
  PAUSED: '보류',
  CANCELLED: '취소',
}

/** 마지막 git 동작(커밋·pull 등) — .git/logs/HEAD 마지막 줄 (프로세스 없이 파일 읽기) */
export function lastGitAction(dir: string): { ts: string; title: string } | null {
  try {
    const raw = fs.readFileSync(path.join(dir, '.git', 'logs', 'HEAD'), 'utf8').trimEnd()
    const line = raw.slice(raw.lastIndexOf('\n') + 1)
    const m = line.match(/> (\d+) [+-]\d{4}\t(.*)$/)
    if (!m) return null
    const msg = m[2]
      .replace(/^commit( \(\w+\))?: /, '커밋: ')
      .replace(/^pull: .*/, '동기화 (git pull)')
    return { ts: new Date(Number(m[1]) * 1000).toISOString(), title: msg.slice(0, 120) }
  } catch {
    return null
  }
}

/** 저장된 애드몹 기록에서 최근 7일 / 그 전 7일 */
function revenueWindow(h: ReturnType<typeof loadRevenueHistory>, appId: string) {
  if (!Object.keys(h.days).length) return null
  const day = (k: number) => {
    const d = new Date(Date.now() - k * 86400_000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  let earnings = 0
  let prev = 0
  let impressions = 0
  for (let k = 0; k < 14; k++) {
    const v = h.days[day(k)]?.[appId]
    if (!v) continue
    if (k < 7) {
      earnings += v.e
      impressions += v.i
    } else prev += v.e
  }
  return { earnings, prev, impressions }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback
  if (typeof raw === 'object') return raw as T
  try {
    return JSON.parse(String(raw)) as T
  } catch {
    return fallback
  }
}

/** 셸 단일 인용 */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/** 에이전트가 기록에 쓸 xita CLI 위치 (서버 cwd = apps/server 기준) */
function agentCliPath(): string | null {
  const cands = [
    path.resolve(process.cwd(), '../cli/xita.mjs'),
    path.resolve(process.cwd(), 'apps/cli/xita.mjs'),
  ]
  return cands.find((p) => fs.existsSync(p)) ?? null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null
}

export function isProject(doc: StoredDoc): boolean {
  return !!(doc.meta.repo_path || doc.meta.codename || doc.meta.portfolio)
}

export function isArchived(doc: StoredDoc): boolean {
  return doc.meta.archived === true || doc.meta.archived === 'true'
}

export function projectDir(doc: StoredDoc): string {
  const raw = str(doc.meta.repo_path)
  if (raw) return path.resolve(raw.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'))
  return path.join(portfolioRoot(), String(doc.meta.codename ?? doc.id))
}

export function projectIdFor(codename: string): string {
  return slugify(codename)
}

/** 폰에서 입력할 호스트 주소 후보 (LAN IPv4). HOST 가 loopback 이면 폰에서 닿지 않음을 알린다. */
export function mobileConnection() {
  const port = Number(process.env.PORT ?? 3333)
  const bind = process.env.HOST ?? 'localhost'
  // 실제 랜카드(en*/eth*/wlan*)를 먼저, Docker·VM 브리지 같은 가상 인터페이스는 뒤로
  const physical = /^(en|eth|wlan|wl)\d/
  const found: Array<{ name: string; url: string }> = []
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    for (const a of list ?? [])
      if (a.family === 'IPv4' && !a.internal)
        found.push({ name, url: `http://${a.address}:${port}` })
  found.sort(
    (a, b) =>
      Number(physical.test(b.name)) - Number(physical.test(a.name)) || a.name.localeCompare(b.name)
  )
  const primary = found.filter((f) => physical.test(f.name))
  const urls = (primary.length ? primary : found).map((f) => f.url)
  const loopbackOnly = ['localhost', '127.0.0.1', '::1'].includes(bind)
  return { bind, port, urls, reachable: !loopbackOnly }
}

export class PortfolioService {
  products = new MarkdownStore('product')
  changes = new MarkdownStore('change')
  ops = new V4Ops()

  // ---- 조회 -----------------------------------------------------------------

  private async projectDocs(includeArchived = false): Promise<StoredDoc[]> {
    const docs = await this.products.list()
    const all = docs.filter(isProject)
    return includeArchived ? all : all.filter((d) => !isArchived(d))
  }

  async requireProject(id: string): Promise<StoredDoc> {
    const doc = await this.products.read(id)
    if (!doc || !isProject(doc)) throw new HttpError(404, `프로젝트를 찾을 수 없습니다: ${id}`)
    return doc
  }

  private async context() {
    const [changes, needs, events] = await Promise.all([
      this.changes.list(),
      this.ops.needsYou().catch(() => []),
      this.ops.timeline(undefined, 2000).catch(() => []),
    ])
    return { changes, needs, events, revenue: loadRevenueHistory() }
  }

  private async card(
    doc: StoredDoc,
    ctx: Awaited<ReturnType<PortfolioService['context']>>
  ): Promise<ProjectCard> {
    const dir = projectDir(doc)
    const facts = inspectProject(dir)
    const store = parseJson<Partial<Record<Track, number>> | null>(doc.meta.store_tracks, null)
    const prod = store?.production
    const lastEvt = ctx.events.find((e) => e.product === doc.id)
    const logCount = facts.exists ? await readLog(dir).then((l) => l.length) : 0
    const mine = ctx.changes.filter((c) => c.meta.product === doc.id)
    const by = (st: string[]) => mine.filter((c) => st.includes(String(c.meta.status)))
    const doingDocs = by(['BUILD', 'REVIEW', 'SHIP_READY'])
    const lastChange = [...mine].sort((a, b) =>
      String(b.meta.updated_at ?? '').localeCompare(String(a.meta.updated_at ?? ''))
    )[0]
    const git = facts.git ? lastGitAction(dir) : null
    // 이관·등록 같은 기계적 이벤트는 '소식'이 아니다
    const newsEvt = ctx.events.find(
      (e) =>
        e.product === doc.id &&
        !['PROJECT_IMPORTED', 'PROJECT_REGISTERED'].includes(String(e.event_type))
    )
    const candidates = [
      newsEvt
        ? { ts: String(newsEvt.ts), title: String(newsEvt.title ?? ''), source: 'event' as const }
        : null,
      lastChange?.meta.updated_at
        ? {
            ts: String(lastChange.meta.updated_at),
            title: `${String(lastChange.meta.name ?? lastChange.id)} · ${STATUS_KO[String(lastChange.meta.status)] ?? ''}`,
            source: 'work' as const,
          }
        : null,
      git ? { ...git, source: 'git' as const } : null,
    ].filter((x): x is NonNullable<typeof x> => !!x && !Number.isNaN(Date.parse(x.ts)))
    const latest = candidates.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0] ?? null
    const appId = facts.adIds.appId
    const rev = appId ? revenueWindow(ctx.revenue, appId) : null
    const job = runningFor(doc.id)
    return {
      ...facts,
      id: doc.id,
      codename: String(doc.meta.codename ?? doc.id),
      name: String(doc.meta.name ?? doc.id),
      desc: String(doc.meta.summary ?? doc.meta.description ?? ''),
      path: dir,
      archived: isArchived(doc),
      status: str(doc.meta.production_status),
      monetization: str(doc.meta.monetization),
      store,
      storeCheckedAt: str(doc.meta.store_checked_at),
      pendingRelease:
        facts.versionCode !== null && typeof prod === 'number' && facts.versionCode > prod,
      activeChanges: ctx.changes.filter(
        (c) => c.meta.product === doc.id && ACTIVE.includes(String(c.meta.status))
      ).length,
      needsYou: ctx.needs.filter((n) => n.product === doc.id).length,
      logCount,
      lastActivity: lastEvt ? { ts: String(lastEvt.ts), title: String(lastEvt.title ?? '') } : null,
      work: {
        idea: by(['IDEA']).length,
        todo: by(['PLAN', 'PAUSED']).length,
        doing: by(['BUILD']).length,
        review: by(['REVIEW', 'SHIP_READY']).length,
        doingTitles: doingDocs.slice(0, 3).map((c) => String(c.meta.name ?? c.id)),
      },
      latest,
      revenue7d: rev,
      running: job ? job.label : null,
    }
  }

  async listCards(includeArchived = false): Promise<ProjectCard[]> {
    const [docs, ctx] = await Promise.all([this.projectDocs(includeArchived), this.context()])
    const cards = await Promise.all(docs.map((d) => this.card(d, ctx)))
    return cards.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }

  async overview() {
    const [projects, ctx] = await Promise.all([this.listCards(), this.context()])
    return {
      portfolio: { name: portfolioName(), root: portfolioRoot(), workspace: workspaceRoot() },
      projects,
      totals: {
        projects: projects.length,
        live: projects.filter((p) => p.status === 'PRODUCTION').length,
        android: projects.filter((p) => p.kind === 'android').length,
        pendingRelease: projects.filter((p) => p.pendingRelease).length,
        needsYou: ctx.needs.length,
        activeChanges: projects.reduce((n, p) => n + p.activeChanges, 0),
      },
      playKey: fs.existsSync(playKeyPath()),
      tracks: TRACKS,
    }
  }

  commandsOf(doc: StoredDoc): Array<Cmd & { learned: boolean }> {
    const learned = parseJson<Cmd[]>(doc.meta.cmds, [])
    const detected = detectCommands(projectDir(doc))
    const out: Array<Cmd & { learned: boolean }> = detected.map((c) => ({ ...c, learned: false }))
    for (const c of learned) {
      const i = out.findIndex((x) => x.cmd === c.cmd || x.name === c.name)
      if (i >= 0) out[i] = { ...c, learned: true }
      else out.push({ ...c, learned: true })
    }
    return out
  }

  async detail(id: string) {
    const doc = await this.requireProject(id)
    const ctx = await this.context()
    const project = await this.card(doc, ctx)
    const artifacts = await this.ops.listDocs('artifact', id)
    return {
      project,
      commands: this.commandsOf(doc),
      changes: ctx.changes
        .filter((c) => c.meta.product === id)
        .map((c) => ({
          id: c.id,
          name: String(c.meta.name ?? c.id),
          status: String(c.meta.status ?? 'IDEA'),
          priority: String(c.meta.priority ?? 'normal'),
        })),
      docs: artifacts.map((a) => ({
        id: a.id,
        name: String(a.meta.name ?? a.id),
        kind: String(a.meta.kind ?? 'doc'),
        revision: Number(a.meta.current_revision ?? a.revision ?? 1),
        updatedAt: str(a.meta.updated_at),
      })),
      timeline: ctx.events
        .filter((e) => e.product === id)
        .slice(0, 50)
        .map((e) => ({
          ts: e.ts,
          event_type: e.event_type,
          title: e.title,
          summary: e.summary ?? null,
        })),
    }
  }

  // ---- 레지스트리 --------------------------------------------------------------

  /** planner 호환 projects.json — portfolio/tools/*.py 가 앱 경로를 찾을 때 읽는다 */
  async exportRegistry(): Promise<string> {
    const docs = await this.projectDocs(false)
    const projects = docs.map((d) => {
      const cmds = parseJson<Cmd[]>(d.meta.cmds, [])
      return {
        codename: String(d.meta.codename ?? d.id),
        label: String(d.meta.name ?? d.id),
        desc: String(d.meta.summary ?? ''),
        path: projectDir(d),
        ...(cmds.length ? { cmds } : {}),
      }
    })
    const file = registryExportPath()
    await atomicWrite(file, JSON.stringify({ version: 1, projects }, null, 2) + '\n')
    return file
  }

  async register(input: { path: string; codename?: string; name?: string; desc?: string }) {
    const raw = (input.path ?? '').trim()
    if (!raw) throw new HttpError(400, '프로젝트 경로를 입력하세요')
    const expanded = raw.replace(/^~(?=$|\/)/, process.env.HOME ?? '~')
    const dir = path.isAbsolute(expanded)
      ? path.resolve(expanded)
      : path.resolve(portfolioRoot(), expanded)
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
      throw new HttpError(400, `폴더가 없습니다: ${dir}`)
    const codename = (input.codename ?? '').trim() || path.basename(dir)
    const id = projectIdFor(codename)
    const existing = await this.products.read(id)
    if (existing) {
      if (isProject(existing) && isArchived(existing)) {
        await this.products.applyField(id, 'archived', false)
        await this.ops.recordEvent({
          eventType: 'PROJECT_RESTORED',
          product: id,
          title: '포트폴리오로 복귀',
        })
        await this.exportRegistry()
        return this.detail(id).then((d) => d.project)
      }
      throw new HttpError(409, `이미 등록된 프로젝트입니다: ${id}`)
    }
    const kind = inspectProject(dir).kind
    const name = (input.name ?? '').trim() || codename
    const desc = (input.desc ?? '').trim()
    await this.products.upsert(
      id,
      {
        id,
        type: 'product',
        name,
        status: 'production',
        production_status: 'DEVELOPMENT',
        version: null,
        current_goal: null,
        direction: null,
        portfolio: portfolioName(),
        codename,
        repo_path: dir,
        summary: desc || null,
        archived: false,
      },
      `# ${name}\n\n## 설명\n\n${desc || '-'}\n`,
      1
    )
    await this.ops.recordEvent({
      eventType: 'PROJECT_REGISTERED',
      product: id,
      title: `포트폴리오에 등록 (${kind})`,
      summary: dir,
    })
    await appendLog(dir, '등록', `XITA 포트폴리오에 등록 (${kind})`).catch(() => null)
    await this.exportRegistry()
    return this.detail(id).then((d) => d.project)
  }

  /** planner "앱 제거" = 레지스트리에서만 빼기. XITA 는 Product(일대기)를 보존하고 archived 로 표시. */
  async setArchived(id: string, archived: boolean) {
    await this.requireProject(id)
    await this.products.applyField(id, 'archived', archived)
    await this.ops.recordEvent({
      eventType: archived ? 'PROJECT_ARCHIVED' : 'PROJECT_RESTORED',
      product: id,
      title: archived ? '포트폴리오에서 보관' : '포트폴리오로 복귀',
    })
    await this.exportRegistry()
    return this.detail(id).then((d) => d.project)
  }

  // ---- 앱 기록 -----------------------------------------------------------------

  async log(id: string) {
    const doc = await this.requireProject(id)
    const dir = projectDir(doc)
    return { entries: await readLog(dir), path: path.join(dir, 'docs', 'app-log.md') }
  }

  /** 앱 기록 + 제품 타임라인 동시 기록. 앱 폴더가 없으면 타임라인에만 남긴다. */
  async addLog(id: string, kind: string, text: string): Promise<LogEntry> {
    const doc = await this.requireProject(id)
    let entry: LogEntry | null = null
    try {
      entry = await appendLog(projectDir(doc), kind, text)
    } catch (e) {
      if (kind === '메모') throw new HttpError(400, (e as Error).message)
    }
    await this.ops.recordEvent({
      eventType: 'APP_LOG',
      product: id,
      title: `${entry?.kind ?? kind}${text ? ` — ${text.split('\n')[0].slice(0, 80)}` : ''}`,
      summary: text || null,
    })
    return entry ?? { id: '', date: '', kind, body: text }
  }

  async removeLog(id: string, entryId: string) {
    const doc = await this.requireProject(id)
    const dir = projectDir(doc)
    const entries = await readLog(dir)
    const target = entries.find((e) => e.id === entryId)
    if (!target || !(await deleteLog(dir, entryId)))
      throw new HttpError(404, '기록을 찾을 수 없습니다')
    await this.ops.recordEvent({
      eventType: 'APP_LOG_REMOVED',
      product: id,
      title: `기록 삭제: ${target.date} · ${target.kind}`,
    })
    return { ok: true }
  }

  // ---- 실행 계열 ---------------------------------------------------------------

  private toolEnv(): Record<string, string> {
    return {
      XITA_PORTFOLIO_ROOT: portfolioRoot(),
      XITA_SECRETS_DIR: secretsDir(),
      XITA_ADMOB_DIR: admobDir(),
      XITA_REGISTRY: registryExportPath(),
      XITA_WORKSPACE: workspaceRoot(),
      PYTHONUNBUFFERED: '1',
    }
  }

  private ensureIdle(id: string) {
    const busy = runningFor(id)
    if (busy) throw new HttpError(409, `이미 진행 중인 작업이 있습니다: ${busy.label}`)
  }

  async build(id: string, release: boolean) {
    const doc = await this.requireProject(id)
    const dir = projectDir(doc)
    if (!fs.existsSync(path.join(dir, 'gradlew')))
      throw new HttpError(
        400,
        'gradlew 가 없는 프로젝트입니다 — 명령 탭에서 빌드 명령을 실행하세요'
      )
    this.ensureIdle(id)
    const task = release ? 'bundleRelease' : 'assembleDebug'
    return startJob(`${doc.meta.name ?? id} · ${release ? 'AAB 빌드' : '디버그 빌드'}`, id, [
      { cmd: ['./gradlew', task], cwd: dir },
    ])
  }

  private notesBody(track: string, notes?: string, notesEn?: string) {
    const parts = [`트랙: ${track}`]
    if (notes?.trim()) parts.push(notes.trim())
    if (notesEn?.trim()) parts.push(`[en] ${notesEn.trim()}`)
    return parts
  }

  private assertTrack(track: string, confirmed: boolean): Track {
    if (!TRACKS.includes(track as Track)) throw new HttpError(400, `알 수 없는 트랙: ${track}`)
    if (track === 'production' && !confirmed)
      throw new HttpError(403, '프로덕션은 확인(confirmed)이 필요합니다')
    return track as Track
  }

  async deploy(
    id: string,
    input: {
      track?: string
      bump?: boolean
      confirmed?: boolean
      notes?: string
      notesEn?: string
      /** 리허설: 준비물 점검 + AAB 빌드까지만 (업로드·versionCode 증가·기록 없음) */
      dryRun?: boolean
    }
  ) {
    const doc = await this.requireProject(id)
    const dry = !!input.dryRun
    // 리허설은 스토어에 아무것도 보내지 않으므로 프로덕션 확인 없이 허용
    const track = this.assertTrack(input.track ?? 'internal', dry || !!input.confirmed)
    const dir = projectDir(doc)
    const facts = inspectProject(dir)
    if (facts.kind !== 'android') throw new HttpError(400, 'Android 프로젝트만 배포할 수 있습니다')
    if (!fs.existsSync(playKeyPath()))
      throw new HttpError(400, `play-account.json 이 없습니다 (${secretsDir()})`)
    this.ensureIdle(id)
    await this.exportRegistry()

    const pre: string[] = dry ? ['리허설 — 업로드하지 않습니다'] : []
    if (!dry && input.bump !== false) {
      const bumped = await bumpVersionCode(dir)
      pre.push(
        bumped
          ? `versionCode ${bumped[0]} → ${bumped[1]}`
          : 'versionCode 는 커밋 수 기반(gitCommitCount) — 자동 증가 생략'
      )
    }
    const codename = String(doc.meta.codename ?? id)
    const cmd = [python(), 'deploy.py', codename, '--dir', dir, '--track', track]
    if (input.notes?.trim()) cmd.push('--notes', input.notes.trim())
    if (input.notesEn?.trim()) cmd.push('--notes-en', input.notesEn.trim())
    if (dry) cmd.push('--dry-run')

    return startJob(
      `${doc.meta.name ?? id} · ${track} ${dry ? '배포 리허설' : '배포'}`,
      id,
      [{ cmd, cwd: toolsDir(), env: this.toolEnv() }],
      {
        pre,
        onSuccess: async (job) => {
          if (dry) return
          const after = inspectProject(dir)
          const ver = `v${after.versionName ?? '?'} (${after.versionCode ?? '?'})`
          const body = [
            `트랙: ${track} · ${ver}`,
            ...this.notesBody(track, input.notes, input.notesEn).slice(1),
          ]
          await this.addLog(id, '배포', body.join('\n'))
          if (track === 'production') await this.recordRelease(id, ver, input.notes, job)
        },
      }
    )
  }

  /** 프로덕션 업로드 = XITA 출시 기록. deploy.py 는 production 을 draft 로 올리므로 READY(콘솔 제출 대기). */
  private async recordRelease(id: string, ver: string, notes: string | undefined, job: Job) {
    try {
      const name = `${ver} ${new Date().toISOString().slice(0, 10)}`
      const rel = await this.ops.createRelease({ product: id, name, notes: notes ?? '' })
      await this.ops.setReleaseStatus(rel.id, 'READY')
      jobLine(job, `[XITA] 출시 기록 생성: ${rel.id}`)
    } catch (e) {
      jobLine(job, `[XITA] 출시 기록 생략: ${(e as Error).message}`)
    }
  }

  async notes(
    id: string,
    input: { track?: string; confirmed?: boolean; notes?: string; notesEn?: string }
  ) {
    const doc = await this.requireProject(id)
    const track = this.assertTrack(input.track ?? 'internal', !!input.confirmed)
    if (!fs.existsSync(playKeyPath()))
      throw new HttpError(400, `play-account.json 이 없습니다 (${secretsDir()})`)
    this.ensureIdle(id)
    await this.exportRegistry()
    const dir = projectDir(doc)
    const codename = String(doc.meta.codename ?? id)
    const cmd = [python(), 'deploy.py', codename, '--dir', dir, '--track', track, '--notes-only']
    if (input.notes?.trim()) cmd.push('--notes', input.notes.trim())
    if (input.notesEn?.trim()) cmd.push('--notes-en', input.notesEn.trim())
    return startJob(
      `${doc.meta.name ?? id} · ${track} 출시 노트`,
      id,
      [{ cmd, cwd: toolsDir(), env: this.toolEnv() }],
      {
        onSuccess: async () => {
          await this.addLog(
            id,
            '노트',
            this.notesBody(track, input.notes, input.notesEn).join('\n')
          )
        },
      }
    )
  }

  async adIds(
    id: string,
    ids: { appId?: string; banner?: string; interstitial?: string; rewarded?: string }
  ) {
    const doc = await this.requireProject(id)
    const dir = projectDir(doc)
    const facts = inspectProject(dir)
    let changed: string
    try {
      changed = await writeAdIds(dir, facts.package, ids)
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
    const summary = [
      ids.appId ? `앱 ID ${ids.appId}` : null,
      `배너 ${ids.banner || '-'}`,
      `전면 ${ids.interstitial || '-'}`,
      `리워드 ${ids.rewarded || '-'}`,
    ]
      .filter(Boolean)
      .join('\n')
    await this.addLog(id, '애드몹', summary)
    return { changed }
  }

  /** 명령 학습만 (xita run 처럼 터미널에서 직접 실행하는 경우). 같은 명령/이름은 갱신. */
  async learnCommand(id: string, input: { cmd: string; name?: string }) {
    const doc = await this.requireProject(id)
    const cmd = (input.cmd ?? '').trim()
    if (!cmd) throw new HttpError(400, '명령을 입력하세요')
    const name = (input.name ?? '').trim() || 'run'
    if (this.commandsOf(doc).some((c) => c.cmd === cmd && c.name === name))
      return { learned: false }
    const learned = parseJson<Cmd[]>(doc.meta.cmds, []).filter((c) => c.cmd !== cmd)
    learned.push({ name, cmd })
    await this.products.applyField(id, 'cmds', JSON.stringify(learned))
    await this.exportRegistry()
    return { learned: true }
  }

  /** planner CLI 런처: 프로젝트 폴더에서 셸 명령 실행. 처음 쓰는 명령은 cmds 에 학습한다. */
  async run(id: string, input: { cmd: string; name?: string }) {
    const doc = await this.requireProject(id)
    const cmd = (input.cmd ?? '').trim()
    if (!cmd) throw new HttpError(400, '실행할 명령을 입력하세요')
    const dir = projectDir(doc)
    if (!fs.existsSync(dir)) throw new HttpError(400, `프로젝트 폴더가 없습니다: ${dir}`)
    this.ensureIdle(id)
    const known = this.commandsOf(doc)
    if (!known.some((c) => c.cmd === cmd)) {
      const learned = parseJson<Cmd[]>(doc.meta.cmds, [])
      learned.push({ name: (input.name ?? '').trim() || 'run', cmd })
      await this.products.applyField(id, 'cmds', JSON.stringify(learned))
      await this.exportRegistry()
    }
    const shell = process.env.SHELL || '/bin/sh'
    return startJob(`${doc.meta.name ?? id} · ${cmd}`, id, [{ cmd: [shell, '-lc', cmd], cwd: dir }])
  }

  // ---- AI 에게 맡기기 ---------------------------------------------------------
  /*
   * 변경 전 정책: 작업을 코딩 에이전트에 넘기려면 터미널을 열고 폴더로 가서 맥락을 직접 설명했다.
   * 변경 후 정책: 프로젝트/작업 항목에서 한 번에 지시문(작업 + 보드 + 최근 기록)을 만들고,
   *   그 프로젝트 폴더에서 Claude Code·Codex 를 터미널로 띄운다. 끝나면 에이전트가
   *   `xita log P --add` 로 결과를 남기게 해서 다음 세션이 '이어서' 시작할 수 있게 한다.
   * 변경 이유: Addness 의 "AI에게 묻기 → Claude Code에서 열기" + 목표 메모리를 개인용으로 차용 (2026-10-19).
   * 영향 범위: POST /portfolio/projects/:id/agent (loopback 전용), 웹 콘솔 메뉴, CLI `xita agent`.
   */
  async agentBrief(id: string, input: { change?: string; task?: string }) {
    const doc = await this.requireProject(id)
    const dir = projectDir(doc)
    const name = String(doc.meta.name ?? id)
    const work = await this.ops.productWork(id)
    const change = input.change ? work.changes.find((c) => c.id === input.change) : undefined
    if (input.change && !change)
      throw new HttpError(404, `작업 항목을 찾을 수 없습니다: ${input.change}`)
    const task =
      (input.task ?? '').trim() ||
      (change ? [change.name, change.note].filter(Boolean).join('\n\n') : '')
    if (!task) throw new HttpError(400, '무엇을 맡길지 적어 주세요')

    const label: Record<string, string> = {
      BUILD: '진행 중',
      PLAN: '할 일',
      PAUSED: '보류',
      REVIEW: '검토',
      SHIP_READY: '출시 대기',
    }
    const board = work.changes
      .filter((c) => label[c.status] && c.id !== change?.id)
      .slice(0, 6)
      .map((c) => `- [${label[c.status]}] ${c.name}`)
    let recent: string[] = []
    try {
      const log = await readLog(dir)
      recent = log
        .slice(0, 5)
        .map(
          (e) =>
            `- ${e.date} · ${e.kind}${e.body ? ` — ${e.body.split('\n')[0].slice(0, 160)}` : ''}`
        )
    } catch {
      /* 앱 기록 없음 */
    }

    const cli = agentCliPath()
    const xita = cli ? `node ${shq(cli)}` : 'xita'
    const L = [`# XITA 작업 — ${name}`, `프로젝트 폴더: ${dir}`, '', '## 할 일', task, '']
    if (board.length) L.push('## 이 프로젝트의 다른 작업 (참고)', ...board, '')
    if (recent.length) L.push('## 최근 기록 (지난번 이어서)', ...recent, '')
    L.push(
      '## 끝나면',
      '무엇을 했고 다음에 무엇을 하면 되는지 한두 줄로 기록해 주세요. 다음 세션이 이걸 읽고 이어서 시작합니다.',
      `  ${xita} log ${id} --add "<한 일 · 다음 할 일>" --kind 작업`
    )
    if (change) L.push(`작업을 끝냈으면 보드 상태도 옮겨 주세요: ${xita} move ${change.id} review`)
    return { prompt: L.join('\n'), cwd: dir }
  }

  async agentLaunch(id: string, input: { change?: string; task?: string; agent?: string }) {
    const { prompt, cwd } = await this.agentBrief(id, input)
    if (!fs.existsSync(cwd)) throw new HttpError(400, `프로젝트 폴더가 없습니다: ${cwd}`)
    if (process.platform !== 'darwin')
      throw new HttpError(400, '터미널 열기는 macOS 에서만 됩니다 — 지시문 복사를 쓰세요')
    const bin = input.agent === 'codex' ? 'codex' : 'claude'
    const dir = path.join(workspaceRoot(), '.xita', 'agent')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${id}-${Date.now()}.md`)
    fs.writeFileSync(file, prompt, 'utf8')
    const shell = `cd ${shq(cwd)} && ${bin} "$(cat ${shq(file)})"`
    const as = shell.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    await pexec('osascript', [
      '-e',
      `tell application "Terminal" to do script "${as}"`,
      '-e',
      'tell application "Terminal" to activate',
    ])
    return { launched: true, agent: bin, cwd, file, prompt }
  }

  /** 등록된 앱 저장소 전체 git pull --ff-only → Play 트랙 버전 조회 (planner /api/sync). */
  async sync() {
    const docs = await this.projectDocs(false)
    const steps: Step[] = []
    for (const d of docs) {
      const dir = projectDir(d)
      const label = String(d.meta.codename ?? d.id)
      if (!fs.existsSync(dir)) {
        steps.push({
          cmd: ['echo', `── ${label}: 폴더 없음, 건너뜀`],
          cwd: portfolioRoot(),
          tolerant: true,
        })
        continue
      }
      if (!fs.existsSync(path.join(dir, '.git'))) {
        steps.push({
          cmd: ['echo', `── ${label}: git 저장소 아님, 건너뜀`],
          cwd: dir,
          tolerant: true,
        })
        continue
      }
      steps.push({ cmd: ['echo', `── ${label}`], cwd: dir, tolerant: true })
      // --ff-only: 로컬 커밋·충돌이 있으면 실패시킨다. 되돌리기 어려운 병합을 막는다.
      steps.push({ cmd: ['git', '-C', dir, 'pull', '--ff-only'], cwd: dir, tolerant: true })
    }
    const store = await this.storeSteps()
    steps.push(...store.steps)
    return startJob('전체 동기화', null, steps, { onSuccess: store.apply })
  }

  async storeRefresh() {
    const store = await this.storeSteps()
    return startJob('스토어 버전 조회', null, store.steps, { onSuccess: store.apply })
  }

  /** store-versions.py 의 마지막 줄 `XITA_RESULT {json}` 을 job 별로 받아 Product 에 반영 */
  private async storeSteps(): Promise<{ steps: Step[]; apply: () => Promise<void> }> {
    const docs = await this.projectDocs(false)
    const pairs: string[] = []
    for (const d of docs) {
      const facts = inspectProject(projectDir(d))
      if (facts.package) pairs.push(`${String(d.meta.codename ?? d.id)}=${facts.package}`)
    }
    let result: Record<string, Partial<Record<Track, number>>> | null = null
    /*
     * 변경 전 정책: 스토어 조회는 store_tracks 만 갱신 — 상태(production_status)는 이관 당시 README 문구 그대로.
     * 변경 후 정책: Play production 트랙에 릴리스가 있는데 상태가 라이브가 아니면 PRODUCTION 으로 올리고
     *   타임라인에 남긴다. 내리는 방향(라이브 → 개발 중)은 자동으로 하지 않는다.
     * 변경 이유: 실측(LingoLayer production 139)과 문서 상태("MVP · 미배포")가 어긋나 홈 지표가 틀렸다.
     * 영향 범위: 동기화/스토어 조회 후 Android 프로젝트의 production_status.
     */
    const apply = async () => {
      if (!result) return
      const now = new Date().toISOString()
      for (const d of await this.projectDocs(true)) {
        const tracks = result[String(d.meta.codename ?? d.id)]
        if (!tracks) continue
        const promote =
          typeof tracks.production === 'number' && d.meta.production_status !== 'PRODUCTION'
        await this.products.upsert(
          d.id,
          {
            ...d.meta,
            store_tracks: JSON.stringify(tracks),
            store_checked_at: now,
            ...(promote ? { production_status: 'PRODUCTION' } : {}),
          },
          d.body,
          (d.revision ?? 0) + 1
        )
        if (promote)
          await this.ops.recordEvent({
            eventType: 'PRODUCTION_DETECTED',
            product: d.id,
            title: `Play 프로덕션 트랙 확인 (versionCode ${tracks.production}) — 라이브로 표시`,
          })
      }
    }
    if (!pairs.length) return { steps: [], apply }
    const steps: Step[] = [
      {
        cmd: [python(), 'store-versions.py', ...pairs],
        cwd: toolsDir(),
        env: this.toolEnv(),
        tolerant: true,
        onLine: (line) => {
          if (!line.startsWith('XITA_RESULT ')) return true
          result = parseJson(line.slice('XITA_RESULT '.length), {})
          return false
        },
      },
    ]
    return { steps, apply }
  }

  // ---- 변경내역 (git log) --------------------------------------------------------

  async changelog(projectId?: string) {
    const docs = projectId ? [await this.requireProject(projectId)] : await this.projectDocs(false)
    const targets = docs.filter((d) => fs.existsSync(path.join(projectDir(d), '.git')))
    // 병렬 fetch (8개씩). 오프라인이어도 로컬 로그는 보여준다.
    for (let i = 0; i < targets.length; i += 8) {
      await Promise.all(
        targets
          .slice(i, i + 8)
          .map((d) =>
            pexec('git', ['-C', projectDir(d), 'fetch', '--quiet'], { timeout: 8000 }).catch(
              () => null
            )
          )
      )
    }
    const entries: Array<Record<string, string>> = []
    await Promise.all(
      targets.map(async (d) => {
        try {
          const { stdout } = await pexec(
            'git',
            [
              '-C',
              projectDir(d),
              'log',
              '-n40',
              '--pretty=format:%h%x1f%ad%x1f%an%x1f%s',
              '--date=format:%Y-%m-%d %H:%M',
            ],
            { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }
          )
          for (const line of stdout.split('\n')) {
            const parts = line.split('\x1f')
            if (parts.length !== 4) continue
            const [hash, when, author, title] = parts
            entries.push({
              project: d.id,
              app: String(d.meta.name ?? d.id),
              hash,
              when,
              date: when.split(' ')[0],
              author,
              title,
            })
          }
        } catch {
          // 저장소 읽기 실패는 건너뛴다
        }
      })
    )
    entries.sort((a, b) => (a.when < b.when ? 1 : -1))
    return { entries: entries.slice(0, 300) }
  }

  // ---- 설정 -----------------------------------------------------------------------

  settings() {
    return {
      root: portfolioRoot(),
      workspace: workspaceRoot(),
      portfolio: portfolioName(),
      secretsDir: secretsDir(),
      admobDir: admobDir(),
      toolsDir: toolsDir(),
      playKey: fs.existsSync(playKeyPath()),
      keystore: fs.existsSync(keystorePropsPath()),
      admobClient: fs.existsSync(admobClientPath()),
      admobToken: fs.existsSync(admobTokenPath()),
      tools: fs.existsSync(path.join(toolsDir(), 'deploy.py')),
      registryExport: registryExportPath(),
      mobile: mobileConnection(),
    }
  }

  job(id: string): Job {
    const j = getJob(id)
    if (!j) throw new HttpError(404, '작업을 찾을 수 없습니다')
    return j
  }
}
