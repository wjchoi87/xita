import type { HttpContext } from '@adonisjs/core/http'
import { SyncService } from '#v4/sync'
import { DeviceRegistry } from '#v4/devices'
import { ArtifactStore, createDecision, createRelease } from '#v4/artifact_store'
import vine from '@vinejs/vine'

const syncService = new SyncService()
const devices = new DeviceRegistry()
const artifacts = new ArtifactStore()

const pushValidator = vine.compile(
  vine.object({
    cursor: vine.number().optional(),
    ops: vine.array(
      vine.object({
        op_id: vine.string(),
        device_id: vine.string(),
        target_type: vine.enum([
          'product',
          'change',
          'artifact',
          'workbench',
          'decision',
          'release',
          'capability',
          'readiness',
          'proposal',
          'review',
          'reference',
          'dispatch',
        ]),
        target_id: vine.string(),
        base_revision: vine.number(),
        type: vine.string(),
        payload: vine.any(),
      })
    ),
  })
)

const pairValidator = vine.compile(
  vine.object({
    code: vine.string(),
    device_id: vine.string().trim().minLength(2),
    name: vine.string().optional(),
    platform: vine.string().optional(),
  })
)

/*
 * v0.4 §13 Sync Transport + §14 Pairing. Canonical authority 는 Mac/PC host.
 * 기기 인증은 v0.4 DeviceRegistry(.xita/devices.json) 사용 (Postgres 불필요, §17).
 */
export default class SyncController {
  // ---- Pairing (§14) -----------------------------------------------------
  async pair({ request, response }: HttpContext) {
    const hostIdentity = request.input('host_identity') ?? 'xita-mac'
    const pairing = await devices.pair(hostIdentity)
    return response.created({ data: pairing })
  }

  async confirmPair({ request, response }: HttpContext) {
    const payload = await request.validateUsing(pairValidator)
    try {
      const { device, token } = await devices.confirmPair(payload.code, {
        device_id: payload.device_id,
        name: payload.name,
        platform: payload.platform,
      })
      return { data: { device, token } }
    } catch (e) {
      return response.badRequest({ message: (e as Error).message })
    }
  }

  // ---- Sync transport (§13) ----------------------------------------------
  async pull({ request, response }: HttpContext) {
    const device = await this.auth(request.header('x-device-token'), response)
    if (!device) return
    const cursor =
      request.input('cursor') === undefined ? undefined : Number(request.input('cursor'))
    return { data: await syncService.pull(cursor) }
  }

  async push({ request, response }: HttpContext) {
    const device = await this.auth(request.header('x-device-token'), response)
    if (!device) return
    const payload = await request.validateUsing(pushValidator)
    return { data: await syncService.push(payload.ops) }
  }

  async status({ request }: HttpContext) {
    const device = await this.auth(request.header('x-device-token'), undefined as never)
    if (!device) return { data: { unauthorized: true } }
    return { data: await syncService.status() }
  }

  async conflicts({ request }: HttpContext) {
    const device = await this.auth(request.header('x-device-token'), undefined as never)
    if (!device) return { data: { unauthorized: true } }
    return { data: await syncService.conflicts() }
  }

  async clearConflict({ request, response }: HttpContext) {
    const device = await this.auth(request.header('x-device-token'), response)
    if (!device) return
    const opId = request.input('op_id')
    if (!opId) return response.badRequest({ message: 'op_id required' })
    await syncService.clearConflict(opId)
    return { data: { cleared: opId } }
  }

  // ---- Offline (§9-10) ----------------------------------------------------
  async defer({ request, response }: HttpContext) {
    const device = await this.auth(request.header('x-device-token'), response)
    if (!device) return
    const payload = await request.validateUsing(pushValidator)
    const q = await syncService.defer(payload.ops)
    return { data: q }
  }

  async pending({ request, response }: HttpContext) {
    const device = await this.auth(request.header('x-device-token'), response)
    if (!device) return
    return { data: { pending: await syncService.pendingCount() } }
  }

  /** PC 로 복귀 시 queued op 를 canonical 에 적용 (replay). */
  async reconcile({ request, response }: HttpContext) {
    const device = await this.auth(request.header('x-device-token'), response)
    if (!device) return
    return { data: await syncService.reconcile() }
  }

  // ---- Canonical Artifact / Decision / Release (Living Artifact 등, v0.4 Store) ----
  async createArtifact({ request, response }: HttpContext) {
    const payload = await request.validateUsing(
      vine.compile(
        vine.object({
          id: vine.string().trim().minLength(2).maxLength(120),
          name: vine.string().trim().minLength(2).maxLength(200),
          product: vine.string().optional(),
          content: vine.string().optional(),
          summary: vine.string().optional(),
        })
      )
    )
    const data = await artifacts.create({
      id: payload.id,
      name: payload.name,
      product: payload.product ?? null,
      content: payload.content,
      summary: payload.summary,
    })
    return response.created({ data })
  }

  async addArtifactRevision({ params, request, response }: HttpContext) {
    const payload = await request.validateUsing(
      vine.compile(
        vine.object({
          content: vine.string(),
          summary: vine.string().optional(),
          changeSummary: vine.string().optional(),
        })
      )
    )
    const data = await artifacts.addRevision(params.id, payload)
    return response.created({ data })
  }

  async getArtifact({ params }: HttpContext) {
    return { data: await artifacts.get(params.id) }
  }

  async addDecision({ request, response }: HttpContext) {
    const payload = await request.validateUsing(
      vine.compile(
        vine.object({
          id: vine.string().trim().minLength(2),
          product: vine.string().optional(),
          title: vine.string(),
          decision: vine.string().optional(),
          reason: vine.string().optional(),
          options: vine.array(vine.string()).optional(),
          status: vine.string().optional(),
        })
      )
    )
    const doc = await createDecision({
      id: payload.id,
      product: payload.product ?? null,
      title: payload.title,
      decision: payload.decision ?? null,
      reason: payload.reason,
      options: payload.options,
      status: payload.status,
    })
    return response.created({ data: doc })
  }

  async addRelease({ request, response }: HttpContext) {
    const payload = await request.validateUsing(
      vine.compile(
        vine.object({
          id: vine.string().trim().minLength(2),
          product: vine.string(),
          name: vine.string(),
          status: vine.string().optional(),
          notes: vine.string().optional(),
        })
      )
    )
    const doc = await createRelease({
      id: payload.id,
      product: payload.product,
      name: payload.name,
      status: payload.status,
      notes: payload.notes ?? null,
    })
    return response.created({ data: doc })
  }

  private async auth(token: string | undefined, response: HttpContext['response']) {
    const device = await devices.authenticate(token ?? null)
    if (!device) {
      if (response) response.unauthorized({ message: 'Invalid or missing device token' })
      return null
    }
    void devices.touch(device.device_id)
    return device
  }
}
