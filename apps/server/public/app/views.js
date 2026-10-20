/*
 * XITA 웹 콘솔 — 페이지 뷰 (홈 · 프로젝트 · 결정할 일 · 활동 · 수익 · 문서 · 설정)
 * 프로젝트 상세는 project.js. 이벤트는 data-action / data-form 위임으로 H 에 등록한다.
 */
import {
  html, raw, mount, $, api, pf, v4, groupBy, debounce, esc, store,
  statusLabel, statusTone, trackLabel, kindLabel, monetizationLabel, needsTypeLabel,
  priorityLabel, priorityTone, eventLabel, artifactKindLabel, TRACK_ORDER,
  fmtMB, fmtUnix, fmtRelative, fmtDay, fmtNum, fmtUSD,
} from './lib.js'
import { S, projects, playKey, productName, adStatus, missingAssets, isLive, loadArchived, findProject } from './state.js'
import { themeControl, openMenu, confirmDialog, toast, toastError } from './ui.js'
import * as A from './actions.js'
import { renderMarkdown } from './markdown.js'

/** data-action 핸들러 레지스트리: H[name](el, event) */
export const H = {}
/** data-form 제출 핸들러: F[name](form, event) */
export const F = {}

// ── 공통 컴포넌트 ──────────────────────────────────────────────────────────
export const badge = (label, tone = 'muted', title = '') =>
  html`<span class="badge badge-${tone}"${title ? html` title="${title}"` : ''}>${label}</span>`

export function pageHead(title, sub = '', actions = '') {
  return html`<header class="page-head">
    <div><h1 class="page-title">${title}</h1>${sub ? html`<p class="page-sub">${sub}</p>` : ''}</div>
    ${actions ? html`<div class="page-actions">${actions}</div>` : ''}
  </header>`
}

export function emptyState({ title, desc = '', cta = '' }) {
  return html`<div class="empty"><div class="empty-title">${title}</div>${desc ? html`<p class="empty-desc">${desc}</p>` : ''}${cta ? html`<div class="empty-cta">${cta}</div>` : ''}</div>`
}

export function errorState(err, retryAction = 'reload') {
  return html`<div class="empty empty-error" role="alert">
    <div class="empty-title">불러오지 못했어요</div>
    <p class="empty-desc">${err?.message ?? String(err)}</p>
    <div class="empty-cta"><button type="button" class="btn" data-action="${retryAction}">다시 시도</button></div>
  </div>`
}

export const skeleton = (rows = 3, cls = 'sk-row') =>
  html`<div class="sk-wrap" aria-busy="true" aria-label="불러오는 중">${Array.from({ length: rows }, () => html`<div class="sk ${cls}"></div>`)}</div>`

const kbd = (k) => html`<kbd>${k}</kbd>`

// ── 프로젝트 칩 (planner 대시보드 칩 전부) ──────────────────────────────────
const AD = { live: ['실광고', 'ok'], test: ['테스트 광고', 'warn'], none: ['광고 없음', 'muted'] }

export function storeBadges(p, { compact = false } = {}) {
  if (!p.store) return badge(compact ? '스토어 미조회' : '스토어 미조회 · 동기화하면 표시', 'muted')
  const present = TRACK_ORDER.filter((t) => p.store[t] != null)
  const out = present.map((t) => badge(`${trackLabel(t)} ${p.store[t]}`, t === 'production' ? 'info' : 'muted'))
  if (!present.length) out.push(badge('스토어 릴리스 없음', 'muted'))
  if (p.pendingRelease) out.push(badge('프로덕션 갱신 대기', 'accent', '로컬 versionCode 가 프로덕션보다 높아요'))
  return out
}

export function statusChips(p) {
  if (p.kind !== 'android') {
    return p.kind === 'missing' || !p.exists ? [badge('폴더 없음', 'bad')] : []
  }
  const [adLabel, adTone] = AD[adStatus(p)]
  const ck = (on, okL, badL) => badge(on ? okL : badL, on ? 'ok' : 'bad')
  return [
    ck(p.keystore, '키스토어', '키스토어 없음'),
    badge(adLabel, adTone),
    ck(p.privacy, '방침', '방침 없음'),
    ck(p.listing, '스토어 문구', '문구 없음'),
    ck(p.graphic, '피처 그래픽', '그래픽 없음'),
    p.aab ? badge(`AAB ${fmtMB(p.aab.size)} · ${fmtUnix(p.aab.builtAt)}`, 'muted') : badge('AAB 없음', 'bad'),
  ]
}

export function versionText(p) {
  if (p.kind === 'android') return `v${p.versionName || '?'} (${p.versionCode ?? '?'})`
  return p.versionName ? `v${p.versionName}` : ''
}

// ── 카드 액션 메뉴 ─────────────────────────────────────────────────────────
export function projectMenuItems(p) {
  const android = p.kind === 'android'
  const items = [
    { label: '열기', run: () => { location.hash = `#/projects/${encodeURIComponent(p.id)}` } },
  ]
  if (android && !p.archived) {
    items.push(
      'sep',
      { label: '디버그 빌드', run: () => A.build(p.id, false) },
      { label: 'AAB 빌드', run: () => A.build(p.id, true) },
      { label: '배포…', run: () => { location.hash = `#/projects/${encodeURIComponent(p.id)}/deploy` } },
      { label: '광고 ID…', run: () => { location.hash = `#/projects/${encodeURIComponent(p.id)}/ads` } },
    )
  }
  items.push(
    ...(p.archived ? [] : [{ label: 'AI 에게 맡기기…', run: () => A.askAgent(p.id) }]),
    { label: '기록', hint: p.logCount ? String(p.logCount) : '', run: () => { location.hash = `#/projects/${encodeURIComponent(p.id)}/log` } },
    { label: '경로 복사', run: () => A.copyText(p.path, '경로를 복사했어요') },
    'sep',
    p.archived
      ? { label: '복원', run: () => A.setArchived(p.id, false) }
      : { label: '보관…', danger: true, run: () => A.setArchived(p.id, true) },
  )
  return items
}

H['project-menu'] = (el) => {
  const p = findProject(el.dataset.id)
  if (p) openMenu(el, projectMenuItems(p))
}

// ════════════════════════════════════════════════════════════════════════
// 홈
// ════════════════════════════════════════════════════════════════════════
function todoItems() {
  const out = []
  if (S.overview && !playKey()) {
    out.push({
      tone: 'warn', kind: '설정 필요', title: 'Play 서비스 계정 키가 없어 배포가 꺼져 있어요',
      desc: 'play-account.json 을 비밀 폴더에 두면 배포 버튼이 켜집니다.', href: '#/settings', cta: '설정 보기',
    })
  }
  for (const n of S.needs.slice(0, 8)) {
    out.push({
      tone: priorityTone(n.priority), kind: needsTypeLabel(n.type), title: n.title,
      desc: [n.product ? productName(n.product) : '', n.summary].filter(Boolean).join(' · '),
      href: '#/decide', cta: '결정하기',
    })
  }
  const live = projects().filter((p) => !p.archived)
  for (const p of live.filter((x) => x.pendingRelease)) {
    out.push({
      tone: 'accent', kind: '출시 대기', title: `${p.name} 새 버전을 프로덕션에 낼 수 있어요`,
      desc: `로컬 ${versionText(p)} · 프로덕션 ${p.store?.production ?? '—'}`,
      href: `#/projects/${encodeURIComponent(p.id)}/deploy`, cta: '배포',
    })
  }
  for (const p of live) {
    const miss = missingAssets(p)
    if (!miss.length) continue
    out.push({
      tone: 'muted', kind: '출시 준비물', title: `${p.name} — ${miss.join(', ')} 없음`,
      desc: '스토어 등록·업데이트 전에 채워야 해요.', href: `#/projects/${encodeURIComponent(p.id)}`, cta: '확인',
    })
  }
  return out
}

function kpi(label, value, href, hint = '') {
  return html`<a class="kpi" href="${href}"><span class="kpi-label">${label}</span><span class="kpi-value">${value}</span>${hint ? html`<span class="kpi-hint">${hint}</span>` : ''}</a>`
}

function timelineList(events, { showProduct = true } = {}) {
  if (!events.length) return emptyState({ title: '아직 기록된 활동이 없어요', desc: '배포·앱 기록·승인 같은 일이 생기면 여기에 쌓여요.' })
  return html`<ol class="feed">${events.map((e) => html`<li class="feed-item">
    <span class="feed-dot" aria-hidden="true"></span>
    <div class="feed-main">
      <div class="feed-title">${e.title || eventLabel(e.event_type)}</div>
      <div class="feed-meta">${badge(eventLabel(e.event_type), 'muted')}${showProduct && e.product ? html`<a href="#/projects/${encodeURIComponent(e.product)}">${productName(e.product)}</a>` : ''}<time datetime="${e.ts}" title="${e.ts ? new Date(e.ts).toLocaleString('ko-KR') : ''}">${fmtRelative(e.ts)}</time></div>
      ${e.summary ? html`<div class="feed-summary">${e.summary}</div>` : ''}
    </div></li>`)}</ol>`
}

export async function renderHome(view, live) {
  const t = S.overview?.totals ?? {}
  const todos = todoItems()
  mount(view, html`
    ${pageHead('홈', S.overview?.portfolio?.name ? `${S.overview.portfolio.name} 포트폴리오` : '')}
    ${S.overviewError ? errorState(S.overviewError) : ''}
    <section class="kpis kpis-5" aria-label="요약">
      ${kpi('프로젝트', S.overview ? fmtNum(t.projects ?? projects().length) : '—', '#/projects', S.overview ? `Android ${fmtNum(t.android ?? 0)}` : '')}
      ${kpi('라이브', S.overview ? fmtNum(t.live ?? 0) : '—', '#/projects?f=live')}
      ${kpi('출시 대기', S.overview ? fmtNum(t.pendingRelease ?? 0) : '—', '#/projects?f=pending', '프로덕션보다 새 빌드')}
      ${kpi('결정할 일', fmtNum(S.needs.length), '#/decide')}
      ${kpi('7일 수익', S.overview ? fmtUSD(projects().reduce((n, p) => n + (p.revenue7d?.earnings ?? 0), 0)) : '—', '#/revenue', '저장된 애드몹 기록')}
    </section>
    <section class="panel" aria-labelledby="advice-title">
      <div class="panel-head"><h2 class="panel-title" id="advice-title">오늘의 조언</h2>
        <span class="muted" id="advice-meta"></span>
        <button type="button" class="btn btn-sm" data-action="monitor-run">지금 점검</button></div>
      <div id="advice-box">${skeleton(3)}</div>
    </section>
    <section class="panel" aria-labelledby="pulse-title">
      <div class="panel-head"><h2 class="panel-title" id="pulse-title">프로젝트 현황</h2><span class="muted">최근 소식 순</span></div>
      ${!S.ready ? skeleton(5) : pulseList()}
    </section>
    <form class="capture" data-form="capture" aria-label="빠른 메모">
      <input name="text" class="input capture-input" placeholder="떠오른 아이디어나 할 일을 적고 Enter — 워크벤치에 담아요" autocomplete="off" aria-label="빠른 메모">
      <button type="submit" class="btn btn-primary">담기</button>
    </form>
    <div class="cols">
      <section class="panel">
        <div class="panel-head"><h2 class="panel-title">지금 할 일</h2><span class="muted">${todos.length}</span></div>
        ${!S.ready ? skeleton(4) : todos.length ? html`<ul class="todo">${todos.map((it) => html`<li class="todo-item">
          ${badge(it.kind, it.tone)}
          <div class="todo-main"><div class="todo-title">${it.title}</div>${it.desc ? html`<div class="todo-desc">${it.desc}</div>` : ''}</div>
          <a class="btn btn-sm" href="${it.href}">${it.cta}</a></li>`)}</ul>`
          : emptyState({ title: '할 일이 없어요', desc: '결정 대기·출시 대기·빠진 준비물이 모두 정리됐어요.' })}
      </section>
      <section class="panel">
        <div class="panel-head"><h2 class="panel-title">최근 활동</h2><a class="link" href="#/activity">전체 보기</a></div>
        <div id="home-feed">${skeleton(4)}</div>
      </section>
    </div>`)
  loadAdvice(live)
  try {
    const events = await v4('/timeline?limit=10')
    if (!live()) return
    mount($('#home-feed'), timelineList(Array.isArray(events) ? events : []))
  } catch (e) {
    if (live()) mount($('#home-feed'), errorState(e))
  }
}

/* 컨트롤 타워: 프로젝트마다 지금 진행 중인 것 · 마지막 소식 · 7일 수익 · 바로 할 수 있는 다음 행동 */
function pulseList() {
  const list = projects().filter((p) => !p.archived)
    .sort((a, b) => String(b.latest?.ts ?? '').localeCompare(String(a.latest?.ts ?? '')))
  if (!list.length) return emptyState({ title: '프로젝트가 없어요', cta: html`<a class="btn btn-primary" href="#/plan">새 프로젝트 기획</a>` })
  return html`<ul class="pulse">${list.map((p) => {
    const enc = encodeURIComponent(p.id)
    const w = p.work ?? {}
    const now = p.running
      ? html`<span class="pulse-run"><span class="dot dot-run" aria-hidden="true"></span>${p.running}</span>`
      : w.doingTitles?.length
        ? html`<span>${w.doingTitles[0]}${w.doingTitles.length > 1 ? html` <span class="muted">외 ${w.doing + w.review - 1}</span>` : ''}</span>`
        : w.todo || w.idea ? html`<span class="muted">할 일 ${w.todo} · 아이디어 ${w.idea}</span>` : html`<span class="muted">진행 중인 작업 없음</span>`
    const r = p.revenue7d
    const trend = r && r.prev >= 0.01 ? Math.round(((r.earnings - r.prev) / r.prev) * 100) : null
    return html`<li class="pulse-row">
      <div class="pulse-name"><a href="#/projects/${enc}">${p.name}</a>${badge(statusLabel(p.status), statusTone(p.status))}</div>
      <div class="pulse-now"><span class="pulse-label">진행</span>${now}</div>
      <div class="pulse-latest"><span class="pulse-label">최근</span>${p.latest ? html`<span class="pulse-latest-text" title="${p.latest.title}">${p.latest.title}</span> <span class="muted">${fmtRelative(p.latest.ts)}</span>` : html`<span class="muted">기록 없음</span>`}</div>
      <div class="pulse-rev num"><span class="pulse-label">7일</span>${r ? html`${fmtUSD(r.earnings)}${trend !== null ? html` <span class="${trend >= 0 ? 'up' : 'down'}">${trend >= 0 ? '▲' : '▼'}${Math.abs(trend)}%</span>` : ''}` : html`<span class="muted">—</span>`}</div>
      <div class="pulse-act">${p.pendingRelease
        ? html`<a class="btn btn-sm btn-primary" href="#/projects/${enc}/deploy">배포</a>`
        : html`<a class="btn btn-sm" href="#/projects/${enc}/work">작업</a>`}</div>
    </li>`
  })}</ul>`
}

/* 오늘의 조언 — 상시 모니터링(규칙 신호 → 로컬 AI) 결과. 자동으로 고치지 않고 할 일과 바로가기만 */
const IMPACT = { high: ['효과 큼', 'bad'], medium: ['효과 보통', 'warn'], low: ['참고', 'muted'] }

function adviceView(rep) {
  if (!rep) return emptyState({ title: '아직 점검 결과가 없어요', desc: '서버가 6시간마다 수익·출시·작업 상태를 점검하고 조언을 남겨요. 지금 점검을 눌러 바로 시작할 수 있어요.' })
  if (!rep.advice.length) return emptyState({ title: '지금은 손볼 게 없어요', desc: `신호 ${rep.signals.length}개 · 모두 처리했거나 숨겼어요.` })
  return html`<ul class="advice">${rep.advice.map((a) => html`<li class="advice-item">
      ${badge(...IMPACT[a.impact] ?? IMPACT.medium)}
      <div class="advice-main"><div class="advice-title">${a.title}</div>
        ${a.why ? html`<div class="advice-why">${a.why}</div>` : ''}
        ${a.action ? html`<div class="advice-act">→ ${a.action}</div>` : ''}</div>
      <div class="advice-btns">${a.href ? html`<a class="btn btn-sm" href="${a.href}">열기</a>` : ''}
        <button type="button" class="icon-btn" data-action="advice-dismiss" data-id="${a.id}" aria-label="이 조언 숨기기" title="처리함·숨기기">✓</button></div>
    </li>`)}</ul>`
}

function adviceMeta(rep) {
  if (!rep) return ''
  const src = rep.source === 'rule' ? '규칙' : rep.source.split('/').pop()
  return `${fmtRelative(rep.at)} 점검 · ${src}${rep.revenue?.total7d !== undefined ? ` · 7일 ${fmtUSD(rep.revenue.total7d)}` : ''}`
}

async function loadAdvice(live) {
  try {
    const r = await pf('/monitor')
    if (!live()) return
    mount($('#advice-box'), adviceView(r?.report))
    const m = $('#advice-meta'); if (m) m.textContent = adviceMeta(r?.report)
  } catch (e) {
    if (live()) mount($('#advice-box'), errorState(e))
  }
}

H['monitor-run'] = async (el) => {
  el.disabled = true
  const old = el.textContent
  el.textContent = '점검 중… (최대 몇 분)'
  try {
    const r = await pf('/monitor/run', { method: 'POST', body: { force: true } })
    mount($('#advice-box'), adviceView(r?.report))
    const m = $('#advice-meta'); if (m) m.textContent = adviceMeta(r?.report)
    toast('점검을 마쳤어요', { detail: `조언 ${r?.report?.advice?.length ?? 0}개` })
    window.dispatchEvent(new Event('xita:refresh-quiet'))
  } catch (e) { toastError(e, '점검하지 못했습니다') }
  el.disabled = false
  el.textContent = old
}

H['advice-dismiss'] = async (el) => {
  try {
    const r = await pf(`/monitor/advice/${encodeURIComponent(el.dataset.id)}/dismiss`, { method: 'POST', body: {} })
    mount($('#advice-box'), adviceView(r?.report))
  } catch (e) { toastError(e, '숨기지 못했습니다') }
}

F.capture = async (form) => {
  const input = form.elements.text
  const btn = form.querySelector('button')
  btn.disabled = true
  if (await A.quickCapture(input.value)) input.value = ''
  btn.disabled = false
  input.focus()
}

// ════════════════════════════════════════════════════════════════════════
// 프로젝트 목록
// ════════════════════════════════════════════════════════════════════════
const PF = { filter: 'all', sort: 'name', q: '' }
const FILTERS = [
  ['all', '전체'], ['live', '라이브'], ['dev', '개발 중'], ['android', 'Android'],
  ['other', '기타'], ['pending', '출시 대기'], ['archived', '보관됨'],
]
const SORTS = [['name', '이름순'], ['activity', '최근 활동순'], ['attention', '손볼 것 많은 순'], ['version', '출시 대기 먼저']]

function filteredProjects() {
  const base = PF.filter === 'archived' ? (S.archived ?? []).filter((p) => p.archived) : projects().filter((p) => !p.archived)
  const q = PF.q.trim().toLowerCase()
  let list = base.filter((p) => {
    switch (PF.filter) {
      case 'live': return isLive(p)
      case 'dev': return !isLive(p)
      case 'android': return p.kind === 'android'
      case 'other': return p.kind !== 'android'
      case 'pending': return p.pendingRelease
      default: return true
    }
  })
  if (q) list = list.filter((p) => `${p.name} ${p.codename} ${p.desc} ${p.package ?? ''} ${p.id}`.toLowerCase().includes(q))
  const score = (p) => (p.needsYou || 0) * 3 + (p.activeChanges || 0) + missingAssets(p).length + (p.pendingRelease ? 2 : 0)
  const cmp = {
    name: (a, b) => a.name.localeCompare(b.name, 'ko'),
    activity: (a, b) => String(b.lastActivity?.ts ?? '').localeCompare(String(a.lastActivity?.ts ?? '')),
    attention: (a, b) => score(b) - score(a) || a.name.localeCompare(b.name, 'ko'),
    version: (a, b) => Number(b.pendingRelease) - Number(a.pendingRelease) || a.name.localeCompare(b.name, 'ko'),
  }[PF.sort]
  return [...list].sort(cmp)
}

function projectCard(p) {
  const href = `#/projects/${encodeURIComponent(p.id)}`
  const ver = versionText(p)
  const chips = statusChips(p)
  return html`<article class="card pcard${p.archived ? ' is-archived' : ''}">
    <div class="pcard-top">
      <div class="pcard-titles">
        <h3 class="pcard-name"><a class="stretch" href="${href}">${p.name || p.codename}</a></h3>
        <div class="pcard-meta">${kindLabel(p.kind)}${ver ? html` · <span class="num">${ver}</span>` : ''}${p.monetization ? html` · ${monetizationLabel(p.monetization)}` : ''}</div>
      </div>
      ${badge(p.archived ? '보관됨' : statusLabel(p.status), p.archived ? 'muted' : statusTone(p.status))}
      <button type="button" class="icon-btn pcard-menu" data-action="project-menu" data-id="${p.id}" aria-haspopup="menu" aria-expanded="false" aria-label="${p.name} 작업 메뉴">⋯</button>
    </div>
    ${p.desc ? html`<p class="pcard-desc">${p.desc}</p>` : ''}
    ${p.kind === 'android' ? html`<div class="chips">${storeBadges(p, { compact: true })}</div>` : ''}
    ${chips.length ? html`<div class="chips">${chips}</div>` : ''}
    <div class="pcard-foot">
      <span>${p.lastActivity ? html`<span title="${p.lastActivity.title}">${fmtRelative(p.lastActivity.ts)} · ${p.lastActivity.title}</span>` : '활동 기록 없음'}</span>
      <span class="pcard-counts">
        ${p.needsYou ? badge(`결정 ${p.needsYou}`, 'warn') : ''}
        ${p.activeChanges ? badge(`진행 ${p.activeChanges}`, 'muted') : ''}
        ${p.logCount ? badge(`기록 ${p.logCount}`, 'muted') : ''}
      </span>
    </div>
  </article>`
}

function renderProjectGrid() {
  const grid = $('#pgrid')
  if (!grid) return
  if (PF.filter === 'archived' && !S.archived) { mount(grid, skeleton(6, 'sk-card')); return }
  const list = filteredProjects()
  $('#pcount').textContent = `${list.length}개`
  if (!list.length) {
    const none = PF.filter === 'all' && !PF.q && !projects().length
    mount(grid, none
      ? emptyState({ title: '등록된 프로젝트가 없어요', desc: '프로젝트 폴더를 추가하거나 설정에서 planner 데이터를 가져오세요.', cta: html`<button type="button" class="btn btn-primary" data-action="add-project">프로젝트 추가</button> <a class="btn" href="#/settings">planner 가져오기</a>` })
      : emptyState({ title: '조건에 맞는 프로젝트가 없어요', desc: '검색어나 필터를 바꿔 보세요.', cta: html`<button type="button" class="btn" data-action="reset-filter">필터 초기화</button>` }))
    return
  }
  mount(grid, html`${list.map(projectCard)}`)
}

export function renderProjects(view, live, query) {
  if (query.get('f') && FILTERS.some(([k]) => k === query.get('f'))) PF.filter = query.get('f')
  mount(view, html`
    ${pageHead('프로젝트', '', html`
      <button type="button" class="btn" data-action="sync" title="각 저장소 git pull + Play 스토어 버전 조회">동기화</button>
      <button type="button" class="btn btn-primary" data-action="add-project">프로젝트 추가</button>`)}
    ${!S.overview && S.overviewError ? errorState(S.overviewError) : ''}
    <div class="toolbar">
      <div class="search">
        <input id="psearch" data-search class="input" type="search" placeholder="이름, 패키지, 설명으로 검색" value="${PF.q}" aria-label="프로젝트 검색">
        ${kbd('/')}
      </div>
      <div class="filters" role="group" aria-label="필터">
        ${FILTERS.map(([k, l]) => html`<button type="button" class="fchip" data-action="pfilter" data-f="${k}" aria-pressed="${String(PF.filter === k)}">${l}</button>`)}
      </div>
      <label class="sort"><span class="sr-only">정렬</span>
        <select id="psort" class="select" aria-label="정렬">${SORTS.map(([k, l]) => html`<option value="${k}" ${PF.sort === k ? raw('selected') : ''}>${l}</option>`)}</select>
      </label>
      <span id="pcount" class="muted"></span>
    </div>
    <div id="pgrid" class="grid">${S.ready ? '' : skeleton(6, 'sk-card')}</div>`)
  const search = $('#psearch')
  search.addEventListener('input', debounce(() => { PF.q = search.value; renderProjectGrid() }, 80))
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; PF.q = ''; renderProjectGrid() } })
  $('#psort').addEventListener('change', (e) => { PF.sort = e.target.value; renderProjectGrid() })
  if (S.ready) renderProjectGrid()
  if (PF.filter === 'archived' && !S.archived) loadArchived().then(() => live() && renderProjectGrid())
}

H.pfilter = (el) => {
  PF.filter = el.dataset.f
  for (const b of document.querySelectorAll('[data-action="pfilter"]')) b.setAttribute('aria-pressed', String(b === el))
  if (PF.filter === 'archived' && !S.archived) loadArchived().then(renderProjectGrid)
  renderProjectGrid()
}
H['reset-filter'] = () => {
  PF.filter = 'all'; PF.q = ''
  const s = $('#psearch'); if (s) s.value = ''
  for (const b of document.querySelectorAll('[data-action="pfilter"]')) b.setAttribute('aria-pressed', String(b.dataset.f === 'all'))
  renderProjectGrid()
}
H['add-project'] = async () => {
  const p = await A.addProjectDialog()
  if (p?.id) location.hash = `#/projects/${encodeURIComponent(p.id)}`
}
H.sync = () => A.syncAll()

// ════════════════════════════════════════════════════════════════════════
// 결정할 일
// ════════════════════════════════════════════════════════════════════════
function needsAction(n) {
  const ref = n.ref ?? (n.change ? { kind: 'change', id: n.change } : null)
  if (ref?.kind === 'change' && ['REVIEW', 'RELEASE'].includes(String(n.type))) {
    return html`<button type="button" class="btn btn-sm btn-primary" data-action="approve" data-id="${ref.id}" data-title="${n.title}">승인</button>`
  }
  if (ref?.kind === 'artifact') return html`<a class="btn btn-sm" href="#/docs/${encodeURIComponent(ref.id)}">문서 열기</a>`
  if (n.product && findProject(n.product)) return html`<a class="btn btn-sm" href="#/projects/${encodeURIComponent(n.product)}">프로젝트 열기</a>`
  return ''
}

export function renderDecide(view) {
  const list = S.needs
  mount(view, html`
    ${pageHead('결정할 일', '사람이 판단해야 XITA 가 다음으로 넘어갈 수 있는 항목이에요.')}
    ${S.needsError ? errorState(S.needsError) : ''}
    ${!S.ready ? skeleton(5) : !list.length && !S.needsError
      ? emptyState({ title: '결정할 일이 없어요', desc: '검토·출시 승인·방향 결정이 필요해지면 여기에 모여요.', cta: html`<a class="btn" href="#/projects">프로젝트 보기</a>` })
      : html`<ul class="list">${list.map((n) => html`<li class="list-item">
          <div class="list-badges">${badge(priorityLabel(n.priority), priorityTone(n.priority))}${badge(needsTypeLabel(n.type), 'muted')}</div>
          <div class="list-main">
            <div class="list-title">${n.title}</div>
            <div class="list-desc">${n.product ? html`<a href="#/projects/${encodeURIComponent(n.product)}">${productName(n.product)}</a>` : ''}${n.product && n.summary ? ' · ' : ''}${n.summary || ''}</div>
          </div>
          <div class="list-actions">${needsAction(n)}</div>
        </li>`)}</ul>`}`)
}

H.approve = async (el) => {
  el.disabled = true
  await A.approveChange(el.dataset.id, el.dataset.title)
  el.disabled = false
}

// ════════════════════════════════════════════════════════════════════════
// 활동 (커밋 + XITA 타임라인)
// ════════════════════════════════════════════════════════════════════════
const AF = { tab: 'commits', project: '' }

export function changelogList(entries, { showApp = true } = {}) {
  if (!entries.length) return emptyState({ title: '커밋이 없어요', desc: '동기화로 최신 커밋을 받아오면 여기에 표시돼요.', cta: html`<button type="button" class="btn" data-action="sync">동기화</button>` })
  return html`${groupBy(entries, (e) => e.date).map(([d, items]) => html`<section class="day">
    <h3 class="day-head">${fmtDay(d)} <span class="muted">${items.length}</span></h3>
    <ul class="commits">${items.map((e) => html`<li class="commit">
      ${showApp ? html`<a class="badge badge-muted commit-app" href="#/projects/${encodeURIComponent(e.project)}">${e.app || productName(e.project)}</a>` : ''}
      <span class="commit-title">${e.title}</span>
      <span class="commit-meta mono">${e.hash} · ${e.author}</span></li>`)}</ul></section>`)}`
}

export async function renderActivity(view, live) {
  const opts = projects().filter((p) => !p.archived && p.git)
  mount(view, html`
    ${pageHead('활동', '저장소 커밋과 XITA 일대기를 한 곳에서 봐요.')}
    <div class="toolbar">
      <div class="seg" role="tablist" aria-label="활동 종류">
        <button type="button" role="tab" class="seg-btn" data-action="atab" data-t="commits" aria-selected="${String(AF.tab === 'commits')}" aria-pressed="${String(AF.tab === 'commits')}">커밋</button>
        <button type="button" role="tab" class="seg-btn" data-action="atab" data-t="timeline" aria-selected="${String(AF.tab === 'timeline')}" aria-pressed="${String(AF.tab === 'timeline')}">XITA 타임라인</button>
      </div>
      <select id="aproj" class="select" aria-label="프로젝트 필터">
        <option value="">모든 프로젝트</option>
        ${opts.map((p) => html`<option value="${p.id}" ${AF.project === p.id ? raw('selected') : ''}>${p.name}</option>`)}
      </select>
      ${AF.tab === 'commits' ? html`<button type="button" class="btn" data-action="sync">동기화</button>` : ''}
    </div>
    <div id="abody">${skeleton(6)}</div>`)
  $('#aproj').addEventListener('change', (e) => { AF.project = e.target.value; renderActivity(view, live) })
  const body = $('#abody')
  try {
    if (AF.tab === 'commits') {
      const r = await pf(`/changelog${AF.project ? `?project=${encodeURIComponent(AF.project)}` : ''}`)
      if (live()) mount(body, changelogList(r?.entries ?? [], { showApp: !AF.project }))
    } else {
      const q = AF.project ? `&product=${encodeURIComponent(AF.project)}` : ''
      const ev = await v4(`/timeline?limit=100${q}`)
      if (live()) mount(body, timelineList(Array.isArray(ev) ? ev : [], { showProduct: !AF.project }))
    }
  } catch (e) {
    if (live()) mount(body, errorState(e))
  }
}

H.atab = (el) => { AF.tab = el.dataset.t; window.dispatchEvent(new Event('xita:rerender')) }

export { timelineList, renderProjectGrid as refreshProjectsGrid }

// ════════════════════════════════════════════════════════════════════════
// 수익 (AdMob 최근 7일)
// ════════════════════════════════════════════════════════════════════════
const REV = { days: Number(store('xita.revenue.days')) || 30 }

/** 작은 막대 추이 (inline SVG, 값 0 이면 바닥선만) */
function sparkBars(values, { w = 120, h = 28, label = '' } = {}) {
  const max = Math.max(0, ...values)
  const bw = w / Math.max(1, values.length)
  return raw(`<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">${values
    .map((v, i) => {
      const bh = max > 0 ? Math.max(v > 0 ? 1.5 : 0, (v / max) * (h - 2)) : 0
      return `<rect x="${(i * bw + 0.5).toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${Math.max(1, bw - 1).toFixed(2)}" height="${bh.toFixed(2)}" rx="1"/>`
    })
    .join('')}<line x1="0" y1="${h - 0.5}" x2="${w}" y2="${h - 0.5}"/></svg>`)
}

export async function renderRevenue(view, live) {
  const days = REV.days
  mount(view, html`${pageHead('수익', '애드몹 예상 수익 · 하루 단위 기록이 쌓여 추이를 볼 수 있어요', html`<div class="seg" role="group" aria-label="기간">${[7, 30, 90].map((d) => html`<button type="button" class="seg-btn" data-action="rev-days" data-days="${d}" aria-pressed="${String(d === days)}">${d}일</button>`)}</div>`)}<div id="rbody">${skeleton(5)}</div>`)
  const box = $('#rbody')
  try {
    const r = await pf(`/revenue?days=${days}`)
    if (!live()) return
    if (!r?.available) {
      const canConnect = r?.client && !r?.connected
      mount(box, html`<section class="panel">
        <h2 class="panel-title">${r?.reason || '수익 정보를 볼 수 없어요'}</h2>
        ${r?.detail ? html`<p class="muted panel-text">${r.detail}</p>` : ''}
        <ol class="steps">
          <li class="${r?.client ? 'done' : ''}">OAuth 클라이언트 등록 (admob-client.json)</li>
          <li class="${r?.connected ? 'done' : ''}">Google 계정 동의</li>
          <li>수익 조회</li>
        </ol>
        <div class="row-actions">
          ${canConnect
            ? html`<a class="btn btn-primary" href="/api/v1/portfolio/admob/auth">애드몹 연결</a>`
            : r?.connected ? html`<a class="btn" href="/api/v1/portfolio/admob/auth">다시 연결</a>`
            : html`<a class="btn" href="#/settings">설정에서 비밀 파일 확인</a>`}
        </div></section>`)
      return
    }
    const rows = [...(r.apps ?? [])].sort((a, b) => b.earnings - a.earnings)
    const daily = r.daily ?? []
    const half = Math.floor(daily.length / 2)
    const prev = daily.slice(0, half).reduce((n, d) => n + d.earnings, 0)
    const recent = daily.slice(daily.length - half).reduce((n, d) => n + d.earnings, 0)
    const trend = prev >= 0.01 ? Math.round(((recent - prev) / prev) * 100) : null
    const best = [...daily].sort((a, b) => b.earnings - a.earnings)[0]
    mount(box, html`${r.stale ? html`<div class="callout callout-warn">${r.reason} — 저장된 기록(${fmtRelative(r.updated_at)} 갱신)으로 보여주고 있어요.</div>` : ''}
      <section class="kpis">
        <div class="kpi"><span class="kpi-label">합계 수익</span><span class="kpi-value">${fmtUSD(r.total?.earnings)}</span><span class="kpi-hint">최근 ${r.days}일${r.until ? ` · ${r.until} 까지` : ''}</span></div>
        <div class="kpi"><span class="kpi-label">노출</span><span class="kpi-value">${fmtNum(r.total?.impressions)}</span></div>
        <div class="kpi"><span class="kpi-label">1천 회 노출당</span><span class="kpi-value">${fmtUSD(r.total?.impressions ? (r.total.earnings / r.total.impressions) * 1000 : 0)}</span><span class="kpi-hint">eCPM</span></div>
        <div class="kpi"><span class="kpi-label">흐름</span><span class="kpi-value ${trend === null ? '' : trend >= 0 ? 'up' : 'down'}">${trend === null ? '—' : `${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend)}%`}</span><span class="kpi-hint">기간 앞 절반 대비 뒤 절반${best?.earnings ? ` · 최고 ${best.date.slice(5)}` : ''}</span></div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2 class="panel-title">하루 수익</h2><span class="muted">${r.updated_at ? `${fmtRelative(r.updated_at)} 갱신` : ''}</span></div>
        <div class="daychart" role="img" aria-label="최근 ${r.days}일 하루 수익 막대">${daily.map((d) => {
          const max = Math.max(0.0001, ...daily.map((x) => x.earnings))
          return html`<span class="daychart-bar${d.recorded ? '' : ' none'}" style="height:${Math.max(d.earnings > 0 ? 3 : 1, Math.round((d.earnings / max) * 100))}%" title="${d.date} · ${fmtUSD(d.earnings)} · 노출 ${fmtNum(d.impressions)}"></span>`
        })}</div>
        <div class="daychart-axis"><span>${daily[0]?.date?.slice(5) ?? ''}</span><span>${daily.at(-1)?.date?.slice(5) ?? ''}</span></div>
      </section>
      <section class="panel"><div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">앱</th><th scope="col" class="r">수익</th><th scope="col" class="r">노출</th><th scope="col" class="r">eCPM</th><th scope="col">추이</th></tr></thead>
        <tbody>${rows.length ? rows.map((x) => html`<tr><td>${x.project ? html`<a href="#/projects/${encodeURIComponent(x.project)}">${x.label}</a>` : x.label}</td><td class="r num">${fmtUSD(x.earnings)}</td><td class="r num">${fmtNum(x.impressions)}</td>
          <td class="r num">${fmtUSD(x.impressions ? (x.earnings / x.impressions) * 1000 : 0)}</td><td>${sparkBars(x.daily ?? [], { label: `${x.label} 하루 수익 추이` })}</td></tr>`)
          : html`<tr><td colspan="5" class="muted">이 기간 수익 데이터가 없어요.</td></tr>`}</tbody>
        <tfoot><tr><td>합계</td><td class="r num">${fmtUSD(r.total?.earnings)}</td><td class="r num">${fmtNum(r.total?.impressions)}</td><td class="r num">${fmtUSD(r.total?.impressions ? (r.total.earnings / r.total.impressions) * 1000 : 0)}</td><td></td></tr></tfoot>
      </table></div></section>`)
  } catch (e) {
    if (live()) mount(box, errorState(e))
  }
}

H['rev-days'] = (el) => {
  REV.days = Number(el.dataset.days) || 30
  store('xita.revenue.days', String(REV.days))
  renderRevenue($('#view'), () => true)
}

// ════════════════════════════════════════════════════════════════════════
// 문서 (포트폴리오 Living Artifact)
// ════════════════════════════════════════════════════════════════════════
const DF = { q: '', docs: null, editing: false }

function docList(activeId) {
  const q = DF.q.trim().toLowerCase()
  const docs = (DF.docs ?? []).filter((d) => !q || `${d.name} ${d.id} ${d.kind ?? ''}`.toLowerCase().includes(q))
  if (!docs.length) {
    return DF.docs?.length
      ? emptyState({ title: '검색 결과가 없어요' })
      : emptyState({ title: '문서가 없어요', desc: 'planner 의 docs·README·ideas·specs 를 가져오면 여기에 모여요.', cta: html`<a class="btn" href="#/settings">planner 가져오기</a>` })
  }
  const byProduct = groupBy(docs, (d) => d.product || '')
  byProduct.sort((a, b) => (a[0] ? 1 : 0) - (b[0] ? 1 : 0) || productName(a[0]).localeCompare(productName(b[0]), 'ko'))
  return html`${byProduct.map(([pid, items]) => html`<div class="doc-group">
    <div class="doc-group-head">${productName(pid)}</div>
    ${groupBy(items, (d) => artifactKindLabel(d.kind)).map(([kind, ds]) => html`
      <div class="doc-kind">${kind}</div>
      <ul class="doc-items">${ds.map((d) => html`<li><a class="doc-link${d.id === activeId ? ' active' : ''}" href="#/docs/${encodeURIComponent(d.id)}" ${d.id === activeId ? raw('aria-current="page"') : ''}>
        <span class="doc-name">${d.name || d.id}</span><span class="doc-meta">${d.updatedAt ? fmtRelative(d.updatedAt) : ''}</span></a></li>`)}</ul>`)}
  </div>`)}`
}

export async function renderDocs(view, live, docId) {
  DF.editing = false
  mount(view, html`
    ${pageHead('문서', '포트폴리오 문서와 기획서. 고치면 새 리비전으로 저장돼요.')}
    <div class="docs">
      <aside class="docs-side" aria-label="문서 목록">
        <input id="dsearch" data-search class="input" type="search" placeholder="문서 검색" value="${DF.q}" aria-label="문서 검색">
        <nav id="dlist" class="doc-nav">${skeleton(8)}</nav>
      </aside>
      <section id="dview" class="docs-main panel">${docId ? skeleton(8) : emptyState({ title: '왼쪽에서 문서를 고르세요', desc: '검색은 / 키로 바로 할 수 있어요.' })}</section>
    </div>`)
  const s = $('#dsearch')
  s.addEventListener('input', debounce(() => { DF.q = s.value; mount($('#dlist'), docList(docId)) }, 80))
  try {
    if (!DF.docs) {
      const r = await pf('/docs')
      DF.docs = r?.docs ?? []
    }
    if (live()) mount($('#dlist'), docList(docId))
  } catch (e) {
    if (live()) mount($('#dlist'), errorState(e))
  }
  if (docId) await loadDoc(docId, live)
}

async function loadDoc(id, live) {
  const box = $('#dview')
  try {
    const d = await v4(`/artifacts/${encodeURIComponent(id)}`)
    if (!live()) return
    const art = d?.artifact ?? {}
    const meta = art.meta ?? {}
    const listed = DF.docs?.find((x) => x.id === id)
    const name = String(meta.name ?? listed?.name ?? id)
    const rev = meta.current_revision ?? listed?.revision ?? art.revision
    const doc = { id, name, body: art.body ?? '', rev, updated: meta.updated_at ?? listed?.updatedAt, revisions: d?.revisions?.length ?? 0, product: meta.product ?? listed?.product }
    showDoc(box, doc)
  } catch (e) {
    if (live()) mount(box, errorState(e))
  }
}

function showDoc(box, doc) {
  DF.editing = false
  mount(box, html`<header class="doc-head">
      <div><h2 class="doc-title">${doc.name}</h2>
        <div class="doc-sub">${doc.product ? html`<a href="#/projects/${encodeURIComponent(doc.product)}">${productName(doc.product)}</a> · ` : ''}${doc.rev ? `리비전 ${doc.rev}` : ''}${doc.updated ? ` · ${fmtRelative(doc.updated)} 수정` : ''}</div></div>
      <button type="button" class="btn" data-action="doc-edit">편집</button>
    </header>
    <article class="md">${doc.body.trim() ? raw(renderMarkdown(doc.body)) : html`<p class="muted">본문이 비어 있어요.</p>`}</article>`)
  H['doc-edit'] = () => editDoc(box, doc)
}

function editDoc(box, doc) {
  DF.editing = true
  mount(box, html`<form data-form="doc-save" class="doc-edit">
    <header class="doc-head"><h2 class="doc-title">${doc.name} <span class="muted">편집 중</span></h2></header>
    <label class="field"><span class="sr-only">본문 (markdown)</span>
      <textarea name="content" class="input textarea mono doc-textarea" spellcheck="false" aria-label="문서 본문">${doc.body}</textarea></label>
    <label class="field"><span class="field-label">무엇을 바꿨나요? <span class="muted">(선택 · 리비전 요약)</span></span>
      <input name="summary" class="input" placeholder="예: 출시 일정 갱신"></label>
    <div class="row-actions"><span class="muted">${kbd('⌘')}${kbd('Enter')} 저장</span><span class="spacer"></span>
      <button type="button" class="btn" data-action="doc-cancel">취소</button>
      <button type="submit" class="btn btn-primary">새 리비전으로 저장</button></div>
  </form>`)
  const ta = box.querySelector('textarea')
  ta.focus()
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); box.querySelector('form').requestSubmit() }
  })
  H['doc-cancel'] = async () => {
    if (ta.value !== doc.body && !(await confirmDialog({ title: '편집 취소', message: '저장하지 않은 변경 내용이 사라져요.', confirmLabel: '변경 버리기', danger: true }))) return
    showDoc(box, doc)
  }
  F['doc-save'] = async (form) => {
    const content = form.elements.content.value
    const summary = form.elements.summary.value.trim()
    const btn = form.querySelector('button[type="submit"]')
    btn.disabled = true
    try {
      const body = { content }
      if (summary) body.summary = summary
      const r = await v4(`/artifacts/${encodeURIComponent(doc.id)}/revisions`, { method: 'POST', body })
      toast(`리비전 ${r?.revision ?? ''} 으로 저장했어요`)
      DF.docs = null
      showDoc(box, { ...doc, body: content, rev: r?.revision ?? doc.rev, updated: new Date().toISOString() })
    } catch (e) {
      toastError(e, '문서를 저장하지 못했습니다')
      btn.disabled = false
    }
  }
}

export const docsDirty = () => DF.editing && !!document.querySelector('.doc-textarea')

// ════════════════════════════════════════════════════════════════════════
// 설정
// ════════════════════════════════════════════════════════════════════════
const presence = (on, okL = '있음', badL = '없음') => badge(on ? okL : badL, on ? 'ok' : 'bad')

export async function renderSettings(view, live) {
  mount(view, html`
    ${pageHead('설정')}
    <section class="panel">
      <h2 class="panel-title">테마</h2>
      <p class="muted panel-text">시스템을 고르면 OS 의 라이트/다크 설정을 실시간으로 따라가요.</p>
      ${themeControl()}
    </section>
    <section class="panel" id="ai-settings">${skeleton(4)}</section>
    <section class="panel" id="mobile-pair">${skeleton(2)}</section>
    <section class="panel" id="sbody">${skeleton(5)}</section>
    <section class="panel">
      <h2 class="panel-title">planner 가져오기</h2>
      <p class="muted panel-text">planner 의 프로젝트·문서·기록을 XITA 로 흡수해요. 다시 실행해도 안전합니다 — 같은 내용은 건너뛰고 바뀐 문서만 새 리비전이 돼요. 먼저 미리보기로 무엇이 들어올지 확인하세요.</p>
      <form data-form="import-preview" class="import-form">
        <label class="field"><span class="field-label">planner 폴더 <span class="muted">(선택 · 비우면 기본 위치)</span></span>
          <input name="from" class="input mono" placeholder="${S.overview?.portfolio?.root ? `${S.overview.portfolio.root}/planner` : '~/workspace/auto-money/planner'}" autocomplete="off" spellcheck="false"></label>
        <div class="row-actions"><button type="submit" class="btn">미리보기</button>
          <button type="button" class="btn btn-primary" data-action="import-run" id="import-run" disabled>가져오기</button></div>
      </form>
      <div id="import-report"></div>
    </section>
    <section class="panel">
      <h2 class="panel-title">키보드 단축키</h2>
      ${shortcutsTable()}
    </section>`)
  // ai.js 는 views.js 를 import 하므로 순환을 피해 실행 시점에 불러온다
  import('./ai.js').then((m) => live() && m.renderAiSettings($('#ai-settings'))).catch((e) => mount($('#ai-settings'), errorState(e)))
  try {
    const s = await pf('/settings')
    if (!live()) return
    renderMobilePair(s.mobile)
    mount($('#sbody'), html`<h2 class="panel-title">경로와 비밀 파일</h2>
      <p class="muted panel-text">비밀 파일은 내용이 아니라 있는지 여부만 표시해요.</p>
      <dl class="kv">
        ${[['포트폴리오 루트', s.root], ['XITA 워크스페이스', s.workspace], ['비밀 폴더', s.secretsDir], ['애드몹 폴더', s.admobDir], ['레지스트리 내보내기', s.registryExport]].map(([k, v]) => html`
          <dt>${k}</dt><dd class="kv-path"><code class="mono">${v || '—'}</code>${v ? html`<button type="button" class="icon-btn" data-action="copy" data-text="${v}" aria-label="${k} 경로 복사">⧉</button>` : ''}</dd>`)}
      </dl>
      <dl class="kv">
        <dt>Play 서비스 계정 키</dt><dd>${presence(s.playKey)} ${s.playKey ? '' : html`<span class="muted">없으면 배포가 꺼져요</span>`}</dd>
        <dt>키스토어 설정</dt><dd>${presence(s.keystore)}</dd>
        <dt>애드몹 OAuth 클라이언트</dt><dd>${presence(s.admobClient)}</dd>
        <dt>애드몹 연결 토큰</dt><dd>${presence(s.admobToken, '연결됨', '미연결')}</dd>
      </dl>`)
  } catch (e) {
    if (live()) mount($('#sbody'), errorState(e))
  }
}

/** 모바일 연결 — 폰 앱에 입력할 호스트 주소와 10분짜리 페어링 코드 */
function renderMobilePair(m) {
  const box = $('#mobile-pair')
  if (!box) return
  const urls = m?.urls ?? []
  mount(box, html`<h2 class="panel-title">모바일 연결</h2>
    <p class="muted panel-text">XITA 모바일 앱의 ‘호스트와 연결’ 화면에 아래 주소와 페어링 코드를 입력하세요. 폰과 이 컴퓨터가 같은 네트워크에 있어야 해요.</p>
    ${m && !m.reachable ? html`<div class="callout callout-warn">지금 서버가 이 컴퓨터 안에서만 열려 있어요(HOST=${m.bind}). 폰에서 연결하려면 <code class="mono">HOST=0.0.0.0</code> 으로 서버를 다시 시작하세요.</div>` : ''}
    <dl class="kv">
      <dt>호스트 주소</dt><dd>${urls.length
        ? urls.map((u) => html`<span class="kv-path"><code class="mono">${u}</code><button type="button" class="icon-btn" data-action="copy" data-text="${u}" aria-label="주소 복사">⧉</button></span> `)
        : html`<span class="muted">네트워크 주소를 찾지 못했어요</span>`}</dd>
      <dt>페어링 코드</dt><dd id="pair-code"><button type="button" class="btn btn-primary" data-action="pair-code">코드 발급</button></dd>
    </dl>`)
}

H['pair-code'] = async (el) => {
  el.disabled = true
  try {
    const r = await api('/devices/pair', { method: 'POST', body: { host_identity: 'xita-host' } })
    const p = r?.data ?? r
    const mins = Math.max(1, Math.round((Number(p.expires_at ?? 0) - Date.now()) / 60000))
    mount($('#pair-code'), html`<code class="mono pair-code">${p.code}</code>
      <button type="button" class="icon-btn" data-action="copy" data-text="${p.code}" aria-label="코드 복사">⧉</button>
      <span class="muted">${mins}분 동안 유효 · </span><button type="button" class="btn btn-sm" data-action="pair-code">새 코드</button>`)
  } catch (e) {
    toastError(e, '페어링 코드를 발급하지 못했습니다')
    el.disabled = false
  }
}

export function shortcutsTable() {
  const rows = [
    [[raw('⌘'), 'K'], '명령 팔레트 (이동·작업·검색)'], [['/'], '현재 화면 검색'],
    [['g', 'h'], '홈'], [['g', 'p'], '프로젝트'], [['g', 'd'], '결정할 일'], [['g', 'a'], '활동'],
    [['g', 'r'], '수익'], [['g', 'o'], '문서'], [['g', 's'], '설정'], [['?'], '단축키 보기'], [['Esc'], '닫기'],
  ]
  return html`<dl class="kv shortcuts">${rows.map(([keys, label]) => html`<dt>${keys.map((k) => kbd(k))}</dt><dd>${label}</dd>`)}</dl>`
}

let importFrom = ''
F['import-preview'] = async (form) => {
  importFrom = form.elements.from.value.trim()
  const btn = form.querySelector('button[type="submit"]')
  btn.disabled = true
  mount($('#import-report'), skeleton(3))
  try {
    const r = await pf('/import/planner', { method: 'POST', body: { ...(importFrom ? { from: importFrom } : {}), dryRun: true } })
    mount($('#import-report'), importReport(r, true))
    $('#import-run').disabled = false
  } catch (e) {
    mount($('#import-report'), errorState(e, 'noop'))
  }
  btn.disabled = false
}

H['import-run'] = async (el) => {
  const ok = await confirmDialog({
    title: 'planner 가져오기',
    message: '미리보기 내용대로 XITA 에 반영할까요? 원본 planner 파일은 건드리지 않고, 원문은 보관함에 sha256 목록과 함께 저장돼요.',
    confirmLabel: '가져오기',
  })
  if (!ok) return
  el.disabled = true
  try {
    const r = await pf('/import/planner', { method: 'POST', body: { ...(importFrom ? { from: importFrom } : {}), dryRun: false } })
    mount($('#import-report'), importReport(r, false))
    toast('planner 데이터를 가져왔어요')
    DF.docs = null
    window.dispatchEvent(new Event('xita:refresh'))
  } catch (e) {
    toastError(e, '가져오지 못했습니다')
    el.disabled = false
  }
}

const ACTION_LABEL = { created: '새로 추가', updated: '갱신', revised: '새 리비전', unchanged: '변경 없음' }
const countBy = (arr) => arr.reduce((m, x) => ((m[x.action] = (m[x.action] ?? 0) + 1), m), {})

/** ImportReport (apps/server/app/portfolio/planner_import.ts) 요약. 형태가 다르면 범용 렌더링으로 */
function importReport(r, dry) {
  if (!r || typeof r !== 'object') return html`<p class="muted">결과가 비어 있어요.</p>`
  if (!Array.isArray(r.projects) || !Array.isArray(r.artifacts)) return genericReport(r, dry)
  const pc = countBy(r.projects)
  const ac = countBy(r.artifacts)
  const counts = (c) => Object.entries(c).map(([k, n]) => badge(`${ACTION_LABEL[k] ?? '기타'} ${n}`, k === 'unchanged' ? 'muted' : 'accent'))
  const a = r.archive ?? {}
  return html`<div class="report">
    <div class="callout ${dry ? 'callout-info' : 'callout-ok'}">${dry ? '미리보기 결과예요. 아직 아무것도 바뀌지 않았어요.' : '가져오기를 마쳤어요.'}</div>
    <dl class="kv">
      <dt>가져올 위치</dt><dd><code class="mono">${r.from}</code></dd>
      <dt>프로젝트</dt><dd>${r.projects.length}개 ${counts(pc)}</dd>
      <dt>문서</dt><dd>${r.artifacts.length}개 ${counts(ac)}</dd>
      <dt>앱 기록</dt><dd>${fmtNum(r.logs?.imported)}건 가져옴 · ${fmtNum(r.logs?.skipped)}건 건너뜀</dd>
      <dt>원문 보관</dt><dd>${a.dir ? html`<code class="mono">${a.dir}</code>` : '—'} ${a.files != null ? html`<span class="muted">${fmtNum(a.files)}개 파일 · ${fmtMB(a.bytes)}${a.reused ? ' · 기존 보관본 재사용' : ''}</span>` : ''}</dd>
      ${a.excludedSecrets?.length ? html`<dt>제외한 비밀 파일</dt><dd>${a.excludedSecrets.length}개 <span class="muted">(내용은 복사하지 않아요)</span></dd>` : ''}
    </dl>
    ${r.warnings?.length ? html`<div class="callout callout-warn"><strong>확인할 점 ${r.warnings.length}개</strong><ul class="report-list">${r.warnings.map((w) => html`<li>${w}</li>`)}</ul></div>` : ''}
    <details class="report-block"><summary>프로젝트 ${r.projects.length}개</summary>
      <ul class="report-list">${r.projects.map((p) => html`<li>${badge(ACTION_LABEL[p.action] ?? '기타', p.action === 'unchanged' ? 'muted' : 'accent')} ${p.codename} <span class="muted mono">${p.id}</span></li>`)}</ul></details>
    <details class="report-block"><summary>문서 ${r.artifacts.length}개</summary>
      <ul class="report-list">${r.artifacts.map((x) => html`<li>${badge(ACTION_LABEL[x.action] ?? '기타', x.action === 'unchanged' ? 'muted' : 'accent')} <span class="mono">${x.source}</span>${x.product ? html` <span class="muted">→ ${productName(x.product)}</span>` : ''}</li>`)}</ul></details>
  </div>`
}

function genericReport(r, dry) {
  const entries = Object.entries(r)
  const scalars = entries.filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
  const lists = entries.filter(([, v]) => Array.isArray(v))
  const objs = entries.filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
  const show = (v) => (typeof v === 'boolean' ? (v ? '예' : '아니오') : v === null ? '—' : String(v))
  const item = (x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))
  return html`<div class="report">
    <div class="callout ${dry ? 'callout-info' : 'callout-ok'}">${dry ? '미리보기 결과예요. 아직 아무것도 바뀌지 않았어요.' : '가져오기를 마쳤어요.'}</div>
    ${scalars.length ? html`<dl class="kv">${scalars.map(([k, v]) => html`<dt class="mono">${k}</dt><dd>${show(v)}</dd>`)}</dl>` : ''}
    ${objs.map(([k, v]) => html`<details class="report-block" open><summary><span class="mono">${k}</span></summary>
      <dl class="kv">${Object.entries(v).map(([kk, vv]) => html`<dt class="mono">${kk}</dt><dd>${Array.isArray(vv) ? `${vv.length}개` : vv && typeof vv === 'object' ? item(vv) : show(vv)}</dd>`)}</dl></details>`)}
    ${lists.map(([k, v]) => html`<details class="report-block"${v.length <= 12 ? raw(' open') : ''}><summary><span class="mono">${k}</span> <span class="muted">${v.length}개</span></summary>
      ${v.length ? html`<ul class="report-list mono">${v.slice(0, 300).map((x) => html`<li>${item(x)}</li>`)}${v.length > 300 ? html`<li class="muted">… ${v.length - 300}개 더</li>` : ''}</ul>` : html`<p class="muted">없음</p>`}</details>`)}
  </div>`
}

H.copy = (el) => A.copyText(el.dataset.text, '복사했어요')
H.noop = () => {}
