import { fetch as expoFetch } from 'expo/fetch'

/**
 * 스트리밍 UTF-8 디코더 (다중바이트 잘림 방지용 최소 구현 — Hermes/Expo Go 에
 * TextDecoder 가 없다는 전제. SSE payload 는 UTF-8/ASCII 혼용).
 */
class Utf8StreamDecoder {
  private pending: number[] = []
  decode(bytes: Uint8Array): string {
    let out = ''
    let i = 0
    const pend = this.pending
    // 이어오던 시퀀스 완성
    while (pend.length && i < bytes.length && (bytes[i] & 0xc0) === 0x80) {
      pend.push(bytes[i++])
      const need = pend[0] >= 0xf0 ? 4 : pend[0] >= 0xe0 ? 3 : 2
      if (pend.length === need) {
        out += String.fromCodePoint(decode(pend))
        pend.length = 0
      }
    }
    while (i < bytes.length) {
      const b = bytes[i]
      if (b < 0x80) {
        out += String.fromCharCode(b)
        i++
      } else {
        const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2
        if (i + need <= bytes.length) {
          out += String.fromCodePoint(decode(Array.from(bytes.slice(i, i + need))))
          i += need
        } else {
          for (let j = i; j < bytes.length; j++) pend.push(bytes[j])
          i = bytes.length
        }
      }
    }
    return out
  }
}
function decode(seq: number[]): number {
  const b = seq
  if (b[0] < 0x80) return b[0]
  if (b[0] < 0xe0) return ((b[0] & 0x1f) << 6) | (b[1] & 0x3f)
  if (b[0] < 0xf0) return ((b[0] & 0x0f) << 12) | ((b[1] & 0x3f) << 6) | (b[2] & 0x3f)
  return ((b[0] & 0x07) << 18) | ((b[1] & 0x3f) << 12) | ((b[2] & 0x3f) << 6) | (b[3] & 0x3f)
}

/**
 * SSE 클라이언트 (v0.4 §13 "GET /events optional", SPEC §8 Realtime).
 * RN fetch 는 streaming body 를 못 읽기 때문에 expo/fetch 를 쓴다.
 * 서버 `GET /api/v1/realtime/events` (event: timeline / change) 구독.
 */

export interface SSEHandlers {
  onEvent: (name: string, payload: unknown) => void
  onDown?: () => void
}

export interface SSEHandle {
  close: () => void
}

export function openEventStream(
  baseUrl: string,
  token: string | null,
  handlers: SSEHandlers
): SSEHandle {
  let closed = false
  const ac = new AbortController()

  const loop = async () => {
    while (!closed) {
      try {
        const res = await expoFetch(`${baseUrl}/api/v1/realtime/events`, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { 'x-device-token': token } : {}),
          },
          signal: ac.signal,
        })
        if (!res.ok || !res.body) throw new Error(`sse http ${res.status}`)
        const reader = (res.body as { getReader?: () => ReadableStreamDefaultReader<Uint8Array> }).getReader?.()
        if (!reader) throw new Error('no stream reader')
        const decoder = new Utf8StreamDecoder()
        let buf = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done || closed) break
          buf += decoder.decode(value)
          // 이벤트 블록(\n\n) 단위 파싱
          let sep: number
          while ((sep = buf.indexOf('\n\n')) !== -1) {
            const block = buf.slice(0, sep)
            buf = buf.slice(sep + 2)
            let name = 'message'
            let data = ''
            for (const line of block.split('\n')) {
              if (line.startsWith('event:')) name = line.slice(6).trim()
              else if (line.startsWith('data:')) data += line.slice(5).trim()
            }
            if (!data || data.startsWith('{') === false) continue
            try {
              handlers.onEvent(name, JSON.parse(data))
            } catch {
              /* partial json ignore */
            }
          }
        }
        handlers.onDown?.()
      } catch {
        if (!closed) handlers.onDown?.()
      }
      if (closed) break
      // reconnect backoff (간단 fixed 5s — PC 재기동 대기)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }

  void loop()
  return {
    close: () => {
      closed = true
      ac.abort()
    },
  }
}