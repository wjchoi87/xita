# XITA Portfolio — 모든 프로젝트를 한 곳에서 (planner 흡수)

> `~/workspace/auto-money/planner` 의 기능·기록을 XITA 로 흡수한 설계/계약 문서.
> XITA = 프로젝트 **일대기** + AI 통합 관리. planner 의 "레지스트리·빌드·딸깍 배포·스토어·광고·앱 기록·변경내역·명령 런처"를
> XITA 도메인(Product / Timeline / Living Artifact / Needs You) 위에 다시 얹었다.

## 1. 개념 매핑 (planner → XITA)

| planner | XITA | 저장 위치 |
|---|---|---|
| `projects.json` 의 앱 1개 | **Product** (`portfolio`, `codename`, `repo_path` 필드 추가) | `products/<id>.md` |
| projects.json `cmds` (CLI 학습 명령) | Product `cmds` (JSON 문자열) | 〃 |
| `dashboard/store-cache.json` 트랙별 versionCode | Product `store_tracks` (JSON 문자열) + `store_checked_at` | 〃 |
| README 앱 표의 상태/수익 모델 | Product `production_status` / `monetization` | 〃 |
| `<앱>/docs/app-log.md` 앱 기록 | 그대로 유지(앱 저장소 git과 함께) **+** XITA 타임라인 이벤트 `APP_LOG` (일대기) | 앱 repo + `.xita/events.jsonl` |
| `docs/*.md`, `README.md`, `ideas/*.md` | 포트폴리오 Living Artifact (`product: null`, `portfolio`) | `artifacts/planner-*.md` (+ `.revs/`) |
| `specs/NN-<codename>.md` | 해당 Product 의 Living Artifact (`kind: spec`) | `artifacts/planner-spec-*.md` |
| planner 원본 전체(비밀 제외) | 원문 보관 + sha256 manifest (무손실 보증) | `archive/planner/<stamp>/` |
| `tools/*`, `template/*` | XITA 저장소 `portfolio/tools`, `portfolio/template` | git |
| `dashboard/` (Python 웹) | XITA 서버 `portfolio` 모듈 + **웹 콘솔** `/app` | `apps/server` |
| `cli/` (bun TUI 런처) | `xita projects` / `xita run <project> [cmd]` | `apps/cli` |

ID 규칙: Product id = codename 을 slug 화 (`BeamLink` → `beamlink`, `theme-ledger` 그대로). 원본 codename 은 `codename` 필드에 그대로.

## 2. 설정 (env, 모두 선택)

| env | 기본값 | 의미 |
|---|---|---|
| `XITA_WORKSPACE` | `~/.xita-workspace` | canonical workspace (macOS 앱과 동일) |
| `XITA_PORTFOLIO_ROOT` | `~/workspace/auto-money` | 앱 저장소들이 모인 폴더 (path 없는 프로젝트는 `<root>/<codename>`) |
| `XITA_PORTFOLIO_NAME` | `auto-money` | 포트폴리오 이름 (Product `portfolio` 값) |
| `XITA_SECRETS_DIR` | `<root>/planner/tools` | `play-account.json`, `keystore.properties` 위치 (앱 gradle 이 이 경로를 참조하므로 이동 금지) |
| `XITA_ADMOB_DIR` | `<root>/secrets` | `admob-client.json`, `admob-token.json` |
| `XITA_MONITOR_HOURS` | `6` | 상시 모니터링 주기(시간). `0` = 끔 |
| `XITA_AI_API_KEY` 등 | | (하위 호환) 있으면 'env' provider 로 모든 AI 체인 맨 앞 |

서버는 레지스트리가 바뀔 때마다 planner 호환 포맷 `{"version":1,"projects":[...]}` 을
`<workspace>/.xita/portfolio-registry.json` 으로 내보낸다 (derived). `portfolio/tools/*.py` 는
`XITA_REGISTRY` → 이 파일 → 레거시 `planner/projects.json` 순으로 읽는다.

## 3. 보안

- 실행 계열(build/deploy/notes/adids/run/sync/import/register) 은 **loopback 요청 + (Origin 없음 | Origin 이 localhost/127.0.0.1)** 일 때만 허용 → 403 `{error}`.
  (CORS `origin:true` 라 임의 웹페이지가 localhost API 를 호출할 수 있기 때문.)
- `production` 트랙 배포·노트 갱신은 body `confirmed: true` 필수 (UI 확인창 + 서버 이중 잠금, planner 정책 유지).
- 비밀 파일 내용은 API 로 절대 노출하지 않는다 (존재 여부 boolean 만).

## 4. REST 계약 — prefix `/api/v1/portfolio`

모든 응답 JSON. 에러는 `{ error: string }` + 4xx/5xx.

### 타입

```ts
type Track = 'internal' | 'alpha' | 'beta' | 'production'
interface ProjectCard {
  id: string                // product id
  codename: string
  name: string              // 표시명 (planner label)
  desc: string
  path: string              // 절대경로
  kind: 'android' | 'node' | 'rust' | 'go' | 'swift' | 'python' | 'generic' | 'missing'
  exists: boolean
  git: boolean
  archived: boolean         // 레지스트리에서 뺀 프로젝트 (Product 는 보존)
  status: string | null     // production_status: PRODUCTION | BETA | DEVELOPMENT | ...
  monetization: string | null
  package: string | null
  versionName: string | null
  versionCode: number | null
  versionCodeSource: 'literal' | 'git' | null   // git = gitCommitCount() 기반 (배포 시 bump 생략)
  keystore: boolean; privacy: boolean; listing: boolean; graphic: boolean
  aab: { size: number; builtAt: number } | null      // builtAt = unix sec
  adIds: { appId: string; banner: string; interstitial: string; rewarded: string; native: string; found: boolean; live: boolean }
  store: Partial<Record<Track, number>> | null       // Play 트랙별 최신 versionCode
  storeCheckedAt: string | null
  pendingRelease: boolean   // 로컬 versionCode > production versionCode
  activeChanges: number     // XITA 진행 중 할 일
  needsYou: number          // XITA 결정 대기
  logCount: number
  lastActivity: { ts: string; title: string } | null
}
interface Job { id: string; label: string; project: string | null; done: boolean; ok: boolean; startedAt: number; lines: string[] }
```

### 엔드포인트

| Method | Path | Body / Query | 응답 |
|---|---|---|---|
| GET | `/overview` | | `{ portfolio:{name, root, workspace}, projects: ProjectCard[], totals:{projects, live, android, pendingRelease, needsYou, activeChanges}, playKey:boolean, tracks: Track[], jobs: Job[] (최근 10, lines 제외) }` |
| GET | `/projects` | `?archived=1` 포함 | `ProjectCard[]` |
| GET | `/projects/:id` | | `{ project: ProjectCard, commands: {name, cmd, learned:boolean}[], changes: {id,name,status,priority}[], docs: {id,name,kind,revision,updatedAt}[], timeline: {ts,event_type,title,summary}[] }` |
| POST | `/projects` | `{ path, codename?, name?, desc? }` | `{ project: ProjectCard }` (상대경로는 root 기준) |
| POST | `/projects/:id/archive` | `{ archived: boolean }` | `{ project }` |
| POST | `/projects/:id/build` | `{ release: boolean }` | `{ jobId }` |
| POST | `/projects/:id/deploy` | `{ track, bump?=true, confirmed?, notes?, notesEn?, dryRun? }` | `{ jobId }` (`dryRun`: 빌드까지만, 업로드·bump·기록 없음) |
| POST | `/projects/:id/notes` | `{ track, confirmed?, notes?, notesEn? }` | `{ jobId }` |
| POST | `/projects/:id/adids` | `{ appId?, banner?, interstitial?, rewarded? }` | `{ changed: string }` |
| POST | `/projects/:id/run` | `{ cmd: string, name?: string }` | `{ jobId }` (처음 쓰는 명령은 `cmds` 에 학습) |
| POST | `/projects/:id/commands` | `{ cmd, name? }` | `{ learned }` (실행 없이 명령 학습 — `xita run` 용) |
| GET | `/projects/:id/log` | | `{ entries: {id,date,kind,body}[], path }` |
| POST | `/projects/:id/log` | `{ text, kind?='메모' }` | `{ entry }` |
| POST | `/projects/:id/log/:entryId/remove` | | `{ ok:true }` |
| POST | `/sync` | | `{ jobId }` (전체 git pull --ff-only → 스토어 버전 조회) |
| POST | `/store/refresh` | | `{ jobId }` |
| GET | `/changelog` | `?project=<id>` | `{ entries: {project, app, hash, when, date, author, title}[] }` |
| GET | `/revenue` | `?days=7` (1~90) | `{available, days, until, total, daily:{date,earnings,impressions,recorded}[], apps:{appId,label,project,earnings,impressions,daily:number[]}[], updated_at, stale?, reason?}` — 조회 결과를 `<workspace>/revenue/admob-daily.json` 에 일 단위 병합 저장, 조회 실패 시 저장분으로 응답(stale) |
| GET | `/monitor` | | `{ report: MonitorReport \| null }` (숨긴 조언 제외) |
| POST | `/monitor/run` | `{ force? }` | `{ report }` — 애드몹 기록 갱신 → 규칙 신호 → (신호 변경 시) 로컬 AI 조언. 하루 1회 스토어 조회 job |
| POST | `/monitor/advice/:id/dismiss` | | `{ report }` |
| GET | `/promo` | `?project=` | `{ posts: (PromoPost & {effect})[], communities: Community[] }` |
| POST | `/promo` | `PromoPost` 일부 | `{ post }` 직접 쓰기 |
| POST | `/promo/draft` | `{ project, community, lang?, angle? }` | `{ post }` AI 초안 (자동 게시 없음) |
| POST | `/promo/:id` | `{ title?, body?, status?, url?, posted_at?, scheduled_for?, metrics? }` | `{ post }` |
| POST | `/promo/:id/remove` | | `{ ok }` |
| PUT | `/promo/communities` | `{ communities: Community[] }` | `{ communities }` |
| GET | `/admob/auth` | | 302 Google OAuth |
| GET | `/admob/callback` | `?code=` | HTML |
| GET | `/jobs` | | `Job[]` (lines 제외) |
| GET | `/jobs/:id` | | `Job` (lines 마지막 400줄) |
| GET | `/docs` | | `{ docs: {id,name,kind,product,revision,updatedAt,source}[] }` 포트폴리오 문서(artifact) |
| GET | `/settings` | | `{ root, workspace, secretsDir, admobDir, playKey, keystore, admobClient, admobToken, registryExport, mobile:{bind, port, urls, reachable} }` |
| POST | `/import/planner` | `{ from?: string, dryRun?: boolean }` | `ImportReport` |

### 컨트롤 타워 확장 (2026-10-18)

`ProjectCard` 추가 필드: `work {idea, todo, doing, review, doingTitles}`, `latest {ts, title, source: event|work|git}`
(이관·등록 이벤트 제외, `.git/logs/HEAD` 마지막 동작 포함), `revenue7d {earnings, prev, impressions} | null` (저장된 기록), `running` (진행 중 job 라벨).

**작업(아이디어·할 일·마일스톤)** — v4 change/milestone 그대로 (prefix `/api/v1/v4`)

| Method | Path | Body | 응답 |
|---|---|---|---|
| GET | `/products/:id/work` | | `{ changes:{id,name,status,priority,milestone,note,created_at,updated_at}[], milestones:{id,name,status,target_date,description,progress,done,total,overdue}[] }` |
| POST | `/products/:id/changes` | 기존 + `status? IDEA\|PLAN\|BUILD`, `milestone?`, `note?` | `{ data }` |
| POST | `/changes/:id/edit` | `{ title?, priority?, note? }` | `{ data }` (본문 `## 메모` 섹션) |
| POST | `/changes/:id/transition` | `{ lifecycle }` | 허용 안 된 전이는 **400** + 갈 수 있는 상태 안내 |

한글 제목·이름은 slug 가 비므로 `<product>-c-<고유>` / `<product>-m-item-<고유>` / `p-<고유>` id 를 쓴다 (덮어쓰기·충돌 없음).

**기획 위저드** — `/api/v1/v4/plans` (쓰기는 이 컴퓨터에서만)

단계: 이름·한 줄 소개 → 문제·타깃 → 핵심 기능(MVP) → 확장 기능 → 수익화 → 출시·홍보 → 위험·성공 지표 → 최종 검토.
세션은 `<workspace>/planning/<id>.json`(+`.md`). 확정 전에는 초안만 저장. AI 실패 시 단계별 기본 질문으로 계속.

| Method | Path | Body | 응답 |
|---|---|---|---|
| GET | `/plans` | | 목록 |
| POST | `/plans` | `{ idea? }` | 세션(첫 질문 포함) |
| GET | `/plans/:id` | | `{ ...세션, stages, markdown, problems(확정 막는 것), gaps(비어 있는 단계) }` |
| POST | `/plans/:id/turn` | `{ message }` | 세션 |
| POST | `/plans/:id/stage` | `{ to: next\|prev\|<key> }` | 세션 |
| POST | `/plans/:id/patch` | `{ draft: {...} }` | 세션 (AI 없이 초안 수정) |
| POST | `/plans/:id/confirm` | | `{ plan, product, milestones }` — Product(코드네임)·기획서 artifact·수익모델 decision·마일스톤·할 일 생성 |
| POST | `/plans/:id/abandon` | | 세션 |

**AI 라우터** — `/api/v1/v4/ai/*`. 설정 `<workspace>/.xita/ai.json` (없으면 기본값), 사용 기록 `.xita/ai_usage.jsonl`.

```jsonc
{
  "providers": [
    { "id": "m5", "kind": "http", "local": true, "baseUrl": "http://bossgame-m5:4000/v1", "apiKeyEnv": "LITELLM_API_KEY", "models": ["qwen38-27b-uncensored"] },
    { "id": "opencode-free", "kind": "cli", "command": ["xal","run","--format","json","--mode","plan","--provider","opencode-free","--model","{model}"], "output": "xal-json", "models": ["zen/glm-5.3-flash-free"] }
  ],
  "routes": { "plan": [{ "provider": "zai", "model": "glm-5.3" }, { "provider": "m5", "model": "qwen38-27b-uncensored" }] }
}
```
- 작업: `classify · summarize · ask · plan · monitor · advice · promo`. 체인을 앞에서부터 시도, 실패한 provider/model 은 10분 쉼.
- `sensitive` 작업(수익 조언)은 `local: true` provider 만. 키 값은 저장하지 않음 (`apiKeyEnv` / `apiKeyCommand`).
- cli provider 는 셸 없이 실행, 프롬프트는 stdin, 작업 폴더 `.xita/ai_sandbox`.

| Method | Path | Body | 응답 |
|---|---|---|---|
| GET | `/ai/status` | | provider(키 설정 여부만)·체인·최근 실패 |
| GET | `/ai/usage` | `?days=7` | 호출·실패·토큰·평균 시간 |
| PUT | `/ai/config` | `{ config }` 또는 `{ reset: true }` | 상태 (이 컴퓨터에서만, 검증 실패 400) |
| POST | `/ai/test` | `{ provider, model }` | `{ ok, text, ms }` (이 컴퓨터에서만) |

문서 본문 읽기/수정은 기존 `GET /api/v1/v4/artifacts/:id`, `POST /api/v1/v4/artifacts/:id/revisions {content, summary}` 사용.
XITA 핵심 데이터(결정 대기 등)는 기존 `/api/v1/v4/*` (`needs-you`, `timeline`, `products/:id/state` …).

## 5. 웹 콘솔 `/app`

서버가 `apps/server/public/app/` 정적 파일을 `/app/*` 로 서빙한다 (빌드 단계 없음, vanilla ES modules).
브라우저로 `http://localhost:3333/` 접속 시 `/app/` 으로 이동한다 (JSON 클라이언트는 기존 응답 그대로).
테마: 시스템 / 라이트 / 다크 (localStorage `xita.theme`).

화면: 홈(오늘의 조언·프로젝트 현황·KPI) · 프로젝트(개요·**작업**·배포·광고·기록·명령·커밋) · **기획** · **홍보** · 결정할 일 · 활동 · 수익(기간·하루 막대·앱별 추이) · 문서 · 설정(**AI**·모바일 연결·경로).

## 6. 이관 실행

```bash
pnpm xita import-planner --dry-run      # 무엇이 들어갈지 미리보기
pnpm xita import-planner                # 실제 흡수 (재실행 안전: 같은 내용은 건너뛰고 바뀐 문서는 새 리비전)
```
서버 없이: `pnpm --filter @xita/server exec node ace planner:import [--from <dir>] [--dry-run]`
