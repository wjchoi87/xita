/*
 * XITA 웹 콘솔 — 기획 (#/plan, #/plan/<id>)
 * CLI `xita plan` 과 같은 세션. AI 가 단계별로 질문하고, 확정 전까지는 초안만 저장된다.
 */
import { html, raw, mount, $, v4, fmtRelative } from './lib.js'
import { toast, toastError, confirmDialog } from './ui.js'
import { H, F, emptyState, errorState, skeleton, pageHead } from './views.js'
import { renderMarkdown } from './markdown.js'

let busy = false

export async function renderPlans(view, live, id) {
  if (id) return renderPlan(view, live, id)
  mount(view, html`${pageHead('기획', 'AI 가 질문하며 새 프로젝트를 이름부터 수익화까지 단계별로 같이 정리해요. 확정하기 전까지는 초안만 저장돼요.')}${skeleton(4)}`)
  let list
  try {
    list = await v4('/plans')
  } catch (e) {
    if (live()) mount(view, html`${pageHead('기획')}${errorState(e)}`)
    return
  }
  if (!live()) return
  const open = list.filter((x) => x.status === 'drafting')
  const done = list.filter((x) => x.status !== 'drafting')
  mount(view, html`${pageHead('기획', 'AI 가 질문하며 새 프로젝트를 이름부터 수익화까지 단계별로 같이 정리해요. 확정하기 전까지는 초안만 저장돼요.')}
    <form class="panel quickadd" data-form="plan-new">
      <label class="sr-only" for="plan-idea">아이디어</label>
      <input id="plan-idea" name="idea" class="input" placeholder="만들고 싶은 것을 한 줄로 — 예: 헬스 기록을 사진 한 장으로 정리하는 앱" autocomplete="off" maxlength="300">
      <button type="submit" class="btn btn-primary">기획 시작</button>
    </form>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title">작성 중</h2><span class="muted num">${open.length}</span></div>
      ${open.length ? html`<ul class="list list-compact">${open.map((x) => html`<li class="list-item">
          <div class="list-main"><a class="list-title" href="#/plan/${encodeURIComponent(x.id)}">${x.name}</a>
            <div class="list-desc">${x.stage + 1}/${x.stages} ${x.stageTitle} · ${fmtRelative(x.updated_at)}</div></div>
          <span class="plan-dots" aria-label="${x.stage + 1}단계 / ${x.stages}">${Array.from({ length: x.stages }, (_, i) => html`<i class="${i < x.stage ? 'on' : i === x.stage ? 'cur' : ''}"></i>`)}</span>
          <a class="btn btn-sm" href="#/plan/${encodeURIComponent(x.id)}">이어 하기</a></li>`)}</ul>`
        : emptyState({ title: '작성 중인 기획이 없어요', desc: '위에 아이디어 한 줄을 적고 시작하세요. 터미널에서는 xita plan 으로도 같은 기획을 이어 할 수 있어요.' })}
    </section>
    ${done.length ? html`<section class="panel">
      <div class="panel-head"><h2 class="panel-title">끝난 기획</h2></div>
      <ul class="list list-compact">${done.map((x) => html`<li class="list-item">
        <div class="list-main"><a class="list-title" href="#/plan/${encodeURIComponent(x.id)}">${x.name}</a>
          <div class="list-desc">${x.status === 'confirmed' ? '확정' : '중단'} · ${fmtRelative(x.updated_at)}</div></div>
        ${x.product ? html`<a class="btn btn-sm" href="#/projects/${encodeURIComponent(x.product)}/work">프로젝트 보기</a>` : ''}</li>`)}</ul>
    </section>` : ''}`)
  $('#plan-idea')?.focus()
}

F['plan-new'] = async (form) => {
  const idea = form.elements.idea.value.trim()
  const btn = form.querySelector('button[type="submit"]')
  btn.disabled = true
  btn.textContent = 'AI 가 첫 질문을 준비 중…'
  try {
    const p = await v4('/plans', { method: 'POST', body: idea ? { idea } : {} })
    location.hash = `#/plan/${encodeURIComponent(p.id)}`
  } catch (e) {
    toastError(e, '기획을 시작하지 못했습니다')
    btn.disabled = false
    btn.textContent = '기획 시작'
  }
}

// ── 상세 (대화 + 기획서) ────────────────────────────────────────────────────
const cache = new Map()

async function renderPlan(view, live, id) {
  mount(view, html`<nav class="crumbs"><a href="#/plan">기획</a></nav>${skeleton(6)}`)
  try {
    const p = await v4(`/plans/${encodeURIComponent(id)}`)
    cache.set(id, p)
    if (!live()) return
    draw(view, p)
  } catch (e) {
    if (live()) mount(view, html`<nav class="crumbs"><a href="#/plan">기획</a></nav>${errorState(e)}`)
  }
}

function draw(view, p) {
  const drafting = p.status === 'drafting'
  const stage = p.stages[p.stage]
  const msgs = p.messages
  const lastAsk = [...msgs].reverse().find((m) => m.role === 'assistant')
  mount(view, html`<nav class="crumbs" aria-label="위치"><a href="#/plan">기획</a><span aria-hidden="true">/</span><span>${p.draft?.name || '이름 없는 기획'}</span></nav>
    <header class="page-head"><div>
      <h1 class="page-title">${p.draft?.name || '이름 없는 기획'}</h1>
      <p class="page-sub">${drafting ? `${p.stage + 1}/${p.stages.length} ${stage.title}` : p.status === 'confirmed' ? '확정됨' : '중단됨'}${p.draft?.one_liner ? ` · ${p.draft.one_liner}` : ''}</p>
    </div>${p.product ? html`<div class="page-actions"><a class="btn btn-primary" href="#/projects/${encodeURIComponent(p.product)}/work">프로젝트로</a></div>` : ''}</header>
    <ol class="stepper" aria-label="기획 단계">${p.stages.map((s, i) => html`<li class="${i < p.stage ? 'done' : i === p.stage ? 'cur' : ''}">
      ${drafting ? html`<button type="button" data-action="plan-goto" data-id="${p.id}" data-to="${s.key}" ${i === p.stage ? raw('aria-current="step"') : ''}>${s.title}</button>` : html`<span>${s.title}</span>`}</li>`)}</ol>
    <div class="cols cols-wide-left">
      <section class="panel chat" aria-label="AI 와의 대화">
        <div class="chat-log" id="chat-log" aria-live="polite">
          ${msgs.length ? msgs.map((m, i) => html`${i === 0 || msgs[i - 1].stage !== m.stage ? html`<div class="chat-stage">${p.stages.find((s) => s.key === m.stage)?.title ?? ''}</div>` : ''}
            <div class="msg msg-${m.role}">${m.role === 'assistant' ? html`<div class="msg-body">${m.content}</div>${m.source === 'rule' ? html`<div class="msg-meta">AI 연결 없음 · 기본 질문</div>` : ''}` : html`<div class="msg-body">${m.content}</div>`}</div>`)
            : html`<p class="muted">아직 대화가 없어요.</p>`}
          <div class="msg msg-assistant msg-typing" id="typing" hidden><div class="msg-body"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span> 생각하는 중…</div></div>
        </div>
        ${drafting ? html`
          ${lastAsk?.options?.length ? html`<div class="chat-options" role="group" aria-label="빠른 답">${lastAsk.options.map((o) => html`<button type="button" class="chip-btn" data-action="plan-opt" data-id="${p.id}" data-text="${o}">${o}</button>`)}</div>` : ''}
          <form class="chat-input" data-form="plan-turn" data-id="${p.id}">
            <label class="sr-only" for="plan-msg">답하기</label>
            <textarea id="plan-msg" name="message" class="input textarea" rows="2" placeholder="자유롭게 답하세요 — Enter 보내기, Shift+Enter 줄바꿈"></textarea>
            <div class="row-actions">
              <button type="button" class="btn btn-sm" data-action="plan-goto" data-id="${p.id}" data-to="prev" ${p.stage === 0 ? raw('disabled') : ''}>이전 단계</button>
              <button type="button" class="btn btn-sm" data-action="plan-goto" data-id="${p.id}" data-to="next" ${p.stage >= p.stages.length - 1 ? raw('disabled') : ''}>${p.ready?.[stage.key] ? '다음 단계 ▸' : '다음 단계'}</button>
              <span class="spacer"></span>
              <button type="submit" class="btn btn-primary">보내기</button>
            </div>
          </form>` : ''}
      </section>
      <aside class="panel">
        <div class="panel-head"><h2 class="panel-title">기획서</h2>
          ${drafting ? html`<button type="button" class="btn btn-sm btn-primary" data-action="plan-confirm" data-id="${p.id}">확정…</button>` : ''}</div>
        ${drafting && p.problems?.length ? html`<div class="callout callout-warn">확정 전에 채울 것: ${p.problems.join(' · ')}</div>` : ''}
        <div class="md plan-md">${raw(renderMarkdown(p.markdown))}</div>
        ${drafting ? html`<div class="row-actions"><span class="spacer"></span><button type="button" class="btn btn-sm" data-action="plan-abandon" data-id="${p.id}">중단</button></div>` : ''}
      </aside>
    </div>`)
  const log = $('#chat-log')
  if (log) log.scrollTop = log.scrollHeight
  const ta = $('#plan-msg')
  if (ta) {
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ta.form.requestSubmit() }
    })
    ta.focus()
  }
}

function setBusy(on) {
  busy = on
  const t = $('#typing')
  if (t) t.hidden = !on
  for (const el of document.querySelectorAll('.chat-input textarea, .chat-input button, .chat-options button, .stepper button, [data-action="plan-confirm"]')) el.disabled = on
  const log = $('#chat-log')
  if (log) log.scrollTop = log.scrollHeight
}

async function send(id, message) {
  if (busy || !message.trim()) return
  // 내 말은 바로 보이게
  const log = $('#chat-log')
  const typing = $('#typing')
  if (log && typing) {
    const el = document.createElement('div')
    el.className = 'msg msg-user'
    el.innerHTML = `<div class="msg-body"></div>`
    el.firstChild.textContent = message
    log.insertBefore(el, typing)
  }
  setBusy(true)
  try {
    const p = await v4(`/plans/${encodeURIComponent(id)}/turn`, { method: 'POST', body: { message } })
    cache.set(id, p)
    draw($('#view'), p)
  } catch (e) {
    toastError(e, 'AI 응답을 받지 못했습니다')
  } finally {
    setBusy(false)
  }
}

F['plan-turn'] = (form) => {
  const v = form.elements.message.value
  form.elements.message.value = ''
  send(form.dataset.id, v)
}

H['plan-opt'] = (el) => send(el.dataset.id, el.dataset.text)

H['plan-goto'] = async (el) => {
  if (busy) return
  setBusy(true)
  try {
    const p = await v4(`/plans/${encodeURIComponent(el.dataset.id)}/stage`, { method: 'POST', body: { to: el.dataset.to } })
    cache.set(p.id, p)
    draw($('#view'), p)
  } catch (e) {
    toastError(e, '단계를 옮기지 못했습니다')
  } finally {
    setBusy(false)
  }
}

H['plan-confirm'] = async (el) => {
  const p = cache.get(el.dataset.id)
  if (p?.problems?.length) {
    toast('확정하려면 먼저 채워야 해요', { tone: 'bad', detail: p.problems.join(' · ') })
    return
  }
  const ok = await confirmDialog({
    title: '기획 확정',
    message: `"${p?.draft?.name}" 프로젝트를 만들어요. 제품·기획서·수익 모델 결정·마일스톤·할 일이 생성돼요.`,
    detail: p?.gaps?.length ? `아직 비어 있는 단계: ${p.gaps.join(', ')} — 지금 확정해도 되고 나중에 고쳐도 돼요.` : '',
    confirmLabel: '확정하고 만들기',
  })
  if (!ok) return
  try {
    const r = await v4(`/plans/${encodeURIComponent(el.dataset.id)}/confirm`, { method: 'POST', body: {} })
    toast('프로젝트를 만들었어요', { detail: r.milestones.map((m) => m.name).join(' · ') })
    window.dispatchEvent(new Event('xita:refresh-quiet'))
    location.hash = `#/projects/${encodeURIComponent(r.product)}/work`
  } catch (e) { toastError(e, '확정하지 못했습니다') }
}

H['plan-abandon'] = async (el) => {
  const ok = await confirmDialog({ title: '기획 중단', message: '이 기획을 중단할까요? 초안은 지워지지 않고 끝난 기획에 남아요.', confirmLabel: '중단', danger: true })
  if (!ok) return
  try {
    await v4(`/plans/${encodeURIComponent(el.dataset.id)}/abandon`, { method: 'POST', body: {} })
    toast('중단했어요')
    location.hash = '#/plan'
  } catch (e) { toastError(e, '중단하지 못했습니다') }
}
