# XITA — MVP Design v0.1

> 이 문서는 `XITA_PRODUCT_SPEC_v0.3` / `XITA_IMPLEMENTATION_STACK_v0.2` 를 기준으로 Phase 1 구현 전 설계 산출물이다.
> (SPEC §110 Step 2 deliverables: MVP IA, Domain Model, PostgreSQL Schema, API Contract, macOS/Mobile Screen Map, Phase 1 Implementation Plan)

- **성숙도**: ZERO COMPLEXITY FOR HUMANS
- **스택**: AdonisJS 6 + TypeScript + PostgreSQL(Lucid) + REST (+ 향후 SSE)

---

## 1. MVP Context

SPEC §110 Step 2 요구 산출물 중 Phase 1(Product Core)에 해당하는 것만 확정한다.
Needs You / Readiness / Workbench / Living Artifact / Handoff / Dispatch 는 Phase 2~6 에서 확장한다.

Phase 1 완료 조건(SPEC §71):

- 여러 Product 생성 가능
- Product 가 영구 객체로 유지됨
- Product 내부에 Change 반복 생성 가능
- 완료된 Change 가 History 에 유지됨
- Active Change 확인 가능

---

## 2. MVP Information Architecture (IA)

### macOS (Explore / Review / Execute) — Phase 1 기준
```
Home
├ Portfolio (Product 목록 + counts)
└ Recent Activity (Timeline)

Products
└ Product
   ├ Overview (현재 상태/진행 중 Change)
   ├ Changes
   └ Timeline
```

### Mobile (Capture / Decide) — Phase 1 기준
```
Home
├ Active Changes
└ Recent Activity

Product
├ Current
└ Active Changes
```
> Mobile Capture/Decide 는 Phase 10(Step 10) 에서 핵심 구현.

---

## 3. Domain Model (Phase 1 subset)

```
Workspace
  └──* Product
         ├──* Change
         │      ├──* ChangeEvent
         │      └──* ExternalReference
         ├──* TimelineEvent
         └──* ExternalReference
```

- **Workspace**: MVP 단일 워크스페이스(SPEC §9). auth 없이 default workspace 로 resolve.
- **Product**: 영속 진화 객체(SPEC §8). 종료되지 않음. `productionStatus`, `version` 표현.
- **Change**: Evolution Unit(SPEC §12). `IDEA→PLAN⇄BUILD→(REVIEW)→SHIP_READY→SHIPPED`, 예외 `PAUSED/CANCELLED`.
  - `lifecycle_stage` (내부 machine) vs `stage` (Human-facing 4단계 IDEA/PLAN/BUILD/SHIP) 분리(SPEC §13).
- **ChangeEvent**: Change 의 상태 전이 이력(Audit 성격, LOW-level).
- **TimelineEvent**: Human-significant History(SPEC §63). Raw commit/로그 비노출.
- **ExternalReference**: 외부 Source 요약/참조(SPEC §89 Cached Projection). 원본 복제 안 함.

---

## 4. PostgreSQL Schema (Phase 1)

| table | 비고 |
|---|---|
| `workspaces` | MVP 단일 |
| `products` | workspace_id, name, slug, status, vision, current_goal, direction, production_status, version |
| `changes` | product_id, title, slug, type, lifecycle_stage, stage, intent, goal, context, constraints, scope, priority, progress, started_at, shipped_at |
| `change_events` | change_id, event_type, from_stage, to_stage, actor_type |
| `timeline_events` | workspace/product/change id, event_type, title, occurred_at |
| `external_references` | product/change id, provider, external_id, external_url, cached_summary, status |

> Phase 2+ 테이블(`product_capabilities`, `decisions`, `releases`, `artifacts`, `artifact_revisions`, `workbench_items`, `relations`, `agent_handoffs`, `agent_dispatches`, `execution_devices`)은 이후 Phase 마이그레이션으로 추가.

---

## 5. API Contract (Phase 1, `/api/v1`)

| Method | Path | 흐름 |
|---|---|---|
| GET | `/portfolio` | 대시보드 집계(물리 성능 ≥ SPEC §37) |
| GET | `/portfolio/closest-to-ship` | 완주 후보 |
| GET | `/needs-you` | Human Decision Inbox (Phase 4 Placeholder, `[]`) |
| GET | `/timeline` | 최근 이력 |
| GET/POST | `/products` | Portfolio/생성 |
| GET/PATCH | `/products/:id` | Overview/수정 |
| GET | `/products/:id/changes` | Change 목록 |
| POST | `/products/:id/changes` | Change 생성 |
| GET/PATCH | `/changes/:id` | 조회/수정 |
| POST | `/changes/:id/transition` | 내부 lifecycle 전이 |
| POST | `/changes/:id/stage` | Human 4단계 전이 (IDEA/PLAN/BUILD/SHIP) |
| GET | `/changes/:id/events` | 전이 이력 |
| GET/POST | `/products/:id/references` ` /changes/:id/references` | Reference 관리 |
| PATCH/DELETE | `/references/:id` | Reference 수정/삭제 |

응답 래퍼: `{ "data": ... }`. 투영 필드는 서버에서 구성.

---

## 6. Screen Map (초안)

위 `## 2. MVP IA` 참조. 상세 화면 목 각 화면의 질문은 SPEC §0.4(지금 상태/뭐 하는 중/뭐 남았지/내가 볼 것)에 답하게 구성.

---

## 7. Phase 1 Implementation Plan (완료)

| # | 항목 | 상태 |
|---|---|---|
| 1 | Monorepo scaffold (apps/server, packages, docs, docker) | ✅ |
| 2 | docker-compose PostgreSQL(v17, port 9543) | ✅ |
| 3 | AdonisJS 6 + Lucid 연결 | ✅ |
| 4 | 마이그레이션 6종 + GitHub PR/Linear 참고 | ✅ |
| 5 | 모델/서비스/Validators | ✅ |
| 6 | REST API + 라우트 | ✅ |
| 7 | Change lifecycle 검증 | ✅ |
| 8 | typecheck / lint | ✅ |

**Not in Phase 1**: auth(단일 사용자), Needs You 계산, Readiness, Capabilities, Decisions, Releases, Workbench, Living Artifact, Handoff/Dispatch, macOS/mobile app, SSE, integrations.

---

# Part B — Phases 2-7 Delivered (동일 스택)

## 8. Phase 2 — Product State
- **엔티티/테이블**: `product_capabilities`, `change_capabilities`, `decisions`, `readiness_groups`, `readiness_items`, `releases`, `release_changes`, `relations`
- Capability tree(부모/자식) + Change→Capability action(CREATE/MODIFY/DEPRECATE/REMOVE, SPEC §11)
- Decision (ACTIVE/SUPERSEDED/DEPRECATED), `decide` 시 Human Timeline `MAJOR_DECISION`
- Readiness(Definition of Ship) — 그룹별 진행률 + BLOCKED blocker 식별(SPEC §19-20)
- Release lifecycle + Change 첨부 + RELEASED 시 `launched_at`(SPEC §21-22)
- `GET /products/:id/state` = Current Product State projection(SPEC §8, §96)
- **서비스**: `ProductStateService`, `ReadinessService`, `ReleaseService`, `CapabilityService 로직`, 등

## 9. Phase 3 — Workbench & Living Artifact
- **테이블**: `workbench_items`, `artifacts`, `artifact_revisions`
- Workbench lifecycle CAPTURED→…→PROMOTED/ARCHIVED; Intake는 content가 있으면 초안 Artifact 시작(SPEC §26, §100)
- **Promote**(Human Trigger, SPEC §27) → 새 Product 또는 기존 Product의 Change
- Artifact = 지속 객체, Revision = immutable snapshot + `current_revision_id` 자동 갱신(SPEC §29-30)
- 마이크로 Impact Analysis(키워드 기반 PATCH_EXISTING 제안, SPEC §31-32) + Lineage(`relations` DERIVED_FROM, SPEC §33)

## 10. Phase 4 — Human Control Plane
- **테이블**: `change_proposals`, `change_reviews`
- Proposal(Agent/Human)→PENDING→ **Needs You**(SPEC §6, §81: DIRECTION/REVIEW/SHIP_BLOCKER, severity 우선순위)
- Review Package(SPEC §50) + `POST /changes/:id/review|approve|reject`
- **Change Approval**(SPEC §51, §95, §96) — 승인 시 Capability edge를 Current State에 적용, SHIPPED 전이, timeline 기록
- `GET /needs-you` 가 실질 구현 (placeholder 제거)

## 11. Phase 5 — Agent Interface
- **테이블**: `agent_handoffs`, `agent_dispatches` (+ `changes.acceptance_criteria`)
- Context Projection(SPEC §59, §103) — change 관련 Capability/Decision/Reference/Release만 구성
- Agent Handoff Snapshot + Markdown Export(SPEC §36), JSON 생성, 이전 READY handoff는 SUPERSEDED
- Agent Result Import(SPEC §48, §93) — Review Package 생성, Deviation→Proposal, REVIEW 전이(전방 네비게이트)
- **Context Drift**(SPEC §45-46, §79) — dispatched vs current revision 비교, severity 분류

## 12. Phase 6 — Execution Devices & Local Execution (server side)
- **테이블**: `execution_devices`, `device_workspaces`(Allowed Root, SPEC §17)
- `POST /devices/authorize` → device token 발급 (outbound-only, Core는 임의 명령 금지, SPEC §41-44)
- `GET /local-execution/dispatches`(poll) / `accept` / `status` / `result`(SPEC §92)
- result → change로 Result Import 연계

## 13. Phase 7 — Integrations
- **테이블**: `integrations`, `sync_runs`
- Adapter 패턴(SPEC §54): `#integrations/*` 에 `types.ts / github_adapter / linear_adapter / index(registry)`
- GitHub REST / Linear GraphQL, sync_run 이력 + external_references upsert(Cached Projection, SPEC §55, §89)
- 실 토큰 없으면 health check가 graceful하게 FAILED에 기록

## 14. Phase 완료 상태
| Phase | 핵심 | 검증 |
|---|---|---|
| 1 | Product Core | ✅ live API |
| 2 | Capability/Decision/Readiness/Release/State | ✅ |
| 3 | Workbench/Artifact/Impact/Lineage | ✅ |
| 4 | Proposal/Review/Approval/Needs You | ✅ |
| 5 | Handoff/Markdown/Result Import/Drift | ✅ (drift HIGH 재현) |
| 6 | Device Auth/Local Execution | ✅ |
| 7 | GitHub/Linear Adapter | ✅ (graceful fail) |
| - | typecheck / lint | ✅ 전 Phase |
| - | 전체 마이그레이션 | ✅ 26종
---

## 15. Realtime (SSE) — SPEC §8
- **endpoint**: `GET /api/v1/realtime/events` — SSE stream (event: `timeline` / `change`, heartbeat 15s)
- **EventBus**: `app/services/event_bus.ts` 인프로세스 Publish/Subscribe. `TimelineService.record` 시 발행.
- MVP 는 단일 서버이므로 Redis 미도입(Implementation Stack §7). 스케일아웃 시 Redis Pub/Sub 교체 지점 명시.

---

# Part C — v0.4 리비전 적용 (XITA-REV-001, Storage & Device Sync)

> 사용자 결정: **v0.4 REV-001 우선, 충돌 영역은 기존 설계 폐기 후 리팩토링**
> (v0.4 §17 'Superseded Assumptions'). 이 문서 Part A/B 는 legacy(PostgreSQL 중심) 이고,
> **canonical storage 는 Markdown+YAML 이다.**

## 16. 적용된 v0.4 마이그레이션 (§18 Step 2~6)
- **Step 2 Domain/Persistence 분리 지향**: 캐노니컬 저장 경계를 `app/v4/` 로 분리.
  기존 Domain/Application 로직(Change lifecycle, Approval, Handoff 등)은 유지.
- **Step 3 Storage Boundary**: `MarkdownStore`(범용)가 Product/Change/Artifact/Workbench/
  Decision/Release store 를 제공. UI 는 parser 를 직접 호출하지 않음.
- **Step 4 Markdown+YAML Store**: `app/v4/doc.ts`(frontmatter parse/serialize),
  `app/v4/fs_util.ts`(atomic write), `app/v4/markdown_store.ts`(read/create/update/
  entity revision)
- **Step 5 Derived Index**: `.xita/index.json` — `rebuildDerivedIndex()` 로 삭제 후 재구성 가능
- **Step 6 Revision Engine**: `app/v4/workspace.ts`(workspace_revision),
  `app/v4/revision.ts`(entity revision, atomic mutation, idempotent op),
  `app/v4/sync.ts`(도큐먼트별 store + engine)

## 17. Sync Transport (§13) + Conflict (§12)
- `POST /sync/pull` / `POST /sync/push` / `GET /sync/status` / `GET /sync/conflicts`
  (device token 인증 — 미인증 로컬 port 금지, §14)
- Operation: `{op_id, device_id, target_type, target_id, base_revision, type, payload}`
- Idempotency: `.xita/ops.jsonl` ledger 로 같은 op 재전송 중복 적용 방지
- Conflict 정책:
  - stale revision + **status 등 semantic field** → `CONFLICT`(`needs_you`, conflicts.jsonl)
  - stale revision + **설명 등 안전 non-overlap field** → 자동 적용
- **테스트(Acceptance §21 일부)**: pull incremental, create/update push, idempotent dedupe,
  semantic conflict→Needs You, safe auto-apply, conflicts clear — ✅ 라이브 검증

## 18. 실행 / 검증
```bash
cd apps/server
node ace v4:init              # canonical workspace 초기화(+샘플)
node ace serve --hmr          # http://localhost:3333
# /api/v1/sync/pull, /sync/push, /sync/status, /sync/conflicts
```
캐노니컬 workspace 기본 경로: `apps/server/.xita-workspace/` (env `XITA_WORKSPACE` 지정 가능)

## 19. Canonical Domain REST (§18 Step 3-5 본격 적용)
- **V4Controller** `/api/v1/v4/*` — canonical Markdown workspace 를 직접 읽고 쓰는 primary 경로
  - `POST /v4/products`, `GET /v4/products`, `GET /v4/products/:id`
  - `POST /v4/products/:id/changes`, `POST /v4/changes/:id/transition`
  - `POST /v4/workbench`, `POST /v4/workbench/:id/promote`
  - `GET /v4/needs-you`, `GET /v4/status`
- **V4Domain** (`app/v4/domain.ts`) — Change lifecycle(전이 검증) / Product / Workbench promote /
  Needs You 투영, 전부 store 를 통한 entity/workspace revision 증가
- Needs You 는 캐노니컬 change(REVIEW/SHIP_READY) + sync conflict(`conflicts.jsonl`)를 합산
- **라이브 검증**: create Product→Change→transition(SHIP_READY)→workbench promote→needsYou ✅,
  `changes/*.md` YAML frontmatter + body 영속 ✅, workspace_revision 증가 ✅
- Legacy(PostgreSQL `/products` 등)는 그대로 두되 canonical 지위 아님 (§17)
\n
\n

## 20. §14 Pairing + §9-10 Offline + Living Artifact (cont.)

- **DeviceRegistry** (`app/v4/devices.ts`) — 기기를 Postgres에서 분리해 `.xita/devices.json`로 (§17 불요).
  - `POST /devices/pair` → pairing code · `POST /sync/pair {code, device_id}` → device token(일회성, TTL) · sync auth는 v4 registry 사용
- **Offline Pending Op Queue** (§9-10) — `POST /sync/defer`(큐에만 저장) · `GET /sync/pending` · `POST /sync/reconcile`(replay, idempotent).
  - reconcile에서 semantic conflict(§12)는 `needs_you`로 전송되고 v4 `/needs-you`에 노출
- **Canonical Living Artifact + Decision/Release** (`app/v4/artifact_store.ts`)
  - `artifacts/<id>.md`(현재 rev) + `artifacts/.revs/<id>-v<N>.md`(immutable revision · v0.3 §29-30 유지)
  - `POST /v4/artifacts`, `GET /v4/artifacts/:id`, `POST /v4/artifacts/:id/revisions`, `POST /v4/decisions`, `POST /v4/releases`
- **라이브 검증**: pairing(code→token, bad code 400) · offline defer→pending 2→reconcile(applied 1 + conflict 1) · conflict→needs_you · artifact rev1→rev2(current_revision·블롭) · decision/release — ✅ 전체 마크다운 영속



## 21. v0.4 데모 완성 (① 시딩·상태투영 · ② Handoff+Context Drift)

- **v4:init 풀 시딩**: Novel/PromptPick · 변경(REVIEW/PLAN/BUILD) · Workbench · Living Artifact(rev1+rev2 블롭) · Decision · Release — 10개 canonical docs
- **Product 상태 투영** `GET /v4/products/:id/state` — active/shipped/artifacts 카운트(Closest to Ship 성)
- **Canonical Agent Handoff** `GET /v4/products/:product/handoff/:change` — product/change/artifact/decision 컨텍스트 markdown
- **Context Drift** (v0.3 §45-46 원복)
  - `POST /v4/context/:artifact/dispatch` → artifact meta `last_dispatched_revision` 기록
  - `GET /v4/context/drift?product=` → current_revision vs dispatched 비교, severity(LOW/MEDIUM/HIGH)
- **라이브 검증**: productState(active 2) · needsYou(REVIEW) · handoff markdown · dispatch(rev2) → addRev(rev3) → drift **MEDIUM** 감지 ✅
- legacy PostgreSQL 는 그대로 유지되나 canonical 아님 (§17)


---

# Part D — v0.5 구현 리비전 (macaOS 코어: SwiftUI + Rust xita-core)

> v0.5 §28 은 storage/revision/conflict/sync 구현 언어를 supersede 한다.
> 합의: **v0.5 우선, 점진(migrations, Storage-first)**. v0.4 Markdown+YAML canonical
> storage 와 macOS-authoritative sync 결정은 유지(§2).

## 22. 적용 내용 (v0.5 §23-24, Storage First)
- `rust/xita-core` crate — 의존성 0(오프라인 빌드), 에디션 2021
  - `error.rs` — typed error contract(STORAGE_READ_FAILED · INVALID_FRONTMATTER ·
    REVISION_CONFLICT · …· recoverable 플래그) — §9
  - `doc.rs` — Markdown + YAML frontmatter 순서보존 parse/serialize (round-trip stable) — §5,§11
  - `storage.rs` — canonical workspace: atomic write(temp→rename), entity revision,
    workspace revision(`.xita/workspace.json`), stale base_revision → `RevisionConflict` — §11-12
  - `lib.rs` — coarse-grained API(get_products, get_product_projection) — §7
- 검증: `cargo build` ✅ / **`cargo test` 8 passed** ✅(round-trip · invalid frontmatter ·
  atomic · entity/workspace revision · stale→conflict · missing-workspace) / `cargo clippy` 0 warn
- 주의 `[검증 불가]`: Swift/Xcode 앱이 아직 없어 **Swift↔Rust Bridge/macOS 통합** 은
  지금 확인 불가 → Bridge 는 다음 단계.

## 23. Phase 4(Operation/Conflict) 구현 — Rust core
- `operation.rs` — Operation Engine + Conflict Engine (v0.5 §12-13)
  - Operation `{op_id, device_id, target, target_id, base_revision, kind, fields}` (Create/UpdateField/UpdateStatus/ResolveConflict)
  - Idempotency: `.xita/ops.jsonl` ledger · Conflict: `.xita/conflicts.jsonl` (Needs You Projection)
  - `classify()` → SAFE / SAFE_NON_OVERLAP / CONFLICT / REJECTED (v0.5 §13)
- `api::apply_operation(ws, op)` 진입점 (v0.5 §7,§12 — UI/Sync 는 canonical 직접 수정 금지)
- 검증: `cargo test` **12 passed**(Operation/Conflict 4 추가) · clippy 0 · release build ✅

## 24. Phase 5(Sync semantics) 구현 — Rust core
- `sync.rs` — v0.5 §14-15: transport 와 분리된 sync semantics 소유
  - `SyncCursor` · `SyncPullRequest/Response`(incremental, revision>cursor) ·
    `SyncPushRequest/Response`(Operation 재사용, OperationResult/Conflict 수집)
  - guard: protocol version mismatch → SYNC_PROTOCOL_ERROR · device_id 길이 검증
- Authority 유지: macOS canonical writer, Mobile replica+op producer
- 검증: `cargo test` **17 passed**(Sync 5 추가) · clippy 0 · release build ✅

## 25. Phase 6(Git/Agent) 구현 — Rust core
- `git.rs` — repository detect/open, current_branch(HEAD parse, detached=None).
  **SafetyPolicy**: ForceReset/ForcePush/HistoryRewrite/DestructiveCheckout 자동 수행 금지
  (§16,§22) — 기본 `PermissionDenied`, `authorize_unsafe()`(human 확인) 시만 통과
- `agent.rs` — detect_agents(PATH) · build_handoff(캐노니컬→markdown) ·
  write_handoff(`.xita/handoffs/`, atomic) · launch(**opt-in 필수**) · status
- 검증: `cargo test` **25 passed** · clippy 0 · release ✅
- v0.5 코어 Phase 3-6 완료. 남은: **Phase 2 Bridge(macOS 앱 필요)**, 계약 versioning(§20)

## 26. 코어 완성도(§20-21) + Phase 2 Bridge
- **계약 버전(§20)**: `schema_version=1` · `OPERATION_VERSION=1`(apply 검증) · `CURRENT_PROTOCOL_VERSION=1`
- **storage 보강(§11,§22)**: parse-before-overwrite(손상 frontmatter 덮어쓰기 금지), 원자쓰기 실패 테스트
- **Derived Index(§21, v0.4 §5)**: `IndexEngine::rebuild/load`, 삭제 후 rebuild 복원 테스트
- **fixtures + golden**(§21): `fixtures/{products,changes,decisions,invalid}` round-trip
- **Phase 2 Bridge**: `bridge.rs`(Rust cdylib C ABI, coarse UTF-8 JSON + typed error) ↔
  `macos/XitaCoreBridge`(SwiftPM: CXitaCore shim + XitaBridge wrapper)
  - Swift 테스트 4/4: open / create·safe update / stale+status→CONFLICT / typed error(WORKSPACE_NOT_FOUND) / pull
- 검증: `cargo test` **34 passed** · `cargo clippy` 0 · `cargo build --release`(dylib) · **`swift test` 4 passed**

## 27. macOS SwiftUI 앱(XitaApp) — Human Control Plane
- `macos/XitaApp`(SwiftPM executable, macOS 14+) — SwiftUI Portfolio UI
  - `AppModel`(ObservableObject): 모든 변경은 `XitaBridge.applyOperation`(Rust Operation
    Engine) 경유, 표시는 `pull` projection(이름/상태/리비전) — UI 는 canonical 파일 직접 수정 없음(§12)
  - UI: Portfolio 목록(제품/변경), Needs You 카운트, 상태 전이 메뉴(PLAN/BUILD/REVIEW/SHIPPED),
    Conflict 시 "Needs You" 알림(§13)
- bridge pull 이 name/status 프로젝션 포함하도록 확장
- 검증: **`swift test` 3 passed** — bootstrap(제품+변경 생성) / 상태 전이 반영 / stale conflict 표면화
- GUI 실행: `swift run` (XITA_WS 환경변수로 캐노니컬 workspace 지정)

---

# Part E — v0.4/0.5 모바일·CLI·정책 (최신)

## 28. XITA Mobile (`apps/mobile`, RN/Expo)
- 원칙 그대로: **Replica + Operation Producer** (v0.4 §6-10)
- `SyncClient`: `/sync/pair · pull(cursor) · push(ops) · reconcile · pending` — 서버 v4 계약과 타입 일치
- `OperationQueue`: 오프라인이면 로컬 축적, 복귀 후 flush — **op_id idempotent** (§9)
- `storage`: AsyncStorage 캐시(docs/cursor/ops) + **SecureStore**(device token, §21)
- `store`(useSyncExternalStore): needsYou/activeChanges/pending/online projection
- UI 3탭: **Home**(Needs You·Active·reconcile 버튼) / **Capture**(Quick Capture→workbench) / **Products**
- 검증: tsc PASS. 런타임 UI/페어링 E2E 는 사용자 확인 예정

## 29. xita CLI (`apps/cli`, 의존성 0)
- `status · products · needs-you · workbench · capture · handoff · context · drift` (§29 Automation 용도)
- 라이브 스모크: status/needs-you/workbench/capture(중복 제목 unique-suffix 수정 포함)/drift(MEDIUM) ✅

## 30. 인증 정책 (사용자 결정 반영)
- **개인 로컬용 → 사용자 로그인/계정 없음.** (REST/v4 API 에 auth 미적용 유지)
- 동기화 포트는 **페어링 코드 + device token**(=단말 신뢰)으로 보호 — "미인증 로컬 port 금지"(v0.4 §14)
  의 최소 구현. 필요 시 hostIdentity 서명/토큰 회전으로 강화 가능.

## 다음 단계 (v0.5)
1. macOS `swift run` GUI + Expo dev build 실기기 확인 (사용자)
2. UniFFI 평가(§8) · AI Provider Layer · SSE→Mobile 라이브 push


---

# Part F — 레거시 정리 (v0.4 §17 이행 완료)

## 31. PostgreSQL surface 제거 (2차 정리)
v0.4 §17 'Superseded Assumptions' 에 따라 아래를 **삭제**했습니다:
- `app/models/`(Lucid 모델 25종) · 레거시 컨트롤러 18종 · 레거시 services/validators ·
  `database/`(마이그레이션 26종 + 시더) · `config/database.ts`
- 의존: `@adonisjs/lucid` · `pg` · `luxon` · TS 레거시 sync 어댑터(app/integrations — Rust git.rs/향후 macOS 레이어가 대체)
- 인프라: `docker-compose.yml`(PostgreSQL) — **남아도는 dev 컨테이너/볼륨은 원하시면 삭제 가능**
  (`docker rm -f xita-postgres && docker volume rm xita_xita_pgdata`)
- placeholder 빈 디렉터리(packages/*, contracts, macos/xita) 제거
- routes 는 **v4/sync/realtime 표면만** 노출 (구 `/products` 계열은 404 — 의도됨)
- EventBus 는 `#v4/event_bus` 로 이동, `MarkdownStore.upsert`(canonical mutation) 에서
  SSE 로 DOC_CREATED/DOC_UPDATED 브로드캐스트 — 제거 후에도 Realtime §8 유지

## 32. 최종 상태
- 서버 부트·v4 CRUD·pair/pull·drift·SSE emit·CLI 전부 스모크 PASS
- git 히스토리에 레거시 Phase 1-7 구현 보존(필요 시 참조)


## 33. 마지막 구현 라운드 (남은 항목 클로즈)
- **Bridge 확장(v0.5 §7-9)**: `xita_ws_apply_op_multi`(multi-field TSV) · `xita_build_handoff` ·
  `xita_detect_agents` · `xita_git_inspect` — Swift 래퍼 + macOS ChangeDetail(Handoff 표시/복사,
  agent 칩, git branch), AppModel 테스트 5 passed
- **Mobile sync 스케줄러**(`useSyncScheduler`): foreground→pull, pending→reconcile, 활동 중 15s 폴링
  — v0.4 §13 "foreground → pull" 기본 동작을 RN EventSource 없이 폴링으로 대체(백그라운드 무동작)
- **AI Provider Layer**(`#v4/ai.ts`): rule→cache→openai-compat→fallback 파이프라인,
  workbench capture 분류 연결, `GET /v4/ai/status`. env: `XITA_AI_API_KEY/BASE_URL/MODEL`
- **pull projection**: change/workbench 의 `product` 필드 포함(mobile/macOS 연결 뷰용)
- 의사결정 기록: UniFFI 전환은 **보류**(C ABI 검증 완료, 전환 비용 > 현 시점 이점),
  `.xcodeproj` 불필요(SwiftPM 그대로 Xcode 열기 가능)


## 34. macOS 앱 종합 리뷰 & 재작업 (사용자 지적 → CHANGES NEEDED → 수정)
**판정: 원 지적 성립 (Confirmed blocker 6)** → 전부 수정:
1. Product 선택 시 상세/수정/삭제 없음 → ProductDetailView(필드 편집+삭제 확인+연결 Change/Decision/Release/Artifact)
2. Change 생성이 novel 하드코딩 → 제품 상세의 "이 제품에 새 Change"로 컨텍스트 연결 (테스트로 회귀 고정)
3. Change 내용(intent/goal/context/scope/acceptance/priority) 편집 불가 → ChangeDetailView 필드 에디터
4. 상태 전이가 자유 입력(무엇을 하는 건지도 모르게 변경 가능) → **Rust lifecycle 테이블**(§13/§78 단일 소스) + update_status 가드 + UI 메뉴가 허용 전이만 표시, 위반은 REJECTED
5. 서사(body) 편집 불가 → xita_ws_set_body / get_doc + 본문 markdown 편집 시트 (#body special field)
6. Workbench 열람/promote 불가 → WorkbenchDetailView(body+promote: 기존 제품 Change/새 제품)
+ Conflict 처리 UI: Needs You 에 동기화 충돌 노출 → "Mac 버전 유지"/"내 상태 반영" (resolve_conflict/force-apply op)
- 신규 브리지: xita_ws_conflicts · xita_ws_get_doc · xita_valid_transitions · xita_ws_set_body · delete op
- 검증: rust 39 passed · swift app **9 tests** (invalid-transition/제품연결/편집/삭제/body/promote/conflict-resolve 포함) · GUI binary ALIVE


## 35. 스펙 감사 유실 17건 이관 완료 (v0.3 §69 전체)
- **영속 Timeline**(§16/63): `.xita/events.jsonl` + GET /v4/timeline — 승인/차단/역할 이벤트 human-significant 만
- **Capabilities**(§11): 생성/목록/상태, change→capability 선언, §51 승인 시 자동 적용(CREATE/DEPRECATE/REMOVE)
- **Readiness+DoS**(§19-22): pipe-list canonical 포맷(`name|STATUS|progress|note`), 템플릿 2종, overall/blockers, Rust↔TS 교차 검증
- **Proposal**(§49): 생성(problem/proposal/reason/impact/alternatives/recommendation), §81 타입 매핑, **모바일 Approve/Reject 가능** — proposal 타입 sync 대상 포함
- **Agent Result Import/Review**(§48-50): §93 계약 → Review 생성 + deviation→Proposal + 자동 REVIEW 전이
- **Approval**(§51): capability 적용 → review 승인 → SHIPPED → Timeline
- **References/Assets**(§23/24), **Dispatch/Build This**(§38-40: 실파일/branch/opt-in agent), **Context Update**(§47), **Ready-for-Agent**(§37), **Impact Analysis**(§31), **Closest to Ship**(§7), **Workbench board/정렬**(§99), **Biography**(§104), **Since-visit**(§102), **Search**(§64), **Needs You 집계**(§81)
- Handoff §36 15섹션 + Stack §27 product_os 메타 (TS/Rust双侧)
- Mac 앱: §67 IA 기반 Product/Change/Workbench 상세 전부 + Build This 패널
- 검증: rust 40 · swift bridge 4 + app **12** · server tsc/eslint 0 · mobile tsc 0 · readiness 교차(ctypes) 동값
- 후속 완료(§36 참조)



## 36. 최종 클로즈 라운드 (남은 작업 전량)
- **① GitHub 관측 이관**: 서버 `POST /v4/products/:id/observe/github {repo}` — PR들을 **참조 요약만**
  references로 upsert(§55 복제금지, open/merged/closed + observed_at) + Timeline 이벤트. public repo는
  무토큰 허용, `XITA_GITHUB_TOKEN` 권장. 실검증: cli/cli 15건 → novel references
- **Rust git inspection 확장**(§16): `remote_url`(config parse)/`head_commit`(refs+packed-refs) —
  `xita_git_inspect` 가 `{is_repo,branch,remote,head}` 반환, 실제 저장소로 테스트(main 검증을 passthrough)
  + Mac Build This에 destination git 배지(branch/remote/head 8자)
- **② Workbench stale 제안(§99)**: pull projection에 `updated_at` 추가 → Mac Item.isStale(30일) →
  사이드바 `30일+` 배지 + 상세 "유지(mature)/아카이브" 버튼 (Human Trigger, 자동삭제 없음)
- **③ Mobile 실시간(SSE)**: `src/api/sse.ts` — expo/fetch stream reader + 자체 UTF-8 스트리밍 디코더
  (Hermes TextDecoder 부재 대응), 블록 파싱, 400ms debounce→pull, 5s 재접속(PC 재기동 대기=정상처리 §13),
  foreground 폴링은 백업 유지. store.pair/init 시 자동 연결
- **④ Mobile image intake**: expo-image-picker 15.1.0 — 사진 첨부 → capture 본문 `![capture](uri)`
  (binary 복제 없이 참조만 §55). (음성/Share Extension은 dev-build signing 필요 → 로드맵 남김)
- **Mobile 제안 승인 루프 완결**: sync push validator/TS EDITABLE_TYPES 12종 확장 →
  phone push(proposal update_status approved) APPLIED → needs-you서 DIRECTION 소멸 실증
- 최종: rust 41 · swift bridge 4 + app 12 · server tsc/eslint 0 · mobile tsc 0 · cli OK


## 37. 관측·승인 클로즈 라운드
- **Linear 관측**(§13 순위2): 서버 `POST /v4/products/:id/observe/linear` — GraphQL 이슈 요약을
  references upsert, `XITA_LINEAR_TOKEN` 미설정 시 명시 오류(조용히 넘기지 않음)
- **Mac GitHub 관측**(v0.5 §15 transport=플랫폼/semantics=코어): `GitHubObserve.swift` — URLSession fetch +
  pure `parsePulls`(NSNull 병합 판별 테스트 포함) + `apply`는 **core ops로만** references 기록 →
  Product 상세 "GitHub 관측" 카드. 재관측 시 update(upsert) 검증
- **§51 승인 코어 양쪽 완성**: Rust `approve_change`(capability 적용→review 승인→SHIPPED→events.jsonl),
  `capability_changes` canonical = pipe-list ↔ **semicolon-scalar 양식 상호호환**(Mac TSV 경로) —
  Rust 42 tests/List+Scalar 양쪽, 서버 decode 양쪽 대응
- **Mac Review 패키지 뷰**: delivered/not-delivered/tests/assessment 카드 +
  **[승인(Apply to State)]/[재작업 요청]** — swift-app **14 tests**(parse/apply/approve E2E: cap deprecated,
  change SHIPPED, review approved)
- **Mobile §14 Approve/Reject**: store.pendingProposals(docs) + resolveProposal op —
  Home Needs You 아래 **제안 카드(승인/거절)**; sync/push 검증된 12종 타입 사용
- **CLI**: `agent-result · reviews · approve · request-changes · observe(github|linear)` 추가 —
  E2E 실증: agent-result→review+SCOPE proposal→approve→SHIPPED, needs-you=[REVIEW,SCOPE]
- 최종 배터니: rust 42 · swift 4+14 · server tsc/eslint 0 · mobile tsc 0 · cli OK


## 38. 제품 관리 기능 라운드 (기획자 관점 보완)
사용자 지적: "기본 관리 기능 없음 — 진행사항/앞으로 만들 것/운영 중 여부/플랫폼/버전/배포처".
설계(§5-9/§21-22/§67/§76/§97-98) 전체 재열독 후 대응:
- 서버: releases REST(§21 상태머신, RELEASED→제품 version/current_release 동기), §22 release readiness,
  roadmap(§8 FUTURE=goal/direction+IDEA/PLAN priority), §97/98 product health 집계
- Rust: `approve_change`(§51) + capability_changes pipe/semicolon 양식 호환, handoff에 운영 프로필(버전/
  플랫폼/배포처) 섹션 — 크로스런타임 파이프 포맷 유지
- Mac: §67 제품 6탭 IA + Health 칩 + 운영 프로필 에디터 + 릴리즈 카드(준비도/차단/포함 change) +
  로드맵 우선순위 + Home Closest/제품 개요 + `xita_ws_approve_change` 바인딩
- 발견/수정: FmValue::Null↔빈문자열 왕복 왜곡('null' 스트링화) → get_doc Null→"" 통일 후 재검증,
  node 26에서 ace 커맨드 스캐너 파손(serve는 정상) → node 22 고정 안내·테스트는 v22 실행
- E2E: release 생성→change 포함→§51 승인→readiness(1/2·ready=false)→RELEASED→제품 v1.5 동기→
  next=v1.6 — CLI health/roadmap/release-readiness/reuries 실출력 확인
- 최종: rust 42 · swift bridge 4 / **app 18** · server+mobile tsc 0 · cli OK


## 39. Figma/Decisions/Agents 라운드
- Figma 관측(§13 순위4): 서버 /observe/figma + Mac FigmaObserve(URLSession, PAGE만 참조화)
- Decisions §17/§76: 서버 REST(생성/목록/supersede 체인 SUPERSEDED+supersedes 양방향 링크+이벤트)
  · Mac 결정 카드(유효/대체됨 구분, 대체 menu, 즉시 기록) · Rust handoff `## Relevant Decisions`
  (ACTIVE만 — "이 결정은 아직 유효한가" 답)
- Mac Agents §67: Local Execution(감지 agent 칩+XITA_AGENT_CMD) / Context Drift(dispatched→current,
  severity) / Dispatches(Build This 시 dispatch doc 자동 기록) / Handoffs(.xita/handoffs 파일) / events.jsonl
- **크로스런타임 발견 버그 2건 수정**:
  1) Swift slug가 한글(alphanumerics 유니코드) 유지 → Rust 파일명 sanitize(ASCII)와 불일치로
     targetId≠파일명 → **ASCII 전용 + '.'도제거(TS slugify 규칙 통일)**로 3언어 동일 id
  2) 조건식 오타(isLetter && isNumber) 즉시 교정 — 테스트가 검거
- 최종: rust 42 · swift 4+**21** · server tsc/eslint 0 · mobile 0 · figma/decisions REST 스모크 ✓


## 40. Settings 라운드 (§67 마지막 빈칸)
- Rust: `xita_ship_template_preview(type)` — §20 템플릿 정의 단방문(MOBILE 7그룹/WEB 5그룹)
- Mac SettingsView:
  - **Integrations**: GitHub/Linear/Figma env 상태 배지 + 연결테스트(rate_limit / viewer / v1\_me)
    — 토큰은 디스크 미저장(env 전용) 원칙 명시
  - **Ship Templates**: 세그먼테드 미리보기
  - **Agent Configuration**: `agentCmd`/`defaultDest` 를 워크스페이스 `.xita/settings.json`(파생 설정)에 저장,
    dispatch의 Send&Start는 env 우선→settings 순(effectiveAgentCmd). opt-in 원칙 유지(§16/§22)
- Home 제품 생성에 **Product Templates** 피커(+MOBILE/WEB_SAAS 선택 시 DoS 자동 적용 —
  테스트로 그룹 5개 생성 검증)
- Sidebar: Agents · Settings 진입 (§67 상위 IA 완성)
- 발견/수정: SettingsView 내 Swift5 string-interpolation 중첩 따옴표 컴파일 에러 → probe 헬퍼로 분리
- 최종: rust 42(Preview export 포함) · swift bridge 4 + app **24** · server/mobile tsc·eslint 0 · cli OK
- §67 IA 최종 커버: Home(Portfolio/NeedsYou/Closest/Recent) ✅ Workbench(Ideas/Research/…+Ready 정렬) ✅
  Products(§67 하위 섹션 전부) ✅ Agents ✅ Settings ✅ — **IA 전체 구현 완료**


## 41. AI 심장 축 이관 (§18/§57/§64/§87/§31 — "복잡성을 Agent가 흡수" 완성)
감사 결론: §67 IA는 채웠으나 **AI 레이어(설계의 심장)가 해골 수준**이었음 → 이관:
- **§18 Historical Explanation / §64 Ask**: `GET /v4/ask?q=` — 한국어 의도 파서
  (왜/결정→decision, 막혀→blockers, 버전/운영→version, 문서→artifacts, 오래→drift, 최근→timeline,
  주제=결제/추천… 변경), 키워드 조사정규화(paddle을→paddle)+OR매칭, **§87 근거(sources[]) 반환**,
  rule 미스 시 AI askPlan(§10). 실증: "왜 Paddle을 사용하고 있지?" → "결제 제공자: Paddle 채택 —
  이유: 수수료/글로벌 결제" + 근거 decision:payment_provider
- **§57 Historian summarize**: events 집계 → rule 내러티브, AI 설정 시 문장 생성(source: ai|rule 노출)
- **§31/§100 Patch 흐름**: suggestArtifactPatch(base_revision 스냅샷) → apply(**낙관적 동시성**:
  아티팩트가 먼저 개정되면 conflict 거부·pending 유지) / dismiss — 새 문서 생성 없이 revision 통합
  (Failure 6 방지). 실증: r2패치 applied→r3, r3패치 대기→rev4, 동시성 경로 확인
- **Mac 로컬 버전**: askLocal/summaryText(서버 없이 core 파일만으로 동일 의도 파서) — Home "물어보세요"
  카드 + Portfolio 한줄 요약
- GET /v4/artifacts 목록 누락 발견·추가
- 검증: rust 42 · swift app **25**(askLocal/summary 포함) · server/mobile tsc 0 · cli ask/summarize/
  patch/patches/patch-apply 실출력 ✓


## 42. 마일스톤 + UI 디자인 시스템 라운드 (경쟁사 패턴 이식)
리서치(공식문서 2종 직접 수집):
- Linear docs/projects: Project=성과+기한 단위, **fuzzy target date**(연/분기/월/일 — 확정도만큼), 그룹/필터/타임라인
- Linear docs/project-milestones: Milestone=프로젝트 내 단계(alpha/beta/launch/post), **progress는 started부터 가중**, 현재 마일스톤 focus 표시, 필터/그룹핑, milestone→project 승격 패턴
- (Productboard now/next/later, Jira PD ideas는 도메인 지식 반영)

설계 매핑(XITA 용어):
- XITA Change = Linear issue·PB feature(기능 단위) — 이미 있음
- **신규 Milestone** = 개발 단계 (release=대외 버전과 구분, 양쪽 존재 이유)
- Change.milestone_id 할당, 로드맵 탭 = milestone 그룹 + focus(◆)/overdue(빨강)/가중 진행률 바

구현: 서버 DocType 'milestone'(13종) + ops(CRUD/할당/**가중 progress** SHIPPED1·REVIEW·READY .75·BUILD .5·PLAN .3·PAUSED .2·IDEA .1, CANCELLED 제외)/milestone REST 5개 + CLI milestone·milestones·assign-milestone. Rust EntityType·sync 13종 동기화. Mac: MilestoneRow/로드맵 탭/미배정 카드/change 행 마일스톤 이동 메뉴.

디자인 시스템(`Design.swift` XCard/XUI):
- 8pt 그리드(pad 12·gap 10), 단일 카드 표면(.background.secondary+radius10), 상태 색을 **한 곳**에서(초록/주황/파랑/보라/빨강/회색)
- GroupBox 전량 XCard 치환 + 패딩 중복 제거 — 전체 화면 공통 적용, 빈 상태 통일
- date-only 파싱 호환(parseDateLoose — ISO8601DateFormatter 포맷 조합 함정 수정)

검증: rust 42 · **swift app 27**(가중 50%→30%·focus 전환·done 해제·overdue 신규 3케이스) · bridge 4 · server/mobile 0 · CLI OVERDUE 실출력
출처: linear.app/docs/projects, linear.app/docs/project-milestones (2026-08-29 수집)

---

## §43 Product OS 경쟁 리서치 종합 + 이관 결과 (2026-08-30)

1차 8 워크러(Huly/Plane·Leantime/agent-dispatch/obsidian·local-first/aha/methodology/community 등) +
2차 3 재시도(aha/methodology/community, jina 라우팅 우회)로 확보한 구조적 판단:

**포지셔닝 검증**
- Huly는 동일 직렬화(YAML+MD)를 import 브릿지로만 쓰고 hosted 종료(2025-07) — 우리는 정본. Plane Compose("projects-as-code", 구조/작업 2레이어)가 같은 결론에 도달한 업계 사례. Vibe Kanban도 서비스 종료 후 local workspace+export로 회귀 — 파일 정본의 생존성 근거 3건.
- HN 페인 실증: semantic drift(P2), 결정근거 유실(P3), context rot(P9), 티켓=실행화(P6) — XITA 강점 축과 1:1, 갭은 게이트/루프 쪽.

**이번 라운드 이관(코드 반영)**
1. `insight` 14번째 타입 — Leantime Insights 5분류 + Torres OST kind(OPPORTUNITY/ASSUMPTION, parent 엣지). Ask가 insight 인텐트로 근거 답함(실검증)
2. Aha scorecard — s_pop/s_need/s_strat/s_effort/s_conf(0-10 정수), 파생 점수 (P+N+S−E)×C 런타임 계산(Float 파서 제약 회피). roadmap 정렬·CLI score·macOS 채점 팝오버
3. Shape Up pitch — change에 appetite/appetite_weeks/baseline/rabbit_holes/no_gos
4. Mission Card — handoff 선두 5블록(Goal/Acceptance/Forbidden/Needs/Snapshot), TS·Rust 동일 계약(테스트 양쪽)
5. Dispatch 런 루프 — 상태머신(DISPATCHED→WORKING→AWAITING_INPUT/RESULT_READY→MERGED/FAILED)+needs-you AGENT_WAITING 자동 승격+base_sha 스냅샷+macOS 런 보드+CLI agent-update (Devin "검증 가능해야 dispatch" 원칙)
6. WHY 누락 게이트 — BUILD+에서 intent/goal 비면 Needs You(SCOPE)
7. 4문장 Product 온보딩 시트(Leantime Start-Something-New)
검증: rust 44 · swift app 30 · bridge 4 · server tsc/eslint 0 · mobile tsc 0 · CLI live 스모크(insight→ask, score 14.7 상위, AWAITING_INPUT→CRITICAL 승격, pull 14type/15docs)

**미이관 백로그(근거 있음, 의도적 보류)**
Cycle 타임박스·Intake 격리·Betting Table/Hill Chart·Goal-metric 롤업(Plane Initiatives/Leantime Strategy)·retro 자동생성·comment 프리미티브(Huly)·MCP 인게스트·workflow YAML(Plane Compose)·forecast(leadtime)·major/minor 문서표기(Huly QMS)·Release changelog/다중소속 분리.

---

## 44. 설계 적합성 전수 감사 + 리팩토링 (2026-09-04, 오너 지적 "의도대로 안 됐다")

설계문서(Part A~F + research 4문서 + MOBILE_UI_HANDOFF)를 기준으로 4개 표면을 독립 감사 → 발견 결함 전량 수정. 원칙: 기능은 설계 의도대로, 화면은 사람 언어, 실패는 조용히 묻지 않는다.

**치명 결함(사용자 눈에 기능이 깨진 것) 5건**
1. 모바일 제품 탭이 영원히 비었음 — `type === 'products'`(복수형) 필터 오타 → 단수형 수정 + UiItem.product 투영 추가
2. 모바일 flush() 가 CONFLICT op 를 지우고 정상 op 를 큐에 남김 — 필터 후 인덱스로 원배열 접근한 버그 → 1:1 순서 대응으로 수정, REJECTED 는 큐에서 내리고 안내
3. 되는 것 4레인이 실질 1레인 — capabilities(for:) 가 active 만 반환 → 전체 반환(레인 버킷은 뷰 몫), 탭 사이클 시 항목 소멸 제거
4. 자취 제품 필터 무효(`|| true`) — eventLog 가 product 까지 반환해 실제 필터링
5. change id 전역 slug 충돌 — 제품이 달라도 같은 제목이면 충돌/덮어쓰기 → Mac/서버 모두 unique-suffix(-2,-3) 규칙

**교차 런타임 계약 결함 4건**
1. **sync 커서 의미 결함(유실)**: 커서=전역 워크스페이스 리비전인데 문서의 엔티티 revision 과 비교 → 커서 이후 생성된 저리비전 문서 영구 유실. **쓰기 시 frontmatter `ws_rev` 각인 + pull 은 ws_rev 비교(레거시는 revision 폴백)** 로 Rust/서버 동시 수정, 회귀 테스트+라이브 E2E(커서 15 → 신규 문서 수신) 고정
2. lifecycle 가드 우회: update_field 로 status 바꾸면 전이 표 무시됨 — **Rust(kind 불문 Change+status 필드 검증)와 서버 sync push 경로(revision.ts, domain 표 재사용) 양쪽에 가드**, REJECTED 결과 신설. E2E: IDEA→SHIPPED 우회 REJECTED / IDEA→PLAN APPLIED
3. 타입 집합 불일치: Rust 14종(patch 누락), 서버 push validator 12종 — Rust 15종(Patch 추가: storage/sync/index/bridge), 서버 validator+docs/:type 15종 정렬
4. approve_change 출발 상태 무검증 — REVIEW/SHIP_READY 게이트를 Rust/서버 양쪽에, 서버 dead conditional 제거

**사람 언어/실패 표면화(macOS)**
- raw 노출 제거: 상태/우선순위/전이 메뉴/충돌 메뉴/kind/Product 용어/마일스톤 id 조각/product id/rev 표기/BACKLOG/WHY 없음 → 전부 XUI.term*
- 실패 침묵 제거: 생성·삭제·승격·저장 플로우 do/catch + lastError 배너. NewProductSheet 는 성공 시에만 닫힘
- ⌘K 팔레트: ↑↓ 목록 탐색+하이라이트, paletteQuestion 을 Home Ask 카드가 소비(폐루프 완성)
- Home: 에이전트 대기 줄·충돌·검토 대기 통합 + **거절한 제안 이력 노출**(Rejected Stays Visible)

**모바일 UI v2 계약 이행(MOBILE_UI_HANDOFF acceptance)**
- 결정 카드 3액션: tap=상세 펼침 / swipe 우=승인 / swipe 좀=내일로 미루기(로컬 snooze, PanResponder — 의존성 0)
- 순차 승인 모드: "위에서부터" → 1장 집중 렌더, 처리 시 자동 다음
- 제안 승인/거절은 온라인 시 REST /v4/proposals/:id/resolve(PROPOSAL_RESOLVED 자취 보존), 오프라인은 op 큐 폴백
- Capture cold-open: autoFocus + KeyboardAvoidingView, 제품/종류 선택 강요 없음
- 용어 parity: 모든 라벨 term()/statusKo()/actionKo() 경유, 알림은 의존성 미도입 원칙대로 인앱 배지 대체

**그 외**
- applyField 도 SSE 브로드캐스트(sync push 갱신이 실시간 구독자에게 보임), sync/status·conflicts 인증 실패 401 일관화, op_id 정확 매칭, MCP xita_context drift product 파라미터 수정, CLI usage() 실명령 동기화 + `xita pair`(모바일 페어링 코드 발급), env.ts AI/관측 토큰 선언, README/rust README stale 수치 갱신

**후속 정리(같은 날)**
- ContentView.swift(2,471줄) 분해 → ContentView + Views/ 10파일(상위 선언 단위 이동, 동작 변경 0). 용어 스캐너 테스트는 분해된 화면 소스 전체를 스캔하도록 확장
- 디자인 토큰을 §42 기록값(pad 12·gap 10·radius 10)으로 고정, 상태색 정의를 XUI.statusColor 로 수렴(중복 정의 2건 제거)
- **MenuBarExtra**: 앱 밖에서 Needs You 카운트/대기 목록 확인 + 3초 메모 캡처 + 앱 열기(Q13 네이티브 capability)
- ⌘K 팔레트에 "메모 담기" 액션(캡처 무결정 원칙 — 제품 귀속은 승인 때), 모바일 충돌 행에 "Mac 버전 유지" 정리 버튼

검증: rust 47 tests · clippy 0 · swift bridge 4 + app **41**(회귀 2 추가) · server tsc/eslint 0 · mobile tsc 0 · 라이브 E2E(커서·가드·milestone push) PASS
