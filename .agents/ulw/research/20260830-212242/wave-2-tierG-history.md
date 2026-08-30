# wave-2 · Tier G digest — 역사 시각화 VERIFIED 3+1
- P1 **Depth-as-Time**(Time Machine 0.9/10!): 새 화면 없이 현재 화면을 뒤로 밀기 — Z축=시간
- P2 **Two-Layer History**(Figma 1.9): 기계 checkpoint 접힘+인간 마커(named version)만 펼침 / 행 4필드=이름·설명·시각·기여자 / **autosave는 무명 강요 없음**(=메타데이터 작성 강요가 복잡도 발원) / **Restore=append-only 2개 스냅샷**(Before/After 강제) / Delete Version Info=메타만 삭제 내용보존 / Title25자 Description140자 예산 하드코딩 / **Branch는 별개 기능으로 분리**(역사=리니어 1본)
- P3 **Resolution by Recency**: hour→day→week 자동 다운샘플 — **줌 슬라이더 UI 금지, 시간 범위가 컨트롤**
- P4 Show older分页 (scrubber 대체) + Snapshot is Workable(과거도 작업가능 상태로)
- AVOID: GitKraken 4.9 = 사용자가 그래프 커스터마징(컬럼설정 gif 다수) / Radial 성공증거0 / **tree-rings 어휘 DEAD**
- Q7 답: 리니어 마커 스트림 + 마커 선택시 화면-밀기 스냅샷 + 범위제어 줌. XITA는 Change종결/승인이 자동 마커 → Figma보다 메타부담 0
- Q8 표: Linear=Primary(탭아니라 본문 하단) / Layers=Secondary / Graph=CONSIDER전용(병렬아플때만) / Radial=부적합
## 즉시 이식(이번 코드): TimelineSection = Two-Layer(마커 펼침/자동 접힘)+Show older — 진행 중
