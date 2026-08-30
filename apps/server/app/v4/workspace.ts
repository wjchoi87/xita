import fs from 'node:fs'
import path from 'node:path'
import app from '@adonisjs/core/services/app'
import { atomicWrite, readText, ensureDir } from '#v4/fs_util'

/*
 * Workspace & Revision Authority (v0.4 §5, §11).
 *
 * Canonical Markdown workspace root 의 .xita/ 에 저장되는 derived metadata.
 * - workspace_revision : sync cursor (incremental pull 용)
 * - index.json         : derived index (rebuild 가능, canonical 아님)
 *
 * workspace_revision 은 모든 canonical mutation 시 증가한다. read-modify-write
 * 를 짧은 재시도로 수행해 동시 mutation 을 최소 보호한다 (Canonical writer 는
 * 원칙적으로 하나, v0.4 §12).
 */

export type DocType =
  | 'product'
  | 'change'
  | 'decision'
  | 'artifact'
  | 'workbench'
  | 'release'
  | 'capability'
  | 'readiness'
  | 'proposal'
  | 'review'
  | 'reference'
  | 'dispatch'
  | 'patch'
  | 'milestone'
  | 'insight'

const DIRS: Record<DocType, string> = {
  product: 'products',
  change: 'changes',
  decision: 'decisions',
  artifact: 'artifacts',
  workbench: 'workbench',
  release: 'releases',
  capability: 'capabilities',
  readiness: 'readiness',
  proposal: 'proposals',
  review: 'reviews',
  reference: 'references',
  dispatch: 'dispatches',
  patch: 'patches',
  milestone: 'milestones',
  insight: 'insights',
}

export interface WorkspaceMeta {
  workspace_revision: number
  last_updated: string | null
}

export function workspaceRoot(): string {
  const configured = process.env.XITA_WORKSPACE
  if (configured) return configured
  // 기본: server 루트의 .xita-workspace (실제 macOS 앱은 사용자 폴더로 교체)
  return path.join(app.makePath(), '.xita-workspace')
}

export function metaDir(): string {
  return path.join(workspaceRoot(), '.xita')
}

export function docDir(type: DocType): string {
  return path.join(workspaceRoot(), DIRS[type])
}

export function docPath(type: DocType, id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, '-')
  return path.join(docDir(type), `${safe}.md`)
}

export async function loadWorkspaceMeta(): Promise<WorkspaceMeta> {
  const raw = await readText(path.join(metaDir(), 'workspace.json'))
  if (!raw) return { workspace_revision: 0, last_updated: null }
  try {
    return JSON.parse(raw) as WorkspaceMeta
  } catch {
    return { workspace_revision: 0, last_updated: null }
  }
}

/** Canonical mutation 시 호출. workspace_revision 을 1 증가시켜 원자 저장. */
export async function bumpWorkspaceRevision(by = 1): Promise<number> {
  const metaFile = path.join(metaDir(), 'workspace.json')
  await ensureDir(metaDir())
  for (let attempt = 0; attempt < 5; attempt++) {
    const meta = await loadWorkspaceMeta()
    const next = meta.workspace_revision + by
    const payload: WorkspaceMeta = {
      workspace_revision: next,
      last_updated: new Date().toISOString(),
    }
    await atomicWrite(metaFile, JSON.stringify(payload, null, 2))
    // 재확인 후 재시도 (경합 최소화)
    const check = await loadWorkspaceMeta()
    if (check.workspace_revision === next) return next
    await new Promise((r) => setTimeout(r, 5))
  }
  const meta = await loadWorkspaceMeta()
  return meta.workspace_revision + 1
}

/** Derived index — 삭제해도 스캔으로 rebuild 가능 (v0.4 §5). 캐시일 뿐 canonical 아님. */
export async function ensureMetaDir() {
  await ensureDir(metaDir())
}

export function fsExists(p: string) {
  return fs.existsSync(p)
}
