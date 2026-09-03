# xita-core (Rust)

XITA 공유 코어 (v0.5). **Native UI(SwiftUI) / Product mechanics(Rust)** 원칙에 따라
macOS 구현의 Domain·Storage·Revision·Conflict·Sync semantics 를 소유한다.

> 현재 단계: v0.5 Phase 3-6 + **Phase 2(Bridge)** 구현 — Storage · Operation/Conflict ·
> Sync · Git/Agent · Swift↔Rust Bridge(CDylib C ABI) 모두 Rust core 기준으로 동작 검증됨.

## 빌드·테스트
```bash
cd rust/xita-core
cargo build
cargo test    # 47 tests (Storage 6 + Operation/Conflict 12 + Sync 6 + Git 5 + Agent 7 + Index 3 + Bridge 2 + golden 5 + 기타)
swift test    # 4 tests (open / create·update / conflict+typed error / pull) — macos/XitaCoreBridge
cargo clippy --all-targets   # 0 warnings
```

## 구조
```text
src/
├ lib.rs       # crate API + coarse-grained api 모듈 + apply_operation 진입점 (v0.5 §7, §12)
├ error.rs     # typed error contract (STORAGE_READ_FAILED, REVISION_CONFLICT ...) — v0.5 §9
├ doc.rs       # Markdown + YAML frontmatter parse/serialize (round-trip stable) — v0.5 §5,§11
├ storage.rs   # canonical workspace: atomic write, entity/workspace revision, stale→conflict — §11-12
├ operation.rs # Operation Engine + Conflict Engine — v0.5 §12-13 (Phase 4)
├ sync.rs      # Sync protocol semantics — v0.5 §14-15 (Phase 5)
├ git.rs       # Git inspection + SafetyPolicy(위험 git 자동 수행 금지) — v0.5 §16 (Phase 6)
└ agent.rs     # detect/build/write/launch/status agent abstraction — v0.5 §16 (Phase 6)
```

## Operation / Conflict (Phase 4)
- **Operation**: `Operation { op_id, device_id, target, target_id, base_revision, kind, fields }`
  (kind: Create / UpdateField / UpdateStatus / ResolveConflict)
- **작동 순서** (v0.5 §12): revision check → validation → idempotency(`.xita/ops.jsonl`) → canonical
  mutation → conflict 기록(`.xita/conflicts.jsonl`)
- **Conflict Engine** (v0.5 §13): `classify()` → `SAFE`(base 일치) / `SAFE_NON_OVERLAP`(stale+안전 필드
  자동) / `CONFLICT`(stale+semantic → Needs You) / `REJECTED`(대상 없음/빈 필드)
- semantic 필드: status, lifecycle, stage, shipped_at, cancelled_at, paused_at, current_revision, supersedes

## 의존성/설계 메모
- **의도적으로 0 외부 크레이트** (오프라인 빌드 보장). frontmatter 는 순서 보존
  scalar/list 로 자체 파싱하며, Rust 가 생성한 값을 원형 복원한다.
- 알려지지 않은 필드는 보존(§22). Real YAML crate(`serde_yaml_ng` 등)는 확정 시 도입.
- `now_iso()` 는 std-only epoch 견적. 정확한 캘린더 ISO 는 chrono 도입 시 대체.

## Sync protocol (Phase 5)
- Transport 분리(§15): core 는 semantics(version/cursor/pull/push/result/conflict)만 소유
- `SyncCursor(ws_rev)` · `SyncPullRequest/Response`(incremental changes) · `SyncPushRequest/Response`
- Push: Operation Engine 재사용, 결과(`OperationResult`)와 `Conflict`(→Needs You) 수집
- Guard: protocol version mismatch → SYNC_PROTOCOL_ERROR, device_id 길이 검증

## Git / Agent (Phase 6)
- `GitRepo::detect/open` + `current_branch`(HEAD parse, detached=None) — inspection 전용
- `SafetyPolicy` — ForceReset/ForcePush/HistoryRewrite/DestructiveCheckout 은 **기본 거부**(§16,§22),
  `authorize_unsafe()`(Human 명시 확인) 시에만 통과
- Agent abstraction — `detect_agents(PATH)`(opencode/codex/claude/qwen-code) ·
  `build_handoff(ws, product, change)`(캐노니컬에서 markdown 생성) · `write_handoff`(`.xita/handoffs/`, atomic) ·
  `launch_spec + AgentProcess::launch`(**opt-in 필수**, §22) · `AgentProcess::status`(Running/Exited)

## 완성도 정리 (§20-21)
- 계약 버전: `schema_version=1`(workspace.json) · `OPERATION_VERSION=1`(검증) · `CURRENT_PROTOCOL_VERSION=1`
- `parse-before-overwrite`: 손상 frontmatter 를 조용히 덮지 않음(INVALID_FRONTMATTER 전파, §22)
- Derived Index(`.xita/index.json`) — 삭제 후 `IndexEngine::rebuild` 복원 테스트
- fixtures/ + golden round-trip 테스트(products/decisions/invalid)

## Bridge (Phase 2) 사용법
```bash
cd rust/xita-core && cargo build --release          # target/release/libxita_core.dylib
cd macos/XitaCoreBridge && XITA_RUST_LIB=$PWD/../../../rust/xita-core/target/release swift test
```
- C ABI 18종+free: `xita_ws_open / xita_ws_apply_op / xita_ws_apply_op_multi / xita_ws_pull /
  xita_ws_index_rebuild / xita_build_handoff / xita_detect_agents / xita_git_inspect /
  xita_ws_conflicts / xita_ws_get_doc / xita_valid_transitions / xita_ws_set_body /
  xita_apply_ship_template / xita_patch_readiness / xita_ship_template_preview /
  xita_ws_approve_change / xita_ws_readiness / xita_free_string` (전 목록은 bridge.rs)
- 오류: JSON `{ok:false, code, message, recoverable}` → Swift 는 `XitaBridgeError.rust(code, message)` 로 변환

## 다음 단계
1. macOS SwiftUI 앱(Xcode 프로젝트) — 이 Bridge 위에 Human Control Plane UI
2. UniFFI 평가(v0.5 §8 후보) — DTO/async/에러 매핑 개선 여부
3. Migration(Fixture→실 workspace) 및 실제 포트 폴렉스