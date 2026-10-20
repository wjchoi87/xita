import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import EventBus from '#v4/event_bus'

/*
 * 긴 작업(빌드·배포·동기화) 러너 — planner start_job 이관.
 * 빌드는 수 분이 걸려 요청-응답으로 묶을 수 없다 → 백그라운드 프로세스 + 로그 폴링.
 * 메모리 보관(서버 재시작 시 소멸)은 planner 와 동일. 결과는 앱 기록/타임라인에 남는다.
 */

export interface Job {
  id: string
  label: string
  project: string | null
  done: boolean
  ok: boolean
  startedAt: number
  finishedAt: number | null
  lines: string[]
}

const JOBS = new Map<string, Job>()
const MAX_LINES = 800
const MAX_JOBS = 50

export function jobLine(job: Job | null | undefined, text: string) {
  if (!job) return
  job.lines.push(text)
  // 로그가 무한정 쌓이면 메모리를 먹는다. 최근 것만 남긴다.
  if (job.lines.length > MAX_LINES) job.lines.splice(0, 200)
}

function prune() {
  if (JOBS.size <= MAX_JOBS) return
  const done = [...JOBS.values()].filter((j) => j.done).sort((a, b) => a.startedAt - b.startedAt)
  for (const j of done.slice(0, JOBS.size - MAX_JOBS)) JOBS.delete(j.id)
}

export interface Step {
  cmd: string[]
  cwd: string
  env?: Record<string, string>
  /** 실패해도 다음 단계를 계속한다 (동기화처럼 앱별 실패가 전체 실패가 되면 안 될 때) */
  tolerant?: boolean
  /** stdout 한 줄마다 호출 — false 를 돌려주면 로그에 남기지 않는다 */
  onLine?: (line: string) => boolean | void
}

function runStep(job: Job, step: Step): Promise<boolean> {
  return new Promise((resolve) => {
    jobLine(job, `$ ${step.cmd.join(' ')}`)
    let child
    try {
      child = spawn(step.cmd[0], step.cmd.slice(1), {
        cwd: step.cwd,
        env: { ...process.env, ...step.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      jobLine(job, `[오류] ${(e as Error).message}`)
      return resolve(false)
    }
    let buf = ''
    const onData = (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      const parts = buf.split(/\r?\n/)
      buf = parts.pop() ?? ''
      for (const line of parts) if (step.onLine?.(line) !== false) jobLine(job, line)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', (e) => {
      jobLine(job, `[오류] ${e.message}`)
      resolve(false)
    })
    child.on('close', (code) => {
      if (buf && step.onLine?.(buf) !== false) jobLine(job, buf)
      resolve(code === 0)
    })
  })
}

export function startJob(
  label: string,
  project: string | null,
  steps: Step[],
  hooks: { pre?: string[]; onSuccess?: (job: Job) => Promise<void> | void } = {}
): Job {
  const job: Job = {
    id: crypto.randomBytes(6).toString('hex'),
    label,
    project,
    done: false,
    ok: false,
    startedAt: Math.floor(Date.now() / 1000),
    finishedAt: null,
    lines: [...(hooks.pre ?? [])],
  }
  JOBS.set(job.id, job)
  prune()
  EventBus.emit('xita.job', { id: job.id, label, project, done: false })
  ;(async () => {
    let ok = true
    for (const step of steps) {
      const stepOk = await runStep(job, step)
      if (!stepOk && !step.tolerant) {
        ok = false
        break
      }
    }
    if (ok && hooks.onSuccess) {
      try {
        await hooks.onSuccess(job)
      } catch (e) {
        jobLine(job, `[후처리 실패] ${(e as Error).message}`)
      }
    }
    job.ok = ok
    job.done = true
    job.finishedAt = Math.floor(Date.now() / 1000)
    jobLine(job, ok ? '완료' : '실패')
    EventBus.emit('xita.job', { id: job.id, label, project, done: true, ok })
  })()
  return job
}

export function getJob(id: string): Job | undefined {
  return JOBS.get(id)
}

export function listJobs(): Job[] {
  return [...JOBS.values()].sort((a, b) => b.startedAt - a.startedAt)
}

export function jobSummary(j: Job) {
  const { lines, ...rest } = j
  return { ...rest, lastLine: lines[lines.length - 1] ?? null }
}

/** 같은 프로젝트에 진행 중인 작업이 있으면 중복 실행을 막는다 (gradle 동시 실행은 락 충돌). */
export function runningFor(project: string): Job | undefined {
  return [...JOBS.values()].find((j) => j.project === project && !j.done)
}
