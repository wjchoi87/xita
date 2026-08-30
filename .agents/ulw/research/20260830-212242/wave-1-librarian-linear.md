# wave-1 · linear-terms-ux digest
## 핵심 (verbatim 근거는 full record)
- C-LIN-01: "Roadmaps are renamed to Initiatives" (FAQ 원문) — roadmap 객체 폐지, 화면도 없앰
- C-LIN-03: 개칭 후 roadmap은 평문에서만 사용 — 객체이름≠사용자언어 분리
- C-LIN-04/05/06/07: Initiative=목표 객체(projects 그룹), workspace 단일뷰, Health+Active Projects 열, 4치 색상(Green/Amber/Red/Gray=No current update)
- 상태 2축: lifecycle(수동전용 "even if all issues are completed" 자동계산 거부) vs health(사람 판정)
- Timeline은 화면이 아니라 뷰 모드(Display 전환) — IA 부하 제거
- 그룹핑 키 7개만 노출: Status/Lead/Target date(+timeframe)/Activity/Priority/Labels/Lead team
- 프로젝트 생성 필수필드 name 하나 — 과정보다 빨리 시작
- Update=1객체/latest 노출 — "Change"라는 진행기록 명칭 자체가 Linear에 없음
## XITA 시사 ( 확정 전 교차검증 필요: plane/inline 워커와 수렴봐야 )
L1. 용어:진행추적개념을 UI에서 지우고 "최신 상태 한 줄 + 색"으로
L2. health 축 추가(OnTrack/AtRisk/OffTrack/None) — milestone/change에 수동 체크
L3. roadmap=탭아니라 보드의 Timeline 모드
L4. 마일스톤 카드 = name+date+health dot 로 최소필드
