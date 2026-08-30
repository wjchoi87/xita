import YAML from 'yaml'

/*
 * Markdown + YAML Frontmatter 문서 처리 (v0.4 §3).
 * body 는 Human-readable Markdown, frontmatter 는 machine-readable metadata
 * (id/type/revision/relations 최소화). UI 는 이 계층을 직접 호출하지 않고
 * Store 를 통한다 (v0.4 §4, §18-S3).
 */

export interface Doc {
  /** frontmatter 속성 (snake_case 유지) */
  meta: Record<string, unknown>
  /** `---` 아래 본문 */
  body: string
}

const SEP = '---'

export function parseDoc(raw: string): Doc {
  const trimmed = raw.startsWith('\uFEFF') ? raw.slice(1) : raw
  if (!trimmed.startsWith(SEP)) {
    return { meta: {}, body: trimmed }
  }
  const nl = trimmed.indexOf('\n')
  if (nl === -1) return { meta: {}, body: trimmed }
  const endMarker = trimmed.slice(nl + 1).indexOf(`\n${SEP}`)
  if (endMarker === -1) {
    // frontmatter 종료 마커가 없으면 본문으로 취급
    return { meta: {}, body: trimmed }
  }
  const yamlText = trimmed.slice(nl + 1, nl + 1 + endMarker).trim()
  const bodyStart = nl + 1 + endMarker + `\n${SEP}`.length
  const body = trimmed.slice(bodyStart).replace(/^\n+/, '')
  let meta: Record<string, unknown> = {}
  try {
    const parsed = YAML.parse(yamlText)
    if (parsed && typeof parsed === 'object') meta = parsed as Record<string, unknown>
  } catch {
    meta = {}
  }
  return { meta, body }
}

export function serializeDoc(meta: Record<string, unknown>, body: string): string {
  const yamlText = YAML.stringify(meta, { lineWidth: 0, indent: 2 }).trimEnd()
  return `${SEP}\n${yamlText}\n${SEP}\n\n${body.trim()}\n`
}

export function getStr(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key]
  return typeof v === 'string' && v.length ? v : null
}

export function getNum(meta: Record<string, unknown>, key: string): number | null {
  const v = meta[key]
  return typeof v === 'number' ? v : typeof v === 'string' && /\d+/.test(v) ? Number(v) : null
}
