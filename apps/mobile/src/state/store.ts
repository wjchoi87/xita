import { useSyncExternalStore } from 'react'
import { openEventStream, type SSEHandle } from '../api/sse'
import { SyncClient, hostOrigin } from '../api/sync'
import { storage } from '../cache/storage'
import { newDeviceId, newOpId, slug } from '../lib/ids'
import type { CanonicalDoc, Operation, SyncConflict, UiItem } from '../lib/types'
import { OperationQueue } from '../queue/operationQueue'

/**
 * 클라이언트 상태 스토어 (replica).
 * 캐시(docs) + pending queue + sync cursor 를 조합해 UI 프로젝션을 만든다.
 * 모든 mutation 은 op 로 호스트에 push 되고, pull 로 canonical 을 다시 당긴다
 * (v0.4 §6-§10: Mobile = replica + operation producer).
 */

export interface StoreState {
  phase: 'loading' | 'unpaired' | 'ready'
  host: string | null
  items: UiItem[]
  /** 제품 원본 doc (meta 의 portfolio/version/production_status 등 표시용 — UiItem 에는 없음). 읽기 전용 프로젝션. */
  productDocs: CanonicalDoc[]
  proposals: CanonicalDoc[]
  workspaceRevision: number
  needsYou: number
  activeChanges: number
  pending: number
  conflicts: SyncConflict[]
  online: boolean | null
  lastSyncAt: string
  lastError: string | null
}

const initial: StoreState = {
  phase: 'loading',
  host: null,
  items: [],
  productDocs: [],
  proposals: [],
  workspaceRevision: 0,
  needsYou: 0,
  activeChanges: 0,
  pending: 0,
  conflicts: [],
  online: null,
  lastSyncAt: '',
  lastError: null,
}

/** 상태 비교는 대문자 정규화 한 곳에서 (데이터 정규화 부재 증상 제거). */
const ACTIVE = new Set(['IDEA', 'PLAN', 'BUILD', 'REVIEW', 'SHIP_READY'])
const NEEDS_REVIEW = new Set(['REVIEW', 'SHIP_READY'])

class Store {
  private listeners = new Set<() => void>()
  state: StoreState = initial
  client: SyncClient | null = null
  queue = new OperationQueue()
  private deviceId = newDeviceId()
  private docs: CanonicalDoc[] = []
  private cursor = 0
  private snoozed: Record<string, string> = {}
  private sse: SSEHandle | null = null
  private sseDebounce: ReturnType<typeof setTimeout> | null = null

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): StoreState => this.state

  private set(patch: Partial<StoreState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  // ---- lifecycle ---------------------------------------------------------

  async init() {
    try {
      const storedHost = await storage.getHost()
      const host = storedHost ? hostOrigin(storedHost) : null
      const token = await storage.getToken()
      const storedDevice = await storage.getDeviceId()
      if (storedDevice) this.deviceId = storedDevice
      else await storage.setDeviceId(this.deviceId)

      this.docs = await storage.getDocs()
      this.cursor = await storage.getCursor()
      this.snoozed = await storage.getSnoozed()
      await this.queue.load()

      if (host) {
        this.client = new SyncClient(host)
        this.client.setDeviceId(this.deviceId)
        this.client.setToken(token)
        this.set({ phase: token ? 'ready' : 'unpaired', host })
        this.recompute()
        if (token) this.connectRealtime()
      } else {
        this.set({ phase: 'unpaired', host: null })
      }
    } catch (e) {
      this.set({ phase: 'unpaired', lastError: String(e) })
    }
  }

  async setHost(host: string) {
    const normalized = hostOrigin(host)
    await storage.setHost(normalized)
    this.client = new SyncClient(normalized)
    this.client.setDeviceId(this.deviceId)
    this.set({ host: normalized })
  }

  async pair(code: string) {
    const c = this.client
    if (!c) throw new Error('host not set')
    const { token } = await c.pair(code.trim())
    await storage.setToken(token)
    c.setToken(token)
    this.set({ phase: 'ready' })
    await this.refresh()
    this.connectRealtime()
  }

  /*
   * 변경 전 정책: 호스트/토큰은 페어링 화면에서 설정만 가능했고 앱 안에서 해제하는 경로가 없음.
   * 변경 후 정책: unpair() 가 실시간 연결을 닫고 토큰·호스트를 지운 뒤 phase='unpaired' 로 전환 → 홈이 페어링 화면이 된다.
   *   로컬 캐시(docs/cursor)·전송 대기 op 큐·미루기 목록은 보존한다(같은 호스트로 다시 붙으면 그대로 이어서 전송).
   * 변경 이유: 설정 화면의 "호스트 변경/연결 해제" 요구. sync 의미(큐/커서 규칙)는 바꾸지 않는다.
   * 영향 범위: 설정 화면에서 명시적으로 호출할 때만. 해제 중엔 refresh/flush 가 phase 가드로 멈춘다.
   *   주의: 다른 호스트로 페어링하면 이전 커서·대기 op 가 그대로 남는다(정리 정책은 별도 결정 필요).
   */
  async unpair() {
    this.sse?.close()
    this.sse = null
    if (this.sseDebounce) clearTimeout(this.sseDebounce)
    this.sseDebounce = null
    await storage.setToken(null)
    await storage.clearHost()
    this.client = null
    this.set({ phase: 'unpaired', host: null, online: null, lastError: null })
  }

  /** SSE 구독 — 서버 canonical mutation 이벤트 수신 시 (debounce) pull. 폴링은 백업으로 유지. */
  connectRealtime() {
    const host = this.state.host
    if (!host || this.state.phase !== 'ready') return
    this.sse?.close()
    void storage.getToken().then((token) => {
      this.sse = openEventStream(host, token, {
        onEvent: (_name, _payload) => {
          if (this.sseDebounce) clearTimeout(this.sseDebounce)
          this.sseDebounce = setTimeout(() => {
            void this.refresh()
          }, 400)
        },
        onDown: () => {
          this.recompute({ online: false })
        },
      })
    })
  }

  // ---- sync --------------------------------------------------------------

  async refresh() {
    const c = this.client
    if (!c || this.state.phase !== 'ready') return
    try {
      const out = await c.pull(this.cursor)
      this.mergeDocs(out.docs)
      this.cursor = Math.max(this.cursor, out.workspace_revision)
      await storage.setCursor(this.cursor)
      this.recompute({ online: true, lastSyncAt: new Date().toISOString() })
    } catch (e) {
      // PC offline — 캐시 유지, 오프라인 상태 표시 (v0.4 §10)
      this.recompute({ online: false, lastError: String(e) })
    }
  }

  /** 쌓인 op 전송 → 성공분 큐 제거 → 풀 refresh. 실패(offline) 시 큐 보존. */
  async flush() {
    const c = this.client
    if (!c || this.state.phase !== 'ready') return
    const ops = this.queue.all()
    if (ops.length === 0) return
    try {
      const out = await c.push(ops)
      // results 는 ops 와 1:1 순서 대응 — 원래 인덱스로만 제거한다 (필터 후 인덱스 재사용 금지).
      // APPLIED/DEDUPED 는 완료, REJECTED 는 영구 거부(재시도 무의미)라 큐에서 내리고 안내,
      // CONFLICT 는 서버 conflicts.jsonl 에 남고 needs-you 로 표면화되므로 큐에서만 내린다.
      const done: string[] = []
      let rejectedMsg: string | null = null
      out.results.forEach((r, i) => {
        const id = ops[i]?.op_id
        if (!id) return
        if (r.status === 'APPLIED' || r.status === 'DEDUPED') done.push(id)
        else if (r.status === 'REJECTED') rejectedMsg = r.message ?? '거부된 요청이 있습니다.'
      })
      await this.queue.removeApplied(done)
      this.set({ conflicts: out.conflicts ?? [], lastError: rejectedMsg })
      await this.refresh()
      this.recompute()
    } catch (e) {
      this.recompute({ online: false, lastError: String(e) })
    }
  }

  /** 충돌 정리 — "Mac 버전 유지"(정본 유지). 서버 conflicts.jsonl 에서만 내린다(§12). */
  async clearConflict(opId: string) {
    const c = this.client
    if (!c) return
    try {
      await c.raw('/sync/conflicts/clear', { method: 'POST', body: JSON.stringify({ op_id: opId }) })
      this.set({ conflicts: this.state.conflicts.filter((x) => x.op_id !== opId) })
      await this.refresh()
      this.recompute()
    } catch (e) {
      this.recompute({ online: false, lastError: String(e) })
    }
  }

  async reconcileNow() {
    const c = this.client
    if (!c || this.state.phase !== 'ready') return
    try {
      const out = await c.reconcile()
      this.set({ conflicts: out.conflicts ?? [] })
      await this.refresh()
    } catch (e) {
      this.recompute({ online: false, lastError: String(e) })
    }
  }

  // ---- mutations (op producer, v0.4 §9) ----------------------------------

  private async enqueue(op: Operation) {
    await this.queue.enqueue(op)
    this.recompute()
    await this.flush()
  }

  /** 새 Product 생성 (op-producer, §9). */
  async createProduct(name: string) {
    const op: Operation = {
      op_id: newOpId(),
      device_id: this.deviceId,
      target_type: 'product',
      target_id: slug(name),
      base_revision: 0,
      type: 'create',
      payload: { meta: { name }, body: `# ${name}` },
    }
    await this.enqueue(op)
  }

  /** Quick Capture → Workbench 아이템 (§10: 오프라인 허용 강조). */
  async capture(title: string, content: string, workType = 'idea') {
    const op: Operation = {
      op_id: newOpId(),
      device_id: this.deviceId,
      target_type: 'workbench',
      target_id: slug(title),
      base_revision: 0,
      type: 'create',
      payload: { meta: { title, work_type: workType, summary: content.slice(0, 200) }, body: content },
    }
    await this.enqueue(op)
  }

  /** Needs You — 대기 중 제안 (§49/§81). 미루기(내일) 중인 것은 오늘 결정 대상이 아니다. */
  get pendingProposals() {
    return this.docs.filter(
      (d) => d.type === 'proposal' && String(d.meta?.status ?? '') === 'pending' && !this.isSnoozed(d.id)
    )
  }

  private isSnoozed(id: string): boolean {
    const until = this.snoozed[id]
    if (!until) return false
    return until >= new Date().toISOString().slice(0, 10)
  }

  /** 결정 미루기(내일로) — 로컬 선호. 서버 상태는 건드리지 않는다. */
  async snoozeProposal(proposalId: string) {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    this.snoozed = { ...this.snoozed, [proposalId]: tomorrow.toISOString().slice(0, 10) }
    await storage.setSnoozed(this.snoozed)
    this.recompute()
  }

  /**
   * 제안 승인/거절 — 온라인이면 서버 REST(/v4/proposals/:id/resolve, §81)를 써서
   * PROPOSAL_RESOLVED 자취 이벤트까지 남긴다. 오프라인이면 op 큐로 우회(§9)해 유실 없이.
   */
  async resolveProposal(proposalId: string, status: 'approved' | 'rejected' | 'modified') {
    const c = this.client
    if (c) {
      try {
        await c.raw(`/v4/proposals/${encodeURIComponent(proposalId)}/resolve`, {
          method: 'POST',
          body: JSON.stringify({ status }),
        })
        await this.refresh()
        this.recompute()
        return
      } catch {
        /* 네트워크 실패 — 아래 op 큐 경유 (§10 오프라인) */
      }
    }
    const doc = this.docs.find((d) => d.type === 'proposal' && d.id === proposalId)
    const op: Operation = {
      op_id: newOpId(),
      device_id: this.deviceId,
      target_type: 'proposal',
      target_id: proposalId,
      base_revision: doc?.revision ?? 0,
      type: 'update_status',
      payload: { status },
    }
    await this.enqueue(op)
  }

  /** Change 상태 전이 (모바일 = Approve/Trigger, §14). */
  async setStage(changeId: string, status: string) {
    const item = this.state.items.find((i) => i.type === 'change' && i.id === changeId)
    const op: Operation = {
      op_id: newOpId(),
      device_id: this.deviceId,
      target_type: 'change',
      target_id: changeId,
      base_revision: item?.revision ?? 0,
      type: 'update_status',
      payload: { status },
    }
    await this.enqueue(op)
  }

  // ---- projection --------------------------------------------------------

  private mergeDocs(incoming: CanonicalDoc[]) {
    const byKey = new Map<string, CanonicalDoc>()
    for (const d of this.docs) byKey.set(`${d.type}:${d.id}`, d)
    for (const d of incoming) {
      const key = `${d.type}:${d.id}`
      const old = byKey.get(key)
      if (!old || (d.revision ?? 0) >= (old.revision ?? 0)) byKey.set(key, d)
    }
    this.docs = [...byKey.values()]
    void storage.setDocs(this.docs)
  }

  private recompute(extra: Partial<StoreState> = {}) {
    const items: UiItem[] = SyncClient.projectDocs(this.docs)
    const upper = (s: string) => s.toUpperCase()
    const needsYou =
      items.filter((i) => i.type === 'change' && NEEDS_REVIEW.has(upper(i.status))).length +
      this.state.conflicts.length
    const activeChanges = items.filter((i) => i.type === 'change' && ACTIVE.has(upper(i.status))).length
    this.set({
      items,
      productDocs: this.docs.filter((d) => d.type === 'product'),
      proposals: this.pendingProposals,
      workspaceRevision: this.cursor,
      needsYou,
      activeChanges,
      pending: this.queue.size(),
      ...extra,
    })
  }
}

export const store = new Store()

export function useStore<T>(selector: (s: StoreState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.state))
}