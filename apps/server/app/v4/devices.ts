import crypto from 'node:crypto'
import path from 'node:path'
import { metaDir } from '#v4/workspace'
import { atomicWrite, ensureDir, readText } from '#v4/fs_util'

/*
 * Device Trust & Pairing (v0.4 §14).
 * 기기 레지스트리는 canonical Markdown workspace 의 .xita/devices.json 에 둔다
 * (PostgreSQL 불필요, §17). 호스트가 canonical authority 이며 인증된 로컬 sync port.
 *
 * Pairing flow:
 *   1) PC(Mac)  : POST /devices/pair        → pairing_code (짧은 수명)
 *   2) Mobile   : POST /sync/pair {code, device_id, host_identity}
 *                → host 가 code 검증 후 device token 발급 (trust)
 */

interface Device {
  device_id: string
  name: string
  platform: string
  token: string
  paired_at: string
  last_seen_at: string | null
  status: 'paired'
}

interface Pairing {
  code: string
  host_identity: string
  expires_at: number
  created_at: string
}

function file(name: string) {
  return path.join(metaDir(), name)
}

async function readJson<T>(name: string): Promise<T | null> {
  const raw = await readText(file(name))
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writeJson(name: string, data: unknown) {
  await ensureDir(metaDir())
  await atomicWrite(file(name), JSON.stringify(data, null, 2))
}

export class DeviceRegistry {
  async pair(hostIdentity: string, ttlMs = 10 * 60 * 1000): Promise<Pairing> {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase()
    const pairing: Pairing = {
      code,
      host_identity: hostIdentity,
      expires_at: Date.now() + ttlMs,
      created_at: new Date().toISOString(),
    }
    await writeJson('pairing.json', pairing)
    return pairing
  }

  async confirmPair(
    code: string,
    input: { device_id: string; name?: string; platform?: string }
  ): Promise<{ device: Device; token: string }> {
    const pairing = await readJson<Pairing>('pairing.json')
    if (!pairing || pairing.code !== code.toUpperCase()) throw new Error('Invalid pairing code')
    if (Date.now() > pairing.expires_at) throw new Error('Pairing code expired')

    const token = crypto.randomBytes(32).toString('hex')
    const existing = await this.loadDevices()
    existing[input.device_id] = {
      device_id: input.device_id,
      name: input.name ?? input.device_id,
      platform: input.platform ?? 'unknown',
      token,
      paired_at: new Date().toISOString(),
      last_seen_at: null,
      status: 'paired',
    }
    await this.saveDevices(existing)
    // 일회성 코드이므로 pairing 청크 제거
    await writeJson('pairing.json', null)
    return { device: existing[input.device_id], token }
  }

  async authenticate(token?: string | null): Promise<Device | null> {
    if (!token) return null
    const devices = await this.loadDevices()
    for (const d of Object.values(devices)) {
      if (d.token === token) return d
    }
    return null
  }

  async list(): Promise<Device[]> {
    return Object.values(await this.loadDevices())
  }

  async touch(deviceId: string) {
    const devices = await this.loadDevices()
    if (devices[deviceId]) {
      devices[deviceId].last_seen_at = new Date().toISOString()
      await this.saveDevices(devices)
    }
  }

  private async loadDevices(): Promise<Record<string, Device>> {
    return (await readJson<Record<string, Device>>('devices.json')) ?? {}
  }

  private async saveDevices(devices: Record<string, Device>) {
    await writeJson('devices.json', devices)
  }
}

export type { Device, Pairing }
