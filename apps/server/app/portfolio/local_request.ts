import type { HttpContext } from '@adonisjs/core/http'

/*
 * 실행 계열 가드 (docs/PORTFOLIO.md §3).
 * 이 API 는 키스토어·서비스 계정으로 배포하고 셸 명령을 실행한다. CORS 가 origin:true 라서
 * 아무 웹페이지나 브라우저를 통해 localhost 로 POST 할 수 있고, 모바일 sync 때문에 서버가
 * LAN 에 열릴 수도 있다 → loopback 요청 + (Origin 없음 | localhost Origin) 만 허용.
 */
export function isLocalRequest(ctx: HttpContext): boolean {
  const addr = ctx.request.request.socket.remoteAddress ?? ''
  const loopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
  if (!loopback) return false
  const origin = ctx.request.header('origin')
  if (!origin) return true
  try {
    const host = new URL(origin).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  } catch {
    return false
  }
}
