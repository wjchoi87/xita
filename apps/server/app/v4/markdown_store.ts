import path from 'node:path'
import { parseDoc, serializeDoc, getStr, getNum } from '#v4/doc'
import { atomicWrite, readText, listFiles, ensureDir } from '#v4/fs_util'
import {
  docDir,
  docPath,
  loadWorkspaceMeta,
  bumpWorkspaceRevision,
  metaDir,
  ensureMetaDir,
  type DocType,
} from '#v4/workspace'
import EventBus from '#v4/event_bus'

/*
 * Canonical Markdown+YAML Store (v0.4 §18-S3/S4).
 * UI 가 parser 를 직접 호출하지 않도록 Store 경계를 둔다.
 * 공통 동작:
 *   - read(id) / list()
 *   - upsert(meta, body) : entity revision 증가 + workspace revision 증가 (atomic)
 *   - applyField(id, field, value) : 단일 필드 안전 갱신 (entity revision 증가)
 */

export interface StoredDoc {
  id: string
  type: DocType
  revision: number | null
  meta: Record<string, unknown>
  body: string
  path: string
}

export class MarkdownStore {
  constructor(private type: DocType) {}

  async read(id: string): Promise<StoredDoc | null> {
    const p = docPath(this.type, id)
    const raw = await readText(p)
    if (raw === null) return null
    const { meta, body } = parseDoc(raw)
    return {
      id,
      type: this.type,
      revision: getNum(meta, 'revision'),
      meta,
      body,
      path: p,
    }
  }

  async list(): Promise<StoredDoc[]> {
    await ensureDir(docDir(this.type))
    const files = await listFiles(docDir(this.type), '.md')
    const out: StoredDoc[] = []
    for (const f of files) {
      const raw = await readText(f)
      if (raw === null) continue
      const { meta, body } = parseDoc(raw)
      const id = getStr(meta, 'id') ?? path.basename(f, '.md')
      out.push({ id, type: this.type, revision: getNum(meta, 'revision'), meta, body, path: f })
    }
    return out.sort((a, b) => (a.id < b.id ? -1 : 1))
  }

  /**
   * Create 또는 Update. entity revision 을 1 증가시켜 canonical 저장.
   * 편의 파라미터: nextRevision 을 주면 해당 revision 강제(create 라이프사이클 등).
   *
   * 워크스페이스 리비전을 먼저 bump 한 뒤 그 값을 frontmatter `ws_rev` 에 각인한다 —
   * sync incremental pull 의 커서(전역)가 비교 대상이다 (문서별 revision 과 비교하면 유실).
   */
  async upsert(
    id: string,
    meta: Record<string, unknown>,
    body: string,
    nextRevision?: number
  ): Promise<{ doc: StoredDoc; revision: number; workspaceRevision: number }> {
    const existing = await this.read(id)
    const current = existing?.revision ?? 0
    const revision = nextRevision ?? current + 1
    const wr = await bumpWorkspaceRevision(1)
    /* 변경 전 정책: 시스템 필드를 먼저 쓰고 ...meta 를 뒤에 펼침 → 호출부가 {...existing.meta, …} 로 넘기면
     *   예전 revision·ws_rev·updated_at 이 새 값을 덮어씀 (전이·승인·우선순위·마일스톤 지정 등 모든 수정 경로).
     * 변경 후 정책: id·type·revision·ws_rev·updated_at 은 항상 이번 쓰기 값으로 각인 (applyField·Rust storage 와 동일 규칙).
     *   created_at 은 기존 값 유지(없으면 meta → 지금).
     * 변경 이유: 수정된 문서의 ws_rev 가 커서보다 작게 남아 모바일 incremental pull 에서 누락되고,
     *   revision 이 안 올라 충돌 판정·"최근 수정" 정렬이 틀어졌다.
     * 영향 범위: MarkdownStore.upsert 를 쓰는 모든 v4 문서 쓰기. 필드 순서는 동일. */
    const now = new Date().toISOString()
    const fullMeta = {
      id,
      type: this.type,
      revision,
      ws_rev: wr,
      updated_at: now,
      created_at: (existing?.meta.created_at as string | undefined) ?? meta.created_at ?? now,
      ...meta,
    }
    Object.assign(fullMeta, { id, type: this.type, revision, ws_rev: wr, updated_at: now })
    if (existing?.meta.created_at) fullMeta.created_at = existing.meta.created_at
    await atomicWrite(docPath(this.type, id), serializeDoc(fullMeta, body))

    // Realtime(SPEC §8): canonical mutation 을 SSE 구독자에게 브로드캐스트.
    EventBus.emit('xita.timeline', {
      event_type: existing ? 'DOC_UPDATED' : 'DOC_CREATED',
      doc_type: this.type,
      id,
      revision,
      name:
        ((fullMeta as Record<string, unknown>).name as string | undefined) ??
        ((fullMeta as Record<string, unknown>).title as string | undefined) ??
        id,
      status: ((fullMeta as Record<string, unknown>).status as string | undefined) ?? null,
      workspace_revision: wr,
    })

    return {
      doc: { id, type: this.type, revision, meta: fullMeta, body, path: docPath(this.type, id) },
      revision,
      workspaceRevision: wr,
    }
  }

  /**
   * 안전한 단일 필드 갱신 (v0.4 §12: clearly-safe / non-overlap 자동 적용).
   * entity revision 증가 + workspace revision 증가 + ws_rev 각인 + SSE 브로드캐스트
   * (sync push 경유 갱신도 Realtime 구독자에게 보이도록 — SPEC §8).
   */
  async applyField(id: string, field: string, value: unknown): Promise<StoredDoc | null> {
    const existing = await this.read(id)
    if (!existing) return null
    const nextRev = (existing.revision ?? 0) + 1
    const wr = await bumpWorkspaceRevision(1)
    const fullMeta = {
      ...existing.meta,
      [field]: value,
      revision: nextRev,
      ws_rev: wr,
      updated_at: new Date().toISOString(),
    }
    await atomicWrite(existing.path, serializeDoc(fullMeta, existing.body))
    EventBus.emit('xita.timeline', {
      event_type: 'DOC_UPDATED',
      doc_type: this.type,
      id,
      revision: nextRev,
      name:
        ((fullMeta as Record<string, unknown>).name as string | undefined) ??
        ((fullMeta as Record<string, unknown>).title as string | undefined) ??
        id,
      status: ((fullMeta as Record<string, unknown>).status as string | undefined) ?? null,
      workspace_revision: wr,
    })
    return { ...existing, revision: nextRev, meta: fullMeta }
  }

  async remove(id: string): Promise<boolean> {
    const existing = await this.read(id)
    if (!existing) return false
    const fs = await import('node:fs/promises')
    await fs.rm(existing.path, { force: true })
    await bumpWorkspaceRevision(1)
    return true
  }
}

/** Derived index 작성 (v0.4 §5). 삭제해도 list() 로 rebuild 가능한 캐시. */
export async function writeDerivedIndex(index: {
  workspace_revision: number
  docs: Array<{ id: string; type: string; revision: number | null }>
}) {
  await ensureMetaDir()
  await atomicWrite(path.join(metaDir(), 'index.json'), JSON.stringify(index, null, 2))
}

export async function rebuildDerivedIndex(): Promise<{
  workspace_revision: number
  docs: Array<{ id: string; type: string; revision: number | null }>
}> {
  const types: DocType[] = [
    'product',
    'change',
    'decision',
    'artifact',
    'workbench',
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
  const docs: Array<{ id: string; type: string; revision: number | null }> = []
  for (const t of types) {
    const store = new MarkdownStore(t)
    const all = await store.list()
    for (const d of all) docs.push({ id: d.id, type: d.type, revision: d.revision })
  }
  const meta = await loadWorkspaceMeta()
  const index = { workspace_revision: meta.workspace_revision, docs }
  await writeDerivedIndex(index)
  return index
}
