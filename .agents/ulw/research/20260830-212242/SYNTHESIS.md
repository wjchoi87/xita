# ULW-Research Synthesis: XITA 용어/계획관리/기능리스트 — 경쟁 정밀독해
Workers: 16 (wave1 8 + wave2 8) · Waves: 2 + steering 확장(사용자 브리핑) · Excursions: 0 (리드는 저널 이관) · Sources: ~75 fetch / 40+ 도메인 · Verifications: 코드 렌더 3스냅샷(보드/계획/타임라인)+OCR 자기검증 + 실버그 1건(eventType 캐논) 테스트로 발견·수정

## Executive summary
1. **"change가 안 와닿는다"의 병리는 품사** — 5경쟁 전부 진행/추상명사를 그릇명으로 안 쓴다. 해법=화면 '할 일' + 데이터 change 불변(Plane식 비파괴 라벨교체가 실증 선례).
2. **'변경'은 한 단어가 아니라 3표면**(현재 기능/진행 중 계획/출시 기록) — Canny/Beamer/AnnounceKit/Productboard 4독립 수렴. 이번 코드 반영 완료.
3. **로드맵은 화면이 아니라 뷰**(Linear 개칭+Plane sitemap 0건 수렴) — Now/Next/Later 확신도 레인+퀵애드+Σ베팅으로 구현.
4. 직접경쟁 Tier A 중 **Product f()/Satori OS는 실체 없음(DEAD, 강판정)** — 브리핑 자체의 LLM오염 가능성 보고. CrystalSpec=개념 클론, Prodeology=복잡도反面教師, Lumio/Spark=실존.
5. Human Complexity Audit: 팀 전제 ceremony가 점수(6~7.5)의 주범 — 1인 XITA는 원천삭제 영역, 목표 ≤2.5.

## 실행된 코드 (swift 34 green, 서버 tsc/eslint green, 모바일 tsc green)
XUI.term 사전(컴파일가능 단일소스) · 계획 3레인+QuickAdd+Σ베팅 · 되는것 4레인 · Two-Layer 타임라인 · ⌘K 팔레트 · 모바일 TERM parity · events 키 캐논화(실버그 픽스)
## 산출물
research/COMPETITIVE_LANDSCAPE.md · UX_PATTERN_LIBRARY.md · XITA_GAP_ANALYSIS.md · XITA_UI_RECOMMENDATIONS.md (Q1-15 포함)
## Gaps / unresolved
- 미수집: Apple Notes/Reminders, Craft, Tower, Notion ⌘K문서, Canny filters 패널, GSD/Superpowers entity
- 이미지의 픽셀 판독은 OCR 부분실패(타임라인 렌더) — 로직 테스트로 대체 확정
- Linear 커맨드팔레트 라벨 원문 미확인(C-LIN EXPAND P0 이관)
