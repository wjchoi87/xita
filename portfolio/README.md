# portfolio — 앱 포트폴리오 도구

`~/workspace/auto-money/planner` 의 `tools/`, `template/` 를 XITA 저장소로 옮긴 것.
Android 앱 스캐폴딩, 디자인 시스템 배포, 스토어 자산 생성, Play Console 배포·조회를 맡는다.
설계/계약 전체는 [`docs/PORTFOLIO.md`](../docs/PORTFOLIO.md) 참고.

```
portfolio/
  tools/      스크립트 (Python 3.10+ 표준 라이브러리 / bash, 일부 Pillow·Chrome·adb)
  template/   새 앱 스캐폴딩 템플릿 (scaffold.sh / apply-design.sh 가 사용)
```

## 경로·환경 변수

모든 스크립트는 경로를 `tools/xita_paths.py` (셸은 같은 규칙의 env 기본값) 로 해석한다.
env 를 하나도 설정하지 않으면 planner 시절과 같은 경로를 쓴다.

| env | 기본값 | 의미 |
|---|---|---|
| `XITA_PORTFOLIO_ROOT` | `~/workspace/auto-money` | 앱 저장소들이 모인 폴더. 레지스트리에 path 가 없는 앱은 `<root>/<코드네임>` |
| `XITA_SECRETS_DIR` | `<root>/planner/tools` | `play-account.json`, `keystore.properties`, `upload.jks` 위치 |
| `XITA_ADMOB_DIR` | `<root>/secrets` | `admob-client.json`, `admob-token.json` |
| `XITA_REGISTRY` | (없음) | 레지스트리 JSON 경로를 직접 지정 |
| `XITA_WORKSPACE` | `~/.xita-workspace` | XITA canonical workspace. 서버가 `<workspace>/.xita/portfolio-registry.json` 을 내보낸다 |

레지스트리(앱 목록, 앱별 `path`) 는 다음 중 **처음 존재하는 파일**을 읽는다.

1. `$XITA_REGISTRY`
2. `$XITA_WORKSPACE/.xita/portfolio-registry.json` (XITA 서버가 자동 생성)
3. `$XITA_PORTFOLIO_ROOT/planner/projects.json` (레거시)

### 비밀 파일

비밀 파일은 **이 저장소에 두지 않는다.** 기본 위치는 `~/workspace/auto-money/planner/tools/` 이다.
앱들의 gradle 설정이 `planner/tools/keystore.properties` 를 참조하므로 옮기지 말 것.

| 파일 | 용도 | 만드는 법 |
|---|---|---|
| `play-account.json` | Play Console 서비스 계정 키 (모든 앱 공용) | Play Console → API 접근 → 서비스 계정 키 |
| `keystore.properties` | 서명 설정 (storeFile / 비밀번호) | `tools/make-keystore.sh` |
| `upload.jks` | 공용 업로드 키 | `tools/make-keystore.sh` |
| `admob-*.json` | AdMob OAuth (`$XITA_ADMOB_DIR`) | XITA 웹 콘솔 → AdMob 연결 |

앱 폴더 안에 같은 이름의 파일이 있으면 그쪽이 우선이다 (`deploy.py` 의 `play_key()` / gradle 순서).
`.gitignore` 가 `*.jks`, `play-account.json`, `keystore.properties` 등을 막아 둔다.

## 도구

| 도구 | 하는 일 | 사용법 |
|---|---|---|
| `deploy.py` | AAB 빌드 → Play 트랙 업로드 (플러그인 없이 Play Developer API 직접 호출). 다른 도구가 `project_dir`, `access_token`, `call`, `API`, `UPLOAD`, `play_key` 를 import 한다 | `python3 deploy.py <코드네임> [--track internal\|alpha\|beta\|production] [--notes ".."] [--notes-en ".."] [--notes-ja ".."] [--notes-only] [--submit] [--dry-run] [--dir <앱폴더>]` |
| `store-versions.py` | 트랙별 최신 versionCode 조회 (읽기 전용 — edit 생성 → 조회 → 폐기, commit 안 함). 마지막 줄 `XITA_RESULT {json}` | `python3 store-versions.py <코드네임>=<패키지명> [...]` |
| `upload-store-listing.py` | 스토어 등록정보(ko/en/ja 문구, 아이콘, 피처 그래픽, 스크린샷) 업로드 | `python3 upload-store-listing.py <코드네임> [--dry-run] [--no-images]` |
| `gen-store-listing.py` | 스토어 등록 문구(md) 생성 — 데이터는 파일 안 `APPS` + `store_listing_en.py` / `store_listing_ja.py` | `python3 gen-store-listing.py [코드네임 ...]` |
| `gen-privacy.py` | 개인정보처리방침 HTML (`<앱>/docs/privacy-policy.html`) | `python3 gen-privacy.py [코드네임 ...]` |
| `gen-store-icon.py` | 512px 스토어 아이콘 (Chrome headless) | `python3 gen-store-icon.py` |
| `gen-feature-graphic.py` | 1024x500 피처 그래픽 (Chrome headless) | `python3 gen-feature-graphic.py [코드네임 ...] [--lang ko\|en]` |
| `gen-screenshots.py` | 연결된 기기(adb)에서 스크린샷 2장 캡처 | `python3 gen-screenshots.py [코드네임] [--all]` |
| `gen-screenshots-styled.py` | 캡처본에 브랜드 프레임·캡션 합성 (Pillow) | `python3 gen-screenshots-styled.py [앱 ...]` |
| `gen-store-screens.py` | `docs/store/raw/<lang>/` 원본으로 언어별 스토어 스크린샷 생성 (Pillow) | `python3 gen-store-screens.py [앱 ...]` |
| `crop-screenshots-9-16.sh` | 스크린샷을 9:16 으로 center crop (Play 가 비율로 거부할 때만) | `sh crop-screenshots-9-16.sh [코드네임 ...]` |
| `scaffold.sh` | `template/` 로 새 Android 앱 생성 (`<root>/<코드네임>`) | `./scaffold.sh <코드네임> <패키지명> <앱표시명> [추가권한XML]` |
| `apply-design.sh` | 디자인 토큰·공통 컴포넌트를 앱에 배포 | `./apply-design.sh <코드네임> <패키지명> <SlatePro\|WarmPaper\|ForestLedger\|InkMinimal>` |
| `make-keystore.sh` | 공용 업로드 키스토어를 `$XITA_SECRETS_DIR` 에 생성 (이미 있으면 중단) | `./make-keystore.sh` |
| `xita_paths.py` | 공용 경로 해석 모듈 (`ROOT`, `SECRETS`, `ADMOB_DIR`, `TEMPLATE`, `registry_projects()`, `project_dir()`) | import 전용 |

`gen-*` / `store_listing_*` 의 앱별 문구·색상 데이터는 각 파일 안 `APPS` 딕셔너리에 있다.
셸 도구(`scaffold.sh`, `apply-design.sh`, `crop-screenshots-9-16.sh`) 는 레지스트리를 읽지 않고 `<root>/<코드네임>` 을 쓴다.

## planner → XITA 명령 대응

| planner | XITA |
|---|---|
| `planner/tools/dashboard.sh` (Python 웹 대시보드) | `pnpm dev:server` 후 http://localhost:3333/app (웹 콘솔) |
| `planner/tools/cli.sh` (bun TUI 런처) | `pnpm xita projects` / `pnpm xita run <project> [cmd]` |
| 대시보드 "스토어 버전 새로고침" | 웹 콘솔 스토어 새로고침 (`POST /api/v1/portfolio/store/refresh`) → 내부적으로 `store-versions.py` |
| `planner/tools/deploy.py <코드네임> ...` | `python3 portfolio/tools/deploy.py <코드네임> ...` 또는 웹 콘솔 배포 버튼 |
| `planner/tools/<기타 스크립트>` | `portfolio/tools/<같은 이름>` (인자 동일) |
| `planner/template/` | `portfolio/template/` |
| `planner/projects.json` 수동 편집 | XITA 웹 콘솔/서버 레지스트리 (`portfolio-registry.json` 자동 export) |

`dashboard.sh`, `cli.sh` 는 위 XITA 기능으로 대체되어 옮기지 않았다.
