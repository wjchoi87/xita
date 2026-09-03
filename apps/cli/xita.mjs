#!/usr/bin/env node
/**
 * xita CLI (SPEC v0.3 §29 / Implementation Stack §29).
 *
 * Automation / Agent interface — Human용 주 UI가 아니라 스크립트·Agent용.
 * 의존성 0: node 22 fetch 로 서버 REST(/api/v1) 를 호출한다.
 *
 * 환경변수:
 *   XITA_HOST   기본 http://localhost:3333
 *   XITA_PREFIX 기본 /api/v1
 *
 * 사용:
 *   xita status
 *   xita products
 *   xita needs-you
 *   xita handoff --product novel --change ai-recommendation
 *   xita context --product novel --change ai-recommendation   # handoff 와 동일 (alias)
 *   xita capture --title "아이디어" --content "본문"          # workbench intake
 */

const HOST = (process.env.XITA_HOST ?? 'http://localhost:3333').replace(/\/+$/, '')
const PREFIX = process.env.XITA_PREFIX ?? '/api/v1'

async function get(pathname) {
  const res = await fetch(`${HOST}${PREFIX}${pathname}`)
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    fail(`non-JSON response (${res.status}) from ${pathname}:\n${text.slice(0, 300)}`)
  }
  if (!res.ok) fail(`HTTP ${res.status} ${pathname}: ${data?.message ?? text.slice(0, 200)}`)
  return data?.data ?? data
}

async function post(pathname, body = {}) {
  const res = await fetch(`${HOST}${PREFIX}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    fail(`non-JSON response (${res.status}) from ${pathname}:\n${text.slice(0, 300)}`)
  }
  if (!res.ok) fail(`HTTP ${res.status} ${pathname}: ${data?.message ?? text.slice(0, 200)}`)
  return data?.data ?? data
}

function fail(msg) {
  console.error(`xita: ${msg}`)
  process.exit(1)
}

function args(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next
        i++
      } else {
        out[key] = true
      }
    } else {
      out._.push(a)
    }
  }
  return out
}

function requireArg(a, name, usage) {
  const v = a[name]
  if (typeof v !== 'string' || v === '') {
    fail(`--${name} is required.\n${usage}`)
  }
  return v
}

function usage() {
  console.log(`xita CLI — host: ${HOST}

  xita status                                 workspace revision + needs-you 요약
  xita pair                                   모바일 페어링 코드 발급 (10분 유효)
  xita products                               제품/변경 목록
  xita needs-you                              Human Decision Inbox
  xita closest                                완주 후보 (Closest to Ship)
  xita timeline                               최근 자취(human-significant 이벤트)
  xita search --q KEYWORD                     정본 문서 검색
  xita workbench                              메모(workbench) 목록
  xita capture --title T [--content C]        메모 intake (오프라인 큐 없음, 즉시 push)
  xita handoff --product P --change C         Agent Handoff (markdown, Mission Card)
  xita context --product P [--change C]       Handoff 전문 (alias)
  xita drift --product P                      Context Drift 검사
  xita observe --product P --github OWNER/REPO | --linear TEAM | --figma FILE
                                              외부 관측 → 참조 요약 upsert
  xita agent-result --change C --summary S    에이전트 결과 import (Review+Proposal 생성)
  xita reviews [--product P]                  리뷰 패키지 목록
  xita approve --change C                     §51 승인 (capability 적용→SHIPPED)
  xita request-changes --change C [--note N]  재작업 요청
  xita health --product P                     제품 건강 요약
  xita releases [--product P]                 출시 기록
  xita release-add --product P --name N       출시 생성
  xita release-readiness --release R          출시 준비도
  xita roadmap --product P                    우선순위 정렬 로드맵 (scorecard 파생)
  xita score --change C --pop N --need N --strat N --effort N --conf N
                                              Aha scorecard 채점
  xita insight --product P --title T --content C [--kind K]
  xita insights [--product P]                 관찰/가설 목록
  xita agent-update --id D --status S [--note N]  위임 런 상태 보고
  xita ask "질문"                             근거 있는 답변 (Historical Explanation)
  xita summarize                              최근 이력 요약 (Historian)
  xita patch --artifact A                     아티팩트 패치 제안 생성
  xita patches [--artifact A]                 대기 패치 목록
  xita patch-apply --patch P                  패치 적용 (낙관적 동시성)
  xita milestones [--product P] | milestone --id M | assign-milestone --change C --milestone M
  xita bio --product P                        제품 약력 (Biography)`)
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const a = args(rest)

  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
      usage()
      return

    case 'status': {
      const status = await get('/v4/status')
      const state = await get('/v4/products')
      const products = Array.isArray(state) ? state : (state?.data ?? [])
      const lines = [
        `host              ${HOST}`,
        `workspace_revision ${status.workspace_revision}`,
        `needs_you         ${status.needsYouCount}`,
        `products          ${Array.isArray(products) ? products.length : '-'}`,
      ]
      if (Array.isArray(products)) {
        for (const p of products) {
          lines.push(`  - ${p.meta?.name ?? p.id} (rev ${p.revision})`)
        }
      }
      console.log(lines.join('\n'))
      return
    }

    case 'pair': {
      const pairing = await post('/devices/pair', { host_identity: 'xita-host' })
      const mins = Math.max(1, Math.round(((pairing.expires_at ?? 0) - Date.now()) / 60000))
      console.log(
        [
          '모바일 앱의 호스트 연결 화면에서 이 코드를 입력하세요:',
          '',
          `    ${pairing.code}`,
          '',
          `(${mins}분간 유효 — 만료되면 다시 xita pair)`,
        ].join('\n')
      )
      return
    }

    case 'products': {
      const products = await get('/v4/products')
      const changes = await get('/v4/needs-you')
      for (const p of products) {
        console.log(`${p.meta?.name ?? p.id}  [rev ${p.revision}]  ${p.meta?.status ?? ''}`)
      }
      if (Array.isArray(changes) && changes.length) {
        console.log('\nneeds-you:')
        for (const c of changes) console.log(`  ! [${c.type}/${c.priority}] ${c.title ?? c.change ?? ''}`)
      }
      return
    }

    case 'needs-you': {
      const items = await get('/v4/needs-you')
      if (!Array.isArray(items) || items.length === 0) {
        console.log('결정이 필요한 항목 없음')
        return
      }
      for (const it of items) {
        console.log(`[${it.type}/${it.priority}] ${it.title ?? it.change ?? ''}  ${it.productName ?? it.product ?? ''}`)
      }
      return
    }

    case 'observe': {
      const product = requireArg(a, 'product', 'usage: xita observe --product P --github owner/repo [--linear [teamId]]')
      if (a.github) {
        const out = await post(`/v4/products/${encodeURIComponent(product)}/observe/github`, { repo: a.github })
        console.log(`github ${out.repo}: +${out.created} ~${out.updated}`)
      } else if (a.linear !== undefined) {
        const body = typeof a.linear === 'string' ? { teamId: a.linear } : {}
        const out = await post(`/v4/products/${encodeURIComponent(product)}/observe/linear`, body)
        console.log(`linear: +${out.created} ~${out.updated}`)
      } else {
        fail('use --github owner/repo or --linear [teamId]')
      }
      return
    }

    case 'approve': {
      const change = requireArg(a, 'change', 'usage: xita approve --change C')
      const out = await post(`/v4/changes/${encodeURIComponent(change)}/approve`)
      console.log(`approved: caps applied=${out.capabilities_applied} -> ${out.change?.meta?.status ?? 'SHIPPED'}`)
      return
    }

    case 'request-changes': {
      const change = requireArg(a, 'change', 'usage: xita request-changes --change C [--note N]')
      const out = await post(`/v4/changes/${encodeURIComponent(change)}/request-changes`, a.note ? { note: a.note } : {})
      console.log(`-> ${out?.meta?.status ?? 'BUILD'}`)
      return
    }

    case 'reviews': {
      const list = await get(`/v4/reviews${a.product ? `?product=${encodeURIComponent(a.product)}` : ''}`)
      for (const r of list) console.log(`- ${r.id} [${r.meta?.status}] ${r.meta?.name ?? ''} (change: ${r.meta?.change})`)
      return
    }

    case 'agent-result': {
      const change = requireArg(a, 'change', 'usage: xita agent-result --change C --summary S [--implemented a,b] [--deviations x,y] [--tests t]')
      const body = { summary: requireArg(a, 'summary', '') }
      if (typeof a.implemented === 'string') body.implemented = a.implemented.split(',').map((x) => x.trim())
      if (typeof a.deviations === 'string') body.deviations = a.deviations.split(',').map((x) => x.trim())
      if (typeof a.tests === 'string') body.tests = a.tests.split(',').map((x) => x.trim())
      const out = await post(`/v4/changes/${encodeURIComponent(change)}/agent-result`, body)
      console.log(`review: ${out.review?.id} · change -> ${out.change?.meta?.status}`)
      return
    }

    case 'health': {
      const product = requireArg(a, 'product', 'usage: xita health --product P')
      const h = await get(`/v4/products/${encodeURIComponent(product)}/health`)
      console.log(`product ${h.product} · ${h.production_status} · ${h.version ?? "-"}`)
      const he = h.health
      console.log(`  development=${he.development} operations=${he.operations} distribution=${he.distribution} launch=${he.launch_readiness}%`)
      console.log(`  context: artifacts=${he.context.artifacts} drift=${he.context.context_drift} stale_refs=${he.context.outdated_references} proposals=${he.context.pending_proposals}`)
      console.log(`  next_release=${h.next_release ?? '-'} · activity(30d)=${h.recent_activity_30d}`)
      return
    }

    case 'releases': {
      const list = await get(`/v4/releases${a.product ? `?product=${encodeURIComponent(a.product)}` : ''}`)
      for (const r of list) console.log(`- ${r.id} [${r.meta?.status}] ${r.meta?.name ?? ''} changes=${r.meta?.change_ids ?? ''}`)
      return
    }

    case 'release-add': {
      const rel = requireArg(a, 'release', 'usage: xita release-add --release R --change C')
      const change = requireArg(a, 'change', '')
      const out = await post(`/v4/releases/${encodeURIComponent(rel)}/changes`, { change })
      console.log('contains:', out.changes)
      return
    }

    case 'release-readiness': {
      const rel = requireArg(a, 'release', 'usage: xita release-readiness --release R')
      const d = await get(`/v4/releases/${encodeURIComponent(rel)}/readiness`)
      console.log(`${d.release} [${d.status}] ${d.shipped}/${d.total} shipped · readiness=${d.readiness}% · ready=${d.ready} · blockers=${d.blockers.length}`)
      return
    }

    case 'roadmap': {
      const product = requireArg(a, 'product', 'usage: xita roadmap --product P')
      const d = await get(`/v4/products/${encodeURIComponent(product)}/roadmap`)
      console.log(`goal: ${d.goal ?? '-'}\ndirection: ${d.direction ?? '-'}`)
      // Aha scorecard 파생 점수 우선 정렬(서버) — 점수·appetite·체류일을 함께 본다
      for (const p of d.planned) {
        const score = p.value_score != null ? `score=${p.value_score}`.padEnd(12) : ''.padEnd(12)
        const app = p.appetite ? `${p.appetite}${p.appetite_weeks ? `/${p.appetite_weeks}w` : ''}` : '-'
        const stale = p.stale_days != null && p.stale_days > 30 ? ` · ${p.stale_days}d 정체` : ''
        console.log(`- ${score}[${p.priority}] ${p.name} (${p.status}) appetite:${app}${stale}`)
      }
      return
    }

    // ---- Scorecard / Insight / Dispatch 런 루프 (research wave1-2) ----------------

    case 'score': {
      const change = requireArg(
        a,
        'change',
        'usage: xita score --change C --pop N --need N --strat N --effort N --conf N  (0-10)'
      )
      const nums = ['pop', 'need', 'strat', 'effort', 'conf']
      const body = {}
      for (const k of nums) {
        if (a[k] == null) fail(`--${k} required (0-10)`)
        body[`s_${k}`] = Number(a[k])
      }
      await post(`/v4/changes/${encodeURIComponent(change)}/score`, body)
      console.log('scored:', change)
      return
    }

    case 'insight': {
      const product = requireArg(
        a,
        'product',
        'usage: xita insight --product P --title T --content C [--kind OBSERVATION|INTERVIEW|SECONDARY|DERIVED|RETRO|OPPORTUNITY|ASSUMPTION]'
      )
      const out = await post('/v4/insights', {
        product,
        title: requireArg(a, 'title', '--title required'),
        content: requireArg(a, 'content', '--content required'),
        kind: a.kind,
        change: a.change,
      })
      console.log('created:', out.id ?? out)
      return
    }

    case 'insights': {
      const list = await get(`/v4/insights${a.product ? `?product=${encodeURIComponent(a.product)}` : ''}`)
      if (!list.length) console.log('관찰/가설 기록 없음 — Ask의 근거가 되는 층입니다')
      for (const i of list)
        console.log(`- [${i.meta?.status ?? i.status}|${i.meta?.kind ?? i.kind}] ${i.meta?.name ?? i.name} (${i.meta?.product ?? i.product})`)
      return
    }

    case 'agent-update': {
      const id = a._[0] || requireArg(a, 'dispatch', 'usage: xita agent-update <dispatch-id> --status WORKING|AWAITING_INPUT|RESULT_READY|MERGED|FAILED|CANCELLED [--note N] [--result R]')
      const out = await post(`/v4/dispatches/${encodeURIComponent(id)}/update`, {
        status: a.status,
        note: a.note,
        result_ref: a.result,
      })
      console.log('updated:', out?.id ?? id, '→', a.status ?? '(note only)')
      if (['AWAITING_INPUT', 'RESULT_READY', 'FAILED'].includes(String(a.status || '').toUpperCase()))
        console.log('  → Needs You 에 자동 승격됨 (xita needs-you 로 확인)')
      return
    }

    case 'ask': {
      const q = a._.join(' ') || (typeof a.q === 'string' ? a.q : '')
      if (!q) fail('usage: xita ask \"자연어 질문\"')
      const d = await get(`/v4/ask?q=${encodeURIComponent(q)}`)
      console.log(`[${d.intent}] kw=${d.keyword || '-'}`)
      console.log(d.answer)
      if (d.sources?.length) {
        console.log('-- 근거 --')
        for (const s of d.sources) console.log(`  ${s.kind}: ${s.id} ${s.title ?? ''}`)
      }
      return
    }

    case 'summarize': {
      const d = await get(`/v4/summarize${a.product ? `?product=${encodeURIComponent(a.product)}` : ''}`)
      console.log(d.summary)
      console.log(`(source: ${d.source}, events: ${d.events})`)
      return
    }

    case 'patch': {
      const artifact = requireArg(a, 'artifact', 'usage: xita patch --artifact A --insight \"...\" | xita patch --apply PATCH_ID | xita patch --dismiss PATCH_ID')
      if (a.insight) {
        const out = await post(`/v4/artifacts/${encodeURIComponent(artifact)}/patch-suggest`, { insight: a.insight })
        console.log(`suggested: ${out.id}`)
      } else {
        fail('--insight required')
      }
      return
    }

    case 'patch-apply': {
      const patch = requireArg(a, 'patch', 'usage: xita patch-apply --patch P')
      const out = await post(`/v4/patches/${encodeURIComponent(patch)}/apply`)
      console.log(JSON.stringify(out))
      return
    }

    case 'patches': {
      const list = await get(`/v4/patches${a.artifact ? `?artifact=${encodeURIComponent(a.artifact)}` : ''}`)
      for (const x of list) console.log(`- ${x.id} [${x.meta?.status}] → ${x.meta?.artifact} (base r${x.meta?.base_revision})`)
      return
    }

    case 'milestones': {
      const list = await get(`/v4/milestones${a.product ? `?product=${encodeURIComponent(a.product)}` : ''}`)
      for (const m of list) {
        const prog = await get(`/v4/milestones/${encodeURIComponent(m.id)}/progress`)
        console.log(`${m.id} [${prog.status}] ${prog.progress}% (${prog.done}/${prog.total} shipped) ${prog.overdue ? '· OVERDUE' : ''} ${prog.target_date ?? ''}`)
        for (const c of prog.changes) console.log(`    - ${c.name} [${c.status}]`)
      }
      return
    }

    case 'milestone': {
      const product = requireArg(a, 'product', 'usage: xita milestone --product P --name \"Beta 1\" [--date 2026-10-01]')
      const name = requireArg(a, 'name', '')
      const out = await post(`/v4/products/${encodeURIComponent(product)}/milestones`, { name, targetDate: a.date })
      console.log('created:', out.id)
      return
    }

    case 'assign-milestone': {
      const change = requireArg(a, 'change', 'usage: xita assign-milestone --change C --milestone M|none')
      const out = await post(`/v4/changes/${encodeURIComponent(change)}/milestone`, { milestone: a.milestone ?? 'none' })
      console.log('assigned:', out ?? 'cleared')
      return
    }

    case 'closest': {
      const list = await get('/v4/closest-to-ship')
      for (const c of list) console.log(`- ${c.name} [${c.status}]  (${c.product ?? '-'})`)
      return
    }

    case 'timeline': {
      const product = typeof a.product === 'string' ? a.product : undefined
      const items = await get(`/v4/timeline${product ? `?product=${encodeURIComponent(product)}` : ''}`)
      for (const e of items) console.log(`${e.ts}  [${e.eventType}] ${e.title}`)
      return
    }

    case 'bio': {
      const product = requireArg(a, 'product', 'usage: xita bio --product P')
      const out = await get(`/v4/products/${encodeURIComponent(product)}/biography`)
      console.log(out.markdown)
      return
    }

    case 'workbench': {
      const items = await get('/v4/workbench')
      for (const it of items ?? []) console.log(`- ${it.id}  ${it.meta?.status ?? ''} (${it.meta?.work_type ?? 'idea'})`)
      return
    }

    case 'capture': {
      const title = requireArg(a, 'title', 'usage: xita capture --title T [--content C] [--type idea|research]')
      const content = typeof a.content === 'string' ? a.content : ''
      const type = typeof a.type === 'string' ? a.type : 'idea'
      const out = await post('/v4/workbench', { title, content, workType: type })
      console.log(`captured: ${out.id} (rev ${out.revision}) → ${out.meta?.status ?? 'captured'}`)
      return
    }

    case 'handoff':
    case 'h': {
      const product = requireArg(a, 'product', 'usage: xita handoff --product P --change C')
      const change = requireArg(a, 'change', 'usage: xita handoff --product P --change C')
      const out = await get(`/v4/products/${encodeURIComponent(product)}/handoff/${encodeURIComponent(change)}`)
      console.log(out.markdown)
      return
    }

    case 'context': {
      const product = requireArg(a, 'product', 'usage: xita context --product P --change C')
      const change = requireArg(a, 'change', 'usage: xita context --product P --change C')
      const out = await get(`/v4/products/${encodeURIComponent(product)}/handoff/${encodeURIComponent(change)}`)
      if (a.json) {
        console.log(JSON.stringify(out, null, 2))
      } else {
        console.log(out.markdown)
      }
      return
    }

    case 'drift': {
      const product = requireArg(a, 'product', 'usage: xita drift --product P')
      const out = await get(`/v4/context/drift?product=${encodeURIComponent(product)}`)
      if (!out.hasDrift) {
        console.log('drift 없음')
        return
      }
      for (const d of out.drifted) {
        console.log(`! ${d.artifact}: dispatched ${d.dispatchedRevision} → current ${d.currentRevision} (${d.severity})`)
      }
      return
    }

    default:
      fail(`unknown command "${cmd}"\n`)
      usage()
      process.exit(1)
  }
}

main().catch((e) => fail(e?.message ?? String(e)))