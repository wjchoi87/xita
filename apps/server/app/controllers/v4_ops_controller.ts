import type { HttpContext } from '@adonisjs/core/http'
import { V4Ops } from '#v4/ops'
import type { DocType } from '#v4/workspace'
import vine from '@vinejs/vine'

const ops = new V4Ops()

const capabilityValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2),
    parentId: vine.string().optional(),
    description: vine.string().optional(),
  })
)
const changeCapabilityValidator = vine.compile(
  vine.object({
    capabilityId: vine.string(),
    action: vine.enum(['CREATE', 'MODIFY', 'DEPRECATE', 'REMOVE']),
  })
)
const readinessPatchValidator = vine.compile(
  vine.object({
    kind: vine.string(),
    item: vine.string(),
    status: vine.enum(['PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'NA']).optional(),
    progress: vine.number().min(0).max(100).optional(),
    note: vine.string().optional(),
  })
)
const proposalValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(2),
    kind: vine.string().optional(),
    problem: vine.string().optional(),
    proposal: vine.string(),
    reason: vine.string().optional(),
    impact: vine.array(vine.string()).optional(),
    alternatives: vine.array(vine.string()).optional(),
    recommendation: vine.string().optional(),
    severity: vine.string().optional(),
    actor: vine.string().optional(),
  })
)
const resolveValidator = vine.compile(
  vine.object({ status: vine.enum(['approved', 'rejected', 'modified']) })
)
const agentResultValidator = vine.compile(
  vine.object({
    summary: vine.string(),
    implemented: vine.array(vine.string()).optional(),
    changedFiles: vine.array(vine.string()).optional(),
    tests: vine.array(vine.string()).optional(),
    decisions: vine.array(vine.string()).optional(),
    deviations: vine.array(vine.string()).optional(),
    capabilityChanges: vine
      .array(vine.object({ id: vine.string(), action: vine.string() }))
      .optional(),
    knownIssues: vine.array(vine.string()).optional(),
    suggestedFollowups: vine.array(vine.string()).optional(),
  })
)
const referenceValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(2),
    provider: vine.string(),
    url: vine.string().optional(),
    kind: vine.enum(['reference', 'asset']).optional(),
    objectType: vine.string().optional(),
    purpose: vine.string().optional(),
    platform: vine.string().optional(),
    status: vine.string().optional(),
    change: vine.string().optional(),
  })
)
const dispatchValidator = vine.compile(
  vine.object({
    change: vine.string(),
    artifacts: vine.array(vine.object({ id: vine.string(), revision: vine.number() })).optional(),
    destination: vine.object({
      path: vine.string(),
      repo: vine.string().optional(),
      branch: vine.string().optional(),
      machine: vine.string().optional(),
    }),
    instruction: vine.string().optional(),
    mode: vine.enum(['send_files', 'send_and_start']),
  })
)

/**
 * v4 확장 도메인 REST — v0.3 MVP Scope 전체 표면.
 */
export default class V4OpsController {
  // ---- Capabilities --------------------------------------------------------
  async addCapability({ params, request, response }: HttpContext) {
    const p = await request.validateUsing(capabilityValidator)
    const doc = await ops.createCapability(params.id, p.name, {
      parentId: p.parentId,
      description: p.description,
    })
    return response.created({ data: doc })
  }
  async listCapabilities({ request }: HttpContext) {
    return { data: await ops.capabilities(request.input('product') || undefined) }
  }
  async attachCapabilityToChange({ params, request, response }: HttpContext) {
    const p = await request.validateUsing(changeCapabilityValidator)
    const change = await ops.stores.change.read(params.id)
    const data = await ops.attachCapabilityToChange(
      params.id,
      p.capabilityId,
      p.action,
      (change?.meta.product as string) ?? ''
    )
    return response.created({ data })
  }

  // ---- Readiness / Definition of Ship --------------------------------------
  async applyTemplate({ params, request, response }: HttpContext) {
    const productType = request.input('productType', 'MOBILE_SAAS')
    const data = await ops.applyShipTemplate(params.id, String(productType))
    return response.created({ data })
  }
  async getReadiness({ params }: HttpContext) {
    return { data: await ops.readiness(params.id) }
  }
  async patchReadiness({ params, request }: HttpContext) {
    const p = await request.validateUsing(readinessPatchValidator)
    const data = await ops.updateReadinessItem(params.id, p.kind, p.item, {
      status: p.status,
      progress: p.progress,
      note: p.note,
    })
    return { data }
  }

  // ---- Proposals -------------------------------------------------------------
  async createProposal({ params, request, response }: HttpContext) {
    const p = await request.validateUsing(proposalValidator)
    const change = await ops.stores.change.read(params.id)
    const data = await ops.createProposal({
      product: (change?.meta.product as string) ?? String(request.input('product') ?? ''),
      change: params.id,
      title: p.title,
      kind: p.kind,
      problem: p.problem,
      proposal: p.proposal,
      reason: p.reason,
      impact: p.impact,
      alternatives: p.alternatives,
      recommendation: p.recommendation,
      severity: p.severity,
      actor: p.actor ?? 'agent',
    })
    return response.created({ data })
  }
  async listProposals({ request }: HttpContext) {
    return { data: await ops.listDocs('proposal', request.input('product') || undefined) }
  }
  async resolveProposal({ params, request }: HttpContext) {
    const p = await request.validateUsing(resolveValidator)
    return { data: await ops.resolveProposal(params.id, p.status) }
  }

  // ---- Agent result / Review / Approval --------------------------------------
  async agentResult({ params, request, response }: HttpContext) {
    const p = await request.validateUsing(agentResultValidator)
    const data = await ops.importAgentResult(params.id, {
      summary: p.summary,
      implemented: p.implemented,
      changed_files: p.changedFiles,
      tests: p.tests,
      decisions: p.decisions,
      deviations: p.deviations,
      capability_changes: p.capabilityChanges,
      known_issues: p.knownIssues,
      suggested_followups: p.suggestedFollowups,
    })
    return response.created({ data })
  }
  async listReviews({ request }: HttpContext) {
    return { data: await ops.listDocs('review', request.input('product') || undefined) }
  }
  async approve({ params }: HttpContext) {
    return { data: await ops.approveChange(params.id) }
  }
  async requestChanges({ params, request }: HttpContext) {
    return { data: await ops.requestChangesOn(params.id, request.input('note')) }
  }

  // ---- References / Assets ----------------------------------------------------
  async addReference({ params, request, response }: HttpContext) {
    const p = await request.validateUsing(referenceValidator)
    const data = await ops.createReference({
      product: params.id,
      change: p.change ?? null,
      title: p.title,
      provider: p.provider,
      url: p.url,
      kind: p.kind,
      object_type: p.objectType,
      purpose: p.purpose,
      platform: p.platform,
      status: p.status,
    })
    return response.created({ data })
  }
  async observeGithub({ params, request, response }: HttpContext) {
    const repo = String(request.input('repo') ?? '')
    if (!/^[^/]+\/[^/]+$/.test(repo)) {
      return response.badRequest({ message: 'repo must be owner/name' })
    }
    try {
      const data = await ops.observeGitHub(params.id, repo)
      return response.created({ data })
    } catch (e) {
      return response.badRequest({ message: (e as Error).message })
    }
  }

  async observeLinear({ params, request, response }: HttpContext) {
    try {
      const teamId = request.input('teamId') ? String(request.input('teamId')) : undefined
      const data = await ops.observeLinear(params.id, teamId)
      return response.created({ data })
    } catch (e) {
      return response.badRequest({ message: (e as Error).message })
    }
  }

  async listReferences({ params, request }: HttpContext) {
    const kind = request.input('kind') === 'asset' ? 'asset' : undefined
    return { data: await ops.references(params.id, kind) }
  }

  // ---- Dispatch / Build This / Context Update ----------------------------------
  async buildThis({ params, request, response }: HttpContext) {
    const p = await request.validateUsing(dispatchValidator)
    const data = await ops.buildThis({
      product: params.id,
      change: p.change,
      artifactRevisions: p.artifacts,
      destination: p.destination,
      instruction: p.instruction,
      mode: p.mode,
    })
    return response.created({
      data: {
        id: data.id,
        handoff_file: data.meta.handoff_file,
        branch_created: data.meta.branch_created,
        agent_started: data.meta.agent_started,
      },
    })
  }
  async listDispatches({ request }: HttpContext) {
    return { data: await ops.dispatches(request.input('product') || undefined) }
  }
  async contextUpdate({ params }: HttpContext) {
    return { data: await ops.contextUpdate(params.id) }
  }

  // ---- Handoff / Artifact review / Impact ---------------------------------------
  async handoff({ params, request }: HttpContext) {
    const arts = request.input('artifacts')
      ? JSON.parse(String(request.input('artifacts')))
      : undefined
    const data = await ops.generateHandoff(
      params.product,
      params.change,
      arts,
      request.input('instruction')
    )
    return { data }
  }
  async artifactReviewStatus({ params, request }: HttpContext) {
    const status = String(request.input('status'))
    return { data: await ops.setArtifactReviewStatus(params.id, status) }
  }
  async analyzeImpact({ request }: HttpContext) {
    const content = String(request.input('content') ?? '')
    return { data: await ops.analyzeImpact(content) }
  }

  // ---- Figma / Decisions -----------------------------------------------------------
  async observeFigma({ params, request, response }: HttpContext) {
    const fileKey = String(request.input('fileKey') ?? '')
    if (!fileKey) return response.badRequest({ message: 'fileKey required' })
    try {
      return response.created({ data: await ops.observeFigma(params.id, fileKey) })
    } catch (e) {
      return response.badRequest({ message: (e as Error).message })
    }
  }
  async listDecisions({ request }: HttpContext) {
    return { data: await ops.decisions(request.input('product') || undefined) }
  }
  async addDecision({ params, request, response }: HttpContext) {
    const title = String(request.input('title') ?? '')
    if (title.length < 2) return response.badRequest({ message: 'title required' })
    const options =
      typeof request.input('options') === 'string'
        ? String(request.input('options'))
            .split(',')
            .map((x: string) => x.trim())
            .filter(Boolean)
        : []
    const data = await ops.addDecisionRest({
      product: params.id,
      title,
      decision: request.input('decision') ? String(request.input('decision')) : undefined,
      reason: request.input('reason') ? String(request.input('reason')) : undefined,
      options,
      change: request.input('change') ? String(request.input('change')) : undefined,
    })
    return response.created({ data })
  }
  async supersedeDecision({ params, request, response }: HttpContext) {
    const by = String(request.input('by') ?? '')
    if (!by) return response.badRequest({ message: 'by (new decision id) required' })
    return { data: await ops.supersedeDecision(params.id, by) }
  }

  // ---- Releases / Roadmap / Health -----------------------------------------------
  async createRelease({ params, request, response }: HttpContext) {
    const name = String(request.input('name') ?? '')
    if (name.length < 1) return response.badRequest({ message: 'name required' })
    const data = await ops.createRelease({
      product: params.id,
      name,
      notes: request.input('notes'),
    })
    return response.created({ data })
  }
  async listReleases({ request }: HttpContext) {
    return { data: await ops.releases(request.input('product') || undefined) }
  }
  async releaseStatus({ params, request }: HttpContext) {
    return { data: await ops.setReleaseStatus(params.id, String(request.input('status'))) }
  }
  async releaseAddChange({ params, request }: HttpContext) {
    const change = String(request.input('change') ?? '')
    if (!change) return { data: null }
    return { data: await ops.addChangeToRelease(params.id, change) }
  }
  async releaseReadiness({ params }: HttpContext) {
    return { data: await ops.releaseReadiness(params.id) }
  }
  async roadmap({ params }: HttpContext) {
    return { data: await ops.roadmap(params.id) }
  }
  async setRoadmapPriority({ params, request }: HttpContext) {
    return { data: await ops.setRoadmapPriority(params.id, String(request.input('priority'))) }
  }
  async health({ params }: HttpContext) {
    return { data: await ops.productHealth(params.id) }
  }

  // ---- Milestones --------------------------------------------------------------
  async createMilestone({ params, request, response }: HttpContext) {
    const name = String(request.input('name') ?? '')
    if (name.length < 2) return response.badRequest({ message: 'name required' })
    const data = await ops.createMilestone({
      product: params.id,
      name,
      targetDate: request.input('targetDate') ? String(request.input('targetDate')) : undefined,
      description: request.input('description') ? String(request.input('description')) : undefined,
    })
    return response.created({ data })
  }
  async listMilestones({ request }: HttpContext) {
    return { data: await ops.milestones(request.input('product') || undefined) }
  }
  async assignMilestone({ params, request }: HttpContext) {
    const ms =
      request.input('milestone') === 'none' ? null : String(request.input('milestone') ?? '')
    if (!ms && request.input('milestone') !== 'none') return { data: null }
    return { data: await ops.assignMilestone(params.id, ms) }
  }
  async milestoneProgress({ params }: HttpContext) {
    return { data: await ops.milestoneProgress(params.id) }
  }
  async productWork({ params }: HttpContext) {
    return { data: await ops.productWork(params.id) }
  }
  async editChange({ params, request }: HttpContext) {
    const title = request.input('title')
    const priority = request.input('priority')
    const note = request.input('note')
    if (priority && !['low', 'normal', 'high', 'critical'].includes(String(priority).toLowerCase()))
      return { data: null, error: 'priority 는 low|normal|high|critical' }
    return {
      data: await ops.editChange(params.id, {
        title: title !== undefined ? String(title) : undefined,
        priority: priority ? String(priority) : undefined,
        note: note !== undefined ? String(note) : undefined,
      }),
    }
  }
  async milestoneStatus({ params, request }: HttpContext) {
    return { data: await ops.setMilestoneStatus(params.id, String(request.input('status'))) }
  }

  // ---- AI: Historian / Ask / Patch (§57/§18/§31) ----------------------------------
  async summarize({ request }: HttpContext) {
    const product = request.input('product') ? String(request.input('product')) : undefined
    const days = Number(request.input('days', 90))
    return { data: await ops.summarize(product, days) }
  }
  async ask({ request, response }: HttpContext) {
    const q = String(request.input('q') ?? '')
    if (!q) return response.badRequest({ message: 'q required' })
    return { data: await ops.ask(q) }
  }
  async suggestPatch({ params, request, response }: HttpContext) {
    const insight = String(request.input('insight') ?? '')
    if (insight.length < 4) return response.badRequest({ message: 'insight required' })
    const data = await ops.suggestArtifactPatch(params.id, insight)
    return response.created({ data })
  }
  async applyPatch({ params }: HttpContext) {
    return { data: await ops.applyPatch(params.id) }
  }
  async dismissPatch({ params }: HttpContext) {
    return { data: await ops.dismissPatch(params.id) }
  }
  async listPatches({ request }: HttpContext) {
    return { data: await ops.patches(request.input('artifact') || undefined) }
  }

  // ---- Portfolio ---------------------------------------------------------------
  async needsYou({ request }: HttpContext) {
    await ops.prepareCache()
    const items = await ops.needsYou(request.input('product') || undefined)
    return { data: items, meta: { count: items.length } }
  }
  async closest() {
    return { data: await ops.closestToShip() }
  }
  async workbenchBoard() {
    await ops.prepareCache()
    return { data: await ops.workbenchBoard() }
  }
  async workbenchStatus({ params, request }: HttpContext) {
    return { data: await ops.setWorkbenchStatus(params.id, String(request.input('status'))) }
  }
  async timeline({ request }: HttpContext) {
    return {
      data: await ops.timeline(
        request.input('product') || undefined,
        Number(request.input('limit', 30))
      ),
    }
  }
  async biography({ params }: HttpContext) {
    return { data: { markdown: await ops.biography(params.id) } }
  }
  async sinceVisit({ params, request }: HttpContext) {
    return {
      data: await ops.sinceVisit(
        params.id,
        String(request.input('since') ?? new Date(0).toISOString())
      ),
    }
  }
  async search({ request }: HttpContext) {
    return { data: await ops.search(String(request.input('q') ?? '')) }
  }
  async docsOfTypeArtifact({ request }: HttpContext) {
    return { data: await ops.listDocs('artifact', request.input('product') || undefined) }
  }
  async docsOfType({ params, request }: HttpContext) {
    const allowed = [
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
    if (!allowed.includes(params.type)) {
      return { data: [], meta: { error: 'unknown type' } }
    }
    return {
      data: await ops.listDocs(params.type as DocType, request.input('product') || undefined),
    }
  }

  async roadmapScore({ params, request, response }: HttpContext) {
    const m = ['s_pop', 's_need', 's_strat', 's_effort', 's_conf'].map((k) =>
      Number(request.input(k))
    )
    if (m.some((v) => !Number.isFinite(v) || v < 0 || v > 10)) {
      return response.badRequest({ message: 's_pop s_need s_strat s_effort s_conf each 0-10' })
    }
    const data = await ops.scoreChange(params.id, {
      pop: m[0],
      need: m[1],
      strat: m[2],
      effort: m[3],
      conf: m[4],
    })
    return { data, slice: request.input('slice') ?? null }
  }

  // ---- Insight(1급 관찰/가설) + dispatch 런 루프 (research wave1 반영) -------------
  async createInsight({ request, response }: HttpContext) {
    const title = String(request.input('title') ?? '')
    const content = String(request.input('content') ?? '')
    if (title.length < 2 || content.length < 4)
      return response.badRequest({ message: 'title(2+)/content(4+) required' })
    const data = await ops.createInsight({
      product: String(request.input('product') ?? ''),
      title,
      content,
      kind: request.input('kind') ? String(request.input('kind')) : undefined,
      confidence: request.input('confidence') ? Number(request.input('confidence')) : undefined,
      source: request.input('source') ? String(request.input('source')) : undefined,
      change: request.input('change') ? String(request.input('change')) : null,
      capability: request.input('capability') ? String(request.input('capability')) : null,
    })
    return response.created({ data })
  }
  async listInsights({ request }: HttpContext) {
    return { data: await ops.insights(request.input('product') || undefined) }
  }
  async insightStatus({ params, request }: HttpContext) {
    return { data: await ops.setInsightStatus(params.id, String(request.input('status'))) }
  }
  async updateDispatch({ params, request }: HttpContext) {
    const data = await ops.dispatchUpdate({
      id: params.id,
      status: request.input('status') ? String(request.input('status')) : undefined,
      note: request.input('note') ? String(request.input('note')) : undefined,
      result_ref: request.input('result_ref') ? String(request.input('result_ref')) : undefined,
    })
    return { data }
  }
}
