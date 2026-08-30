import type { HttpContext } from '@adonisjs/core/http'
import { V4Domain } from '#v4/domain'
import { aiStatus } from '#v4/ai'
import vine from '@vinejs/vine'

const domain = new V4Domain()

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
    return response.created({ data: doc })
  }

  async transitionChange({ params, request }: HttpContext) {
    const payload = await request.validateUsing(transitionValidator)
    const doc = await domain.transitionChange(params.id, payload.lifecycle, payload.note ?? null)
    return { data: doc }
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

  /** AI Provider Layer 상태 (rule→cache→openai-compat 파이프라인) */
  async aiStatus() {
    return { data: aiStatus() }
  }
}
