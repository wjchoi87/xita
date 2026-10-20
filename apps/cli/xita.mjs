#!/usr/bin/env node
/**
 * xita CLI (SPEC v0.3 §29 / Implementation Stack §29).
 *
 * Automation / Agent interface — Human용 주 UI가 아니라 스크립트·Agent용.
 * 의존성 0: node 22 fetch 로 서버 REST(/api/v1) 를 호출한다.
 *
 * 환경변수:
 *   XITA_HOST         기본 http://localhost:3333
 *   XITA_PREFIX       기본 /api/v1
 *   XITA_DEVICE_TOKEN 선택 — 원격 호스트(페어링된 기기 토큰) 호출 시 x-device-token 헤더
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
const TOKEN = process.env.XITA_DEVICE_TOKEN

function headers(extra = {}) {
  return TOKEN ? { ...extra, 'x-device-token': TOKEN } : extra
}

/* 서버 에러 본문은 { error } (portfolio/sync) 또는 { message } (Adonis 기본) — 둘 다 표시 */
function errText(data, text) {
  return data?.error ?? data?.message ?? text.slice(0, 200)
}

async function get(pathname) {
  const res = await fetch(`${HOST}${PREFIX}${pathname}`, { headers: headers() })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    fail(`non-JSON response (${res.status}) from ${pathname}:\n${text.slice(0, 300)}`)
  }
  if (!res.ok) fail(`HTTP ${res.status} ${pathname}: ${errText(data, text)}`)
  return data?.data ?? data
}

async function post(pathname, body = {}) {
  const res = await fetch(`${HOST}${PREFIX}${pathname}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    fail(`non-JSON response (${res.status}) from ${pathname}:\n${text.slice(0, 300)}`)
  }
  if (!res.ok) fail(`HTTP ${res.status} ${pathname}: ${errText(data, text)}`)
  return data?.data ?? data
}

/** 대화형 루프용 — 실패해도 종료하지 않고 throw */
async function call(method, pathname, body) {
  const res = await fetch(`${HOST}${PREFIX}${pathname}`, {
    method,
    headers: headers(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`서버 응답을 읽지 못했습니다 (HTTP ${res.status})`)
  }
  if (!res.ok || typeof data?.error === 'string') throw new Error(errText(data, text))
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
  xita bio --product P                        제품 약력 (Biography)

  포트폴리오 (모든 프로젝트 — planner 흡수, docs/PORTFOLIO.md)
  xita projects [--all]                       프로젝트 목록 (버전·스토어·출시 대기)
  xita project P                              프로젝트 상세 (경로·명령·할 일·최근 자취)
  xita run [P] [이름|"명령"]                  프로젝트 폴더에서 명령 실행 (터미널 직접, 새 명령은 학습)
  xita build P [--release]                    디버그/AAB 빌드 (호스트 작업)
  xita deploy P [--track T] [--notes N] [--notes-en N] [--no-bump] [--yes] [--dry-run]
                                              Play 배포 (기본 internal, production 은 --yes 필수,
                                              --dry-run = 준비물 점검+AAB 빌드까지만)
  xita log P [--add "메모"] [--kind K]        앱 기록 보기/추가
  xita agent P ["할 일"] [--change ID] [--codex] [--print]
                                            AI 에게 맡기기 (터미널에서 Claude Code/Codex, --print 는 지시문만)
  xita sync                                   전체 git pull + 스토어 버전 조회
  xita jobs [ID]                              작업 목록 / 로그 따라가기
  xita changelog [P]                          커밋 변경내역
  xita import-planner [--from DIR] [--dry-run] planner 흡수 (재실행 안전)

  기획 (AI 가 질문하며 새 프로젝트 기획을 단계별로 완성 — 확정 전까지 초안만 저장)
  xita plan                                   기획 목록 → 이어 하기 / 새로 시작
  xita plan new ["아이디어 한 줄"]             새 기획 시작
  xita plan resume [ID]                       이어 하기
  xita plan show ID                           기획서 보기 (markdown)
    대화 중: 번호=선택지 고르기 · /다음 · /뒤로 · /요약 · /확정 · /중단 · /나가기(저장 후 종료)

  조언 (상시 모니터링 — 서버가 6시간마다 수익·출시·작업을 점검)
  xita advice [--run]                         최신 조언 (--run = 지금 점검, 수십 초~몇 분)
  xita ai [test PROVIDER MODEL]               AI provider·작업별 체인·최근 사용량 / 연결 테스트

  홍보 (자동 게시 없음 — 초안·기록·게시 전후 수익)
  xita promo [P]                              홍보글 목록
  xita promo draft P 커뮤니티 [--angle "강조점"] [--en]   AI 초안 (커뮤니티는 id 또는 이름)
  xita promo show ID                          본문 보기 (복사용)
  xita promo posted ID [URL]                  올렸다고 기록
  xita promo communities                      커뮤니티 목록

  작업 (아이디어·할 일·마일스톤)
  xita work P [--all]                         작업 보드 (아이디어/할 일/진행 중/검토 · 마일스톤 진행률)
  xita idea P "내용"                          아이디어 담기 (P 없이 쓰면 메모함)
  xita todo P "내용" [--doing] [--ms M] [--note N] [--high]
                                              할 일 추가 (--doing = 바로 진행 중)
  xita move ID 상태 [--note N]                상태 이동: idea·todo·doing·review·ready·done·pause·cancel
  xita edit ID [--title T] [--note N] [--priority low|normal|high|critical] [--ms M|none]
  xita ms P ["이름" [--due YYYY-MM-DD]] [--done ID]
                                              마일스톤 목록 / 만들기 / 완료 표시
  xita console                                웹 콘솔 주소`)
}

// ---- 포트폴리오 ----------------------------------------------------------

const TRACK_KO = { internal: '내부', alpha: '알파', beta: '베타', production: '프로덕션' }
const STATUS_KO = { PRODUCTION: '라이브', BETA: '베타', DEVELOPMENT: '개발 중' }

function pad(s, n) {
  s = String(s ?? '')
  // 한글은 2칸 폭
  const w = [...s].reduce((x, c) => x + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)
  return s + ' '.repeat(Math.max(1, n - w))
}

function storeText(store) {
  if (!store) return '-'
  return Object.entries(store)
    .map(([t, v]) => `${TRACK_KO[t] ?? t} ${v}`)
    .join(' · ')
}

async function followJob(jobId) {
  let shown = 0
  for (;;) {
    const job = await get(`/portfolio/jobs/${jobId}`)
    // 서버는 최근 400줄만 준다 — 처음엔 전체, 이후 새 줄만
    const lines = job.lines ?? []
    if (shown > lines.length) shown = 0
    for (const l of lines.slice(shown)) console.log(l)
    shown = lines.length
    if (job.done) {
      if (!job.ok) process.exit(1)
      return
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
}

async function pickProject(projects) {
  const { createInterface } = await import('node:readline/promises')
  projects.forEach((p, i) => console.log(`${pad(String(i + 1).padStart(2), 4)}${pad(p.name, 22)}${p.codename}  ${p.desc ?? ''}`))
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ans = (await rl.question('\n프로젝트 번호 (Enter=취소): ')).trim()
  rl.close()
  const p = projects[Number(ans) - 1]
  if (!p) process.exit(0)
  return p
}

async function runInProject(id, what) {
  const detail = await get(`/portfolio/projects/${encodeURIComponent(id)}`)
  const project = detail.project
  if (!project.exists) fail(`프로젝트 폴더가 없습니다: ${project.path}`)
  let cmd = null
  let name = null
  if (what) {
    const known = detail.commands.find((c) => c.name === what || c.cmd === what)
    cmd = known?.cmd ?? what
    name = known?.name ?? 'run'
  } else {
    const { createInterface } = await import('node:readline/promises')
    console.log(`${project.name}  ${project.path}\n`)
    detail.commands.forEach((c, i) => console.log(`${pad(String(i + 1).padStart(2), 4)}${pad(c.name, 14)}${c.cmd}${c.learned ? '  (학습됨)' : ''}`))
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ans = (await rl.question('\n번호 또는 직접 명령 (Enter=취소): ')).trim()
    rl.close()
    if (!ans) process.exit(0)
    const picked = detail.commands[Number(ans) - 1]
    cmd = picked?.cmd ?? ans
    name = picked?.name ?? 'run'
  }
  if (!detail.commands.some((c) => c.cmd === cmd)) {
    // planner CLI 와 같이 처음 쓰는 명령은 학습 (서버가 로컬일 때만 허용됨 — 실패해도 실행은 진행)
    await fetch(`${HOST}${PREFIX}/portfolio/projects/${encodeURIComponent(project.id)}/commands`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ cmd, name }),
    }).catch(() => null)
  }
  const { spawn } = await import('node:child_process')
  console.log(`$ ${cmd}   (${project.path})`)
  const child = spawn(cmd, { cwd: project.path, shell: true, stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 0))
}

// ---- 작업 (아이디어·할 일·마일스톤) ------------------------------------------

const WORK_COLS = [
  ['아이디어', ['IDEA']],
  ['할 일', ['PLAN', 'PAUSED']],
  ['진행 중', ['BUILD']],
  ['검토·출시 대기', ['REVIEW', 'SHIP_READY']],
]
const MOVE_ALIAS = {
  idea: 'IDEA', 아이디어: 'IDEA',
  todo: 'PLAN', plan: 'PLAN', 할일: 'PLAN',
  doing: 'BUILD', build: 'BUILD', start: 'BUILD', 진행: 'BUILD', 시작: 'BUILD',
  review: 'REVIEW', 검토: 'REVIEW',
  ready: 'SHIP_READY', ship_ready: 'SHIP_READY', 출시대기: 'SHIP_READY',
  done: 'SHIPPED', shipped: 'SHIPPED', 완료: 'SHIPPED', 출시: 'SHIPPED',
  pause: 'PAUSED', paused: 'PAUSED', 보류: 'PAUSED',
  cancel: 'CANCELLED', cancelled: 'CANCELLED', 취소: 'CANCELLED',
}
const PRIO_KO = { low: '낮음', high: '높음', critical: '긴급' }

async function printWork(id, all = false) {
  const w = await get(`/v4/products/${encodeURIComponent(id)}/work`)
  const msName = new Map(w.milestones.map((m) => [m.id, m.name]))
  if (w.milestones.length) {
    console.log('마일스톤')
    for (const m of w.milestones) {
      const bar = '█'.repeat(Math.round(m.progress / 10)).padEnd(10, '░')
      console.log(`  ${m.status === 'done' ? '✓' : '◆'} ${pad(m.name, 20)}${bar} ${String(m.progress).padStart(3)}%  ${m.done}/${m.total}${m.target_date ? `  ${m.overdue ? '기한 지남 ' : ''}${m.target_date}` : ''}   ${m.id}`)
    }
    console.log('')
  }
  for (const [label, statuses] of WORK_COLS) {
    const items = w.changes.filter((c) => statuses.includes(c.status))
    console.log(`${label} (${items.length})`)
    for (const c of items) {
      const tags = [
        c.status === 'PAUSED' ? '보류' : null,
        c.status === 'SHIP_READY' ? '출시 승인 대기' : null,
        PRIO_KO[c.priority] ?? null,
        c.milestone ? `◆${msName.get(c.milestone) ?? c.milestone}` : null,
      ].filter(Boolean)
      console.log(`  - ${pad(c.name, 34)}${pad(tags.join(' '), 18)}${c.id}`)
      if (c.note) console.log(`      ${c.note.split('\n')[0].slice(0, 80)}`)
    }
  }
  const done = w.changes.filter((c) => ['SHIPPED', 'CANCELLED'].includes(c.status))
  if (all) {
    console.log(`\n끝난 항목 (${done.length})`)
    for (const c of done) console.log(`  ${c.status === 'SHIPPED' ? '✓' : '✗'} ${pad(c.name, 34)}${c.id}`)
  } else if (done.length) {
    console.log(`\n끝난 항목 ${done.length}개 — xita work ${id} --all`)
  }
}

// ---- 기획 위저드 -------------------------------------------------------------

function spinner(label) {
  if (!process.stdout.isTTY) return () => {}
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  const t0 = Date.now()
  let i = 0
  const timer = setInterval(() => {
    process.stdout.write(`\r${frames[i++ % frames.length]} ${label} ${Math.round((Date.now() - t0) / 1000)}초`)
  }, 120)
  return () => {
    clearInterval(timer)
    process.stdout.write('\r\x1b[K')
  }
}

async function planCall(fn, label = 'AI 가 생각하는 중') {
  const stop = spinner(label)
  try {
    return await fn()
  } finally {
    stop()
  }
}

function planHeader(p) {
  const bar = p.stages.map((s, i) => (i < p.stage ? '●' : i === p.stage ? '◉' : '○')).join('')
  console.log(`\n${bar}  ${p.stage + 1}/${p.stages.length} ${p.stages[p.stage].title}${p.draft?.name ? `  — ${p.draft.name}` : ''}`)
}

function planShowLast(p) {
  const m = [...p.messages].reverse().find((x) => x.role === 'assistant')
  if (!m) return []
  console.log(`\n${m.content}`)
  const opts = m.options ?? []
  opts.forEach((o, i) => console.log(`  ${i + 1}) ${o}`))
  if (m.source === 'rule') console.log('  (AI 연결 없음 — 기본 질문)')
  return opts
}

async function planLoop(p) {
  const { createInterface } = await import('node:readline/promises')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const bye = () => {
    console.log(`\n저장됐어요. 이어 하려면: xita plan resume ${p.id}`)
    process.exit(0)
  }
  rl.on('SIGINT', bye)
  // 입력이 끝나면(Ctrl+D·파이프 종료) 저장 상태로 끝낸다
  const ask = (q) => rl.question(q).catch(() => bye())
  planHeader(p)
  let opts = planShowLast(p)
  for (;;) {
    const ans = (await ask('\n› ')).trim()
    if (!ans) continue
    const cmd = ans.toLowerCase()
    try {
      if (['/나가기', '/exit', '/quit', '/q'].includes(cmd)) {
        console.log(`저장됐어요. 이어 하려면: xita plan resume ${p.id}`)
        break
      }
      if (['/도움', '/help', '/?'].includes(cmd)) {
        console.log('번호=선택지 · 자유롭게 답하기 · /다음 · /뒤로 · /요약 · /확정 · /중단 · /나가기')
        continue
      }
      if (['/요약', '/summary', '/show'].includes(cmd)) {
        const cur = await call('GET', `/v4/plans/${p.id}`)
        console.log(`\n${cur.markdown}`)
        if (cur.problems.length) console.log(`확정 전에 채울 것:\n- ${cur.problems.join('\n- ')}`)
        continue
      }
      if (['/다음', '/next', '/n'].includes(cmd) || ['/뒤로', '/back', '/prev', '/b'].includes(cmd)) {
        const to = cmd.startsWith('/다') || cmd.startsWith('/n') ? 'next' : 'prev'
        if (to === 'next' && p.stage >= p.stages.length - 1) {
          console.log('마지막 단계예요. 확정하려면 /확정')
          continue
        }
        if (to === 'prev' && p.stage === 0) {
          console.log('첫 단계예요.')
          continue
        }
        p = await planCall(() => call('POST', `/v4/plans/${p.id}/stage`, { to }))
        planHeader(p)
        opts = planShowLast(p)
        continue
      }
      if (['/확정', '/confirm'].includes(cmd)) {
        const cur = await call('GET', `/v4/plans/${p.id}`)
        if (cur.problems.length) {
          console.log(`아직 확정할 수 없어요:\n- ${cur.problems.join('\n- ')}`)
          continue
        }
        console.log(`\n${cur.markdown}`)
        if (cur.gaps?.length) console.log(`아직 비어 있는 단계: ${cur.gaps.join(', ')} — 지금 확정해도 되고, 나중에 기획서를 고쳐도 돼요.`)
        const ok = (await ask('이 기획으로 프로젝트를 만들까요? 제품·마일스톤·할 일이 생성돼요 (yes/no): ')).trim().toLowerCase()
        if (!['y', 'yes', '네', 'ㅇ', '예'].includes(ok)) continue
        const r = await call('POST', `/v4/plans/${p.id}/confirm`, {})
        console.log(`\n확정했어요 → 제품 ${r.product}`)
        for (const m of r.milestones) console.log(`  ◆ ${m.name}`)
        console.log(`\n다음: xita work ${r.product}   ·   웹: ${HOST}/app/#/projects`)
        break
      }
      if (['/중단', '/abandon'].includes(cmd)) {
        const ok = (await ask('이 기획을 중단할까요? (초안은 남아요) (yes/no): ')).trim().toLowerCase()
        if (!['y', 'yes', '네', 'ㅇ', '예'].includes(ok)) continue
        await call('POST', `/v4/plans/${p.id}/abandon`, {})
        console.log('중단했어요.')
        break
      }
      if (ans.startsWith('/')) {
        console.log('모르는 명령이에요. /도움')
        continue
      }
      const n = Number(ans)
      const message = Number.isInteger(n) && n >= 1 && n <= opts.length ? opts[n - 1] : ans
      if (message !== ans) console.log(`  → ${message}`)
      p = await planCall(() => call('POST', `/v4/plans/${p.id}/turn`, { message }))
      const st = p.stages[p.stage].key
      opts = planShowLast(p)
      if (p.ready?.[st] && p.stage < p.stages.length - 1) console.log('  (이 단계는 충분해요 — /다음 으로 넘어가요)')
    } catch (e) {
      console.log(`문제가 생겼어요: ${e.message}`)
    }
  }
  rl.close()
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

    case 'promo': {
      const sub = a._[0]
      const STATUS = { draft: '초안', scheduled: '예정', posted: '게시됨', archived: '보관' }
      if (sub === 'communities') {
        const r = await get('/portfolio/promo')
        for (const c of r.communities) console.log(`${pad(c.id, 22)}${pad(c.name, 30)}${c.lang}  ${c.rules ? `규칙: ${c.rules}` : '규칙 미확인'}`)
        return
      }
      if (sub === 'draft') {
        const [, project, ...comm] = a._
        if (!project || !comm.length) fail('usage: xita promo draft P 커뮤니티 [--angle "강조점"] [--en]')
        const r = await planCall(
          () => post('/portfolio/promo/draft', { project, community: comm.join(' '), angle: typeof a.angle === 'string' ? a.angle : undefined, lang: a.en ? 'en' : undefined }),
          'AI 가 초안을 쓰는 중'
        )
        const p = r.post
        console.log(`초안 ${p.id}  (${p.community} · ${p.ai_source})\n`)
        if (p.title) console.log(`${p.title}\n`)
        console.log(p.body.replace(/<!-- 게시 전 확인: ([\s\S]*?) -->/, '\n[게시 전 확인] $1'))
        return
      }
      if (sub === 'show') {
        const id = a._[1] ?? fail('usage: xita promo show ID')
        const r = await get('/portfolio/promo')
        const p = r.posts.find((x) => x.id === id) ?? fail(`없는 홍보글: ${id}`)
        if (p.title) console.log(`${p.title}\n`)
        console.log(p.body.replace(/<!--[\s\S]*?-->/g, '').trim())
        return
      }
      if (sub === 'posted') {
        const [, id, url] = a._
        if (!id) fail('usage: xita promo posted ID [URL]')
        await post(`/portfolio/promo/${encodeURIComponent(id)}`, { status: 'posted', ...(url ? { url } : {}) })
        console.log('게시됨으로 기록했습니다')
        return
      }
      const r = await get(`/portfolio/promo${sub ? `?project=${encodeURIComponent(sub)}` : ''}`)
      if (!r.posts.length) {
        console.log('홍보글이 없습니다 — xita promo draft P 커뮤니티')
        return
      }
      for (const p of r.posts) {
        const eff = p.effect && p.effect.after.days ? `  게시 후 7일 $${p.effect.after.earnings.toFixed(2)} (전 $${p.effect.before.earnings.toFixed(2)})` : ''
        console.log(`${pad(STATUS[p.status] ?? p.status, 8)}${pad(p.project, 16)}${pad(p.community, 24)}${(p.title || p.body).split('\n')[0].slice(0, 40)}  ${p.id}${eff}`)
      }
      return
    }

    case 'advice': {
      const r = a.run
        ? await planCall(() => post('/portfolio/monitor/run', { force: true }), '점검 중')
        : await get('/portfolio/monitor')
      const rep = r.report
      if (!rep) {
        console.log('아직 점검 결과가 없습니다 — xita advice --run')
        return
      }
      const src = rep.source === 'rule' ? '규칙' : rep.source
      console.log(`${String(rep.at).replace('T', ' ').slice(0, 16)} 점검 · ${src} · 7일 수익 $${(rep.revenue?.total7d ?? 0).toFixed(2)} (지난주 $${(rep.revenue?.prev7d ?? 0).toFixed(2)})\n`)
      const mark = { high: '!!', medium: ' !', low: '  ' }
      for (const x of rep.advice) {
        console.log(`${mark[x.impact] ?? '  '} ${x.title}${x.project ? `  [${x.project}]` : ''}`)
        if (x.why) console.log(`    왜: ${x.why}`)
        if (x.action) console.log(`    →  ${x.action}`)
      }
      if (!rep.advice.length) console.log('지금은 손볼 게 없습니다.')
      if (rep.errors?.length) console.log(`\n점검 중 문제: ${rep.errors.join(' / ')}`)
      return
    }

    case 'ai': {
      if (a._[0] === 'test') {
        const [, provider, model] = a._
        if (!provider || !model) fail('usage: xita ai test PROVIDER MODEL')
        const r = await planCall(() => post('/v4/ai/test', { provider, model }), `${provider}/${model} 연결 확인`)
        console.log(`OK ${r.ms}ms — "${r.text}"`)
        return
      }
      const st = await get('/v4/ai/status')
      const usage = await get('/v4/ai/usage?days=7')
      console.log(`설정: ${st.source === 'file' ? st.path : '기본값 (ai.json 없음)'}${st.fileError ? `  ⚠ ${st.fileError}` : ''}\n`)
      console.log('provider')
      for (const p of st.providers) {
        const key = p.keyConfigured === false ? '  ⚠ 키 없음' : ''
        console.log(`  ${pad(p.id, 16)}${pad(p.kind, 6)}${pad(p.local ? '로컬' : '외부', 6)}${p.enabled === false ? '꺼짐 ' : ''}${(p.models ?? []).join(', ')}${key}`)
      }
      console.log('\n작업별 체인 (앞에서부터 시도)')
      for (const t of st.tasks) console.log(`  ${pad(t, 10)}${(st.routes[t] ?? []).map((x) => `${x.provider}/${x.model}`).join(' → ') || '(없음 — 규칙만)'}`)
      console.log(`\n최근 7일: 호출 ${usage.calls} · 실패 ${usage.failures}`)
      for (const r of usage.byProvider) console.log(`  ${pad(`${r.provider}/${r.model}`, 44)}${String(r.calls).padStart(4)}회  실패 ${r.failures}  평균 ${(r.avgMs / 1000).toFixed(1)}초  토큰 ${r.in}/${r.out}`)
      return
    }

    case 'plan': {
      const sub = a._[0]
      if (sub === 'show') {
        const id = a._[1] ?? fail('usage: xita plan show ID')
        const p = await get(`/v4/plans/${encodeURIComponent(id)}`)
        console.log(p.markdown)
        return
      }
      if (sub === 'new') {
        const idea = a._.slice(1).join(' ').trim()
        const p = await planCall(() => post('/v4/plans', idea ? { idea } : {}), '기획을 시작하는 중')
        console.log(`새 기획 ${p.id} — 확정 전까지는 초안만 저장돼요. /도움 으로 명령 보기`)
        await planLoop(p)
        return
      }
      let id = sub === 'resume' ? a._[1] : sub
      if (!id) {
        const list = await get('/v4/plans')
        const open = list.filter((x) => x.status === 'drafting')
        if (open.length) {
          console.log('작성 중인 기획')
          open.forEach((x, i) => console.log(`  ${i + 1}) ${pad(x.name, 24)}${x.stage + 1}/${x.stages} ${pad(x.stageTitle, 16)}${String(x.updated_at).slice(0, 10)}  ${x.id}`))
        }
        const done = list.filter((x) => x.status !== 'drafting').slice(0, 5)
        if (done.length) {
          console.log('최근 끝난 기획')
          for (const x of done) console.log(`     ${pad(x.name, 24)}${x.status === 'confirmed' ? `확정 → ${x.product}` : '중단'}`)
        }
        const { createInterface } = await import('node:readline/promises')
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        const ans = (await rl.question(`\n${open.length ? '번호=이어 하기 · ' : ''}새로 시작하려면 아이디어 한 줄 (Enter=취소): `)).trim()
        rl.close()
        if (!ans) return
        const n = Number(ans)
        if (Number.isInteger(n) && open[n - 1]) id = open[n - 1].id
        else {
          const p = await planCall(() => post('/v4/plans', { idea: ans }), '기획을 시작하는 중')
          console.log(`새 기획 ${p.id}`)
          await planLoop(p)
          return
        }
      }
      const p = await get(`/v4/plans/${encodeURIComponent(id)}`)
      if (p.status !== 'drafting') {
        console.log(p.status === 'confirmed' ? `이미 확정된 기획이에요 → ${p.product}` : '중단된 기획이에요')
        return
      }
      await planLoop(p)
      return
    }

    case 'work': {
      const id = a._[0] ?? (await pickProject(await get('/portfolio/projects'))).id
      await printWork(id, !!a.all)
      return
    }

    case 'idea':
    case 'todo': {
      const [first, ...words] = a._
      // 'xita idea "내용"' (프로젝트 없이) → 메모함
      if (cmd === 'idea' && first && !words.length) {
        const doc = await post('/v4/workbench', { title: first, workType: 'idea' })
        console.log(`메모함에 담았습니다: ${doc.meta?.name ?? first}  (${doc.id})`)
        return
      }
      const title = words.join(' ').trim()
      if (!first || !title) fail(`usage: xita ${cmd} P "내용"`)
      const body = { title, status: cmd === 'idea' ? 'IDEA' : a.doing ? 'BUILD' : 'PLAN' }
      if (typeof a.ms === 'string') body.milestone = a.ms
      if (typeof a.note === 'string') body.note = a.note
      if (a.high) body.priority = 'high'
      const doc = await post(`/v4/products/${encodeURIComponent(first)}/changes`, body)
      console.log(`${cmd === 'idea' ? '아이디어' : a.doing ? '진행 중' : '할 일'}: ${title}  (${doc.id})`)
      return
    }

    case 'move': {
      const [id, to] = a._
      const status = MOVE_ALIAS[String(to ?? '').toLowerCase()] ?? String(to ?? '').toUpperCase()
      if (!id || !to) fail('usage: xita move ID 상태  (idea·todo·doing·review·ready·done·pause·cancel)')
      const doc = await post(`/v4/changes/${encodeURIComponent(id)}/transition`, {
        lifecycle: status,
        ...(typeof a.note === 'string' ? { note: a.note } : {}),
      })
      console.log(`${doc.meta?.name ?? id} → ${status}`)
      return
    }

    case 'edit': {
      const id = a._[0] ?? fail('usage: xita edit ID [--title T] [--note N] [--priority P] [--ms M|none]')
      const body = {}
      if (typeof a.title === 'string') body.title = a.title
      if (typeof a.note === 'string') body.note = a.note
      if (typeof a.priority === 'string') body.priority = a.priority
      if (Object.keys(body).length) await post(`/v4/changes/${encodeURIComponent(id)}/edit`, body)
      if (typeof a.ms === 'string') await post(`/v4/changes/${encodeURIComponent(id)}/milestone`, { milestone: a.ms })
      console.log('저장했습니다')
      return
    }

    case 'ms': {
      const [id, name] = a._
      if (!id) fail('usage: xita ms P ["이름" [--due YYYY-MM-DD]] [--done ID]')
      if (typeof a.done === 'string') {
        await post(`/v4/milestones/${encodeURIComponent(a.done)}/status`, { status: 'done' })
        console.log('완료로 표시했습니다')
        return
      }
      if (name) {
        const doc = await post(`/v4/products/${encodeURIComponent(id)}/milestones`, {
          name,
          ...(typeof a.due === 'string' ? { targetDate: a.due } : {}),
        })
        console.log(`마일스톤: ${name}  (${doc.id})`)
        return
      }
      const w = await get(`/v4/products/${encodeURIComponent(id)}/work`)
      if (!w.milestones.length) console.log(`마일스톤이 없습니다 — xita ms ${id} "MVP" --due 2026-12-01`)
      for (const m of w.milestones)
        console.log(`${m.status === 'done' ? '✓' : '◆'} ${pad(m.name, 20)}${String(m.progress).padStart(3)}%  ${m.done}/${m.total}${m.target_date ? `  ${m.overdue ? '기한 지남 ' : ''}${m.target_date}` : ''}   ${m.id}`)
      return
    }

    case 'projects': {
      const list = await get(`/portfolio/projects${a.all ? '?archived=1' : ''}`)
      if (!list.length) {
        console.log('등록된 프로젝트가 없습니다 — xita import-planner 또는 웹 콘솔에서 추가')
        return
      }
      for (const p of list) {
        const flags = [
          p.archived ? '보관' : null,
          p.pendingRelease ? '출시 대기' : null,
          p.needsYou ? `결정 ${p.needsYou}` : null,
          !p.exists ? '폴더 없음' : null,
        ].filter(Boolean)
        const ver = p.versionName ? `v${p.versionName} (${p.versionCode})` : p.kind
        console.log(
          `${pad(p.id, 20)}${pad(p.name, 20)}${pad(STATUS_KO[p.status] ?? p.status ?? '-', 10)}${pad(ver, 18)}${pad(storeText(p.store), 26)}${flags.join(' · ')}`
        )
      }
      return
    }

    case 'project': {
      const id = a._[0] ?? requireArg(a, 'project', 'usage: xita project P')
      const d = await get(`/portfolio/projects/${encodeURIComponent(id)}`)
      const p = d.project
      console.log(`${p.name} (${p.codename}) — ${STATUS_KO[p.status] ?? p.status ?? '-'}${p.monetization ? ' · ' + p.monetization : ''}`)
      console.log(`  경로     ${p.path}${p.exists ? '' : '  (없음)'}`)
      console.log(`  종류     ${p.kind}${p.git ? ' · git' : ''}${p.versionName ? ` · v${p.versionName} (${p.versionCode})` : ''}`)
      if (p.store) console.log(`  스토어   ${storeText(p.store)}${p.pendingRelease ? '  → 출시 대기' : ''}`)
      if (d.commands.length) console.log(`  명령     ${d.commands.map((c) => c.name).join(', ')}`)
      const active = d.changes.filter((c) => !['SHIPPED', 'CANCELLED'].includes(c.status))
      if (active.length) console.log(`  할 일    ${active.map((c) => `${c.name}[${c.status}]`).join(', ')}`)
      for (const e of d.timeline.slice(0, 5)) console.log(`  · ${String(e.ts).slice(0, 10)} ${e.title}`)
      return
    }

    case 'run': {
      let id = a._[0]
      if (!id) id = (await pickProject(await get('/portfolio/projects'))).id
      await runInProject(id, a._.slice(1).join(' ') || null)
      return
    }

    case 'build': {
      const id = a._[0] ?? fail('usage: xita build P [--release]')
      const { jobId } = await post(`/portfolio/projects/${encodeURIComponent(id)}/build`, { release: !!a.release })
      await followJob(jobId)
      return
    }

    case 'deploy': {
      const id = a._[0] ?? fail('usage: xita deploy P [--track T] [--notes N] [--yes]')
      const track = typeof a.track === 'string' ? a.track : 'internal'
      if (track === 'production' && !a.yes && !a['dry-run']) fail('프로덕션 배포는 --yes 로 확인해야 합니다 (라이브 사용자에게 나갑니다)')
      const { jobId } = await post(`/portfolio/projects/${encodeURIComponent(id)}/deploy`, {
        track,
        bump: !a['no-bump'],
        confirmed: !!a.yes,
        notes: typeof a.notes === 'string' ? a.notes : undefined,
        notesEn: typeof a['notes-en'] === 'string' ? a['notes-en'] : undefined,
        dryRun: !!a['dry-run'],
      })
      await followJob(jobId)
      return
    }

    case 'agent': {
      const id = a._[0] ?? fail('usage: xita agent P ["할 일"] [--change ID] [--codex] [--print]')
      const body = { launch: !a.print, agent: a.codex ? 'codex' : 'claude' }
      if (a._[1]) body.task = a._.slice(1).join(' ')
      if (typeof a.change === 'string') body.change = a.change
      const r = await post(`/portfolio/projects/${encodeURIComponent(id)}/agent`, body)
      if (a.print) console.log(r.prompt)
      else console.log(`${r.agent} 를 터미널에서 열었어요 → ${r.cwd}`)
      return
    }

    case 'log': {
      const id = a._[0] ?? fail('usage: xita log P [--add "메모"] [--kind K]')
      if (typeof a.add === 'string') {
        const { entry } = await post(`/portfolio/projects/${encodeURIComponent(id)}/log`, {
          text: a.add,
          kind: typeof a.kind === 'string' ? a.kind : undefined,
        })
        console.log(`기록됨 ${entry.date} · ${entry.kind}`)
        return
      }
      const { entries, path } = await get(`/portfolio/projects/${encodeURIComponent(id)}/log`)
      console.log(path)
      if (!entries.length) console.log('(기록 없음)')
      for (const e of entries) console.log(`\n${e.date} · ${e.kind}  {#${e.id}}${e.body ? '\n  ' + e.body.replace(/\n/g, '\n  ') : ''}`)
      return
    }

    case 'sync': {
      const { jobId } = await post('/portfolio/sync')
      await followJob(jobId)
      return
    }

    case 'jobs': {
      if (a._[0]) {
        await followJob(a._[0])
        return
      }
      const jobs = await get('/portfolio/jobs')
      if (!jobs.length) console.log('(작업 없음)')
      for (const j of jobs)
        console.log(`${j.id}  ${j.done ? (j.ok ? '완료' : '실패') : '진행 중'}  ${j.label}  ${j.lastLine ?? ''}`)
      return
    }

    case 'changelog': {
      const q = a._[0] ? `?project=${encodeURIComponent(a._[0])}` : ''
      const { entries } = await get(`/portfolio/changelog${q}`)
      let day = ''
      for (const e of entries.slice(0, 80)) {
        if (e.date !== day) console.log(`\n${(day = e.date)}`)
        console.log(`  ${e.when.slice(11)}  ${pad(e.app, 18)}${e.title}  (${e.hash} · ${e.author})`)
      }
      return
    }

    case 'import-planner': {
      const r = await post('/portfolio/import/planner', {
        from: typeof a.from === 'string' ? a.from : undefined,
        dryRun: !!a['dry-run'],
      })
      const count = (xs) => xs.reduce((m, x) => ((m[x.action] = (m[x.action] ?? 0) + 1), m), {})
      console.log(`${r.dryRun ? '[미리보기] ' : ''}${r.from} → ${r.workspace}`)
      console.log(`원문 보관  ${r.archive.files}개 파일 ${r.archive.reused ? '(동일 스냅샷 재사용) ' : ''}${r.archive.dir}`)
      console.log(`비밀 제외  ${r.archive.excludedSecrets.join(', ') || '-'}`)
      console.log(`프로젝트   ${JSON.stringify(count(r.projects))}`)
      console.log(`문서       ${JSON.stringify(count(r.artifacts))}`)
      console.log(`앱 기록    이관 ${r.logs.imported} / 기존 ${r.logs.skipped}`)
      for (const w of r.warnings) console.log(`! ${w}`)
      return
    }

    case 'console':
      console.log(`${HOST}/app/`)
      return

    default:
      usage()
      fail(`unknown command "${cmd}"`)
  }
}

main().catch((e) => fail(e?.message ?? String(e)))