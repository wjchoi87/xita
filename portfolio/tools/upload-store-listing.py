#!/usr/bin/env python3
"""
Play Store 등록정보(리스팅) 업로드.

deploy.py 는 AAB/트랙만 올린다. 이 스크립트는 스토어 등록정보를 채운다:
  - 언어별 listing 텍스트(이름 / 간단한 설명 / 자세한 설명) — ko-KR + en-US
  - 512px 앱 아이콘
  - 피처 그래픽(1024x500)

카테고리·태그는 Play Developer API 가 지원하지 않아 다루지 않는다.
(<root>/planner/docs/store-categories.md 참고, 콘솔 수동 입력)

준비물(deploy.py 와 동일):
    play-account.json — 공용 $XITA_SECRETS_DIR/play-account.json 자동 참조
                        (기본 ~/workspace/auto-money/planner/tools, xita_paths.py 참고)

사용법:
    python3 upload-store-listing.py <코드네임> [--dry-run] [--no-images]
"""
import argparse
import importlib.util
import json
import pathlib
import sys
import urllib.error
import urllib.request

TOOLS = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

from deploy import access_token, call, play_key, project_dir, API, UPLOAD  # noqa: E402

# gen-store-listing.py(파일명에 하이픈) 을 importlib 로 로드해 APPS/build_full 재사용.
_spec = importlib.util.spec_from_file_location(
    "gen_store_listing", TOOLS / "gen-store-listing.py")
gsl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gsl)
from store_listing_en import APPS_EN  # noqa: E402

try:
    from store_listing_ja import APPS_JA  # noqa: E402
except ImportError:  # ja 문구 파일이 없어도 ko/en 업로드는 계속된다
    APPS_JA = {}

def package_of(codename: str) -> str:
    gradle = (project_dir(codename) / "app/build.gradle.kts").read_text(encoding="utf-8")
    return gradle.split('applicationId = "')[1].split('"')[0]


def safe_delete(token: str, url: str) -> None:
    """404(이미지 없음)는 무시, 그 외는 죽인다. icon/featureGraphic 재등록 전 정리용."""
    req = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {token}"}, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            res.read()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            e.read()
            return
        detail = e.read().decode()
        raise SystemExit(f"\nPlay API 오류 {e.code} (DELETE {url})\n{detail}\n")


def clear_screenshots(token, package, edit, lang) -> None:
    """다중 이미지(phoneScreenshots)는 image_id 가 필요하므로 모두 삭제한다."""
    base = f"{API}/applications/{package}/edits/{edit}/listings/{lang}/phoneScreenshots"
    existing = call(token, "GET", base)
    for img in existing.get("images", []):
        safe_delete(token, f"{base}/{img['id']}")


def upload_single(token, package, edit, lang, image_type, path: pathlib.Path):
    """단일 이미지(icon/featureGraphic) 재등록. 기존 1장을 덮어쓴다."""
    base = f"{API}/applications/{package}/edits/{edit}/listings/{lang}/{image_type}"
    safe_delete(token, base)
    url = (f"{UPLOAD}/applications/{package}/edits/{edit}/listings/{lang}/{image_type}"
           f"?uploadType=media")
    call(token, "POST", url, raw=path.read_bytes(), ctype="image/png")


def listing_for(codename, lang):
    """gen-store-listing 데이터에서 (title, short, full) 을 얻는다."""
    if lang == "ko-KR":
        cfg = gsl.APPS[codename]
        return cfg["title"], cfg["short"], gsl.build_full(cfg)
    if lang == "ja-JP":
        cfg = APPS_JA[codename]
        return cfg["title"], cfg["short"], cfg["full"]
    cfg = APPS_EN[codename]
    return cfg["title"], cfg["short"], gsl.build_full(cfg, en=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("codename")
    ap.add_argument("--dry-run", action="store_true", help="업로드 없이 등록할 내용만 출력")
    ap.add_argument("--no-images", action="store_true", help="이미지(아이콘/피처)는 올리지 않고 텍스트만")
    args = ap.parse_args()

    if args.codename not in gsl.APPS:
        raise SystemExit(f"알 수 없는 코드네임: {args.codename}")

    app_dir = project_dir(args.codename)
    if not app_dir.exists():
        raise SystemExit(f"프로젝트 없음: {app_dir}")
    package = package_of(args.codename)

    icon = app_dir / "docs/store/app-icon-512.png"
    feature = app_dir / "docs/store/feature-graphic.png"

    # 언어별 이미지 — 언어 폴더(docs/store/<lang>/)에 전용 세트가 있으면 그걸 쓰고,
    # 없으면 기본 세트(docs/store 바로 아래, 한국어)를 상속한다.
    def screenshots_for(lang: str):
        localized = sorted(app_dir.glob(f"docs/store/{lang.split('-')[0]}/phone-screenshot-[0-9].png"),
                           key=lambda p: int(p.stem.rsplit("-", 1)[1]))
        if localized:
            return localized
        return sorted(app_dir.glob("docs/store/phone-screenshot-[0-9].png"),
                      key=lambda p: int(p.stem.rsplit("-", 1)[1]))

    def feature_for(lang: str) -> pathlib.Path:
        localized = app_dir / f"docs/store/feature-graphic-{lang.split('-')[0]}.png"
        return localized if localized.exists() else feature

    screenshots = screenshots_for("ko-KR")

    t_ko, s_ko, f_ko = listing_for(args.codename, "ko-KR")
    t_en, s_en, f_en = listing_for(args.codename, "en-US")

    print(f"[{args.codename}] {package}")
    print(f"  ko-KR 이름 {len(t_ko)}/30 · 짧은설명 {len(s_ko)}/80 · 자세히 {len(f_ko)}자")
    print(f"  en-US 이름 {len(t_en)}/30 · 짧은설명 {len(s_en)}/80 · 자세히 {len(f_en)}자")
    print(f"  아이콘 {'OK' if icon.exists() else '없음!'} · "
          f"피처 {'OK' if feature.exists() else '없음!'} · "
          f"스크린샷 {len(screenshots)}장")

    if not icon.exists() or not feature.exists():
        raise SystemExit("  이미지 자산 없음. gen-store-icon.py / gen-feature-graphic.py 실행.")

    if args.dry_run:
        print("  (dry-run) 업로드하지 않고 종료.")
        return

    sa = json.loads(play_key(app_dir).read_text(encoding="utf-8"))
    token = access_token(sa)
    print("  인증 완료")

    edit = call(token, "POST", f"{API}/applications/{package}/edits")
    edit_id = edit["id"]

    langs = [("ko-KR", (t_ko, s_ko, f_ko)), ("en-US", (t_en, s_en, f_en))]
    if args.codename in APPS_JA:
        langs.append(("ja-JP", listing_for(args.codename, "ja-JP")))
    for lang, (t, s, f) in langs:
        call(token, "PUT",
             f"{API}/applications/{package}/edits/{edit_id}/listings/{lang}",
             body={"language": lang, "title": t,
                   "fullDescription": f, "shortDescription": s})
        print(f"  listing {lang} 등록")

    if not args.no_images:
        upload_single(token, package, edit_id, "ko-KR", "icon", icon)
        print("  아이콘 등록")
        for lang in ("ko-KR", "en-US", "ja-JP"):
            if lang == "ja-JP" and args.codename not in APPS_JA:
                continue
            shots = screenshots_for(lang)
            upload_single(token, package, edit_id, lang, "featureGraphic", feature_for(lang))
            print(f"  피처 그래픽 등록 ({lang})")
            clear_screenshots(token, package, edit_id, lang)
            for shot in shots:
                url = (f"{UPLOAD}/applications/{package}/edits/{edit_id}"
                       f"/listings/{lang}/phoneScreenshots?uploadType=media")
                call(token, "POST", url, raw=shot.read_bytes(), ctype="image/png")
            print(f"  스크린샷 {len(shots)}장 등록 ({lang})")

    call(token, "POST", f"{API}/applications/{package}/edits/{edit_id}:commit")
    print("  커밋 완료")


if __name__ == "__main__":
    sys.exit(main())
