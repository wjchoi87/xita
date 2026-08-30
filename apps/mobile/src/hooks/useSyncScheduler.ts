import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { store } from '../state/store'

/**
 * v0.4 §13 기본 동작: "Mobile foreground → pull", "mutation → push".
 * RN 기본 EventSource 가 없어 SSE 대신 경량 폴링으로 realtime 신호를 대체한다.
 * (foreground 전환 시 즉시 refresh + 활동 중 주기 pull; pending op 는 flush)
 *
 * 백그라운드에서는 아무것도 하지 않는다 — 배터리/오프라인 친화 (§10).
 */
export function useSyncScheduler(intervalMs = 15_000) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const tick = () => {
    if (store.state.phase !== 'ready') return
    if (store.state.pending > 0) {
      void store.reconcileNow()
    } else {
      void store.refresh()
    }
  }

  useEffect(() => {
    const onState = (status: AppStateStatus) => {
      if (status === 'active') tick()
    }
    const sub = AppState.addEventListener('change', onState)
    timer.current = setInterval(tick, intervalMs)
    return () => {
      sub.remove()
      if (timer.current) clearInterval(timer.current)
    }
  }, [intervalMs])
}