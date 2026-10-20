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

apps/server/public/app  웹 콘솔 (/app) — 포트폴리오·배포·기록·문서, 라이트/다크/시스템 테마
portfolio/              planner 흡수 도구 (deploy.py·스토어 산출물·스캐폴딩·템플릿) → portfolio/README.md
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

## 포트폴리오 — 모든 프로젝트를 한 곳에서 (planner 흡수)

`~/workspace/auto-money/planner` 의 레지스트리·빌드·딸깍 배포·스토어 버전·광고 ID·애드몹 수익·앱 기록·변경내역·명령 런처를
XITA 로 흡수했다. 프로젝트 = Product(+`repo_path/codename/portfolio`), 앱 기록 = 제품 일대기(타임라인),
planner 문서 = Living Artifact(리비전 보존), planner 원문 = `archive/planner/` (sha256 manifest). 설계·API 계약: [docs/PORTFOLIO.md](docs/PORTFOLIO.md)

```bash
pnpm xita import-planner --dry-run   # 서버 실행 중: 무엇이 들어올지 미리보기
pnpm xita import-planner             # 흡수 (재실행 안전 — 같은 건 건너뛰고 바뀐 문서는 새 리비전)
open http://localhost:3333/          # 웹 콘솔 (브라우저는 /app 으로 이동)
pnpm xita projects | project P | run [P] [명령] | deploy P [--track T] | log P | sync | changelog
```
- **컨트롤 타워(2026-10)**: 프로젝트별 작업 보드(아이디어·할 일·마일스톤) · AI 기획 위저드(`xita plan`, 웹 기획) ·
  홈 '오늘의 조언'(6시간마다 수익·출시·작업 점검 → 로컬 AI 조언) · 수익 일별 기록 · 홍보글 초안·기록(자동 게시 없음) ·
  AI provider 직접 추가(OpenAI 호환 http / `xal run` 같은 CLI). 상세: docs/PORTFOLIO.md
  ```bash
  pnpm xita plan            # AI 가 질문하며 새 프로젝트 기획 (확정 전까지 초안만)
  pnpm xita work P          # 작업 보드  · xita idea P "…" · xita todo P "…" · xita move ID doing
  pnpm xita advice [--run]  # 수익 극대화 조언
  pnpm xita promo draft P geeknews   # 홍보 초안
  pnpm xita ai              # AI provider·체인·사용량
  ```
- 실행 계열 API(빌드·배포·명령·가져오기)는 **이 컴퓨터(loopback) + localhost Origin** 요청만 허용, 프로덕션은 `confirmed` 이중 잠금.
- 비밀 파일(play-account.json·keystore)은 옮기지 않는다 — 앱 gradle 이 `planner/tools/keystore.properties` 를 참조. 위치는 `XITA_SECRETS_DIR`.
- 서버 기본 workspace 는 macOS 앱과 같은 `~/.xita-workspace` (이전 기본 `apps/server/.xita-workspace` 는 그대로 남아 있음 — 쓰려면 `XITA_WORKSPACE` 지정).

## 빠른 실행
```bash
pnpm install            # Node 24 (.node-version) — Node 26 에서는 ace 커맨드 로더가 실패한다
pnpm v4:init            # 빈 workspace 일 때만 초기화(+데모). 제품이 있으면 아무것도 안 함
pnpm dev:server         # http://localhost:3333 (웹 콘솔 + REST + SSE + sync)
pnpm xita status        # CLI (XITA_HOST 로 호스트 지정)
pnpm xita pair          # 모바일 페어링 코드 발급 (10분 유효) — 웹 콘솔 설정 → 모바일 연결에서도 발급
                        # 폰에서 접속하려면 서버를 HOST=0.0.0.0 으로 실행 (코드 발급은 이 컴퓨터에서만 허용)
pnpm mobile:start       # Expo 앱 (apps/mobile/README — 페어링 코드 입력)
pnpm rust:test          # Rust core 테스트 (47)
cd macos/XitaApp && swift run    # macOS GUI (XITA_WS 로 workspace 지정)
```

## 검증
| 항목 | 결과 |
|---|---|
| `cargo test` (rust/xita-core) | 47 passed · clippy 0 |
| `swift test` (XitaCoreBridge / XitaApp) | 4 / **50 passed** (포트폴리오 카드·테마 매핑 포함) |
| server `tsc` + `eslint` | PASS / 0 |
| server `node ace test` (portfolio 흡수·앱 기록 + 작업 보드·AI 라우터·기획 위저드·모니터링 규칙·sync 리비전 회귀) | 23 passed |
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
