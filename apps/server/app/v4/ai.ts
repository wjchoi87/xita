import crypto from 'node:crypto'
import path from 'node:path'
import { metaDir } from '#v4/workspace'
import { atomicWrite, ensureDir, readText } from '#v4/fs_util'

/*
 * AI Provider Layer (SPEC v0.3 §10-§11).
 *
 * 변경 전 정책: classify 등 판단이 필요한 지점에 하드코딩 규칙만 존재.
 * 변경 후 정책: Provider Adapter(interface AIProvider) 로 추상화하고,
 *   원가 우선순위(§10)를 지킨다:
 *     Rule-based → (file)Cache → OpenAI-compatible API → (실패 시) rule fallback
 *   미설정 환경에서는 규칙만 사용 — AI 없이도 전체 제품이 동작한다.
 * 변경 이유: "Agent 가 복잡성을 흡수"하되 비용/오프라인 제약을 지키기 위해.
 * 영향 범위: workbench capture 분류. AI 미설정 시 동작 불변(기존 규칙 경로).
 */

export type CaptureType = 'idea' | 'research' | 'experiment' | 'discussion' | 'draft' | 'other'

export interface ClassifyResult {
  work_type: CaptureType
  source: 'rule' | 'cache' | 'ai'
  confidence: 'high' | 'low'
}

export interface AIProvider {
  name: string
  available(): boolean
  classifyCapture(title: string, content: string): Promise<CaptureType | null>
  genericChat?(system: string, user: string): Promise<string | null>
}

const RESEARCH = /조사|리서치|research|분석|analysis|검토/
const EXPERIMENT = /실험|experiment|a\/?b|테스트 케이스|가설/
const DISCUSSION = /논의|회의|discussion|디베이트|의견/
const DRAFT = /초안|draft|스펙|spec|설계/

/** 1차: 규칙 기반 (공짜·확정적). strong hit 이면 여기서 끝낸다. */
export function ruleClassify(title: string, content = ''): ClassifyResult | null {
  const t = `${title} ${content}`.toLowerCase()
  if (RESEARCH.test(t)) return { work_type: 'research', source: 'rule', confidence: 'high' }
  if (EXPERIMENT.test(t)) return { work_type: 'experiment', source: 'rule', confidence: 'high' }
  if (DISCUSSION.test(t)) return { work_type: 'discussion', source: 'rule', confidence: 'high' }
  if (DRAFT.test(t)) return { work_type: 'draft', source: 'rule', confidence: 'high' }
  return null // 규칙 미스 → 캐시/AI 단계
}

class OpenAICompatProvider implements AIProvider {
  name = 'openai-compat'

  available(): boolean {
    return !!process.env.XITA_AI_API_KEY
  }

  async genericChat(system: string, user: string): Promise<string | null> {
    const key = process.env.XITA_AI_API_KEY
    if (!key) return null
    const base = (process.env.XITA_AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
    const model = process.env.XITA_AI_MODEL ?? 'gpt-4o-mini'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
      if (!res.ok) return null
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      return data.choices?.[0]?.message?.content ?? null
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  async classifyCapture(title: string, content: string): Promise<CaptureType | null> {
    const base = (process.env.XITA_AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
    const model = process.env.XITA_AI_MODEL ?? 'gpt-4o-mini'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${process.env.XITA_AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You classify a captured note into exactly one work_type among: idea, research, experiment, discussion, draft, other. Reply JSON {"work_type":"..."}',
            },
            { role: 'user', content: JSON.stringify({ title, content: content.slice(0, 500) }) },
          ],
        }),
      })
      if (!res.ok) return null
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const raw = data.choices?.[0]?.message?.content
      if (!raw) return null
      const parsed = JSON.parse(raw) as { work_type?: string }
      const allowed: CaptureType[] = [
        'idea',
        'research',
        'experiment',
        'discussion',
        'draft',
        'other',
      ]
      return allowed.includes(parsed.work_type as CaptureType)
        ? (parsed.work_type as CaptureType)
        : null
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

function cacheKey(title: string, content: string): string {
  return crypto.createHash('sha1').update(`${title}\u0000${content}`).digest('hex')
}

async function cacheGet(key: string): Promise<CaptureType | null> {
  const raw = await readText(path.join(metaDir(), 'ai_cache', `${key}.json`))
  if (!raw) return null
  try {
    const v = (JSON.parse(raw) as { work_type: CaptureType }).work_type
    return v ?? null
  } catch {
    return null
  }
}

async function cachePut(key: string, workType: CaptureType) {
  await ensureDir(path.join(metaDir(), 'ai_cache'))
  await atomicWrite(
    path.join(metaDir(), 'ai_cache', `${key}.json`),
    JSON.stringify({ work_type: workType, cached_at: new Date().toISOString() })
  )
}

const provider: AIProvider = new OpenAICompatProvider()

/*
 * Historian 요약(§57): 사실 집합(facts) → 자연어 내러티브.
 * 원가 우선: facts가 비어있거나 AI 미설정이면 rule 문장 템플릿.
 */
export async function summarizeHistory(
  facts: string[],
  fallback: string
): Promise<{ summary: string; source: 'ai' | 'rule' }> {
  if (provider.available() && facts.length && provider.genericChat) {
    const out = await provider.genericChat(
      '너는 Product OS의 Historian이다. 주어진 사실 목록에서 사용자에게 보여줄 짧은 한국어 변화를 요약하라 (3문장 이내, 마크다운 금지).',
      facts.join('\n')
    )
    if (out && out.length > 8) return { summary: out.trim(), source: 'ai' }
  }
  return { summary: fallback, source: 'rule' }
}

/*
 * Ask(§18/§64): 질문 → AI가 조회 플랜 JSON 으로 변환 (rule 파서 실패 시에만 사용).
 */
export async function askPlan(
  question: string
): Promise<{ intent: string; keyword: string; product: string | null } | null> {
  if (!provider.available() || !provider.genericChat) return null
  const out = await provider.genericChat(
    'Return ONLY JSON {"intent":"decision|changes|blockers|version|artifacts|drift|timeline","keyword":"주제 키워드(없으면 empty)","product":"product slug or empty"} for the user question about their products.',
    question
  )
  if (!out) return null
  try {
    const j = JSON.parse(out) as { intent?: string; keyword?: string; product?: string }
    return {
      intent: j.intent ?? 'changes',
      keyword: (j.keyword ?? '').trim(),
      product: (j.product ?? '').trim() || null,
    }
  } catch {
    return null
  }
}

/**
 * 원가 우선순위 파이프라인: rule(high) → cache → AI → idea fallback.
 */
export async function classifyCapture(title: string, content = ''): Promise<ClassifyResult> {
  const rule = ruleClassify(title, content)
  if (rule) return rule

  const key = cacheKey(title, content)
  const cached = await cacheGet(key)
  if (cached) return { work_type: cached, source: 'cache', confidence: 'high' }

  if (provider.available()) {
    const ai = await provider.classifyCapture(title, content)
    if (ai) {
      await cachePut(key, ai)
      return { work_type: ai, source: 'ai', confidence: 'low' }
    }
  }
  return { work_type: 'idea', source: 'rule', confidence: 'low' }
}

export function aiStatus() {
  return {
    pipeline: ['rule', 'cache', 'openai-compat?'],
    provider: provider.available() ? provider.name : 'none (rule-based only)',
    model: provider.available() ? (process.env.XITA_AI_MODEL ?? 'gpt-4o-mini') : null,
  }
}
