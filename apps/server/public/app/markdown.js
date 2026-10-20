/*
 * 작은 안전 markdown 렌더러.
 * 원칙: 원문 전체를 먼저 HTML escape 한 뒤 markdown 문법만 태그로 바꾼다 → 원문의 HTML 은 절대 실행되지 않는다.
 * 지원: 제목, 문단, 목록(중첩·체크박스), 인용, 코드 블록/인라인, 표, 굵게/기울임/취소선, 링크, 구분선.
 */
import { esc } from './lib.js'

// 링크는 http(s)/mailto/앵커/상대경로만 허용 (javascript: 등 차단)
function safeHref(escapedUrl) {
  const u = escapedUrl.trim()
  if (/^(https?:|mailto:|#|\/|\.\.?\/)/i.test(u)) return u
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) return u
  return null
}

function inline(text) {
  // 1) 인라인 코드는 자리표시자로 보호
  const codes = []
  let s = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${c}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  // 2) 링크 [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (m, label, url) => {
    const href = safeHref(url)
    if (!href) return label
    const ext = /^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a href="${href}"${ext}>${label}</a>`
  })
  // 3) 강조
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>')
  // 4) 코드 복원
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)])
}

const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)
const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

function renderList(lines, start) {
  // 들여쓰기 기준 중첩 목록. 반환: [html, 다음 인덱스]
  const baseIndent = lines[start].match(LIST_RE)[1].length
  const ordered = /\d/.test(lines[start].match(LIST_RE)[2])
  let out = ordered ? '<ol>' : '<ul>'
  let i = start
  while (i < lines.length) {
    const m = lines[i].match(LIST_RE)
    if (!m) {
      // 목록 항목의 이어지는 줄
      if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && out.endsWith('</li>')) {
        out = out.slice(0, -5) + ' ' + inline(lines[i].trim()) + '</li>'
        i++
        continue
      }
      break
    }
    const indent = m[1].length
    if (indent < baseIndent) break
    if (indent > baseIndent) {
      const [sub, next] = renderList(lines, i)
      out = out.endsWith('</li>') ? out.slice(0, -5) + sub + '</li>' : out + sub
      i = next
      continue
    }
    let body = m[3]
    let cls = ''
    const task = body.match(/^\[( |x|X)\]\s+(.*)$/)
    if (task) {
      const done = task[1] !== ' '
      body = `<span class="md-check${done ? ' done' : ''}" aria-hidden="true">${done ? '✓' : ''}</span>${inline(task[2])}`
      cls = ' class="md-task"'
    } else {
      body = inline(body)
    }
    out += `<li${cls}>${body}</li>`
    i++
  }
  return [out + (ordered ? '</ol>' : '</ul>'), i]
}

export function renderMarkdown(src) {
  const lines = esc(String(src ?? '').replace(/\r\n?/g, '\n')).split('\n')
  let out = ''
  let i = 0
  let para = []
  const flush = () => {
    if (para.length) out += `<p>${inline(para.join(' '))}</p>`
    para = []
  }

  while (i < lines.length) {
    const line = lines[i]

    // 코드 블록
    const fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)/)
    if (fence) {
      flush()
      const buf = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) buf.push(lines[i++])
      i++
      out += `<pre class="md-code"><code>${buf.join('\n')}</code></pre>`
      continue
    }
    if (!line.trim()) { flush(); i++; continue }

    // 제목
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (h) {
      flush()
      const lv = h[1].length
      out += `<h${lv}>${inline(h[2])}</h${lv}>`
      i++
      continue
    }
    // 구분선
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out += '<hr>'; i++; continue }

    // 인용 (escape 후라 '>' 는 &gt;)
    if (/^\s*&gt;/.test(line)) {
      flush()
      const buf = []
      while (i < lines.length && /^\s*&gt;/.test(lines[i])) buf.push(lines[i++].replace(/^\s*&gt;\s?/, ''))
      out += `<blockquote>${inline(buf.join(' '))}</blockquote>`
      continue
    }
    // 표
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush()
      const head = splitRow(line)
      i += 2
      const rows = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]))
      out += '<div class="md-table"><table><thead><tr>'
        + head.map((c) => `<th>${inline(c)}</th>`).join('')
        + '</tr></thead><tbody>'
        + rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`).join('')
        + '</tbody></table></div>'
      continue
    }
    // 목록
    if (LIST_RE.test(line)) {
      flush()
      const [list, next] = renderList(lines, i)
      out += list
      i = next
      continue
    }
    para.push(line.trim())
    i++
  }
  flush()
  return out
}
