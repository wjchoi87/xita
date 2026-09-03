#!/usr/bin/env node
/*
 * xita-mcp — XITA MCP server (stdio, JSON-RPC 2.0, 무의존)
 *
 * 변경 전 정책: handoff는 사람이 파일을 복사해 에이전트에 붙여넣는 수동 루프
 * 변경 후 정책: 에이전트(Claude Code/Cursor/Codex 등 MCP 클라이언트)가 XITA를
 *   '도구'로 직접 질의/실행 — search/ask/context/handoff는 읽기,
 *   agent_update/insight_add는 쓰기. Productboard Spark의 "no copy-pasting,
 *   no lost handoff"(2026-06 GA)에 대한 local-first 대응.
 * 변경 이유: 경쟁 리서치 run 20260830 — MCP 인게스트가 CONSIDER 1순위였고,
 *   상용화가 이미 진행 중. 정본이 파일인 우리만 낼 수 있는 로컬 MCP(서버 불요,
 *   XITA가 곧 제품 컨텍스트 레이어)가 방어 자산.
 * 영향 범위: REST 서버(기본 http://localhost:3333)가 떠 있어야 동작.
 *   프로토콜: MCP 2024-11-05의 initialize/tools.list/tools.call 최소 서브셋.
 * 설정 예 (claude_desktop_config.json / .cursor/mcp.json):
 *   { "mcpServers": { "xita": { "command": "node",
 *       "args": ["apps/cli/xita-mcp.mjs"],
 *       "env": { "XITA_HOST": "http://localhost:3333" } } } }
 */

const HOST = (process.env.XITA_HOST || 'http://localhost:3333').replace(/\/$/, '')
const TOKEN = process.env.XITA_DEVICE_TOKEN || ''

async function api(path, body) {
  const res = await fetch(`${HOST}/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(TOKEN ? { 'x-device-token': TOKEN } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${(await res.text()).slice(0, 160)}`)
  const j = await res.json()
  return j.data ?? j
}

const TOOLS = [
  {
    name: 'xita_status',
    description: 'XITA 워크스페이스 개요: 제품 목록·현재 버전·Needs You 수. 세션 시작 시 먼저 호출할 것.',
    inputSchema: { type: 'object', properties: {} },
    run: async () => {
      const [st, products] = await Promise.all([api('/v4/status'), api('/v4/products')])
      const rows = products.map((p) => `- ${p.meta?.name ?? p.id} [${p.meta?.production_status ?? p.meta?.status ?? '-'}] v${p.meta?.version ?? '-'} goal: ${p.meta?.current_goal ?? '-'}`)
      return `workspace_rev=${st.workspace_revision} needsYou=${st.needsYouCount}\n${rows.join('\n')}`
    },
  },
  {
    name: 'xita_needs_you',
    description: '사람이 결정해야 하는 항목 목록(방향/리뷰/차단/에이전트 대기). 에이전트가 임의 결정하면 안 되는 지점.',
    inputSchema: { type: 'object', properties: { product: { type: 'string' } } },
    run: async (a) => {
      const items = await api(`/v4/needs-you${a.product ? `?product=${encodeURIComponent(a.product)}` : ''}`)
      if (!items.length) return '결정 대기 없음'
      return items.map((i) => `- [${i.type}/${i.priority}] ${i.title} — ${i.summary ?? ''} (ref:${i.ref.kind}/${i.ref.id})`).join('\n')
    },
  },
  {
    name: 'xita_ask',
    description: '제품 컨텍스트에 자연어 질문(왜/블로커/버전/문서/오래된 컨텍스트/관찰). 근거 문서 목록이 함께 반환된다.',
    inputSchema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
    run: async (a) => {
      const d = await api(`/v4/ask?q=${encodeURIComponent(a.question)}`)
      const src = (d.sources ?? []).map((s) => `  · ${s.kind}:${s.id} ${s.title ?? ''}`).join('\n')
      return `[intent=${d.intent}]\n${d.answer}\n-- 근거 --\n${src || '(없음)'}`
    },
  },
  {
    name: 'xita_search',
    description: '정본 문서전체문서 검색. 키워드 1~3개면 충분.',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    run: async (a) => {
      const rows = await api(`/v4/search?q=${encodeURIComponent(a.q)}`)
      return (rows.length ? rows : []).map((r) => `- ${r.type ?? r.meta?.type ?? '?'}:${r.id} ${r.name ?? r.title ?? ''}`).join('\n') || '결과 없음'
    },
  },
  {
    name: 'xita_handoff',
    description: '특정 Change의 Agent Handoff 전문(Mission Card + 컨텍스트 번들). 작업 착수 전 반드시 이것을 읽어라.',
    inputSchema: { type: 'object', properties: { product: { type: 'string' }, change: { type: 'string' } }, required: ['product', 'change'] },
    run: async (a) => {
      const d = await api(`/v4/products/${encodeURIComponent(a.product)}/handoff/${encodeURIComponent(a.change)}`)
      return d.markdown ?? JSON.stringify(d)
    },
  },
  {
    name: 'xita_context',
    description: '제품 현재 상태 투영: 활성 할 일/최근 결정/오래된(drift) 컨텍스트.',
    inputSchema: { type: 'object', properties: { product: { type: 'string' } }, required: ['product'] },
    run: async (a) => {
      const [state, drift] = await Promise.all([
        api(`/v4/products/${encodeURIComponent(a.product)}/state`),
        api(`/v4/context/drift?product=${encodeURIComponent(a.product)}`).catch(() => []),
      ])
      return `${JSON.stringify(state, null, 1)}\n-- drift --\n${JSON.stringify(drift, null, 1)}`
    },
  },
  {
    name: 'xita_agent_update',
    description: '위임(dispatch) 진행 상태 보고: WORKING / AWAITING_INPUT(사람 질문 발생) / RESULT_READY(리뷰 대기) / MERGED / FAILED. 노트 1줄 권장.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' } },
      required: ['id', 'status'],
    },
    run: async (a) => {
      const d = await api(`/v4/dispatches/${encodeURIComponent(a.id)}/update`, { status: a.status, note: a.note })
      return `updated ${d?.id ?? a.id} → ${a.status}`
    },
  },
  {
    name: 'xita_insight_add',
    description: '작업 중 발견한 관찰/가설을 제품 지식으로 기록 (AI가 나중에 근거로 쓰는 층). 코드에서 얻은 사실·측정값일수록 좋다.',
    inputSchema: {
      type: 'object',
      properties: {
        product: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' },
        kind: { type: 'string', description: 'OBSERVATION|DERIVED|ASSUMPTION|OPPORTUNITY' },
      },
      required: ['product', 'title', 'content'],
    },
    run: async (a) => {
      const d = await api('/v4/insights', { product: a.product, title: a.title, content: a.content, kind: a.kind ?? 'OBSERVATION', source: 'agent' })
      return `insight recorded: ${d?.id}`
    },
  },
]

/* ---- stdio JSON-RPC (MCP 프레이밍) ---------------------------------------- */
let buf = ''
const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n')

process.stdin.on('data', (chunk) => {
  buf += chunk.toString('utf8')
  let idx
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim()
    buf = buf.slice(idx + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    handle(msg).catch((e) => send({ id: msg.id ?? null, error: { code: -32603, message: String(e.message ?? e) } }))
  }
})

async function handle(msg) {
  const { id, method, params } = msg
  switch (method) {
    case 'initialize':
      return send({
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'xita', version: '0.1.0' },
          instructions: 'XITA is the local-first product OS. Start with xita_status, then xita_handoff for a change before working on it; report progress with xita_agent_update.',
        },
      })
    case 'notifications/initialized':
      return // notification, no reply
    case 'tools/list':
      return send({ id, result: { tools: TOOLS.map(({ run, ...t }) => t) } })
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params?.name)
      if (!tool) return send({ id, error: { code: -32602, message: `unknown tool: ${params?.name}` } })
      try {
        const text = await tool.run(params?.arguments ?? {})
        return send({ id, result: { content: [{ type: 'text', text }], isError: false } })
      } catch (e) {
        return send({ id, result: { content: [{ type: 'text', text: `xita error: ${e.message}` }], isError: true } })
      }
    }
    case 'ping':
      return send({ id, result: {} })
    default:
      if (id !== undefined) return send({ id, error: { code: -32601, message: `method not found: ${method}` } })
  }
}

process.stderr.write(`xita-mcp ready → ${HOST} (stdio)\n`)
