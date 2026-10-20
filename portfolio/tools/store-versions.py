#!/usr/bin/env python3
"""
Play Console 트랙별 최신 versionCode 조회 (읽기 전용).

planner 대시보드 server.py 의 refresh_store_versions 를 독립 CLI 로 옮긴 것.
edit 을 만들어 트랙을 조회한 뒤 commit 없이 DELETE 로 버린다 — 스토어에 영향이 없다.
인증·API 주소는 deploy.py 의 access_token / API 를 그대로 쓴다.

사용법:
    python3 store-versions.py <코드네임>=<패키지명> [<코드네임>=<패키지명> ...]

출력:
    사람용 줄  `[스토어] <코드네임>: production 104 · internal 2` (실패 시 사유)
    마지막 줄  `XITA_RESULT {"<코드네임>": {"production": 104, ...}}` (성공한 앱만)

play-account.json 이 없으면 안내 한 줄 후 `XITA_RESULT {}` 로 정상 종료(0)한다.
"""

import json
import pathlib
import sys
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from deploy import API, SHARED_KEY, access_token  # noqa: E402


def _http_json(url: str, body: dict | None = None, token: str | None = None,
               method: str | None = None) -> dict:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as res:
        text = res.read().decode()
        return json.loads(text) if text.strip() else {}


def parse_args(argv: list) -> list:
    pairs = []
    for arg in argv:
        if arg in ("-h", "--help"):
            print(__doc__.strip())
            raise SystemExit(0)
        codename, sep, pkg = arg.partition("=")
        if not sep or not codename or not pkg:
            raise SystemExit(f"인자 형식 오류: {arg!r} — <코드네임>=<패키지명> 이어야 합니다")
        pairs.append((codename, pkg))
    if not pairs:
        raise SystemExit("사용법: python3 store-versions.py <코드네임>=<패키지명> [...]")
    return pairs


def query(token: str, pkg: str) -> dict:
    edit = _http_json(f"{API}/applications/{pkg}/edits", body={}, token=token, method="POST")
    eid = edit["id"]
    try:
        tracks = _http_json(f"{API}/applications/{pkg}/edits/{eid}/tracks", token=token)
    finally:
        try:  # commit 하지 않는 edit 은 버린다. 조회일 뿐이다.
            _http_json(f"{API}/applications/{pkg}/edits/{eid}", token=token, method="DELETE")
        except Exception:  # noqa: BLE001
            pass
    result = {}
    for t in tracks.get("tracks", []):
        codes = [int(c) for rel in t.get("releases", [])
                 for c in rel.get("versionCodes", [])]
        if codes:
            result[t["track"]] = max(codes)
    return result


def main():
    pairs = parse_args(sys.argv[1:])
    out = {}
    if not SHARED_KEY.exists():
        print(f"[스토어] play-account.json 이 없어 버전 조회를 건너뜁니다 ({SHARED_KEY.parent})")
        print("XITA_RESULT {}")
        return 0

    try:
        token = access_token(json.loads(SHARED_KEY.read_text(encoding="utf-8")))
    except Exception as exc:  # noqa: BLE001
        print(f"[스토어] 인증 실패 — {type(exc).__name__}")
        print("XITA_RESULT {}")
        return 1

    for codename, pkg in pairs:
        try:
            result = query(token, pkg)
            out[codename] = result
            summary = " · ".join(f"{k} {v}" for k, v in result.items()) or "릴리스 없음"
            print(f"[스토어] {codename}: {summary}")
        except Exception as exc:  # noqa: BLE001
            print(f"[스토어] {codename}: 조회 실패 ({pkg}) — {exc}")

    print("XITA_RESULT " + json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
