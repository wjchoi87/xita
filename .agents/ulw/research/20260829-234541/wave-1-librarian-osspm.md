# wave-1 · oss-pm-compare digest (orchestrator)
full record: agent-oss-pm-compare-*.md

## Plane (docs.plane.so / plane.so / makeplane GitHub)
- 개념 인벤토리: Cycles(타임박스, 병행 가능, **auto-rollover 미완료 items, cooldown=retro 버퍼**, burndown points/counts 전환) · Modules/Epics · Initiatives(멀티프로젝트, 상태 초안→종결, **updates stream: On/At-Risk/Off-Track 롤업**) · **Workflows & Approvals(타입별 상태머신, 전환 권한, transition pre/post 조건-스크립트 검증, 변경이력)** · Estimates(Fibonacci/T-shirt/Time) · **Intake/Triage(외부 요청 전용 격리 상태, accept 시 진입 단계 선택, public form/email)** · **Workspace Releases: "Cycle=시간 컨테이너, Release=버전 컨테이너" 분리, tag+target/actual 날짜 분리, 다중 소속(link만), Changelog 독립 문서, 상태는 사람만 확정** · Dependencies/Custom Relations · Recurring · PQL 쿼리 · **Plane Compose: projects-as-code — plane.yaml+.plane/schema/*, schema push/pull, "구조 레이어 vs 작업 레이어; specs/decisions/templates가 지속 데이터"** ← **XITA 검증 자료(업계가 똑같은 결론에 도달)**

## Leantime (leantime.io / support / GitHub)
- **방법론 화면 자체가 제품**: Start Something New → Strategy→Plan→Project 4문장 강요(무엇을/성취시 세상은/focus 3-5/metrics), Focus Areas=Balanced Scorecard 기본값
- **Strategy→Goals→Work 롤업**(goal relation, dependency reporting)
- **Insights 5분류**(observation/interview/focus-group/secondary/derived) + data/conclusions/assumptions 기록 — '가설 1급 객체'
- **Project Blueprints(Value Canvas 등 8보드)**, Retros 자동생성(Continue/Stop/Improve, milestone attach), Idea parking lot
- 개인 계층: timeboxing+private notes+**이모지 감정→AI 우선순위· 짝짓기**

## Tracker(factly): **부정 판정(음성 결과)** — GitHub API 0건/도메인 미해석/HN 없음 → 이 축 콘텐츠는 Plane/Leantime에서 대체 확보. 기록: 존재 주장 금지.

## XITA 갭 Tier A (이 워커 유래)
- G-O1 Insight/Assumption 엔티티 (`insights/*.md`: kind, confidence, links) — AI 연료, cheap-mediate
- G-O2 Cycle(타임박스 리듬 + rollover + cooldown) — mediate
- G-O3 온보딩 인터뷰 플로우(신규 product: 4문장 강제) — cheap, **UX 요구("관리기능" 불만 직결)**
- G-O4 Goals/Metrics 롤업 + On/At-Risk/OffTrack — mediate
- G-O5 workflow YAML 템플릿/전환 조건 — late(핵심은 이미 lifecycle+guard)
- G-O6 Intake 격리 상태 — mediate(workbench와 통합 가능)
- G-O7 Release 개편: target/actual 분리·changelog 문서·link-only 범위 — **cheap, 기존에 필드만**
- G-O8 retro md(Continue/Stop/Improve) — cheap

## EXPAND (worker tail — 잘려 재확인 불요분 다수, 유효 리드)
- LEAD: Plane Compose 상세(plane.yaml 스키마 언어) — WHY: workflows 구조 파일화 설계 직결 — ANGLE: docs.plane.so compose page fetch
- LEAD: Plane AI/MCP "Agent Run lifecycle tracking" — WHY: XITA dispatch 상태머신 벤치마크 — ANGLE: docs MCP/agents page
