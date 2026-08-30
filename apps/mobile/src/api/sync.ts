import { newDeviceId } from '../lib/ids'
import type {
  CanonicalDoc,
  Operation,
  PairResponse,
  PullResponse,
  PushResponse,
  SyncConflict,
} from '../lib/types'

/**
 * 호스트(macOS) Sync transport 클라이언트 (v0.4 §13).
 * transport 는 여기, semantics 는 서버(SSE/Rust 코어 계약) 가 소유한다.
 */

const TOKEN_HEADER = 'x-device-token'

export class SyncClientError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(`[${code}] ${message}`)
  }
}

export class SyncClient {
  /** 보안토큰은 호출부(캐시 레이어)가 관리하지만, 기본 동작은 여기서 유지. */
  private token: string | null = null
  private deviceId: string = newDeviceId()

  constructor(public baseUrl: string) {}

  setToken(token: string | null) {
    this.token = token
  }
  setDeviceId(id: string) {
    this.deviceId = id
  }
  getDeviceId(): string {
    return this.deviceId
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    }
    if (this.token) headers[TOKEN_HEADER] = this.token
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers })
    const text = await res.text()
    let data: any = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      /* 비 JSON 응답 */
    }
    if (!res.ok) {
      const code = data?.message ? 'HTTP_ERROR' : (data?.message ?? String(res.status))
      throw new SyncClientError(code, (data?.message ?? text) || `HTTP ${res.status}`)
    }
    if (data?.data === undefined && data?.ok === false) {
      throw new SyncClientError(data?.code ?? 'SYNC_ERROR', data?.message ?? 'sync failed')
    }
    return data?.data ?? (data as T)
  }

  /** 화면/폴링 전용 로우 응답 (data 래퍼 포함 그대로). */
  async raw<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    }
    if (this.token) headers[TOKEN_HEADER] = this.token
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers })
    const text = await res.text()
    let data: any = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      /* ignore */
    }
    if (!res.ok) throw new SyncClientError('HTTP_ERROR', (data?.message ?? text) || `HTTP ${res.status}`)
    return data as T
  }

  // ---- pairing (v0.4 §14) ------------------------------------------------
  async pair(code: string, name = 'My iPhone'): Promise<PairResponse> {
    return this.request<PairResponse>('/sync/pair', {
      method: 'POST',
      body: JSON.stringify({ code, device_id: this.deviceId, name, platform: 'iOS' }),
    })
  }

  // ---- pull (replica refresh) -------------------------------------------
  async pull(cursor: number): Promise<PullResponse> {
    return this.request<PullResponse>(`/sync/pull?cursor=${cursor}`, { method: 'GET' })
  }

  // ---- push (operation 전송) ---------------------------------------------
  async push(ops: Operation[]): Promise<PushResponse> {
    return this.request<PushResponse>('/sync/push', { method: 'POST', body: JSON.stringify({ ops }) })
  }

  /** PC offline 검사용 헬스. offline 이면 false. */
  async isHostReachable(): Promise<boolean> {
    try {
      await this.request<{ workspace_revision: number }>('/sync/status', { method: 'GET' })
      return true
    } catch {
      return false
    }
  }

  async reconcile(): Promise<{ applied: number; conflicts: SyncConflict[]; workspace_revision: number }> {
    return this.request('/sync/reconcile', { method: 'POST', body: JSON.stringify({}) })
  }

  async pendingCount(): Promise<{ pending: number }> {
    return this.request('/sync/pending', { method: 'GET' })
  }

  // ---- storage helper (캐시 레이어와 분리된 순수 변환) --------------------
  static projectDocs(docs: CanonicalDoc[]) {
    return docs
      .map((d) => ({
        id: d.id,
        type: d.type,
        revision: d.revision ?? 0,
        name: (d.meta?.name as string | undefined) ?? d.id,
        status: (d.meta?.status as string | undefined) ?? '-',
      }))
      .sort((a, b) => (a.type === b.type ? a.id.localeCompare(b.id) : a.type.localeCompare(b.type)))
  }
}