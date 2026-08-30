/**
 * v0.4/§13 Sync 계약 타입 (서버 `apps/server/app/v4/sync.ts` 와 일치).
 */

export type TargetType =
  | 'product'
  | 'change'
  | 'artifact'
  | 'workbench'
  | 'decision'
  | 'release'
  | 'capability'
  | 'readiness'
  | 'proposal'
  | 'review'
  | 'reference'
  | 'dispatch'
  | 'patch'
  | 'milestone'
  | 'insight'

export interface Operation {
  op_id: string
  device_id: string
  target_type: TargetType
  target_id: string
  base_revision: number
  /** create | update_status | update_field | resolve_conflict */
  type: string
  /** create: {meta, body} / update: {field: value} */
  payload: Record<string, unknown>
}

export interface CanonicalDoc {
  id: string
  type: string
  revision: number | null
  meta: Record<string, unknown>
  body: string
}

export interface PullResponse {
  workspace_revision: number
  docs: CanonicalDoc[]
}

export interface OperationResult {
  status: 'APPLIED' | 'DEDUPED' | 'CONFLICT' | 'REJECTED'
  entity_revision: number
  message?: string
}

export interface SyncConflict {
  op_id: string
  target_type?: string
  target_id: string
  base_revision?: number
  canonical_revision?: number
  status?: string
  message?: string
}

export interface PushResponse {
  workspace_revision: number
  results: OperationResult[]
  conflicts: SyncConflict[]
}

export interface PairResponse {
  device: { device_id: string; name: string; platform: string }
  token: string
}

/** UI 프로젝션 행 (캐시된 canonical doc 기반 파생). */
export interface UiItem {
  id: string
  type: string
  revision: number
  name: string
  status: string
}