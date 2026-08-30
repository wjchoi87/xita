# COMPETITIVE_LANDSCAPE
> XITA 경쟁/인접 제품 지형 — ULW run 20260830-212242 (16 워커, wave1 8 + wave2 8) + 이전 run 20260829 (Huly/Plane/Leantime/dispatch).
> 근거 없는 제품은 지옥문(DEAD)에 두고 절대 대체서술하지 않는다. 근거: 각 워커 저널 `../.agents/ulw/research/*/wave-*.md`

## 0. Entity Resolution 결과 (브리핑 §3 지명 제품)

| 브리핑 지명 | 판정 | 근거 |
|---|---|---|
| Prodeology | **LIVE** (2023 PH launch, 2026 'Product OS' 피벗, v0.9) | prodeology.com 200, PH `/products/prodeology`, Nir Ehrlich. HN 0건·리뷰 0건 = 초기 |
| **Product f()** | **DEAD — 실체 없음(강)** | productf.ai NXDOMAIN / productf.com=2023-24 체중감량 워드프레스 스팸(Wayback CDX 40건 실측) / HN·Bing 무관. §3의 12개 시그니처 용어 어디서도 불일치. *잔여가설: Lumio founder Julia Petretta 계열 명칭 혼입(미검증)* |
| **Satori OS** | **DEAD — 정확일치 제품 발견 실패** | DDG exact-phrase 4종 No results, 무관 블로그 6건만 |
| CrystalSpec | **LIVE** | crystalspec.com + app./guide/about/resources, GitHub org, X @crystal_spec 2026-07 활동 |
| Lumio (getLumio.ai) | **LIVE (pre-GA, sales-gated)** | getlumio.ai 301→200, Lumionor Ltd (England No.16908717), founder Julia Petretta, 리서치 리포트 2026 |
| GSD / Superpowers (Tier F) | 미검증(판정 보류) | 워커 상한 소진 — 존재도 부재도 주장 안 함 |
| Bevelio / Golance (이전 spawn) | **DEAD** | goLance=프리랜서 마켓(무관), Bevelio=노이즈만 |
| Tracker (factly) | **DEAD** | GitHub 0건·도메인 미해석 |

## 1. Tier A — 직접 경쟁

### Prodeology — "The product brain behind your coding agent"
- **Mental model**: `Discover→Validate→Prioritize→Manifest→Learn` 단일 루프, 그 밑에 brain. "Coding 100× faster, product thinking didn't. Bottleneck moved upstream."
- **Objects**: 공개 랜딩 실명 **25+** (Signal/Surface/Evidence/Focus/FEATURE·DIRECTION·EDGE/Verdict(BUILD·VALIDATE·DEFER·KILL)/Bucket 4종/DESIR·VIAB·FEAS 점수/Manifest/Pipeline·Step·Gate/Policy/Skill/Rule/Flow/Lesson...)
- **Product 영구성**: 미확인(nav은 Workspace/Pipeline/Focus; "Product" 1급 네비 부재 의심) — ship 후 History로 돌아가는 축은 **인과추적(trace)이지 전기(biography)가 아님. History 뷰 전무**
- **★ Dual-Focus Alignment View**: 두 목표에 각각 랭크 → obvious-yes/tradeoff/cut/uncertain 4버킷, tradeoff를 평문 제시 — 단일 스칼라 강제 회피의 유일한 실증
- **Needs-work-first 패널** ("brief가 얇은 항목 선별") = XITA WHY 게이트와 동일 직관 **교차검증**
- Handoff=Manifest interchange "switch your coding agent tomorrow, upstream stays" (Cursor/Claude/Devin) = XITA thesis 동일, brain은 클라우드
- **Human Complexity 7.9** (추정, marketing-render 기반): step마다 human gate(4단계 파이프라인=게이트 4개), 점수축 4종 공존, nav 유령페이지 30개(IA 부채), pricing 빈 행과 "Every capability, every plan" 불일치
- Mobile/macOS: **evidence 0** → XITA 영역

### CrystalSpec — "Living Product Specs for Teams and Agents" (XITA 개념 근접 클론)
- Mental model: "코딩은 병목 아니다, 무엇을 지을지 아는 게 병목" — living spec 1본, AI 제안뿐("Nothing writes until you approve"), agent는 승인된 최신 revision만 읽음. "Change is inevitable. Drift isn't."
- Objects 18+: Flow/Step/Trigger/Data model/Test case/Phase/Epic/Terminology/Revision(draft·published)/AI Proposal/Tracker/Analyzer finding...
- **Borrow 6**: ① Proposal=create/update/delete 3타입+**항목별 deny**(편집단위 diff) ② **Rejected proposals stay visible** ③ Revision message "what+why" 강제+Revert ④ 검사는 **published revision 기준**임을 화면이 선언 ⑤ finding=등급+원문 인용+fixable-with-AI ⑥ ⌘K 객체 직점프
- **AVOID**: default-approved(rubber-stamp 함정 — XITA는 기본 pending), edit lock/Send-for-approval(팀 전제 ceremony), publish 8-체크, Tracker 이원축
- **Drift UX 실증 답**: diff가 아니라 **진단 리포트**(contradiction·gap·dead terms, graded+quoted)
- Human Complexity **6.0** — 대부분 협업 전제 비용 → 1인 XITA는 원천삭제 가능(우위 논거)

### Lumio — "Product context straight from the code"
- 코드 단일소스: repo read-only 20-30분 스캔 → Map(Journey/State/Service). "Claude Code gives you an answer. Lumio gives you the record."
- 3종 신호: 엣지 밀집/취약 로직/**"what only looks live"(유령 기능)** — Observed 신호 후보
- History 없음·WHY 없음·승인 없음·모바일 없음·셀프서브 없음(콜게이트) = 공백이 무기이자 한계
- XITA 대비: 선언(Declared)+관측(Observed) 병치 대조 유지, **머지 금지**(머지=drift의 정의)

## 2. Tier B — 현대 Product OS

### Productboard Spark — "the first agentic product system" (GA 2026-06-22)
- "drives it, not just track it" — 5 워크플로우 탤: Opportunity discovery/Feedback analysis/Product specification/Post-launch evaluation/Release notes
- **Spark Home = 주간 '도착 시' digest inbox**("Review newly surfaced opportunities when you arrive back") ↔ XITA `sinceVisit(§102)` 정면 대응
- 스펙→에이전트: **MCP server out** "Pull any spec into Claude Code/Codex/Cursor, no copy-pasting, no lost handoff" [Beta] — XITA handoff 카피방식의 상업적 대체 등장, **XITA MCP server = 최우선 CONSIDER**
- 승인 3중장치: "previews every edit before saves" + inline accept + version history / "If you can't put your name on it in front of your VP, Spark doesn't ship it"
- AI credits 실원가 공개(스펙 50-200) ↔ XITA 자기 키 무제한 = 차별
- **XITA 공격 카피**: "DIY 컨텍스트는 하드디스크 markdown에 흩어져 drift한다" — 반박: 흩어짐이 아니라 **정본+거버넌스(수정 제안/충돌/감사)** 의 부재가 문제. XITA는 그것들을 파일로 소유.
- Objects 18±, mega-nav = 복잡도 축 재확인

### airfocus — 'Product OS'를 버린 제품
- 표어 이동: Product OS → **"Product Intelligence Platform"** (FAQ에만 Product OS 2회) — 용어 선점 반증 + XITA 선점 유효
- 5 에이전트(agent Q&A/Insights/Autofill/Dashboard widgets/Assist) — Q&A 효익의 실측: "PM에게 묻지 않아도 됨"
- ★ "what should we **deprioritize** to make space?" — 우선순위=추가 질문이 아니라 제거 질문
- **Strategic drift**: roadmap item×objective 비교 실시간 flag
- 천장 = Discovery/실행 **2정본 분할**(Jira/ADO에 push) — XITA 단일 진행축 지지
- Human Complexity **7.5** (계층 커스터마이즈·Priority Poker·포털 운영 = 정치 프로토콜의 소프트웨어화)

### Linear — UX reference (경쟁 아님)
- **Roadmaps→Initiatives 개칭(공식 FAQ)**: "로드맵"은 화면이 아니라 prose. Timeline=뷰 모드. 그룹핑키 7개뿐(Status/Lead/Target date/Activity/Priority/Labels/Lead team)
- 상태 2축: lifecycle **수동전용**("even if all issues are completed" 자동계산 거부) + health(On/At risk/Off/**No current update=Gray 1급**)
- milestone: **focus=첫 미완에 노란 아이콘, 제거불가** / 날짜 클릭=편집 / Shift M 배정 / **커지면 project로 승격(convert)** / 진행률=started부터 ← XITA 규칙 전량 수렴 확인
- 프로젝트 필수필드 name 하나
- **Update 단일 객체** — 'Change'를 진행기록 명사로 안 씀
- AVOID(복잡화 방지): 뷰 시스템 확장(views×filters×groupings), initiative graph류 분석 위젯

### Notion — interaction reference
- **agent-suggested edits: 위에서 아래 순차 승인**(2026-08-28) — NeedsYou 카드화 벤치마크
- **Share→Share with Agents**: 컨텍스트 부여를 '현재 화면'에서 (설정으로 안 들어감)
- 마크eting 어휘(blueprint/strategy map)와 실제 화면 어휘(Projects/Tasks)의 괴리 실증 = **마케팅≠제품 어휘** 판정근거
- AVOID: 사용자가 구조를 직접 설계/관리 — XITA가 이기는 지점

## 3. Tier C — PM 벤치마크 (용어/표면 분리만)
- **Plane**: work item 채택이유=타입개방, **UI라벨만 중립화·내부 id=issue 유지**(비파괴 마이그레이션 실측) / roadmap 1급 페이지 없음(Timeline 레이아웃) / Quick add "타이틀+Enter, refine later" / 사이드피크
- **monday**: 그릇명 **Item** "anything you want" — 계층 닫힘(6) / Shortcut: Story+Work Objects, **Task→Checklist 강등수정**, 이상어(Tactical Objective) 강요 후퇴 / Canny/Beamer/AnnounceKit: **표면 3분리 현재·계획·출시** + 상태=레인헤더카운트 + 빈레인 명시 + votes=1인용 삭제대상 + **계획레인 날짜금지/날짜는 출시기록 전용** / Raycast changelog: 버전칩+서술리드+**`**도메인**:` 접두 3분류(신규/개선/교정)**
- GitHub Projects: 그룹 내 생성=**그룹속성 자동상속**(내 QuickAdd 수렴) / **status update 한 줄이 목록 헤더=리스트가 곧 포트폴리오**
- OpenProject **baseline delta**("기준선 대비 밀림") = Q10 percentage-free 정답 후보
- AVOID 총집약: 6단계층+PQL(Plane), 40위젯(ClickUp), 엔티티 자체설계(Fibery), 50필드(GH)

## 4. Tier F — SDD (실행 이전 계층)
- **OpenSpec**: "A change is one unit of work"(=개발계 표준어 확인) / **Delta spec**(ADDED/MODIFIED/REMOVED, "diff not destination") / **Archive=트랜잭션**(destination claim-first·rollback·validate, CI가 정합 유지) / RFC2119+GWT
- Kiro: gate on/off를 제품설정(QuickSpec) / **Capability matrix Mobile 전부 '—'** = AWS의 모바일 스펙 포기
- BMAD v6: "the process sizes itself to the work" / **SPEC 5필드 커널(Why·Capabilities·Constraints·Non-goals·Success signal)** / 단일작성자 불변식 / .memlog(문서 옆 append-only)
- Spec Kit: constitution 1급 / "unit tests for English" / Tessl: SDD→skill governance 피벗(생성경쟁 포화 신호)
- XITA 충돌점: change 승인→Current State 갱신에 **delta-merge/atomic archive 없음** (§51 capability 전환뿐) — CONSIDER

## 5. Tier G — 역사 시각화 (VERIFIED 3+1)
- Time Machine **Depth-as-Time**(0.9/10): 현재 화면을 뒤로, Z=시간 / **Resolution by Recency**(hour→day→week 자동, 줌 슬라이더 금지)
- Figma **Two-Layer History**(1.9): 기계 checkpoint 접힘+의미 마커만 펼침 / 행 4필드(이름·설명·시각·작성자) / Restore=**append-only Before/After 쌍** / branch는 별개 어포던스 / 메타 작성 강요 없음 / "Show older"分页
- +1: **순간 permalink**(handoff 기준점) / AVOID: GitKraken(4.9, 그래프 커스터마이즈 지옥), Radial(성공지 evidence 0), "tree rings"(DEAD 어휘)
- **Q7 답**: 리니어 마커 스트림(자동 마커=Change종결/승인/결정) + 마커 탭 시 화면-밀기 스냅샷 + 시간범위=줌. **Q8 표**: 리니어 Primary / 레이어 Secondary / 그래프=병렬아플 때 CONSIDER / 방사형 부적합

## 6. Tier H+I — 캡처/결정/네이티브
- Things: Type Travel / Magic Plus drop-to-target / Natural Date Input(`in fou`) / **OS표준 진입점만 개방**(Shortcuts·URL scheme·Mail-to) — 앱内 워크플로 라이브러리화 안 함 / Progress Pies=AVOID
- Drafts: **cold-open-to-keyboard + 캡처 무결정** + Inbox→Tag|Flag|Archive 3분류뿐 / disclosure=시간분리 / (drafts.com 파킹 함정 주의)
- Linear Mobile: "companion — react+defer" / **tap·swipe·snooze 3액션** / screenshot→triage / 스펙=읽기전용 / notification schedule
- Notion Agents iOS: "캡처하면 에이전트가 다음 수순" — 모바일=트리거 전문
- Raycast: command-driven·global hotkey·저비용 내비 = ⌘K 이식 근거(실행)

## 7. 공통 구조 진단 (Q3/Q4)
- **Q3 최다 실패 UX**: ① 그릇명에 상태/추상명사 사용(Change/Backlog) ② 점수축 다종 공존 ③ 대상별 복수 진입로 ④ 팀 전제 ceremony의 개인 제품 반입 ⑤ "자동 계산"으로 사람의 판단(health)을 훔침(Linear가 의도적으로 안 하는 것)
- **Q4 복잡화 이유**: Product OS들이 **"누가/언제/왜"의 조직 인터페이스(권한·역할·포털·보고뷰)를 정본에 동봉**하기 때문. XITA는 그것을 전부 버리는 것(1인·로컬·무인증)이 복잡도 방어이고, 버린 축의 산물(VOC 포털·capacity·QBR 뷰)을 절대 되가지지 않는 것이 경계선.
