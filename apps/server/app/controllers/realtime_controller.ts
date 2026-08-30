import type { HttpContext } from '@adonisjs/core/http'
import EventBus, { eventTypes } from '#v4/event_bus'

/*
 * SSE Realtime stream (SPEC §8). Client 는 단방향 이벤트를 구독한다.
 * 예: macOS App 이 Dispatch/Needs You 상태 변화를 실시간 수신.
 * - event: xita.timeline / xita.change
 * - heartbeat 15s, disconnect 시 구독 해제
 */
export default class RealtimeController {
  async events({ response }: HttpContext) {
    const res = response.response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write('retry: 3000\n\n')

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`)
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const unsub = EventBus.subscribe(({ type, payload }) => {
      const evtName = type === eventTypes.change ? 'change' : 'timeline'
      send(evtName, payload)
    })

    // Heartbeat — 프록시/클라이언트를 살아있는 연결로 유지.
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`)
    }, 15000)

    res.on('close', () => {
      unsub()
      clearInterval(heartbeat)
    })
    res.write(`event: connected\n`)
    res.write(`data: {"ok":true,"service":"xita"}\n\n`)

    return res
  }
}
