import path from 'node:path'
import { MarkdownStore, rebuildDerivedIndex } from '#v4/markdown_store'
import { RevisionEngine, type Operation, type OperationResult, safeFields } from '#v4/revision'
import { loadWorkspaceMeta, metaDir, type DocType } from '#v4/workspace'
import { readText, atomicWrite, ensureDir } from '#v4/fs_util'

/*
 * SyncService (v0.4 §13). Mac/PC host 가 canonical authority 이다.
 *  - pull(cursor)      : workspace revision 이후 도큐먼트를 반환 (incremental)
 *  - push(ops)         : operation 을 RevisionEngine 로 검증·적용, idempotent(op_id ledger)
 *  - status()          : workspace_revision, index
 *
 * Mobile 은 이 endpoint 로 canonical state 를 당기고(Pull) mutation 을 보낸다(Push).
 * op ledger 는 canonical workspace 의 .xita/ops.jsonl 로, 같은 op 재전송을 중복 적용
 * 하지 않는다 (v0.4 §18-S6).
 */

const EDITABLE_TYPES: DocType[] = [
  'product',
  'change',
  'artifact',
  'workbench',
  'decision',
  'release',
  'capability',
  'readiness',
  'proposal',
  'review',
  'reference',
  'dispatch',
  'patch',
  'milestone',
  'insight',
]

export class SyncService {
  private stores: Record<DocType, MarkdownStore>
  engine: RevisionEngine

  constructor() {
    const s = {} as Record<DocType, MarkdownStore>
    for (const t of EDITABLE_TYPES) s[t] = new MarkdownStore(t)
    this.stores = s
    this.engine = new RevisionEngine(s)
  }

  async pull(cursor?: number): Promise<{
    workspace_revision: number
    docs: Array<{
      id: string
      type: string
      revision: number | null
      meta: Record<string, unknown>
      body: string
    }>
  }> {
    const meta = await loadWorkspaceMeta()
    const docs: Array<{
      id: string
      type: string
      revision: number | null
      meta: Record<string, unknown>
      body: string
    }> = []
    for (const t of EDITABLE_TYPES) {
      const all = await this.stores[t].list()
      // incremental pull: revision > cursor 만
      for (const d of all) {
        if (typeof cursor === 'number' && (d.revision ?? 0) <= cursor) continue
        docs.push({ id: d.id, type: d.type, revision: d.revision, meta: d.meta, body: d.body })
      }
    }
    return { workspace_revision: meta.workspace_revision, docs }
  }

  async push(ops: Operation[]): Promise<{
    results: OperationResult[]
    conflicts: Array<Operation & { canonicalRevision: number }>
    workspace_revision: number
  }> {
    const results: OperationResult[] = []
    const conflicts: Array<Operation & { canonicalRevision: number }> = []
    for (const op of ops) {
      if (await this.seen(op.op_id)) {
        results.push({ status: 'APPLIED', entityRevision: 0, workspaceRevision: 0 })
        continue
      }
      const res = await this.engine.applyOperation(op)
      if (res.status === 'APPLIED') {
        await this.recordOp(op)
      } else {
        conflicts.push({ ...op, canonicalRevision: res.canonicalRevision })
        await this.recordConflict({
          ...op,
          canonicalRevision: res.canonicalRevision,
          status: 'needs_you',
        })
      }
      results.push(res)
    }
    const meta = await loadWorkspaceMeta()
    return { results, conflicts, workspace_revision: meta.workspace_revision }
  }

  async status() {
    const meta = await loadWorkspaceMeta()
    const index = await rebuildDerivedIndex()
    return { workspace_revision: meta.workspace_revision, last_updated: meta.last_updated, index }
  }

  async conflicts(): Promise<Array<Record<string, unknown>>> {
    const raw = await readText(path.join(metaDir(), 'conflicts.jsonl'))
    if (!raw) return []
    return raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>
        } catch {
          return null
        }
      })
      .filter(Boolean) as Array<Record<string, unknown>>
  }

  async clearConflict(opId: string) {
    const raw = (await readText(path.join(metaDir(), 'conflicts.jsonl'))) ?? ''
    const remaining = raw
      .split('\n')
      .filter((l) => l.trim() && !l.includes(`"op_id":"${opId}"`))
      .join('\n')
    await ensureDir(metaDir())
    await atomicWrite(path.join(metaDir(), 'conflicts.jsonl'), remaining)
  }

  private async seen(opId: string): Promise<boolean> {
    const raw = await readText(path.join(metaDir(), 'ops.jsonl'))
    if (!raw) return false
    return raw.split('\n').some((l) => l.includes(`"op_id":"${opId}"`))
  }

  private async recordOp(op: Operation) {
    const file = path.join(metaDir(), 'ops.jsonl')
    await ensureDir(metaDir())
    const fs = await import('node:fs/promises')
    await fs.appendFile(
      file,
      `${JSON.stringify({ op_id: op.op_id, ts: new Date().toISOString() })}\n`,
      'utf8'
    )
  }

  private async recordConflict(conflict: Record<string, unknown>) {
    const file = path.join(metaDir(), 'conflicts.jsonl')
    await ensureDir(metaDir())
    const existing = await this.conflicts()
    // 같은 op_id 는 중복 기록하지 않는다
    if (existing.some((c) => c.op_id === conflict.op_id)) return
    const fs = await import('node:fs/promises')
    await fs.appendFile(file, `${JSON.stringify(conflict)}\n`, 'utf8')
  }

  // ---- Offline Pending Operation Queue (v0.4 §9-§10) ---------------------
  // PC offline 일 때 Mobile 이 op 를 로컬 큐에 쌓고, 복귀 시 reconcile 로 재생한다.

  /** 로컬 큐에 op 저만 쌓고 적용하지는 않는다 (offline). */
  async defer(ops: Operation[]): Promise<{ queued: number }> {
    const file = path.join(metaDir(), 'pending_ops.jsonl')
    await ensureDir(metaDir())
    const fs = await import('node:fs/promises')
    let queued = 0
    for (const op of ops) {
      if (await this.seen(op.op_id)) continue
      await fs.appendFile(file, `${JSON.stringify(op)}\n`, 'utf8')
      queued++
    }
    return { queued }
  }

  /** offline 으로 쌓은 op 를 canonical 에 적용(replay, idempotent). PC 복귀 시 호출. */
  async reconcile(): Promise<{
    applied: number
    conflicts: OperationResult[]
    workspace_revision: number
  }> {
    const file = path.join(metaDir(), 'pending_ops.jsonl')
    const raw = await readText(file)
    if (!raw) {
      const meta = await loadWorkspaceMeta()
      return {
        applied: 0,
        conflicts: [],
        workspace_revision: meta.workspace_revision,
      }
    }
    const ops: Operation[] = raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as Operation
        } catch {
          return null
        }
      })
      .filter(Boolean) as Operation[]
    let applied = 0
    const conflicts: OperationResult[] = []
    for (const op of ops) {
      if (await this.seen(op.op_id)) {
        applied++
        continue
      }
      const res = await this.engine.applyOperation(op)
      if (res.status === 'APPLIED') {
        await this.recordOp(op)
        applied++
      } else {
        conflicts.push(res)
        await this.recordConflict({
          ...op,
          canonicalRevision: res.canonicalRevision,
          status: 'needs_you',
        })
      }
    }
    // 재생 성공/실패 후 큐 초기화 (실패분은 conflicts 로 이동). 성공분은 op ledger 로.
    await ensureDir(metaDir())
    await atomicWrite(file, '')
    const meta = await loadWorkspaceMeta()
    return { applied, conflicts, workspace_revision: meta.workspace_revision }
  }

  async pendingCount(): Promise<number> {
    const raw = await readText(path.join(metaDir(), 'pending_ops.jsonl'))
    return raw ? raw.split('\n').filter((l) => l.trim()).length : 0
  }
}

export { safeFields }
