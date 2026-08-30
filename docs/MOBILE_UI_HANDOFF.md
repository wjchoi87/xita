# Agent Handoff — Mobile UI v2 (Capture / Decide 강화)

> 상태: **HOLD — 이 문서가 산출물.** 구현은 위임받을 에이전트가 이 파일 하나로 착수할 수 있어야 함.
> 형식: XITA Mission Card 계약(run 20260829) + 경쟁 리서치 근거(run 20260830, `research/` 4문서)

## Mission Card

**Goal** — XITA 모바일을 "반응하고 미루는 기계"로: Linear Mobile 공식 정의("companion — react+defer") + Drafts("캡처 무결정") + Notion Agents iOS("capture하면 에이전트가 다음 수순") 3소스 수렴 설계의 macOS-패턴 이식.

**Acceptance** (모두 검증 가능해야 — Devin 원칙)
- [ ] `npm run web` 또는 expo dev로 실행 후 아래 화면들이 실제 렌더될 것
- [ ] 결정할 일 카드 3액션: tap=상세 / swipe 좌=거절(snooze 내일) / swipe 우=승인 — ProposalCards에 구현, 서버 REST `/v4/proposals/:id/resolve` 재사용
- [ ] 순차 승인 모드: 대기>1건일 때 "위에서부터" 버튼 → 카드 1장 집중 렌더(Notion top→bottom approve), 처리 시 다음장으로 자동 이동
- [ ] Capture cold-open: 탭 진입 시 텍스트필드 자동 포커스(KeyboardAvoiding+autofocus), 제품/타입 선택 UI 없음 유지(Drafts 규칙 — 이미 무결정, 포커스만)
- [ ] 알림 스케줄: 푸시 로컬 통지 시 로컬 시간 22시~07시 mute(개인 정책 = 취침 시 AGENT_WAITING는 조용히)
- [ ] `xita-mobile` 용어 유지: 모든 신규 문자열은 `app/(tabs)/index.tsx` 상단 `TERM/STATUS_KO` 사전 경유 — 하드코딩 금지
- [ ] `npx tsc --noEmit` 0에러 (현재 green — 이 기준 깨지면 안 됨)

**Forbidden (손대지 마)**
- sync/queue 프로토콜(`src/lib/types.ts`, `src/queue/operationQueue.ts`, `src/api/sync.ts`) — 14type TargetType union만 유지, 서버 동시 변경 없이는 건드리지 말 것
- 구조 관리 기능 신설 금지(뷰 빌더/필터 생성/메타편집 패널) — `research/XITA_GAP_ANALYSIS.md` AVOID 10조항 준수가 goal보다 중요
- macOS/서버/Rust 코드 수정 금지 (mobile scope: `apps/mobile/`만)
- 사용자 인증 추가 금지 (개인 로컬 정책)

**Needs From User**
- 푸시는 expo-notifications 도입 판단 필요(의존성 추가 = AGENTS 패키지 규칙 검토 대상) — 없으면 인앱 배지로 대체, 임의 설치 금지

**Snapshot** — workspace_rev ~24 · run 20260830 · 커밋 `69b5e08` 이후 · 모바일 현주소: Home(결정할 일/진행 중/최근 움직임·TERM parity 완료), Capture(텍스트+이미지→workbench+reference), Products(목록+생성) · tsc green · 오프라인 queue/SSE 존재

## 배경 컨텍스트 번들 (읽을 순서)
1. `research/UX_PATTERN_LIBRARY.md` — §E 표(Tier H+I): Three-action Inbox / Cold-open / Read-only Docs / Screenshot→Triage / OS-native Entry Only / Ask-on-arrival Digest
2. `research/XITA_UI_RECOMMENDATIONS.md` §2 — 버릴 것/남길 것/차기 4항목의 정본
3. `docs/MVP_DESIGN_v0.1.md` Part C(§20/§26) — 모바일 아키텍처 원칙(레플리카·큐·capture)
4. `apps/mobile/app/(tabs)/index.tsx` — TERM/STATUS_KO 사전과 현재 Home
5. 스토어 등록 전제 아님 — 개인 사용-first

## 작업 후 보고 경로
- 이 창이 XITA MCP에 연결돼 있으면: `xita_agent_update(id, RESULT_READY, note)` / 발견한 사실은 `xita_insight_add`
- 아니면: 이 문서 하단에 `## Run log` 추가
