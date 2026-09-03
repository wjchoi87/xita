import { storage } from '../cache/storage'
import type { Operation } from '../lib/types'

/**
 * Pending Operation Queue (v0.4 §9-§10).
 * PC(호스트) offline 이면 이 큐에 op 를 쌓는다. 복귀 후 flush(전송) → reconcile.
 * 큐는 idempotent(op_id) 하므로 재전송돼도 중복 적용되지 않는다 (§11).
 */
export class OperationQueue {
  private ops: Operation[] = []
  private loaded = false

  async load() {
    this.ops = await storage.getOps()
    this.loaded = true
  }

  size(): number {
    return this.ops.length
  }

  all(): Operation[] {
    return [...this.ops]
  }

  async enqueue(op: Operation) {
    if (!this.loaded) await this.load()
    this.ops = [...this.ops, op]
    // 같은 op_id dedupe
    const seen = new Set<string>()
    this.ops = this.ops.filter((o) => (seen.has(o.op_id) ? false : (seen.add(o.op_id), true)))
    await storage.setOps(this.ops)
  }

  /** APPLIED / DEDUPED 로 처리된 op 들을 큐에서 제거. */
  async removeApplied(opIds: string[]) {
    const removed = new Set(opIds)
    this.ops = this.ops.filter((o) => !removed.has(o.op_id))
    await storage.setOps(this.ops)
  }
}