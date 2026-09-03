import { MarkdownStore, type StoredDoc } from '#v4/markdown_store'
import { loadWorkspaceMeta, type DocType } from '#v4/workspace'
import { readText } from '#v4/fs_util'
import path from 'node:path'
import { metaDir } from '#v4/workspace'
import slash from '#utils/slug'
import { classifyCapture } from '#v4/ai'

/*
 * v0.4 Canonical Domain Operations (v0.4 §6-§9, §18-S3~S6).
 * UI 는 이 레이어를 통해서만 canonical Markdown workspace 를 변경한다.
 * (직접 Markdown 편집은 Escape hatch, §4). 모든 mutation 은 entity/workspace
 * revision 을 올린다. Legacy(PostgreSQL) 경로와 별개로 Domian logic 을 보존.
 */

// Change lifecycle (v0.4 예의 status 값과 일관: IDEA..SHIPPED)
const ALLOWED: Record<string, string[]> = {
  IDEA: ['PLAN', 'BUILD', 'PAUSED', 'CANCELLED'],
  PLAN: ['BUILD', 'REVIEW', 'SHIP_READY', 'PAUSED', 'CANCELLED'],
  BUILD: ['PLAN', 'REVIEW', 'SHIP_READY', 'PAUSED', 'CANCELLED'],
  REVIEW: ['BUILD', 'SHIP_READY', 'PAUSED', 'CANCELLED'],
  SHIP_READY: ['SHIPPED', 'BUILD', 'PAUSED', 'CANCELLED'],
  SHIPPED: [],
  PAUSED: ['PLAN', 'BUILD', 'CANCELLED'],
  CANCELLED: [],
}
/** lifecycle 단일 소스 검증 (Rust lifecycle.rs와 동일 표) — sync push 가드 공용 */
export function isValidTransition(from: string, to: string): boolean {
  const next = ALLOWED[String(from ?? '').toUpperCase()]
  return Array.isArray(next) && next.includes(String(to ?? '').toUpperCase())
}

const STAGE: Record<string, string> = {
  IDEA: 'idea',
  PLAN: 'plan',
  BUILD: 'build',
  REVIEW: 'build',
  SHIP_READY: 'ship',
  SHIPPED: 'ship',
}

function slug(input: string) {
  return slash(input)
}

function jd(value: unknown): string {
  return JSON.stringify(value)
}

function bodyTemplate(title: string, sections: Array<[string, string | null]>): string {
  const L = [`# ${title}`, '']
  for (const [h, c] of sections) {
    if (!c) continue
    L.push(`## ${h}`, '', c, '')
  }
  return L.join('\n')
}

export class V4Domain {
  private stores: Record<DocType, MarkdownStore> = {
    product: new MarkdownStore('product'),
    change: new MarkdownStore('change'),
    workbench: new MarkdownStore('workbench'),
    artifact: new MarkdownStore('artifact'),
    decision: new MarkdownStore('decision'),
    release: new MarkdownStore('release'),
    capability: new MarkdownStore('capability'),
    readiness: new MarkdownStore('readiness'),
    proposal: new MarkdownStore('proposal'),
    review: new MarkdownStore('review'),
    reference: new MarkdownStore('reference'),
    dispatch: new MarkdownStore('dispatch'),
    patch: new MarkdownStore('patch'),
    milestone: new MarkdownStore('milestone'),
    insight: new MarkdownStore('insight'),
  }

  // ---- Product ----------------------------------------------------------
  async createProduct(input: {
    name: string
    description?: string | null
    productionStatus?: string
    version?: string
    goal?: string | null
    direction?: string | null
  }) {
    const id = slug(input.name)
    if (await this.stores.product.read(id)) {
      throw new Error(`Product already exists: ${id}`)
    }
    const meta: Record<string, unknown> = {
      id,
      type: 'product',
      name: input.name,
      status: 'production',
      production_status: input.productionStatus ?? 'PRODUCTION',
      version: input.version ?? null,
      current_goal: input.goal ?? null,
      direction: input.direction ?? null,
    }
    const res = await this.stores.product.upsert(
      id,
      meta,
      bodyTemplate(input.name, [
        ['설명', input.description ?? null],
        ['목표', input.goal ?? null],
        ['방향', input.direction ?? null],
      ]),
      1
    )
    return res.doc
  }

  async products() {
    return this.stores.product.list()
  }

  async getProduct(id: string) {
    const doc = await this.stores.product.read(id)
    if (!doc) throw new Error(`Product not found: ${id}`)
    const allChanges = await this.stores.change.list()
    const changes = allChanges.filter((c) => c.meta.product === id)
    return { product: doc, changes }
  }

  /** Product 상태 투영 (v0.4 · Closest to Ship 성): active/shipped 카운트. */
  async productState(id: string) {
    const { product, changes } = await this.getProduct(id)
    const active = changes.filter((c) =>
      ['IDEA', 'PLAN', 'BUILD', 'REVIEW', 'SHIP_READY'].includes((c.meta.status as string) ?? '')
    ).length
    const shipped = changes.filter((c) => c.meta.status === 'SHIPPED').length
    const allArtifacts = await this.stores.artifact.list()
    const artifacts = allArtifacts.filter((a) => a.meta.product === id)
    return { product, changes, activeChanges: active, shippedChanges: shipped, artifacts }
  }

  /** Change 컨텍스트를 보여주는 canonical Agent Handoff(markdown). dispatch 시 참조 아키팩트의 dispatched revision 기록. */
  async generateHandoff(productId: string, changeId: string) {
    const product = await this.stores.product.read(productId)
    if (!product) throw new Error(`Product not found: ${productId}`)
    const change = await this.stores.change.read(changeId)
    if (!change) throw new Error(`Change not found: ${changeId}`)
    const allArtifacts = await this.stores.artifact.list()
    const artifacts = allArtifacts.filter((a) => a.meta.product === productId)
    const allDecisions = await this.stores.decision.list()
    const decisions = allDecisions.filter(
      (d) => d.meta.product === productId && d.meta.status === 'ACTIVE'
    )

    const L: string[] = []
    L.push('# Agent Handoff', '')
    L.push(`<!-- xita product_id=${productId} change_id=${changeId} -->`, '')
    L.push(
      '## Product',
      '',
      `${product.meta.name ?? productId}${product.meta.version ? ' · ' + product.meta.version : ''}`,
      ''
    )
    L.push(
      `- Goal: ${product.meta.current_goal ?? '-'}`,
      `- Direction: ${product.meta.direction ?? '-'}`,
      ''
    )
    L.push('## Change', '', change.id, '')
    L.push(
      `- Status: ${change.meta.status ?? 'IDEA'} · Stage: ${change.meta.stage ?? '-'}`,
      `- Priority: ${change.meta.priority ?? '-'}`,
      ''
    )
    if (change.body) {
      L.push('### Context', '', change.body.trim(), '')
    }
    L.push('## Relevant Artifacts', '')
    for (const a of artifacts)
      L.push(`- ${a.meta.name ?? a.id} (revision ${a.meta.current_revision ?? a.revision ?? 1})`)
    L.push('', '## Relevant Decisions', '')
    for (const d of decisions) L.push(`- ${d.meta.title ?? d.id}: ${d.meta.decision ?? ''}`)
    if (!decisions.length) L.push('- (none)')
    L.push(
      '',
      '## Requested Work',
      '',
      '이 Change 를 완료하라. Scope 변경은 Proposal 을 생성한다.',
      ''
    )
    return { product: productId, change: changeId, markdown: L.join('\n') }
  }

  /** Artifact 를 dispatch 시각 기준으로 기록 (last_dispatched_revision). */
  async markArtifactDispatched(artifact: string, revision?: number) {
    const existing = await this.stores.artifact.read(artifact)
    if (!existing) throw new Error(`Artifact not found: ${artifact}`)
    const target =
      revision ?? (existing.meta.current_revision as number | undefined) ?? existing.revision ?? 1
    const nextRev = (existing.revision ?? 0) + 1
    const meta: Record<string, unknown> = {
      ...existing.meta,
      last_dispatched_revision: target,
      _dispatch_at: new Date().toISOString(),
    }
    await this.stores.artifact.upsert(artifact, meta, existing.body, nextRev)
    return { artifact, dispatchedRevision: target }
  }

  /** Context Drift (v0.3 §45-46 유지): dispatched vs current revision 비교. */
  async detectContextDrift(productId: string) {
    const allArtifacts = await this.stores.artifact.list()
    const artifacts = allArtifacts.filter((a) => a.meta.product === productId)
    const result: Array<Record<string, unknown>> = []
    for (const a of artifacts) {
      const current = (a.meta.current_revision as number | undefined) ?? a.revision ?? 1
      const dispatched = a.meta.last_dispatched_revision as number | undefined
      if (dispatched === undefined) continue // 미 dispatch → 드리프트 대상 아님
      const delta = current - dispatched
      if (delta <= 0) continue
      const severity = delta > 2 ? 'HIGH' : delta > 0 ? 'MEDIUM' : 'LOW'
      result.push({
        artifact: a.id,
        name: a.meta.name ?? a.id,
        dispatchedRevision: dispatched,
        currentRevision: current,
        delta,
        severity,
      })
    }
    return { productId, drifted: result, hasDrift: result.length > 0 }
  }

  // ---- Change -----------------------------------------------------------
  /*
   * createChange — Shape Up Pitch + Aha Scorecard 필드 흡수 (research wave2)
   * 변경 전 정책: change = title/intent/goal/context만 — 규모(appetite)·금지범위(no-gos)·점수가 없음
   * 변경 후 정책: appetite(SMALL|CYCLE|MULTI)+appetite_weeks+baseline+rabbit_holes+no_gos,
   *   scorecard s_pop/s_need/s_strat(0-10) s_effort(0-10 낮을수록 싸다) s_conf(0-10) —
   *   Aha 공식 수식 (pop+need+strat-effort)*conf 파생 정렬은 ops.roadmap에서 계산·비저장
   * 변경 이유: "관리하기 힘들다"의 실체는 우선순위 근거 부재. 방법론을 CRUD가 아니라 데이터로 심음
   * 영향 범위: changes/*.md frontmatter(unknown 필드 preserve라 마이그레이션 0), Rust/Swift는 투과형 무변경
   */
  async createChange(input: {
    productId: string
    title: string
    intent?: string | null
    goal?: string | null
    context?: string | null
    scope?: string | null
    priority?: string
    appetite?: string | null
    appetiteWeeks?: number | null
    baseline?: string | null
    rabbitHoles?: string[] | null
    noGos?: string[] | null
  }) {
    const product = await this.stores.product.read(input.productId)
    if (!product) throw new Error(`Product not found: ${input.productId}`)
    const id = slug(input.title)
    if (await this.stores.change.read(id)) throw new Error(`Change already exists: ${id}`)
    const meta: Record<string, unknown> = {
      id,
      type: 'change',
      product: input.productId,
      name: input.title,
      status: 'IDEA',
      stage: 'idea',
      priority: (input.priority ?? 'normal').toLowerCase(),
    }
    if (input.appetite) meta.appetite = input.appetite.toUpperCase()
    if (input.appetiteWeeks !== undefined && input.appetiteWeeks !== null)
      meta.appetite_weeks = Math.round(input.appetiteWeeks)
    if (input.baseline) meta.baseline = input.baseline
    if (input.rabbitHoles?.length) meta.rabbit_holes = jd(input.rabbitHoles)
    if (input.noGos?.length) meta.no_gos = jd(input.noGos)
    const body = bodyTemplate(input.title, [
      ['Problem / Intent', input.intent ?? null],
      ['Goal', input.goal ?? null],
      ['Baseline (지금 세상은)', input.baseline ?? null],
      ['Context', input.context ?? null],
      ['Scope', input.scope ?? null],
      [
        'Rabbit Holes (함정)',
        input.rabbitHoles?.length ? input.rabbitHoles.map((r) => `- ${r}`).join('\n') : null,
      ],
      [
        'No Gos (안 한다)',
        input.noGos?.length ? input.noGos.map((r) => `- ${r}`).join('\n') : null,
      ],
    ])
    const res = await this.stores.change.upsert(id, meta, body, 1)
    return res.doc
  }

  async transitionChange(changeId: string, lifecycle: string, note?: string | null) {
    const existing = await this.stores.change.read(changeId)
    if (!existing) throw new Error(`Change not found: ${changeId}`)
    const from = (existing.meta.status as string) ?? 'IDEA'
    if (from === lifecycle) return existing
    if (!ALLOWED[from] || !ALLOWED[from].includes(lifecycle)) {
      throw new Error(`Invalid transition "${from}" -> "${lifecycle}"`)
    }
    const nextRev = (existing.revision ?? 0) + 1
    const meta: Record<string, unknown> = {
      ...existing.meta,
      status: lifecycle,
      stage: STAGE[lifecycle] ?? existing.meta.stage,
      ...(lifecycle === 'SHIPPED' ? { shipped_at: new Date().toISOString(), progress: 100 } : {}),
      ...(note ? { last_note: note } : {}),
    }
    const res = await this.stores.change.upsert(changeId, meta, existing.body, nextRev)
    return res.doc
  }

  // ---- Workbench ----------------------------------------------------------
  async createWorkbench(input: {
    title: string
    workType?: string
    summary?: string | null
    body?: string | null
  }) {
    let id = slug(input.title)
    // 한글 전용 제목은 slug 가 비어 'item' 이 되고 재사용 시 충돌 → unique 접미
    if (await this.stores.workbench.read(id)) {
      id = `${id}-${Date.now().toString(36)}`
    }
    // AI Provider Layer (§10): workType 미지정 시 rule→cache→AI 파이프라인으로 분류
    const classified = input.workType
      ? {
          work_type: input.workType.toLowerCase(),
          source: 'manual' as const,
          confidence: 'high' as const,
        }
      : await classifyCapture(input.title, input.body ?? '')
    const meta: Record<string, unknown> = {
      id,
      type: 'workbench',
      status: 'captured',
      work_type: classified.work_type,
      classified_by: classified.source,
      summary: input.summary ?? null,
    }
    const body = input.body ?? bodyTemplate(input.title, [['요약', input.summary ?? null]])
    const res = await this.stores.workbench.upsert(id, meta, body, 1)
    return res.doc
  }

  async promoteWorkbench(
    workbenchId: string,
    target: 'product' | 'change',
    opts: { productId?: string; productName?: string; changeTitle?: string }
  ) {
    const item = await this.stores.workbench.read(workbenchId)
    if (!item) throw new Error(`Workbench item not found: ${workbenchId}`)
    const title = opts.productName ?? opts.changeTitle ?? item.id
    let promoted: { kind: 'product' | 'change'; id: string }

    if (target === 'product') {
      const product = await this.createProduct({
        name: title,
        description: (item.meta.summary as string | null) ?? 'promoted from workbench',
      })
      promoted = { kind: 'product', id: product.id }
    } else {
      const productId = opts.productId
      if (!productId) throw new Error('productId required to promote to change')
      const change = await this.createChange({
        productId,
        title,
        context: (item.meta.summary as string | null) ?? null,
      })
      promoted = { kind: 'change', id: change.id }
    }

    const nextRev = (item.revision ?? 0) + 1
    const meta: Record<string, unknown> = {
      ...item.meta,
      status: 'promoted',
      promoted_to: promoted.kind,
      promoted_id: promoted.id,
    }
    await this.stores.workbench.upsert(workbenchId, meta, item.body, nextRev)
    return { workbench: await this.stores.workbench.read(workbenchId), promoted }
  }

  async workbench() {
    return this.stores.workbench.list()
  }

  // ---- Needs You (v0.4 §6) -----------------------------------------------
  async needsYou() {
    const items: Array<Record<string, unknown>> = []
    const changes = await this.stores.change.list()
    for (const c of changes) {
      const st = (c.meta.status as string) ?? ''
      if (st === 'REVIEW' || st === 'SHIP_READY') {
        items.push({
          type: 'REVIEW',
          priority: 'NORMAL',
          product: c.meta.product ?? null,
          change: c.id,
          title: `${c.id} ready for review`,
          status: st,
        })
      }
    }
    // conflicts → Needs You (v0.4 §12 semantic conflict)
    const conflicts = await this.readConflicts()
    for (const cf of conflicts) {
      items.push({ type: 'SYNC_CONFLICT', priority: 'HIGH', conflict: cf })
    }
    return items
  }

  private async readConflicts(): Promise<Array<Record<string, unknown>>> {
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

  async workspaceMeta() {
    return loadWorkspaceMeta()
  }
}

export type { StoredDoc }
