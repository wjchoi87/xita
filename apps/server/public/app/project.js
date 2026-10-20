/*
 * XITA 웹 콘솔 — 프로젝트 상세 (#/projects/<id>/<tab>)
 * 탭: 개요 · 작업 · 배포 · 광고 · 기록 · 명령 · 커밋
 */
import {
  html, raw, mount, $, pf, fmtMB, fmtUnix, fmtRelative, trackLabel, TRACK_ORDER,
  statusLabel, statusTone, kindLabel, monetizationLabel, changeStatusLabel, priorityLabel, priorityTone,
  artifactKindLabel,
} from './lib.js'
import { findProject, tracks, playKey, adStatus } from './state.js'
import { confirmDialog, toast, toastError, openMenu } from './ui.js'
import * as A from './actions.js'
import { workTab } from './work.js'
import {
  H, F, badge, emptyState, errorState, skeleton, storeBadges, versionText,
  projectMenuItems, changelogList, timelineList,
} from './views.js'

const TABS = [
  ['overview', '개요'], ['work', '작업'], ['deploy', '배포'], ['ads', '광고'], ['log', '기록'], ['commands', '명령'], ['commits', '커밋'],
]

// 상세 응답 캐시 (탭 전환 시 재요청 없이)
const cache = new Map()
// 배포 폼 입력 보존 (탭 이동·재렌더에도 유지)
const draft = new Map()
const draftOf = (id) => {
  if (!draft.has(id)) draft.set(id, { track: 'internal', bump: true, notes: '', notesEn: '' })
  return draft.get(id)
}

export function invalidateProject(id) {
  if (id) cache.delete(id)
  else cache.clear()
}

async function loadDetail(id, force = false) {
  if (!force && cache.has(id)) return cache.get(id)
  const d = await pf(`/projects/${encodeURIComponent(id)}`)
  cache.set(id, d)
  return d
}

// ── 페이지 ────────────────────────────────────────────────────────────────
export async function renderProject(view, live, id, tab = 'overview') {
  if (!TABS.some(([k]) => k === tab)) tab = 'overview'
  const card = findProject(id)
  // 1) overview 데이터로 머리를 바로 그리고 2) 상세를 받아 탭을 채운다
  mount(view, shell(card, id, tab, null))
  let detail
  try {
    detail = await loadDetail(id)
  } catch (e) {
    if (!live()) return
    if (!card) {
      mount(view, html`<nav class="crumbs"><a href="#/projects">프로젝트</a></nav>${errorState(e)}`)
      return
    }
    mount($('#ptab'), errorState(e))
    return
  }
  if (!live()) return
  const p = detail.project ?? card
  mount(view, shell(p, id, tab, detail))
  await renderTab($('#ptab'), p, detail, tab, live)
}

function shell(p, id, tab, detail) {
  const enc = encodeURIComponent(id)
  if (!p) {
    return html`<nav class="crumbs"><a href="#/projects">프로젝트</a></nav>${skeleton(2)}<div id="ptab">${skeleton(6)}</div>`
  }
  const counts = { log: p.logCount, commands: detail?.commands?.length, overview: p.needsYou, work: p.activeChanges }
  return html`
    <nav class="crumbs" aria-label="위치"><a href="#/projects">프로젝트</a><span aria-hidden="true">/</span><span>${p.name}</span></nav>
    <header class="phead">
      <div class="phead-main">
        <div class="phead-title-row">
          <h1 class="page-title">${p.name || p.codename}</h1>
          ${badge(p.archived ? '보관됨' : statusLabel(p.status), p.archived ? 'muted' : statusTone(p.status))}
          ${badge(kindLabel(p.kind), 'muted')}
          ${p.git ? badge('Git 연결됨', 'muted') : badge('Git 없음', 'warn')}
          ${p.monetization ? badge(monetizationLabel(p.monetization), 'muted') : ''}
        </div>
        ${p.desc ? html`<p class="page-sub">${p.desc}</p>` : ''}
        <div class="phead-path">
          <code class="mono" title="${p.path}">${p.path}</code>
          <button type="button" class="icon-btn" data-action="copy" data-text="${p.path}" aria-label="경로 복사" title="경로 복사">⧉</button>
          ${p.package ? html`<span class="muted mono">${p.package}</span>` : ''}
          ${versionText(p) ? html`<span class="muted num">${versionText(p)}</span>` : ''}
        </div>
      </div>
      <div class="phead-actions">
        ${p.archived
          ? html`<button type="button" class="btn" data-action="p-archive" data-id="${p.id}" data-v="0">복원</button>`
          : html`<button type="button" class="icon-btn icon-btn-lg" data-action="p-menu" data-id="${p.id}" aria-haspopup="menu" aria-expanded="false" aria-label="프로젝트 작업 메뉴">⋯</button>`}
      </div>
    </header>
    ${!p.exists ? (String(p.status).toUpperCase() === 'PLANNING'
      ? html`<div class="callout callout-info">기획 단계 프로젝트예요. 코드를 시작하면 <code class="mono">${p.path}</code> 에 만들면 자동으로 연결돼요. 지금은 작업 탭에서 할 일을 관리하세요.</div>`
      : html`<div class="callout callout-bad">프로젝트 폴더를 찾을 수 없어요. 폴더를 옮겼다면 다시 추가하거나 보관하세요.</div>`) : ''}
    <nav class="tabs" role="tablist" aria-label="프로젝트 탭">
      ${TABS.map(([k, l]) => html`<a role="tab" class="tab" href="#/projects/${enc}${k === 'overview' ? '' : `/${k}`}" aria-selected="${String(k === tab)}" ${k === tab ? raw('aria-current="page"') : ''}>${l}${counts[k] ? html`<span class="tab-count">${counts[k]}</span>` : ''}</a>`)}
    </nav>
    <div id="ptab" role="tabpanel">${detail ? '' : skeleton(6)}</div>`
}

H['p-menu'] = (el) => {
  const p = findProject(el.dataset.id) ?? cache.get(el.dataset.id)?.project
  if (p) openMenu(el, projectMenuItems(p).filter((it) => it === 'sep' || it.label !== '열기'))
}
H['p-archive'] = (el) => A.setArchived(el.dataset.id, el.dataset.v === '1')

async function renderTab(box, p, d, tab, live) {
  switch (tab) {
    case 'deploy': return mount(box, deployTab(p))
    case 'ads': return mount(box, adsTab(p))
    case 'commands': return mount(box, commandsTab(p, d))
    case 'log': return logTab(box, p, live)
    case 'commits': return commitsTab(box, p, live)
    case 'work': return workTab(box, p, live)
    default: return mount(box, overviewTab(p, d))
  }
}

// ── 개요 ──────────────────────────────────────────────────────────────────
function checkRow(ok, label, desc = '', tone) {
  const t = tone ?? (ok ? 'ok' : 'bad')
  return html`<li class="check check-${t}"><span class="check-icon" aria-hidden="true">${t === 'ok' ? '✓' : t === 'muted' ? '–' : '!'}</span>
    <span class="check-label">${label}</span>${desc ? html`<span class="check-desc">${desc}</span>` : ''}</li>`
}

function overviewTab(p, d) {
  const android = p.kind === 'android'
  const ad = adStatus(p)
  const changes = d.changes ?? []
  const docs = d.docs ?? []
  const enc = encodeURIComponent(p.id)
  return html`<div class="cols">
    <section class="panel">
      <h2 class="panel-title">상태 점검</h2>
      <ul class="checks">
        ${checkRow(p.exists, '프로젝트 폴더', p.exists ? '' : '경로에 폴더가 없어요')}
        ${checkRow(p.git, 'Git 저장소', p.git ? '' : '변경내역·동기화를 쓰려면 git 이 필요해요', p.git ? 'ok' : 'warn')}
        ${android ? html`
          ${checkRow(p.keystore, '키스토어', p.keystore ? '' : '릴리스 서명 불가')}
          ${checkRow(p.privacy, '개인정보처리방침')}
          ${checkRow(p.listing, '스토어 문구')}
          ${checkRow(p.graphic, '피처 그래픽')}
          ${checkRow(ad === 'live', '광고', ad === 'live' ? '실광고 ID 적용' : ad === 'test' ? '테스트 ID 사용 중' : '광고를 쓰지 않아요', ad === 'live' ? 'ok' : ad === 'test' ? 'warn' : 'muted')}
          ${checkRow(!!p.aab, 'AAB 빌드', p.aab ? `${fmtMB(p.aab.size)} · ${fmtUnix(p.aab.builtAt)}` : '아직 빌드하지 않았어요', p.aab ? 'ok' : 'warn')}
          ${checkRow(!!p.store, '스토어 버전', p.store ? (p.storeCheckedAt ? `${fmtRelative(p.storeCheckedAt)} 조회` : '조회됨') : '동기화하면 표시돼요', p.store ? 'ok' : 'muted')}
          ${p.pendingRelease ? checkRow(false, '프로덕션 갱신 대기', '로컬 빌드가 프로덕션보다 새로워요', 'warn') : ''}` : ''}
      </ul>
      ${android ? html`<div class="chips">${storeBadges(p)}</div>
        <div class="row-actions"><a class="btn btn-sm" href="#/projects/${enc}/deploy">배포로 이동</a></div>` : ''}
    </section>
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title">진행 중인 할 일</h2><span class="muted">${changes.length}</span></div>
      ${changes.length ? html`<ul class="list list-compact">${changes.map((c) => html`<li class="list-item">
          <div class="list-badges">${badge(changeStatusLabel(c.status), ['REVIEW', 'SHIP_READY'].includes(c.status) ? 'warn' : 'muted')}${c.priority ? badge(priorityLabel(c.priority), priorityTone(c.priority)) : ''}</div>
          <div class="list-main"><div class="list-title">${c.name || c.id}</div></div>
          <div class="list-actions">${['REVIEW', 'SHIP_READY'].includes(String(c.status)) ? html`<button type="button" class="btn btn-sm btn-primary" data-action="approve" data-id="${c.id}" data-title="${c.name || c.id}">승인</button>` : ''}</div>
        </li>`)}</ul>`
        : emptyState({ title: '진행 중인 할 일이 없어요', desc: '작업 탭에서 아이디어·할 일·마일스톤을 관리해요.', cta: html`<a class="btn btn-sm" href="#/projects/${enc}/work">작업 탭으로</a>` })}
      <div class="panel-head"><h2 class="panel-title">문서</h2><span class="muted">${docs.length}</span></div>
      ${docs.length ? html`<ul class="doc-items">${docs.map((x) => html`<li><a class="doc-link" href="#/docs/${encodeURIComponent(x.id)}">
          <span class="doc-name">${x.name || x.id}</span><span class="doc-meta">${artifactKindLabel(x.kind)}${x.updatedAt ? ` · ${fmtRelative(x.updatedAt)}` : ''}</span></a></li>`)}</ul>`
        : emptyState({ title: '연결된 문서가 없어요' })}
    </section>
  </div>
  <section class="panel">
    <div class="panel-head"><h2 class="panel-title">일대기</h2><a class="link" href="#/activity">전체 활동</a></div>
    ${timelineList(d.timeline ?? [], { showProduct: false })}
  </section>`
}

// ── 배포 ──────────────────────────────────────────────────────────────────
function deployTab(p) {
  if (p.kind !== 'android') {
    return emptyState({
      title: '빌드·배포는 Android 프로젝트만 지원해요',
      desc: '이 프로젝트는 명령 탭에서 빌드·실행 명령을 직접 돌릴 수 있어요.',
      cta: html`<a class="btn btn-primary" href="#/projects/${encodeURIComponent(p.id)}/commands">명령 탭으로</a>`,
    })
  }
  const dr = draftOf(p.id)
  const trs = tracks()
  if (!trs.includes(dr.track)) dr.track = trs[0]
  const key = playKey()
  const prod = dr.track === 'production'
  const nextCode = (Number(p.versionCode) || 0) + 1
  return html`<div class="cols">
    <section class="panel">
      <h2 class="panel-title">빌드</h2>
      <p class="muted panel-text">${p.aab ? html`마지막 AAB: ${fmtMB(p.aab.size)} · ${fmtUnix(p.aab.builtAt)}` : '아직 AAB 를 빌드하지 않았어요.'}</p>
      <div class="row-actions">
        <button type="button" class="btn" data-action="p-build" data-id="${p.id}" data-release="0">디버그 빌드</button>
        <button type="button" class="btn" data-action="p-build" data-id="${p.id}" data-release="1">AAB 빌드</button>
      </div>
      <h2 class="panel-title">스토어 트랙</h2>
      ${p.store ? html`<table class="table table-compact"><thead><tr><th scope="col">트랙</th><th scope="col" class="r">versionCode</th></tr></thead>
        <tbody>${TRACK_ORDER.filter((t) => p.store[t] != null).map((t) => html`<tr><td>${trackLabel(t)}</td><td class="r num">${p.store[t]}</td></tr>`)}
        <tr><td>로컬</td><td class="r num">${p.versionCode ?? '—'}</td></tr></tbody></table>
        <p class="muted panel-text">${p.storeCheckedAt ? `${fmtRelative(p.storeCheckedAt)} 조회` : ''}${p.pendingRelease ? ' · 프로덕션 갱신 대기' : ''}</p>`
        : html`<p class="muted panel-text">아직 스토어 버전을 조회하지 않았어요.</p>`}
      <div class="row-actions"><button type="button" class="btn btn-sm" data-action="store-refresh">스토어 버전 다시 조회</button></div>
    </section>
    <form class="panel" data-form="deploy" data-id="${p.id}">
      <h2 class="panel-title">배포</h2>
      ${key ? '' : html`<div class="callout callout-warn">Play 서비스 계정 키(play-account.json)가 없어 배포가 꺼져 있어요. <a href="#/settings">설정 보기</a></div>`}
      <label class="field"><span class="field-label">트랙</span>
        <select name="track" class="select" data-draft="track">${trs.map((t) => html`<option value="${t}" ${dr.track === t ? raw('selected') : ''}>${trackLabel(t)}</option>`)}</select></label>
      ${prod ? html`<div class="callout callout-bad" role="note"><strong>프로덕션</strong> — 스토어 라이브 사용자에게 바로 반영돼요. 진행하려면 확인 창에서 코드네임을 입력해야 해요.</div>` : ''}
      <label class="field"><span class="field-label">출시 노트 (한국어)</span>
        <textarea name="notes" class="input textarea" rows="3" placeholder="무엇을 바꿨는지" data-draft="notes">${dr.notes}</textarea></label>
      <label class="field"><span class="field-label">출시 노트 (영어 · 선택)</span>
        <textarea name="notesEn" class="input textarea" rows="2" placeholder="What changed" data-draft="notesEn">${dr.notesEn}</textarea></label>
      ${p.versionCodeSource === 'git'
        ? html`<p class="muted">versionCode 는 커밋 수로 정해져요 (지금 <span class="num">${p.versionCode ?? '?'}</span>) — 새 커밋이 있어야 다시 올릴 수 있어요.</p>`
        : html`<label class="toggle"><input type="checkbox" name="bump" data-draft="bump" ${dr.bump ? raw('checked') : ''}>
        <span>versionCode 자동 올리기 <span class="muted num">(${p.versionCode ?? '?'} → ${nextCode})</span></span></label>`}
      <div class="row-actions">
        <button type="submit" value="notes" class="btn" ${key ? '' : raw('disabled')} title="이미 올라간 릴리스의 노트만 바꿔요">노트만 갱신</button>
        <button type="submit" value="rehearse" class="btn" title="준비물 점검과 AAB 빌드까지만 — 스토어에 올리지 않아요">리허설</button>
        <span class="spacer"></span>
        <button type="submit" value="deploy" class="btn ${prod ? 'btn-danger' : 'btn-primary'}" ${key ? '' : raw('disabled')}>${prod ? '프로덕션 배포…' : `${trackLabel(dr.track)}에 배포`}</button>
      </div>
    </form>
  </div>`
}

H['p-build'] = (el) => A.build(el.dataset.id, el.dataset.release === '1')
H['store-refresh'] = () => A.refreshStore()

// 배포 폼 입력은 draft 에 즉시 저장 (트랙 바꾸면 경고·버튼 문구 갱신)
document.addEventListener('input', (e) => {
  const el = e.target.closest?.('[data-draft]')
  const form = el?.closest('form[data-form="deploy"]')
  if (!form) return
  const dr = draftOf(form.dataset.id)
  dr[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.value
})
document.addEventListener('change', (e) => {
  const el = e.target.closest?.('select[data-draft="track"]')
  const form = el?.closest('form[data-form="deploy"]')
  if (!form) return
  draftOf(form.dataset.id).track = el.value
  const p = findProject(form.dataset.id) ?? cache.get(form.dataset.id)?.project
  if (p) {
    const box = $('#ptab')
    mount(box, deployTab(p))
    box.querySelector('select[name="track"]')?.focus()
  }
})

F.deploy = async (form, e) => {
  const id = form.dataset.id
  const dr = draftOf(id)
  const btn = e.submitter
  const notes = form.elements.notes.value.trim()
  const notesEn = form.elements.notesEn.value.trim()
  btn.disabled = true
  const ok = btn.value === 'notes'
    ? await A.updateNotes(id, { track: dr.track, notes, notesEn })
    : await A.deploy(id, {
      track: dr.track,
      bump: form.elements.bump ? form.elements.bump.checked : true,
      notes,
      notesEn,
      dryRun: btn.value === 'rehearse',
    })
  btn.disabled = false
  if (ok && btn.value !== 'rehearse') { dr.notes = ''; dr.notesEn = ''; form.elements.notes.value = ''; form.elements.notesEn.value = '' }
}

// ── 광고 ID ───────────────────────────────────────────────────────────────
function adsTab(p) {
  if (p.kind !== 'android') {
    return emptyState({ title: '광고 ID 는 Android 프로젝트에서만 관리해요' })
  }
  const a = p.adIds ?? {}
  const st = adStatus(p)
  const field = (name, label, ph, hint = '') => html`<label class="field"><span class="field-label">${label}</span>
    <input name="${name}" class="input mono" value="${a[name] || ''}" placeholder="${ph}" autocomplete="off" spellcheck="false">
    ${hint ? html`<span class="field-hint">${hint}</span>` : ''}</label>`
  return html`<form class="panel panel-narrow" data-form="adids" data-id="${p.id}">
    <div class="panel-head"><h2 class="panel-title">애드몹 광고 ID</h2>
      ${badge(st === 'live' ? '실광고' : st === 'test' ? '테스트 광고' : '광고 없음', st === 'live' ? 'ok' : st === 'test' ? 'warn' : 'muted')}</div>
    <p class="muted panel-text">${p.name}${p.package ? ` · ${p.package}` : ''} — 저장하면 프로젝트의 광고 ID 파일과 매니페스트가 바뀌고 앱 기록에 남아요.</p>
    ${field('appId', '앱 ID (매니페스트 APPLICATION_ID)', 'ca-app-pub-0000000000000000~0000000000')}
    ${field('banner', '배너', 'ca-app-pub-0000000000000000/0000000000')}
    ${field('interstitial', '전면', '비워두면 테스트 ID 를 써요')}
    ${field('rewarded', '리워드', '비워두면 테스트 ID 를 써요')}
    ${a.native ? html`<p class="muted panel-text">네이티브: <code class="mono">${a.native}</code> (코드에서 관리)</p>` : ''}
    <div class="row-actions">
      <a class="link" href="https://apps.admob.com" target="_blank" rel="noopener noreferrer">애드몹 콘솔 열기 ↗</a>
      <span class="spacer"></span>
      <button type="submit" class="btn btn-primary">저장</button>
    </div>
  </form>`
}

F.adids = async (form) => {
  const id = form.dataset.id
  const btn = form.querySelector('button[type="submit"]')
  const body = {}
  for (const k of ['appId', 'banner', 'interstitial', 'rewarded']) body[k] = form.elements[k].value.trim()
  btn.disabled = true
  try {
    const r = await pf(`/projects/${encodeURIComponent(id)}/adids`, { method: 'POST', body })
    toast('광고 ID 를 저장했어요', { detail: r?.changed ? `반영됨: ${r.changed}` : '' })
    invalidateProject(id)
    window.dispatchEvent(new Event('xita:refresh'))
  } catch (e) { toastError(e, '광고 ID 를 저장하지 못했습니다') }
  btn.disabled = false
}

// ── 기록 (앱 로그) ─────────────────────────────────────────────────────────
const LOG_KINDS = ['메모', '계획', '이슈', '출시']
const logState = new Map() // id → { entries, path }

function logKindTone(k) {
  if (/출시|배포|release/i.test(k)) return 'accent'
  if (/이슈|반려|버그/.test(k)) return 'bad'
  if (/광고/.test(k)) return 'info'
  return 'muted'
}

function logList(p) {
  const st = logState.get(p.id)
  if (!st) return skeleton(4)
  if (!st.entries.length) return emptyState({ title: '아직 기록이 없어요', desc: '추가사항·출시 계획·심사 반려 대응을 남겨 두면 일대기에도 같이 쌓여요.' })
  return html`<ul class="loglist">${st.entries.map((e) => html`<li class="logent">
    <div class="logent-head">${badge(e.kind || '메모', logKindTone(e.kind || ''))}<span class="muted num">${e.date}</span><span class="spacer"></span>
      <button type="button" class="icon-btn" data-action="log-del" data-id="${p.id}" data-entry="${e.id}" aria-label="이 기록 삭제" title="삭제">×</button></div>
    ${e.body ? html`<div class="logent-body">${e.body}</div>` : ''}</li>`)}</ul>`
}

async function logTab(box, p, live) {
  mount(box, html`<div class="cols cols-wide-left">
    <section class="panel"><div class="panel-head"><h2 class="panel-title">앱 기록</h2><span class="muted" id="logpath"></span></div>
      <div id="loglist">${logList(p)}</div></section>
    <form class="panel" data-form="log-add" data-id="${p.id}">
      <h2 class="panel-title">기록 추가</h2>
      <p class="muted panel-text">배포·광고 ID 변경은 성공하면 자동으로 기록돼요.</p>
      <label class="field"><span class="field-label">종류</span>
        <select name="kind" class="select">${LOG_KINDS.map((k) => html`<option value="${k}">${k}</option>`)}</select></label>
      <label class="field"><span class="field-label">내용</span>
        <textarea name="text" class="input textarea" rows="5" placeholder="변경사항, 출시 계획, 심사 반려 대응 등"></textarea>
        <span class="field-hint"><kbd>⌘</kbd><kbd>Enter</kbd> 로 추가</span></label>
      <div class="row-actions"><span class="spacer"></span><button type="submit" class="btn btn-primary">추가</button></div>
    </form></div>`)
  const ta = box.querySelector('textarea[name="text"]')
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); ta.form.requestSubmit() }
  })
  try {
    const r = await pf(`/projects/${encodeURIComponent(p.id)}/log`)
    logState.set(p.id, { entries: r?.entries ?? [], path: r?.path ?? '' })
    if (!live()) return
    mount($('#loglist'), logList(p))
    const lp = $('#logpath')
    if (lp) { lp.textContent = r?.path ?? ''; lp.title = r?.path ?? '' }
  } catch (e) {
    if (live()) mount($('#loglist'), errorState(e))
  }
}

F['log-add'] = async (form) => {
  const id = form.dataset.id
  const text = form.elements.text.value.trim()
  if (!text) { form.elements.text.focus(); return }
  const btn = form.querySelector('button[type="submit"]')
  btn.disabled = true
  try {
    const r = await pf(`/projects/${encodeURIComponent(id)}/log`, { method: 'POST', body: { text, kind: form.elements.kind.value } })
    const st = logState.get(id) ?? { entries: [], path: '' }
    if (r?.entry) st.entries.unshift(r.entry)
    logState.set(id, st)
    form.elements.text.value = ''
    const p = findProject(id) ?? cache.get(id)?.project
    if (p) mount($('#loglist'), logList(p))
    toast('기록을 추가했어요')
    window.dispatchEvent(new Event('xita:refresh-quiet'))
  } catch (e) { toastError(e, '기록을 추가하지 못했습니다') }
  btn.disabled = false
}

H['log-del'] = async (el) => {
  const { id, entry } = el.dataset
  const ok = await confirmDialog({ title: '기록 삭제', message: '이 기록을 삭제할까요? 앱 저장소의 app-log.md 에서도 지워져요.', confirmLabel: '삭제', danger: true })
  if (!ok) return
  try {
    await pf(`/projects/${encodeURIComponent(id)}/log/${encodeURIComponent(entry)}/remove`, { method: 'POST', body: {} })
    const st = logState.get(id)
    if (st) st.entries = st.entries.filter((x) => x.id !== entry)
    const p = findProject(id) ?? cache.get(id)?.project
    if (p) mount($('#loglist'), logList(p))
    toast('기록을 삭제했어요')
    window.dispatchEvent(new Event('xita:refresh-quiet'))
  } catch (e) { toastError(e, '기록을 삭제하지 못했습니다') }
}

// ── 명령 ──────────────────────────────────────────────────────────────────
function commandsTab(p, d) {
  const cmds = d.commands ?? []
  return html`<div class="cols cols-wide-left">
    <section class="panel">
      <div class="panel-head"><h2 class="panel-title">명령</h2><span class="muted">${cmds.length}</span></div>
      ${cmds.length ? html`<ul class="cmds">${cmds.map((c, i) => html`<li class="cmd">
          <div class="cmd-main"><div class="cmd-name">${c.name || c.cmd} ${badge(c.learned ? '학습됨' : '자동 감지', c.learned ? 'info' : 'muted')}</div>
            <code class="mono cmd-line">${c.cmd}</code></div>
          <button type="button" class="btn btn-sm" data-action="cmd-run" data-id="${p.id}" data-i="${i}" ${p.exists ? '' : raw('disabled')}>실행</button></li>`)}</ul>`
        : emptyState({ title: '감지된 명령이 없어요', desc: '오른쪽에서 직접 실행하면 다음부터 목록에 남아요.' })}
    </section>
    <form class="panel" data-form="cmd-custom" data-id="${p.id}">
      <h2 class="panel-title">직접 실행</h2>
      <p class="muted panel-text">프로젝트 폴더에서 실행돼요. 처음 쓰는 명령은 학습돼 목록에 추가돼요.</p>
      <label class="field"><span class="field-label">명령</span>
        <input name="cmd" class="input mono" placeholder="npm run build" autocomplete="off" spellcheck="false" required></label>
      <label class="field"><span class="field-label">이름 <span class="muted">(선택)</span></span>
        <input name="name" class="input" placeholder="빌드"></label>
      <div class="row-actions"><span class="spacer"></span><button type="submit" class="btn btn-primary" ${p.exists ? '' : raw('disabled')}>실행</button></div>
    </form></div>`
}

H['cmd-run'] = (el) => {
  const c = cache.get(el.dataset.id)?.commands?.[Number(el.dataset.i)]
  if (c) A.runCommand(el.dataset.id, c.cmd, c.name)
}

F['cmd-custom'] = async (form) => {
  const id = form.dataset.id
  const cmd = form.elements.cmd.value.trim()
  if (!cmd) { form.elements.cmd.focus(); return }
  if (await A.runCommand(id, cmd, form.elements.name.value.trim())) {
    form.elements.cmd.value = ''
    form.elements.name.value = ''
    invalidateProject(id)
  }
}

// ── 커밋 ──────────────────────────────────────────────────────────────────
async function commitsTab(box, p, live) {
  mount(box, html`<section class="panel"><div class="panel-head"><h2 class="panel-title">커밋</h2>
    <button type="button" class="btn btn-sm" data-action="sync">동기화</button></div><div id="pcommits">${skeleton(6)}</div></section>`)
  try {
    const r = await pf(`/changelog?project=${encodeURIComponent(p.id)}`)
    if (live()) mount($('#pcommits'), changelogList(r?.entries ?? [], { showApp: false }))
  } catch (e) {
    if (live()) mount($('#pcommits'), errorState(e))
  }
}

