import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import type { CanonicalDoc, Operation } from '../lib/types'

/**
 * 로컬 캐시/큐 저장소 (v0.4 §8). 이 저장소는 **replica/cache** 이며 canonical 이
 * 아니다 — 삭제돼도 호스트에서 다시 pull 로 rebuild 된다. 민감 토큰만
 * SecureStore(Keychain/Keystore, §21) 에 둔다.
 */

const K = {
  docs: 'xita.cache.docs',
  cursor: 'xita.cache.cursor',
  ops: 'xita.cache.pending_ops',
  snooze: 'xita.cache.snoozed_proposals',
  host: 'xita.settings.host',
  deviceId: 'xita.settings.device_id',
  token: 'xita.settings.token',
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writeJson(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value))
}

export const storage = {
  async getDocs(): Promise<CanonicalDoc[]> {
    return (await readJson<CanonicalDoc[]>(K.docs)) ?? []
  },
  async setDocs(docs: CanonicalDoc[]) {
    await writeJson(K.docs, docs)
  },
  async getCursor(): Promise<number> {
    return (await readJson<number>(K.cursor)) ?? 0
  },
  async setCursor(n: number) {
    await writeJson(K.cursor, n)
  },
  async getOps(): Promise<Operation[]> {
    return (await readJson<Operation[]>(K.ops)) ?? []
  },
  async setOps(ops: Operation[]) {
    await writeJson(K.ops, ops)
  },
  /** 미루기(내일) — proposalId → 깨어날 날짜(YYYY-MM-DD). 로컬 선호일 뿐 canonical 이 아니다. */
  async getSnoozed(): Promise<Record<string, string>> {
    return (await readJson<Record<string, string>>(K.snooze)) ?? {}
  },
  async setSnoozed(map: Record<string, string>) {
    await writeJson(K.snooze, map)
  },
  async getHost(): Promise<string | null> {
    return (await readJson<string>(K.host)) ?? null
  },
  async setHost(host: string) {
    await writeJson(K.host, host)
  },
  /** 호스트 주소 삭제 — 연결 해제/호스트 변경 시. 캐시(docs/cursor/ops)는 건드리지 않는다. */
  async clearHost() {
    await AsyncStorage.removeItem(K.host)
  },
  async getDeviceId(): Promise<string | null> {
    return (await readJson<string>(K.deviceId)) ?? null
  },
  async setDeviceId(id: string) {
    await writeJson(K.deviceId, id)
  },
  async getToken(): Promise<string | null> {
    try {
      const t = await SecureStore.getItemAsync(K.token)
      return t
    } catch {
      // SecureStore 미지원(Expo Go 등) → fallback
      return (await readJson<string>(K.token)) ?? null
    }
  },
  /*
   * 변경 전 정책: SecureStore 실패(Expo Go 등) 시 token 이 있으면 AsyncStorage fallback 에 쓰고, null 이면 아무것도 안 함.
   * 변경 후 정책: null(삭제) 요청이면 fallback 키도 함께 지운다. 저장 경로는 동일.
   * 변경 이유: 설정의 "연결 해제" 후에도 fallback 토큰이 남아 재시작 시 다시 페어링된 상태로 복원되는 문제 방지.
   * 영향 범위: setToken(null) 호출 시(연결 해제)에만. SecureStore 지원 기기의 동작은 동일.
   */
  async setToken(token: string | null) {
    try {
      if (token) {
        await SecureStore.setItemAsync(K.token, token)
      } else {
        await SecureStore.deleteItemAsync(K.token)
      }
    } catch {
      if (token) await writeJson(K.token, token)
      else await AsyncStorage.removeItem(K.token)
    }
  },
}