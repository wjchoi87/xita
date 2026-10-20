import type { HttpContext } from '@adonisjs/core/http'
import { V4Domain, allowedTransitions } from '#v4/domain'
import { V4Ops } from '#v4/ops'
import { aiStatus } from '#v4/ai'
import {
  aiChat,
  defaultConfig,
  normalizeConfig,
  routerStatus,
  saveConfig,
  usageSummary,
  validateConfig,
  type AIConfig,
} from '#v4/ai_router'
import { isLocalRequest } from '#portfolio/local_request'
import vine from '@vinejs/vine'

const domain = new V4Domain()
const ops = new V4Ops()

const createProductValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(120),
    description: vine.string().optional(),
    productionStatus: vine.string().optional(),
    version: vine.string().optional(),
    goal: vine.string().optional(),
    direction: vine.string().optional(),
  })
)

const createChangeValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(2).maxLength(200),
    intent: vine.string().optional(),
    goal: vine.string().optional(),
    context: vine.string().optional(),
    scope: vine.string().optional(),
    priority: vine.string().optional(),
    appetite: vine.enum(['small', 'cycle', 'multi']).optional(),
    appetite_weeks: vine.number().min(1).optional(),
    baseline: vine.string().optional(),
    rabbit_holes: vine.array(vine.string()).optional(),
    no_gos: vine.array(vine.string()).optional(),
    // 빠른 추가: 처음 상태(IDEA 에서 바로 전이)·마일스톤·메모
    status: vine.enum(['IDEA', 'PLAN', 'BUILD']).optional(),
    milestone: vine.string().optional(),
    note: vine.string().optional(),
  })
)

const transitionValidator = vine.compile(
  vine.object({
    lifecycle: vine.enum([
      'IDEA',
      'PLAN',
      'BUILD',
      'REVIEW',
      'SHIP_READY',
      'SHIPPED',
      'PAUSED',
      'CANCELLED',
    ]),
    note: vine.string().optional(),
  })
)

const createWorkbenchValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(2).maxLength(200),
    workType: vine.string().optional(),
    summary: vine.string().optional(),
    content: vine.string().optional(),
  })
)

const promoteValidator = vine.compile(
  vine.object({
    target: vine.enum(['product', 'change']),
    productId: vine.string().optional(),
    productName: vine.string().optional(),
    changeTitle: vine.string().optional(),
  })
)

/*
 * v0.4 Canonical Domain REST — canonical Markdown workspace 에 직접 쓰는 경로.
 * Legacy(PostgreSQL) REST(`/products` 등)와 별개로, v0.4 에서는 이 경로가 primary.
 */
export default class V4Controller {
  async status() {
    const meta = await domain.workspaceMeta()
    const needs = await domain.needsYou()
    return {
      data: {
        workspace_revision: meta.workspace_revision,
        last_updated: meta.last_updated,
        needsYouCount: needs.length,
      },
    }
  }

  async createProduct({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createProductValidator)
    const doc = await domain.createProduct({
      name: payload.name,
      description: payload.description ?? null,
      productionStatus: payload.productionStatus,
      version: payload.version,
      goal: payload.goal ?? null,
      direction: payload.direction ?? null,
    })
    return response.created({ data: doc })
  }

  async products() {
    return { data: await domain.products() }
  }

  async getProduct({ params }: HttpContext) {
    const data = await domain.getProduct(params.id)
    return { data }
  }

  /** Product 상태 투영 — active/shipped/artifacts 카운트 (Closest to Ship 성). */
  async productState({ params }: HttpContext) {
    return { data: await domain.productState(params.id) }
  }

  /** canonical Agent Handoff + Context Drift (v0.3 §35-36, §45-46 ↩). */
  async handoff({ params }: HttpContext) {
    const data = await domain.generateHandoff(params.product, params.change)
    return { data }
  }

  async contextDrift({ request }: HttpContext) {
    const productId = request.input('product')
    if (!productId) return { data: { error: 'product param required' } }
    return { data: await domain.detectContextDrift(productId) }
  }

  /** dispatch 시 Artifact 의 dispatched revision 기록 (context drift 기준). */
  async markDispatch({ params, request }: HttpContext) {
    const revision =
      request.input('revision') === undefined ? undefined : Number(request.input('revision'))
    const data = await domain.markArtifactDispatched(params.artifact, revision)
    return { data }
  }

  async createChange({ params, request, response }: HttpContext) {
    const payload = await request.validateUsing(createChangeValidator)
    const doc = await domain.createChange({
      productId: params.id,
      title: payload.title,
      intent: payload.intent ?? null,
      goal: payload.goal ?? null,
      context: payload.context ?? null,
      scope: payload.scope ?? null,
      priority: payload.priority,
      appetite: payload.appetite ?? null,
      appetiteWeeks: payload.appetite_weeks ?? null,
      baseline: payload.baseline ?? null,
      rabbitHoles: payload.rabbit_holes ?? null,
      noGos: payload.no_gos ?? null,
    })
    if (payload.status && payload.status !== 'IDEA')
      await domain.transitionChange(doc.id, payload.status, null)
    if (payload.milestone) await ops.assignMilestone(doc.id, payload.milestone)
    if (payload.note) await ops.editChange(doc.id, { note: payload.note })
    return response.created({ data: doc })
  }

  async transitionChange({ params, request, response }: HttpContext) {
    const payload = await request.validateUsing(transitionValidator)
    try {
      const doc = await domain.transitionChange(params.id, payload.lifecycle, payload.note ?? null)
      return { data: doc }
    } catch (e) {
      // 허용되지 않은 전이는 500 이 아니라 400 + 갈 수 있는 상태 안내 (웹·CLI 가 그대로 보여준다)
      const m = String((e as Error).message).match(/Invalid transition "(\w+)" -> "(\w+)"/)
      if (!m) throw e
      const next = allowedTransitions(m[1])
      return response.badRequest({
        error: `${m[1]} 에서 ${m[2]} 로 바로 갈 수 없습니다. 갈 수 있는 상태: ${next.length ? next.join(', ') : '없음 (끝난 항목)'}${m[2] === 'SHIPPED' ? ' — 완료는 출시 대기(SHIP_READY)에서 승인합니다' : ''}`,
      })
    }
  }

  async createWorkbench({ request, response }: HttpContext) {
    const payload = await request.validateUsing(createWorkbenchValidator)
    const doc = await domain.createWorkbench({
      title: payload.title,
      workType: payload.workType,
      summary: payload.summary ?? null,
      body: payload.content ?? null,
    })
    return response.created({ data: doc })
  }

  async workbenchList() {
    return { data: await domain.workbench() }
  }

  async promoteWorkbench({ params, request }: HttpContext) {
    const payload = await request.validateUsing(promoteValidator)
    const data = await domain.promoteWorkbench(params.id, payload.target, {
      productId: payload.productId,
      productName: payload.productName,
      changeTitle: payload.changeTitle,
    })
    return { data }
  }

  async needsYou() {
    return { data: await domain.needsYou() }
  }

  /** AI 상태: provider·작업별 체인·키 설정 여부 (키 값은 내보내지 않음) */
  async aiStatus() {
    return { data: await aiStatus() }
  }

  async aiUsage({ request }: HttpContext) {
    const days = Math.min(Math.max(Number(request.input('days', 7)) || 7, 1), 90)
    return { data: await usageSummary(days) }
  }

  /** ai.json 저장 — provider 추가/삭제·체인 변경. 이 컴퓨터에서만 */
  async aiConfigSave(ctx: HttpContext) {
    if (!isLocalRequest(ctx))
      return ctx.response.forbidden({ error: 'AI 설정은 이 컴퓨터에서만 바꿀 수 있습니다' })
    const body = ctx.request.body() as { config?: AIConfig; reset?: boolean }
    const cfg = body.reset ? defaultConfig() : normalizeConfig(body.config ?? {})
    const errors = validateConfig(cfg)
    if (errors.length) return ctx.response.badRequest({ error: errors.join('\n') })
    await saveConfig(cfg)
    return { data: await aiStatus() }
  }

  /** provider/model 하나로 짧은 왕복 — 연결 테스트. 이 컴퓨터에서만 (CLI provider 실행이 포함되므로) */
  async aiTest(ctx: HttpContext) {
    if (!isLocalRequest(ctx))
      return ctx.response.forbidden({
        error: 'AI 연결 테스트는 이 컴퓨터에서만 실행할 수 있습니다',
      })
    const { provider, model } = ctx.request.only(['provider', 'model']) as {
      provider?: string
      model?: string
    }
    if (!provider || !model)
      return ctx.response.badRequest({ error: 'provider 와 model 이 필요합니다' })
    const out = await aiChat({
      task: 'summarize',
      only: { provider, model },
      messages: [{ role: 'user', content: '연결 확인입니다. "확인" 한 단어만 답하세요.' }],
      maxTokens: 400,
    })
    if (!out) {
      const st = await routerStatus()
      const fail = (st.lastFailures.summarize ?? []).find((a) => a.provider === provider)
      return ctx.response.status(502).send({ error: fail?.error ?? '응답 없음' })
    }
    return { data: { ok: true, text: out.text.slice(0, 200), ms: out.ms, usage: out.usage } }
  }
}
