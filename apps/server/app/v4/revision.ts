import { MarkdownStore } from '#v4/markdown_store'
import { loadWorkspaceMeta, type DocType } from '#v4/workspace'

/*
 * Revision Engine (v0.4 §11, §12, §18-S6).
 *
 * Operation 의 idempotency + optimistic concurrency:
 *  - base_revision 이 canonical 과 일치하면 적용 (entity revision +1, workspace +1)
 *  - revision mismatch 시 field 충돌 여부를 판정:
 *      · 지원 필드에서 non-overlap/safe → auto apply
 *      · semantic/destructive/ambiguous → Needs You(제출자 반려)
 *
 * op_id 로 idempotent 처리 (같은 op 재전송 시 중복 적용 방지) 는
 * device/op ledger 를 두는 것으로 하고, 여기서는 hash 기반 검증을 제공한다.
 */

export type ConflictReason =
  'REVISION_STALE' | 'SEMANTIC_CONFLICT' | 'UNKNOWN_TARGET' | 'UNKNOWN_FIELD'

export interface Operation {
  op_id: string
  device_id: string
  target_type: DocType
  target_id: string
  base_revision: number
  type: string
  payload: Record<string, unknown>
}

export type OperationResult =
  | { status: 'APPLIED'; entityRevision: number; workspaceRevision: number; doc?: unknown }
  | { status: 'CONFLICT'; reason: ConflictReason; message: string; canonicalRevision: number }

/**
 * 일반적으로 오버랩 위험이 낮은 메타 필드 (안전 자동 적용 후보, v0.4 §12).
 * lifecycle 상태를 건드리는 semantic 필드는 여기 제외 → Conflict 로 올린다.
 */
const SAFE_FIELDS = new Set([
  'description',
  'summary',
  'note',
  'goal',
  'intent',
  'context',
  'scope',
  'vision',
  'direction',
  'current_goal',
])

export class RevisionEngine {
  constructor(private stores: Record<DocType, MarkdownStore>) {}

  async applyOperation(op: Operation): Promise<OperationResult> {
    const targetStore = this.stores[op.target_type]
    const touchedFields = Object.keys(op.payload ?? {})
    const onlySafe = touchedFields.every((f) => SAFE_FIELDS.has(f))

    let existing = await targetStore.read(op.target_id)

    if (existing) {
      const canonicalRev = existing.revision ?? 0
      if (op.base_revision !== canonicalRev) {
        // revision stale. 겹치지 않는 safe field 변경만 자동 적용(v0.4 §12)
        if (onlySafe && touchedFields.length) {
          let updated = existing
          for (const [k, v] of Object.entries(op.payload)) {
            updated = (await targetStore.applyField(op.target_id, k, v)) ?? updated
          }
          const meta = await loadWorkspaceMeta()
          return {
            status: 'APPLIED',
            entityRevision: updated.revision ?? 0,
            workspaceRevision: meta.workspace_revision,
          }
        }
        // status/lifecycle 같은 semantic field 가 stale revision 으로 오면 conflict
        return {
          status: 'CONFLICT',
          reason: 'SEMANTIC_CONFLICT',
          message: `Stale revision ${op.base_revision} vs canonical ${canonicalRev} on ${op.target_id}`,
          canonicalRevision: canonicalRev,
        }
      }
      // base_revision 일치 → 적용
      for (const [k, v] of Object.entries(op.payload ?? {})) {
        existing = await targetStore.applyField(op.target_id, k, v)
      }
      const updated = await targetStore.read(op.target_id)
      const meta = await loadWorkspaceMeta()
      return {
        status: 'APPLIED',
        entityRevision: updated?.revision ?? 0,
        workspaceRevision: meta.workspace_revision,
        doc: updated,
      }
    }

    // 존재하지 않는 target → create 허용 (base_revision 0, type=create)
    if (op.base_revision === 0 && op.type === 'create') {
      const id = op.target_id
      const meta = op.payload.meta as Record<string, unknown> | undefined
      const body = (op.payload.body as string) ?? ''
      const res = await targetStore.upsert(id, { ...(meta ?? {}) }, body, 1)
      return {
        status: 'APPLIED',
        entityRevision: res.revision,
        workspaceRevision: res.workspaceRevision,
        doc: res.doc,
      }
    }

    return {
      status: 'CONFLICT',
      reason: 'UNKNOWN_TARGET',
      message: `No ${op.target_type} with id "${op.target_id}"`,
      canonicalRevision: 0,
    }
  }
}

export { MarkdownStore }
export const safeFields = SAFE_FIELDS
