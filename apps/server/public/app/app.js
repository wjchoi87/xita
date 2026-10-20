/*
 * XITA 웹 콘솔 — 진입점
 * 해시 라우터 · 사이드바 · 전역 단축키 · data-action/data-form 이벤트 위임 · 작업 완료 후 갱신
 */
import { $, $$, html, mount, kindLabel, statusLabel, docTypeLabel } from './lib.js'
import { S, onChange, refreshAll, projects } from './state.js'
import {
  initTheme, setTheme, themeControl, initJobs, watchJob, openPalette, setPaletteSource, setSearchHitAction,
  openDialog, toast, closeMenu,
} from './ui.js'
import * as A from './actions.js'
import {
  H, F, renderHome, renderProjects, renderDecide, renderActivity, renderRevenue, renderDocs,
  renderSettings, refreshProjectsGrid, docsDirty, emptyState, shortcutsTable,
} from './views.js'
import { renderProject, invalidateProject } from './project.js'
import { renderPlans } from './plan.js'
import { renderPromo } from './promo.js'

const view = $('#view')

// ── 라우터 ────────────────────────────────────────────────────────────────
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '')
  const [path, qs = ''] = h.split('?')
  const seg = path.split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s) } catch { return s }
  })
  return { seg, query: new URLSearchParams(qs) }
}

const ROUTE_TITLE = {
  home: '홈', projects: '프로젝트', plan: '기획', promo: '홍보', decide: '결정할 일', activity: '활동',
  revenue: '수익', docs: '문서', settings: '설정',
}

let routeToken = 0
let currentRoute = 'home'

async function render() {
  const tok = ++routeToken
  const live = () => tok === routeToken
  const { seg, query } = parseHash()
  const route = seg[0] || 'home'
  currentRoute = route
  closeMenu()
  setActiveNav(route)
  closeMobileNav()
  let title = ROUTE_TITLE[route] ?? 'XITA'
  switch (route) {
    case 'home': await renderHome(view, live); break
    case 'projects':
      if (seg[1]) {
        title = projects().find((p) => p.id === seg[1])?.name ?? '프로젝트'
        await renderProject(view, live, seg[1], seg[2])
      } else {
        renderProjects(view, live, query)
      }
      break
    case 'plan': await renderPlans(view, live, seg[1]); break
    case 'promo': await renderPromo(view, live); break
    case 'decide': renderDecide(view); break
    case 'activity': await renderActivity(view, live); break
    case 'revenue': await renderRevenue(view, live); break
    case 'docs': await renderDocs(view, live, seg[1]); break
    case 'settings': await renderSettings(view, live); break
    default:
      mount(view, emptyState({ title: '없는 화면이에요', desc: '주소를 확인하거나 홈으로 돌아가세요.', cta: html`<a class="btn btn-primary" href="#/">홈으로</a>` }))
  }
  if (live()) document.title = `${title} · XITA`
}

function navigate() {
  window.scrollTo({ top: 0 })
  render().then(() => {
    // 화면 전환 시 스크린리더/키보드 사용자를 본문 제목으로
    const h = view.querySelector('h1')
    if (h && !view.contains(document.activeElement)) { h.tabIndex = -1; h.focus({ preventScroll: true }) }
  })
}

let lastHash = location.hash
window.addEventListener('hashchange', () => {
  if (docsDirty() && !window.confirm('저장하지 않은 문서 편집 내용이 있어요. 이동할까요?')) {
    // 이동 취소: hashchange 를 다시 일으키지 않고 주소만 되돌린다
    history.replaceState(null, '', lastHash || '#/')
    return
  }
  lastHash = location.hash
  navigate()
})

// ── 사이드바 ───────────────────────────────────────────────────────────────
function setActiveNav(route) {
  for (const a of $$('.nav-link')) {
    const on = a.dataset.route === route
    a.classList.toggle('active', on)
    if (on) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  }
}

function renderChrome() {
  const n = S.needs.length
  const b = $('#badge-decide')
  b.textContent = n ? String(n) : ''
  b.hidden = !n
  b.setAttribute('aria-label', `${n}개`)
  const pc = $('#badge-projects')
  const count = projects().filter((p) => !p.archived).length
  pc.textContent = count ? String(count) : ''
  pc.hidden = !count
  const ws = $('#ws-name')
  ws.textContent = S.overview?.portfolio?.name ?? ''

  // 상단 경고 바: 서버 연결 실패 / Play 키 없음
  const warn = $('#warnbar')
  if (S.overviewError && !S.overview) {
    mount(warn, html`<div class="callout callout-bad warnbar" role="alert"><span>${S.overviewError.message}</span><span class="spacer"></span><button type="button" class="btn btn-sm" data-action="reload">다시 시도</button></div>`)
  } else if (S.overview && !S.overview.playKey) {
    mount(warn, html`<div class="callout callout-warn warnbar" role="status"><span>Play 서비스 계정 키(play-account.json)가 없어 스토어 배포가 꺼져 있어요.</span><span class="spacer"></span><a class="btn btn-sm" href="#/settings">설정 보기</a></div>`)
  } else {
    mount(warn, '')
  }
}

function closeMobileNav() {
  document.body.classList.remove('nav-open')
  $('#nav-toggle')?.setAttribute('aria-expanded', 'false')
}

$('#nav-toggle').addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open')
  $('#nav-toggle').setAttribute('aria-expanded', String(open))
})

// ── 상태 변경 → 화면 갱신 ──────────────────────────────────────────────────
// 입력 중인 화면은 덮어쓰지 않는다 (배포 노트·문서 편집·검색어 보존)
function isEditing() {
  const a = document.activeElement
  return docsDirty() || (a && view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))
}

let quiet = false
onChange(() => {
  renderChrome()
  if (quiet) { quiet = false; return }
  if (currentRoute === 'projects' && !parseHash().seg[1]) { refreshProjectsGrid(); return }
  if (!isEditing()) render()
})

window.addEventListener('xita:refresh', () => { invalidateProject(); refreshAll() })
window.addEventListener('xita:refresh-quiet', () => { quiet = true; refreshAll() })
window.addEventListener('xita:rerender', () => render())

H.reload = () => { invalidateProject(); refreshAll() }
H.theme = (el) => setTheme(el.dataset.themeChoice)
H.palette = () => openPalette()

// ── 이벤트 위임 ────────────────────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]')
  if (!el || el.disabled) return
  const fn = H[el.dataset.action]
  if (!fn) return
  e.preventDefault()
  fn(el, e)
})

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]')
  if (!form) return
  e.preventDefault()
  F[form.dataset.form]?.(form, e)
})

// ── 커맨드 팔레트 소스 ───────────────────────────────────────────────────────
setPaletteSource(() => {
  const go = (h) => () => { location.hash = h }
  const nav = [
    ['홈', '#/', 'home'], ['프로젝트', '#/projects', 'projects'], ['기획', '#/plan', 'plan 기획 새 프로젝트 아이디어'], ['홍보', '#/promo', 'promo 홍보 커뮤니티 마케팅'], ['결정할 일', '#/decide', 'decide approve'],
    ['활동', '#/activity', 'activity commits timeline 커밋'], ['수익', '#/revenue', 'revenue admob 애드몹'],
    ['문서', '#/docs', 'docs'], ['설정', '#/settings', 'settings planner 가져오기'],
  ].map(([label, h, kw]) => ({ section: '이동', label, keywords: kw, run: go(h) }))
  const acts = [
    { label: '전체 동기화 (git pull · 스토어 버전)', keywords: 'sync pull', run: () => A.syncAll() },
    { label: '스토어 버전 조회', keywords: 'store play', run: () => A.refreshStore() },
    { label: '프로젝트 추가', keywords: 'add new', run: () => H['add-project']() },
    { label: '빠른 메모', keywords: 'capture memo workbench 워크벤치', run: quickCaptureDialog },
    { label: '테마: 시스템', keywords: 'theme system', run: () => setTheme('system') },
    { label: '테마: 라이트', keywords: 'theme light', run: () => setTheme('light') },
    { label: '테마: 다크', keywords: 'theme dark', run: () => setTheme('dark') },
    { label: '단축키 보기', keywords: 'shortcuts help', run: showShortcuts },
  ].map((a) => ({ section: '작업', ...a }))
  const list = projects().filter((p) => !p.archived)
  const projs = list.map((p) => ({
    section: '프로젝트',
    label: p.name || p.codename,
    hint: `${kindLabel(p.kind)} · ${statusLabel(p.status)}`,
    keywords: `${p.codename} ${p.id} ${p.package ?? ''} ${p.desc ?? ''}`,
    run: go(`#/projects/${encodeURIComponent(p.id)}`),
  }))
  const pacts = list.filter((p) => p.kind === 'android').flatMap((p) => [
    { section: '프로젝트 작업', queryOnly: true, label: `${p.name} — 배포`, keywords: `${p.codename} deploy`, run: go(`#/projects/${encodeURIComponent(p.id)}/deploy`) },
    { section: '프로젝트 작업', queryOnly: true, label: `${p.name} — AAB 빌드`, keywords: `${p.codename} build aab`, run: () => A.build(p.id, true) },
    { section: '프로젝트 작업', queryOnly: true, label: `${p.name} — 기록`, keywords: `${p.codename} log`, run: go(`#/projects/${encodeURIComponent(p.id)}/log`) },
  ])
  return [...nav, ...acts, ...projs, ...pacts]
})

setSearchHitAction((h) => {
  if (h.type === 'product') location.hash = `#/projects/${encodeURIComponent(h.id)}`
  else if (h.type === 'artifact') location.hash = `#/docs/${encodeURIComponent(h.id)}`
  else if (['change', 'proposal', 'review', 'dispatch'].includes(h.type)) location.hash = '#/decide'
  else toast(`${docTypeLabel(h.type)} · ${h.name || h.id}`, { tone: 'info', detail: h.snippet || '웹 콘솔에서 바로 열 수 없는 항목이에요.' })
})

async function quickCaptureDialog() {
  const { value, fields } = await openDialog({
    title: '빠른 메모',
    desc: '워크벤치에 담아 두고 나중에 프로젝트나 할 일로 옮길 수 있어요.',
    body: html`<label class="field"><span class="sr-only">메모</span><textarea name="text" class="input textarea" rows="4" placeholder="떠오른 아이디어나 할 일"></textarea></label>`,
    actions: [{ label: '취소', value: 'cancel' }, { label: '담기', value: 'save', primary: true }],
    validate: (f) => (f.text.trim().length >= 2 ? '' : '두 글자 이상 입력하세요.'),
  })
  if (value === 'save') A.quickCapture(fields.text)
}

function showShortcuts() {
  openDialog({ title: '키보드 단축키', body: shortcutsTable() })
}

// ── 전역 단축키 ────────────────────────────────────────────────────────────
const GO = { h: '#/', p: '#/projects', d: '#/decide', a: '#/activity', r: '#/revenue', o: '#/docs', s: '#/settings' }
let gAt = 0

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    openPalette()
    return
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const t = e.target
  if (t.closest?.('input, textarea, select, [contenteditable="true"]')) return
  if (document.querySelector('dialog[open], .palette-back, .menu')) return
  if (e.key === '/') {
    e.preventDefault()
    const s = view.querySelector('[data-search]')
    if (s) { s.focus(); s.select() } else openPalette()
    return
  }
  if (e.key === '?') { e.preventDefault(); showShortcuts(); return }
  if (e.key === 'g') { gAt = Date.now(); return }
  if (gAt && Date.now() - gAt < 1200 && GO[e.key]) {
    e.preventDefault()
    gAt = 0
    location.hash = GO[e.key]
    return
  }
  gAt = 0
})

// ── 시작 ──────────────────────────────────────────────────────────────────
initTheme()
mount($('#theme-slot'), themeControl())
initJobs({
  onDone: (job) => {
    invalidateProject(job?.project || undefined)
    refreshAll()
  },
})
renderChrome()
render()
refreshAll().then(() => {
  // 새로고침 전 실행 중이던 작업을 이어서 보여준다
  for (const j of S.overview?.jobs ?? []) if (!j.done) watchJob(j.id, j.label)
})
