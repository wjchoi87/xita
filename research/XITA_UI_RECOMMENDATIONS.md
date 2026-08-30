# XITA_UI_RECOMMENDATIONS
> 최종 제안 (브리핑 §18/§19: macOS/Mobile 분리, 우선순위=Human Complexity ↓).
> 이 문서의 ✅표 = 이미 코드 반영됨(run 20260830). 미표 = 제안.

## 1. macOS

### IA (Q15: 기능 3배가져도 안 복잡해지는 법)
- ✅ **고정 탭 8개 이하**: 개요·보드·계획·운영·할 일·출시 기록·되는 것·자취 + 전역 **⌘K**. 새 기능은 '새 객체+새 탭'이 아니라 **기존 탭의 kind/필드**로만-entry(예: insight kind 확장)
- ✅ 대상 진입로 1개 원칙: 팔레트 또는 해당 탭. (AVOID#3)
- 사이드바 = Needs You(결정) / 제품 / 할 일(활동) / Agents / 설정 — '나를 기다리는 것' 최상단 고정

### 화면별 처치
| 화면 | 제안 | 상태 |
|---|---|---|
| Home | 스타일 타일 + **Ask 카드** + Needs You(에이전트 대기 줄 포함) + Active | ✅ |
| 제품 개요 | health 칩 + next release + 활성 | ✅ (health 수동 4치 칩은 차기) |
| 보드 | 스테이지 5열 + 카드 칩 + 우클릭 유효전이 | ✅ |
| 계획 | Now/Next/Later 3레인 · Σ베팅 · 퀵애드 Enter · 레인 헤더 카운트 | ✅ |
| 되는 것 | 기능 4레인(되는중/준비/실험/중단) 탭사이클 | ✅ |
| 출시 기록 | 월 헤더 그룹 + 버전칩 + `**도메인**:` 3분류 불릿 | 차기 |
| 자취(Timeline) | Two-Layer: 마커 펼침+기계 이벤트 접힘+Show older | ✅ |
| Agents | 위임 런 보드(대기렬 최상단 정렬) + 유출 파일 + 드리프트 표 | ✅ |
| 채점 | ⌘K 또는 card popover, 0-10 정수 5필드 → 파생 정렬 | ✅ |

### 네이티브 capability (Q13)
- ✅ ⌘K 팔레트(Type Travel). 차기: **MenuBarExtra** — Needs You 카운트 배지 + ⌥전역 캡처 시트(Drafts cold-open) · 위젯/Shortcuts 진입점(Things 원칙) · `xita://` deep link

## 2. Mobile (Q12: 무엇을 버리나)
- **버릴 것**: 구조 관리(뷰/필터 생성), 메타데이터 편집 패널, 스펙 오소링(읽기만), 그래프/보드
- **남길 것**: Capture(무결정 cold-open) / 결정할 일(제안 승인·거절, 위임 대기 응답) / 열람(진행 중 할 일·최근 마커)
- ✅ 용어 parity:TERM/statusKo 계층 (mac과 동일 1:1)
- 제안(차기): ① '결정할 일' 카드 swipe = snooze(내일로)/삭제 3액션 ② 알림=업무시간 스케줄(취침 중 AGENT_WAITING 푸시 금지) ③ 스크린샷 공유→메모+auto-classify ④ 승인 카드 top→bottom 순차 모드

## 3. §17 15문답
- **Q1 근접 Top5**: 1 CrystalSpec(개념 클론) 2 Prodeology(포지셔닝 클론) 3 Productboard Spark(에이전트 워크플로우) 4 airfocus(Product OS 표어 이력) 5 Linear(실행 UX 표준). *Product f()/Satori OS는 entity resolution 실패로 제외(DEAD)*
- **Q2 핵심차이**: 파일 정본 소유(나머지 전부 서버 DB), Needs You 단일 큐+WHY 게이트(결정의 소유를 사람에게 고정), 모바일 오프라인 결정, 무과금 자기-AI, **역사=서사(Biography) 그 자체이 되는 제품**(경쟁은 trace만)
- **Q3 최다 실패**: 그릇명 추상화·객체증식·점수다축·진입로다중·팀의식 반입·(심지어)health 자동화
- **Q4 복잡해지는 이유**: '조직의 눈(누가/무엇을 보고/승인)'을 정본에 동봉하는 순간부터 도구가 회사를 모델링하기 때문. OS 기능은 전부 그 모델의 부산물. XITA는 조직을 모델에 안 넣으므로 곱셈 분기 자체가 없음
- **Q5 Home**: 나를 기다리는 것 3종만 — 결정할 일/에이전트 대기/이상 신호. 나머지는 팔레트·탭
- **Q6 제품 첫화면**: '지금 되는 것' 요약 한 줄 + Next(포커스 마일스톤)+건강도 1칩 + Ask 입력. 상세는 탭
- **Q7 생애 표현**: 리니어 마커(자동 발생)+탭 시 화면-깊이 스냅샷+시간범위=줌. 그래프는 병렬아플 때만
- **Q8 매체**: Linear=주/ Layer=보조/ Graph=조건부 / Radial=금 / Tree rings=어휘 자체가 DEAD
- **Q9 NeedsYou 최속**: 카드 1줄+2버튼(승인/사유 한 줄), 키보드 이동, 순차 모드. (기존 카드화 완료, 스와이프 차기)
- **Q10 %없이**: 레인 채움률+마일스톤 focus+overdue+**밀림(baseline delta)** — %는 진행률이 아니라 '남은 거리'로 보여줌. (Σw 베팅바로 부분 구현)
- **Q11 문서관리 느낌 제거**: 자동 마커·자동 개정·(수정은)제안제 — 사람은 '승인/거절/왜'만 입력. 검사 기준은 화면이 먼저 선언
- **Q12 모바일 제거**: §2. 구조관리/편집 패널/오소링
- **Q13 네이티브**: ⌘K✅ / MenuBar+전역핫키 캡처 / 위젯+Shortcuts+Share Extension / deep link / 로컬 파일=FSEvents 즉시성
- **Q14 3초 캡처**: cold-open 키보드 + 텍스트 한 줄 + Enter=Inbox(무결정). 제품 귀속은 사후(승인 시)
- **Q15 3배 확장 IA**: 탭 고정, **kind/filter로만** 확장, 팔레트가 모든 신규 대상의 기본 진입로, 용어사전 단일소스, AVOID#1-10 금서에 위배되는 신규 화면 영구 금지

## 4. 즉시 실행한 것 (이 run 코드)
XUI.term 사전+전 화면 치환 · 계획 3레인(퀵애드/Σ베팅/빈레인) · 보드 카드 칩 · 되는것 4레인+상태사이클 · Two-Layer 타임라인 · ⌘K 팔레트 · mobile TERM/statusKo parity · swift 31 tests green
