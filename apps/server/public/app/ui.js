/*
 * XITA 웹 콘솔 — 공용 UI 컴포넌트
 * 테마 · 토스트 · 모달(확인/폼) · 작업(Job) 드로어 · 팝오버 메뉴 · ⌘K 커맨드 팔레트
 */
import { $, $$, html, raw, mount, pf, v4, store, debounce, docTypeLabel } from './lib.js'

// ── 테마 ──────────────────────────────────────────────────────────────────
const THEME_KEY = 'xita.theme'
const darkMq = window.matchMedia('(prefers-color-scheme: dark)')

export function themePref() {
  const v = store(THEME_KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

export function applyTheme(pref = themePref()) {
  const resolved = pref === 'system' ? (darkMq.matches ? 'dark' : 'light') : pref
  document.documentElement.dataset.theme = resolved
  document.documentElement.dataset.themePref = pref
  for (const b of $$('[data-theme-choice]')) {
    b.setAttribute('aria-pressed', String(b.dataset.themeChoice === pref))
  }
}

export function setTheme(pref) {
  store(THEME_KEY, pref)
  applyTheme(pref)
}

export function themeControl() {
  const opts = [['system', '시스템'], ['light', '라이트'], ['dark', '다크']]
  const cur = themePref()
  return html`<div class="seg" role="group" aria-label="테마">
    ${opts.map(([v, l]) => html`<button type="button" class="seg-btn" data-action="theme" data-theme-choice="${v}" aria-pressed="${String(cur === v)}">${l}</button>`)}
  </div>`
}

export function initTheme() {
  applyTheme()
  // 시스템 설정 실시간 추종
  darkMq.addEventListener('change', () => {
    if (themePref() === 'system') applyTheme('system')
  })
}

// ── 토스트 ────────────────────────────────────────────────────────────────
export function toast(message, { tone = 'ok', detail = '' } = {}) {
  const box = $('#toasts')
  if (!box) return
  const el = document.createElement('div')
  el.className = `toast toast-${tone}`
  el.setAttribute('role', tone === 'bad' ? 'alert' : 'status')
  mount(el, html`<span class="toast-dot" aria-hidden="true"></span>
    <div class="toast-text"><div>${message}</div>${detail ? html`<div class="toast-detail">${detail}</div>` : ''}</div>
    <button type="button" class="icon-btn toast-x" aria-label="알림 닫기">×</button>`)
  const close = () => {
    el.classList.add('out')
    setTimeout(() => el.remove(), 180)
  }
  el.querySelector('.toast-x').addEventListener('click', close)
  box.appendChild(el)
  setTimeout(close, tone === 'bad' ? 8000 : 4000)
}

export const toastError = (e, prefix = '') =>
  toast(prefix || '요청을 처리하지 못했습니다', { tone: 'bad', detail: e?.message ?? String(e) })

// ── 모달 ──────────────────────────────────────────────────────────────────
/**
 * openDialog({ title, desc, body, actions, validate, wide })
 * → Promise<{ value, fields }>  (취소/ESC 는 value === 'cancel')
 * actions: [{ label, value, primary?, danger? }]
 */
export function openDialog({ title, desc = '', body = '', actions, validate, wide = false, onMount }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog')
    dlg.className = `modal${wide ? ' modal-wide' : ''}`
    dlg.setAttribute('aria-labelledby', 'modal-title')
    const acts = actions ?? [{ label: '닫기', value: 'cancel' }]
    mount(dlg, html`<form method="dialog" class="modal-inner" novalidate>
      <div class="modal-head">
        <h2 id="modal-title" class="modal-title">${title}</h2>
        ${desc ? html`<p class="modal-desc">${desc}</p>` : ''}
      </div>
      <div class="modal-body">${body}</div>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions">
        ${acts.map((a) => html`<button type="submit" value="${a.value}" class="btn${a.primary ? ' btn-primary' : ''}${a.danger ? ' btn-danger' : ''}" ${a.value === 'cancel' ? raw('formnovalidate') : ''}>${a.label}</button>`)}
      </div>
    </form>`)
    document.body.appendChild(dlg)
    const form = dlg.querySelector('form')
    const errEl = dlg.querySelector('.form-error')
    form.addEventListener('submit', (e) => {
      const value = e.submitter?.value ?? 'ok'
      if (value !== 'cancel' && validate) {
        const msg = validate(fieldsOf(form), value, dlg)
        if (msg) {
          e.preventDefault()
          errEl.textContent = msg
          errEl.hidden = false
          return
        }
      }
      dlg.returnValue = value
    })
    dlg.addEventListener('close', () => {
      const value = dlg.returnValue || 'cancel'
      const fields = fieldsOf(form)
      dlg.remove()
      resolve({ value, fields })
    })
    dlg.showModal()
    onMount?.(dlg)
    const first = dlg.querySelector('[autofocus], input, textarea, select')
    if (first) first.focus()
  })
}

function fieldsOf(form) {
  const out = {}
  for (const el of form.elements) {
    if (!el.name) continue
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value
  }
  return out
}

/**
 * 확인 창. typeText 가 있으면 그 문구를 정확히 입력해야 확인 버튼이 활성화된다.
 */
export async function confirmDialog({ title, message, detail = '', confirmLabel = '확인', danger = false, typeText = '' }) {
  const body = html`
    ${message ? html`<p class="modal-text">${message}</p>` : ''}
    ${detail ? html`<div class="callout callout-warn">${detail}</div>` : ''}
    ${typeText ? html`<label class="field">
      <span class="field-label">확인을 위해 <strong>${typeText}</strong> 을(를) 입력하세요</span>
      <input name="confirmText" class="input" autocomplete="off" spellcheck="false" aria-describedby="modal-title">
    </label>` : ''}`
  const { value } = await openDialog({
    title,
    body,
    actions: [
      { label: '취소', value: 'cancel' },
      { label: confirmLabel, value: 'ok', primary: !danger, danger },
    ],
    validate: typeText
      ? (f) => (f.confirmText.trim() === typeText ? '' : `입력한 문구가 "${typeText}" 와 다릅니다.`)
      : undefined,
    onMount: (dlg) => {
      if (!typeText) return
      const btn = dlg.querySelector('button[value="ok"]')
      const input = dlg.querySelector('input[name="confirmText"]')
      btn.disabled = true
      input.addEventListener('input', () => { btn.disabled = input.value.trim() !== typeText })
    },
  })
  return value === 'ok'
}

// ── 팝오버 메뉴 ────────────────────────────────────────────────────────────
let openMenuEl = null

export function closeMenu() {
  if (!openMenuEl) return
  const { el, anchor } = openMenuEl
  el.remove()
  anchor.setAttribute('aria-expanded', 'false')
  openMenuEl = null
  anchor.focus()
}

/** items: [{ label, run, danger?, disabled?, hint? } | 'sep'] */
export function openMenu(anchor, items) {
  if (openMenuEl?.anchor === anchor) { closeMenu(); return }
  if (openMenuEl) closeMenu()
  const el = document.createElement('div')
  el.className = 'menu'
  el.setAttribute('role', 'menu')
  mount(el, html`${items.map((it, i) => (it === 'sep'
    ? html`<div class="menu-sep" role="separator"></div>`
    : html`<button type="button" role="menuitem" class="menu-item${it.danger ? ' danger' : ''}" data-i="${i}" ${it.disabled ? raw('disabled') : ''}>
        <span>${it.label}</span>${it.hint ? html`<span class="menu-hint">${it.hint}</span>` : ''}</button>`))}`)
  document.body.appendChild(el)
  const r = anchor.getBoundingClientRect()
  const w = el.offsetWidth
  el.style.top = `${Math.min(r.bottom + 4, window.innerHeight - el.offsetHeight - 8)}px`
  el.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`
  anchor.setAttribute('aria-expanded', 'true')
  openMenuEl = { el, anchor }
  const btns = $$('.menu-item:not([disabled])', el)
  btns[0]?.focus()
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.menu-item')
    if (!b) return
    const it = items[Number(b.dataset.i)]
    closeMenu()
    it.run?.()
  })
  el.addEventListener('keydown', (e) => {
    const idx = btns.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(idx + 1) % btns.length]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); btns[(idx - 1 + btns.length) % btns.length]?.focus() }
    if (e.key === 'Escape') { e.preventDefault(); closeMenu() }
    if (e.key === 'Tab') closeMenu()
  })
}

document.addEventListener('mousedown', (e) => {
  if (openMenuEl && !openMenuEl.el.contains(e.target) && !openMenuEl.anchor.contains(e.target)) closeMenu()
})

// ── 작업(Job) 드로어 ────────────────────────────────────────────────────────
// 실행 중 작업을 1초마다 폴링해 로그를 보여주고, 끝나면 onDone 콜백으로 화면을 갱신한다.
const jobs = new Map() // id → { job, timer, open }
let onJobDone = () => {}
let jobsMin = false      // 드로어 접힘 (헤더만)
let minTimer = null

export function initJobs({ onDone }) {
  onJobDone = onDone
  $('#jobs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-job-action]')
    if (!t) return
    if (t.dataset.jobAction === 'minimize') { jobsMin = !jobsMin; renderJobs(); return }
    if (t.dataset.jobAction === 'clear') {
      for (const [id, en] of jobs) if (en.job.done) jobs.delete(id)
      renderJobs()
      return
    }
    const id = t.dataset.jobId
    const entry = jobs.get(id)
    if (!entry) return
    if (t.dataset.jobAction === 'toggle') { entry.open = !entry.open; renderJobs() }
    if (t.dataset.jobAction === 'dismiss') { clearInterval(entry.timer); jobs.delete(id); renderJobs() }
  })
  // 독(토스트+작업) 높이만큼 본문 하단 여백을 늘려 버튼이 가려지지 않게 한다
  const dock = $('.dock')
  if (dock && 'ResizeObserver' in window) {
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight}px`)
    }).observe(dock)
  }
}

/** 모든 작업이 끝나면 잠시 뒤 드로어를 접는다 (실패한 작업은 펼친 채 둔다) */
function scheduleAutoMinimize() {
  clearTimeout(minTimer)
  const all = [...jobs.values()]
  if (!all.length || all.some((e) => !e.job.done) || all.some((e) => !e.job.ok && e.open)) return
  minTimer = setTimeout(() => {
    if ([...jobs.values()].every((e) => e.job.done)) { jobsMin = true; renderJobs() }
  }, 5000)
}

export function watchJob(jobId, label = '작업') {
  if (!jobId) return
  if (jobs.has(jobId)) { jobs.get(jobId).open = true; renderJobs(); return }
  for (const e of jobs.values()) e.open = false
  jobsMin = false
  clearTimeout(minTimer)
  const entry = {
    job: { id: jobId, label, done: false, ok: false, lines: [], startedAt: Date.now() / 1000 },
    open: true,
    timer: null,
  }
  jobs.set(jobId, entry)
  renderJobs()
  const tick = async () => {
    try {
      const j = await pf(`/jobs/${encodeURIComponent(jobId)}`)
      entry.job = { ...entry.job, ...j, lines: j.lines ?? [] }
      if (j.done) {
        clearInterval(entry.timer)
        toast(j.ok ? `${j.label || label} 완료` : `${j.label || label} 실패`, {
          tone: j.ok ? 'ok' : 'bad',
          detail: j.ok ? '' : '작업 로그에서 원인을 확인하세요.',
        })
        onJobDone(j)
        scheduleAutoMinimize()
      }
    } catch (e) {
      clearInterval(entry.timer)
      entry.job = { ...entry.job, done: true, ok: false, lines: [...entry.job.lines, `상태를 가져오지 못했습니다: ${e.message}`] }
    }
    renderJobs()
  }
  entry.timer = setInterval(tick, 1000)
  tick()
}

function jobState(j) {
  if (!j.done) return { cls: 'run', label: '실행 중' }
  return j.ok ? { cls: 'ok', label: '완료' } : { cls: 'bad', label: '실패' }
}

function renderJobs() {
  const box = $('#jobs')
  const list = [...jobs.values()].reverse()
  box.hidden = list.length === 0
  // 열려 있는 로그의 스크롤 위치 보존 (맨 아래면 따라간다)
  const prev = {}
  for (const pre of $$('.job-log', box)) {
    prev[pre.dataset.jobId] = { top: pre.scrollTop, atBottom: pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 24 }
  }
  const running = list.filter((e) => !e.job.done).length
  const failed = list.filter((e) => e.job.done && !e.job.ok).length
  const summary = running ? `${running}개 실행 중` : failed ? `${failed}개 실패` : '모두 완료'
  box.classList.toggle('is-min', jobsMin)
  mount(box, html`<div class="jobs-head">
      <button type="button" class="jobs-min" data-job-action="minimize" aria-expanded="${String(!jobsMin)}">
        <span class="dot dot-${running ? 'run' : failed ? 'bad' : 'ok'}" aria-hidden="true"></span>
        <span>작업</span><span class="muted">${summary}</span><span class="spacer"></span>
        <span class="muted" aria-hidden="true">${jobsMin ? '펼치기' : '접기'}</span></button>
      ${!running && !jobsMin ? html`<button type="button" class="btn btn-sm jobs-clear" data-job-action="clear">지우기</button>` : ''}
    </div>
    ${jobsMin ? '' : list.map(({ job, open }) => {
      const st = jobState(job)
      return html`<section class="job" aria-label="${job.label}">
        <div class="job-row">
          <button type="button" class="job-toggle" data-job-action="toggle" data-job-id="${job.id}" aria-expanded="${String(open)}">
            <span class="dot dot-${st.cls}" aria-hidden="true"></span>
            <span class="job-label">${job.label}</span>
            <span class="job-state">${st.label}</span>
          </button>
          ${job.done ? html`<button type="button" class="icon-btn" data-job-action="dismiss" data-job-id="${job.id}" aria-label="작업 닫기">×</button>` : ''}
        </div>
        ${open ? html`<pre class="job-log" data-job-id="${job.id}" tabindex="0" aria-label="작업 로그">${job.lines.length ? job.lines.join('\n') : '로그를 기다리는 중…'}</pre>` : ''}
      </section>`
    })}`)
  for (const pre of $$('.job-log', box)) {
    const p = prev[pre.dataset.jobId]
    pre.scrollTop = !p || p.atBottom ? pre.scrollHeight : p.top
  }
}

// ── ⌘K 커맨드 팔레트 ─────────────────────────────────────────────────────────
let paletteSource = () => []
let paletteOpen = false

/** fn() → [{ section, label, hint?, keywords?, queryOnly?, run }]  queryOnly: 검색어가 있을 때만 노출 */
export function setPaletteSource(fn) { paletteSource = fn }

export function openPalette(initial = '') {
  if (paletteOpen) return
  paletteOpen = true
  const back = document.createElement('div')
  back.className = 'palette-back'
  mount(back, html`<div class="palette" role="dialog" aria-modal="true" aria-label="명령 팔레트">
    <input class="palette-input" type="text" placeholder="프로젝트로 이동, 작업 실행, 전체 검색…" aria-label="명령 검색" role="combobox" aria-expanded="true" aria-controls="palette-list" autocomplete="off" spellcheck="false">
    <div class="palette-list" id="palette-list" role="listbox"></div>
    <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 이동</span><span><kbd>Enter</kbd> 실행</span><span><kbd>Esc</kbd> 닫기</span></div>
  </div>`)
  document.body.appendChild(back)
  const input = $('.palette-input', back)
  const listEl = $('.palette-list', back)
  const prevFocus = document.activeElement
  let items = []
  let active = 0
  let remote = []
  let remoteQuery = ''

  const close = () => {
    paletteOpen = false
    back.remove()
    prevFocus?.focus?.()
  }

  const compute = () => {
    const q = input.value.trim().toLowerCase()
    const base = paletteSource()
    const local = q
      ? base.filter((it) => `${it.label} ${it.keywords ?? ''} ${it.hint ?? ''}`.toLowerCase().includes(q))
      : base.filter((it) => !it.queryOnly && it.section !== '프로젝트').concat(base.filter((it) => it.section === '프로젝트').slice(0, 6))
    const searchItems = q && remoteQuery === q ? remote : []
    items = [...local.slice(0, 40), ...searchItems]
    active = Math.min(active, Math.max(0, items.length - 1))
    render()
  }

  const render = () => {
    if (!items.length) {
      mount(listEl, html`<div class="palette-empty">${input.value.trim().length >= 2 ? '일치하는 항목이 없습니다. 검색 결과를 기다리는 중일 수 있어요.' : '일치하는 항목이 없습니다.'}</div>`)
      return
    }
    let lastSection = ''
    mount(listEl, html`${items.map((it, i) => {
      const head = it.section !== lastSection ? html`<div class="palette-section" role="presentation">${it.section}</div>` : ''
      lastSection = it.section
      return html`${head}<div class="palette-item${i === active ? ' active' : ''}" role="option" id="pi-${i}" aria-selected="${String(i === active)}" data-i="${i}">
        <span class="palette-label">${it.label}</span>${it.hint ? html`<span class="palette-hint">${it.hint}</span>` : ''}</div>`
    })}`)
    input.setAttribute('aria-activedescendant', `pi-${active}`)
    $(`#pi-${active}`, listEl)?.scrollIntoView({ block: 'nearest' })
  }

  const runAt = (i) => {
    const it = items[i]
    if (!it) return
    close()
    it.run()
  }

  const search = debounce(async (q) => {
    if (q.length < 2) return
    try {
      const hits = await v4(`/search?q=${encodeURIComponent(q)}`)
      if (!paletteOpen || input.value.trim().toLowerCase() !== q) return
      remote = (Array.isArray(hits) ? hits : []).slice(0, 20).map((h) => ({
        section: '검색 결과',
        label: h.name || h.id,
        hint: docTypeLabel(h.type),
        run: () => searchHitAction(h),
      }))
      remoteQuery = q
      compute()
    } catch { /* 검색 실패는 조용히 무시 — 로컬 결과는 계속 동작 */ }
  }, 220)

  input.addEventListener('input', () => {
    active = 0
    compute()
    search(input.value.trim().toLowerCase())
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, items.length); render() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % Math.max(1, items.length); render() }
    else if (e.key === 'Enter') { e.preventDefault(); runAt(active) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  })
  listEl.addEventListener('click', (e) => {
    const it = e.target.closest('.palette-item')
    if (it) runAt(Number(it.dataset.i))
  })
  back.addEventListener('mousedown', (e) => { if (e.target === back) close() })
  input.value = initial
  compute()
  input.focus()
}

let searchHitAction = () => {}
export function setSearchHitAction(fn) { searchHitAction = fn }
