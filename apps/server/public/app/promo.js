/*
 * XITA 웹 콘솔 — 홍보 (#/promo)
 * 자동 게시는 하지 않는다: AI 초안 → 복사해서 직접 올림 → 링크·반응 기록 → 게시 전후 수익 비교.
 */
import { html, raw, mount, $, pf, fmtRelative, fmtUSD, fmtNum, store } from './lib.js'
import { openDialog, toast, toastError, openMenu, confirmDialog } from './ui.js'
import { H, badge, emptyState, errorState, skeleton, pageHead } from './views.js'
import { projects, productName } from './state.js'

const ST = { status: store('xita.promo.status') || 'active', project: '', data: null }
const STATUS = { draft: ['초안', 'muted'], scheduled: ['올릴 예정', 'info'], posted: ['게시됨', 'ok'], archived: ['보관', 'muted'] }
const FILTERS = [['active', '진행 중'], ['posted', '게시됨'], ['archived', '보관'], ['all', '전체']]

async function load() {
  ST.data = await pf(`/promo${ST.project ? `?project=${encodeURIComponent(ST.project)}` : ''}`)
}

export async function renderPromo(view, live) {
  mount(view, html`${head()}${skeleton(5)}`)
  try {
    await load()
    if (!live()) return
    draw(view)
  } catch (e) {
    if (live()) mount(view, html`${head()}${errorState(e)}`)
  }
}

function head() {
  return pageHead('홍보', '커뮤니티에 올릴 글을 AI 로 초안 잡고, 올린 글의 링크·반응과 게시 전후 수익을 기록해요. 게시는 직접 해요.', html`
    <button type="button" class="btn" data-action="promo-new">직접 쓰기</button>
    <button type="button" class="btn btn-primary" data-action="promo-draft">AI 초안 만들기</button>`)
}

function draw(view) {
  const posts = ST.data?.posts ?? []
  const shown = posts.filter((p) =>
    ST.status === 'all' ? true : ST.status === 'active' ? ['draft', 'scheduled'].includes(p.status) : p.status === ST.status)
  const live = projects().filter((p) => !p.archived)
  mount(view, html`${head()}
    <div class="toolbar">
      <div class="filters" role="group" aria-label="상태">${FILTERS.map(([k, l]) => html`<button type="button" class="fchip" data-action="promo-filter" data-f="${k}" aria-pressed="${String(ST.status === k)}">${l}</button>`)}</div>
      <span class="spacer"></span>
      <label class="sr-only" for="promo-proj">프로젝트</label>
      <select id="promo-proj" class="select" data-promo-project>
        <option value="">모든 프로젝트</option>${live.map((p) => html`<option value="${p.id}" ${ST.project === p.id ? raw('selected') : ''}>${p.name}</option>`)}
      </select>
    </div>
    ${shown.length ? html`<div class="promo-list">${shown.map(card)}</div>`
      : emptyState({ title: posts.length ? '이 조건의 글이 없어요' : '아직 홍보글이 없어요', desc: 'AI 초안 만들기로 프로젝트와 커뮤니티를 고르면 그 커뮤니티 성격에 맞춘 초안을 써 줘요.' })}
    <details class="panel promo-comm">
      <summary class="panel-title">커뮤니티 목록 <span class="muted">${(ST.data?.communities ?? []).length}곳 · 규칙 메모는 직접 확인해 적어 두세요</span></summary>
      <ul class="list list-compact">${(ST.data?.communities ?? []).map((c, i) => html`<li class="list-item">
        <div class="list-main"><div class="list-title">${c.name} ${badge(c.lang === 'en' ? '영어' : '한국어', 'muted')}</div>
          <div class="list-desc">${c.tone || '성격 메모 없음'}${c.rules ? ` · 규칙: ${c.rules}` : ' · 규칙 미확인'}</div></div>
        ${c.url ? html`<a class="btn btn-sm" href="${c.url}" target="_blank" rel="noopener noreferrer">열기 ↗</a>` : ''}
        <button type="button" class="btn btn-sm" data-action="comm-edit" data-i="${i}">고치기</button></li>`)}</ul>
      <div class="row-actions"><button type="button" class="btn btn-sm" data-action="comm-edit" data-i="-1">+ 커뮤니티 추가</button></div>
    </details>`)
}

function effectLine(p) {
  const e = p.effect
  if (!e) return p.status === 'posted' ? html`<div class="promo-effect muted">수익 기록이 없거나 광고 없는 앱이에요</div>` : ''
  const fmt = (w) => (w.days ? `${fmtUSD(w.earnings)} · 노출 ${fmtNum(w.impressions)}` : '기록 없음')
  // $0.01 미만 기준은 % 가 의미 없다 (0.0003 → 0 = ▼100%)
  const diff = e.before.days && e.after.days && e.before.earnings >= 0.01
    ? Math.round(((e.after.earnings - e.before.earnings) / e.before.earnings) * 100) : null
  return html`<div class="promo-effect">게시 전 7일 <strong>${fmt(e.before)}</strong> → 후 7일 <strong>${fmt(e.after)}</strong>${diff !== null ? html` <span class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲' : '▼'}${Math.abs(diff)}%</span>` : ''}${e.after.days < 7 ? html` <span class="muted">(${e.after.days}일째)</span>` : ''}</div>`
}

function card(p) {
  const [label, tone] = STATUS[p.status] ?? STATUS.draft
  const m = p.metrics ?? {}
  const preview = p.body.replace(/<!--[\s\S]*?-->/g, '').trim()
  const check = p.body.match(/<!-- 게시 전 확인: ([\s\S]*?) -->/)?.[1]
  return html`<article class="panel promo-card">
    <div class="promo-head">${badge(label, tone)}<span class="promo-where">${productName(p.project)} → ${p.community}</span>
      <span class="spacer"></span><span class="muted">${p.posted_at ? `${fmtRelative(p.posted_at)} 게시` : `${fmtRelative(p.updated_at)} 수정`}</span>
      <button type="button" class="icon-btn" data-action="promo-menu" data-id="${p.id}" aria-haspopup="menu" aria-expanded="false" aria-label="홍보글 메뉴">⋯</button></div>
    ${p.title ? html`<h3 class="promo-title">${p.title}</h3>` : ''}
    <p class="promo-body">${preview}</p>
    ${check ? html`<div class="callout callout-warn">게시 전 확인: ${check}</div>` : ''}
    ${p.status === 'posted' ? html`<div class="promo-metrics">${p.url ? html`<a class="link" href="${p.url}" target="_blank" rel="noopener noreferrer">올린 글 ↗</a>` : ''}
      ${['views', 'likes', 'comments'].some((k) => m[k] != null) ? html`<span>조회 ${fmtNum(m.views)} · 추천 ${fmtNum(m.likes)} · 댓글 ${fmtNum(m.comments)}</span>` : ''}
      ${m.note ? html`<span class="muted">${m.note}</span>` : ''}</div>${effectLine(p)}` : ''}
    <div class="row-actions">
      <button type="button" class="btn btn-sm" data-action="promo-copy" data-id="${p.id}">복사</button>
      <button type="button" class="btn btn-sm" data-action="promo-edit" data-id="${p.id}">고치기</button>
      <span class="spacer"></span>
      ${p.status === 'posted'
        ? html`<button type="button" class="btn btn-sm" data-action="promo-metrics" data-id="${p.id}">반응 기록</button>`
        : html`<button type="button" class="btn btn-sm btn-primary" data-action="promo-posted" data-id="${p.id}">올렸어요</button>`}
    </div>
    ${p.ai_source ? html`<div class="promo-src muted">AI 초안 · ${p.ai_source.split('/').pop()}</div>` : ''}
  </article>`
}

const find = (id) => ST.data?.posts.find((p) => p.id === id)
const refresh = async () => { await load(); draw($('#view')) }

H['promo-filter'] = (el) => { ST.status = el.dataset.f; store('xita.promo.status', ST.status); draw($('#view')) }
document.addEventListener('change', (e) => {
  const sel = e.target.closest?.('select[data-promo-project]')
  if (!sel) return
  ST.project = sel.value
  refresh().catch((err) => toastError(err))
})

function projectOptions(selected) {
  return projects().filter((p) => !p.archived).map((p) => html`<option value="${p.id}" ${selected === p.id ? raw('selected') : ''}>${p.name}</option>`)
}

H['promo-draft'] = async () => {
  const comms = ST.data?.communities ?? []
  const { value, fields } = await openDialog({
    title: 'AI 초안 만들기',
    desc: '커뮤니티 성격과 적어 둔 규칙에 맞춰 써요. 앱 정보에 없는 기능은 쓰지 않게 했어요.',
    body: html`<label class="field"><span class="field-label">프로젝트</span><select name="project" class="select">${projectOptions(ST.project)}</select></label>
      <label class="field"><span class="field-label">커뮤니티</span><select name="community" class="select">${comms.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></label>
      <label class="field"><span class="field-label">언어</span><select name="lang" class="select"><option value="">커뮤니티 기본</option><option value="ko">한국어</option><option value="en">영어</option></select></label>
      <label class="field"><span class="field-label">강조할 점 <span class="muted">(선택)</span></span><input name="angle" class="input" placeholder="예: 광고 없이 무료, 이번 업데이트의 위젯 기능"></label>`,
    actions: [{ label: '취소', value: 'cancel' }, { label: '초안 만들기', value: 'ok', primary: true }],
  })
  if (value !== 'ok') return
  toast('AI 가 초안을 쓰는 중이에요 (수십 초)', { tone: 'info' })
  try {
    await pf('/promo/draft', { method: 'POST', body: { project: fields.project, community: fields.community, lang: fields.lang || undefined, angle: fields.angle || undefined } })
    ST.status = 'active'
    await refresh()
    toast('초안을 만들었어요')
  } catch (e) { toastError(e, '초안을 만들지 못했습니다') }
}

async function editDialog(p) {
  const comms = ST.data?.communities ?? []
  const { value, fields } = await openDialog({
    title: p ? '홍보글 고치기' : '직접 쓰기',
    wide: true,
    body: html`<div class="field-row">
        <label class="field"><span class="field-label">프로젝트</span><select name="project" class="select" ${p ? raw('disabled') : ''}>${projectOptions(p?.project ?? ST.project)}</select></label>
        <label class="field"><span class="field-label">커뮤니티</span><input name="community" class="input" list="comm-list" value="${p?.community ?? ''}" required>
          <datalist id="comm-list">${comms.map((c) => html`<option value="${c.name}">`)}</datalist></label>
      </div>
      <label class="field"><span class="field-label">제목</span><input name="title" class="input" value="${p?.title ?? ''}"></label>
      <label class="field"><span class="field-label">본문</span><textarea name="body" class="input textarea" rows="12">${p?.body ?? ''}</textarea></label>
      <label class="field"><span class="field-label">올릴 예정일 <span class="muted">(선택)</span></span><input name="scheduled_for" type="date" class="input" value="${p?.scheduled_for?.slice(0, 10) ?? ''}"></label>`,
    actions: [{ label: '취소', value: 'cancel' }, { label: '저장', value: 'ok', primary: true }],
    validate: (f) => (!f.community.trim() ? '커뮤니티를 적어 주세요.' : !f.body.trim() ? '본문이 비었어요.' : ''),
  })
  if (value !== 'ok') return
  const body = { community: fields.community.trim(), title: fields.title, body: fields.body, scheduled_for: fields.scheduled_for || null }
  if (fields.scheduled_for && (!p || p.status === 'draft')) body.status = 'scheduled'
  try {
    if (p) await pf(`/promo/${encodeURIComponent(p.id)}`, { method: 'POST', body })
    else await pf('/promo', { method: 'POST', body: { ...body, project: fields.project } })
    await refresh()
    toast('저장했어요')
  } catch (e) { toastError(e, '저장하지 못했습니다') }
}

H['promo-new'] = () => editDialog(null)
H['promo-edit'] = (el) => editDialog(find(el.dataset.id))

H['promo-copy'] = async (el) => {
  const p = find(el.dataset.id)
  if (!p) return
  const text = `${p.title ? `${p.title}\n\n` : ''}${p.body.replace(/<!--[\s\S]*?-->/g, '').trim()}`
  try { await navigator.clipboard.writeText(text); toast('복사했어요 — 커뮤니티에 붙여 넣으세요') }
  catch { toast('복사하지 못했어요. 고치기에서 직접 선택해 복사하세요', { tone: 'bad' }) }
}

H['promo-posted'] = async (el) => {
  const p = find(el.dataset.id)
  const { value, fields } = await openDialog({
    title: '올렸어요',
    desc: '올린 글 주소를 남기면 반응과 게시 전후 수익을 같이 볼 수 있어요.',
    body: html`<label class="field"><span class="field-label">글 주소</span><input name="url" type="url" class="input" placeholder="https://" value="${p?.url ?? ''}"></label>
      <label class="field"><span class="field-label">올린 날짜</span><input name="posted_at" type="date" class="input" value="${new Date().toISOString().slice(0, 10)}"></label>`,
    actions: [{ label: '취소', value: 'cancel' }, { label: '게시됨으로 기록', value: 'ok', primary: true }],
    validate: (f) => (f.url && !/^https?:\/\//.test(f.url) ? '주소는 http(s):// 로 시작해야 해요.' : ''),
  })
  if (value !== 'ok') return
  try {
    await pf(`/promo/${encodeURIComponent(el.dataset.id)}`, { method: 'POST', body: { status: 'posted', url: fields.url || null, posted_at: fields.posted_at ? new Date(`${fields.posted_at}T12:00:00`).toISOString() : null } })
    await refresh()
    toast('게시됨으로 기록했어요')
  } catch (e) { toastError(e, '기록하지 못했습니다') }
}

H['promo-metrics'] = async (el) => {
  const p = find(el.dataset.id)
  const m = p?.metrics ?? {}
  const { value, fields } = await openDialog({
    title: '반응 기록',
    body: html`<div class="field-row">
        <label class="field"><span class="field-label">조회</span><input name="views" type="number" min="0" class="input" value="${m.views ?? ''}"></label>
        <label class="field"><span class="field-label">추천</span><input name="likes" type="number" min="0" class="input" value="${m.likes ?? ''}"></label>
      </div>
      <label class="field"><span class="field-label">댓글</span><input name="comments" type="number" min="0" class="input" value="${m.comments ?? ''}"></label>
      <label class="field"><span class="field-label">메모</span><input name="note" class="input" value="${m.note ?? ''}" placeholder="반응 요약, 받은 피드백"></label>`,
    actions: [{ label: '취소', value: 'cancel' }, { label: '저장', value: 'ok', primary: true }],
  })
  if (value !== 'ok') return
  const num = (v) => (v === '' ? undefined : Number(v))
  try {
    await pf(`/promo/${encodeURIComponent(el.dataset.id)}`, { method: 'POST', body: { metrics: { views: num(fields.views), likes: num(fields.likes), comments: num(fields.comments), note: fields.note } } })
    await refresh()
    toast('저장했어요')
  } catch (e) { toastError(e, '저장하지 못했습니다') }
}

H['promo-menu'] = (el) => {
  const p = find(el.dataset.id)
  if (!p) return
  const set = (status) => async () => {
    try { await pf(`/promo/${encodeURIComponent(p.id)}`, { method: 'POST', body: { status } }); await refresh() }
    catch (e) { toastError(e) }
  }
  openMenu(el, [
    { label: '초안으로', disabled: p.status === 'draft', run: set('draft') },
    { label: '보관', disabled: p.status === 'archived', run: set('archived') },
    'sep',
    { label: '삭제', danger: true, run: async () => {
      if (!(await confirmDialog({ title: '홍보글 삭제', message: '이 글을 지울까요? 되돌릴 수 없어요.', confirmLabel: '삭제', danger: true }))) return
      try { await pf(`/promo/${encodeURIComponent(p.id)}/remove`, { method: 'POST', body: {} }); await refresh(); toast('삭제했어요') }
      catch (e) { toastError(e) }
    } },
  ])
}

H['comm-edit'] = async (el) => {
  const list = [...(ST.data?.communities ?? [])]
  const i = Number(el.dataset.i)
  const c = list[i] ?? { name: '', url: '', lang: 'ko', tone: '', rules: '' }
  const { value, fields } = await openDialog({
    title: i >= 0 ? '커뮤니티 고치기' : '커뮤니티 추가',
    body: html`<label class="field"><span class="field-label">이름</span><input name="name" class="input" value="${c.name}" required></label>
      <label class="field"><span class="field-label">주소</span><input name="url" class="input" value="${c.url}" placeholder="https://"></label>
      <label class="field"><span class="field-label">언어</span><select name="lang" class="select"><option value="ko" ${c.lang !== 'en' ? raw('selected') : ''}>한국어</option><option value="en" ${c.lang === 'en' ? raw('selected') : ''}>영어</option></select></label>
      <label class="field"><span class="field-label">글 성격</span><input name="tone" class="input" value="${c.tone}" placeholder="예: 개발자 대상, 담백하게"></label>
      <label class="field"><span class="field-label">규칙 메모</span><textarea name="rules" class="input textarea" rows="3" placeholder="자기 홍보 허용 여부, 게시판, 말머리 등 — 직접 확인한 내용">${c.rules}</textarea></label>`,
    actions: [
      ...(i >= 0 ? [{ label: '삭제', value: 'delete', danger: true }] : []),
      { label: '취소', value: 'cancel' },
      { label: '저장', value: 'ok', primary: true },
    ],
    validate: (f, v) => (v === 'ok' && !f.name.trim() ? '이름을 적어 주세요.' : ''),
  })
  if (value === 'cancel') return
  if (value === 'delete') list.splice(i, 1)
  else if (i >= 0) list[i] = { ...c, ...fields }
  else list.push({ ...fields, id: '' })
  try {
    await pf('/promo/communities', { method: 'PUT', body: { communities: list } })
    await refresh()
    toast('커뮤니티 목록을 저장했어요')
  } catch (e) { toastError(e, '저장하지 못했습니다') }
}
