import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { metaDir } from '#v4/workspace'
import { atomicWrite, ensureDir, readText } from '#v4/fs_util'

const execFileP = promisify(execFile)

/*
 * AI 라우터 — 사용자가 추가할 수 있는 provider + 작업별 모델 체인 + 사용 기록.
 *
 * 변경 전 정책: env XITA_AI_* 로 지정한 OpenAI 호환 provider 1개·모델 1개 고정, 10초 one-shot,
 *   실패 시 null. 비용/사용 기록 없음.
 * 변경 후 정책:
 *   - provider 는 <workspace>/.xita/ai.json 에 사용자가 추가한다. 두 종류:
 *       http — OpenAI 호환 /chat/completions (LiteLLM·ollama·vLLM·상용 API)
 *       cli  — 명령 템플릿 실행 (xal run … 으로 OpenCode 무료·z.ai·Alibaba 등 xal 에 연결된 모든 provider)
 *   - 작업(task)마다 [provider, model] 체인을 순서대로 시도하고, 실패(쿼터 소진·키 만료·타임아웃)면 다음으로 넘어간다.
 *   - sensitive 요청(수익·코드)은 local:true provider 만 쓴다 — 데이터가 내 장비/네트워크 밖으로 나가지 않게.
 *   - 키 값은 설정 파일에 넣지 않는다: apiKeyEnv(환경변수 이름) 또는 apiKeyCommand(키체인 등에서 꺼내는 명령).
 *   - 모든 호출을 .xita/ai_usage.jsonl 에 기록(provider·model·task·ms·토큰·성공/실패).
 *   - 하위 호환: XITA_AI_API_KEY 가 있으면 'env' provider 로 모든 체인 맨 앞에 선다.
 * 변경 이유: 가성비 모델(로컬 M5·무료·정액 구독)을 섞어 쓰고, 대장님이 provider 를 직접 늘릴 수 있게.
 * 영향 범위: ai.ts 의 분류/요약/질문 경로와 이후 기획·모니터링·홍보 기능. ai.json 이 없으면 기본 설정으로 동작.
 */

export type AITask = 'classify' | 'summarize' | 'ask' | 'plan' | 'monitor' | 'advice' | 'promo'
export const AI_TASKS: AITask[] = [
  'classify',
  'summarize',
  'ask',
  'plan',
  'monitor',
  'advice',
  'promo',
]

export interface ProviderConfig {
  id: string
  label?: string
  kind: 'http' | 'cli'
  /** 내 장비·내 네트워크 안에서 도는 모델 — sensitive 작업 허용 */
  local?: boolean
  enabled?: boolean
  models: string[]
  timeoutMs?: number
  // http
  baseUrl?: string
  apiKeyEnv?: string
  apiKeyCommand?: string[]
  /** 요청 본문에 그대로 합칠 값 (예: {"reasoning_effort":"none"}) */
  extraBody?: Record<string, unknown>
  /** http 전용 — 모든 모델이 image_url 콘텐츠 파트를 받아들인다 (OpenAI 호환 vision). 이미지 첨부 시에만 이 provider 들이 쓰인다 */
  vision?: boolean
  // cli
  /** argv 템플릿. {model} 치환. 프롬프트는 stdin 으로 넘긴다 (셸을 거치지 않음) */
  command?: string[]
  /** text: stdout 전체가 답 / xal-json: xal run --format json 의 {response, usage} */
  output?: 'text' | 'xal-json'
  cwd?: string
}

export interface RouteStep {
  provider: string
  model: string
}

export interface AIConfig {
  providers: ProviderConfig[]
  routes: Partial<Record<AITask, RouteStep[]>>
}

/*
 * 변경 전 정책: ChatMessage.content 는 문자열뿐 — 이미지 등 멀티모달 입력을 표현할 수 없었다.
 * 변경 후 정책: content 는 문자열 또는 OpenAI 호환 파트 배열({type:'text'} | {type:'image_url'})이다.
 *   http provider 는 파트를 그대로 전송하고, cli provider(flattenMessages)는 텍스트만 펴고
 *   이미지는 생략 마커로 남긴다. vision 플래그가 붙은 http provider 가 있으면 이미지가 있는
 *   요청은 그 체인으로만 가고, 없으면 이미지를 떼고 텍스트만으로 기존 체인을 쓴다.
 * 변경 이유: CLI 기획 위저드의 [Image]/[File]/[Paste] 첨부를 AI 가 실제로 볼 수 있게.
 * 영향 범위: content 가 배열인 메시지를 넣는 호출부(기획 위저드). 문자열만 쓰는 기존 호출부는 변화 없음.
 */
export type ContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

export interface ChatRequest {
  task: AITask
  messages: ChatMessage[]
  json?: boolean
  sensitive?: boolean
  maxTokens?: number
  temperature?: number
  /** 특정 provider/model 강제 (연결 테스트용) */
  only?: RouteStep
  /** provider 설정보다 짧게 끊을 때 (요청 경로 안의 분류 등) */
  timeoutMs?: number
}

export interface ChatResult {
  text: string
  provider: string
  model: string
  ms: number
  usage?: { input?: number; output?: number }
  attempts: Array<{ provider: string; model: string; error: string }>
}

const XAL = (provider: string) => [
  'xal',
  'run',
  '--format',
  'json',
  '--mode',
  'plan',
  '--provider',
  provider,
  '--model',
  '{model}',
]

/** ai.json 이 없을 때 쓰는 기본값 — 이 머신에서 실측 확인한 자원 */
export function defaultConfig(): AIConfig {
  return {
    providers: [
      {
        id: 'm5',
        label: 'Bossgame M5 (LiteLLM)',
        kind: 'http',
        local: true,
        baseUrl: 'http://bossgame-m5:4000/v1',
        apiKeyEnv: 'LITELLM_API_KEY',
        models: ['qwen38-27b-uncensored'],
        timeoutMs: 120_000,
      },
      {
        id: 'ollama',
        label: '이 맥 ollama',
        kind: 'http',
        local: true,
        baseUrl: 'http://127.0.0.1:11434/v1',
        models: ['orcarouter/Qwen3.8-27B-Uncensored:latest'],
        extraBody: { reasoning_effort: 'none' },
        timeoutMs: 180_000,
      },
      {
        id: 'opencode-free',
        label: 'OpenCode 무료 (xal)',
        kind: 'cli',
        command: XAL('opencode-free'),
        output: 'xal-json',
        models: ['zen/glm-5.3-flash-free', 'zen/deepseek-v4.1-flash-free', 'zen/big-pickle'],
        timeoutMs: 240_000,
      },
      {
        id: 'zai',
        label: 'z.ai Coding Plan (xal)',
        kind: 'cli',
        command: XAL('zai-coding-plan'),
        output: 'xal-json',
        models: ['glm-5.3', 'glm-5.3-flash'],
        timeoutMs: 180_000,
      },
      {
        id: 'alibaba',
        label: 'Alibaba Token Plan (xal)',
        kind: 'cli',
        command: XAL('alibaba-token-plan'),
        output: 'xal-json',
        models: ['qwen3.8-flash', 'qwen3.8-max'],
        // 쿼터 소진 시 xal 이 재시도하며 붙잡고 있어 짧게 끊는다 (실측: 소진 상태 300초 무응답)
        timeoutMs: 90_000,
      },
    ],
    routes: {
      classify: [{ provider: 'm5', model: 'qwen38-27b-uncensored' }],
      summarize: [
        { provider: 'm5', model: 'qwen38-27b-uncensored' },
        { provider: 'opencode-free', model: 'zen/glm-5.3-flash-free' },
        { provider: 'ollama', model: 'orcarouter/Qwen3.8-27B-Uncensored:latest' },
      ],
      ask: [
        { provider: 'm5', model: 'qwen38-27b-uncensored' },
        { provider: 'ollama', model: 'orcarouter/Qwen3.8-27B-Uncensored:latest' },
      ],
      plan: [
        { provider: 'zai', model: 'glm-5.3' },
        { provider: 'opencode-free', model: 'zen/glm-5.3-flash-free' },
        { provider: 'alibaba', model: 'qwen3.8-max' },
        { provider: 'm5', model: 'qwen38-27b-uncensored' },
      ],
      monitor: [
        { provider: 'm5', model: 'qwen38-27b-uncensored' },
        { provider: 'ollama', model: 'orcarouter/Qwen3.8-27B-Uncensored:latest' },
      ],
      advice: [
        { provider: 'm5', model: 'qwen38-27b-uncensored' },
        { provider: 'opencode-free', model: 'zen/glm-5.3-flash-free' },
        { provider: 'ollama', model: 'orcarouter/Qwen3.8-27B-Uncensored:latest' },
      ],
      promo: [
        { provider: 'opencode-free', model: 'zen/glm-5.3-flash-free' },
        { provider: 'zai', model: 'glm-5.3-flash' },
        { provider: 'm5', model: 'qwen38-27b-uncensored' },
      ],
    },
  }
}

function configPath() {
  return path.join(metaDir(), 'ai.json')
}

export async function loadConfig(): Promise<AIConfig & { source: 'file' | 'default' }> {
  const raw = await readText(configPath())
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AIConfig
      return { ...normalizeConfig(parsed), source: 'file' }
    } catch {
      // 깨진 파일은 기본값으로 동작하되 덮어쓰지 않는다 (사용자가 고치도록 status 에 표시)
    }
  }
  // 테스트에서는 네트워크 provider 를 부르지 않는다 (규칙 경로만)
  if (process.env.NODE_ENV === 'test') return { providers: [], routes: {}, source: 'default' }
  return { ...defaultConfig(), source: 'default' }
}

export function normalizeConfig(c: Partial<AIConfig>): AIConfig {
  const providers = Array.isArray(c.providers) ? c.providers : []
  const routes = c.routes && typeof c.routes === 'object' ? c.routes : {}
  return { providers, routes }
}

export function validateConfig(c: AIConfig): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const p of c.providers) {
    if (!p.id || !/^[a-z0-9][a-z0-9._-]*$/i.test(p.id))
      errors.push(`provider id 가 올바르지 않습니다: "${p.id}"`)
    if (ids.has(p.id)) errors.push(`provider id 중복: ${p.id}`)
    ids.add(p.id)
    if (p.kind !== 'http' && p.kind !== 'cli') errors.push(`${p.id}: kind 는 http 또는 cli`)
    if (p.kind === 'http' && !p.baseUrl) errors.push(`${p.id}: baseUrl 이 필요합니다`)
    if (p.kind === 'cli' && (!Array.isArray(p.command) || !p.command.length))
      errors.push(`${p.id}: command 가 필요합니다`)
    if (!Array.isArray(p.models)) errors.push(`${p.id}: models 는 배열`)
  }
  for (const [task, steps] of Object.entries(c.routes)) {
    if (!AI_TASKS.includes(task as AITask)) errors.push(`알 수 없는 작업: ${task}`)
    for (const s of steps ?? [])
      if (!ids.has(s.provider)) errors.push(`${task}: 없는 provider ${s.provider}`)
  }
  return errors
}

export async function saveConfig(c: AIConfig) {
  const errors = validateConfig(c)
  if (errors.length) throw new Error(errors.join('\n'))
  await ensureDir(metaDir())
  await atomicWrite(configPath(), JSON.stringify(c, null, 2) + '\n')
}

function envProvider(): ProviderConfig | null {
  if (!process.env.XITA_AI_API_KEY) return null
  return {
    id: 'env',
    label: 'XITA_AI_* 환경변수',
    kind: 'http',
    baseUrl: process.env.XITA_AI_BASE_URL ?? 'https://api.openai.com/v1',
    apiKeyEnv: 'XITA_AI_API_KEY',
    models: [process.env.XITA_AI_MODEL ?? 'gpt-4o-mini'],
    timeoutMs: 30_000,
  }
}

async function resolveKey(p: ProviderConfig): Promise<string | null> {
  if (p.apiKeyEnv && process.env[p.apiKeyEnv]) return process.env[p.apiKeyEnv] as string
  if (p.apiKeyCommand?.length) {
    try {
      const [cmd, ...args] = p.apiKeyCommand
      const { stdout } = await execFileP(cmd, args, { timeout: 10_000 })
      return stdout.trim() || null
    } catch {
      return null
    }
  }
  return null
}

class ProviderError extends Error {}

async function callHttp(p: ProviderConfig, model: string, req: ChatRequest) {
  const key = await resolveKey(p)
  if ((p.apiKeyEnv || p.apiKeyCommand) && !key)
    throw new ProviderError(`키 없음 (${p.apiKeyEnv ? `env ${p.apiKeyEnv}` : 'apiKeyCommand'})`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? p.timeoutMs ?? 60_000)
  try {
    const res = await fetch(`${p.baseUrl!.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: req.temperature ?? 0.3,
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        ...(p.extraBody ?? {}),
        messages: req.messages,
      }),
    })
    const body = await res.text()
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}: ${body.slice(0, 200)}`)
    const data = JSON.parse(body) as {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const text = data.choices?.[0]?.message?.content ?? ''
    return {
      text,
      usage: { input: data.usage?.prompt_tokens, output: data.usage?.completion_tokens },
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new ProviderError('시간 초과')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** 파트/문자열 혼용 content 에서 텍스트만 뽑는다 */
export function messageText(m: ChatMessage): string {
  if (typeof m.content === 'string') return m.content
  return m.content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
}

export function hasImages(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url')
  )
}

/** 이미지 파트를 생략 마커로 바꿔 텍스트 전용 체인에서도 대화가 성립하게 한다 */
export function stripImages(messages: ChatMessage[]): ChatMessage[] {
  let n = 0
  return messages.map((m) => {
    if (typeof m.content === 'string') return m
    const parts = m.content.map((p) =>
      p.type === 'image_url'
        ? ({ type: 'text', text: `[Image #${++n} 생략 — vision 모델 미설정]` } as ContentPart)
        : p
    )
    // 텍스트 파트만 남으면 문자열로 되돌린다(기존 경로와 동일한 형태)
    const onlyText = parts.every((p) => p.type === 'text')
    return {
      ...m,
      content: onlyText ? parts.map((p) => (p as { text: string }).text).join('\n') : parts,
    }
  })
}

/** CLI 는 단일 프롬프트만 받으므로 대화를 하나의 텍스트로 편다 */
export function flattenMessages(messages: ChatMessage[], json?: boolean): string {
  const parts: string[] = []
  for (const m of messages) {
    const images = Array.isArray(m.content)
      ? m.content.filter((p) => p.type === 'image_url').length
      : 0
    const text = messageText(m)
    const note = images ? `\n(이미지 ${images}장 첨부 — CLI provider 는 볼 수 없음)` : ''
    if (m.role === 'system') parts.push(`[지시]\n${text}${note}`)
    else if (m.role === 'user') parts.push(`[사용자]\n${text}${note}`)
    else parts.push(`[이전 답변]\n${text}`)
  }
  parts.push(
    json
      ? '[출력] 도구를 쓰지 말고, 설명 없이 JSON 객체 하나만 출력하라.'
      : '[출력] 도구를 쓰지 말고, 위 지시에 대한 답만 출력하라.'
  )
  return parts.join('\n\n')
}

async function callCli(p: ProviderConfig, model: string, req: ChatRequest) {
  const argv = p.command!.map((a) => a.replaceAll('{model}', model))
  const cwd = p.cwd ?? path.join(metaDir(), 'ai_sandbox')
  await fs.mkdir(cwd, { recursive: true })
  const prompt = flattenMessages(req.messages, req.json)
  const { stdout, stderr, code } = await new Promise<{
    stdout: string
    stderr: string
    code: number | null
  }>((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(
      () => {
        child.kill('SIGTERM')
        reject(new ProviderError('시간 초과'))
      },
      req.timeoutMs ?? p.timeoutMs ?? 180_000
    )
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new ProviderError(`실행 실패: ${e.message}`))
    })
    child.on('close', (c) => {
      clearTimeout(timer)
      resolve({ stdout: out, stderr: err, code: c })
    })
    child.stdin.end(prompt)
  })
  if (p.output === 'xal-json') {
    const line = stdout
      .trim()
      .split('\n')
      .reverse()
      .find((l) => l.startsWith('{'))
    if (!line) throw new ProviderError(`응답 없음 (exit ${code}) ${stderr.slice(-200)}`)
    const j = JSON.parse(line) as {
      status?: string
      response?: string
      error?: string
      usage?: { totalInputTokens?: number; outputTokens?: number }
    }
    if (j.status !== 'completed' || !j.response)
      throw new ProviderError(`${j.status ?? 'failed'}: ${(j.error ?? stderr).slice(-200)}`)
    return {
      text: j.response,
      usage: { input: j.usage?.totalInputTokens, output: j.usage?.outputTokens },
    }
  }
  if (code !== 0) throw new ProviderError(`exit ${code}: ${stderr.slice(-200)}`)
  return { text: stdout.trim(), usage: {} }
}

/** 응답에서 JSON 객체를 꺼낸다 (코드펜스·앞뒤 잡담 허용) */
export function extractJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

async function recordUsage(entry: Record<string, unknown>) {
  try {
    await ensureDir(metaDir())
    await fs.appendFile(path.join(metaDir(), 'ai_usage.jsonl'), JSON.stringify(entry) + '\n')
  } catch {
    // 기록 실패가 AI 응답을 막지 않는다
  }
}

export async function chainFor(task: AITask, sensitive = false) {
  const cfg = await loadConfig()
  const env = envProvider()
  const providers = new Map(cfg.providers.map((p) => [p.id, p]))
  if (env) providers.set(env.id, env)
  const steps: RouteStep[] = [
    ...(env ? [{ provider: env.id, model: env.models[0] }] : []),
    ...(cfg.routes[task] ?? []),
  ]
  return steps
    .map((s) => ({ step: s, provider: providers.get(s.provider) }))
    .filter((x): x is { step: RouteStep; provider: ProviderConfig } => !!x.provider)
    .filter((x) => x.provider.enabled !== false)
    .filter((x) => !sensitive || x.provider.local === true)
}

/** 이미지 첨부 요청이 갈 수 있는 provider 만 남긴다 (http + vision:true — cli 는 이미지를 못 받는다) */
export function visionChainOf(chain: Array<{ step: RouteStep; provider: ProviderConfig }>) {
  return chain.filter((x) => x.provider.kind === 'http' && x.provider.vision === true)
}

/** 작업 체인을 순서대로 시도. 전부 실패하면 null (호출부가 규칙 기반 대체 경로를 쓴다) */
export async function aiChat(req: ChatRequest): Promise<ChatResult | null> {
  let chain = await chainFor(req.task, req.sensitive)
  if (req.only) {
    const cfg = await loadConfig()
    const p = [...cfg.providers, ...(envProvider() ? [envProvider()!] : [])].find(
      (x) => x.id === req.only!.provider
    )
    chain = p ? [{ step: req.only, provider: p }] : []
  }
  /*
   * 이미지가 붙은 요청: vision 가능(http+vision) provider 체인으로 좁히고,
   * 그런 provider 가 없으면 이미지를 생략 마커로 바꿔 기존 텍스트 체인으로 보낸다.
   */
  let effReq = req
  if (hasImages(req.messages)) {
    const visionChain = visionChainOf(chain)
    if (visionChain.length) chain = visionChain
    else effReq = { ...req, messages: stripImages(req.messages) }
  }
  const attempts: ChatResult['attempts'] = []
  for (const { step, provider } of chain) {
    const ck = `${step.provider}\u0000${step.model}`
    if (!req.only && (cooldown.get(ck) ?? 0) > Date.now()) {
      attempts.push({
        provider: step.provider,
        model: step.model,
        error: '최근 실패로 잠시 건너뜀',
      })
      continue
    }
    const t0 = Date.now()
    try {
      const out =
        provider.kind === 'http'
          ? await callHttp(provider, step.model, effReq)
          : await callCli(provider, step.model, effReq)
      if (!out.text.trim()) throw new ProviderError('빈 응답')
      if (req.json && extractJson(out.text) === null) throw new ProviderError('JSON 아님')
      const ms = Date.now() - t0
      cooldown.delete(ck)
      await recordUsage({
        at: new Date().toISOString(),
        task: req.task,
        provider: step.provider,
        model: step.model,
        ok: true,
        ms,
        in: out.usage.input ?? null,
        out: out.usage.output ?? null,
      })
      return {
        text: out.text.trim(),
        provider: step.provider,
        model: step.model,
        ms,
        usage: out.usage,
        attempts,
      }
    } catch (e) {
      const error = (e as Error).message.slice(0, 300)
      cooldown.set(ck, Date.now() + COOLDOWN_MS)
      attempts.push({ provider: step.provider, model: step.model, error })
      await recordUsage({
        at: new Date().toISOString(),
        task: req.task,
        provider: step.provider,
        model: step.model,
        ok: false,
        ms: Date.now() - t0,
        error,
      })
    }
  }
  if (attempts.length) lastFailures.set(req.task, attempts)
  return null
}

const lastFailures = new Map<AITask, ChatResult['attempts']>()

/* 실패한 provider/model 은 잠시 건너뛴다 — 쿼터 소진·키 만료를 매 호출마다 다시 기다리지 않게.
 * 연결 테스트(only)는 쿨다운을 무시하고 실제로 시도한다. */
const COOLDOWN_MS = 10 * 60_000
const cooldown = new Map<string, number>()

export interface UsageSummary {
  since: string
  calls: number
  failures: number
  byProvider: Array<{
    provider: string
    model: string
    calls: number
    failures: number
    in: number
    out: number
    avgMs: number
  }>
}

export async function usageSummary(days = 7): Promise<UsageSummary> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const raw = (await readText(path.join(metaDir(), 'ai_usage.jsonl'))) ?? ''
  const rows = new Map<string, UsageSummary['byProvider'][number] & { ms: number }>()
  let calls = 0
  let failures = 0
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let e: {
      at: string
      provider: string
      model: string
      ok: boolean
      ms: number
      in?: number
      out?: number
    }
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (e.at < since) continue
    calls++
    if (!e.ok) failures++
    const k = `${e.provider}\u0000${e.model}`
    const r = rows.get(k) ?? {
      provider: e.provider,
      model: e.model,
      calls: 0,
      failures: 0,
      in: 0,
      out: 0,
      avgMs: 0,
      ms: 0,
    }
    r.calls++
    if (!e.ok) r.failures++
    r.in += e.in ?? 0
    r.out += e.out ?? 0
    r.ms += e.ms ?? 0
    rows.set(k, r)
  }
  return {
    since,
    calls,
    failures,
    byProvider: [...rows.values()]
      .map(({ ms, ...r }) => ({ ...r, avgMs: r.calls ? Math.round(ms / r.calls) : 0 }))
      .sort((a, b) => b.calls - a.calls),
  }
}

export async function routerStatus() {
  const cfg = await loadConfig()
  const raw = await readText(configPath())
  let fileError: string | null = null
  if (raw) {
    try {
      JSON.parse(raw)
    } catch (e) {
      fileError = `ai.json 을 읽지 못해 기본 설정으로 동작 중: ${(e as Error).message}`
    }
  }
  const env = envProvider()
  return {
    source: cfg.source,
    path: configPath(),
    fileError,
    providers: [...(env ? [env] : []), ...cfg.providers].map((p) => ({
      ...p,
      keyConfigured: p.apiKeyEnv ? !!process.env[p.apiKeyEnv] : p.apiKeyCommand ? true : null,
    })),
    routes: cfg.routes,
    tasks: AI_TASKS,
    lastFailures: Object.fromEntries(lastFailures),
  }
}
