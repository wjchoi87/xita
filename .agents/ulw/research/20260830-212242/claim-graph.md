# claim-graph (run 20260830-212242)
| claim_id | statement | type | risk | scope | intents | support obs | counter | groups | convergence | primary | status | final loc |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
(워커 리턴 시 반영)
| C-LIN-01 | Linear: Roadmaps renamed to Initiatives, 공식 FAQ 원문 | product-fact | normal | docs.linear.app/projects | O-01(linear-docs FAQ verbatim) | counter 검색 불요(1차 공식문서) | 1 group primary-exception | primary-only(공식문서=self) | linear app docs FAQ | supported | board/roadmap 재설계 근거 |
| C-LIN-02 | Linear lifecycle 수동전용 선언("even if all issues completed" 자동계산 거부) vs health 별축 | design-decision | normal | projects | O-01 | — | 1 | primary | supported | XITA health 축 도입 정당화 |
| C-LIN-03 | Gray=No current update 1급 상태 | design-pattern | low | initiatives | O-01 | — | 1 | primary | supported | 진행중 로드맵 빈칸=노이즈아니라 상태 |
| C-SC-01 | 'Task' 단독 명사는 이중의미 충돌로业界 회피(monday Item, Shortcut Task→Checklist+Sub-task 분리) | design-decision | normal | XITA change 명명 | O-02(shortcut release-notes 정독)+O-03(monday hierarchy article 정독) | 반례 Jira Issue+Sub-task(그건 Issue) | 2 groups | converging | primary both | supported | XITA: change→'할 일', 세부→'체크' |
| C-SC-02 | 이상어 강요 후퇴: Shortcut Milestone→Tactical Objective(2024)→Add Epic 라벨회귀(2025-11) | product-fact | normal | release-notes verbatim | O-02 | — | 1 primary | exception-primary | supported | 용어는 시장이 판정, 일상어 유지 |
| C-SC-03 | 화면용어≠데이터스키마: Jira epic개칭이 앱 파괴 경고될정도로 용어=스키마화 위험 | design-warning | normal | atlassian community 2건 | O-04(snippet 2) | — | 1 | single-snippet | partial | XITA: frontmatter type 'change' 유지, UI 라벨만 별도 계층 |
| C-PR-01 | 업계 3사 공통: 기능을 '현재/계획/출시' 3표면으로 분리, 'change' 최상위 명칭 미사용 | design-pattern | normal | Canny+Beamer+AnnounceKit+Productboard 4독립 라이브 페이지 | O-05..O-08 (각 사이트 실측) | 반례 없음 | 4 source domains | **converged** | primary(라이브 사이트 자체) | supported | XITA 용어 분해 설계의 1차 근거 |
| C-PR-02 | 계획 레인=날짜 제거(Beamer roadmap 실측: 제목만) — 시간정보는 출시 기록 전용 | observation | normal | beamer demo | O-06 | — | 1 | single | supported(low risk) | Plan 레인 스펙 |
| C-PR-03 | 세부항목=카드 인라인 전개(P8)+빈 레인 명시(P9) | design-pattern | normal | productboard+announcekit | O-07,O-08 | — | 2 groups | converged | supported | 마일스톤 트리 화면 직결 |
| C-PL-01 | 경쟁 2사(Linear/Plane) 독립적으로 로드맵 '화면' 폐기→뷰모드/레이아웃 강등 | design-pattern | HIGH(직결) | linear docs FAQ verbatim + plane sitemap 실측 | O-01,O-09 | — | 2 groups | **converged** | primary both | supported | XITA: 보드에 그룹핑키 추가, 별도 로드맵 화면 금지 |
| C-PL-02 |Plane 용어마이그레이션=UI라벨만 work item, 내부 id issue 유지(비파괴) | product-fact | high | plane docs URL/슬러그/이미지 잔존 3종 | O-09 | — | 1 primary | single-primary(exception: 잔존물 자체가 1차증거) | supported | XITA: type change 불변+표시층 — C-SC-03과도 3-way 수렴 |
| C-PL-03 | 인라인 즉시생성(Enter)+후보정 + 사이드피크 = 세부관리 표준 동선 | design-pattern | normal | plane overview.md verbatim | O-09 | — | 1 | queued-expand(inline-manage 워커 교차예정) | partial | Plan레인 스펙 |
| C-KO-01 | 한국어 UI 표준: issue-계열 1순위 '할 일', milestone/roadmap/epic은 차용어 유지(Redmine ko.yml 원문+커뮤니티 5건) | terminology | high | XITA 화면 라벨 | O-10(redmine ko.yml raw 원문 fetch) | 반례: Jira ko 혼역=실패사례로 강화 | 1 primary(+블로그 다수) | primary-exception(원문 로케일 파일=self) | supported | XUI.term 확정 |
| C-KO-02 | 병리의 실체='한 개념-여러 단어'(Jira 한국어 사용자 English 회귀 관찰) | diagnosis | high | 전 화면 | O-11(lesstif 위키 원문) | — | 1 | single-primary | supported | 용어사전 단일소스 강제 정책 |
| C-IN-01 | 5제품 공통: 진행/완료는 상태값 전용, 컨테이너는 셀 수 있는 명사 — 'Change' 실패의 병리=품사 | diagnosis | high | linear/plane/asana/notion/github 공식문서 | O-12..O-16 | — | 5 source domains | **converged** | primary all | supported | '할 일' 확정 |
| C-IN-02 | 그룹-내-생성 시 그룹 속성 자동상속(GitHub verbatim)+그룹 헤더 상시 집계 = 세부관리 표준 | design-pattern | high | github docs + asana + canny 카운트 | O-12,O-14,O-05 | — | 3 groups | converged | supported | QuickAdd/PlanLane 스펙 |
