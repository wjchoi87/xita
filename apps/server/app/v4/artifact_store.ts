import path from 'node:path'
import { MarkdownStore, type StoredDoc } from '#v4/markdown_store'
import { atomicWrite, ensureDir, readText, listFiles } from '#v4/fs_util'
import { docDir, bumpWorkspaceRevision } from '#v4/workspace'
import { parseDoc, serializeDoc, getNum } from '#v4/doc'

/*
 * Canonical Artifact + Revision store (v0.4 §18-S4, v0.3 §29-30 유지).
 *
 * Living Artifact 를 canonical Markdown 로 관리한다:
 *   artifacts/<id>.md            ← 현재 Revision 내용(meta.current_revision)
 *   artifacts/.revs/<id>-v<N>.md ← immutable Revision 블롭 (frontmatter + body)
 *
 * Artifact 는 지속 객체, Revision 은 immutable snapshot. current_revision 만 갱신.
 */

const REV_DIR = '.revs'
type RevDoc = Omit<StoredDoc, 'type'> & { revisionNumber: number }

export class ArtifactStore {
  private artifacts: MarkdownStore

  constructor() {
    this.artifacts = new MarkdownStore('artifact')
  }

  async create(input: {
    id: string
    name: string
    product?: string | null
    content?: string | null
    summary?: string | null
    /** 출처·분류 등 부가 frontmatter (예: planner 이관 portfolio/kind/source) */
    extraMeta?: Record<string, unknown>
  }) {
    if (await this.artifacts.read(input.id)) throw new Error(`Artifact already exists: ${input.id}`)
    const meta: Record<string, unknown> = {
      id: input.id,
      type: 'artifact',
      name: input.name,
      product: input.product ?? null,
      status: 'DRAFT',
      current_revision: 1,
      ...input.extraMeta,
    }
    const body = input.content ?? `# ${input.name}`
    const res = await this.artifacts.upsert(input.id, meta, body, 1)
    await this.writeRevision(
      input.id,
      1,
      { name: input.name, summary: input.summary ?? 'initial' },
      body
    )
    const wr = await bumpWorkspaceRevision(0)
    return { doc: res.doc, revision: 1, workspaceRevision: wr }
  }

  async addRevision(
    id: string,
    input: {
      content: string
      summary?: string | null
      changeSummary?: string | null
      extraMeta?: Record<string, unknown>
    }
  ) {
    const existing = await this.artifacts.read(id)
    if (!existing) throw new Error(`Artifact not found: ${id}`)
    const nextRev = (getNum(existing.meta, 'current_revision') ?? existing.revision ?? 0) + 1
    const meta: Record<string, unknown> = {
      ...existing.meta,
      current_revision: nextRev,
      status: existing.meta.status === 'DRAFT' ? 'ACTIVE' : existing.meta.status,
      updated_at: new Date().toISOString(),
      ...input.extraMeta,
    }
    // revision 자체 증가는 upsert 가 처리. body 는 새 컨텐츠.
    const res = await this.artifacts.upsert(id, meta, input.content, (existing.revision ?? 0) + 1)
    await this.writeRevision(
      id,
      nextRev,
      { summary: input.summary, changeSummary: input.changeSummary ?? null },
      input.content
    )
    const wr = await bumpWorkspaceRevision(0)
    return { doc: res.doc, revision: nextRev, workspaceRevision: wr }
  }

  async get(id: string) {
    const doc = await this.artifacts.read(id)
    if (!doc) throw new Error(`Artifact not found: ${id}`)
    const revisions = await this.listRevisions(id)
    return { artifact: doc, revisions }
  }

  async listRevisions(id: string): Promise<RevDoc[]> {
    const dir = path.join(docDir('artifact'), REV_DIR)
    const files = await listFiles(dir, '.md')
    const out: RevDoc[] = []
    for (const f of files) {
      if (!f.includes(`/${id}-v`)) continue
      const raw = await readText(f)
      if (!raw) continue
      const { meta, body } = parseDoc(raw)
      out.push({
        id,
        revision: getNum(meta, 'revision'),
        revisionNumber: getNum(meta, 'rev') ?? 0,
        meta,
        body,
        path: f,
      })
    }
    return out.sort((a, b) => a.revisionNumber - b.revisionNumber)
  }

  private async writeRevision(
    id: string,
    rev: number,
    extra: Record<string, unknown>,
    body: string
  ) {
    await ensureDir(path.join(docDir('artifact'), REV_DIR))
    const meta: Record<string, unknown> = {
      id,
      type: 'artifact_revision',
      revision: rev,
      rev,
      artifact: id,
      ...extra,
      created_at: new Date().toISOString(),
    }
    await atomicWrite(this.revPath(id, rev), serializeDoc(meta, body))
  }

  private revPath(id: string, rev: number) {
    return path.join(docDir('artifact'), REV_DIR, `${id}-v${rev}.md`)
  }
}

/*
 * Canonical Decision / Release — 추세로 복잡하지 않게 Range Store 로 충분.
 */

export async function createDecision(input: {
  id: string
  product?: string | null
  title: string
  decision: string | null
  reason?: string | null
  options?: string[]
  status?: string
}) {
  const store = new MarkdownStore('decision')
  const meta: Record<string, unknown> = {
    id: input.id,
    type: 'decision',
    product: input.product ?? null,
    title: input.title,
    decision: input.decision,
    reason: input.reason ?? null,
    options: input.options?.length ? JSON.stringify(input.options) : null,
    status: input.status ?? 'ACTIVE',
  }
  const res = await store.upsert(
    input.id,
    meta,
    `# ${input.title}\n\n${input.decision ?? ''}\n\n## 배경\n${input.reason ?? ''}`,
    1
  )
  return res.doc
}

export async function createRelease(input: {
  id: string
  product: string
  name: string
  status?: string
  notes?: string | null
}) {
  const store = new MarkdownStore('release')
  const meta: Record<string, unknown> = {
    id: input.id,
    type: 'release',
    product: input.product,
    name: input.name,
    status: input.status ?? 'PLANNED',
    notes: input.notes ?? null,
  }
  const res = await store.upsert(input.id, meta, `# ${input.name}\n\n${input.notes ?? ''}`, 1)
  return res.doc
}

export type { RevDoc }
