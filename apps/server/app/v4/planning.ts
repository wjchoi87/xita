import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { workspaceRoot } from '#v4/workspace'
import { atomicWrite, ensureDir, readText } from '#v4/fs_util'
import { aiChat, extractJson, type ChatMessage } from '#v4/ai_router'
import { V4Domain } from '#v4/domain'
import { V4Ops } from '#v4/ops'
import { ArtifactStore, createDecision } from '#v4/artifact_store'

/*
 * 새 프로젝트 기획 위저드 — AI 가 질문을 던지며 단계별로 기획을 완성한다.
 *
 * 정책:
 *   - 단계: 이름 → 문제·타깃 → 핵심 기능(MVP) → 확장 기능 → 수익화 → 출시·홍보 → 위험·지표 → 최종 검토.
 *   - 사용자가 '확정' 하기 전까지는 기획 세션(초안)만 저장한다. 제품·할 일·마일스톤은 만들지 않는다.
 *   - 세션은 <workspace>/planning/<id>.json (사용자 데이터 — 지우면 안 됨) + 같은 이름 .md (사람이 읽는 사본).
 *   - AI 는 작업 'plan' 체인(ai_router). 전부 실패하면 단계별 기본 질문으로 계속 진행한다(오프라인에서도 끝까지 가능).
 *   - 확정 시: Product(+코드네임) · 기획서 Living Artifact · 수익모델 Decision · 마일스톤(MVP/확장) · 할 일(MVP=할 일, 확장=아이디어).
 */

export const STAGES = [
  {
    key: 'name',
    title: '이름·한 줄 소개',
    goal: '무엇을 만드는지 한 문장, 가칭 이름, 영문 코드네임(소문자-하이픈), 플랫폼(Android/iOS/웹/데스크톱)',
    fields:
      '{"name":"가칭","codename":"lower-kebab","one_liner":"한 문장 소개","platform":"android|ios|web|desktop|multi"}',
    fallback: [
      '어떤 걸 만들고 싶으세요? 떠오르는 대로 한두 문장으로 말해 주세요.',
      '가칭 이름과 영문 코드네임(예: bus-when)을 정해 볼까요?',
      '어디서 돌아가나요? Android / iOS / 웹 / 데스크톱 중에서요.',
    ],
  },
  {
    key: 'problem',
    title: '문제·타깃',
    goal: '누가, 어떤 상황에서, 무엇 때문에 불편한지. 지금은 어떻게 해결하는지(대안·경쟁 앱)',
    fields:
      '{"target_users":"","problem":"","situation":"","alternatives":["경쟁/대안"],"differentiator":"왜 이걸 쓰나"}',
    fallback: [
      '이걸 쓰는 사람은 누구인가요? 가장 자주 쓸 한 사람을 떠올려 주세요.',
      '그 사람이 지금 겪는 불편은 뭔가요? 언제 그 불편을 느끼나요?',
      '지금은 그 문제를 어떻게 해결하고 있나요? 비슷한 앱이 있나요?',
    ],
  },
  {
    key: 'mvp',
    title: '핵심 기능 (MVP)',
    goal: '첫 출시에 꼭 필요한 최소 기능 3~6개. 각 기능의 이유. 빼도 되는 건 확장으로 미룬다',
    fields: '{"mvp_features":[{"title":"기능","why":"이유"}],"out_of_scope":["이번엔 안 할 것"]}',
    fallback: [
      '첫 버전에서 이것만 되면 쓸 만하다 싶은 기능 3가지는 뭔가요?',
      '그중 하나만 남긴다면 어떤 걸 남기겠어요?',
      '첫 버전에서는 일부러 안 할 것도 정해 둘까요?',
    ],
  },
  {
    key: 'extend',
    title: '확장 기능',
    goal: 'MVP 이후 붙일 기능. 사용자 반응을 보고 결정할 후보. 우선순위',
    fields: '{"extensions":[{"title":"기능","why":"이유","priority":"high|normal|low"}]}',
    fallback: [
      '첫 버전이 잘 되면 다음에 붙이고 싶은 기능은 뭔가요?',
      '그중 수익에 가장 도움이 될 것 같은 건 어떤 건가요?',
    ],
  },
  {
    key: 'money',
    title: '수익화',
    goal: '수익 모델(광고/인앱/구독/유료/혼합), 가격·광고 위치, 무료와 유료의 경계, 예상 수익 가정',
    fields:
      '{"monetization":{"model":"ads|iap|subscription|paid|mixed|none","details":"","pricing":"","free_vs_paid":""}}',
    fallback: [
      '돈은 어떻게 벌까요? 광고 / 인앱 결제 / 구독 / 유료 / 섞어서 중에서요.',
      '광고라면 어디에 넣을까요? 결제라면 무엇을 얼마에 팔까요?',
      '무료로 줄 것과 돈을 받을 것의 경계는 어디인가요?',
    ],
  },
  {
    key: 'launch',
    title: '출시·홍보',
    goal: '출시 채널(스토어), 스토어 키워드, 첫 사용자 확보 채널(커뮤니티·SNS), 첫 주 계획',
    fields:
      '{"launch":{"stores":["play"],"store_keywords":[""],"channels":["커뮤니티/SNS"],"first_week":"","message":"홍보 한 줄"}}',
    fallback: [
      '어디에 출시하나요? 플레이 스토어만인가요?',
      '사람들이 이 앱을 찾을 때 검색할 키워드는 뭘까요?',
      '첫 사용자 100명은 어디서 데려올까요? (커뮤니티·SNS 등)',
    ],
  },
  {
    key: 'risk',
    title: '위험·성공 지표',
    goal: '가장 큰 위험(기술/정책/경쟁/수요)과 대응, 성공을 판단할 숫자(설치·리텐션·수익)와 기한',
    fields:
      '{"risks":[{"risk":"","mitigation":""}],"success_metrics":["지표와 목표값"],"kill_criteria":"접을 기준"}',
    fallback: [
      '이 프로젝트가 실패한다면 가장 그럴듯한 이유는 뭘까요?',
      '출시 한 달 뒤 어떤 숫자가 나오면 성공이라고 할까요?',
      '어떤 상황이면 접을지도 미리 정해 둘까요?',
    ],
  },
  {
    key: 'confirm',
    title: '최종 검토',
    goal: '전체 기획을 요약해 보여주고 빠진 부분을 확인. 마일스톤(MVP·확장)과 각 마일스톤의 할 일을 제안. 사용자가 확정하면 끝',
    fields: '{"milestones":[{"name":"MVP","target":"YYYY-MM-DD 또는 빈칸","items":["할 일"]}]}',
    fallback: [
      '지금까지 정리한 기획을 보고 바꾸고 싶은 곳이 있나요? 없으면 "/확정" 으로 프로젝트를 만들어요.',
    ],
  },
] as const

export type StageKey = (typeof STAGES)[number]['key']

export interface PlanMessage {
  role: 'assistant' | 'user'
  content: string
  stage: StageKey
  at: string
  options?: string[]
  source?: string
}

export interface PlanSession {
  id: string
  status: 'drafting' | 'confirmed' | 'abandoned'
  stage: number
  created_at: string
  updated_at: string
  draft: Record<string, unknown>
  summaries: Partial<Record<StageKey, string>>
  ready: Partial<Record<StageKey, boolean>>
  messages: PlanMessage[]
  product?: string
}

const dir = () => path.join(workspaceRoot(), 'planning')
const jsonPath = (id: string) => path.join(dir(), `${id}.json`)

export class PlanError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message)
  }
}

async function save(s: PlanSession) {
  s.updated_at = new Date().toISOString()
  await ensureDir(dir())
  await atomicWrite(jsonPath(s.id), JSON.stringify(s, null, 2) + '\n')
  await atomicWrite(path.join(dir(), `${s.id}.md`), renderPlan(s))
}

export async function getPlan(id: string): Promise<PlanSession> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new PlanError('잘못된 기획 id', 404)
  const raw = await readText(jsonPath(id))
  if (!raw) throw new PlanError('기획을 찾을 수 없습니다', 404)
  return JSON.parse(raw) as PlanSession
}

export async function listPlans() {
  let files: string[] = []
  try {
    const all = await fs.readdir(dir())
    files = all.filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const out = []
  for (const f of files) {
    try {
      const raw = await readText(path.join(dir(), f))
      const s = JSON.parse(raw ?? '') as PlanSession
      out.push({
        id: s.id,
        name: planName(s),
        status: s.status,
        stage: s.stage,
        stageTitle: STAGES[s.stage]?.title,
        stages: STAGES.length,
        updated_at: s.updated_at,
        product: s.product ?? null,
      })
    } catch {
      // 깨진 파일은 목록에서만 건너뛴다 (지우지 않음)
    }
  }
  return out.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
}

export function planName(s: PlanSession) {
  return String(s.draft.name ?? '') || '이름 없는 기획'
}

/* ---- AI 한 턴 --------------------------------------------------------------- */

const SYSTEM = `너는 1인 개발자를 돕는 시니어 프로덕트 플래너다. 사용자와 1:1 인터뷰로 새 프로젝트 기획을 단계별로 완성한다.
사용자 프로필: Android 앱 여러 개를 운영하는 1인 개발자. Play 스토어 출시, AdMob 광고 수익 경험 있음. 목표는 적은 비용으로 빨리 출시해 수익을 내는 것.

규칙:
- 한국어, 반말 금지, 짧게. 한 번에 질문은 하나(꼭 필요하면 둘).
- 사용자가 모르거나 막히면 2~4개의 구체적인 선택지를 options 로 제안하고, 가장 권하는 것 하나에 "(추천)"을 붙인다.
- 사용자가 확정하기 전까지 대신 결정하지 않는다. 네가 채운 값은 draft_patch 에 넣되 reply 에서 "가정"이라고 밝히고 확인을 받는다.
- 지금 단계의 범위만 다룬다. 다른 단계 이야기는 그 단계로 미룬다.
- 이 단계에서 필요한 내용이 충분히 모이면 stage_ready=true 로 하고, reply 에 이 단계 요약과 함께 "다음 단계로 넘어갈까요?"를 묻는다.
- 시장·경쟁 정보는 아는 범위에서만 말하고, 불확실하면 "확인 필요"라고 쓴다. 지어내지 않는다.

출력은 JSON 객체 하나만:
{"reply":"사용자에게 보여줄 말","options":["선택지"],"draft_patch":{이 단계 필드만},"stage_summary":"이 단계 현재 요약 (1~3문장)","stage_ready":false}`

function stagePrompt(s: PlanSession) {
  const st = STAGES[s.stage]
  const prev = STAGES.slice(0, s.stage)
    .map((x) => (s.summaries[x.key] ? `- ${x.title}: ${s.summaries[x.key]}` : null))
    .filter(Boolean)
    .join('\n')
  return `현재 단계: ${s.stage + 1}/${STAGES.length} "${st.title}"
이 단계에서 정할 것: ${st.goal}
draft_patch 형식: ${st.fields}

앞 단계 요약:
${prev || '(없음)'}

지금까지의 기획 초안(JSON):
${JSON.stringify(s.draft)}`
}

interface TurnOut {
  reply: string
  options?: string[]
  draft_patch?: Record<string, unknown>
  stage_summary?: string
  stage_ready?: boolean
}

function fallbackQuestion(s: PlanSession): TurnOut {
  const st = STAGES[s.stage]
  const asked = s.messages.filter((m) => m.role === 'assistant' && m.stage === st.key).length
  const q = st.fallback[Math.min(asked, st.fallback.length - 1)]
  const last = asked >= st.fallback.length
  return {
    reply: last
      ? `${q}\n(AI 연결이 없어 기본 질문으로 진행 중이에요. 충분하면 "/다음" 으로 넘어가요.)`
      : q,
    stage_ready: last,
  }
}

async function aiTurn(
  s: PlanSession,
  userText: string | null
): Promise<TurnOut & { source: string }> {
  const st = STAGES[s.stage]
  const history: ChatMessage[] = s.messages
    .filter((m) => m.stage === st.key)
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content }))
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: stagePrompt(s) },
    ...history,
    {
      role: 'user',
      content:
        userText ??
        (history.length
          ? '이어서 진행해 주세요.'
          : `"${st.title}" 단계를 시작합니다. 첫 질문을 해 주세요.`),
    },
  ]
  const out = await aiChat({ task: 'plan', json: true, messages, temperature: 0.5 })
  if (out) {
    const j = extractJson<TurnOut>(out.text)
    if (j && typeof j.reply === 'string' && j.reply.trim())
      return { ...j, source: `${out.provider}/${out.model}` }
  }
  return { ...fallbackQuestion(s), source: 'rule' }
}

function applyTurn(s: PlanSession, t: TurnOut & { source: string }) {
  const st = STAGES[s.stage]
  if (t.draft_patch && typeof t.draft_patch === 'object' && !Array.isArray(t.draft_patch)) {
    for (const [k, v] of Object.entries(t.draft_patch)) {
      if (v === null || v === undefined || v === '') continue
      const cur = s.draft[k]
      // 객체 필드(monetization·launch)는 얕게 병합, 나머지는 교체
      s.draft[k] =
        cur &&
        typeof cur === 'object' &&
        !Array.isArray(cur) &&
        typeof v === 'object' &&
        !Array.isArray(v)
          ? { ...(cur as object), ...(v as object) }
          : v
    }
  }
  if (t.stage_summary?.trim()) s.summaries[st.key] = t.stage_summary.trim()
  if (t.stage_ready !== undefined) s.ready[st.key] = !!t.stage_ready
  s.messages.push({
    role: 'assistant',
    content: t.reply.trim(),
    stage: st.key,
    at: new Date().toISOString(),
    options: Array.isArray(t.options) ? t.options.map(String).slice(0, 6) : undefined,
    source: t.source,
  })
}

function assertDrafting(s: PlanSession) {
  if (s.status !== 'drafting')
    throw new PlanError(s.status === 'confirmed' ? '이미 확정된 기획입니다' : '중단된 기획입니다')
}

export async function createPlan(idea?: string) {
  const now = new Date().toISOString()
  const s: PlanSession = {
    id: `plan-${now.slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex')}`,
    status: 'drafting',
    stage: 0,
    created_at: now,
    updated_at: now,
    draft: {},
    summaries: {},
    ready: {},
    messages: [],
  }
  if (idea?.trim()) {
    s.messages.push({ role: 'user', content: idea.trim(), stage: 'name', at: now })
  }
  applyTurn(s, await aiTurn(s, idea?.trim() || null))
  await save(s)
  return s
}

export async function planTurn(id: string, message: string) {
  const s = await getPlan(id)
  assertDrafting(s)
  const text = message.trim()
  if (!text) throw new PlanError('메시지가 비었습니다')
  s.messages.push({
    role: 'user',
    content: text,
    stage: STAGES[s.stage].key,
    at: new Date().toISOString(),
  })
  applyTurn(s, await aiTurn(s, text))
  await save(s)
  return s
}

/** 단계 이동 — next/prev/단계 key. 새 단계에 처음 들어가면 AI 가 첫 질문을 한다 */
export async function planStage(id: string, to: string) {
  const s = await getPlan(id)
  assertDrafting(s)
  const idx =
    to === 'next'
      ? s.stage + 1
      : to === 'prev'
        ? s.stage - 1
        : STAGES.findIndex((x) => x.key === to)
  if (idx < 0 || idx >= STAGES.length) throw new PlanError('갈 수 없는 단계입니다')
  s.stage = idx
  const key = STAGES[idx].key
  if (!s.messages.some((m) => m.stage === key && m.role === 'assistant')) {
    applyTurn(s, await aiTurn(s, null))
  }
  await save(s)
  return s
}

/** 초안 직접 수정 (웹에서 필드 고치기) — AI 를 거치지 않는다 */
export async function planPatch(id: string, patch: Record<string, unknown>) {
  const s = await getPlan(id)
  assertDrafting(s)
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete s.draft[k]
    else s.draft[k] = v
  }
  await save(s)
  return s
}

export async function abandonPlan(id: string) {
  const s = await getPlan(id)
  assertDrafting(s)
  s.status = 'abandoned'
  await save(s)
  return s
}

/* ---- 확정 → 제품·문서·결정·마일스톤·할 일 -------------------------------------- */

type Feature = { title?: string; why?: string; priority?: string }
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const featureTitle = (f: unknown) => (typeof f === 'string' ? f : str((f as Feature)?.title))

export function confirmProblems(s: PlanSession): string[] {
  const d = s.draft
  const out: string[] = []
  if (!str(d.name)) out.push('이름이 없습니다 (1단계)')
  if (!str(d.codename) || !/^[a-z0-9][a-z0-9-]*$/.test(str(d.codename)))
    out.push('영문 코드네임이 없습니다 (1단계, 예: bus-when)')
  if (!arr(d.mvp_features).length) out.push('핵심 기능(MVP)이 없습니다 (3단계)')
  return out
}

/** 확정은 막지 않지만 비어 있는 단계를 알려 준다 */
export function planGaps(s: PlanSession): string[] {
  const d = s.draft
  const money = (d.monetization ?? {}) as Record<string, unknown>
  const launch = (d.launch ?? {}) as Record<string, unknown>
  const gaps: Array<[boolean, string]> = [
    [!str(d.problem) && !str(d.target_users), '문제·타깃'],
    [!arr(d.extensions).length, '확장 기능'],
    [!str(money.model), '수익화'],
    [!arr(launch.channels).length && !arr(launch.store_keywords).length, '출시·홍보'],
    [!arr(d.risks).length && !arr(d.success_metrics).length, '위험·성공 지표'],
  ]
  return gaps.filter(([empty]) => empty).map(([, label]) => label)
}

export async function confirmPlan(id: string) {
  const s = await getPlan(id)
  assertDrafting(s)
  const problems = confirmProblems(s)
  if (problems.length) throw new PlanError(`확정하려면 채워야 해요:\n- ${problems.join('\n- ')}`)
  const d = s.draft
  const domain = new V4Domain()
  const ops = new V4Ops()
  const codename = str(d.codename)
  const product = await domain.createProduct({
    id: codename,
    name: str(d.name),
    description: str(d.one_liner) || null,
    goal: str(d.problem) || null,
    direction: str((d.monetization as Record<string, unknown> | undefined)?.model) || null,
    productionStatus: 'PLANNING',
  })
  const pid = product.id

  await new ArtifactStore().create({
    id: `${pid}-plan`,
    name: `${str(d.name)} 기획서`,
    product: pid,
    content: renderPlan(s, { forArtifact: true }),
    summary: str(d.one_liner) || null,
    extraMeta: { kind: 'spec', source: `planning/${s.id}` },
  })

  const money = (d.monetization ?? {}) as Record<string, unknown>
  if (str(money.model)) {
    await createDecision({
      id: `${pid}-monetization`,
      product: pid,
      title: '수익 모델',
      decision: [str(money.model), str(money.details), str(money.pricing)]
        .filter(Boolean)
        .join(' — '),
      reason: str(money.free_vs_paid) || null,
    })
  }

  // 마일스톤: AI 가 제안한 것(최종 검토 단계) 우선, 없으면 MVP·확장 두 개
  const proposed = arr<{ name?: string; target?: string; items?: unknown[] }>(d.milestones).filter(
    (m) => str(m.name)
  )
  const created: Array<{ id: string; name: string }> = []
  const mkMs = async (name: string, target?: string) => {
    const doc = await ops.createMilestone({
      product: pid,
      name,
      targetDate: /^\d{4}-\d{2}-\d{2}$/.test(target ?? '') ? target : undefined,
    })
    created.push({ id: doc.id, name })
    return doc.id
  }
  const addChange = async (
    title: string,
    status: 'PLAN' | 'IDEA',
    ms: string | null,
    note?: string,
    priority?: string
  ) => {
    if (title.length < 2) return
    const doc = await domain.createChange({ productId: pid, title: title.slice(0, 200), priority })
    if (status === 'PLAN') await domain.transitionChange(doc.id, 'PLAN')
    if (ms) await ops.assignMilestone(doc.id, ms)
    if (note) await ops.editChange(doc.id, { note })
  }

  if (proposed.length) {
    for (const m of proposed) {
      const mid = await mkMs(str(m.name), str(m.target))
      const first = created.length === 1
      for (const it of arr(m.items)) await addChange(featureTitle(it), first ? 'PLAN' : 'IDEA', mid)
    }
  } else {
    const mvp = await mkMs('MVP')
    for (const f of arr<Feature>(d.mvp_features))
      await addChange(featureTitle(f), 'PLAN', mvp, str(f.why))
    const ext = arr<Feature>(d.extensions)
    if (ext.length) {
      const mid = await mkMs('확장')
      for (const f of ext)
        await addChange(featureTitle(f), 'IDEA', mid, str(f.why), str(f.priority) || undefined)
    }
  }

  await ops.recordEvent({
    eventType: 'PLAN_CONFIRMED',
    product: pid,
    title: `기획 확정: ${str(d.name)}`,
    summary: str(d.one_liner) || null,
  })
  s.status = 'confirmed'
  s.product = pid
  await save(s)
  return { plan: s, product: pid, milestones: created }
}

/* ---- 사람이 읽는 기획서 ----------------------------------------------------------- */

const MODEL_KO: Record<string, string> = {
  ads: '광고',
  iap: '인앱 결제',
  subscription: '구독',
  paid: '유료',
  mixed: '혼합',
  none: '수익 없음',
}

export function renderPlan(s: PlanSession, opts: { forArtifact?: boolean } = {}) {
  const d = s.draft
  const L: string[] = []
  const list = (items: string[]) => items.filter(Boolean).map((x) => `- ${x}`)
  L.push(`# ${planName(s)}${str(d.codename) ? ` (${str(d.codename)})` : ''}`, '')
  if (str(d.one_liner)) L.push(`> ${str(d.one_liner)}`, '')
  if (!opts.forArtifact)
    L.push(
      `상태: ${s.status === 'confirmed' ? '확정' : s.status === 'abandoned' ? '중단' : `작성 중 (${s.stage + 1}/${STAGES.length} ${STAGES[s.stage].title})`}`,
      ''
    )
  if (str(d.platform)) L.push(`플랫폼: ${str(d.platform)}`, '')
  L.push('## 문제·타깃', '')
  for (const [k, label] of [
    ['target_users', '타깃'],
    ['problem', '문제'],
    ['situation', '상황'],
    ['differentiator', '차별점'],
  ] as const)
    if (str(d[k])) L.push(`- **${label}**: ${str(d[k])}`)
  if (arr(d.alternatives).length)
    L.push(`- **대안·경쟁**: ${arr<string>(d.alternatives).map(String).join(', ')}`)
  L.push('', '## 핵심 기능 (MVP)', '')
  L.push(
    ...list(
      arr<Feature>(d.mvp_features).map(
        (f) => `${featureTitle(f)}${str(f?.why) ? ` — ${str(f.why)}` : ''}`
      )
    )
  )
  if (arr(d.out_of_scope).length)
    L.push('', '이번엔 안 함:', ...list(arr<string>(d.out_of_scope).map(String)))
  L.push('', '## 확장 기능', '')
  L.push(
    ...list(
      arr<Feature>(d.extensions).map(
        (f) => `${featureTitle(f)}${str(f?.why) ? ` — ${str(f.why)}` : ''}`
      )
    )
  )
  const money = (d.monetization ?? {}) as Record<string, unknown>
  L.push('', '## 수익화', '')
  if (str(money.model)) L.push(`- **모델**: ${MODEL_KO[str(money.model)] ?? str(money.model)}`)
  for (const [k, label] of [
    ['details', '내용'],
    ['pricing', '가격'],
    ['free_vs_paid', '무료/유료 경계'],
  ] as const)
    if (str(money[k])) L.push(`- **${label}**: ${str(money[k])}`)
  const launch = (d.launch ?? {}) as Record<string, unknown>
  L.push('', '## 출시·홍보', '')
  if (arr(launch.stores).length) L.push(`- **스토어**: ${arr<string>(launch.stores).join(', ')}`)
  if (arr(launch.store_keywords).length)
    L.push(`- **키워드**: ${arr<string>(launch.store_keywords).join(', ')}`)
  if (arr(launch.channels).length) L.push(`- **채널**: ${arr<string>(launch.channels).join(', ')}`)
  if (str(launch.first_week)) L.push(`- **첫 주**: ${str(launch.first_week)}`)
  if (str(launch.message)) L.push(`- **홍보 한 줄**: ${str(launch.message)}`)
  L.push('', '## 위험·성공 지표', '')
  L.push(
    ...list(
      arr<{ risk?: string; mitigation?: string }>(d.risks).map(
        (r) => `${str(r?.risk)}${str(r?.mitigation) ? ` → ${str(r.mitigation)}` : ''}`
      )
    )
  )
  if (arr(d.success_metrics).length)
    L.push('', '성공 지표:', ...list(arr<string>(d.success_metrics).map(String)))
  if (str(d.kill_criteria)) L.push('', `접는 기준: ${str(d.kill_criteria)}`)
  const ms = arr<{ name?: string; target?: string; items?: unknown[] }>(d.milestones)
  if (ms.length) {
    L.push('', '## 마일스톤', '')
    for (const m of ms) {
      L.push(`### ${str(m.name)}${str(m.target) ? ` (${str(m.target)})` : ''}`, '')
      L.push(...list(arr(m.items).map(featureTitle)), '')
    }
  }
  // 아직 비어 있는 섹션은 비었다고 표시 (사람이 빈 칸을 바로 알아보게)
  const text = L.join('\n').replace(/\n{3,}/g, '\n\n')
  return (
    text.replace(/^(## .+)\n+(?=## |$(?![\s\S]))/gm, '$1\n\n_아직 정하지 않았어요_\n\n').trimEnd() +
    '\n'
  )
}
