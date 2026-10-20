import { Platform } from 'react-native'
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

/*
 * 변경 전 정책: sync 요청은 `${baseUrl}/sync/...`, SSE 는 `${baseUrl}/api/v1/realtime/...` 로 만들어
 *   사용자가 안내대로 http://<ip>:3333 을 넣으면 페어링이 404, /api/v1 까지 넣으면 SSE 가 404 였다.
 * 변경 후 정책: 호스트는 항상 origin(http://<ip>:3333)으로 정규화해 저장하고, REST 는 클라이언트가
 *   /api/v1 을 붙인다. 이미 /api/v1 이 붙은 채 저장된 값도 같은 규칙으로 흡수한다.
 * 변경 이유: 2026-10-17 에뮬레이터 실기 테스트에서 페어링이 "Cannot POST:/sync/pair" 로 실패.
 * 영향 범위: 페어링·pull/push·conflict·proposal REST 호출 URL. 큐/커서/op 의미는 변경 없음.
 */
export const API_PREFIX = '/api/v1'

function defaultDeviceName(): string {
  const c = Platform.constants as { Model?: string; Brand?: string } | undefined
  if (Platform.OS === 'android') return [c?.Brand, c?.Model].filter(Boolean).join(' ') || 'Android'
  if (Platform.OS === 'ios') return 'iPhone'
  return Platform.OS
}

export function hostOrigin(input: string): string {
  const trimmed = input
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/, '')
  // "192.168.0.5:3333" 처럼 스킴을 빼고 입력해도 연결되게
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
}

export class SyncClient {
  /** 보안토큰은 호출부(캐시 레이어)가 관리하지만, 기본 동작은 여기서 유지. */
  private token: string | null = null
  private deviceId: string = newDeviceId()

  constructor(public baseUrl: string) {
    this.baseUrl = hostOrigin(baseUrl)
  }

  private url(path: string) {
    return `${this.baseUrl}${API_PREFIX}${path}`
  }

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
    const res = await fetch(this.url(path), { ...init, headers })
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
    const res = await fetch(this.url(path), { ...init, headers })
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
  /** 기기 이름·플랫폼은 실제 런타임 값 (이전: 'My iPhone'/'iOS' 고정 → 안드로이드도 iPhone 으로 등록됐다) */
  async pair(code: string, name = defaultDeviceName()): Promise<PairResponse> {
    return this.request<PairResponse>('/sync/pair', {
      method: 'POST',
      body: JSON.stringify({ code, device_id: this.deviceId, name, platform: Platform.OS }),
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

  /** PC offline 검사용 헬스 — 페어링 전 호스트 확인 등. offline 이면 false. */
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

  // ---- storage helper (캐시 레이어와 분리된 순수 변환) --------------------
  static projectDocs(docs: CanonicalDoc[]) {
    return docs
      .map((d) => ({
        id: d.id,
        type: d.type,
        revision: d.revision ?? 0,
        name: (d.meta?.name as string | undefined) ?? d.id,
        status: (d.meta?.status as string | undefined) ?? '-',
        product: (d.meta?.product as string | undefined) ?? '',
      }))
      .sort((a, b) => (a.type === b.type ? a.id.localeCompare(b.id) : a.type.localeCompare(b.type)))
  }
}