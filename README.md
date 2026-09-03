# XITA

> **X + VITA — AI-native Product OS (Human-Controlled, Agent-Operated)**
> Zero Complexity for Humans. Product 는 영구, Change 는 일시. Human 은 WHY/WHEN, Agent 는 HOW.

## 현재 아키텍처 (v0.4 REV-001 + v0.5)

```text
macOS(호스트, canonical authority)
├─ macos/XitaApp        SwiftUI Human Control Plane
│        ↓ XitaBridge (SwiftPM)
├─ rust/xita-core       Rust core: Storage/Revision/Operation/Conflict/Sync/Git/Agent
├─ apps/server          호스트 REST + SSE + Mobile sync transport (AdonisJS 6)
│                       canonical 데이터 = Markdown + YAML Frontmatter 워크스페이스
│        ↕ /sync/pull · /sync/push · reconcile (페어링 코드 + device token)
└─ apps/mobile          React Native/Expo — Replica + Operation Producer
                        (AsyncStorage 캐시 + 오프라인 Pending Op Queue, SecureStore 토큰)

apps/cli                xita CLI (의존성 0, Agent/Automation 인터페이스)
apps/cli/xita-mcp.mjs   MCP 서버(stdio) — 코딩 에이전트가 XITA를 도구로 사용
macos/XitaCoreBridge    Swift↔Rust C ABI bridge (cdylib)
```

- **PostgreSQL/중앙 백엔드 폐기(v0.4 §17)에 따라 레거시 Phase 1-7 REST/모델/마이그레이션/Lucid·pg 의존/
  docker-compose DB 를 제거**했습니다. 데이터는 사용자 소유의 Markdown+YAML 워크스페이스 파일이 원본이며
  (`.xita-workspace/`), index 캐시는 삭제 후 `v4:init`/rebuild 로 재생됩니다.
- **인증 정책(개인 로컬용)**: 사용자 로그인 없음. sync 포트만 device token(페어링 코드 발급)으로 보호 —
  같은 네트워크의 타 단말로부터의 쓰기 차단 목적(v0.4 §14).
- **AI Provider Layer(§10 원가 우선)**: `rule → cache → OpenAI-compatible` 파이프라인.
  `XITA_AI_API_KEY`(선택) + `XITA_AI_BASE_URL`/`XITA_AI_MODEL` 설정 시 capture 분류에 AI 사용,
  미설정 시 규칙 기반으로 동작(AI 없이 전체 제품 사용 가능). 캐시는 `.xita/ai_cache/`(derived).
- **macOS**: Change 선택 → **Agent Handoff(markdown) 생성/복사**, agent 감지(PATH), git branch inspection.
- **Mobile**: foreground → pull / pending → flush 스케줄러(v0.4 §13 기본 동작, 폴링 기반).

## 빠른 실행
```bash
pnpm install
pnpm v4:init            # canonical workspace 초기화(+데모)
pnpm dev:server         # http://localhost:3333 (REST + SSE + sync)
pnpm xita status        # CLI (XITA_HOST 로 호스트 지정)
pnpm xita pair          # 모바일 페어링 코드 발급 — 앱에 입력 (10분 유효)
pnpm mobile:start       # Expo 앱 (apps/mobile/README — 페어링 코드 입력)
pnpm rust:test          # Rust core 테스트 (47)
cd macos/XitaApp && swift run    # macOS GUI (XITA_WS 로 workspace 지정)
```

## 검증
| 항목 | 결과 |
|---|---|
| `cargo test` (rust/xita-core) | 47 passed · clippy 0 |
| `swift test` (XitaCoreBridge / XitaApp) | 4 / **41 passed** (capability·readiness·proposal·dispatch 포함) |
| server `tsc` + `eslint` | PASS / 0 |
| mobile `tsc` | PASS |
| 호스트 스모크 | v4 전체 도메인 CRUD · needs-you(REVIEW+SHIP_BLOCKER) · drift · pair/pull · SSE · AI 분류 · readiness 교차(Rust↔서버) · legacy 404 |
| 사용자 확인 예정 | Expo 실기기 UI, macOS GUI, LAN 페어링 E2E |

> **Sync 커서 규약(2026-09)**: incremental pull 의 커서는 전역 워크스페이스 리비전이며
> 문서 비교는 쓰기 시 각인된 frontmatter `ws_rev` 로 한다 (문서별 `revision` 과 비교하면
> 커서 이후 생성된 저 리비전 문서가 유실된다 — Rust/서버 동일 규칙, 회귀 테스트 고정).

## 문서
- 제품 스펙: Obsidian 의 `XITA_PRODUCT_SPEC_v0.3/v0.4(REV-001)/v0.5`
- 설계/이관 기록: [docs/MVP_DESIGN_v0.1.md](docs/MVP_DESIGN_v0.1.md) (Part A/B=레거시 기록, C=v0.4, D=v0.5, E=모바일/CLI/정책, F=레거시 제거)
- 크레이트 가이드: [rust/xita-core/README.md](rust/xita-core/README.md) · [apps/mobile/README.md](apps/mobile/README.md)

- **AI 심장 축(§18/§57/§64/§87/§31)**: 서버 `GET /v4/ask`(의도파서+근거목록, rule→AI), `/v4/summarize`
  (Historian), `/v4/artifacts/:id/patch-suggest`→`/v4/patches/:id/apply`(낙관적 동시성으로 "새 문서
  반복 생성 방지"), Mac 로컬 Ask 카드/요약 — CLI: `xita ask "왜 Paddle을?" · summarize · patch · patches · patch-apply`

- **마일스톤 & 디자인 시스템**: Milestone 엔티티(서버13종/Rust/Mac) — Linear식 **가중 진행률**(started부터)·focus·overdue·미배정 그룹, 제품 탭에 **로드맵**, change 이동 메뉴. 전체 UI를 XCard/XUI 토큰(8pt·단일 표면·상태색 원천)으로 통일. CLI: `milestone(s)/assign-milestone`
- **Product OS 이관(§43 리서치 반영)**: `insight` 14번째 타입(관찰/가설/기회 — Ask가 인사이트로 근거 답변) · **Aha scorecard** `(P+N+S−E)×C` 파생 정렬(CLI `score`, Mac 채점 팝오버, roadmap 상위) · Shape Up pitch 필드(appetite/no_gos/rabbit_holes) · **Mission Card** handoff 선두 5블록(TS·Rust 동일) · **Dispatch 런 보드**(AWAITING_INPUT→Needs You CRITICAL 자동 승격, base_sha 스냅샷) · WHY 누락 게이트 · 4문장 Product 온보딩. CLI: `insight(s)/score/agent-update`
- **UI v2 (경쟁 정밀독해 run 20260830)**: 화면 용어를 데이터에서 분리 — `XUI.term` 단일 사전으로 **할 일/메모/제안/위임/되는 것/출시 기록**(스키마는 change/workbench... 불변, Plane식 비파괴 라벨 교체) · **계획 탭 = Now/Next/Later 3레인**+Enter 퀵애드(마일스톤 자동상속)+Σ베팅 주수 경고 · **되는 것 4레인** 기능 리스트 · **Two-Layer 타임라인**(의미 마커 펼침/기계 이벤트 접힘/Show older) · **⌘K 커맨드 팔레트** · 출시 기록 월-그룹+released_at · 모바일 TERM parity · events `event_type` 캐논화. 근거: `research/` 4문서
- **MCP 서버 (에이전트 인게스트)**: `node apps/cli/xita-mcp.mjs` (stdio JSON-RPC, 의존성 0) — Claude Code/Cursor/Codex 가 `.cursor/mcp.json` 등록 후 `xita_status → xita_handoff(Mission Card) → 작업 → xita_agent_update(RESULT_READY) → 사람이 Needs You에서 승인` 폐루프. 쓰기 도구는 agent_update/insight_add 2종뿐(나머지 읽기 전용 — Human decides 원칙). env: `XITA_HOST`(기본 3333), `XITA_DEVICE_TOKEN`

## 남은 로드맵
1. macOS GUI 실동작 확인 + workspace 이관 polish
2. SSE → Mobile 실시간 반영(push 대신 알림성 refresh)
3. UniFFI(§8) 평가 — C ABI 대비 DTO/async 개선
4. AI Provider Layer(Historian/Librarian/요약) — Rule→Query→Cache→small model 순 원칙
5. Git/GitHub·Linear 외부 관측은 Rust core(git.rs) + macOS 레이어로 확장
