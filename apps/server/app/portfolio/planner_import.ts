import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { MarkdownStore } from '#v4/markdown_store'
import { ArtifactStore } from '#v4/artifact_store'
import { V4Ops } from '#v4/ops'
import { atomicWrite, readText } from '#v4/fs_util'
import { metaDir, workspaceRoot } from '#v4/workspace'
import { portfolioName, portfolioRoot } from '#portfolio/config'
import { readLog, stampToDate } from '#portfolio/app_log'
import { PortfolioService, isProject, projectIdFor } from '#portfolio/service'

const pexec = promisify(execFile)

/*
 * planner → XITA 흡수 (docs/PORTFOLIO.md §1, §6). "planner 에 기록된 것은 하나도 잃지 않는다."
 *
 * 1) 원문 보관: planner 의 모든 파일(비밀·node_modules·.git·캐시 제외)을
 *    <workspace>/archive/planner/<stamp>/ 에 그대로 복사 + sha256 manifest. 내용이 같으면 새로 만들지 않음.
 *    git HEAD·미커밋 상태도 _git.txt 로 남긴다.
 * 2) 구조화: projects.json → Product(포트폴리오 필드), README/백로그 표의 상태·수익모델,
 *    store-cache.json → store_tracks, docs/specs/ideas/README → Living Artifact(리비전 보존),
 *    각 앱 docs/app-log.md → 제품 타임라인(원래 시각).
 * 재실행 안전: 같은 내용은 건너뛰고, 바뀐 문서는 새 리비전으로 쌓는다(덮어쓰기 없음).
 */

// 비밀/재생성 가능 산출물은 복사하지 않는다 (경로만 리포트).
const SECRET_NAMES = new Set([
  'play-account.json',
  'keystore.properties',
  'service-account.json',
  'admob-client.json',
  'admob-token.json',
])
const SECRET_EXT = ['.jks', '.keystore', '.p12', '.pem', '.key']
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.gradle', 'build', '.venv'])
const SKIP_FILES = new Set(['.DS_Store'])

export interface ImportReport {
  from: string
  workspace: string
  dryRun: boolean
  archive: {
    dir: string | null
    reused: boolean
    files: number
    bytes: number
    excludedSecrets: string[]
    skipped: string[]
  }
  projects: Array<{ id: string; codename: string; action: 'created' | 'updated' | 'unchanged' }>
  artifacts: Array<{
    id: string
    source: string
    product: string | null
    action: 'created' | 'revised' | 'unchanged'
  }>
  logs: { imported: number; skipped: number }
  warnings: string[]
}

interface PlannerProject {
  codename: string
  label?: string
  desc?: string
  path?: string
  cmds?: Array<{ name: string; cmd: string }>
}

function sha256(buf: Buffer | string) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function isSecret(name: string) {
  return (
    SECRET_NAMES.has(name) || SECRET_EXT.some((e) => name.endsWith(e)) || name.startsWith('.env')
  )
}

async function walk(
  root: string,
  rel = '',
  out: { files: string[]; secrets: string[]; skipped: string[] } = {
    files: [],
    secrets: [],
    skipped: [],
  }
) {
  const entries = await fsp.readdir(path.join(root, rel), { withFileTypes: true })
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name === 'secrets') {
        out.skipped.push(`${r}/`)
        continue
      }
      await walk(root, r, out)
    } else if (e.isFile()) {
      if (SKIP_FILES.has(e.name)) continue
      if (isSecret(e.name)) out.secrets.push(r)
      else out.files.push(r)
    }
  }
  return out
}

/** README/백로그 표에서 `codename` 행의 마지막 칸(상태)을 찾는다 */
export function tableStatuses(markdown: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of markdown.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim())
    if (cells.length < 3) continue
    const code = cells.map((c) => c.match(/^`([^`]+)`$/)?.[1]).find(Boolean)
    if (!code || out.has(code.toLowerCase())) continue
    out.set(code.toLowerCase(), cells[cells.length - 1].replace(/\*\*/g, ''))
  }
  return out
}

/** "프로덕션 live · 무료+광고 · 실기기 검증 필요" → 상태/수익모델/메모 */
export function parseStatus(raw: string | undefined) {
  if (!raw) return { production_status: 'DEVELOPMENT', monetization: null, status_note: null }
  const parts = raw
    .split('·')
    .map((p) => p.trim())
    .filter(Boolean)
  const live = /live|공개|출시/i.test(raw) && !/미배포/.test(raw)
  const money = parts.find((p) => /무료|유료|광고|인앱|₩|Pro/.test(p) && !/live/i.test(p)) ?? null
  const notes = parts.filter((p) => p !== money && !/^(Android )?프로덕션 live$/i.test(p))
  return {
    production_status: live ? 'PRODUCTION' : 'DEVELOPMENT',
    monetization: money,
    status_note: notes.length ? notes.join(' · ') : null,
  }
}

const DOC_KIND: Record<string, string> = {
  'progress': 'worklog',
  'app-backlog': 'backlog',
  'todo-owner': 'owner-todo',
  'new-app-playbook': 'playbook',
  'deploy-setup': 'runbook',
  'design-system': 'design-system',
  'localization': 'policy',
  'ad-strategy': 'policy',
  'ad-ids': 'runbook',
  'pipeline': 'policy',
  'store-categories': 'reference',
}

function titleOf(md: string, fallback: string) {
  return md.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback
}

export async function importPlanner(opts: { from?: string; dryRun?: boolean } = {}) {
  const from = path.resolve(opts.from ?? path.join(portfolioRoot(), 'planner'))
  const dryRun = !!opts.dryRun
  const report: ImportReport = {
    from,
    workspace: workspaceRoot(),
    dryRun,
    archive: { dir: null, reused: false, files: 0, bytes: 0, excludedSecrets: [], skipped: [] },
    projects: [],
    artifacts: [],
    logs: { imported: 0, skipped: 0 },
    warnings: [],
  }
  const registryRaw = await readText(path.join(from, 'projects.json'))
  if (registryRaw === null)
    throw new Error(`planner 를 찾을 수 없습니다 (projects.json 없음): ${from}`)

  // ---- 1) 원문 보관 ----------------------------------------------------------------
  const tree = await walk(from)
  tree.files.sort()
  report.archive.excludedSecrets = tree.secrets
  report.archive.skipped = tree.skipped
  const manifest: Array<{ path: string; size: number; sha256: string }> = []
  for (const rel of tree.files) {
    const buf = await fsp.readFile(path.join(from, rel))
    manifest.push({ path: rel, size: buf.length, sha256: sha256(buf) })
  }
  report.archive.files = manifest.length
  report.archive.bytes = manifest.reduce((n, f) => n + f.size, 0)
  const fingerprint = sha256(manifest.map((f) => `${f.path}:${f.sha256}`).join('\n'))
  const archiveRoot = path.join(workspaceRoot(), 'archive', 'planner')
  const previous = fs.existsSync(archiveRoot) ? await fsp.readdir(archiveRoot) : []
  previous.sort()
  for (const dir of previous.reverse()) {
    const m = await readText(path.join(archiveRoot, dir, 'manifest.json'))
    if (m && JSON.parse(m).fingerprint === fingerprint) {
      report.archive.dir = path.join(archiveRoot, dir)
      report.archive.reused = true
      break
    }
  }
  if (!report.archive.reused) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    report.archive.dir = path.join(archiveRoot, stamp)
    if (!dryRun) {
      for (const f of manifest) {
        const dest = path.join(report.archive.dir, 'files', f.path)
        await fsp.mkdir(path.dirname(dest), { recursive: true })
        await fsp.copyFile(path.join(from, f.path), dest)
      }
      let gitInfo = ''
      try {
        const head = await pexec('git', ['-C', from, 'log', '-1', '--format=%H %ad %s'])
        const status = await pexec('git', ['-C', from, 'status', '--porcelain'])
        const remote = await pexec('git', ['-C', from, 'remote', '-v']).catch(() => ({
          stdout: '',
        }))
        gitInfo = `HEAD ${head.stdout.trim()}\n\n# status --porcelain (미커밋 변경)\n${status.stdout}\n# remote\n${remote.stdout}`
      } catch {
        gitInfo = 'git 정보 없음'
      }
      await atomicWrite(path.join(report.archive.dir, '_git.txt'), gitInfo)
      await atomicWrite(
        path.join(report.archive.dir, 'manifest.json'),
        JSON.stringify(
          {
            source: from,
            importedAt: new Date().toISOString(),
            fingerprint,
            files: manifest,
            excludedSecrets: tree.secrets,
            skippedDirs: tree.skipped,
          },
          null,
          2
        )
      )
    }
  }

  // ---- 2) 프로젝트 → Product ---------------------------------------------------------
  const svc = new PortfolioService()
  const products = new MarkdownStore('product')
  const ops = new V4Ops()
  let registry: PlannerProject[] = []
  try {
    registry = (JSON.parse(registryRaw).projects ?? []).filter((p: PlannerProject) => p.codename)
  } catch {
    report.warnings.push('projects.json 파싱 실패 — 프로젝트 이관을 건너뜀')
  }
  const statuses = tableStatuses((await readText(path.join(from, 'README.md'))) ?? '')
  for (const [k, v] of tableStatuses(
    (await readText(path.join(from, 'docs/app-backlog.md'))) ?? ''
  ))
    if (!statuses.has(k)) statuses.set(k, v)
  const storeCache = JSON.parse(
    (await readText(path.join(from, 'dashboard', 'store-cache.json'))) ?? '{}'
  ) as Record<string, Record<string, number>>
  const plannerRoot = path.dirname(from)
  const idByCodename = new Map<string, string>()

  for (const p of registry) {
    let id = projectIdFor(p.codename)
    const existing0 = await products.read(id)
    // 같은 id 의 다른(포트폴리오 아님) 제품이 있으면 덮지 않고 접미사로 분리
    if (existing0 && !isProject(existing0)) id = `${id}-app`
    idByCodename.set(p.codename.toLowerCase(), id)
    const dir = p.path ? path.resolve(p.path) : path.join(plannerRoot, p.codename)
    const st = parseStatus(statuses.get(p.codename.toLowerCase()))
    const tracks = storeCache[p.codename]
    const fields: Record<string, unknown> = {
      name: p.label || p.codename,
      codename: p.codename,
      portfolio: portfolioName(),
      repo_path: dir,
      summary: p.desc ?? null,
      production_status: st.production_status,
      monetization: st.monetization,
      status_note: st.status_note,
      planner_status: statuses.get(p.codename.toLowerCase()) ?? null,
      ...(p.cmds?.length ? { cmds: JSON.stringify(p.cmds) } : {}),
      ...(tracks ? { store_tracks: JSON.stringify(tracks) } : {}),
    }
    const existing = await products.read(id)
    if (!existing) {
      report.projects.push({ id, codename: p.codename, action: 'created' })
      if (dryRun) continue
      const body = [
        `# ${fields.name}`,
        '',
        '## 설명',
        '',
        p.desc || '-',
        '',
        '## planner 기록',
        '',
        `- 코드네임: \`${p.codename}\``,
        `- 저장소: \`${dir}\``,
        `- 상태(이관 시점): ${fields.planner_status ?? '-'}`,
        '',
      ].join('\n')
      await products.upsert(
        id,
        {
          id,
          type: 'product',
          status: 'production',
          version: null,
          current_goal: null,
          direction: null,
          archived: false,
          imported_from: 'planner',
          ...fields,
        },
        body,
        1
      )
      await ops.recordEvent({
        eventType: 'PROJECT_IMPORTED',
        product: id,
        title: 'planner 에서 포트폴리오로 이관',
        summary: dir,
      })
      continue
    }
    // 재이관: planner 쪽 값으로 비어 있는 칸만 채우고, 레지스트리 필드(경로·코드네임)는 최신화
    const merged: Record<string, unknown> = { ...existing.meta }
    let changed = false
    for (const [k, v] of Object.entries(fields)) {
      if (v === null || v === undefined) continue
      const always = ['codename', 'repo_path', 'portfolio', 'planner_status'].includes(k)
      const empty = merged[k] === null || merged[k] === undefined || merged[k] === ''
      if ((always || empty) && merged[k] !== v) {
        merged[k] = v
        changed = true
      }
    }
    report.projects.push({ id, codename: p.codename, action: changed ? 'updated' : 'unchanged' })
    if (changed && !dryRun)
      await products.upsert(id, merged, existing.body, (existing.revision ?? 0) + 1)
  }

  // ---- 3) 문서 → Living Artifact -----------------------------------------------------
  const artifacts = new ArtifactStore()
  const docSources: Array<{ rel: string; id: string; kind: string; product: string | null }> = []
  if (fs.existsSync(path.join(from, 'README.md')))
    docSources.push({ rel: 'README.md', id: 'planner-readme', kind: 'overview', product: null })
  for (const dirName of ['docs', 'specs', 'ideas']) {
    const d = path.join(from, dirName)
    if (!fs.existsSync(d)) continue
    const mdFiles = await fsp.readdir(d)
    for (const f of mdFiles.filter((n) => n.endsWith('.md')).sort()) {
      const base = f.replace(/\.md$/, '')
      if (dirName === 'docs') {
        const kind = DOC_KIND[base] ?? (base.startsWith('growth-review') ? 'review' : 'doc')
        docSources.push({
          rel: `docs/${f}`,
          id: `planner-doc-${projectIdFor(base)}`,
          kind,
          product: null,
        })
      } else if (dirName === 'specs') {
        const code = base.replace(/^\d+-/, '')
        docSources.push({
          rel: `specs/${f}`,
          id: `planner-spec-${projectIdFor(code)}`,
          kind: 'spec',
          product: idByCodename.get(code.toLowerCase()) ?? null,
        })
      } else {
        docSources.push({
          rel: `ideas/${f}`,
          id: `planner-idea-${projectIdFor(base)}`,
          kind: 'ideas',
          product: null,
        })
      }
    }
  }
  for (const s of docSources) {
    const content = (await readText(path.join(from, s.rel))) ?? ''
    const hash = sha256(content)
    const extraMeta = {
      portfolio: portfolioName(),
      kind: s.kind,
      source: `planner/${s.rel}`,
      source_sha256: hash,
      imported_from: 'planner',
      status: 'ACTIVE',
    }
    const existing = await artifacts.get(s.id).catch(() => null)
    if (!existing) {
      report.artifacts.push({ id: s.id, source: s.rel, product: s.product, action: 'created' })
      if (!dryRun)
        await artifacts.create({
          id: s.id,
          name: titleOf(content, s.rel),
          product: s.product,
          content,
          summary: `planner/${s.rel} 이관`,
          extraMeta,
        })
    } else if (existing.artifact.meta.source_sha256 !== hash) {
      report.artifacts.push({ id: s.id, source: s.rel, product: s.product, action: 'revised' })
      if (!dryRun)
        await artifacts.addRevision(s.id, {
          content,
          summary: `planner/${s.rel} 재이관 (원본 변경)`,
          extraMeta: { source_sha256: hash },
        })
    } else {
      report.artifacts.push({ id: s.id, source: s.rel, product: s.product, action: 'unchanged' })
    }
  }

  // ---- 4) 앱 기록(app-log.md) → 제품 타임라인 ----------------------------------------------
  const statePath = path.join(metaDir(), 'imports', 'planner-applog.json')
  const seen = new Set<string>(JSON.parse((await readText(statePath)) ?? '[]'))
  for (const p of registry) {
    const id = idByCodename.get(p.codename.toLowerCase())!
    const dir = p.path ? path.resolve(p.path) : path.join(plannerRoot, p.codename)
    const logEntries = await readLog(dir)
    for (const e of logEntries.reverse()) {
      const key = `${id}:${e.id}`
      if (seen.has(key)) {
        report.logs.skipped++
        continue
      }
      report.logs.imported++
      seen.add(key)
      if (dryRun) continue
      await ops.recordEvent({
        eventType: 'APP_LOG',
        product: id,
        title: `${e.kind}${e.body ? ` — ${e.body.split('\n')[0].slice(0, 80)}` : ''}`,
        summary: e.body || null,
        ts: stampToDate(e.date).toISOString(),
      })
    }
  }
  if (!dryRun) {
    await atomicWrite(statePath, JSON.stringify([...seen], null, 2))
    await svc.exportRegistry()
  }
  return report
}
