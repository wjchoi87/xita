# intent-diff — 경쟁 Product OS 대비 XITA 의도 대장
intent_id | expected truth (출처) | observed reality (XITA 현주소) | diff | status | claims
---|---|---|---|---|
| I-01 | §0.2 Complexity 일정 유지 — 화면이 객체를 요구하면 실패 | Change/Milestone/DoS 등 학습 개념 다수, 그러나 온보딩/기본视图 없음 | 부분 위반 | violated(soft) | C-01
| I-02 | §76 "지금 무엇/막힌 것/다음" 즉시 답 | Ask/Health/Roadmap 있음(Mac 탭화) | 달성 | true | C-02
| I-03 | §3.4 Agent=HOW 수행 증거: dispatch 후 결과 자동 복귀 | agent-result/import 존재하나 **에이전트 실행 루프 UI(run board/로그) 없음** | gap | violated | C-03
| I-04 | §40 Build This: destination/repo/branch/artifacts/instruction 한 화면 | dispatchChange=path+branch+instruction; artifacts 선택 없음 | partial | unknown | C-04
| I-05 | §97/98 Health=다차원 + 근거 | health 칩+launch%; dimension 근거 펼침 없음 | partial | unknown | C-05
| I-06 | 경쟁( 웨이브1 결과 ) | awaiting | — | unknown | —
