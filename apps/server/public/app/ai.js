/*
 * XITA 웹 콘솔 — 설정 > AI (provider 추가·삭제·연결 테스트 · 작업별 모델 체인 · 사용량)
 * 키 값은 다루지 않는다: http provider 는 '키가 든 환경변수 이름' 이나 '키를 꺼내는 명령' 만 적는다.
 */
import { html, raw, mount, $, v4, fmtNum } from './lib.js'
import { openDialog, toast, toastError, confirmDialog } from './ui.js'
import { H, badge, errorState } from './views.js'

const TASK = {
  classify: ['메모 분류', '짧고 잦음 — 빠른 로컬 권장'],
  summarize: ['이력 요약', ''],
  ask: ['질문 답변', ''],
  plan: ['기획 인터뷰', '품질 우선 — 좋은 모델 권장'],
  monitor: ['모니터링', '수익·코드 → 로컬만'],
  advice: ['수익 조언', '수익 데이터 → 로컬 provider 만 실제 사용'],
  promo: ['홍보 초안', '공개될 글 — 무료 외부 모델 OK'],
}

let st = null

export async function renderAiSettings(box) {
  mount(box, html`<h2 class="panel-title">AI</h2><p class="muted">불러오는 중…</p>`)
  try {
    const [status, usage] = await Promise.all([v4('/ai/status'), v4('/ai/usage?days=7')])
    st = { status, usage }
    draw()
  } catch (e) {
    mount(box, html`<h2 class="panel-title">AI</h2>${errorState(e)}`)
  }
}

function draw() {
  const box = $('#ai-settings')
  if (!box || !st) return
  const { status, usage } = st
  const use = new Map()
  for (const r of usage.byProvider) {
    const u = use.get(r.provider) ?? { calls: 0, failures: 0 }
    u.calls += r.calls
    u.failures += r.failures
    use.set(r.provider, u)
  }
  mount(box, html`<div class="panel-head"><h2 class="panel-title">AI</h2>
      <span class="muted">${status.source === 'file' ? '내 설정 (ai.json)' : '기본 설정'}</span>
      <button type="button" class="btn btn-sm" data-action="ai-add">+ provider</button></div>
    <p class="muted panel-text">작업마다 위에서부터 시도하고, 실패(쿼터 소진·키 만료·시간 초과)하면 다음으로 넘어가요. 수익·코드를 다루는 작업은 로컬 provider 만 써요. 모두 실패하면 규칙 기반으로 계속 동작해요.</p>
    ${status.fileError ? html`<div class="callout callout-bad">${status.fileError}</div>` : ''}
    <h3 class="sub-title">Provider</h3>
    <ul class="list list-compact">${status.providers.map((p) => {
      const u = use.get(p.id)
      return html`<li class="list-item">
        <div class="list-main"><div class="list-title">${p.label || p.id} <span class="muted mono">${p.id}</span></div>
          <div class="list-desc">${p.kind === 'http' ? html`<code class="mono">${p.baseUrl}</code>` : html`<code class="mono">${(p.command ?? []).join(' ')}</code>`}
            · ${(p.models ?? []).join(', ') || '모델 없음'}</div></div>
        <div class="list-badges">${badge(p.local ? '로컬' : '외부', p.local ? 'ok' : 'muted')}${p.enabled === false ? badge('꺼짐', 'warn') : ''}${p.keyConfigured === false ? badge('키 없음', 'bad') : ''}
          ${u ? badge(`7일 ${u.calls}회${u.failures ? ` · 실패 ${u.failures}` : ''}`, u.failures && u.failures === u.calls ? 'bad' : 'muted') : ''}</div>
        <div class="list-actions">
          <button type="button" class="btn btn-sm" data-action="ai-test" data-id="${p.id}">테스트</button>
          ${p.id === 'env' ? '' : html`<button type="button" class="btn btn-sm" data-action="ai-edit" data-id="${p.id}">고치기</button>`}
        </div></li>`
    })}</ul>
    <h3 class="sub-title">작업별 순서</h3>
    <ul class="list list-compact">${status.tasks.map((t) => html`<li class="list-item">
      <div class="list-main"><div class="list-title">${TASK[t]?.[0] ?? t}</div>${TASK[t]?.[1] ? html`<div class="list-desc">${TASK[t][1]}</div>` : ''}</div>
      <div class="chain">${(status.routes[t] ?? []).length ? (status.routes[t] ?? []).map((s, i) => html`${i ? html`<span class="chain-arrow" aria-hidden="true">→</span>` : ''}<span class="chain-step">${s.provider}<span class="muted">/${s.model}</span></span>`) : html`<span class="muted">규칙만</span>`}</div>
      <button type="button" class="btn btn-sm" data-action="ai-route" data-task="${t}">바꾸기</button></li>`)}</ul>
    <div class="row-actions"><span class="muted">최근 7일 호출 ${fmtNum(usage.calls)} · 실패 ${fmtNum(usage.failures)}</span><span class="spacer"></span>
      ${status.source === 'file' ? html`<button type="button" class="btn btn-sm" data-action="ai-reset">기본 설정으로 되돌리기</button>` : ''}</div>`)
}

/** 저장용 설정 (env provider·표시용 필드 제외) */
function configOf(status) {
  return {
    providers: status.providers.filter((p) => p.id !== 'env').map(({ keyConfigured, ...p }) => p),
    routes: status.routes,
  }
}

async function save(cfg, msg = '저장했어요') {
  try {
    st.status = await v4('/ai/config', { method: 'PUT', body: { config: cfg } })
    draw()
    toast(msg)
    return true
  } catch (e) {
    toastError(e, 'AI 설정을 저장하지 못했습니다')
    return false
  }
}

async function providerDialog(p) {
  const isNew = !p
  const cur = p ?? { kind: 'http', models: [], local: false, enabled: true }
  const { value, fields } = await openDialog({
    title: isNew ? 'provider 추가' : `${cur.label || cur.id} 고치기`,
    desc: 'http = OpenAI 호환 주소(LiteLLM·ollama·vLLM·상용 API). cli = 명령 실행(예: xal run 으로 xal 에 연결한 provider 사용). 키 값은 적지 않아요.',
    wide: true,
    body: html`<div class="field-row">
        <label class="field"><span class="field-label">id</span><input name="id" class="input mono" value="${cur.id ?? ''}" ${isNew ? '' : raw('readonly')} placeholder="my-llm" required></label>
        <label class="field"><span class="field-label">이름</span><input name="label" class="input" value="${cur.label ?? ''}" placeholder="집 서버 vLLM"></label>
      </div>
      <div class="field-row">
        <label class="field"><span class="field-label">종류</span><select name="kind" class="select"><option value="http" ${cur.kind === 'http' ? raw('selected') : ''}>http (OpenAI 호환)</option><option value="cli" ${cur.kind === 'cli' ? raw('selected') : ''}>cli (명령)</option></select></label>
        <label class="field"><span class="field-label">모델 <span class="muted">(쉼표로 구분)</span></span><input name="models" class="input mono" value="${(cur.models ?? []).join(', ')}" placeholder="qwen3.8-27b, ..."></label>
      </div>
      <label class="field"><span class="field-label">주소 (http)</span><input name="baseUrl" class="input mono" value="${cur.baseUrl ?? ''}" placeholder="http://bossgame-m5:4000/v1"></label>
      <div class="field-row">
        <label class="field"><span class="field-label">키 환경변수 (http · 선택)</span><input name="apiKeyEnv" class="input mono" value="${cur.apiKeyEnv ?? ''}" placeholder="LITELLM_API_KEY"></label>
        <label class="field"><span class="field-label">키 꺼내는 명령 (http · 선택)</span><input name="apiKeyCommand" class="input mono" value="${(cur.apiKeyCommand ?? []).join(' ')}" placeholder="security find-generic-password -s my-key -w"></label>
      </div>
      <label class="field"><span class="field-label">명령 (cli) <span class="muted">— {model} 자리에 모델이 들어가고, 프롬프트는 표준입력으로 전달</span></span>
        <input name="command" class="input mono" value="${(cur.command ?? []).join(' ')}" placeholder="xal run --format json --mode plan --provider opencode-free --model {model}"></label>
      <div class="field-row">
        <label class="field"><span class="field-label">출력 형식 (cli)</span><select name="output" class="select"><option value="xal-json" ${cur.output !== 'text' ? raw('selected') : ''}>xal JSON</option><option value="text" ${cur.output === 'text' ? raw('selected') : ''}>텍스트 그대로</option></select></label>
        <label class="field"><span class="field-label">시간 제한 (초)</span><input name="timeout" type="number" min="5" class="input" value="${cur.timeoutMs ? Math.round(cur.timeoutMs / 1000) : ''}" placeholder="기본"></label>
      </div>
      <label class="toggle"><input type="checkbox" name="local" ${cur.local ? raw('checked') : ''}><span>내 장비·내 네트워크 안의 모델 (수익·코드 같은 민감한 작업 허용)</span></label>
      <label class="toggle"><input type="checkbox" name="enabled" ${cur.enabled !== false ? raw('checked') : ''}><span>사용</span></label>`,
    actions: [
      ...(isNew ? [] : [{ label: '삭제', value: 'delete', danger: true }]),
      { label: '취소', value: 'cancel' },
      { label: '저장', value: 'ok', primary: true },
    ],
    validate: (f, v) => {
      if (v !== 'ok') return ''
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(f.id.trim())) return 'id 는 영문·숫자·-._ 로 적어 주세요.'
      if (isNew && st.status.providers.some((x) => x.id === f.id.trim())) return '이미 있는 id 예요.'
      if (f.kind === 'http' && !/^https?:\/\//.test(f.baseUrl.trim())) return 'http provider 는 주소가 필요해요.'
      if (f.kind === 'cli' && !f.command.trim()) return 'cli provider 는 명령이 필요해요.'
      return ''
    },
  })
  return { value, fields }
}

const words = (s) => s.trim().split(/\s+/).filter(Boolean)

H['ai-add'] = async () => {
  const { value, fields } = await providerDialog(null)
  if (value !== 'ok') return
  const cfg = configOf(st.status)
  cfg.providers.push(fromFields(fields))
  await save(cfg, 'provider 를 추가했어요 — 작업별 순서에서 쓸 곳에 넣으세요')
}

function fromFields(f) {
  const p = {
    id: f.id.trim(),
    label: f.label.trim() || undefined,
    kind: f.kind,
    local: !!f.local,
    enabled: !!f.enabled,
    models: f.models.split(',').map((m) => m.trim()).filter(Boolean),
  }
  if (Number(f.timeout) > 0) p.timeoutMs = Number(f.timeout) * 1000
  if (f.kind === 'http') {
    p.baseUrl = f.baseUrl.trim()
    if (f.apiKeyEnv.trim()) p.apiKeyEnv = f.apiKeyEnv.trim()
    if (f.apiKeyCommand.trim()) p.apiKeyCommand = words(f.apiKeyCommand)
  } else {
    p.command = words(f.command)
    p.output = f.output
  }
  return p
}

H['ai-edit'] = async (el) => {
  const cur = st.status.providers.find((p) => p.id === el.dataset.id)
  if (!cur) return
  const { value, fields } = await providerDialog(cur)
  const cfg = configOf(st.status)
  if (value === 'delete') {
    const used = Object.entries(cfg.routes).filter(([, steps]) => steps?.some((s) => s.provider === cur.id)).map(([t]) => TASK[t]?.[0] ?? t)
    const ok = await confirmDialog({ title: 'provider 삭제', message: `${cur.label || cur.id} 를 지울까요?`, detail: used.length ? `쓰는 작업에서도 빠져요: ${used.join(', ')}` : '', confirmLabel: '삭제', danger: true })
    if (!ok) return
    cfg.providers = cfg.providers.filter((p) => p.id !== cur.id)
    for (const t of Object.keys(cfg.routes)) cfg.routes[t] = (cfg.routes[t] ?? []).filter((s) => s.provider !== cur.id)
    await save(cfg, '삭제했어요')
    return
  }
  if (value !== 'ok') return
  // 전에 있던 extraBody 등 화면에 없는 필드는 유지
  const { keyConfigured, ...rest } = cur
  cfg.providers = cfg.providers.map((p) => (p.id === cur.id ? { ...rest, ...fromFields(fields), ...(fields.kind === 'http' ? { command: undefined, output: undefined } : { baseUrl: undefined, apiKeyEnv: undefined, apiKeyCommand: undefined }) } : p))
  await save(cfg)
}

H['ai-test'] = async (el) => {
  const p = st.status.providers.find((x) => x.id === el.dataset.id)
  if (!p) return
  let model = p.models?.[0]
  if ((p.models ?? []).length > 1) {
    const { value, fields } = await openDialog({
      title: `${p.label || p.id} 테스트`,
      body: html`<label class="field"><span class="field-label">모델</span><select name="model" class="select">${p.models.map((m) => html`<option value="${m}">${m}</option>`)}</select></label>`,
      actions: [{ label: '취소', value: 'cancel' }, { label: '테스트', value: 'ok', primary: true }],
    })
    if (value !== 'ok') return
    model = fields.model
  }
  if (!model) { toast('모델이 없어요 — 고치기에서 모델을 적어 주세요', { tone: 'bad' }); return }
  el.disabled = true
  const old = el.textContent
  el.textContent = '확인 중…'
  try {
    const r = await v4('/ai/test', { method: 'POST', body: { provider: p.id, model } })
    toast(`${p.id}/${model} 연결됨`, { detail: `${(r.ms / 1000).toFixed(1)}초 · "${r.text}"` })
  } catch (e) { toastError(e, `${p.id}/${model} 연결 실패`) }
  el.disabled = false
  el.textContent = old
}

H['ai-route'] = async (el) => {
  const task = el.dataset.task
  const steps = st.status.routes[task] ?? []
  const options = st.status.providers.filter((p) => p.id !== 'env').flatMap((p) => (p.models ?? []).map((m) => `${p.id}/${m}`))
  const { value, fields } = await openDialog({
    title: `${TASK[task]?.[0] ?? task} — 모델 순서`,
    desc: '한 줄에 provider/모델 하나. 위에서부터 시도해요. 비우면 AI 없이 규칙만 써요.',
    body: html`<label class="field"><span class="field-label">순서</span>
        <textarea name="chain" class="input textarea mono" rows="6">${steps.map((s) => `${s.provider}/${s.model}`).join('\n')}</textarea></label>
      <p class="muted">쓸 수 있는 것: ${options.map((o, i) => html`${i ? ', ' : ''}<code class="mono">${o}</code>`)}</p>`,
    actions: [{ label: '취소', value: 'cancel' }, { label: '저장', value: 'ok', primary: true }],
    validate: (f) => {
      const bad = f.chain.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => !st.status.providers.some((p) => l.startsWith(`${p.id}/`) && l.length > p.id.length + 1))
      return bad.length ? `모르는 provider: ${bad.join(', ')}` : ''
    },
  })
  if (value !== 'ok') return
  const chain = fields.chain.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = st.status.providers.find((x) => l.startsWith(`${x.id}/`))
    return { provider: p.id, model: l.slice(p.id.length + 1) }
  })
  const cfg = configOf(st.status)
  cfg.routes = { ...cfg.routes, [task]: chain }
  await save(cfg)
}

H['ai-reset'] = async () => {
  const ok = await confirmDialog({ title: '기본 설정으로', message: '추가한 provider 와 바꾼 순서가 모두 기본값으로 돌아가요. 계속할까요?', confirmLabel: '되돌리기', danger: true })
  if (!ok) return
  try {
    st.status = await v4('/ai/config', { method: 'PUT', body: { reset: true } })
    draw()
    toast('기본 설정으로 되돌렸어요')
  } catch (e) { toastError(e) }
}
