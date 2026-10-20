/*
 * XITA 웹 콘솔 — 변경 작업(mutation)
 * 모든 작업은 성공/실패 토스트를 띄우고, 오래 걸리는 작업은 Job 드로어로 넘긴다.
 * production 트랙은 입력 확인 모달 + body confirmed:true (서버 이중 잠금, planner 정책 유지).
 */
import { html, pf, v4, trackLabel } from './lib.js'
import { toast, toastError, watchJob, confirmDialog, openDialog } from './ui.js'
import { S, refreshAll, findProject, loadArchived } from './state.js'

const nameOf = (id) => findProject(id)?.name || id

export async function build(id, release) {
  try {
    const { jobId } = await pf(`/projects/${encodeURIComponent(id)}/build`, { method: 'POST', body: { release } })
    watchJob(jobId, `${nameOf(id)} · ${release ? 'AAB 빌드' : '디버그 빌드'}`)
    toast(`${release ? 'AAB' : '디버그'} 빌드를 시작했어요`)
  } catch (e) { toastError(e, '빌드를 시작하지 못했습니다') }
}

/** 프로덕션 확인 — 코드네임을 직접 입력해야 진행 */
async function confirmProduction(p, what) {
  return confirmDialog({
    title: `프로덕션 ${what}`,
    message: `${p.name} 의 ${what === '배포' ? '새 빌드가' : '출시 노트가'} 스토어 라이브 사용자에게 바로 반영됩니다.`,
    detail: what === '배포'
      ? `v${p.versionName || '?'} · versionCode ${(Number(p.versionCode) || 0) + 1} (자동 증가 시) 을 프로덕션 트랙으로 올립니다. 되돌리려면 스토어에서 새 버전을 다시 내보내야 합니다.`
      : '이미 올라간 프로덕션 릴리스의 노트만 바꿉니다. 빌드·업로드는 하지 않습니다.',
    confirmLabel: `프로덕션 ${what}`,
    danger: true,
    typeText: p.codename || p.id,
  })
}

export async function deploy(id, { track, bump = true, notes = '', notesEn = '', dryRun = false }) {
  const p = findProject(id)
  if (!p) return false
  let confirmed = false
  if (track === 'production' && !dryRun) {
    if (!(await confirmProduction(p, '배포'))) return false
    confirmed = true
  }
  try {
    const body = { track, bump, confirmed, dryRun }
    if (notes) body.notes = notes
    if (notesEn) body.notesEn = notesEn
    const { jobId } = await pf(`/projects/${encodeURIComponent(id)}/deploy`, { method: 'POST', body })
    const what = dryRun ? '배포 리허설' : '배포'
    watchJob(jobId, `${p.name} · ${trackLabel(track)} ${what}`)
    toast(dryRun ? '리허설을 시작했어요 — 빌드까지만 하고 업로드하지 않아요' : `${trackLabel(track)} 트랙 배포를 시작했어요`)
    return true
  } catch (e) { toastError(e, '배포를 시작하지 못했습니다'); return false }
}

export async function updateNotes(id, { track, notes = '', notesEn = '' }) {
  const p = findProject(id)
  if (!p) return false
  if (!notes && !notesEn) { toast('노트 내용을 입력하세요', { tone: 'bad' }); return false }
  let confirmed = false
  if (track === 'production') {
    if (!(await confirmProduction(p, '노트 갱신'))) return false
    confirmed = true
  }
  try {
    const { jobId } = await pf(`/projects/${encodeURIComponent(id)}/notes`, {
      method: 'POST', body: { track, confirmed, notes, notesEn },
    })
    watchJob(jobId, `${p.name} · ${trackLabel(track)} 노트 갱신`)
    toast('출시 노트 갱신을 시작했어요')
    return true
  } catch (e) { toastError(e, '노트를 갱신하지 못했습니다'); return false }
}

export async function setArchived(id, archived) {
  const p = findProject(id)
  if (archived) {
    const ok = await confirmDialog({
      title: '프로젝트 보관',
      message: `${p?.name || id} 을(를) 목록에서 보관할까요? 프로젝트 파일과 XITA 기록은 그대로 남고, '보관됨' 필터에서 언제든 복원할 수 있어요.`,
      confirmLabel: '보관',
    })
    if (!ok) return
  }
  try {
    await pf(`/projects/${encodeURIComponent(id)}/archive`, { method: 'POST', body: { archived } })
    toast(archived ? '보관했어요' : '복원했어요')
    if (S.archived) await loadArchived()
    await refreshAll()
  } catch (e) { toastError(e, archived ? '보관하지 못했습니다' : '복원하지 못했습니다') }
}

export async function addProjectDialog() {
  const root = S.overview?.portfolio?.root ?? ''
  const { value, fields } = await openDialog({
    title: '프로젝트 추가',
    desc: '이미 있는 프로젝트 폴더를 등록합니다. 파일을 만들거나 지우지 않아요.',
    body: html`
      <label class="field"><span class="field-label">프로젝트 경로</span>
        <input name="path" class="input mono" required placeholder="${root ? `${root}/my-app` : '/Users/me/workspace/my-app'}" autocomplete="off" spellcheck="false">
        <span class="field-hint">상대 경로는 ${root || '포트폴리오 루트'} 기준이에요.</span></label>
      <label class="field"><span class="field-label">표시명 <span class="muted">(선택 · 비우면 폴더 이름)</span></span>
        <input name="name" class="input" placeholder="버스 언제 와"></label>
      <label class="field"><span class="field-label">설명 <span class="muted">(선택)</span></span>
        <input name="desc" class="input" placeholder="한 줄 설명"></label>`,
    actions: [{ label: '취소', value: 'cancel' }, { label: '등록', value: 'save', primary: true }],
    validate: (f) => (f.path.trim() ? '' : '프로젝트 경로를 입력하세요.'),
  })
  if (value !== 'save') return null
  try {
    const body = { path: fields.path.trim() }
    if (fields.name.trim()) body.name = fields.name.trim()
    if (fields.desc.trim()) body.desc = fields.desc.trim()
    const { project } = await pf('/projects', { method: 'POST', body })
    toast(`${project?.name || '프로젝트'} 을(를) 등록했어요`)
    await refreshAll()
    return project
  } catch (e) { toastError(e, '프로젝트를 등록하지 못했습니다'); return null }
}

export async function syncAll() {
  try {
    const { jobId } = await pf('/sync', { method: 'POST', body: {} })
    watchJob(jobId, '전체 동기화 (git pull · 스토어 버전)')
    toast('동기화를 시작했어요')
  } catch (e) { toastError(e, '동기화를 시작하지 못했습니다') }
}

export async function refreshStore() {
  try {
    const { jobId } = await pf('/store/refresh', { method: 'POST', body: {} })
    watchJob(jobId, '스토어 버전 조회')
    toast('스토어 버전 조회를 시작했어요')
  } catch (e) { toastError(e, '스토어 조회를 시작하지 못했습니다') }
}

export async function runCommand(id, cmd, name) {
  try {
    const body = { cmd }
    if (name) body.name = name
    const { jobId } = await pf(`/projects/${encodeURIComponent(id)}/run`, { method: 'POST', body })
    watchJob(jobId, `${nameOf(id)} · ${name || cmd}`)
    toast('명령을 실행했어요')
    return true
  } catch (e) { toastError(e, '명령을 실행하지 못했습니다'); return false }
}

/** 빠른 메모 → XITA 워크벤치 (title 2~200자, 길면 본문으로) */
export async function quickCapture(text) {
  const t = text.trim()
  if (t.length < 2) { toast('메모를 두 글자 이상 입력하세요', { tone: 'bad' }); return false }
  const firstLine = t.split('\n')[0]
  const title = firstLine.length > 200 ? `${firstLine.slice(0, 197)}…` : firstLine.length < 2 ? t.slice(0, 200) : firstLine
  const body = { title }
  if (t !== title) body.content = t
  try {
    await v4('/workbench', { method: 'POST', body })
    toast('워크벤치에 메모를 담았어요')
    return true
  } catch (e) { toastError(e, '메모를 저장하지 못했습니다'); return false }
}

export async function approveChange(changeId, title = '') {
  const ok = await confirmDialog({
    title: '승인',
    message: `${title || '이 항목'} 을(를) 승인합니다. 승인하면 출시됨 상태로 넘어가요.`,
    confirmLabel: '승인',
  })
  if (!ok) return false
  try {
    await v4(`/changes/${encodeURIComponent(changeId)}/approve`, { method: 'POST', body: {} })
    toast('승인했어요')
    await refreshAll()
    return true
  } catch (e) { toastError(e, '승인하지 못했습니다'); return false }
}

/**
 * AI 에게 맡기기 — 프로젝트 폴더에서 Claude Code/Codex 를 지시문과 함께 터미널로 띄운다.
 * 지시문 = 할 일 + 보드 + 최근 기록 + "끝나면 xita log 로 남겨"(다음 세션 이어서하기용).
 * change 가 있으면 그 작업 항목의 제목·메모가 기본 할 일이 된다.
 */
const AGENT_KEY = 'xita.agent'
export async function askAgent(id, change = null) {
  const agent = localStorage.getItem(AGENT_KEY) || 'claude'
  const preset = change ? [change.name, change.note].filter(Boolean).join('\n\n') : ''
  const { value, fields } = await openDialog({
    title: `AI 에게 맡기기 — ${nameOf(id)}`,
    desc: '프로젝트 폴더에서 터미널을 열고 지시문을 넣어 시작해요. 보드·최근 기록이 같이 들어가고, 끝나면 기록을 남기게 해요.',
    body: html`<label class="field"><span class="field-label">무엇을 맡길까요</span>
        <textarea name="task" class="input textarea" rows="6" maxlength="8000" placeholder="예: 크래시 리포트 보고 고치기" ${change ? '' : 'autofocus'}>${preset}</textarea></label>
      <label class="field"><span class="field-label">에이전트</span>
        <select name="agent" class="select">
          <option value="claude" ${agent === 'claude' ? 'selected' : ''}>Claude Code</option>
          <option value="codex" ${agent === 'codex' ? 'selected' : ''}>Codex</option>
        </select></label>`,
    actions: [
      { label: '취소', value: 'cancel' },
      { label: '지시문 복사', value: 'copy' },
      { label: '터미널에서 열기', value: 'launch', primary: true },
    ],
    validate: (f) => (f.task.trim() ? '' : '무엇을 맡길지 적어 주세요'),
  })
  if (value === 'cancel') return false
  localStorage.setItem(AGENT_KEY, fields.agent)
  const body = { task: fields.task.trim(), agent: fields.agent, launch: value === 'launch' }
  if (change) body.change = change.id
  try {
    const r = await pf(`/projects/${encodeURIComponent(id)}/agent`, { method: 'POST', body })
    if (value === 'copy') await copyText(r.prompt, '지시문을 복사했어요')
    else toast(`${r.agent === 'codex' ? 'Codex' : 'Claude Code'} 를 터미널에서 열었어요`)
    return true
  } catch (e) { toastError(e, 'AI 에게 맡기지 못했습니다'); return false }
}

export async function copyText(text, label = '복사했어요') {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch { /* 무시 */ }
    ta.remove()
  }
  toast(label)
}
