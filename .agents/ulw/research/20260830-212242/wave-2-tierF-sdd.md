# wave-2 · Tier F SDD digest (7/9 entity 확인, GSD/Superpowers 미검증=미판정 유지)
## OpenSpec (핵심)
- **"A change is one unit of work"** — SDD 세계는 진짜로 'change'를 표준어로 쓴다! → XITA 'change'의 계보 확인, **단 그건 개발자 대상. 인간 화면은 '할 일'로 이원**이 정석 해법
- **Delta Spec**: ADDED/MODIFIED/REMOVED — "You describe the diff, not the destination" — brownfield 1순위. MODIFIED에 "(Previously: 30 minutes)" 원문보존
- **Archive = 트랜잭션**: validate→**destination claim first**→merge→실패시 rollback→cleanup. `validate --archived`로 CI가 문서정합 유지(사람 아님)
  → XITA 'Change 승인→Current State 반영'이 아직 파일병합 없음(§51 capability SHIPPED 전환뿐) — **CONSIDER 최상단: delta-merge 세션**
- Requirement 문법: RFC2119 + Scenario(GIVEN/WHEN/THEN) — Artifact 본문 표준 후보
- Stores(beta): planning-only repo/workset(개인로컬, 미커밋) = XITA 워크스페이스 개념 근접
## Kiro: gate on/off 제품설정화(QuickSpec) / **Capability matrix서 Mobile 전부 '—'** = AWS가 모바일 스펙기능 포기 → XITA 모바일 포지션 방어
## BMAD v6: ★**프로세스가 일 크기에 자기크기조정**("small changes go straight to build") ★SPEC.md 5필드 커널(Why/Capabilities/Constraints/Non-goals/Success signal) ★단일작성자 불변식 ★.memlog.md(문서옆 append-only 기억) — XITA change에 success_signal 1필드 직결 borrow
## Spec Kit: constitution 1급 / checklist="unit tests for English" / 확장 패키지화(bundle.yml) 과잉의 반대예
## Tessl: SDD→**skill governance로 피벗**("Skills are the new code") — spec생성 경쟁 포화 신호, XITA는 스키마 소유자라 안전
## Q11 답 초안(Living Artifact를 문서관리로 안 느끼게): 자동마커+ human 서명은 '의미이벤트만' / 검증은 CI가 / delta가 기본 / reject-visible
