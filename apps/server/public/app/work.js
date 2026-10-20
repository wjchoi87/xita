/*
 * XITA 웹 콘솔 — 프로젝트 '작업' 탭 (#/projects/<id>/work)
 * 아이디어·할 일(이슈)·마일스톤을 한 화면에서. 데이터는 v4 change / milestone 그대로.
 *   아이디어 = IDEA, 할 일 = PLAN·PAUSED, 진행 중 = BUILD, 검토 = REVIEW·SHIP_READY, 끝남 = SHIPPED·CANCELLED
 */
import { html, raw, mount, $, v4, changeStatusLabel, priorityLabel, priorityTone, fmtRelative } from './lib.js'
import { openDialog, toast, toastError, openMenu, confirmDialog } from './ui.js'
import { H, F, badge, emptyState, errorState, skeleton } from './views.js'
import { askAgent } from './actions.js'

// 서버 domain.ts ALLOWED 와 같은 표 (상태 이동 버튼은 허용된 것만)
const ALLOWED = {
  IDEA: ['PLAN', 'BUILD', 'PAUSED', 'CANCELLED'],
  PLAN: ['BUILD', 'REVIEW', 'SHIP_READY', 'PAUSED', 'CANCELLED'],
  BUILD: ['PLAN', 'REVIEW', 'SHIP_READY', 'PAUSED', 'CANCELLED'],
  REVIEW: ['BUILD', 'SHIP_READY', 'PAUSED', 'CANCELLED'],
  SHIP_READY: ['SHIPPED', 'BUILD', 'PAUSED', 'CANCELLED'],
  SHIPPED: [],
  PAUSED: ['PLAN', 'BUILD', 'CANCELLED'],
  CANCELLED: [],
}
// 카드의 "다음 단계" 버튼
const NEXT = { IDEA: 'PLAN', PLAN: 'BUILD', BUILD: 'REVIEW', REVIEW: 'SHIP_READY', PAUSED: 'PLAN' }
const NEXT_LABEL = { PLAN: '할 일로', BUILD: '시작', REVIEW: '검토 요청', SHIP_READY: '출시 대기로' }
// 이 탭의 열 이름과 맞춘 상태 이름 (메뉴·알림용)
const MOVE_LABEL = {
  IDEA: '아이디어로', PLAN: '할 일로', BUILD: '진행 중으로', REVIEW: '검토 대기로',
  SHIP_READY: '출시 승인 대기로', SHIPPED: '출시됨으로', PAUSED: '보류로', CANCELLED: '취소(버리기)',
}
const MOVED_TOAST = {
  IDEA: '아이디어로 돌렸어요', PLAN: '할 일로 옮겼어요', BUILD: '시작했어요', REVIEW: '검토 대기로 옮겼어요',
  SHIP_READY: '출시 승인 대기로 옮겼어요', SHIPPED: '출시됨으로 표시했어요', PAUSED: '보류했어요', CANCELLED: '취소했어요',
}

const COLUMNS = [
  ['idea', '아이디어', ['IDEA']],
  ['todo', '할 일', ['PLAN', 'PAUSED']],
  ['doing', '진행 중', ['BUILD']],
  ['review', '검토·출시 대기', ['REVIEW', 'SHIP_READY']],
]
const DONE = ['SHIPPED', 'CANCELLED']
const PRIORITIES = [['low', '낮음'], ['normal', '보통'], ['high', '높음'], ['critical', '긴급']]
const MS_STATUS = { planned: '계획', active: '진행 중', done: '완료' }

const state = new Map() // projectId → { work, ms: 필터 마일스톤 id|null, showDone }

const st = (id) => {
  if (!state.has(id)) state.set(id, { work: null, ms: null, showDone: false })
  return state.get(id)
}

async function load(id) {
  const s = st(id)
  s.work = await v4(`/products/${encodeURIComponent(id)}/work`)
  return s.work
}

export async function workTab(box, p, live) {
  const s = st(p.id)
  mount(box, frame(p, s.work ? body(p) : skeleton(6)))
  bindQuickAdd(box)
  try {
    await load(p.id)
    if (!live()) return
    rerender(p.id)
  } catch (e) {
    if (live()) mount($('#work-body'), errorState(e))
  }
}

function rerender(id) {
  const el = $('#work-body')
  if (el && el.dataset.id === id) mount(el, body({ id }))
}

function frame(p, inner) {
  const s = st(p.id)
  const ms = s.work?.milestones ?? []
  return html`<form class="panel quickadd" data-form="work-add" data-id="${p.id}">
      <label class="sr-only" for="work-title">새 항목</label>
      <input id="work-title" name="title" class="input" placeholder="떠오른 아이디어나 할 일을 적고 Enter" autocomplete="off" maxlength="200">
      <select name="status" class="select" aria-label="어디에 넣을까요">
        <option value="IDEA">아이디어</option><option value="PLAN">할 일</option><option value="BUILD">진행 중</option>
      </select>
      <select name="milestone" class="select" aria-label="마일스톤" data-ms-select>
        <option value="">마일스톤 없음</option>${ms.filter((m) => m.status !== 'done').map((m) => html`<option value="${m.id}" ${s.ms === m.id ? raw('selected') : ''}>${m.name}</option>`)}
      </select>
      <button type="submit" class="btn btn-primary">추가</button>
    </form>
    <div id="work-body" data-id="${p.id}">${inner}</div>`
}

function body({ id }) {
  const s = st(id)
  const w = s.work
  if (!w) return skeleton(6)
  const filtered = s.ms ? w.changes.filter((c) => c.milestone === s.ms) : w.changes
  const open = filtered.filter((c) => !DONE.includes(c.status))
  const done = filtered.filter((c) => DONE.includes(c.status))
  const msName = new Map(w.milestones.map((m) => [m.id, m.name]))
  return html`${milestonesPanel(id, w.milestones, s.ms)}
    ${w.changes.length === 0
      ? html`<section class="panel">${emptyState({ title: '아직 아이디어나 할 일이 없어요', desc: '위 입력창에 적고 Enter — 아이디어로 담아 두고, 하기로 하면 할 일로 옮기면 돼요.' })}</section>`
      : html`<div class="board" role="list" aria-label="작업 보드">
      ${COLUMNS.map(([key, label, statuses]) => {
        const items = open.filter((c) => statuses.includes(c.status))
        return html`<section class="board-col" role="listitem" aria-label="${label}">
          <header class="board-head"><span>${label}</span><span class="muted num">${items.length}</span></header>
          ${items.length ? items.map((c) => card(id, c, msName)) : html`<p class="board-empty">${key === 'idea' ? '비어 있어요' : '없음'}</p>`}
        </section>`
      })}
    </div>
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-title">끝난 항목 <span class="muted num">${done.length}</span></h2>
        ${done.length ? html`<button type="button" class="btn btn-sm" data-action="work-done-toggle" data-id="${id}" aria-expanded="${String(s.showDone)}">${s.showDone ? '접기' : '펼치기'}</button>` : ''}
      </div>
      ${s.showDone && done.length ? html`<ul class="list list-compact">${done.map((c) => html`<li class="list-item">
        <div class="list-badges">${badge(changeStatusLabel(c.status), c.status === 'SHIPPED' ? 'ok' : 'muted')}</div>
        <div class="list-main"><button type="button" class="linklike list-title" data-action="work-edit" data-id="${id}" data-c="${c.id}">${c.name}</button></div>
        <span class="muted">${fmtRelative(c.updated_at)}</span></li>`)}</ul>` : ''}
    </section>`}`
}

function card(pid, c, msName) {
  const next = NEXT[c.status]
  return html`<article class="wcard" data-c="${c.id}">
    <button type="button" class="wcard-title" data-action="work-edit" data-id="${pid}" data-c="${c.id}">${c.name}</button>
    ${c.note ? html`<p class="wcard-note">${c.note}</p>` : ''}
    <div class="wcard-meta">
      ${c.priority && c.priority !== 'normal' ? badge(priorityLabel(c.priority), priorityTone(c.priority)) : ''}
      ${c.status === 'PAUSED' ? badge('보류', 'muted') : ''}
      ${c.status === 'SHIP_READY' ? badge('출시 승인 대기', 'warn') : ''}
      ${c.milestone && msName.get(c.milestone) ? html`<span class="wcard-ms" title="마일스톤">◆ ${msName.get(c.milestone)}</span>` : ''}
      <span class="spacer"></span>
      ${next ? html`<button type="button" class="btn btn-sm" data-action="work-move" data-id="${pid}" data-c="${c.id}" data-to="${next}">${NEXT_LABEL[next]}</button>` : ''}
      <button type="button" class="icon-btn" data-action="work-menu" data-id="${pid}" data-c="${c.id}" aria-haspopup="menu" aria-expanded="false" aria-label="${c.name} 상태 바꾸기">⋯</button>
    </div>
  </article>`
}

function milestonesPanel(id, ms, active) {
  return html`<section class="panel">
    <div class="panel-head"><h2 class="panel-title">마일스톤</h2>
      <button type="button" class="btn btn-sm" data-action="ms-add" data-id="${id}">+ 마일스톤</button></div>
    ${ms.length ? html`<ul class="msl">${ms.map((m) => html`<li class="msl-item${active === m.id ? ' is-active' : ''}">
        <button type="button" class="msl-main" data-action="ms-filter" data-id="${id}" data-ms="${m.id}" aria-pressed="${String(active === m.id)}" title="이 마일스톤 항목만 보기">
          <span class="msl-name">${m.status === 'done' ? '✓ ' : '◆ '}${m.name}</span>
          <span class="msl-bar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, m.progress))}%"></span></span>
          <span class="muted num">${m.progress}% · ${m.done}/${m.total}</span>
          ${m.target_date ? html`<span class="${m.overdue ? 'msl-overdue' : 'muted'}">${m.overdue ? '기한 지남 · ' : ''}${m.target_date}</span>` : ''}
        </button>
        <button type="button" class="icon-btn" data-action="ms-menu" data-id="${id}" data-ms="${m.id}" aria-haspopup="menu" aria-expanded="false" aria-label="${m.name} 상태 바꾸기">⋯</button>
      </li>`)}</ul>
      ${active ? html`<p class="muted panel-text">선택한 마일스톤의 항목만 보고 있어요. <button type="button" class="linklike" data-action="ms-filter" data-id="${id}" data-ms="">전체 보기</button></p>` : ''}`
      : html`<p class="muted panel-text">출시 단위(예: MVP, v1.1)로 묶으면 진행률과 기한을 같이 볼 수 있어요.</p>`}
  </section>`
}

function bindQuickAdd(box) {
  const input = box.querySelector('#work-title')
  input?.focus()
}

const findChange = (id, cid) => st(id).work?.changes.find((c) => c.id === cid)

async function refresh(id) {
  try {
    await load(id)
    // 마일스톤 select 도 갱신되도록 프레임째 다시 그린다 (입력값 보존)
    const form = $('form[data-form="work-add"]')
    const keep = form ? { t: form.elements.title.value, s: form.elements.status.value } : null
    const box = $('#ptab')
    if (box && $('#work-body')?.dataset.id === id) {
      mount(box, frame({ id }, body({ id })))
      const f = $('form[data-form="work-add"]')
      if (keep && f) { f.elements.title.value = keep.t; f.elements.status.value = keep.s }
    }
    window.dispatchEvent(new Event('xita:refresh-quiet'))
  } catch (e) { toastError(e, '작업 목록을 새로 고치지 못했습니다') }
}

async function move(id, cid, to) {
  try {
    await v4(`/changes/${encodeURIComponent(cid)}/transition`, { method: 'POST', body: { lifecycle: to } })
    toast(MOVED_TOAST[to] ?? '옮겼어요')
    await refresh(id)
  } catch (e) { toastError(e, '상태를 바꾸지 못했습니다') }
}

F['work-add'] = async (form) => {
  const id = form.dataset.id
  const title = form.elements.title.value.trim()
  if (title.length < 2) { form.elements.title.focus(); toast('두 글자 이상 적어 주세요', { tone: 'info' }); return }
  const btn = form.querySelector('button[type="submit"]')
  btn.disabled = true
  try {
    const body = { title, status: form.elements.status.value }
    if (form.elements.milestone.value) body.milestone = form.elements.milestone.value
    await v4(`/products/${encodeURIComponent(id)}/changes`, { method: 'POST', body })
    form.elements.title.value = ''
    await refresh(id)
    $('#work-title')?.focus()
  } catch (e) { toastError(e, '추가하지 못했습니다') }
  btn.disabled = false
}

H['work-move'] = (el) => move(el.dataset.id, el.dataset.c, el.dataset.to)

H['work-menu'] = (el) => {
  const { id, c: cid } = el.dataset
  const c = findChange(id, cid)
  if (!c) return
  const items = (ALLOWED[c.status] ?? []).map((to) => ({
    label: MOVE_LABEL[to] ?? to,
    danger: to === 'CANCELLED',
    run: () => move(id, cid, to),
  }))
  const agent = DONE.includes(c.status) ? [] : [{ label: 'AI 에게 맡기기…', run: () => askAgent(id, c) }]
  openMenu(el, [{ label: '열어서 고치기', run: () => H['work-edit']({ dataset: { id, c: cid } }) }, ...agent, ...(items.length ? ['sep', ...items] : [])])
}

H['work-edit'] = async (el) => {
  const { id, c: cid } = el.dataset
  const s = st(id)
  const c = findChange(id, cid)
  if (!c) return
  const ms = s.work?.milestones ?? []
  const { value, fields } = await openDialog({
    title: '항목 고치기',
    desc: `${changeStatusLabel(c.status)}${c.updated_at ? ` · ${fmtRelative(c.updated_at)} 수정` : ''}`,
    body: html`<label class="field"><span class="field-label">제목</span>
        <input name="title" class="input" value="${c.name}" maxlength="200" required></label>
      <label class="field"><span class="field-label">메모</span>
        <textarea name="note" class="input textarea" rows="4" placeholder="왜 필요한지, 무엇을 할지 짧게">${c.note}</textarea></label>
      <div class="field-row">
        <label class="field"><span class="field-label">우선순위</span>
          <select name="priority" class="select">${PRIORITIES.map(([v, l]) => html`<option value="${v}" ${c.priority === v ? raw('selected') : ''}>${l}</option>`)}</select></label>
        <label class="field"><span class="field-label">마일스톤</span>
          <select name="milestone" class="select"><option value="">없음</option>${ms.map((m) => html`<option value="${m.id}" ${c.milestone === m.id ? raw('selected') : ''}>${m.name}</option>`)}</select></label>
      </div>`,
    actions: [{ label: '취소', value: 'cancel' }, { label: '저장', value: 'ok', primary: true }],
    validate: (f) => (f.title.trim().length < 2 ? '제목은 두 글자 이상이어야 해요.' : ''),
  })
  if (value !== 'ok') return
  try {
    await v4(`/changes/${encodeURIComponent(cid)}/edit`, {
      method: 'POST',
      body: { title: fields.title.trim(), note: fields.note, priority: fields.priority },
    })
    if ((fields.milestone || null) !== (c.milestone || null)) {
      await v4(`/changes/${encodeURIComponent(cid)}/milestone`, { method: 'POST', body: { milestone: fields.milestone || 'none' } })
    }
    toast('저장했어요')
    await refresh(id)
  } catch (e) { toastError(e, '저장하지 못했습니다') }
}

H['work-done-toggle'] = (el) => {
  const s = st(el.dataset.id)
  s.showDone = !s.showDone
  rerender(el.dataset.id)
}

H['ms-filter'] = (el) => {
  const s = st(el.dataset.id)
  s.ms = el.dataset.ms && s.ms !== el.dataset.ms ? el.dataset.ms : null
  rerender(el.dataset.id)
  const sel = $('select[data-ms-select]')
  if (sel) sel.value = s.ms ?? ''
}

H['ms-add'] = async (el) => {
  const id = el.dataset.id
  const { value, fields } = await openDialog({
    title: '새 마일스톤',
    desc: '출시 단위로 묶어요. 예: MVP, v1.1 — 광고 붙이기',
    body: html`<label class="field"><span class="field-label">이름</span><input name="name" class="input" maxlength="120" required placeholder="MVP"></label>
      <label class="field"><span class="field-label">목표일 <span class="muted">(선택)</span></span><input name="targetDate" type="date" class="input"></label>
      <label class="field"><span class="field-label">설명 <span class="muted">(선택)</span></span><textarea name="description" class="input textarea" rows="3"></textarea></label>`,
    actions: [{ label: '취소', value: 'cancel' }, { label: '만들기', value: 'ok', primary: true }],
    validate: (f) => (f.name.trim().length < 2 ? '이름은 두 글자 이상이어야 해요.' : ''),
  })
  if (value !== 'ok') return
  try {
    const body = { name: fields.name.trim() }
    if (fields.targetDate) body.targetDate = fields.targetDate
    if (fields.description.trim()) body.description = fields.description.trim()
    await v4(`/products/${encodeURIComponent(id)}/milestones`, { method: 'POST', body })
    toast('마일스톤을 만들었어요')
    await refresh(id)
  } catch (e) { toastError(e, '마일스톤을 만들지 못했습니다') }
}

H['ms-menu'] = (el) => {
  const { id, ms: mid } = el.dataset
  const m = st(id).work?.milestones.find((x) => x.id === mid)
  if (!m) return
  const set = (status) => async () => {
    if (status === 'done' && m.total > m.done) {
      const ok = await confirmDialog({ title: '마일스톤 완료', message: `아직 끝나지 않은 항목이 ${m.total - m.done}개 있어요. 그래도 완료로 표시할까요?`, confirmLabel: '완료로 표시' })
      if (!ok) return
    }
    try {
      await v4(`/milestones/${encodeURIComponent(mid)}/status`, { method: 'POST', body: { status } })
      toast({ planned: '계획으로 되돌렸어요', active: '진행 중으로 표시했어요', done: '완료로 표시했어요' }[status])
      await refresh(id)
    } catch (e) { toastError(e, '바꾸지 못했습니다') }
  }
  openMenu(el, Object.entries(MS_STATUS).map(([k, l]) => ({ label: l, disabled: m.status === k, run: set(k) })))
}
