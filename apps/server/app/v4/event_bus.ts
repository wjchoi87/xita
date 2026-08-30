/*
 * In-process EventBus for Realtime (SPEC §8, §34).
 * 핵심 상태 변경 시 이벤트를 발행하고 SSE 구독자에게 전달한다.
 * MVP 는 단일 서버 퍼포넌트이므로 Redis 를 도입하지 않는다 (Implementation
 * Stack §7). 스케일아웃 시 Redis Pub/Sub 나 외부 BUS 로 교체한다.
 */

type Listener = (event: { type: string; payload: Record<string, unknown> }) => void

class EventBus {
  private listeners = new Set<Listener>()

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit(type: string, payload: Record<string, unknown>) {
    const event = { type, payload }
    for (const fn of this.listeners) {
      try {
        fn(event)
      } catch {
        // 구독자 오류는 다른 구독자/발행에 영향 주지 않도록 격리
      }
    }
  }
}

export default new EventBus()

export const eventTypes = {
  timeline: 'xita.timeline',
  change: 'xita.change',
} as const
