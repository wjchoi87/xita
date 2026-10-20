#!/usr/bin/env python3
"""
Play Store 업로드.

## 왜 플러그인을 안 쓰는가
`com.github.triplet.play` 3.12.1은 AGP 9.x와 호환되지 않는다.
AGP 9에서 제거된 `BaseAppModuleExtension`을 참조해 플러그인 적용 단계에서 죽는다.
플러그인이 AGP 9를 지원할 때까지 기다리는 대신, Play Developer API를 직접 호출한다.

## 왜 외부 라이브러리를 안 쓰는가
`google-auth`가 설치돼 있지 않고, 배포 도구 하나 때문에 의존성을 늘리고 싶지 않다.
서비스 계정 인증(RS256 JWT)은 표준 라이브러리와 openssl만으로 충분히 구현된다.

## 사용법
    python3 deploy.py <코드네임> [--track internal|alpha|beta|production] [--notes "변경사항"]

준비물 (앱 폴더 안에):
    keystore.properties  서명 설정
    aos.jks              업로드 키
    play-account.json    Play Console 서비스 계정 키

준비물이 없으면 무엇이 빠졌는지 알려주고 멈춘다.

경로(앱 폴더·공용 비밀 파일·레지스트리)는 xita_paths.py 가 env 로 해석한다.
공용 play-account.json / keystore.properties 는 $XITA_SECRETS_DIR (기본 <root>/planner/tools).
"""

import argparse
import base64
import urllib.parse
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

# 경로는 xita_paths 가 env 기준으로 해석한다 (python3 -I 실행에서도 import 되도록 sys.path 보강).
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from xita_paths import ROOT as WORKSPACE, SECRETS, project_dir  # noqa: E402,F401

SCOPE = "https://www.googleapis.com/auth/androidpublisher"
API = "https://androidpublisher.googleapis.com/androidpublisher/v3"
UPLOAD = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def access_token(sa: dict) -> str:
    """서비스 계정 JSON으로 액세스 토큰을 받는다. RS256 서명은 openssl에 맡긴다."""
    now = int(time.time())
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = b64url(
        json.dumps(
            {
                "iss": sa["client_email"],
                "scope": SCOPE,
                "aud": "https://oauth2.googleapis.com/token",
                "iat": now,
                "exp": now + 3600,
            }
        ).encode()
    )
    signing_input = f"{header}.{claims}".encode()

    with tempfile.TemporaryDirectory() as tmp:
        key = pathlib.Path(tmp) / "key.pem"
        key.write_text(sa["private_key"], encoding="utf-8")
        payload = pathlib.Path(tmp) / "payload"
        payload.write_bytes(signing_input)
        signed = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", str(key), str(payload)],
            capture_output=True,
            check=True,
        ).stdout

    jwt = f"{header}.{claims}.{b64url(signed)}"
    body = urllib.parse.urlencode(
        {"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": jwt}
    ).encode()
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=body)
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)["access_token"]


def commit_edit(token: str, package: str, edit_id: str) -> None:
    """커밋. 신규 앱은 changesNotSentForReview 를 거부(400)하므로 일반 커밋으로 재시도한다."""
    base = f"{API}/applications/{package}/edits/{edit_id}"
    try:
        call(token, "POST", f"{base}:commit?changesNotSentForReview=true")
    except SystemExit as e:
        if "must not be set" not in str(e):
            raise
        call(token, "POST", f"{base}:commit")


def call(token: str, method: str, url: str, body=None, raw: bytes = None, ctype=None):
    headers = {"Authorization": f"Bearer {token}"}
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if ctype:
        headers["Content-Type"] = ctype
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=600) as res:
            text = res.read().decode()
            return json.loads(text) if text.strip() else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()
        raise SystemExit(f"\nPlay API 오류 {e.code} ({method} {url})\n{detail}\n")


# 서비스 계정 하나로 계정 안의 모든 앱을 다룰 수 있다.
# 앱마다 복사해두면 7곳을 따로 관리해야 하므로, 공용 위치를 먼저 본다.
# 공용 위치 = xita_paths.SECRETS ($XITA_SECRETS_DIR, 기본 <root>/planner/tools).
SHARED_KEY = SECRETS / "play-account.json"
SHARED_KEYSTORE_PROPS = SECRETS / "keystore.properties"


def play_key(app_dir: pathlib.Path) -> pathlib.Path | None:
    for candidate in (app_dir / "play-account.json", SHARED_KEY):
        if candidate.exists():
            return candidate
    return None


def check_ready(app_dir: pathlib.Path) -> list:
    missing = []
    # gradle 과 같은 순서로 본다: 공용 설정이 있으면 앱 폴터 안 파일은 없어도 된다.
    if not (app_dir / "keystore.properties").exists() and not SHARED_KEYSTORE_PROPS.exists():
        missing.append(
            f"keystore.properties — portfolio/tools/make-keystore.sh 로 만드세요 ({SECRETS} 에 생성)")
    if play_key(app_dir) is None:
        missing.append(
            f"play-account.json — Play Console 서비스 계정 키. "
            f"{SHARED_KEY} 에 두면 모든 앱이 함께 씁니다")
    return missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("codename")
    ap.add_argument("--dir", default="",
                    help="앱 폴더 경로. 없으면 워크스페이스/<코드네임>을 쓴다")
    ap.add_argument("--track", default="internal",
                    choices=["internal", "alpha", "beta", "production"])
    ap.add_argument("--notes", default="", help="출시 노트 (ko-KR)")
    ap.add_argument("--notes-en", default="", help="출시 노트 (en-US)")
    ap.add_argument("--notes-ja", default="", help="출시 노트 (ja-JP)")
    ap.add_argument("--notes-only", action="store_true",
                    help="빌드·업로드 없이 기존 릴리스의 출시 노트만 갱신한다")
    ap.add_argument("--submit", action="store_true",
                    help="프로덕션 release를 draft 대신 completed로 만든다(심사 자동 제출). "
                         "출시 이력이 없는 앱은 Play 정책상 거부되므로 draft로 폴백한다")
    ap.add_argument("--dry-run", action="store_true", help="빌드까지만 하고 업로드하지 않는다")
    args = ap.parse_args()

    # 대시보드에서 워크스페이스 밖 프로젝트를 등록할 수 있으므로 경로를 직접 받는다.
    app_dir = pathlib.Path(args.dir).resolve() if args.dir else project_dir(args.codename)
    if not app_dir.exists():
        raise SystemExit(f"프로젝트를 찾을 수 없습니다: {app_dir}")

    missing = check_ready(app_dir)
    if missing and not args.dry_run:
        print(f"[{args.codename}] 배포 준비가 안 됐습니다:\n")
        for m in missing:
            print(f"  - {m}")
        print(f"\n준비 방법은 {WORKSPACE / 'planner' / 'docs' / 'deploy-setup.md'} 를 참고하세요.")
        raise SystemExit(1)

    # 패키지명은 gradle 설정에서 읽는다. 손으로 관리하면 언젠가 어긋난다.
    gradle = (app_dir / "app/build.gradle.kts").read_text(encoding="utf-8")
    package = gradle.split('applicationId = "')[1].split('"')[0]

    def release_notes():
        notes = []
        if args.notes:
            notes.append({"language": "ko-KR", "text": args.notes})
        if args.notes_en:
            notes.append({"language": "en-US", "text": args.notes_en})
        if args.notes_ja:
            notes.append({"language": "ja-JP", "text": args.notes_ja})
        return notes

    if args.notes_only:
        # 이미 올라간 릴리스의 노트만 바꾼다. 버전 코드·상태는 트랙에서 읽은 값을 유지.
        sa = json.loads(play_key(app_dir).read_text(encoding="utf-8"))
        token = access_token(sa)
        edit = call(token, "POST", f"{API}/applications/{package}/edits")
        edit_id = edit["id"]
        track = call(
            token, "GET",
            f"{API}/applications/{package}/edits/{edit_id}/tracks/{args.track}",
        )
        releases = track.get("releases", [])
        if not releases:
            raise SystemExit(f"  {args.track} 트랙에 릴리스가 없습니다")
        release = releases[0]
        release["releaseNotes"] = release_notes()
        call(
            token, "PUT",
            f"{API}/applications/{package}/edits/{edit_id}/tracks/{args.track}",
            body={"track": args.track, "releases": [release]},
        )
        commit_edit(token, package, edit_id)
        print(f"[{args.codename}] {package} {args.track} 노트 갱신 완료 "
              f"(versionCode {release['versionCodes']})")
        return

    print(f"[{args.codename}] {package} → {args.track}")
    print("  AAB 빌드 중...")
    build = subprocess.run(
        ["./gradlew", "bundleRelease", "-q"], cwd=app_dir, capture_output=True, text=True
    )
    if build.returncode != 0:
        print(build.stdout[-2000:])
        print(build.stderr[-2000:])
        raise SystemExit("  빌드 실패")

    aabs = list((app_dir / "app/build/outputs/bundle/release").glob("*.aab"))
    if not aabs:
        raise SystemExit("  AAB를 찾을 수 없습니다")
    aab = aabs[0]
    print(f"  AAB: {aab.name} ({aab.stat().st_size // 1024}KB)")

    if args.dry_run:
        print("  (dry-run) 업로드하지 않고 종료합니다.")
        return

    sa = json.loads(play_key(app_dir).read_text(encoding="utf-8"))
    token = access_token(sa)
    print("  인증 완료")

    edit = call(token, "POST", f"{API}/applications/{package}/edits")
    edit_id = edit["id"]

    up = None
    try:
        up = call(
            token, "POST",
            f"{UPLOAD}/applications/{package}/edits/{edit_id}/bundles?uploadType=media",
            raw=aab.read_bytes(), ctype="application/octet-stream",
        )
    except SystemExit as e:
        # 번들은 앱 단위로 공유된다 — 다른 트랙에 이미 올린 같은 코드면 업로드 없이 재사용한다.
        used = re.search(r"Version code (\d+) has already been used", str(e))
        if not used:
            raise
    version_code = up["versionCode"] if up else int(used.group(1))
    print(
        f"  업로드 완료 (versionCode {version_code})"
        if up else
        f"  기존 번들 재사용 (versionCode {version_code})"
    )

    # 프로덕션 첫 배포(draft app)는 release 를 draft 로만 만들 수 있다.
    # (Play 정책: 한 번도 출시된 적 없는 앱은 production 을 completed 로 못 만든다.)
    # 기본 동작은 draft 후 Play Console 에서 심사 제출. --submit 이면 completed 를
    # 시도하고, 정책상 거부되면 draft 로 되돌린다.
    submit = args.submit and args.track == "production"
    status = "draft" if args.track == "production" and not submit else "completed"
    release = {"versionCodes": [str(version_code)], "status": status}
    notes = release_notes()
    if notes:
        release["releaseNotes"] = notes

    put_track = lambda: call(
        token, "PUT",
        f"{API}/applications/{package}/edits/{edit_id}/tracks/{args.track}",
        body={"track": args.track, "releases": [release]},
    )
    # draft 앱 거부는 트랙 PUT 이 아니라 커밋 단계에서 나기도 한다
    # ("Only releases with status draft may be created on draft app.", LingoLayer 2026-10-09) — 둘 다 잡는다.
    try:
        put_track()
        commit_edit(token, package, edit_id)
    except SystemExit as e:
        if not (submit and "draft" in str(e).lower()):
            raise
        release["status"] = "draft"
        put_track()
        commit_edit(token, package, edit_id)
        print("  출시 이력이 없는 앱이라 draft 로 생성됨 — Play Console 에서 심사 제출 필요")
    print(f"  {args.track} 트랙 반영 완료 ({release['status']})")


if __name__ == "__main__":
    sys.exit(main())
