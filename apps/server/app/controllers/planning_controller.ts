import type { HttpContext } from '@adonisjs/core/http'
import {
  STAGES,
  PlanError,
  abandonPlan,
  confirmPlan,
  confirmProblems,
  planGaps,
  createPlan,
  getPlan,
  listPlans,
  parseAttachments,
  planPatch,
  planStage,
  planTurn,
  renderPlan,
} from '#v4/planning'
import { isLocalRequest } from '#portfolio/local_request'

/* 기획 위저드 API (docs/PORTFOLIO.md §기획). AI 호출(CLI provider 실행 포함)이 들어가는 쓰기는 이 컴퓨터에서만. */
async function handle(ctx: HttpContext, fn: () => Promise<unknown>, local = false) {
  if (local && !isLocalRequest(ctx))
    return ctx.response.forbidden({ error: '기획 진행은 이 컴퓨터의 XITA 에서만 할 수 있습니다' })
  try {
    return { data: await fn() }
  } catch (e) {
    if (e instanceof PlanError) return ctx.response.status(e.status).send({ error: e.message })
    const msg = (e as Error).message ?? String(e)
    if (/already exists/.test(msg))
      return ctx.response.conflict({ error: `이미 있는 이름입니다: ${msg.split(': ').pop()}` })
    throw e
  }
}

const view = async (id: string) => {
  const s = await getPlan(id)
  return {
    ...s,
    stages: STAGES.map((x) => ({ key: x.key, title: x.title })),
    markdown: renderPlan(s),
    problems: confirmProblems(s),
    gaps: planGaps(s),
  }
}

export default class PlanningController {
  async list(ctx: HttpContext) {
    return handle(ctx, () => listPlans())
  }

  async show(ctx: HttpContext) {
    return handle(ctx, () => view(ctx.params.id))
  }

  async create(ctx: HttpContext) {
    const idea = ctx.request.input('idea')
    const attachments = parseAttachments(ctx.request.input('attachments'))
    return handle(
      ctx,
      async () => {
        const s = await createPlan(idea ? String(idea) : undefined, attachments)
        return view(s.id)
      },
      true
    )
  }

  async turn(ctx: HttpContext) {
    const attachments = parseAttachments(ctx.request.input('attachments'))
    return handle(
      ctx,
      async () => {
        await planTurn(ctx.params.id, String(ctx.request.input('message') ?? ''), attachments)
        return view(ctx.params.id)
      },
      true
    )
  }

  async stage(ctx: HttpContext) {
    return handle(
      ctx,
      async () => {
        await planStage(ctx.params.id, String(ctx.request.input('to') ?? 'next'))
        return view(ctx.params.id)
      },
      true
    )
  }

  async patch(ctx: HttpContext) {
    const draft = ctx.request.input('draft')
    return handle(
      ctx,
      async () => {
        if (!draft || typeof draft !== 'object' || Array.isArray(draft))
          throw new PlanError('draft 객체가 필요합니다')
        await planPatch(ctx.params.id, draft)
        return view(ctx.params.id)
      },
      true
    )
  }

  async confirm(ctx: HttpContext) {
    return handle(ctx, () => confirmPlan(ctx.params.id), true)
  }

  async abandon(ctx: HttpContext) {
    return handle(ctx, () => abandonPlan(ctx.params.id), true)
  }
}
