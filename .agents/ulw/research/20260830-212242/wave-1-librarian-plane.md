# wave-1 · plane-terms-ux digest
## 결정적 발견
1. Plane에 **Roadmap 1급 페이지 없음** (sitemap 전체 확인) — Timeline=레이아웃 스위치 5종 중 하나 (List/Board/Calendar/Table/Timeline)
   → **Linear(C-LIN-01: 화면없애고 뷰모드)와 수렴. 2 독립 소스 converged: '로드맵 화면'을 만들지 마라**
2. work item 채택 이유=타입 개방("Issue"가 그릇명 점유 불가) / 전환방식=**UI라벨만 중립화+내부 id는 issue 유지** (URL/이미지슬러그 잔존 증거 다수)
   → XITA 정본 type:'change' 유지 + 화면 라벨만 교체 = **정확히 같은 마이그레이션 경로, 교차검증 완료**
3. Epic 강등 4개조: 탭제거→"Work Items에 살면서 타입으로 필터", 생성폼/상세/벌크/필터 전부 공유
4. Milestone=사이드카 축(타임라인 세로 점선+hover 진행률 diamond), Module=기능묶음 사이드카(동시 다속), 5수평축(cycle/module/milestone/release/customer)
5. **Quick add 인라인 행**: "타이틀 입력+Enter 즉시생성, refine later" / Drafts 자동저장 / **Side peek**(리스트 컨텍스트 유지 드릴인) / Create more 토글
6. Mintlify /llms.txt = 1fetch 전체문서 — 차기 워커 지침
## XITA 설계 확정 입력
- 계획(Plan) 탭: Now/Next/Later 3레인 + 레인 헤더 카운트·Σappetite, 인라인 Enter생성, 사이드 peek 상세
- 보드(스테이지) 유지, 타임라인 모드 추가는 2순위
- 용어: 화면='할 일', 데이터=change 불변
