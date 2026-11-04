import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

/*
 * CLI 첨부 헬퍼 — 다른 에이전트 CLI(Claude Code [Image #1], Codex [Pasted text #1 +N lines]) 처럼
 * 입력창에는 플레이스홀더만 남기고 원본은 첨부로 서버에 보내는 UX 의 로직 부분.
 *
 * 변경 전 정책: xita CLI 는 readline 문자열 입력만 받았다 — 장문 붙여넣기·파일·이미지 전달 불가.
 * 변경 후 정책: 이 모듈이 (1) 장문 붙여넣기 판정, (2) @파일 토큰 → 첨부 변환, (3) 클립보드 이미지
 *   추출(osascript/xclip), (4) 브래킷 paste 시퀀스 분리 를 담당한다. xita.mjs 의 입력 에디터가 호출한다.
 * 변경 이유: 기획 위저드 등 CLI 대화에서 스크린샷·문서·장문 텍스트를 그대로 AI 에게 넘기기 위해.
 * 영향 범위: apps/cli/xita.mjs 입력 경로. 서버는 POST /v4/plans*, attachments 로 수신(무의존 유지).
 */

const execFileP = promisify(execFile)

export const PASTE_ATTACH_MIN_LINES = 3
export const PASTE_ATTACH_MIN_CHARS = 300
export const MAX_TEXT_CHARS = 200_000
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
}

/** 붙여넣은 텍스트가 첨부로 빠져야 하는지 (줄 수 또는 길이 기준) */
export function shouldAttachPaste(text) {
  const lines = text.split('\n').length
  const chars = [...text].length
  return { attach: lines >= PASTE_ATTACH_MIN_LINES || chars >= PASTE_ATTACH_MIN_CHARS, lines, chars }
}

/** macOS osascript 의 `«data PNGf<hex>»` 출력을 PNG Buffer 로 */
export function decodeOsascriptHex(out) {
  const m = /^«data PNGf([0-9A-Fa-f\s]+)»\s*$/.exec(String(out).trim())
  if (!m) return null
  const hex = m[1].replace(/\s+/g, '')
  if (!hex || hex.length % 2) return null
  const buf = Buffer.from(hex, 'hex')
  // PNG 매직 넘버 확인 — 실수로 다른 클립보드 타입이 들어오는 것 방지
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 ? buf : null
}

/**
 * 클립보드에 이미지가 있으면 { mime, dataUrl, bytes }, 없으면 null, 알 수 없으면 { error }.
 *   macOS  — osascript 로 PNGf 를 hex 로 받아 디코드
 *   Linux  — xclip -selection clipboard -t image/png -o (바이너리)
 *   Windows— 미지원 (null + reason)
 */
export async function readClipboardImage() {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execFileP('osascript', ['-e', 'the clipboard as «class PNGf»'], {
        timeout: 5_000,
        maxBuffer: 32 * 1024 * 1024,
      })
      const buf = decodeOsascriptHex(stdout)
      if (!buf) return null
      if (buf.length > MAX_IMAGE_BYTES) return { error: '이미지가 너무 큽니다 (4MB 까지)' }
      return { mime: 'image/png', dataUrl: `data:image/png;base64,${buf.toString('base64')}`, bytes: buf.length }
    }
    if (process.platform === 'linux') {
      const { stdout } = await execFileP(
        'xclip',
        ['-selection', 'clipboard', '-t', 'image/png', '-o'],
        { timeout: 5_000, maxBuffer: 32 * 1024 * 1024, encoding: 'buffer' }
      )
      const buf = Buffer.from(stdout)
      if (!buf.length) return null
      if (buf.length > MAX_IMAGE_BYTES) return { error: '이미지가 너무 큽니다 (4MB 까지)' }
      return { mime: 'image/png', dataUrl: `data:image/png;base64,${buf.toString('base64')}`, bytes: buf.length }
    }
    return { error: `이 플랫폼(${process.platform})의 클립보드 이미지는 아직 못 읽어요` }
  } catch {
    // 클립보드에 이미지가 없으면 osascript/xclip 이 실패한다 — 정상 상황
    return null
  }
}

/** `@경로` 토큰을 [File: 이름] 플레이스홀더로 바꾸고 파일을 첨부로 만든다 */
export async function resolveFileTokens(text, cwd = process.cwd()) {
  const attachments = []
  const notes = []
  let out = text
  const seen = [...text.matchAll(/(^|\s)@([^\s@]+)/g)]
  for (const m of seen.reverse()) {
    const [whole, lead, raw] = m
    const p = raw.startsWith('~') ? path.join(os.homedir(), raw.slice(1)) : path.resolve(cwd, raw)
    let att = null
    try {
      const st = await fs.stat(p)
      if (st.isDirectory()) {
        notes.push(`@${raw} 는 폴더예요 — 파일을 지정해 주세요`)
      } else if (st.size > MAX_IMAGE_BYTES + 1024) {
        // 이미지든 텍스트든 원시 크기 상한 — 거대 파일을 통째로 메모리로 읽지 않는다
        notes.push(`@${raw} 가 너무 커요 (4MB 까지)`)
      } else {
        const mime = IMAGE_MIME[path.extname(p).toLowerCase()]
        if (mime) {
          const buf = await fs.readFile(p)
          if (buf.length > MAX_IMAGE_BYTES) notes.push(`@${raw} 가 너무 커요 (4MB 까지)`)
          else att = { kind: 'image', name: path.basename(p), dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
        } else {
          const content = (await fs.readFile(p, 'utf8')).slice(0, MAX_TEXT_CHARS)
          if (!content.trim()) notes.push(`@${raw} 가 빈 파일이에요`)
          else att = { kind: 'text', name: path.basename(p), content }
        }
      }
    } catch {
      notes.push(`@${raw} 를 못 찾았어요`)
    }
    if (att) attachments.unshift(att)
    out = out.replace(whole, `${lead}[File: ${path.basename(p)}]`)
  }
  return { text: out, attachments, notes }
}

/*
 * 브래킷 paste 분리기 — 터미널이 붙여넣을 때 \x1b[200~ ... \x1b[201~ 로 감싸 보낸다.
 * feed(chunk) 를 부르면 일반 입력은 .chars 에, 붙여넣기 덩어리는 .pastes 에 순서대로 쌓인다.
 * 이스케이프 시퀀스가 청크 경계에서 잘리는 경우도 마지막 \x1b 부터는 다음 청크까지 버퍼에 둔다.
 * 하나의 paste(200~..201~)가 여러 data 청크에 나뉘어 오면 한 덩어리로 합쳐 push 한다.
 */
export class PasteSplitter {
  chars = ''
  pastes = []
  #inPaste = false
  #buf = ''
  #acc = ''

  feed(chunk) {
    this.#buf += chunk
    for (;;) {
      if (this.#inPaste) {
        const end = this.#buf.indexOf('\x1b[201~')
        if (end < 0) {
          const hold = this.#escHoldLen()
          const take = this.#buf.length - hold
          if (take > 0) {
            this.#acc += this.#buf.slice(0, take)
            this.#buf = this.#buf.slice(take)
          }
          return
        }
        this.#acc += this.#buf.slice(0, end)
        this.pastes.push(this.#acc)
        this.#acc = ''
        this.#buf = this.#buf.slice(end + 6)
        this.#inPaste = false
        continue
      }
      const start = this.#buf.indexOf('\x1b[200~')
      if (start < 0) {
        this.#flushNormal()
        return
      }
      const before = this.#buf.slice(0, start)
      if (before) this.chars += before
      this.#buf = this.#buf.slice(start + 6)
      this.#inPaste = true
    }
  }

  /** 버퍼 끝이 잘린 이스케이프(\x1b…≤6자)면 그 길이, 아니면 0 */
  #escHoldLen() {
    const i = this.#buf.lastIndexOf('\x1b')
    return i >= 0 && this.#buf.length - i <= 6 ? this.#buf.length - i : 0
  }

  /** ESC 밖 일반 입력 정리 — 단독 ESC/완성된 타 CSI 는 chars 로 흘리고 잘린 건 남긴다 */
  #flushNormal() {
    for (;;) {
      if (!this.#buf) return
      const i = this.#buf.indexOf('\x1b')
      if (i < 0) {
        this.chars += this.#buf
        this.#buf = ''
        return
      }
      if (i > 0) {
        this.chars += this.#buf.slice(0, i)
        this.#buf = this.#buf.slice(i)
      }
      if (this.#buf.length === 1) return // 다음 청크 대기
      if (this.#buf[1] !== '[') {
        this.chars += '\x1b' // 단독 ESC(Alt 조합 등) — 일반 입력으로
        this.#buf = this.#buf.slice(1)
        continue
      }
      const m = /^\x1b\[[0-9;:?]*[\x40-\x7e]/.exec(this.#buf)
      if (m) {
        this.chars += m[0]
        this.#buf = this.#buf.slice(m[0].length)
        continue
      }
      if (this.#buf.length > 16) this.#buf = '' // 비정상 — 버림
      return
    }
  }
}
