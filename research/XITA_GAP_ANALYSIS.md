# XITA_GAP_ANALYSIS
> 브리핑 §16 분류: KEEP(충분/우위) / IMPROVE(있으나 개선) / CONSIDER(없음, 검토 전용 — 요구 승격 금지) / AVOID
> 근거: run 20260830-212242 (16 워커) + run 20260829 (경쟁 8 워커). Complexity Audit 점수는 §5.

## KEEP — 경쟁이 못 가진 것 ( 방어 자산 )
| 자산 | 경쟁 비교 근거 |
|---|---|
| **파일 정본 소유** (exit cost 0, 백업=복사) | Huly hosted 종료(2025-07)·Vibe Kanban shutdown→local 회귀·Spark/airfocus 전부 DB 정본 |
| **Needs You 단일 결정 큐** (12+타입, 에이전트대기 자동승격) | airfocus에 1인용 결정큐 없음, Prodeology는 게이트 폭증(단계마다) |
| **Readiness = Definition of Ship 기계판정** (pipe-list, blockers) | CrystalSpec publish 체크리스트는 '의식', 우린 데이터 |
| **Closest to Ship / Biography / sinceVisit 파생뷰** | 경쟁 대부분 '현재 목록'만 있고 서사 파생뷰 없음 |
| **모바일 오프라인 operation queue + replica** | Kiro Mobile 스펙기능 '—'(AWS 포기), Spark 모바일 없음 = 무주공산 |
| **WHY 누락 게이트** (BUILD+ intent 없으면 승격) | Prodeology "needs work first" 패널과 동일 직관 — 교차검증됨 |
| **Mission Card handoff + base_sha** | Devin/Conductor/Prodeology interchange 동시 수렴 축 |
| **AI 자기키 무제한, source 라벨(rule|ai)** | Spark credit 과금(스펙당 50-200)/Prodeology 모델 자동라우팅 대비 투명 |

## IMPROVE — 개념 있음, UX 격차 (이번 코드 반영 포함)
| 항목 | 격차 | 처치 | 상태 |
|---|---|---|---|
| Change 용어 | 그릇명 추상명사(품사 위반) | XUI.term '할 일' 표시층 | ✅本轮 |
| 계획 화면 | 마일스톤 나열만 — Now/Next/Later 없음 | 3레인+퀵애드+Σ베팅 | ✅本轮 |
| 기능 리스트 | 상태 하드코딩 'active' | 4레인 실상태+탭사이클 | ✅本轮 |
| 타임라인 | 릴리즈+체인지 목록(시간축 없음) | Two-Layer 마커 스트림+Show older | ✅本轮 |
| 내비게이션 비용 | 사이드바 스크롤 탐색뿐 | ⌘K Type Travel | ✅本轮 |
| 출시 기록 | 카드 나열 | 월 헤더+도메인 접두 3분류 렌더 | CONSIDER(차기) |
| Health | milestone overdue뿐 — 사람 판단 health 없음 | On/At risk/Off/**No update(Gray)** 4치 수동 칩 | CONSIDER(차기, 자동계산 금지 원칙 병기) |
| Ask 진입 | 탭 파편 | 팔레트→Ask 연결 완료 | ✅本轮 |

## CONSIDER — 없으나 검토 가치 (요구 승격 금지)
1. **MCP server 내장** (agent가 handoff/context pull — Spark "no copy-paste no lost handoff" 상용화 등장으로 전략 긴박도 ↑)
2. Depth-as-Time 스냅샷 뷰 (Time Machine) + Append-only Restore
3. Baseline delta 진행 ("% 대신 밀림", Q10)
4. Proposal 3타입(생성/수정/삭제)+항목별 deny, rejected-visible 강화
5. Top→Bottom 순차 승인 큐 (NeedsYou 카드 제스처)
6. SDD delta-merge: Change 승인→Capability/Current State 반자동 병합 (OpenSpec archive-transaction 원리)
7. Milestone→Project 승격 제안
8. Share extension/Siri 캡처 (Things/Drafts/Linear 3수렴 — OS-native entry only 원칙 내)
9. Dual-focus 4버킷 (obvious-yes/tradeoff/cut/uncertain) — 1인은 과할 수 있음, scorecard로 흡수 중
10. Insight→Opportunity 트리 뷰 (parent 필드 이미 있음, 렌더만)

## AVOID — 절대 반입 금지 (F. 안티패턴과 1:1)
- 객체 증가로 문제 풀기(Prodeology 25), 점수축 다종, 팀 ceremony(edit lock/2단승인/포털/Poker), 뷰 빌더·쿼리언어(PQL류), 스키마 사용자 설계(Fibery), 그래프 커스터마이즈(GitKraken), VOC/customer-requests 포털(1인 정책), marketing어를 메뉴로, **health 자동계수(사람 판단 강탈)**.

## §5 Human Complexity Audit (0=부담0 · 10=도구를 관리)
| 제품 | 점수 | 최대 발생원 |
|---|---|---|
| Time Machine | 0.9 | — (기준선) |
| Figma Version History | 1.9 | named version 작성(선택) |
| Things | ~2 | 태그/헤딩 '쓰기로 결정'할 때만 |
| GitKraken graph | 4.9 | 레이아웃 커스터마이즈 |
| CrystalSpec | 6.0 | 팀 ceremony(edit lock/publish 체크) |
| Prodeology | ~7.9* | 게이트 폭증+점수 4종+nav 부채 (*render 기반 추정) |
| airfocus | 7.5 | 조직 인터페이스 그 자체 |
| Plane/ClickUp/ monday heavy | 7~8 | 계층/위젯/셀프-admin |
| **XITA 목표** | **≤2.5** | 1인·파일·무설정 — 현재 잔여부담: 채점 5필드(선택), DoS 항목 수동 |
