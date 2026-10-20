import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { workspaceRoot } from '#v4/workspace'
import { atomicWrite } from '#v4/fs_util'
import { aiChat, extractJson } from '#v4/ai_router'
import { MarkdownStore } from '#v4/markdown_store'
import { HttpError, PortfolioService } from '#portfolio/service'
import { loadRevenueHistory } from '#portfolio/revenue'

/*
 * 홍보글 관리.
 *
 * 정책:
 *   - 자동 게시는 하지 않는다 (커뮤니티 규칙 위반·계정 정지 위험). 초안 작성 → 사람이 복사해 올림 → 링크·반응 기록.
 *   - 커뮤니티 목록은 사용자가 고칠 수 있다(<workspace>/promo/communities.json). 규칙 메모는 사람이 확인해 적는다 —
 *     XITA 가 커뮤니티 규칙을 지어내지 않는다.
 *   - AI 초안은 작업 'promo' 체인 (외부 무료 모델 허용 — 공개될 글이라 민감하지 않음).
 *   - 효과: 게시일 전 7일 vs 후 7일 애드몹 수익·노출 (저장된 기록). 설치 수는 Play 리포트 연동 전이라 없음.
 *   - 저장: <workspace>/promo/posts.json (사용자 데이터).
 */

export type PromoStatus = 'draft' | 'scheduled' | 'posted' | 'archived'

export interface PromoPost {
  id: string
  project: string
  community: string
  lang: 'ko' | 'en'
  title: string
  body: string
  status: PromoStatus
  scheduled_for: string | null
  posted_at: string | null
  url: string | null
  metrics: { views?: number; likes?: number; comments?: number; note?: string }
  ai_source: string | null
  created_at: string
  updated_at: string
}

export interface Community {
  id: string
  name: string
  url: string
  lang: 'ko' | 'en'
  tone: string
  rules: string
}

/** 기본 목록 — 이름·주소·글 성격만. 규칙은 사람이 확인해 rules 에 적는다 */
export const DEFAULT_COMMUNITIES: Community[] = [
  {
    id: 'geeknews',
    name: 'GeekNews (Show GN)',
    url: 'https://news.hada.io',
    lang: 'ko',
    tone: '개발자 대상, 만든 이유·기술 선택을 담백하게',
    rules: '',
  },
  {
    id: 'clien',
    name: '클리앙',
    url: 'https://www.clien.net',
    lang: 'ko',
    tone: '일반 사용자, 실사용 이점 위주',
    rules: '',
  },
  {
    id: 'ppomppu',
    name: '뽐뿌',
    url: 'https://www.ppomppu.co.kr',
    lang: 'ko',
    tone: '무료·혜택 강조, 짧게',
    rules: '',
  },
  {
    id: 'dcinside',
    name: '디시인사이드 (앱 관련 갤러리)',
    url: 'https://gall.dcinside.com',
    lang: 'ko',
    tone: '가볍고 짧게, 과장 금지',
    rules: '',
  },
  {
    id: 'naver-cafe',
    name: '네이버 카페 (주제별)',
    url: 'https://section.cafe.naver.com',
    lang: 'ko',
    tone: '카페 주제에 맞춘 사용 후기형',
    rules: '',
  },
  {
    id: 'threads',
    name: 'Threads',
    url: 'https://www.threads.net',
    lang: 'ko',
    tone: '개인 개발 일지 톤, 짧은 문단',
    rules: '',
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    url: 'https://x.com',
    lang: 'ko',
    tone: '280자 이내, 링크 1개',
    rules: '',
  },
  {
    id: 'reddit-androidapps',
    name: 'Reddit r/androidapps',
    url: 'https://www.reddit.com/r/androidapps',
    lang: 'en',
    tone: 'Developer post, honest, no hype',
    rules: '',
  },
  {
    id: 'producthunt',
    name: 'Product Hunt',
    url: 'https://www.producthunt.com',
    lang: 'en',
    tone: 'Tagline + maker comment',
    rules: '',
  },
]

const dir = () => path.join(workspaceRoot(), 'promo')
const postsPath = () => path.join(dir(), 'posts.json')
const communitiesPath = () => path.join(dir(), 'communities.json')

function readJson<T>(p: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function loadPosts(): PromoPost[] {
  return readJson<PromoPost[]>(postsPath(), [])
}

async function savePosts(posts: PromoPost[]) {
  fs.mkdirSync(dir(), { recursive: true })
  await atomicWrite(postsPath(), JSON.stringify(posts, null, 2) + '\n')
}

export function loadCommunities(): Community[] {
  return readJson<Community[]>(communitiesPath(), DEFAULT_COMMUNITIES)
}

export async function saveCommunities(list: Community[]) {
  const clean = list
    .filter((c) => c && String(c.name ?? '').trim())
    .map((c) => ({
      id: String(c.id || '').trim() || crypto.randomBytes(3).toString('hex'),
      name: String(c.name).trim(),
      url: String(c.url ?? '').trim(),
      lang: c.lang === 'en' ? ('en' as const) : ('ko' as const),
      tone: String(c.tone ?? '').trim(),
      rules: String(c.rules ?? '').trim(),
    }))
  fs.mkdirSync(dir(), { recursive: true })
  await atomicWrite(communitiesPath(), JSON.stringify(clean, null, 2) + '\n')
  return clean
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 게시일 전 7일 / 후 7일 (게시일 포함) 수익·노출 — 해당 프로젝트 앱 ID 기준 */
export function promoEffect(post: PromoPost, appId: string | null) {
  if (!post.posted_at || !appId) return null
  const h = loadRevenueHistory()
  const t0 = Date.parse(post.posted_at)
  const win = (from: number, to: number) => {
    let e = 0
    let i = 0
    let days = 0
    for (let k = from; k < to; k++) {
      const day = h.days[ymd(new Date(t0 + k * 86400_000))]
      if (!day) continue
      days++
      e += day[appId]?.e ?? 0
      i += day[appId]?.i ?? 0
    }
    return { earnings: e, impressions: i, days }
  }
  return { before: win(-7, 0), after: win(0, 7) }
}

export async function listPosts(project?: string) {
  const posts = loadPosts()
    .filter((p) => !project || p.project === project)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
  const cards = posts.length ? await new PortfolioService().listCards(true) : []
  const appId = new Map(cards.map((c) => [c.id, c.adIds?.appId || null]))
  return posts.map((p) => ({ ...p, effect: promoEffect(p, appId.get(p.project) ?? null) }))
}

function normalize(input: Partial<PromoPost>, base?: PromoPost): PromoPost {
  const now = new Date().toISOString()
  const status = (['draft', 'scheduled', 'posted', 'archived'] as const).includes(
    input.status as PromoStatus
  )
    ? (input.status as PromoStatus)
    : (base?.status ?? 'draft')
  const merged: PromoPost = {
    id: base?.id ?? `promo-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`,
    project: String(input.project ?? base?.project ?? ''),
    community: String(input.community ?? base?.community ?? ''),
    lang: (input.lang ?? base?.lang) === 'en' ? 'en' : 'ko',
    title: String(input.title ?? base?.title ?? '').trim(),
    body: String(input.body ?? base?.body ?? ''),
    status,
    scheduled_for:
      input.scheduled_for !== undefined
        ? input.scheduled_for || null
        : (base?.scheduled_for ?? null),
    posted_at: input.posted_at !== undefined ? input.posted_at || null : (base?.posted_at ?? null),
    url: input.url !== undefined ? String(input.url || '').trim() || null : (base?.url ?? null),
    metrics: { ...(base?.metrics ?? {}), ...(input.metrics ?? {}) },
    ai_source: input.ai_source ?? base?.ai_source ?? null,
    created_at: base?.created_at ?? now,
    updated_at: now,
  }
  // 게시함으로 바꾸면서 시각이 없으면 지금
  if (merged.status === 'posted' && !merged.posted_at) merged.posted_at = now
  if (merged.url && !/^https?:\/\//.test(merged.url))
    throw new HttpError(400, '링크는 http(s):// 로 시작해야 합니다')
  if (!merged.project) throw new HttpError(400, '프로젝트가 필요합니다')
  return merged
}

export async function createPost(input: Partial<PromoPost>) {
  await new PortfolioService().requireProject(String(input.project ?? ''))
  const post = normalize(input)
  const posts = loadPosts()
  posts.push(post)
  await savePosts(posts)
  return post
}

export async function updatePost(id: string, input: Partial<PromoPost>) {
  const posts = loadPosts()
  const i = posts.findIndex((p) => p.id === id)
  if (i < 0) throw new HttpError(404, '홍보글을 찾을 수 없습니다')
  posts[i] = normalize({ ...input, project: posts[i].project }, posts[i])
  await savePosts(posts)
  return posts[i]
}

export async function removePost(id: string) {
  const posts = loadPosts()
  const next = posts.filter((p) => p.id !== id)
  if (next.length === posts.length) throw new HttpError(404, '홍보글을 찾을 수 없습니다')
  await savePosts(next)
}

const PROMO_SYSTEM = `너는 1인 앱 개발자의 홍보 카피라이터다. 주어진 앱 정보로 특정 커뮤니티에 올릴 글 초안을 쓴다.
규칙:
- 커뮤니티 성격(tone)과 사용자가 적어 둔 규칙(rules)을 지킨다. 규칙이 비어 있으면 "자기 홍보 허용 여부·게시판 규칙 확인 필요"를 notes 에 쓴다.
- 과장·허위·확인 안 된 수치 금지. 앱 정보에 없는 기능을 지어내지 않는다.
- 광고 티를 줄이고, 만든 이유·문제·써 보면 좋은 점·피드백 요청 순서로 자연스럽게.
- 링크는 스토어 링크가 있으면 본문 끝에 한 번만.
- lang 이 en 이면 영어, ko 면 한국어.
출력은 JSON 하나: {"title":"","body":"","notes":"게시 전 확인할 점"}`

export async function draftPost(input: {
  project: string
  community: string
  lang?: 'ko' | 'en'
  angle?: string
}) {
  const svc = new PortfolioService()
  const doc = await svc.requireProject(input.project)
  const cards = await svc.listCards(true)
  const card = cards.find((c) => c.id === doc.id)
  const comm = loadCommunities().find((c) => c.id === input.community || c.name === input.community)
  if (!comm) throw new HttpError(400, '커뮤니티를 고르세요 (홍보 → 커뮤니티 목록)')
  const lang = input.lang ?? comm.lang
  // 기획서가 있으면 같이 (기획 위저드 확정본)
  const plan = await new MarkdownStore('artifact').read(`${doc.id}-plan`)
  const app = {
    name: card?.name ?? doc.meta.name,
    description: card?.desc || null,
    package: card?.package ?? null,
    store_url: card?.package
      ? `https://play.google.com/store/apps/details?id=${card.package}`
      : null,
    monetization: card?.monetization ?? null,
    version: card?.versionName ?? null,
    plan: plan ? plan.body.slice(0, 4000) : null,
  }
  const out = await aiChat({
    task: 'promo',
    json: true,
    temperature: 0.7,
    messages: [
      { role: 'system', content: PROMO_SYSTEM },
      {
        role: 'user',
        content: JSON.stringify({
          app,
          community: { name: comm.name, tone: comm.tone, rules: comm.rules || null },
          lang,
          angle: input.angle || null,
        }),
      },
    ],
  })
  const j = out ? extractJson<{ title?: string; body?: string; notes?: string }>(out.text) : null
  if (!out || !j?.body) throw new HttpError(502, 'AI 초안을 만들지 못했습니다 (AI 설정·연결 확인)')
  const body = j.notes?.trim()
    ? `${j.body.trim()}\n\n<!-- 게시 전 확인: ${j.notes.trim()} -->`
    : j.body.trim()
  return createPost({
    project: doc.id,
    community: comm.name,
    lang,
    title: String(j.title ?? '').trim(),
    body,
    status: 'draft',
    ai_source: `${out.provider}/${out.model}`,
  })
}
