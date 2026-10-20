#!/usr/bin/env python3
"""
portfolio 도구 공용 경로 해석.

planner 시절에는 각 스크립트가 `Path(__file__).parents[2]` (= ~/workspace/auto-money) 를
워크스페이스로 잡았다. 도구가 XITA 저장소(portfolio/tools)로 옮겨오면서 그 계산은
XITA 저장소를 가리키게 되므로, 경로는 모두 이 모듈에서 env 기준으로 해석한다.

/*
변경 전 정책: 워크스페이스 = 스크립트 위치의 parents[2], 레지스트리 = <워크스페이스>/planner/projects.json,
             비밀 파일 = <워크스페이스>/planner/tools/*, 앱 폴더 = 레지스트리 path 또는 <워크스페이스>/<코드네임>.
변경 후 정책: 워크스페이스 = $XITA_PORTFOLIO_ROOT (기본 ~/workspace/auto-money),
             비밀 파일 = $XITA_SECRETS_DIR (기본 <root>/planner/tools — 앱 gradle 이 이 경로를 참조하므로 이동 금지),
             레지스트리 = $XITA_REGISTRY → <XITA_WORKSPACE>/.xita/portfolio-registry.json → <root>/planner/projects.json
             중 처음 존재하는 파일.
변경 이유: 도구 위치(XITA 저장소)와 앱 저장소 위치(auto-money)가 분리됐다. 레지스트리의 원본도
          XITA 서버가 내보내는 portfolio-registry.json 으로 바뀌었다.
영향 범위: portfolio/tools 의 모든 스크립트. env 를 설정하지 않으면 planner 시절과 같은 경로를 쓴다.
*/

env:
    XITA_PORTFOLIO_ROOT  앱 저장소들이 모인 폴더 (기본 ~/workspace/auto-money)
    XITA_SECRETS_DIR     play-account.json / keystore.properties / upload.jks (기본 <root>/planner/tools)
    XITA_ADMOB_DIR       admob-client.json / admob-token.json (기본 <root>/secrets)
    XITA_REGISTRY        레지스트리 JSON 경로 직접 지정
    XITA_WORKSPACE       XITA canonical workspace (기본 ~/.xita-workspace)
"""

import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("XITA_PORTFOLIO_ROOT", "~/workspace/auto-money")).expanduser()
SECRETS = Path(os.environ.get("XITA_SECRETS_DIR") or ROOT / "planner" / "tools").expanduser()
ADMOB_DIR = Path(os.environ.get("XITA_ADMOB_DIR") or ROOT / "secrets").expanduser()
TEMPLATE = Path(__file__).resolve().parent.parent / "template"


def registry_candidates() -> list:
    """레지스트리 후보 경로 (우선순위 순)."""
    out = []
    if os.environ.get("XITA_REGISTRY"):
        out.append(Path(os.environ["XITA_REGISTRY"]).expanduser())
    workspace = Path(os.environ.get("XITA_WORKSPACE", "~/.xita-workspace")).expanduser()
    out.append(workspace / ".xita" / "portfolio-registry.json")
    out.append(ROOT / "planner" / "projects.json")
    return out


def registry_path():
    """처음 존재하는 레지스트리 파일. 없으면 None."""
    for p in registry_candidates():
        if p.is_file():
            return p
    return None


def registry_projects() -> list:
    """레지스트리의 프로젝트 목록 [{codename, path?, label?, desc?}]. 읽을 수 없으면 빈 목록."""
    p = registry_path()
    if p is None:
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    items = data.get("projects", []) if isinstance(data, dict) else data
    out = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict) or not item.get("codename"):
            continue
        out.append({k: item[k] for k in ("codename", "path", "label", "desc") if item.get(k)})
    return out


def project_dir(codename: str) -> Path:
    """앱 폴더. 레지스트리에 path 가 있으면(LingoLayer/lingolayer 같은 중첩 프로젝트) 그 경로,
    없으면 <root>/<코드네임>. 상대경로 path 는 root 기준."""
    for p in registry_projects():
        if p["codename"] == codename and p.get("path"):
            path = Path(p["path"]).expanduser()
            return path if path.is_absolute() else ROOT / path
    return ROOT / codename


def display_path(path: Path) -> str:
    """출력용 경로. root 아래면 상대경로, 아니면(레지스트리의 외부 경로) 절대경로."""
    try:
        return str(Path(path).relative_to(ROOT))
    except ValueError:
        return str(path)
