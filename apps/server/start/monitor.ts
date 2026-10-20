/*
 * 상시 모니터링 스케줄러 (app/portfolio/monitor.ts).
 * 웹 서버로 떠 있을 때만 — ace 명령·테스트·REPL 에서는 돌지 않는다.
 */
import app from '@adonisjs/core/services/app'

if (app.getEnvironment() === 'web' && process.env.NODE_ENV !== 'test') {
  const { startMonitorLoop } = await import('#portfolio/monitor')
  startMonitorLoop()
}
