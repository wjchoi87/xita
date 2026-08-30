# wave-1 · huly-deep digest (orchestrator)
full record: ~/.xal/sessions/.../agent-huly-deep-*.md

## 핵심 발견
1. **Hosted Huly 종료**(README 공지, 2025-07-20 shutdown) — DB-서버 올인원 모델의 경제성 실패 사례 = local-first 파일정본 XITA의 반대증거. [src: github.com/hcengineering/platform README]
2. Huly= **비즈니스앱 프레임워크**(CRM/HR/ATS 전부 Project/Task 프리미티브+Mixin으로 재사용) — 코멘트/첨부/태그/activity가 전 모듈 공용
3. **QMS Controlled Documents**: major/minor 버전, DocumentSnapshot(=revision), **ChangeControl{reason,impact,impacted_documents[]}**, Review/Approval Request 프리미티브 — XITA Proposal/Artifact가 배울 골격
4. **Unified Import Format = YAML frontmatter + Markdown 파일 트리** — 우리와 동일 직렬화를 Huly는 'import 브릿지'로만 사용, 우린 정본 → 포지셔닝 근거
5. AI = **서비스 계정**이 워크스페이스에 참여, 결과(AI 요약)를 일반 도큐먼트로 기록 → 사람이 리뷰
6. Huly에도 VOC/고객피드백 모듈 없음(공백 지대), coding-agent handoff 루프 없음(XITA 차별성 유효)
7. IssueTemplate(children 구조)= 프로세스 청사진 / RelatedIssueTarget= 크로스-스페이스 집계 규칙 / deadline(soft)+dueDate 분리 / schedulingMode auto

## XITA 갭 → 구현 후보 (this wave 유래)
- G-H1 Proposal에 **impacted_documents + reason + impact** 필드 (Huly ChangeControl) — cheap, 필드만
- G-H2 Artifact **major/minor 버전 표기** (r2 vs 1.2) — display layer
- G-H3 공용 **코멘트/활동 프래티미티브**: comment.md 파일 타입 추가(any entity 대상) — 중간
- G-H4 NeedsYou/Review에 **deadline(soft)** 개념 — cheap 필드
- G-H5 에이전트 = **principal(agent account id)**: dispatch/op 에 device_id 넘어 agent_id 기록 — 있음(device_id), handoff generated_by 정비

## EXPAND (verbatim from worker, truncated tail 재수집 필요)
- LEAD: TraceX(tracex.co) 동일 레포 기반 제품 — models/qms 사용 실전 사례
- (tail이 trunc — 필요시 worker는 terminal, 재확인 생략 가능: 핵심 deliverable은 수신됨)
