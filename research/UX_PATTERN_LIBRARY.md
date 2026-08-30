# UX_PATTERN_LIBRARY
> 제품 이름을 제거한 재사용 패턴. 각 패턴: 정의 / 실증 출처(≥1, 수렴 수 명시) / 강약 / XITA 이식 상태.
> 출처 상세는 COMPETITIVE_LANDSCAPE.md와 ../.agents/ulw/research/20260830-212242/wave-*.md

## A. 용어/프레이밍
| 패턴 | 내용 | 출처 | XITA |
|---|---|---|---|
| **Countable Vessel** | 그릇명은 반드시 셀 수 있는 작업 명사. 진행/추상명사(Change/Progress)는 상태값 슬롯 전용 | 5제품 수렴(Linear/Plane/monday/Shortcut/GitHub) | ✅ `할 일` (XUI.term) |
| **Label≠Schema** | 용어 교체가 깨지는 이유=스키마화. UI 라벨만 바꾸고 내부 id는 불변 | Plane(issue 잔존 실측)+Jira 개칭파괴 경고 | ✅ type:'change' 불변, 표시층 분리 |
| **Three-Surface Decomposition** | '변경'을 한 단어로 풀지 말고 `현재 기능 / 진행 중 계획 / 출시 기록`으로 분해 | Canny+Beamer+AnnounceKit+Productboard 4독립 | ✅ 탭: 되는 것/계획/출시 기록 |
| **Loan-word Honesty** | 로드맵·마일스톤·보드는 차용어 유지(강요된 순한글=실패 사례 난다) | Redmine ko.yml 원조도 로드맵 사수 / Shortcut 이상어 후퇴 | ✅ 마일스톤 유지 |
| **One Concept One Word** | 최대 병리=한 개념 다단어(Jira ko '할당되지 않음/해제됨'→사용자 영어 회귀) | lesstif 원문 | ✅ 사전 단일소스(XUI.term, 컴파일타임) |
| **Glossary Test** | 용어사전을 동반하는 순간 그 단어는 화면에서 추방 | Shape Up 30항 glossary 부록 자백 | ✅ 백로그/피치/앱타이트 미노출 |
| **Marketing≠Product Vocabulary** | 카피 어휘를 UI에 옮기지 않는다(Notion 템플릿 화면=Projects/Tasks뿐) | Notion 실측 | |
| **Status Vocabulary by Tier** | 티어가 다르면 상태 어휘도 겹치지 않게 | Linear 3티어 실측 | ✅ 할일/마일스톤/위임 각각 분리 |

## B. 계획/로드맵 화면
| 패턴 | 내용 | 출처 | XITA |
|---|---|---|---|
| **Horizon Lanes (Now/Next/Later)** | 계획 레인=확신도 축. Later는 날짜 없음이 정석 | AnnounceKit/Beamer 실측+NNL 템플릿 다수 | ✅ 계획 탭 3레인 |
| **Lane Header = State+Count** | 행마다 상태배지 ❌ 레인 헤더에 상태·카운트 | Canny/Beamer | ✅ |
| **Σ Bet Capacity** | 레인 헤더에 주수 합, 임계 초과 경고(과베팅 신호) | Shape Up appetite + 열 Σw 렌더 | ✅ 6w(열)/8w(마일스톤) 임계 |
| **Empty Lane is a State** | 빈 레인/무업데이트는 실패 아니라 1급 상태(Gray) | Linear Gray+AnnounceKit "No issues" | ✅ "여기엔 아직 없음" |
| **Quick Add Enter-to-Create** | 그룹 하단 입력행, 제목+Enter 즉시생성(기본상태=그 그룹), 나중에 다듬기 | Plane verbatim+GitHub 자동상속 | ✅ QuickAddChangeRow(product+milestone 상속) |
| **Timeline is a Layout, not a Page** | 로드맵 '화면'을 만들지 말고 뷰 모드로 | Linear(Initiatives개칭)+Plane(sitemap 0건) 2독립 | ✅ 보드/계획=탭, 타임라인=CONSIDER |
| **Focus Marker** | 첫 미완 마일스톤에 포커스 표식(끄기 불가) | Linear verbatim | ✅ MilestoneInfo.focus 동일 |
| **Milestone→Project Promotion** | 마일스톤이 커지면 상위 객체로 승격 제안 | Linear convert | CONSIDER |
| **Deprioritize Question** | "space가 필요할 때 무엇을 뺄까"를 1급 질문화 | airfocus agent | CONSIDER(계획레인 over-bet 경고에 부분 반영) |

## C. 기능/이력 표시
| 패턴 | 내용 | 출처 | XITA |
|---|---|---|---|
| **Domain-Prefixed Changelog** | `**기능영역**: 한 줄` 접두 + 신규/개선/교정 3분류 + 버전칩·월 헤더 | Raycast 실측+앱스토어 ko 관용 | ✅ 출시 기록 카드/이식 |
| **Capability Lanes** | 기능 리스트는 날짜 역순이 아니라 보유상태 레인(되는중/준비/실험/중단) | Canny 레인원리 + capability 매트릭스 | ✅ 4레인+탭 사이클 |
| **Two-Layer History** | 기계 이벤트 접힘(카운트), 인간 의미 마커만 펼침. 작성 강요 0 | Figma VERIFIED | ✅ TimelineSection(13 마커 타입) |
| **Show Older, not Scrubber** | 과거는 append分页. 스크러버/줌 슬라이더 금지 | Figma+Time Machine | ✅ |
| **Resolution by Recency** | 가까울수록 촘촘, 멀수록 자동 요약(시간이 줌을 결정) | Time Machine 정책 | CONSIDER(연 단위 월그룹 시) |
| **Depth-as-Time** | 히스토리 화면 대신 현재 화면을 뒤로 밀기 | Time Machine(0.9/10) | CONSIDER(마커→스냅샷 뷰) |
| **Append-only Restore** | 복원도 새 기록(Before/After 쌍) | Figma | CONSIDER(revision revert) |
| **Baseline Delta Progress** | "% 완료" 대신 "기준선에서 얼마 밀림" | OpenProject | CONSIDER(Q10 대안) |

## D. 승인/결정/에이전트
| 패턴 | 내용 | 출처 | XITA |
|---|---|---|---|
| **Pending by Default** | 기본값 승인은 rubber-stamp 함정. 기본 대기 | CrystalSpec 관찰(반면교사) | ✅ proposal pending |
| **Item-level Deny** | 제안 diff는 문서 통짜리 대신 편집단위 생성/수정/삭제 + 항목별 거절 | CrystalSpec | CONSIDER |
| **Rejected Stays Visible** | 기각이 이력으로 남는다("왜 안 했나"의 원천) | CrystalSpec | ✅ patch dismissed 표시 |
| **Top→Bottom Sequential Approve** | 에이전트 제안 위-아래 순차 승인 | Notion 2026-08 | CONSIDER(NeedsYou 카드 스와이프 시) |
| **Needs-Attention Promotion** | 에이전트 대기 상태를 사람 큐로 자동 승격 | Vibe Kanban+Conductor+Spark | ✅ AGENT_WAITING CRITICAL |
| **Declare Your Baseline** | 검사 화면이 '무엇과 비교했나'를 자체 선언 | CrystalSpec spec-health | ✅ Mission Card Snapshot/drift `dispatched_rev→current` |
| **Diagnosis Report > Raw Diff** | drift/모순은 진단 리스트(등급+인용+수정제안)로 | CrystalSpec analyzer | ✅ needsYou summary 문장화, 확장 CONSIDER |
| **Handoff Permalink** | 스냅샷 기준점(repo@sha+rev)을 handoff에 박음 | Devin/Lumio/Conductor 3수렴 | ✅ base_sha+workspace_rev |
| **Agent Interchange Thesis** | "에이전트를 바꿔도 업스트림은 그대로" | Prodeology·Spark·Cursor 3사 | ✅ 파일 handoff 자체 |
| **Human-Significant Only** | 원시로그 아닌 의미이벤트만 스트림 | Linear Update·XITA §16 원리 | ✅ |

## E. 캡처/모바일/네이티브
| 패턴 | 내용 | 출처 | XITA |
|---|---|---|---|
| **Cold-open-to-keyboard** | 캡처 탭=빈칸+포커스. 결정(제품/타입) 강요 금지 | Drafts | 부분(capture 존재, autofocus 확인 필요) |
| **Three-action Inbox** | 모바일은 tap·swipe·snooze 3액션만 | Linear Mobile | CONSIDER(FlashList swipeAction) |
| **Read-only Docs on Mobile** | 스펙/문서는 읽기전용 컴팩트로만 | Linear+AWS(Kiro Mobile '—') | ✅ 현재 뷰 최소 |
| **Screenshot→Triage** | 스크린샷 공유시트로 즉시 인박스 | Linear Mobile | CONSIDER(공유Extension) |
| **Type Travel** | 타이핑=이동(팔레트 별도 버튼 없이) | Things/⌘K 공통 | ✅ CommandPalette |
| **OS-native Entry Only** | 자동화 확장=OS 표준(공유/위젯/단축문)만 개방, 앱内 워크플로 라이브러리 금지 | Things/Drafts 대비 실패사례 | 방향 고정 |
| **Ask-on-arrival Digest** | 재방문 시 '부재 중 변화'가 홈 첫면 | Spark Home + XITA §102 | 부분(sinceVisit API, 카드화 CONSIDER) |

## F. Anti-patterns (Complexity Audit 종합 AVOID 목록)
1. 그릇명=추상명사(Change/Backlog/Deliverable) — 품사 위반
2. 점수축 2종 이상 공존(DESIR·VIAB·FEAS + 6축 quality + 12축 confidence… = Prodeology overload 메커니즘)
3. 대상별 복수 진입로(Sidebar/Tools/More actions 3중 — CrystalSpec)
4. 팀 전제 ceremony 반입(edit lock, 2단 승인, 포털 운영, Priority Poker)
5. 사용자가 스키마/레이아웃 커스터마이즈(GitKraken 그래프 컬럼, Fibery 엔티티 설계)
6. nav가 없는 페이지를 약속(Prodeology 유령 30 — IA 부채)
7. 뷰/필터/쿼리 언어 확장(Plane PQL, ClickUp 40위젯)
8. 자동계산으로 사람 판단 대체 — health는 반드시 사람이 찍게(Linear 거장 설계)
9. 퍼센트 시각화 유혹(Progress Pies) — 대신 레인·밀림·마커로 말하기
10. 마케팅 카피를 화면 메뉴로 번역(mega-nav 폭포)
