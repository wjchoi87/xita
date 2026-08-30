import { useSyncExternalStore } from 'react'
import { openEventStream, type SSEHandle } from '../api/sse'
import { SyncClient } from '../api/sync'
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
  workspaceRevision: 0,
  needsYou: 0,
  activeChanges: 0,
  pending: 0,
  conflicts: [],
  online: null,
  lastSyncAt: '',
  lastError: null,
}

const ACTIVE = new Set(['IDEA', 'PLAN', 'BUILD', 'REVIEW', 'SHIP_READY', 'idea', 'plan', 'build', 'review', 'ship_ready'])
const NEEDS_REVIEW = new Set(['REVIEW', 'SHIP_READY', 'review', 'ship_ready'])

class Store {
  private listeners = new Set<() => void>()
  state: StoreState = initial
  client: SyncClient | null = null
  queue = new OperationQueue()
  private deviceId = newDeviceId()
  private docs: CanonicalDoc[] = []
  private cursor = 0
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
      const host = await storage.getHost()
      const token = await storage.getToken()
      const storedDevice = await storage.getDeviceId()
      if (storedDevice) this.deviceId = storedDevice
      else await storage.setDeviceId(this.deviceId)

      this.docs = await storage.getDocs()
      this.cursor = await storage.getCursor()
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
    const normalized = host.replace(/\/+$/, '')
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
      const done = out.results.filter((r) => r.status === 'APPLIED' || r.status === 'DEDUPED').map((_, i) => ops[i]?.op_id).filter(Boolean) as string[]
      await this.queue.removeApplied(done)
      this.set({ conflicts: out.conflicts ?? [] })
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

  /** Needs You — pending proposals (§49/§81; 모바일 Approve/Reject). */
  get pendingProposals() {
    return this.docs.filter((d) => d.type === 'proposal' && String(d.meta?.status ?? '') === 'pending')
  }

  async resolveProposal(proposalId: string, status: 'approved' | 'rejected' | 'modified') {
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
    const needsYou =
      items.filter((i) => i.type === 'change' && NEEDS_REVIEW.has(i.status)).length +
      this.state.conflicts.length
    const activeChanges = items.filter((i) => i.type === 'change' && ACTIVE.has(i.status)).length
    this.set({
      items,
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