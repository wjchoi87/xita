import type { HttpContext } from '@adonisjs/core/http'
import fs from 'node:fs'
import vine from '@vinejs/vine'
import { HttpError, PortfolioService } from '#portfolio/service'
import { getJob, jobSummary, listJobs } from '#portfolio/jobs'
import { importPlanner } from '#portfolio/planner_import'
import { authUrl, exchangeCode, revenueStatus } from '#portfolio/revenue'
import { admobClientPath } from '#portfolio/config'
import { inspectProject } from '#portfolio/inspect'
import { dismissAdvice, runMonitor, visibleReport } from '#portfolio/monitor'
import {
  createPost,
  draftPost,
  listPosts,
  loadCommunities,
  removePost,
  saveCommunities,
  updatePost,
} from '#portfolio/promo'
import { isLocalRequest } from '#portfolio/local_request'

const svc = new PortfolioService()

const registerValidator = vine.compile(
  vine.object({
    path: vine.string().trim().minLength(1),
    codename: vine.string().trim().optional(),
    name: vine.string().trim().optional(),
    desc: vine.string().trim().optional(),
  })
)
const deployValidator = vine.compile(
  vine.object({
    track: vine.string().optional(),
    bump: vine.boolean().optional(),
    confirmed: vine.boolean().optional(),
    notes: vine.string().optional(),
    notesEn: vine.string().optional(),
    dryRun: vine.boolean().optional(),
  })
)
const adIdsValidator = vine.compile(
  vine.object({
    appId: vine.string().trim().optional(),
    banner: vine.string().trim().optional(),
    interstitial: vine.string().trim().optional(),
    rewarded: vine.string().trim().optional(),
  })
)
const logValidator = vine.compile(
  vine.object({ text: vine.string().trim().minLength(1), kind: vine.string().trim().optional() })
)
const agentValidator = vine.compile(
  vine.object({
    change: vine.string().trim().optional(),
    task: vine.string().trim().maxLength(8000).optional(),
    agent: vine.enum(['claude', 'codex']).optional(),
    launch: vine.boolean().optional(),
  })
)
const runValidator = vine.compile(
  vine.object({ cmd: vine.string().trim().minLength(1), name: vine.string().trim().optional() })
)

async function handle(
  ctx: HttpContext,
  fn: () => Promise<unknown>,
  opts: { local?: boolean } = {}
) {
  if (opts.local && !isLocalRequest(ctx))
    return ctx.response.forbidden({ error: '이 작업은 이 컴퓨터의 XITA 에서만 실행할 수 있습니다' })
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError) return ctx.response.status(e.status).send({ error: e.message })
    const err = e as { messages?: Array<{ message: string }>; message?: string }
    if (err.messages)
      return ctx.response.badRequest({ error: err.messages.map((m) => m.message).join(', ') })
    return ctx.response.internalServerError({ error: err.message ?? String(e) })
  }
}

/** 작업 시작 응답 {jobId} */
async function jobOf(p: Promise<{ id: string }>) {
  const job = await p
  return job.id
}

/*
 * 변경 전 정책(planner): 콜백을 http://127.0.0.1:<port> 로 고정 — planner 는 127.0.0.1 에만 바인딩했다.
 * 변경 후 정책: 사용자가 접속한 loopback 호스트(localhost/127.0.0.1/[::1])를 그대로 쓴다. 그 외 호스트면 localhost.
 * 변경 이유: XITA 서버는 HOST=localhost 로 IPv6(::1)에만 바인딩될 수 있어 127.0.0.1 콜백이 연결 거부된다.
 * 영향 범위: 애드몹 OAuth 연결(auth → callback 이 같은 redirect_uri 를 써야 토큰 교환 성공).
 */
function redirectUri(ctx: HttpContext) {
  const port = ctx.request.request.socket.localPort ?? Number(process.env.PORT ?? 3333)
  const hostname = (ctx.request.hostname() ?? '').toLowerCase()
  const host = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)
    ? hostname === '::1'
      ? '[::1]'
      : hostname
    : 'localhost'
  return `http://${host}:${port}/api/v1/portfolio/admob/callback`
}

function page(title: string, msg: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><body style="font-family:-apple-system,sans-serif;display:grid;place-items:center;height:100vh;margin:0"><p>${esc(msg)}</p></body>`
}

export default class PortfolioController {
  async overview(ctx: HttpContext) {
    return handle(ctx, async () => ({
      ...(await svc.overview()),
      jobs: listJobs().slice(0, 10).map(jobSummary),
    }))
  }

  async projects(ctx: HttpContext) {
    return handle(ctx, () =>
      svc.listCards(['1', 'true'].includes(String(ctx.request.input('archived'))))
    )
  }

  async project(ctx: HttpContext) {
    return handle(ctx, () => svc.detail(ctx.params.id))
  }

  async register(ctx: HttpContext) {
    return handle(
      ctx,
      async () => ({
        project: await svc.register(await ctx.request.validateUsing(registerValidator)),
      }),
      { local: true }
    )
  }

  async archive(ctx: HttpContext) {
    return handle(
      ctx,
      async () => ({
        project: await svc.setArchived(
          ctx.params.id,
          ctx.request.input('archived', true) !== false
        ),
      }),
      { local: true }
    )
  }

  async build(ctx: HttpContext) {
    return handle(
      ctx,
      async () => ({
        jobId: await jobOf(svc.build(ctx.params.id, !!ctx.request.input('release'))),
      }),
      { local: true }
    )
  }

  async deploy(ctx: HttpContext) {
    return handle(
      ctx,
      async () => ({
        jobId: await jobOf(
          svc.deploy(ctx.params.id, await ctx.request.validateUsing(deployValidator))
        ),
      }),
      { local: true }
    )
  }

  async notes(ctx: HttpContext) {
    return handle(
      ctx,
      async () => ({
        jobId: await jobOf(
          svc.notes(ctx.params.id, await ctx.request.validateUsing(deployValidator))
        ),
      }),
      { local: true }
    )
  }

  async adIds(ctx: HttpContext) {
    return handle(
      ctx,
      async () => svc.adIds(ctx.params.id, await ctx.request.validateUsing(adIdsValidator)),
      { local: true }
    )
  }

  async run(ctx: HttpContext) {
    return handle(
      ctx,
      async () => ({
        jobId: await jobOf(svc.run(ctx.params.id, await ctx.request.validateUsing(runValidator))),
      }),
      { local: true }
    )
  }

  async learn(ctx: HttpContext) {
    return handle(
      ctx,
      async () => svc.learnCommand(ctx.params.id, await ctx.request.validateUsing(runValidator)),
      { local: true }
    )
  }

  /** AI 에게 맡기기 — launch:false 면 지시문만, true 면 터미널에서 Claude Code/Codex 실행 */
  async agent(ctx: HttpContext) {
    return handle(
      ctx,
      async () => {
        const { launch, ...input } = await ctx.request.validateUsing(agentValidator)
        return launch ? svc.agentLaunch(ctx.params.id, input) : svc.agentBrief(ctx.params.id, input)
      },
      { local: true }
    )
  }

  async log(ctx: HttpContext) {
    return handle(ctx, () => svc.log(ctx.params.id))
  }

  async addLog(ctx: HttpContext) {
    return handle(
      ctx,
      async () => {
        const { text, kind } = await ctx.request.validateUsing(logValidator)
        return { entry: await svc.addLog(ctx.params.id, kind || '메모', text) }
      },
      { local: true }
    )
  }

  async removeLog(ctx: HttpContext) {
    return handle(ctx, () => svc.removeLog(ctx.params.id, ctx.params.entryId), { local: true })
  }

  async sync(ctx: HttpContext) {
    return handle(ctx, async () => ({ jobId: await jobOf(svc.sync()) }), { local: true })
  }

  async storeRefresh(ctx: HttpContext) {
    return handle(ctx, async () => ({ jobId: await jobOf(svc.storeRefresh()) }), { local: true })
  }

  async changelog(ctx: HttpContext) {
    return handle(ctx, () => svc.changelog(ctx.request.input('project') || undefined))
  }

  async revenue(ctx: HttpContext) {
    return handle(ctx, async () => {
      const apps = new Map<string, { label: string; project: string }>()
      for (const p of await svc.listCards(true)) {
        const appId = inspectProject(p.path).adIds.appId
        if (appId) apps.set(appId, { label: p.name, project: p.id })
      }
      const days = Math.min(Math.max(Number(ctx.request.input('days', 7)) || 7, 1), 90)
      return revenueStatus(apps, days)
    })
  }

  /** 상시 모니터링 최신 결과 (숨긴 조언 제외) */
  async monitor(ctx: HttpContext) {
    return handle(ctx, async () => ({ report: visibleReport() }))
  }

  /** 지금 점검 — 애드몹 기록 갱신·규칙 신호·AI 조언 (수 초~수십 초) */
  async monitorRun(ctx: HttpContext) {
    return handle(
      ctx,
      async () => {
        await runMonitor({ force: !!ctx.request.input('force') })
        return { report: visibleReport() }
      },
      { local: true }
    )
  }

  async adviceDismiss(ctx: HttpContext) {
    return handle(
      ctx,
      async () => {
        await dismissAdvice(String(ctx.params.id))
        return { report: visibleReport() }
      },
      { local: true }
    )
  }

  // ---- 홍보글 (자동 게시 없음: 초안·기록·효과) ----
  async promoList(ctx: HttpContext) {
    return handle(ctx, async () => ({
      posts: await listPosts(ctx.request.input('project') || undefined),
      communities: loadCommunities(),
    }))
  }

  async promoCreate(ctx: HttpContext) {
    return handle(ctx, async () => ({ post: await createPost(ctx.request.body()) }), {
      local: true,
    })
  }

  async promoDraft(ctx: HttpContext) {
    const b = ctx.request.only(['project', 'community', 'lang', 'angle'])
    return handle(
      ctx,
      async () => ({
        post: await draftPost({
          project: String(b.project ?? ''),
          community: String(b.community ?? ''),
          lang: b.lang === 'en' ? 'en' : b.lang === 'ko' ? 'ko' : undefined,
          angle: b.angle ? String(b.angle) : undefined,
        }),
      }),
      { local: true }
    )
  }

  async promoUpdate(ctx: HttpContext) {
    return handle(
      ctx,
      async () => ({ post: await updatePost(String(ctx.params.id), ctx.request.body()) }),
      { local: true }
    )
  }

  async promoRemove(ctx: HttpContext) {
    return handle(
      ctx,
      async () => {
        await removePost(String(ctx.params.id))
        return { ok: true }
      },
      { local: true }
    )
  }

  async promoCommunities(ctx: HttpContext) {
    const list = ctx.request.input('communities')
    return handle(
      ctx,
      async () => {
        if (!Array.isArray(list)) throw new HttpError(400, 'communities 배열이 필요합니다')
        return { communities: await saveCommunities(list) }
      },
      { local: true }
    )
  }

  async admobAuth(ctx: HttpContext) {
    if (!isLocalRequest(ctx))
      return ctx.response.forbidden({ error: '로컬에서만 연결할 수 있습니다' })
    if (!fs.existsSync(admobClientPath()))
      return ctx.response.badRequest({ error: `${admobClientPath()} 이 없습니다` })
    return ctx.response.redirect(authUrl(redirectUri(ctx)))
  }

  async admobCallback(ctx: HttpContext) {
    ctx.response.header('content-type', 'text/html; charset=utf-8')
    if (!isLocalRequest(ctx))
      return ctx.response.forbidden(page('XITA', '로컬에서만 연결할 수 있습니다'))
    try {
      const code = String(ctx.request.input('code') ?? '')
      if (!code) throw new Error('동의 코드가 없습니다')
      await exchangeCode(code, redirectUri(ctx))
      return page('XITA', '애드몹 연결 완료. 이 창을 닫고 XITA 로 돌아가세요.')
    } catch (e) {
      return ctx.response.internalServerError(page('XITA', `연결 실패: ${(e as Error).message}`))
    }
  }

  async jobs(ctx: HttpContext) {
    return handle(ctx, async () => listJobs().map(jobSummary))
  }

  async job(ctx: HttpContext) {
    return handle(ctx, async () => {
      const j = getJob(ctx.params.id)
      if (!j) throw new HttpError(404, '작업을 찾을 수 없습니다')
      return { ...j, lines: j.lines.slice(-400) }
    })
  }

  async docs(ctx: HttpContext) {
    return handle(ctx, async () => {
      const all = await svc.ops.listDocs('artifact')
      const docs = all
        .filter((a) => a.meta.portfolio || a.meta.imported_from)
        .map((a) => ({
          id: a.id,
          name: String(a.meta.name ?? a.id),
          kind: String(a.meta.kind ?? 'doc'),
          product: (a.meta.product as string | null) ?? null,
          revision: Number(a.meta.current_revision ?? a.revision ?? 1),
          updatedAt: (a.meta.updated_at as string | undefined) ?? null,
          source: (a.meta.source as string | undefined) ?? null,
        }))
      return { docs }
    })
  }

  async settings(ctx: HttpContext) {
    return handle(ctx, async () => svc.settings())
  }

  async importPlanner(ctx: HttpContext) {
    return handle(
      ctx,
      () =>
        importPlanner({
          from: ctx.request.input('from') || undefined,
          dryRun: !!ctx.request.input('dryRun'),
        }),
      { local: true }
    )
  }
}
