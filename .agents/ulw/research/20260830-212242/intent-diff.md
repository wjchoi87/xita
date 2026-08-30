# intent-diff (run 20260830-212242)
포맷 게이트: **코드가 산출물** (20260829 러닝 사용자 답 유지 기록) — PDF/DOCX 제안 생략 근거: 동일 세션의 유효한 gating answer.

| intent_id | expected truth | observed reality | diff | violated invariant | source | status |
|---|---|---|---|---|---|---|
| T-01 | 도메인 명칭이 개인 제조자에게 직관적이어야 한다("change"는 엔지니어 은어) | UI 전역에 "Change/마일스톤/디스패치" 엔지니어어 방치 | 용어 계층 없음 | 제로 컴플렉시티 for humans (§0.4) | 사용자 진언 verbatim: "changes라는 개념이 확 와 닿지가 않아" | **true (구현됨)** |
| T-02 | "탑재된 기능 리스트"를 한눈에 보기 좋게 제시 | capabilities가 상태 나열만, 그룹/요약/조회 UX 빈약 | 리스트 산재 | 보기 편하게 (user request) | 사용자 진언 verbatim | **true (구현됨)** |
| T-03 | 현재 진행 로드맵 + 그 안 세부 구현사항을 한 화면에서 관리 | 보드(스테이지만) / 로드맵(마일스톤 나열) 분리 — 마일스톤 단위 작업 트리 부재 | 트리/인라인 관리 없음 | "관리도 편하게" | 사용자 진언 verbatim | **true (구현됨)** |
| T-04 | 경쟁 용어·화면 구조를 면밀히 확인하고 설계에 반영 | wave1은 기능 인벤토리 위주, screen-level IA/용어 분석 없음 | 용어 계량 분석 0 | 경쟁 면밀히 확인 (user) | "경쟁 서비스 제품을 좀 더 면밀히 확인해라" | **true (구현됨)** |
