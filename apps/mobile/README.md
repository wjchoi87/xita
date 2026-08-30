# XITA Mobile (React Native / Expo)

> v0.4 REV-001 + v0.5: **Mobile = Replica + Operation Producer.**
> UI 는 canonical 파일을 직접 수정하지 않는다 — 모든 변경은 **operation queue → push**,
> 표시는 **pull projection**. 호스트(macOS)가 꺼져 있으면 마지막 캐시를 보이고
> op 는 큐에 쌓였다가 복귀 후 flush/reconcile 된다 (§9-10).

## 구조
```text
app/                expo-router (Tabs: Home / Capture / Products)
src/
├ api/sync.ts       호스트 sync transport 클라이언트 (pair/pull/push/reconcile)
├ cache/storage.ts  AsyncStorage 캐시(docs/cursor/ops) + SecureStore(토큰)
├ queue/            Pending Operation Queue (idempotent op_id, 오프라인 축적)
├ state/store.ts    useSyncExternalStore 기반 replica 스토어 + UI projection
└ lib/              타입(서버 v4 sync 계약과 일치), id/slug 생성
```

## 실행 (사용자 확인용)
```bash
# 1. macOS 호스트(서버) 실행 — 다른 터미널
cd apps/server && node ace serve --hmr        # http://localhost:3333

# 2. 모바일
cd apps/mobile
pnpm install          # (이미 저장소 루트에서 설치됨)
pnpm start            # Expo → iOS/Android 개발 빌드 또는 Expo Go

# 3. 앱 첫 화면: 호스트 주소 + macOS 페어링 코드 입력
#    코드 발급: curl -X POST http://localhost:3333/api/v1/devices/pair
#    → {"data":{"code":"XXXXXXXX", ...}}
```
- 실기기에서는 `XITA_WS` 대신 앱에 LAN IP(host: `http://<mac-ip>:3333`) 입력
- 설정 저장 위치: AsyncStorage(호스트/큐/캐시) · SecureStore(device token)

## 검증 상태
- `pnpm exec tsc --noEmit` **PASS** (타입체크만 — Expo 런타임 UI는 사용자 확인 예정)
- Rust core 로직은 `rust/xita-core`(cargo 34 tests) + 서버 v4 API 로 이미 검증됨