import fs from 'node:fs/promises'
import path from 'node:path'
import { MarkdownStore, type StoredDoc } from '#v4/markdown_store'
import { loadWorkspaceMeta, metaDir, type DocType } from '#v4/workspace'
import { readText } from '#v4/fs_util'
import { summarizeHistory, askPlan } from '#v4/ai'
import slugify from '#utils/slug'
import { uniqSuffix } from '#v4/domain'

/*
 * v4 확장 도메인 (v0.3 §69-§81, §99-§104 이관).
 *
 * 변경 전 정책: v4 이관 시 Product/Change/Workbench/Artifact/Decision/Release 6종만 존재,
 *   Capabilities/Readiness/Proposal/Review/References/Dispatch/Timeline/Search/Biography
 *   등 legacy(TS Phase2-5) 기능과 스펙 요구 다수가 미이관 (감사 §2 지적 17건).
 * 변경 후 정책: v0.3 MVP Scope 전체를 canonical Markdown+YAML 위에서 재구현.
 *   - 복합 구조(groups/items/alternatives 등)는 meta 의 JSON scalar 문자열로 보존
 *     (frontmatter YAML 제약을 피하면서 canonical 파일 단일 소스 유지).
 *   - Human Timeline 은 .xita/events.jsonl 에 human-significant 이벤트만 append(§63).
 *   - 승인(§51) 시 Capability 적용→Timeline, Agent 결과(§48-50)→Review+Deviation→Proposal.
 *   - Dispatch(§40)는 destination 에 handoff 실파일 배치 + opt-in agent launch.
 * 변경 이유: v0.4 저장 구조(v0.3 §69)로 제품 기능 전체를 제공하기 위해.
 * 영향 범위: /v4/* 표면 전반, mobile sync 대상 타입(+6종), Needs You 타입(§81).
 */

const ALL: DocType[] = [
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

const ACTIVE = ['IDEA', 'PLAN', 'BUILD', 'REVIEW', 'SHIP_READY']

function milestoneWeight(status: string): number {
  const table: Record<string, number> = {
    SHIPPED: 1,
    SHIP_READY: 0.75,
    REVIEW: 0.75,
    BUILD: 0.5,
    PLAN: 0.3,
    PAUSED: 0.2,
    IDEA: 0.1,
    CANCELLED: -1,
  }
  return table[status] ?? 0.1
}

function jd(value: unknown): string {
  return JSON.stringify(value)
}
function jl<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function decodeCapChanges(raw: unknown): Array<{ id: string; action: string }> {
  // canonical 포맷: ["capId|ACTION", ...] (Rust core 와 공유)
  if (Array.isArray(raw)) {
    return raw
      .map(String)
      .filter((r) => r.includes('|'))
      .map((r) => {
        const [id, action] = r.split('|')
        return { id, action: action || 'MODIFY' }
      })
  }
  if (typeof raw === 'string' && raw.startsWith('['))
    return jl<Array<{ id: string; action: string }>>(raw, [])
  return []
}

interface ReadinessItem {
  name: string
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'NA'
  progress: number
  note?: string
}

/**
 * items 직렬화 포맷: `name|STATUS|progress|note` 문자열 배열.
 * (Rust core 과 공유하는 canonical 포맷 — JSON 보다는 파이프 리스트가
 *  YAML block list 로 양 언어 파서가 단순/견고)
 */
function encodeItems(items: ReadinessItem[]): string[] {
  return items.map((i) => `${i.name}|${i.status}|${i.progress}|${i.note ?? ''}`)
}
function decodeItems(raw: unknown): ReadinessItem[] {
  const list = Array.isArray(raw) ? (raw as unknown[]) : []
  return list
    .map((r) => String(r))
    .filter((r) => r.includes('|'))
    .map((r) => {
      const [name, status, progress, note] = r.split('|')
      return {
        name,
        status: (status || 'PENDING') as ReadinessItem['status'],
        progress: Number(progress || 0),
        note: note || undefined,
      }
    })
}

export interface NeedsYouItem {
  type:
    | 'DIRECTION'
    | 'SCOPE'
    | 'ARCHITECTURE'
    | 'UX'
    | 'DECISION'
    | 'REVIEW'
    | 'RELEASE'
    | 'CONTEXT_DRIFT'
    | 'ARTIFACT_CONFLICT'
    | 'SHIP_BLOCKER'
    | 'SYNC_CONFLICT'
    | 'AGENT_WAITING'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
  product: string
  title: string
  summary?: string | null
  ref: { kind: string; id: string }
}

export class V4Ops {
  stores = {} as Record<DocType, MarkdownStore>

  constructor() {
    for (const t of ALL) this.stores[t] = new MarkdownStore(t)
  }

  // ---- Timeline (§16/§63) -----------------------------------------------
  private eventsFile() {
    return path.join(metaDir(), 'events.jsonl')
  }

  async recordEvent(entry: {
    eventType: string
    product?: string | null
    change?: string | null
    title: string
    summary?: string | null
    /** 과거 사건 이관 시 원래 시각 (기본: 지금) */
    ts?: string
  }) {
    await fs.mkdir(metaDir(), { recursive: true })
    await fs.appendFile(
      this.eventsFile(),
      `${JSON.stringify({ ...entry, ts: entry.ts ?? new Date().toISOString() })}\n`,
      'utf8'
    )
  }

  async timeline(product?: string, limit = 30) {
    const raw = await readText(this.eventsFile())
    if (!raw) return []
    return (
      raw
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => {
          try {
            return JSON.parse(l) as Record<string, unknown>
          } catch {
            return null
          }
        })
        .filter((e): e is Record<string, unknown> => !!e)
        /* 이벤트 키 정규화 (run 20260830 테스트가 발견한 실버그):
         * TS recordEvent는 eventType, Rust approve_change는 event_type으로 기록 → 파일 혼재.
         * REST 응답은 event_type 단일 캐논으로 흡수 (파일 재기록 없음 = 무손실) */
        .map((e): Record<string, unknown> => {
          const et = (e.event_type ?? e.eventType) as string
          // event_type 캐논 + eventType 호환 (CLI 등 기존 consumer 무손실)
          return { ...e, event_type: et, eventType: et }
        })
        .filter((e) => !product || e.product === product)
        .slice(-limit)
        .reverse()
    )
  }

  // ---- Capabilities (§11) -------------------------------------------------
  async createCapability(
    productId: string,
    name: string,
    opts: { parentId?: string; description?: string } = {}
  ) {
    const id = `${productId}-${slugify(name)}`
    const res = await this.stores.capability.upsert(
      id,
      {
        product: productId,
        name,
        status: 'active',
        parent: opts.parentId ?? null,
        description: opts.description ?? null,
      },
      `# ${name}\n\n${opts.description ?? ''}`,
      1
    )
    await this.recordEvent({
      eventType: 'CAPABILITY_ADDED',
      product: productId,
      title: `Capability: ${name}`,
    })
    return res.doc
  }

  async capabilities(productId?: string) {
    const all = await this.stores.capability.list()
    return productId ? all.filter((c) => c.meta.product === productId) : all
  }

  async setCapabilityStatus(id: string, status: string, productId: string) {
    const cur = await this.stores.capability.read(id)
    if (!cur) throw new Error(`capability not found: ${id}`)
    await this.stores.capability.upsert(
      id,
      { ...cur.meta, status },
      cur.body,
      (cur.revision ?? 0) + 1
    )
    await this.recordEvent({
      eventType: 'CAPABILITY_CHANGED',
      product: productId,
      title: `Capability ${id} -> ${status}`,
    })
    return this.stores.capability.read(id)
  }

  // ---- Readiness + Definition of Ship (§19/§20) ----------------------------
  private rdyId(productId: string, kind: string) {
    return `${productId}-${kind.toLowerCase()}`
  }

  /** §20 Mobile SaaS 템플릿 등 product type 기반 DoS 적용 (멱등: 그룹 존재 시 스킵) */
  async applyShipTemplate(productId: string, productType = 'MOBILE_SAAS') {
    const templates: Record<string, Array<{ kind: string; items: string[] }>> = {
      MOBILE_SAAS: [
        { kind: 'PRODUCT', items: ['Core Flow', 'Error States', 'Empty States', 'Onboarding'] },
        {
          kind: 'TECH',
          items: [
            'Production API',
            'Production DB',
            'Secrets',
            'Logging',
            'Crash Reporting',
            'Backup',
            'Rate Limit',
            'Monitoring',
          ],
        },
        { kind: 'BUSINESS', items: ['Pricing', 'Payment', 'Analytics', 'Conversion'] },
        { kind: 'LEGAL', items: ['Privacy Policy', 'Terms', 'Account Deletion'] },
        { kind: 'ASSETS', items: ['App Icon', 'Screenshots', 'Feature Graphic'] },
        {
          kind: 'STORE',
          items: ['Description', 'Keywords', 'Release Notes', 'Play Store', 'App Store'],
        },
        {
          kind: 'QA',
          items: ['Android', 'iOS', 'Production Payment', 'Upgrade', 'Account Deletion'],
        },
      ],
      WEB_SAAS: [
        { kind: 'PRODUCT', items: ['Core Flow', 'Error States', 'Empty States', 'Onboarding'] },
        {
          kind: 'TECH',
          items: ['Production Deploy', 'DB', 'Secrets', 'Logging', 'Backup', 'Monitoring'],
        },
        { kind: 'BUSINESS', items: ['Pricing', 'Payment', 'Analytics'] },
        { kind: 'LEGAL', items: ['Privacy Policy', 'Terms'] },
        { kind: 'QA', items: ['Cross-browser', 'Payment E2E'] },
      ],
    }
    const tpl = templates[productType.toUpperCase()] ?? templates.WEB_SAAS
    let created = 0
    for (const g of tpl) {
      const id = this.rdyId(productId, g.kind)
      if (await this.stores.readiness.read(id)) continue
      const items: ReadinessItem[] = g.items.map((name) => ({
        name,
        status: 'PENDING',
        progress: 0,
      }))
      await this.stores.readiness.upsert(
        id,
        { product: productId, kind: g.kind, status: 'group', items: encodeItems(items) },
        `# ${g.kind} readiness\n`,
        1
      )
      created++
    }
    return { template: productType.toUpperCase(), groups: created }
  }

  async readinessGroups(productId: string) {
    return this.stores.readiness.list().then((rs) => rs.filter((r) => r.meta.product === productId))
  }

  async updateReadinessItem(
    productId: string,
    kind: string,
    itemName: string,
    patch: { status?: string; progress?: number; note?: string }
  ) {
    const id = this.rdyId(productId, kind)
    const cur = await this.stores.readiness.read(id)
    if (!cur) throw new Error(`readiness group not found: ${id}`)
    const items = decodeItems(cur.meta.items)
    const idx = items.findIndex((i) => i.name === itemName)
    if (idx === -1) throw new Error(`item not found: ${itemName} in ${kind}`)
    items[idx] = {
      ...items[idx],
      status: (patch.status as ReadinessItem['status']) ?? items[idx].status,
      progress: patch.progress ?? (patch.status === 'DONE' ? 100 : items[idx].progress),
      note: patch.note ?? items[idx].note,
    }
    await this.stores.readiness.upsert(
      id,
      { ...cur.meta, items: encodeItems(items) },
      cur.body,
      (cur.revision ?? 0) + 1
    )
    if (patch.status === 'BLOCKED') {
      await this.recordEvent({
        eventType: 'SHIP_BLOCKER',
        product: productId,
        title: `Blocker: ${itemName} (${kind})`,
        summary: patch.note ?? null,
      })
    }
    return this.readiness(productId)
  }

  /** §19 aggregate — Task 수ではなく 준비도. blockers 별도 노출 */
  async readiness(productId: string) {
    const groups = await this.readinessGroups(productId)
    let total = 0
    let score = 0
    const out = []
    const blockers: string[] = []
    for (const g of groups) {
      const items = decodeItems(g.meta.items)
      const scored = items.filter((i) => i.status !== 'NA')
      const progress = scored.length
        ? Math.round(scored.reduce((s, i) => s + i.progress, 0) / scored.length)
        : 100
      total += scored.length
      score += scored.reduce((s, i) => s + i.progress, 0)
      for (const i of items) if (i.status === 'BLOCKED') blockers.push(`${g.meta.kind}: ${i.name}`)
      out.push({
        kind: g.meta.kind,
        id: g.id,
        revision: g.revision,
        progress,
        items,
        blocked: items.filter((i) => i.status === 'BLOCKED').length,
      })
    }
    const overall = total ? Math.round(score / total) : 0
    return {
      product: productId,
      overall,
      launchReadiness: overall,
      readinessScore: overall,
      blockers,
      groups: out,
    }
  }

  // ---- Change ↔ Capability (§11/§13) + Proposal/Review/Approval (§48-51) ----
  async attachCapabilityToChange(
    changeId: string,
    capabilityId: string,
    action: string,
    productId: string
  ) {
    const cur = await this.stores.change.read(changeId)
    if (!cur) throw new Error(`change not found: ${changeId}`)
    const list = jl<Array<{ id: string; action: string }>>(cur.meta.capability_changes, [])
    const next = [...list.filter((e) => e.id !== capabilityId), { id: capabilityId, action }]
    await this.stores.change.upsert(
      changeId,
      { ...cur.meta, capability_changes: jd(next) },
      cur.body,
      (cur.revision ?? 0) + 1
    )
    return { changeId, capability_changes: next, product: productId }
  }

  /** §49 Proposal (Agent/Human) */
  async createProposal(input: {
    product: string
    change?: string | null
    title: string
    kind?: string
    problem?: string
    proposal: string
    reason?: string
    impact?: string[]
    alternatives?: string[]
    recommendation?: string
    severity?: string
    actor?: string
  }) {
    const id = `${input.change ?? input.product}-${slugify(input.title)}`
    const res = await this.stores.proposal.upsert(
      id,
      {
        product: input.product,
        change: input.change ?? null,
        name: input.title,
        kind: (input.kind ?? 'DIRECTION').toUpperCase(),
        problem: input.problem ?? null,
        proposal: input.proposal,
        reason: input.reason ?? null,
        impact: jd(input.impact ?? []),
        alternatives: jd(input.alternatives ?? []),
        recommendation: input.recommendation ?? null,
        severity: (input.severity ?? 'NORMAL').toUpperCase(),
        status: 'pending',
        proposed_by: input.actor ?? 'agent',
      },
      `# ${input.title}\n\n## Problem\n${input.problem ?? ''}\n\n## Proposal\n${input.proposal}\n\n## Reason\n${input.reason ?? ''}`,
      1
    )
    await this.recordEvent({
      eventType: 'PROPOSAL_CREATED',
      product: input.product,
      change: input.change ?? null,
      title: `Proposal: ${input.title}`,
    })
    return res.doc
  }

  async resolveProposal(id: string, status: 'approved' | 'rejected' | 'modified') {
    const cur = await this.stores.proposal.read(id)
    if (!cur) throw new Error(`proposal not found: ${id}`)
    await this.stores.proposal.upsert(
      id,
      { ...cur.meta, status },
      cur.body,
      (cur.revision ?? 0) + 1
    )
    await this.recordEvent({
      eventType: 'PROPOSAL_RESOLVED',
      product: (cur.meta.product as string) ?? null,
      change: (cur.meta.change as string) ?? null,
      title: `Proposal ${id} -> ${status}`,
    })
    return this.stores.proposal.read(id)
  }

  /** §48 Agent Result Import — Review Package 생성 + Deviation→Proposal + REVIEW 전이 */
  async importAgentResult(
    changeId: string,
    result: {
      summary: string
      implemented?: string[]
      changed_files?: string[]
      tests?: string[]
      decisions?: string[]
      deviations?: string[]
      capability_changes?: Array<{ id: string; action: string }>
      known_issues?: string[]
      suggested_followups?: string[]
      references?: Array<{ provider?: string; url?: string; title?: string }>
    }
  ) {
    const change = await this.stores.change.read(changeId)
    if (!change) throw new Error(`change not found: ${changeId}`)
    const productId = (change.meta.product as string) ?? ''
    const reviewId = `${changeId}-${Date.now().toString(36)}`
    const review = await this.stores.review
      .upsert(
        reviewId,
        {
          product: productId,
          change: changeId,
          name: result.summary,
          status: 'ready_for_review',
          original_goal: change.meta.goal ?? null,
          delivered: jd(result.implemented ?? []),
          not_delivered: jd((result.deviations ?? []).concat(result.known_issues ?? [])),
          tests: jd(result.tests ?? []),
          impact: jd({
            files: result.changed_files ?? [],
            capabilities: result.capability_changes ?? [],
            followups: result.suggested_followups ?? [],
          }),
          assessment: (result.known_issues ?? []).length ? 'needs attention' : 'ready to ship',
        },
        `# Review Package\n\n## Goal\n${change.meta.goal ?? ''}\n\n## Delivered\n${(result.implemented ?? []).map((s) => `- ${s}`).join('\n')}\n\n## Not delivered\n${(result.deviations ?? []).map((s) => `- ${s}`).join('\n')}\n\n## Tests\n${(result.tests ?? []).join('\n')}\n`,
        1
      )
      .then((r) => r.doc)

    for (const dev of result.deviations ?? []) {
      await this.createProposal({
        product: productId,
        change: changeId,
        title: `Deviation: ${dev}`,
        kind: 'SCOPE',
        problem: dev,
        proposal: `Accept deviation "${dev}" as new scope?`,
        recommendation: 'Human decision required (SPEC §49)',
        severity: 'HIGH',
        actor: 'agent',
      })
    }
    for (const cap of result.capability_changes ?? []) {
      await this.attachCapabilityToChange(changeId, cap.id, cap.action, productId)
    }
    const from = (change.meta.status as string) ?? 'IDEA'
    if (!['SHIPPED', 'CANCELLED'].includes(from)) {
      const pathTo =
        from === 'IDEA'
          ? ['PLAN', 'BUILD', 'REVIEW']
          : from === 'PLAN'
            ? ['BUILD', 'REVIEW']
            : from === 'BUILD'
              ? ['REVIEW']
              : []
      let cur = change
      for (const step of pathTo) {
        const up = await this.stores.change.upsert(
          changeId,
          { ...cur.meta, status: step, stage: step.toLowerCase() },
          cur.body,
          (cur.revision ?? 0) + 1
        )
        cur = up.doc
      }
      await this.recordEvent({
        eventType: 'AGENT_RESULT_IMPORTED',
        product: productId,
        change: changeId,
        title: `${changeId}: agent result → ${from}→REVIEW`,
      })
    }
    return { review, change: await this.stores.change.read(changeId) }
  }

  /** §51 Change Approval — Capability 적용 → SHIPPED → Timeline → 상태 반영.
   *  승인 전제는 검토 중(REVIEW/SHIP_READY) — 그 외 출발 상태는 거부(Rust 코어와 동일 게이트). */
  async approveChange(changeId: string) {
    const change = await this.stores.change.read(changeId)
    if (!change) throw new Error(`change not found: ${changeId}`)
    const from = (change.meta.status as string) ?? 'IDEA'
    if (from !== 'REVIEW' && from !== 'SHIP_READY' && from !== 'SHIPPED') {
      throw new Error(`approval requires REVIEW/SHIP_READY (current: ${from})`)
    }
    const productId = (change.meta.product as string) ?? ''
    const caps = decodeCapChanges(change.meta.capability_changes)
    for (const e of caps) {
      const cap = await this.stores.capability.read(e.id)
      if (!cap) continue
      const nextStatus =
        e.action === 'REMOVE' ? 'removed' : e.action === 'DEPRECATE' ? 'deprecated' : 'active'
      await this.stores.capability.upsert(
        e.id,
        {
          ...cap.meta,
          status: nextStatus,
          last_change: changeId,
          ...(e.action === 'CREATE' ? { introduced_by: changeId } : {}),
        },
        cap.body,
        (cap.revision ?? 0) + 1
      )
    }
    const allReviews = await this.stores.review.list()
    const reviews = allReviews.filter((r) => r.meta.change === changeId)
    for (const r of reviews) {
      await this.stores.review.upsert(
        r.id,
        { ...r.meta, status: 'approved' },
        r.body,
        (r.revision ?? 0) + 1
      )
    }
    if (from !== 'SHIPPED') {
      // 승인 = 검토 통과 + 출시 — REVIEW/SHIP_READY 어디서든 SHIPPED 로 (§51, 라이프사이클 예외 경로)
      await this.stores.change.upsert(
        changeId,
        {
          ...change.meta,
          status: 'SHIPPED',
          stage: 'ship',
          shipped_at: new Date().toISOString(),
        },
        change.body,
        (change.revision ?? 0) + 1
      )
      await this.recordEvent({
        eventType: 'CHANGE_APPROVED',
        product: productId,
        change: changeId,
        title: `${changeId} approved → SHIPPED (capabilities applied: ${caps.length})`,
      })
    }
    return { change: await this.stores.change.read(changeId), capabilities_applied: caps.length }
  }

  async requestChangesOn(changeId: string, note?: string) {
    const change = await this.stores.change.read(changeId)
    if (!change) throw new Error(`change not found: ${changeId}`)
    await this.stores.change.upsert(
      changeId,
      { ...change.meta, status: 'BUILD', stage: 'build' },
      change.body,
      (change.revision ?? 0) + 1
    )
    await this.recordEvent({
      eventType: 'CHANGES_REQUESTED',
      product: (change.meta.product as string) ?? null,
      change: changeId,
      title: `${changeId}: review requested changes${note ? ` — ${note}` : ''}`,
    })
    return this.stores.change.read(changeId)
  }

  // ---- References / Assets (§23/§24) ---------------------------------------
  async createReference(input: {
    product: string
    change?: string | null
    title: string
    provider: string
    url?: string
    kind?: 'reference' | 'asset'
    object_type?: string
    purpose?: string
    platform?: string
    status?: string
  }) {
    const id = `${input.product}-${slugify(input.title)}`
    const res = await this.stores.reference.upsert(
      id,
      {
        product: input.product,
        change: input.change ?? null,
        name: input.title,
        provider: input.provider.toUpperCase(),
        url: input.url ?? null,
        kind: input.kind ?? 'reference',
        object_type: input.object_type ?? null,
        purpose: input.purpose ?? null,
        platform: input.platform ?? null,
        status: (input.status ?? 'current').toLowerCase(),
      },
      `# ${input.title}\n\n${input.url ?? ''}`,
      1
    )
    await this.recordEvent({
      eventType: input.kind === 'asset' ? 'ASSET_ADDED' : 'REFERENCE_ADDED',
      product: input.product,
      title: `${input.title} (${input.provider})`,
    })
    return res.doc
  }

  /**
   * §13/§55 GitHub 관측 (v4 이관): PR 목록을 조회해 **참조 요약만** upsert.
   * 외부 데이터를 복제하지 않는다 — provider/external_id/url/status + 관찰시각.
   * env: XITA_GITHUB_TOKEN 선택(public repo 무토큰 관측 가능)
   */
  async observeGitHub(productId: string, repo: string) {
    // public repo 는 token 없이도 관측 가능(rate 60/h), private/대량은 XITA_GITHUB_TOKEN 권장
    const token = process.env.XITA_GITHUB_TOKEN
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(
      `https://api.github.com/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=15`,
      { headers }
    )
    if (!res.ok) throw new Error(`github api ${res.status}`)
    const pulls = (await res.json()) as Array<Record<string, unknown>>
    let created = 0
    let updated = 0
    for (const p of pulls) {
      const num = String(p.number ?? '')
      if (!num) continue
      const id = `${productId}-gh-${slugify(repo)}-${num}`
      const url = (p.html_url as string) ?? ''
      const title = (p.title as string) ?? `PR #${num}`
      const status = p.merged_at ? 'merged' : ((p.state as string) ?? 'open')
      const existing = await this.stores.reference.read(id)
      const meta = {
        product: productId,
        change: existing?.meta.change ?? null,
        name: title,
        provider: 'GITHUB',
        url,
        kind: 'reference',
        object_type: 'PR',
        external_id: num,
        repo,
        status,
        observed_at: new Date().toISOString(),
      }
      await this.stores.reference.upsert(
        id,
        meta,
        `# ${title}\n\n${url}\n`,
        existing ? (existing.revision ?? undefined) : undefined
      )
      if (existing) updated++
      else created++
    }
    await this.recordEvent({
      eventType: 'GITHUB_OBSERVED',
      product: productId,
      title: `GitHub 관측 ${repo}: +${created} ~${updated}`,
    })
    return { repo, created, updated }
  }

  /**
   * §13 순위2 Linear 관측: 이슈 요약을 references로 upsert (복제 금지 §55).
   * env: XITA_LINEAR_TOKEN 필요 (private API). teamId 옵션.
   */
  async observeLinear(productId: string, teamId?: string) {
    const token = process.env.XITA_LINEAR_TOKEN
    if (!token) throw new Error('XITA_LINEAR_TOKEN not set')
    const q = teamId
      ? `query{ issues(teamId:"${teamId}", first:20){ nodes{ id title url state{name} description } } }`
      : `query{ issues(first:20){ nodes{ id title url state{name} description } } }`
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    })
    if (!res.ok) throw new Error(`linear api ${res.status}`)
    const body = (await res.json()) as {
      data?: { issues?: { nodes?: Array<Record<string, unknown>> } }
    }
    const nodes = body.data?.issues?.nodes ?? []
    let created = 0
    let updated = 0
    for (const n of nodes) {
      const extId = String(n.id ?? '')
      if (!extId) continue
      const id = `${productId}-lin-${extId.slice(0, 12)}`
      const existing = await this.stores.reference.read(id)
      const meta = {
        product: productId,
        change: existing?.meta.change ?? null,
        name: String(n.title ?? 'Linear issue'),
        provider: 'LINEAR',
        url: String(n.url ?? ''),
        kind: 'reference',
        object_type: 'ISSUE',
        external_id: extId,
        status: String((n.state as { name?: string })?.name ?? ''),
        observed_at: new Date().toISOString(),
      }
      await this.stores.reference.upsert(
        id,
        meta,
        `# ${String(n.title ?? '')}\n\n${String(n.description ?? '').slice(0, 400)}\n`,
        existing ? (existing.revision ?? undefined) : undefined
      )
      if (existing) updated++
      else created++
    }
    await this.recordEvent({
      eventType: 'LINEAR_OBSERVED',
      product: productId,
      title: `Linear 관측: +${created} ~${updated}`,
    })
    return { created, updated }
  }

  /** §13 순위4 Figma 관측: 파일/페이지 이름을 참조로 (design source는 Figma 유지 §3.6) */
  async observeFigma(productId: string, fileKey: string) {
    const token = process.env.XITA_FIGMA_TOKEN
    if (!token) throw new Error('XITA_FIGMA_TOKEN not set')
    const res = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}`, {
      headers: { 'X-Figma-Token': token },
    })
    if (!res.ok) throw new Error(`figma api ${res.status}`)
    const file = (await res.json()) as {
      name?: string
      lastModified?: string
      children?: Array<Record<string, unknown>>
    }
    let created = 0
    let updated = 0
    const entries: Array<{ id: string; title: string; type: string }> = [
      { id: fileKey, title: file.name ?? fileKey, type: 'FILE' },
      ...(file.children ?? [])
        .filter((c) => c.type === 'PAGE')
        .map((c) => ({ id: String(c.id ?? ''), title: String(c.name ?? ''), type: 'PAGE' }))
        .filter((c) => c.id),
    ]
    for (const e of entries) {
      const id = `${productId}-fig-${slugify(fileKey)}-${slugify(e.id)}`
      const existing = await this.stores.reference.read(id)
      const meta = {
        product: productId,
        change: existing?.meta.change ?? null,
        name: e.title || e.id,
        provider: 'FIGMA',
        url: `https://www.figma.com/file/${fileKey}`,
        kind: 'reference',
        object_type: e.type,
        external_id: e.id,
        status: file.lastModified ? 'current' : 'observed',
        observed_at: new Date().toISOString(),
      }
      await this.stores.reference.upsert(
        id,
        meta,
        `# ${meta.name}\n\n${meta.url}\n`,
        existing ? (existing.revision ?? undefined) : undefined
      )
      if (existing) updated++
      else created++
    }
    await this.recordEvent({
      eventType: 'FIGMA_OBSERVED',
      product: productId,
      title: `Figma 관측 ${file.name ?? fileKey}: +${created} ~${updated}`,
    })
    return { fileKey, name: file.name ?? null, created, updated }
  }

  // ---- Decisions (§17/§76 "이 결정은 아직 유효한가") ----------------------------
  async decisions(productId?: string) {
    const all = await this.stores.decision.list()
    return productId ? all.filter((d) => d.meta.product === productId) : all
  }

  async addDecisionRest(input: {
    product: string
    title: string
    decision?: string
    reason?: string
    options?: string[]
    change?: string
  }) {
    const id = `${input.product}-d-${slugify(input.title)}`
    const res = await this.stores.decision.upsert(
      id,
      {
        product: input.product,
        change: input.change ?? null,
        title: input.title,
        name: input.title,
        decision: input.decision ?? null,
        reason: input.reason ?? null,
        options: (input.options ?? []).join(';'),
        status: 'ACTIVE',
        decided_at: new Date().toISOString(),
      },
      `# ${input.title}\n\n${input.decision ?? ''}\n\n## 배경\n${input.reason ?? ''}\n`,
      1
    )
    await this.recordEvent({
      eventType: 'MAJOR_DECISION',
      product: input.product,
      title: `Decision: ${input.title}`,
    })
    return res.doc
  }

  /** §17: 새 결정이 이전 것을 대체 — SUPERSEDED 체인 */
  async supersedeDecision(oldId: string, newId: string) {
    const oldD = await this.stores.decision.read(oldId)
    if (!oldD) throw new Error(`decision not found: ${oldId}`)
    const next = await this.stores.decision.read(newId)
    if (!next) throw new Error(`replacement decision not found: ${newId}`)
    await this.stores.decision.upsert(
      oldId,
      { ...oldD.meta, status: 'SUPERSEDED', superseded_by: newId },
      oldD.body,
      (oldD.revision ?? 0) + 1
    )
    await this.stores.decision.upsert(
      next.id,
      { ...next.meta, supersedes: oldId },
      next.body,
      (next.revision ?? 0) + 1
    )
    await this.recordEvent({
      eventType: 'DECISION_SUPERSEDED',
      product: String(oldD.meta.product ?? ''),
      title: `결정 대체: ${String(oldD.meta.title ?? oldId)} → ${String(next.meta.title ?? newId)}`,
    })
    return { oldId, newId }
  }

  // ---- Releases (§21/§22) ----------------------------------------------------
  async createRelease(input: { product: string; name: string; notes?: string }) {
    const id = `${input.product}-${slugify(input.name)}`
    if (await this.stores.release.read(id)) throw new Error(`release exists: ${id}`)
    const res = await this.stores.release.upsert(
      id,
      {
        product: input.product,
        name: input.name,
        version_label: input.name,
        status: 'PLANNED',
        notes: input.notes ?? null,
        change_ids: '',
      },
      `# Release ${input.name}\n\n${input.notes ?? ''}`,
      1
    )
    await this.recordEvent({
      eventType: 'RELEASE_PLANNED',
      product: input.product,
      title: `Release ${input.name} 계획`,
    })
    return res.doc
  }

  async releases(productId?: string) {
    const all = await this.stores.release.list()
    return productId ? all.filter((r) => r.meta.product === productId) : all
  }

  async addChangeToRelease(releaseId: string, changeId: string) {
    const r = await this.stores.release.read(releaseId)
    if (!r) throw new Error(`release not found: ${releaseId}`)
    const list = String(r.meta.change_ids ?? '')
      .split(';')
      .filter(Boolean)
    if (!list.includes(changeId)) list.push(changeId)
    await this.stores.release.upsert(
      releaseId,
      { ...r.meta, change_ids: list.join(';') },
      r.body,
      (r.revision ?? 0) + 1
    )
    return { releaseId, changes: list }
  }

  /** §21 상태 머신 + RELEASED 시 product.version/current_release 반영 (§9 Overview 동기) */
  async setReleaseStatus(releaseId: string, status: string) {
    const allowed = [
      'PLANNED',
      'PREPARING',
      'READY',
      'SUBMITTED',
      'RELEASED',
      'FAILED',
      'ROLLED_BACK',
    ]
    if (!allowed.includes(status)) throw new Error(`invalid release status: ${status}`)
    const r = await this.stores.release.read(releaseId)
    if (!r) throw new Error(`release not found: ${releaseId}`)
    const meta: Record<string, unknown> = { ...r.meta, status }
    if (status === 'RELEASED') meta.released_at = new Date().toISOString()
    await this.stores.release.upsert(releaseId, meta, r.body, (r.revision ?? 0) + 1)

    if (status === 'RELEASED') {
      const pid = String(r.meta.product ?? '')
      const product = await this.stores.product.read(pid)
      if (product) {
        await this.stores.product.upsert(
          pid,
          {
            ...product.meta,
            version: r.meta.version_label ?? r.meta.name,
            current_release_id: releaseId,
          },
          product.body,
          (product.revision ?? 0) + 1
        )
      }
      // 묶인 change 중 SHIP_READY/REVIEW 는 SHIPPED 아님 — 승인 흐름은 §51 유지. 릴리즈 이벤트만.
      await this.recordEvent({
        eventType: 'RELEASED',
        product: pid,
        title: `Release ${String(r.meta.name ?? releaseId)} 배포됨`,
        summary: `changes: ${String(r.meta.change_ids ?? '')}`,
      })
    } else {
      await this.recordEvent({
        eventType: 'RELEASE_STATUS',
        product: String(r.meta.product ?? ''),
        title: `Release ${String(r.meta.name ?? releaseId)} → ${status}`,
      })
    }
    return this.stores.release.read(releaseId)
  }

  /** §22 Release Readiness — change별 §51 승인 여부 + 제품 blockers */
  async releaseReadiness(releaseId: string) {
    const r = await this.stores.release.read(releaseId)
    if (!r) throw new Error(`release not found: ${releaseId}`)
    const changeIds = String(r.meta.change_ids ?? '')
      .split(';')
      .filter(Boolean)
    const rows = []
    for (const cid of changeIds) {
      const c = await this.stores.change.read(cid)
      rows.push({
        change: cid,
        name: (c?.meta.name as string) ?? cid,
        status: (c?.meta.status as string) ?? '?',
        shipped: (c?.meta.status as string) === 'SHIPPED',
      })
    }
    const pid = String(r.meta.product ?? '')
    const rdy = await this.readiness(pid)
    return {
      release: releaseId,
      version: r.meta.version_label ?? r.meta.name,
      status: r.meta.status,
      changes: rows,
      shipped: rows.filter((x) => x.shipped).length,
      total: rows.length,
      readiness: rdy.overall,
      blockers: rdy.blockers,
      ready: rows.length > 0 && rows.every((x) => x.shipped) && rdy.blockers.length === 0,
    }
  }

  // ---- Roadmap (FUTURE 축: Planned changes / goals) --------------------------
  /*
   * roadmap — Aha Scorecard 파생 정렬 도입 (research wave2 aha-retry 패턴 1/2/3)
   * 변경 전 정책: priority(4단 문자열) 하나만 — 동률 순서 무의미, 우선순위 근거 없음
   * 변경 후 정책: change에 s_pop/s_need/s_strat/s_effort/s_conf(0-10 정수)가 있으면
   *   score=(pop+need+strat-effort)*(conf/10) 계산해 선택 정렬, 없으면 기존 priority 순 유지.
   *   점수는 미저장 파생값(Float 없는 frontmatter 제약 회피). +stale_days(단계 체류=막힌곳 정량)
   * 변경 이유: "관리 힘들다"의 핵심 = 무엇을 먼저할지 근거. 총점보다 메트릭 슬라이스가 일한다(Aha)
   * 영향 범위: /v4/roadmap 응답(+value_score,+stale_days,+appetite), macOS Changes 탭 정렬, CLI roadmap
   */
  async roadmap(productId: string) {
    const changes = await this.stores.change.list()
    const future = changes.filter(
      (c) => c.meta.product === productId && ['IDEA', 'PLAN'].includes(String(c.meta.status))
    )
    const rank: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 }
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const scoreOf = (c: StoredDoc): number | null => {
      const pop = num(c.meta.s_pop)
      const need = num(c.meta.s_need)
      const strat = num(c.meta.s_strat)
      const effort = num(c.meta.s_effort)
      const conf = num(c.meta.s_conf)
      if (!pop || !need || !strat || effort === null || effort === undefined || !conf) return null
      return Math.round((pop + need + strat - effort) * (conf / 10) * 10) / 10
    }
    const now = Date.now()
    const staleDays = (c: StoredDoc): number | null => {
      const u = c.meta.updated_at ? Date.parse(String(c.meta.updated_at)) : Number.NaN
      if (Number.isNaN(u)) return null
      return Math.floor((now - u) / 86400_000)
    }
    const scored = future.map((c) => ({ c, score: scoreOf(c) }))
    scored.sort((a, b) => {
      if (a.score !== null && b.score !== null) return b.score - a.score
      if (a.score !== null) return -1
      if (b.score !== null) return 1
      return (rank[String(a.c.meta.priority)] ?? 2) - (rank[String(b.c.meta.priority)] ?? 2)
    })
    const product = await this.stores.product.read(productId)
    return {
      goal: product?.meta.current_goal ?? null,
      direction: product?.meta.direction ?? null,
      planned: scored.map(({ c, score }) => ({
        id: c.id,
        name: (c.meta.name as string) ?? c.id,
        status: c.meta.status,
        priority: c.meta.priority ?? 'normal',
        appetite: c.meta.appetite ?? null,
        appetite_weeks: c.meta.appetite_weeks ?? null,
        value_score: score,
        stale_days: staleDays(c),
        in_release: null as string | null,
      })),
    }
  }

  /** scorecard 채점 저장(파생 점수는 계산만, 원시 5값만 frontmatter에) */
  async scoreChange(
    changeId: string,
    m: { pop: number; need: number; strat: number; effort: number; conf: number }
  ) {
    const c = await this.stores.change.read(changeId)
    if (!c) throw new Error(`change not found: ${changeId}`)
    const clamp = (v: number) => Math.max(0, Math.min(10, Math.round(v)))
    const res = await this.stores.change.upsert(
      changeId,
      {
        ...c.meta,
        s_pop: clamp(m.pop),
        s_need: clamp(m.need),
        s_strat: clamp(m.strat),
        s_effort: clamp(m.effort),
        s_conf: clamp(m.conf),
        scored_at: new Date().toISOString(),
      },
      c.body,
      (c.revision ?? 0) + 1
    )
    await this.recordEvent({
      eventType: 'CHANGE_SCORED',
      product: String(c.meta.product ?? ''),
      change: changeId,
      title: `scorecard: P${clamp(m.pop)} N${clamp(m.need)} S${clamp(m.strat)} E${clamp(m.effort)} C${clamp(m.conf)}`,
    })
    return res.doc
  }

  async setRoadmapPriority(changeId: string, priority: string) {
    const c = await this.stores.change.read(changeId)
    if (!c) throw new Error(`change not found: ${changeId}`)
    await this.stores.change.upsert(
      changeId,
      { ...c.meta, priority },
      c.body,
      (c.revision ?? 0) + 1
    )
    return this.stores.change.read(changeId)
  }

  // ---- Product Health (§97/§98) ----------------------------------------------
  async productHealth(productId: string) {
    const [product, changes, releases, rdy, arts, caps, refs, proposals, evts] = await Promise.all([
      this.stores.product.read(productId),
      this.stores.change.list(),
      this.stores.release.list(),
      this.readiness(productId),
      this.stores.artifact.list(),
      this.capabilities(productId),
      this.references(productId),
      this.stores.proposal.list(),
      this.stores.artifact.list(),
      this.timeline(productId, 30),
    ])
    if (!product) throw new Error(`product not found: ${productId}`)
    const mine = changes.filter((c) => c.meta.product === productId)
    const active = mine.filter((c) => ACTIVE.includes(String(c.meta.status)))
    const myReleases = releases.filter((r) => r.meta.product === productId)
    const myArts = arts.filter((a) => a.meta.product === productId)
    const driftCount = myArts.filter((a) => {
      const cur = (a.meta.current_revision as number | undefined) ?? 0
      const disp = a.meta.last_dispatched_revision as number | undefined
      return disp !== undefined && cur > disp
    }).length
    const pendingProposals = proposals.filter(
      (p) => p.meta.product === productId && p.meta.status === 'pending'
    ).length
    const staleRefs = refs.filter(
      (r) =>
        Date.now() - Date.parse(String(r.meta.observed_at ?? r.meta.updated_at ?? 0)) >
        30 * 86400_000
    ).length
    return {
      product: productId,
      production_status: product.meta.production_status ?? product.meta.status,
      version: product.meta.version ?? null,
      health: {
        development: active.length > 0 ? 'healthy' : 'warning',
        operations: String(product.meta.deployments ?? '')
          .split(';')
          .filter(Boolean).length
          ? 'healthy'
          : 'warning',
        distribution: myReleases.some((r) =>
          ['RELEASED', 'SUBMITTED'].includes(String(r.meta.status))
        )
          ? 'healthy'
          : String(product.meta.production_status ?? product.meta.status) === 'PRODUCTION'
            ? 'warning'
            : 'pending',
        launch_readiness: rdy.overall,
        context: {
          artifacts: myArts.length,
          context_drift: driftCount,
          outdated_references: staleRefs,
          pending_proposals: pendingProposals,
          capabilities: caps.filter((c) => c.meta.status === 'active').length,
        },
      },
      next_release:
        myReleases.find((r) => !['RELEASED', 'ROLLED_BACK'].includes(String(r.meta.status)))?.meta
          .name ?? null,
      recent_activity_30d: evts.length,
    }
  }

  // ---- Milestones (Linear-style: 단계·가중 진행률·focus·overdue) ----------------
  async createMilestone(input: {
    product: string
    name: string
    targetDate?: string
    description?: string
  }) {
    /* 변경 전 정책: id = <product>-m-<slug(name)> 로 upsert — 한글 이름은 모두 '-m-item' 이 되어 앞 마일스톤을 조용히 덮어씀.
     * 변경 후 정책: 같은 id 가 이미 있으면 base36 시각 접미로 새 id (덮어쓰기 금지).
     * 영향 범위: 새 마일스톤 생성만. */
    let id = `${input.product}-m-${slugify(input.name)}`
    if (await this.stores.milestone.read(id)) id = `${id}-${uniqSuffix()}`
    const res = await this.stores.milestone.upsert(
      id,
      {
        product: input.product,
        name: input.name,
        target_date: input.targetDate ?? null,
        status: 'planned',
        description: input.description ?? null,
      },
      `# ${input.name}\n\n${input.description ?? ''}`,
      1
    )
    await this.recordEvent({
      eventType: 'MILESTONE_CREATED',
      product: input.product,
      title: `마일스톤: ${input.name}`,
    })
    return res.doc
  }

  async milestones(productId?: string) {
    const all = await this.stores.milestone.list()
    const mine = productId ? all.filter((m) => m.meta.product === productId) : all
    return mine.sort((a, b) =>
      String(a.meta.target_date ?? '9999').localeCompare(String(b.meta.target_date ?? '9999'))
    )
  }

  async assignMilestone(changeId: string, milestoneId: string | null) {
    const c = await this.stores.change.read(changeId)
    if (!c) throw new Error(`change not found: ${changeId}`)
    const meta: Record<string, unknown> = { ...c.meta }
    if (milestoneId) meta.milestone_id = milestoneId
    else delete meta.milestone_id
    await this.stores.change.upsert(changeId, meta, c.body, (c.revision ?? 0) + 1)
    return c.id
  }

  /** 가중 진행률 (Linear: started 시점부터 카운트) */
  static readonly CHANGE_WEIGHT: Record<string, number> = {
    SHIPPED: 1,
    SHIP_READY: 0.75,
    REVIEW: 0.75,
    BUILD: 0.5,
    PLAN: 0.3,
    PAUSED: 0.2,
    IDEA: 0.1,
    CANCELLED: -1,
  }

  async milestoneProgress(milestoneId: string) {
    const m = await this.stores.milestone.read(milestoneId)
    if (!m) throw new Error(`milestone not found: ${milestoneId}`)
    const allChanges = await this.stores.change.list()
    const changes = allChanges.filter((c) => c.meta.milestone_id === milestoneId)
    let sum = 0
    let counted = 0
    for (const c of changes) {
      const w = milestoneWeight(String(c.meta.status ?? 'IDEA'))
      if (w < 0) continue
      sum += w
      counted += 1
    }
    const progress = counted ? Math.round((sum / counted) * 100) : 0
    const target = m.meta.target_date ? Date.parse(String(m.meta.target_date)) : 0
    const overdue = target > 0 && target < Date.now() && String(m.meta.status) !== 'done'
    return {
      milestone: milestoneId,
      name: m.meta.name,
      status: m.meta.status,
      target_date: m.meta.target_date ?? null,
      changes: changes.map((c) => ({ id: c.id, name: c.meta.name ?? c.id, status: c.meta.status })),
      progress,
      done: changes.filter((c) => c.meta.status === 'SHIPPED').length,
      total: changes.length,
      overdue,
    }
  }

  /** 프로젝트 작업 보드 — 할 일(전 상태) + 마일스톤(진행률) 한 번에 (웹 '작업' 탭·CLI) */
  async productWork(productId: string) {
    const [changes, milestones] = await Promise.all([
      this.stores.change.list(),
      this.stores.milestone.list(),
    ])
    const mine = changes.filter((c) => c.meta.product === productId)
    const ms = milestones
      .filter((m) => m.meta.product === productId)
      .map((m) => {
        const linked = mine.filter((c) => c.meta.milestone_id === m.id)
        const counted = linked.filter((c) => milestoneWeight(String(c.meta.status ?? 'IDEA')) >= 0)
        const sum = counted.reduce(
          (a, c) => a + milestoneWeight(String(c.meta.status ?? 'IDEA')),
          0
        )
        const target = m.meta.target_date ? Date.parse(String(m.meta.target_date)) : 0
        return {
          id: m.id,
          name: String(m.meta.name ?? m.id),
          status: String(m.meta.status ?? 'planned'),
          target_date: (m.meta.target_date as string | null) ?? null,
          description: (m.meta.description as string | null) ?? null,
          progress: counted.length ? Math.round((sum / counted.length) * 100) : 0,
          done: linked.filter((c) => c.meta.status === 'SHIPPED').length,
          total: linked.length,
          overdue: target > 0 && target < Date.now() && String(m.meta.status) !== 'done',
        }
      })
      .sort((a, b) =>
        String(a.target_date ?? '9999').localeCompare(String(b.target_date ?? '9999'))
      )
    return {
      changes: mine
        .map((c) => ({
          id: c.id,
          name: String(c.meta.name ?? c.id),
          status: String(c.meta.status ?? 'IDEA'),
          priority: String(c.meta.priority ?? 'normal'),
          milestone: (c.meta.milestone_id as string | undefined) ?? null,
          note: changeNote(c.body),
          created_at: (c.meta.created_at as string | undefined) ?? null,
          updated_at: (c.meta.updated_at as string | undefined) ?? null,
        }))
        .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? ''))),
      milestones: ms,
    }
  }

  /** 할 일 제목·우선순위·메모 수정 (상태 전이는 transitionChange 로만) */
  async editChange(changeId: string, input: { title?: string; priority?: string; note?: string }) {
    const c = await this.stores.change.read(changeId)
    if (!c) throw new Error(`change not found: ${changeId}`)
    const meta: Record<string, unknown> = { ...c.meta }
    let body = c.body
    if (input.title?.trim()) {
      meta.name = input.title.trim()
      body = body.replace(/^# .*$/m, `# ${meta.name}`)
    }
    if (input.priority) meta.priority = input.priority.toLowerCase()
    if (input.note !== undefined) body = setChangeNote(body, input.note)
    await this.stores.change.upsert(changeId, meta, body, (c.revision ?? 0) + 1)
    return this.stores.change.read(changeId)
  }

  async setMilestoneStatus(milestoneId: string, status: string) {
    const m = await this.stores.milestone.read(milestoneId)
    if (!m) throw new Error(`milestone not found: ${milestoneId}`)
    await this.stores.milestone.upsert(
      milestoneId,
      { ...m.meta, status },
      m.body,
      (m.revision ?? 0) + 1
    )
    return this.stores.milestone.read(milestoneId)
  }

  // ---- §57 Historian: 최근 변화 요약 ------------------------------------------
  async summarize(productId?: string, days = 90) {
    const evts = await this.timeline(productId, 500)
    const since = Date.now() - days * 86400_000
    const recent = evts.filter((e) => Date.parse(String(e.ts)) >= since)
    const count = (t: string) => recent.filter((e) => e.event_type === t).length
    const facts = [
      `완료된 Change: ${count('CHANGE_APPROVED') + count('CHANGE_SHIPPED')}`,
      `릴리즈: ${count('RELEASED')}`,
      `새 결정: ${count('MAJOR_DECISION')} (대체 ${count('DECISION_SUPERSEDED')})`,
      `제안: ${count('PROPOSAL_CREATED')}`,
      `출시 차단: ${count('SHIP_BLOCKER')}`,
      `문서 패치: ${count('ARTIFACT_PATCHED')}`,
    ]
    const fallback = `최근 ${days}일 — 완료 Change ${count('CHANGE_APPROVED') + count('CHANGE_SHIPPED')}건 · 릴리즈 ${count('RELEASED')}건 · 새 결정 ${count('MAJOR_DECISION')}건(대체 ${count('DECISION_SUPERSEDED')}) · 제안 ${count('PROPOSAL_CREATED')}건 · 차단 기록 ${count('SHIP_BLOCKER')}건 · 문서 패치 ${count('ARTIFACT_PATCHED')}건`
    const out = await summarizeHistory(recent.length ? facts : [], fallback)
    return {
      days,
      product: productId ?? null,
      events: recent.length,
      summary: out.summary,
      source: out.source,
      facts,
    }
  }

  /*
   * Insight(지식/관찰 1급 객체) — Product OS 경쟁 연구 반영
   * 변경 전 정책: 관찰/가설/정량 데이터가 decisions/workbench에 혼재, '검증된 가정' 개념 없음
   * 변경 후 정책: insights/*.md — kind(OBSERVATION|INTERVIEW|FOCUS_GROUP|SECONDARY|DERIVED|RETRO),
   *   confidence, source, links(change/capability/product) 로 분리. Leantime Insights 5분류 + Huly 지혜 종합
   * 변경 이유: 'AI가 문서를 읽고 판단하는' 시스템의 연료는 구조화된 관찰. AI 연료 + 온보딩 질문 회피 방지
   * 영향 범위: 14번째 DocType(sync EDITABLE/인덱스/Rust ALL_TYPES/Swift·mobile union 병행 필요), Ask 풀
   */
  async createInsight(input: {
    product: string
    title: string
    kind?: string
    content: string
    confidence?: number
    source?: string
    change?: string | null
    capability?: string | null
  }) {
    const id = `${input.product}-${slugify(input.title)}`
    const res = await this.stores.insight.upsert(
      id,
      {
        product: input.product,
        name: input.title,
        kind: (input.kind ?? 'OBSERVATION').toUpperCase(),
        confidence: input.confidence ?? null,
        source: input.source ?? 'manual',
        change: input.change ?? null,
        capability: input.capability ?? null,
        status: 'OPEN',
        created_at: new Date().toISOString(),
      },
      input.content,
      1
    )
    await this.recordEvent({
      eventType: 'INSIGHT_CREATED',
      product: input.product,
      change: input.change ?? null,
      title: input.title,
    })
    return res.doc
  }

  async insights(productId?: string) {
    const all = await this.stores.insight.list()
    return productId ? all.filter((i) => i.meta.product === productId) : all
  }

  async setInsightStatus(insightId: string, status: string) {
    const cur = await this.stores.insight.read(insightId)
    if (!cur) throw new Error(`insight not found: ${insightId}`)
    const res = await this.stores.insight.upsert(
      insightId,
      { ...cur.meta, status: status.toUpperCase(), updated_at: new Date().toISOString() },
      cur.body,
      (cur.revision ?? 0) + 1
    )
    return res.doc
  }

  /**
   * dispatchUpdate — 에이전트 런 피드백 루프 (Vibe Kanban/Conductor/Plane AgentRun 벤치마크)
   * 변경 전 정책: dispatch는 '보냈다'로 끝 — AWAITING_INPUT/MERGED/FAILED 후속 상태 없음, 사람이 기억해야 함
   * 변경 후 정책: status(WORKING|AWAITING_INPUT|RESULT_READY|MERGED|FAILED|CANCELLED) + note/result_ref 기록,
   *   AWAITING_INPUT·FAILED는 needsYou 파생으로 자동 승격("human decides" 병목에 SLA를)
   * 변경 이유: AI 운영체제의 핵심은 dispatch→회수闭环. 방치된 에이전트 질문 = 조용한 실패
   * 영향 범위: dispatches/*.md 필드(+status 결과부), NeedsYou 타입 AGENT_WAITING, CLI agent-update
   */
  async dispatchUpdate(input: { id: string; status?: string; note?: string; result_ref?: string }) {
    const cur = await this.stores.dispatch.read(input.id)
    if (!cur) throw new Error(`dispatch not found: ${input.id}`)
    const meta: Record<string, unknown> = {
      ...cur.meta,
      updated_at: new Date().toISOString(),
    }
    if (input.status) meta.status = input.status.toUpperCase()
    if (input.result_ref) meta.result_ref = input.result_ref
    let body = cur.body
    if (input.note) {
      const stamp = new Date().toISOString().slice(0, 16)
      body = `${body}\n\n## Run log\n- ${stamp} ${String(meta.status ?? '')} — ${input.note}\n`
    }
    const res = await this.stores.dispatch.upsert(input.id, meta, body, (cur.revision ?? 0) + 1)
    await this.recordEvent({
      eventType: 'DISPATCH_UPDATED',
      product: String(cur.meta.product ?? ''),
      change: String(cur.meta.change ?? '') || null,
      title: `${input.id}: ${String(meta.status ?? 'updated')}`,
    })
    return res.doc
  }

  // ---- §18/§64 Ask: 자연어 질문 → 의도 파싱 + 근거(sources) ---------------------
  async ask(question: string) {
    const q = question.toLowerCase()
    let intent:
      | 'decision'
      | 'changes'
      | 'blockers'
      | 'version'
      | 'artifacts'
      | 'drift'
      | 'timeline'
      | 'insight' = 'changes'
    if (/왜|이유|채택|결정|why|because|decision/i.test(q)) intent = 'decision'
    else if (/막혀|막힘|블로커|blocker|차단/i.test(q)) intent = 'blockers'
    else if (/버전|version|운영|production|배포|올라|라이브|서비스/i.test(q)) intent = 'version'
    else if (/문서|artifact|스펙|spec|도큐먼트/i.test(q)) intent = 'artifacts'
    else if (/오래|drift|드립트|context|컨텍스트/i.test(q)) intent = 'drift'
    else if (/최근|달라| summar/i.test(q)) intent = 'timeline'
    else if (/인사이트|insight|관찰|가설|정량|인터뷰|retro|회고/i.test(q)) intent = 'insight'
    if (intent === 'changes' && !/변경|change|들어가|됐|진행/i.test(q)) {
      const plan = await askPlan(question)
      if (
        plan &&
        [
          'decision',
          'changes',
          'blockers',
          'version',
          'artifacts',
          'drift',
          'timeline',
          'insight',
        ].includes(plan.intent)
      ) {
        intent = plan.intent as typeof intent
      }
    }
    // 주제 키워드: 조사/의도어 제거 후 실명 키워드 (product/change 검색용)
    const stopWords = new Set([
      '왜',
      '뭔지',
      '뭔가요',
      '뭐지',
      '무엇',
      '몇',
      '어디',
      '지금',
      '현재',
      '최근',
      '것인지',
      '인지',
      '있나',
      '있지',
      '있어',
      '하는',
      '하고',
      '사용',
      '되지',
      '됐지',
      '됐나',
      '들어',
      '가운데',
      '가장',
      '모든',
      '전부',
      'show',
      'me',
      'what',
      'why',
      'is',
      'are',
      'the',
      'all',
      'for',
      'of',
      'related',
      '관련',
    ])
    // 한글 조사 제거 정규화 (paddle을 → paddle, 제품들은 → 제품)
    const particles = [
      '에서도',
      '에서도',
      '들에게',
      '으로서',
      '으로부터',
      '이랑',
      '은는',
      '으로',
      '에서',
      '부터',
      '까지',
      '처럼',
      '보다',
      '에게',
      '들도',
      '이나',
      '이자',
      '을를',
      '과',
      '와',
      '을',
      '를',
      '이',
      '가',
      '은',
      '는',
      '의',
      '도',
      '만',
      '로',
      '에',
      'へ',
    ]
    const normalize = (w: string) => {
      let t = w
      for (const part of particles.sort((a, b) => b.length - a.length)) {
        if (t.length > part.length + 1 && t.endsWith(part)) {
          t = t.slice(0, -part.length)
          break
        }
      }
      return t
    }
    const tokens = question
      .toLowerCase()
      .split(/[\s?.,!?]+/)
      .map((w) => normalize(w.trim()))
      .filter((w) => w.length > 1 && !stopWords.has(w))
    const generic = new Set([
      '운영',
      '제품',
      '서비스',
      '배포',
      '버전',
      '차단',
      '결정',
      '문서',
      '변경',
      '목록',
      '보여줘',
      '알려줘',
      '뭐지',
      '뭔지',
      '현재',
      '지금',
      '전부',
      '다',
      '모든',
      '있는',
      '있음',
      '관련',
      '된',
      '되는',
      '하고',
      '사용',
    ])
    const meaningful = tokens.filter((t) => !generic.has(t) && t.length > 1)
    const keyword =
      intent === 'version' || intent === 'blockers' || intent === 'timeline'
        ? meaningful.slice(0, 1).join(' ')
        : meaningful.slice(0, 3).join(' ')
    const match = (d: StoredDoc) =>
      !keyword ||
      `${d.id} ${JSON.stringify(d.meta)} ${d.body}`.toLowerCase().includes(keyword.toLowerCase())
    const sources: Array<{ kind: string; id: string; title: string }> = []
    let answer = ''
    if (intent === 'decision') {
      const allDec = await this.stores.decision.list()
      let hits = allDec.filter(match)
      if (!hits.length) hits = allDec.filter((d) => d.meta.status === 'ACTIVE')
      hits
        .slice(0, 5)
        .forEach((h) =>
          sources.push({ kind: 'decision', id: h.id, title: String(h.meta.title ?? h.id) })
        )
      answer = hits.length
        ? hits
            .slice(0, 3)
            .map(
              (h) =>
                `${String(h.meta.title ?? h.id)}: ${String(h.meta.decision ?? '')}${h.meta.reason ? ` — 이유: ${String(h.meta.reason)}` : ''}${h.meta.status === 'SUPERSEDED' ? ' (대체됨)' : ''}`
            )
            .join('\n')
        : '기록된 결정 없음'
    } else if (intent === 'blockers') {
      const blockerProducts = await this.stores.product.list()
      const lines: string[] = []
      for (const p of blockerProducts) {
        if (!match(p)) continue
        const r = await this.readiness(p.id)
        r.blockers.forEach((b) => lines.push(`${String(p.meta.name ?? p.id)}: ${b}`))
      }
      answer = lines.length ? lines.join('\n') : '현재 차단 없음'
    } else if (intent === 'version') {
      const allProd = await this.stores.product.list()
      let hits = allProd.filter(match)
      if (!hits.length) hits = allProd
      const rels = await this.releases()
      answer = hits
        .map((p) => {
          const next = rels.find(
            (r) =>
              r.meta.product === p.id &&
              !['RELEASED', 'ROLLED_BACK'].includes(String(r.meta.status))
          )
          const ver = String(p.meta.version ?? '-')
          const verLabel = ver === '-' ? '-' : ver.startsWith('v') ? ver : `v${ver}`
          return `${String(p.meta.name ?? p.id)}: ${String(p.meta.production_status ?? p.meta.status ?? '-')} · ${verLabel} · 다음=${String(next?.meta.name ?? '-')}`
        })
        .join('\n')
      hits.forEach((p) =>
        sources.push({ kind: 'product', id: p.id, title: String(p.meta.name ?? p.id) })
      )
      answer = answer || '제품 목록 없음'
    } else if (intent === 'artifacts' || intent === 'drift') {
      const allArt = await this.stores.artifact.list()
      const arts = allArt.filter(match)
      if (intent === 'artifacts') {
        arts.forEach((a) =>
          sources.push({ kind: 'artifact', id: a.id, title: String(a.meta.name ?? a.id) })
        )
        answer =
          arts
            .map(
              (a) =>
                `${String(a.meta.name ?? a.id)} (rev ${String(a.meta.current_revision ?? '?')}${a.meta.review_status ? `, ${String(a.meta.review_status)}` : ''})`
            )
            .join('\n') || '관련 문서 없음'
      } else {
        const rows: string[] = []
        for (const a of arts) {
          const cur = (a.meta.current_revision as number | undefined) ?? 0
          const disp = a.meta.last_dispatched_revision as number | undefined
          if (disp !== undefined && cur > disp)
            rows.push(`${String(a.meta.name ?? a.id)}: dispatched ${disp} → current ${cur}`)
        }
        answer = rows.length ? rows.join('\n') : '오래된 Agent Context 없음'
      }
    } else if (intent === 'timeline') {
      const sum = await this.summarize()
      answer = sum.summary
    } else if (intent === 'insight') {
      /* 관찰/가설 1급 객체 질의 (Leantime Insights 벤치마크) */
      const allIns = await this.stores.insight.list()
      let hits = allIns.filter(match)
      if (!hits.length) hits = allIns
      hits.slice(0, 6).forEach((h) =>
        sources.push({
          kind: 'insight',
          id: h.id,
          title: `${String(h.meta.kind ?? 'OBSERVATION')} · ${String(h.meta.name ?? h.id)}`,
        })
      )
      answer =
        hits
          .slice(0, 5)
          .map(
            (h) =>
              `- ${String(h.meta.name ?? h.id)} [${String(h.meta.status ?? 'OPEN')}${typeof h.meta.confidence !== 'undefined' && h.meta.confidence !== null ? `, 신뢰 ${String(h.meta.confidence)}` : ''}]: ${h.body.trim().split('\n')[0].slice(0, 120)}`
          )
          .join('\n') ||
        '기록된 관찰/가설 없음 — 캡처 탭에서 관찰을 남기면 이곳이 AI의 근거가 됩니다'
    } else {
      const allCh = await this.stores.change.list()
      const hits = allCh.filter(match)
      hits
        .slice(0, 6)
        .forEach((c) =>
          sources.push({ kind: 'change', id: c.id, title: String(c.meta.name ?? c.id) })
        )
      answer = hits.length
        ? hits.map((c) => `${String(c.meta.name ?? c.id)} — ${String(c.meta.status)}`).join('\n')
        : `관련 Change 없음 (키워드: ${keyword || '?'})`
    }
    return { question, intent, keyword, answer, sources }
  }

  // ---- §31/§100 인사이트 → 기존 아티팩트 패치 (새 문서 생성 금지) ----------------
  async suggestArtifactPatch(artifactId: string, insight: string) {
    const a = await this.stores.artifact.read(artifactId)
    if (!a) throw new Error(`artifact not found: ${artifactId}`)
    const id = `${artifactId}-p-${Date.now().toString(36)}`
    const base = (a.meta.current_revision as number | undefined) ?? a.revision ?? 1
    const body = [
      a.body.trimEnd(),
      '',
      `<!-- base revision ${base} -->`,
      '## 신규 인사이트 (미검토)',
      '',
      insight,
      '',
    ].join('\n')
    const res = await this.stores.patch.upsert(
      id,
      {
        artifact: artifactId,
        product: a.meta.product ?? null,
        name: `패치: ${insight.slice(0, 40)}`,
        status: 'pending',
        base_revision: base,
      },
      body,
      1
    )
    await this.recordEvent({
      eventType: 'ARTIFACT_PATCH_SUGGESTED',
      product: (a.meta.product as string) ?? null,
      title: `패치 제안 → ${String(a.meta.name ?? artifactId)}`,
    })
    return res.doc
  }

  async applyPatch(patchId: string) {
    const pt = await this.stores.patch.read(patchId)
    if (!pt) throw new Error(`patch not found: ${patchId}`)
    const artifactId = String(pt.meta.artifact)
    const a = await this.stores.artifact.read(artifactId)
    if (!a) throw new Error(`artifact not found: ${artifactId}`)
    const base = Number(pt.meta.base_revision ?? 0)
    const cur = (a.meta.current_revision as number | undefined) ?? 0
    if (cur !== base) {
      await this.stores.patch.upsert(
        patchId,
        { ...pt.meta, status: 'conflict' },
        pt.body,
        (pt.revision ?? 0) + 1
      )
      return {
        applied: false,
        conflict: true,
        reason: `base ${base} vs current ${cur} — 아티팩트가 먼저 개정됨, 재검토 필요`,
      }
    }
    const body = String(pt.body)
      .replace(/<!-- base revision \d+ -->/g, '')
      .replace('## 신규 인사이트 (미검토)', `## 인사이트 (r${cur + 1} 통합)`)
    const { ArtifactStore } = await import('#v4/artifact_store')
    const as = new ArtifactStore()
    const out = await as.addRevision(artifactId, {
      content: body,
      summary: `patch ${patchId} 적용`,
      changeSummary: '인사이트 통합 (새 문서 없음)',
    })
    await this.stores.patch.upsert(
      patchId,
      { ...pt.meta, status: 'applied' },
      pt.body,
      (pt.revision ?? 0) + 1
    )
    await this.recordEvent({
      eventType: 'ARTIFACT_PATCHED',
      product: (a.meta.product as string) ?? null,
      title: `${String(a.meta.name ?? artifactId)} → rev ${out.revision} (패치 통합)`,
    })
    return { applied: true, revision: out.revision }
  }

  async dismissPatch(patchId: string) {
    const pt = await this.stores.patch.read(patchId)
    if (!pt) throw new Error(`patch not found: ${patchId}`)
    return this.stores.patch.upsert(
      patchId,
      { ...pt.meta, status: 'dismissed' },
      pt.body,
      (pt.revision ?? 0) + 1
    )
  }

  async patches(artifactId?: string) {
    const all = await this.stores.patch.list()
    return artifactId ? all.filter((x) => x.meta.artifact === artifactId) : all
  }

  async references(productId: string, kind?: 'reference' | 'asset') {
    const all = await this.stores.reference.list()
    return all.filter((r) => r.meta.product === productId && (!kind || r.meta.kind === kind))
  }

  // ---- Dispatch / Build This (§38-40, §92) ---------------------------------
  async buildThis(input: {
    product: string
    change: string
    artifactRevisions?: Array<{ id: string; revision: number }>
    destination: { path: string; repo?: string; branch?: string; machine?: string }
    instruction?: string
    mode: 'send_files' | 'send_and_start'
  }) {
    const handoff = await this.generateHandoff(
      input.product,
      input.change,
      input.artifactRevisions,
      input.instruction
    )
    const id = `d-${input.change}-${Date.now().toString(36)}`
    const destPath = path.resolve(input.destination.path)
    // Allowed-root 정책: 서버(호스트) 프로세스 권한 내 명시 경로에만 쓴다 (§17/§43)
    await fs.mkdir(path.join(destPath, '.xita'), { recursive: true })
    const outFile = path.join(destPath, '.xita', `${input.change}-handoff.md`)
    await fs.writeFile(outFile, handoff.markdown, 'utf8')

    let branchCreated = false
    /* base_sha (Conductor 모델): 브랜치 생성 직전 HEAD를 스냅샷 — 'SHIP_READY = 이 SHA까지의 diff'
     * 를 객관화. dispatch 도큐먼트에 박아두면 에이전트/사람 모두 기준 커밋 논쟁 없음 */
    let baseSha: string | null = null
    if (input.destination.branch) {
      try {
        const { execFile } = await import('node:child_process')
        await new Promise<void>((resolve, reject) => {
          execFile('git', ['-C', destPath, 'rev-parse', '--git-dir'], (err) => {
            if (err) return reject(new Error('not a git repo'))
            execFile('git', ['-C', destPath, 'rev-parse', 'HEAD'], (eH, head) => {
              if (!eH) baseSha = head.trim().slice(0, 12)
              execFile(
                'git',
                ['-C', destPath, 'checkout', '-b', input.destination.branch!],
                (e2) => (e2 ? reject(e2) : resolve())
              )
            })
          })
        })
        branchCreated = true
      } catch (e) {
        branchCreated = false
      }
    }

    let agentLaunched = false
    if (input.mode === 'send_and_start') {
      const cmd = process.env.XITA_AGENT_CMD // opt-in: 명시 커맨드 설정 시에만 (§16 Agent Launch Opt-in)
      if (cmd) {
        try {
          const { spawn } = await import('node:child_process')
          const [bin, ...args] = cmd.split(' ')
          const child = spawn(bin, args, { cwd: destPath, detached: true, stdio: 'ignore' })
          child.on('error', () => {
            /* launch 실패는 dispatch record 에 남김 */
          })
          child.unref()
          agentLaunched = true
        } catch {
          agentLaunched = false
        }
      }
    }

    for (const ar of input.artifactRevisions ?? []) {
      await this.markArtifactDispatchedSafe(ar.id, ar.revision)
    }

    const res = await this.stores.dispatch.upsert(
      id,
      {
        product: input.product,
        change: input.change,
        name: `dispatch ${input.change}`,
        mode: input.mode,
        destination_path: destPath,
        repo: input.destination.repo ?? null,
        branch: input.destination.branch ?? null,
        machine: input.destination.machine ?? 'this-mac',
        artifacts: jd(input.artifactRevisions ?? []),
        handoff_file: outFile,
        branch_created: jd(branchCreated),
        agent_started: jd(agentLaunched),
        status: 'DISPATCHED',
        base_sha: baseSha,
        result_ref: null,
        agent: process.env.XITA_AGENT_CMD ?? 'external',
        handoff_revision_base: jd(this.handoffFingerprint(input)),
      },
      handoff.markdown,
      1
    )
    await this.recordEvent({
      eventType: 'DISPATCHED',
      product: input.product,
      change: input.change,
      title: `${input.mode}: ${input.change} → ${destPath}${branchCreated ? ` (branch ${input.destination.branch})` : ''}`,
    })
    return res.doc
  }

  private handoffFingerprint(input: {
    product: string
    change: string
    artifactRevisions?: Array<{ id: string; revision: number }>
  }) {
    return {
      change: input.change,
      artifacts: input.artifactRevisions ?? [],
      at: new Date().toISOString(),
    }
  }

  private async markArtifactDispatchedSafe(artifactId: string, revision: number) {
    const a = await this.stores.artifact.read(artifactId)
    if (!a) return
    const nextRev = (a.revision ?? 0) + 1
    await this.stores.artifact.upsert(
      artifactId,
      { ...a.meta, last_dispatched_revision: revision, dispatched_at: new Date().toISOString() },
      a.body,
      nextRev
    )
  }

  async dispatches(productId?: string) {
    const all = await this.stores.dispatch.list()
    return productId ? all.filter((d) => d.meta.product === productId) : all
  }

  /** §47 Incremental Context Update — dispatch 이후 변경분만 */
  async contextUpdate(dispatchId: string) {
    const d = await this.stores.dispatch.read(dispatchId)
    if (!d) throw new Error(`dispatch not found: ${dispatchId}`)
    const productId = d.meta.product as string
    const changeId = d.meta.change as string
    const base = jl<{ artifacts: Array<{ id: string; revision: number }> }>(
      d.meta.handoff_revision_base,
      { artifacts: [] }
    )
    const changed: string[] = []
    for (const b of base.artifacts) {
      const a = await this.stores.artifact.read(b.id)
      const cur = (a?.meta.current_revision as number | undefined) ?? 0
      if (cur > b.revision) changed.push(`artifact ${b.id}: rev ${b.revision} → ${cur}`)
    }
    const allEvts = await this.timeline(productId, 200)
    const evts = allEvts
      .filter((e) => (e.ts as string) > (d.meta.created_at as string))
      .slice(0, 15)
    const change = await this.stores.change.read(changeId)
    const md = [
      '# Context Update',
      '',
      `Previous: ${dispatchId} · Change: ${changeId}`,
      `Current change status: ${change?.meta.status ?? '?'}`,
      '',
      '## Changed Artifacts',
      ...(changed.length ? changed.map((c) => `- ${c}`) : ['- (none)']),
      '',
      '## New Requirements / History since dispatch',
      ...(evts.length ? evts.map((e) => `- ${e.ts}: ${e.title}`) : ['- (none)']),
      '',
      '## Required Action',
      '현재 구현 상태와 비교하여 필요한 변경만 적용한다. Scope 변경이 필요하면 Proposal 을 생성한다.',
    ].join('\n')
    return {
      dispatch: dispatchId,
      markdown: md,
      changed_artifacts: changed.length,
      events: evts.length,
    }
  }

  // ---- Handoff §36 full sections ------------------------------------------
  async generateHandoff(
    productId: string,
    changeId: string,
    artifactRefs?: Array<{ id: string; revision: number }>,
    extraInstruction?: string
  ) {
    const product = await this.stores.product.read(productId)
    if (!product) throw new Error(`product not found: ${productId}`)
    const change = await this.stores.change.read(changeId)
    if (!change) throw new Error(`change not found: ${changeId}`)

    const allReleasesForHandoff = await this.stores.release.list()
    const releaseCount = allReleasesForHandoff.filter((r) => r.meta.product === productId).length
    const [caps, decisions, refs, rdy, hist, arts] = await Promise.all([
      this.capabilities(productId),
      this.stores.decision
        .list()
        .then((ds) => ds.filter((d) => d.meta.product === productId && d.meta.status === 'ACTIVE')),
      this.references(productId),
      this.readiness(productId),
      this.timeline(productId, 10),
      Promise.all(
        (artifactRefs ?? []).map(async (r) => ({
          ...r,
          doc: await this.stores.artifact.read(r.id),
        }))
      ),
    ])
    const L: string[] = []
    L.push('---')
    L.push(
      `product_os:`,
      `  service: xita`,
      `  product: ${productId}`,
      `  change: ${changeId}`,
      `  generated_at: ${new Date().toISOString()}`
    )
    L.push('---', '', '# Agent Handoff', '')
    /*
     * Mission Card (handoff 상단 5-섹션 요약)
     * 변경 전 정책: §36 섹션이 곧 프롬프트 — Goal/금지사항/완료조건이 본문 깊숙이 흩어짐
     * 변경 후 정책: Devin playbook/Conductor 세션 모델 벤치마크 — 에이전트가 먼저 읽는
     *   Goal / Acceptance(postconditions) / Forbidden / Needs From User / Snapshot 5블록 선두 배치
     * 변경 이유: 에이전트 실패의 주원인은 '작업 범위 오해'. 머신리더블 1페이지 계약으로 감소
     * 영향 범위: generateHandoff/buildThis/Swift handoff preview 모두 동일 구조여야 함(Rust 측 병행 구현)
     */
    const wm = await loadWorkspaceMeta()
    const goalLine = String(change.meta.intent ?? change.meta.name ?? changeId)
    const acceptance = (rdy.blockers ?? []).slice(0, 6)
    L.push('## Mission Card', '')
    L.push(`**Goal** — ${goalLine}`)
    L.push(
      `**Acceptance** — ${acceptance.length ? '' : '(차단 없음)'}`,
      ...acceptance.map((b) => `\n- [ ] ${b}`)
    )
    L.push(
      `**Forbidden (손대지 마)** — ${String(change.meta.non_goals ?? product.meta.out_of_scope ?? '명시 없음 — 결정 필요 시 중단하고 질문')}`
    )
    L.push(`**Needs From User** — ${String(change.meta.open_questions ?? '없음')}`)
    L.push(
      `**Snapshot** — workspace_rev ${wm.workspace_revision} · ${new Date().toISOString()} · 검증 가능해야 dispatch 유효(Devin 원칙)`,
      ''
    )
    L.push('---', '')
    L.push('## Product', `${product.meta.name} · ${product.meta.version ?? '-'}`, '')
    L.push('## Change', `${change.meta.name ?? changeId}`, '')
    L.push('## Intent', String(change.meta.intent ?? '-'), '')
    L.push('## Goal', String(change.meta.goal ?? '-'), '')
    L.push(
      '## Current Product State',
      `readiness ${rdy.overall}% · capabilities ${caps.filter((c) => c.meta.status === 'active').length} active · releases ${releaseCount}`,
      rdy.blockers.length ? `blockers: ${rdy.blockers.join('; ')}` : '',
      ''
    )
    L.push('## Context', String(change.meta.context ?? '-'), '')
    L.push('## Constraints', String(change.meta.constraints ?? '-'), '')
    L.push('## Scope', String(change.meta.scope ?? '-'), '')
    L.push('## Relevant Capabilities')
    for (const c of caps.filter((x) => x.meta.status === 'active')) L.push(`- ${c.meta.name}`)
    if (!caps.length) L.push('- (none)')
    L.push('')
    L.push('## Relevant Decisions')
    for (const dd of decisions) L.push(`- ${dd.meta.title}: ${dd.meta.decision ?? ''}`)
    if (!decisions.length) L.push('- (none)')
    L.push('')
    L.push('## Relevant History')
    for (const h of hist.slice(0, 8)) L.push(`- ${h.ts}: ${h.title}`)
    L.push('')
    L.push('## Acceptance Criteria', String(change.meta.acceptance ?? '-'), '')
    L.push('## References')
    for (const r of refs)
      L.push(`- [${r.meta.name}](${r.meta.url ?? '#'}) (${r.meta.provider}/${r.meta.kind})`)
    if (!refs.length) L.push('- (none)')
    if (arts.length) {
      L.push('', '## Attached Artifacts')
      for (const a of arts)
        L.push(`- ${a.doc?.meta.name ?? a.id} (dispatched at revision ${a.revision})`)
    }
    L.push(
      '',
      '## Requested Work',
      extraInstruction ?? '이 Change 를 위 Context 기준으로 완료하라.',
      ''
    )
    L.push('## Agent Rules')
    L.push(
      '- Scope 변경이 필요하면 Proposal 을 생성한다. (POST /v4/changes/' +
        changeId +
        '/proposals 형태)'
    )
    L.push('- 중요 Architecture 변경을 임의로 확정하지 않는다.')
    L.push('- 완료 후 Agent Result 계약(§93)으로 결과를 보고한다.')
    return { product: productId, change: changeId, markdown: L.join('\n') }
  }

  // ---- Portfolio level (§7/§81/§99/§102/§104/§64) ---------------------------
  async needsYou(productId?: string): Promise<NeedsYouItem[]> {
    const items: NeedsYouItem[] = []
    const [changes, proposals, rdyAll, conflictsRaw, driftProducts] = await Promise.all([
      this.stores.change.list(),
      this.stores.proposal.list(),
      Promise.all(this.products0().map((p) => this.readiness(p.id))),
      this.readConflicts(),
      this.stores.artifact.list(),
    ])
    void rdyAll
    for (const c of changes) {
      const st = String(c.meta.status ?? '')
      const pid = String(c.meta.product ?? '')
      if (productId && pid !== productId) continue
      if (st === 'REVIEW')
        items.push({
          type: 'REVIEW',
          priority: 'HIGH',
          product: pid,
          title: `${c.meta.name ?? c.id} — Review 대기`,
          summary: String(c.meta.goal ?? ''),
          ref: { kind: 'change', id: c.id },
        })
      if (st === 'SHIP_READY')
        items.push({
          type: 'RELEASE',
          priority: 'CRITICAL',
          product: pid,
          title: `${c.meta.name ?? c.id} — Ship 승인 대기`,
          summary: 'Release 승인 필요',
          ref: { kind: 'change', id: c.id },
        })
    }
    for (const p of proposals) {
      if (String(p.meta.status) !== 'pending') continue
      const pid = String(p.meta.product ?? '')
      if (productId && pid !== productId) continue
      const kind = String(p.meta.kind ?? 'DIRECTION').toUpperCase()
      const t = (
        ['DIRECTION', 'SCOPE', 'ARCHITECTURE', 'UX', 'DECISION'].includes(kind) ? kind : 'DIRECTION'
      ) as NeedsYouItem['type']
      items.push({
        type: t,
        priority:
          String(p.meta.severity) === 'CRITICAL'
            ? 'CRITICAL'
            : String(p.meta.severity) === 'HIGH'
              ? 'HIGH'
              : 'NORMAL',
        product: pid,
        title: String(p.meta.name ?? p.id),
        summary: String(p.meta.proposal ?? ''),
        ref: { kind: 'proposal', id: p.id },
      })
    }
    for (const c of conflictsRaw) {
      items.push({
        type: 'SYNC_CONFLICT',
        priority: 'HIGH',
        product: String((c as any).target_id ?? ''),
        title: `동기화 충돌: ${(c as any).target_id}`,
        summary: (c as any).message ?? '',
        ref: { kind: 'conflict', id: String((c as any).op_id) },
      })
    }
    for (const a of driftProducts) {
      const cur = (a.meta.current_revision as number | undefined) ?? 0
      const disp = a.meta.last_dispatched_revision as number | undefined
      if (disp !== undefined && cur > disp) {
        const delta = cur - disp
        items.push({
          type: 'CONTEXT_DRIFT',
          priority: delta > 2 ? 'HIGH' : 'NORMAL',
          product: String(a.meta.product ?? ''),
          title: `Context drift: ${a.meta.name ?? a.id} (${disp}→${cur})`,
          summary: 'Agent 에 전달된 Context 가 오래됐습니다',
          ref: { kind: 'artifact', id: a.id },
        })
      }
    }
    // SHIP_BLOCKER: readiness BLOCKED items
    for (const p of this.products0()) {
      if (productId && p.id !== productId) continue
      const r = await this.readiness(p.id)
      for (const b of r.blockers) {
        items.push({
          type: 'SHIP_BLOCKER',
          priority: 'HIGH',
          product: p.id,
          title: `Blocker — ${b}`,
          summary: 'Definition of Ship 항목이 막혀있음',
          ref: { kind: 'readiness', id: p.id },
        })
      }
    }
    /* WHY 게이트 (community wave2 P6: "티켓이 실행 지시로 전락 → 의문 소멸")
     * BUILD 이상 단계의 Change에 intent/goal/why 중 아무것도 없으면 사람이 채워야 할 일로 승격 */
    for (const c of changes) {
      const st = String(c.meta.status ?? '')
      if (!['BUILD', 'REVIEW', 'SHIP_READY'].includes(st)) continue
      if (productId && String(c.meta.product ?? '') !== productId) continue
      /* 변경 전 정책: frontmatter intent/goal/why 만 확인 — createChange 는 intent·goal 을 본문 섹션에 쓰므로
       *   목적을 적어도 항상 'WHY 누락' 으로 잡혔다.
       * 변경 후 정책: 본문의 'Problem / Intent'·'Goal' 섹션과 '메모'(웹/CLI 작업 탭) 도 목적으로 인정.
       * 영향 범위: needs-you 의 SCOPE(WHY 누락) 항목 수. 목적이 정말 없는 BUILD 이상 할 일은 그대로 잡힌다. */
      const why =
        `${c.meta.intent ?? ''}${c.meta.goal ?? ''}${c.meta.why ?? ''}${bodyWhy(c.body)}`.trim()
      if (why) continue
      items.push({
        type: 'SCOPE',
        priority: 'NORMAL',
        product: String(c.meta.product ?? ''),
        title: `WHY 누락 — ${String(c.meta.name ?? c.id)}`,
        summary: `${st} 단계인데 목적(intent)이 없습니다. 만들 이유를 한 줄만.`,
        ref: { kind: 'change', id: c.id },
      })
    }
    /* dispatch 대기열 승격 (research wave1 M3: Needs Attention 1급 상태)
     * AWAITING_INPUT/RESULT_READY/FAILED 상태의 dispatch는 '사람이 결정할 일' */
    const disps = await this.stores.dispatch.list()
    for (const d of disps) {
      if (productId && String(d.meta.product ?? '') !== productId) continue
      const st = String(d.meta.status ?? '').toUpperCase()
      if (!['AWAITING_INPUT', 'RESULT_READY', 'FAILED'].includes(st)) continue
      items.push({
        type: 'AGENT_WAITING',
        priority: st === 'FAILED' ? 'HIGH' : st === 'AWAITING_INPUT' ? 'CRITICAL' : 'NORMAL',
        product: String(d.meta.product ?? ''),
        title: `에이전트 ${st === 'RESULT_READY' ? '결과 리뷰 대기' : st === 'FAILED' ? '실패 — 판단 필요' : '질문 — 입력 대기'}`,
        summary: String(d.meta.change ?? d.id),
        ref: { kind: 'dispatch', id: d.id },
      })
    }
    const rank: Record<string, number> = { LOW: 0, NORMAL: 1, HIGH: 2, CRITICAL: 3 }
    return items.sort((a, b) => rank[b.priority] - rank[a.priority])
  }

  private products0(): StoredDoc[] {
    return this._productsCache ?? []
  }
  private _productsCache: StoredDoc[] | null = null
  async prepareCache() {
    this._productsCache = await this.stores.product.list()
  }

  /** §7 Closest to Ship */
  async closestToShip() {
    const changes = await this.stores.change.list()
    const active = changes.filter((c) => ACTIVE.includes(String(c.meta.status)))
    const order: Record<string, number> = { SHIP_READY: 0, REVIEW: 1, BUILD: 2, PLAN: 3, IDEA: 4 }
    return active
      .sort((a, b) => (order[String(a.meta.status)] ?? 9) - (order[String(b.meta.status)] ?? 9))
      .slice(0, 8)
      .map((c) => ({
        id: c.id,
        product: c.meta.product ?? null,
        name: (c.meta.name as string) ?? (c.meta.title as string) ?? c.id,
        status: c.meta.status ?? null,
        blockers: 0,
      }))
  }

  /** §99 workbench 정렬 */
  async workbenchBoard() {
    const all = await this.stores.workbench.list()
    const now = Date.now()
    const withAge = all.map((w) => {
      const upd = Date.parse(String(w.meta.updated_at ?? 0)) || now
      const ageDays = (now - upd) / 86400_000
      return { w, ageDays }
    })
    const byScore = (w: StoredDoc, ageDays: number) => {
      const st = String(w.meta.status)
      if (st === 'ready_to_promote') return 0
      if (st === 'mature') return 1
      if (ageDays > 30) return 3
      return 2
    }
    return withAge
      .sort(
        (a, b) =>
          byScore(a.w, a.ageDays) - byScore(b.w, b.ageDays) || (a.ageDays < b.ageDays ? -1 : 1)
      )
      .map(({ w, ageDays }) => ({
        id: w.id,
        name: w.meta.name,
        status: w.meta.status,
        bucket:
          String(w.meta.status) === 'ready_to_promote'
            ? 'ready'
            : ageDays > 30
              ? 'stale'
              : 'active',
        age_days: Math.round(ageDays),
        stale: ageDays > 30,
      }))
  }

  async setWorkbenchStatus(id: string, status: string) {
    const cur = await this.stores.workbench.read(id)
    if (!cur) throw new Error(`workbench not found: ${id}`)
    const meta: Record<string, unknown> = { ...cur.meta, status }
    if (status === 'archived') meta.archived_at = new Date().toISOString()
    await this.stores.workbench.upsert(id, meta, cur.body, (cur.revision ?? 0) + 1)
    return this.stores.workbench.read(id)
  }

  /** §104 Product Biography */
  async biography(productId: string) {
    const p = await this.stores.product.read(productId)
    if (!p) throw new Error(`product not found: ${productId}`)
    const changes = await this.stores.change.list()
    const mine = changes.filter((c) => c.meta.product === productId)
    const shipped = mine.filter((c) => c.meta.status === 'SHIPPED')
    const allDecisions = await this.stores.decision.list()
    const decisions = allDecisions.filter((d) => d.meta.product === productId)
    const allReleases = await this.stores.release.list()
    const releases = allReleases.filter((r) => r.meta.product === productId)
    const rdy = await this.readiness(productId)
    const caps = await this.capabilities(productId)
    const L = [
      '# Product Biography',
      '',
      '## Identity',
      `${p.meta.name} · ${p.meta.version ?? '-'} · ${p.meta.status ?? ''}`,
      (p.meta.description as string) ?? '',
      '',
      '## Why It Exists',
      (p.meta.current_goal as string) ?? '-',
      '',
      '## Current State',
      `Readiness ${rdy.overall}% · active capabilities ${caps.filter((c) => c.meta.status === 'active').length}`,
      '',
      '## Major Evolution',
      ...shipped
        .slice(0, 10)
        .map((c) => `- ${c.meta.name ?? c.id} (shipped ${c.meta.shipped_at ?? ''})`),
      '',
      '## Major Decisions',
      ...decisions.map((d) => `- ${d.meta.title}: ${d.meta.decision ?? ''}`),
      '',
      '## Current Direction',
      (p.meta.direction as string) ?? '-',
      '',
      '## Active Changes',
      ...mine
        .filter((c) => ACTIVE.includes(String(c.meta.status)))
        .map((c) => `- ${c.meta.name ?? c.id} [${c.meta.status}]`),
      '',
      '## Known Risks',
      ...(rdy.blockers.length ? rdy.blockers.map((b) => `- ${b}`) : ['- (recorded blockers none)']),
      `- Releases: ${releases.length}`,
    ]
    return L.join('\n')
  }

  /** §102 Returning user */
  async sinceVisit(productId: string, lastVisitIso: string) {
    const evts = await this.timeline(productId, 500)
    const after = evts.filter((e) => String(e.ts) > lastVisitIso)
    const allReleases = await this.stores.release.list()
    const releases = allReleases.filter(
      (r) => r.meta.product === productId && String(r.meta.updated_at) > lastVisitIso
    )
    return {
      since: lastVisitIso,
      events: after.length,
      releases: releases.length,
      summary: after.slice(0, 8).map((e) => `${e.title}`),
    }
  }

  /** §64 Search (MVP: doc 전체 naive scan) */
  async search(q: string) {
    const needle = q.toLowerCase()
    const hits: Array<{ type: string; id: string; name: string; snippet: string }> = []
    for (const t of ALL) {
      const docs = await this.stores[t].list()
      for (const d of docs) {
        const hay = `${d.id} ${d.meta.name ?? ''} ${d.meta.title ?? ''} ${d.body}`.toLowerCase()
        if (needle && hay.includes(needle)) {
          const i = d.body.toLowerCase().indexOf(needle)
          const snippet =
            i >= 0
              ? d.body.slice(Math.max(0, i - 40), i + 80).replace(/\n/g, ' ')
              : d.body.slice(0, 80)
          hits.push({
            type: t,
            id: d.id,
            name: String(d.meta.name ?? d.meta.title ?? d.id),
            snippet,
          })
        }
        if (hits.length > 50) return hits
      }
    }
    return hits
  }

  async listDocs(type: DocType, productId?: string) {
    const all = await this.stores[type].list()
    return productId ? all.filter((d) => (d.meta.product as string) === productId) : all
  }

  private async readConflicts() {
    const raw = await readText(path.join(metaDir(), 'conflicts.jsonl'))
    if (!raw) return []
    return raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        try {
          const [opId, targetId, base, canon, kind] = l.split('|')
          return {
            op_id: opId,
            target_id: targetId,
            base_revision: Number(base),
            canonical_revision: Number(canon),
            kind,
            message: `stale ${base} vs ${canon}`,
          }
        } catch {
          return null
        }
      })
      .filter(Boolean)
  }

  /** §37 Ready-for-Agent pipeline 상태 — artifact revision 에 기록 */
  async setArtifactReviewStatus(artifactId: string, reviewStatus: string) {
    const a = await this.stores.artifact.read(artifactId)
    if (!a) throw new Error(`artifact not found: ${artifactId}`)
    await this.stores.artifact.upsert(
      artifactId,
      { ...a.meta, review_status: reviewStatus },
      a.body,
      (a.revision ?? 0) + 1
    )
    await this.recordEvent({
      eventType: 'ARTIFACT_REVIEW',
      product: (a.meta.product as string) ?? null,
      title: `${artifactId} review_status -> ${reviewStatus}`,
    })
    return this.stores.artifact.read(artifactId)
  }

  /** §31/32 Artifact Impact Analysis (rule-based, v4 이관) */
  async analyzeImpact(content: string) {
    const terms = content
      .toLowerCase()
      .replace(/[.,!?;:()\[\]{}"'`#*-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 3)
    const arts = await this.stores.artifact.list()
    const out = []
    for (const a of arts) {
      const body = `${a.id} ${a.meta.name ?? ''} ${a.body}`.toLowerCase()
      const matched = terms.filter((t) => body.includes(t))
      if (matched.length) {
        out.push({
          artifact: a.id,
          name: a.meta.name ?? a.id,
          current_revision: a.meta.current_revision,
          matched: matched.slice(0, 8),
          suggested_action: matched.length >= 2 ? 'PATCH_EXISTING' : 'REVIEW',
        })
      }
    }
    return {
      suggested_updates: out.sort((x, y) => y.matched.length - x.matched.length).slice(0, 8),
      created_new_insight: out.length === 0,
    }
  }
}

/* 할 일 본문의 '## 메모' 섹션 — 웹/CLI 에서 짧게 적는 설명 */
const NOTE_RE = /\n## 메모\n\n([\s\S]*?)(?=\n## |$)/

export function changeNote(body: string): string {
  return (body.match(NOTE_RE)?.[1] ?? '').trim()
}

export function setChangeNote(body: string, note: string): string {
  const text = note.trim()
  if (NOTE_RE.test(body)) {
    return text
      ? body.replace(NOTE_RE, `\n## 메모\n\n${text}\n`)
      : body.replace(NOTE_RE, '').trimEnd() + '\n'
  }
  return text ? `${body.trimEnd()}\n\n## 메모\n\n${text}\n` : body
}

/** 할 일 본문에서 목적으로 볼 수 있는 섹션 내용 (Problem / Intent · Goal · 메모) */
export function bodyWhy(body: string): string {
  const out: string[] = []
  for (const h of ['Problem / Intent', 'Goal', '메모']) {
    const m = body.match(
      new RegExp(`\\n## ${h.replace(/[/]/g, '\\/')}\\n\\n([\\s\\S]*?)(?=\\n## |$)`)
    )
    if (m?.[1]?.trim()) out.push(m[1].trim())
  }
  return out.join(' ')
}
