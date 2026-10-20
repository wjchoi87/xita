#!/usr/bin/env python3
"""
Play Store 피처 그래픽(1024x500) 생성기.

HTML로 그린 뒤 헤드리스 Chrome으로 정확한 크기의 PNG를 뽑는다.
별도 이미지 라이브러리를 설치하지 않기 위한 선택이다.

피처 그래픽은 스토어 상단에 크게, 검색 결과에는 작게 노출된다.
그래서 **작게 줄여도 읽히는 것**이 유일한 기준이다.
글자를 많이 넣지 않고, 앱 이름과 한 줄 약속만 둔다.

사용법:
    python3 gen-feature-graphic.py                     # 한국어(기본) 전부
    python3 gen-feature-graphic.py --lang en [코드네임 ...]
결과:
    <앱폴더>/docs/store/feature-graphic.png        (ko, 기본 언어)
    <앱폴더>/docs/store/feature-graphic-en.png     (en — upload-store-listing.py 가 en-US 에 쓴다)
"""

import argparse
import os
import pathlib
import subprocess
import sys
import tempfile
import time

# 경로는 xita_paths 가 env($XITA_PORTFOLIO_ROOT 등) 기준으로 해석한다.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from xita_paths import ROOT as WORKSPACE, display_path, project_dir  # noqa: E402,F401

# 변경 전 정책: 앱 폴더 = <워크스페이스(parents[2])>/<코드네임> 고정.
# 변경 후 정책: 앱 폴더 = xita_paths.project_dir(코드네임) — 레지스트리 path 우선, 없으면 <root>/<코드네임>.
# 변경 이유: 도구가 XITA 저장소로 이동해 parents[2] 가 더 이상 auto-money 가 아니다. 중첩 프로젝트도 같은 규칙으로 찾는다.
# 영향 범위: 레지스트리에 path 가 지정된 앱만 대상 폴더가 바뀐다. 나머지는 이전과 같은 경로.
# CHROME_BIN 으로 다른 Chromium(예: Playwright 의 Chrome for Testing)을 지정할 수 있다.
CHROME = os.environ.get("CHROME_BIN", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")

APPS = {
    "theme-ledger": {
        "name": "얼마였지?",
        "tagline": "그때 얼마 냈는지, 바로 찾기",
        "color": "#C2410C",
        "symbol": """
          <rect x="20" y="36" width="68" height="38" rx="7"
                stroke="#fff" stroke-width="4.5" fill="none"/>
          <path d="M46,48 a8,8 0 1 1 8,8 c0,4.5 -1.5,5.5 -1.5,9"
                stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round"/>
          <circle cx="53" cy="80" r="3.5" fill="#fff"/>""",
    },
    "noise-meter": {
        "name": "소음 측정",
        "tagline": "층간소음을 기록으로 남기세요",
        "color": "#3B5BDB",
        "symbol": """
          <path d="M30,44h12l16,-14v48l-16,-14h-12z" fill="#fff"/>
          <path d="M68,40 A20,20 0 0 1 68,68" stroke="#fff" stroke-width="6"
                fill="none" stroke-linecap="round"/>
          <path d="M78,30 A32,32 0 0 1 78,78" stroke="#fff" stroke-width="6"
                fill="none" stroke-linecap="round"/>""",
    },
    "level-tool": {
        "name": "수평계",
        "tagline": "화면을 못 봐도 진동으로",
        "color": "#3B5BDB",
        "symbol": """
          <path d="M30,42h48a12,12 0 0 1 0,24h-48a12,12 0 0 1 0,-24z"
                stroke="#fff" stroke-width="5" fill="none"/>
          <path d="M44,44v20" stroke="#fff" stroke-width="3"/>
          <path d="M64,44v20" stroke="#fff" stroke-width="3"/>
          <circle cx="54" cy="54" r="7" fill="#fff"/>""",
    },
    "stud-finder": {
        "name": "벽 탐지기",
        "tagline": "못 박기 전 30초면 충분합니다",
        "color": "#3B5BDB",
        "symbol": """
          <rect x="26" y="26" width="56" height="56" stroke="#fff" stroke-width="4" fill="none"/>
          <path d="M44,26v56" stroke="#fff" stroke-width="3"/>
          <path d="M64,26v56" stroke="#fff" stroke-width="3"/>
          <circle cx="54" cy="54" r="9" fill="#fff"/>""",
    },
    "battery-health": {
        "name": "배터리 상태",
        "tagline": "중고 거래 전에 확인하세요",
        "color": "#18181B",
        "symbol": """
          <rect x="22" y="38" width="56" height="32" stroke="#fff" stroke-width="5" fill="none"/>
          <rect x="82" y="46" width="6" height="16" fill="#fff"/>
          <rect x="29" y="45" width="24" height="18" fill="#fff"/>""",
    },
    "device-spec": {
        "name": "기기 정보",
        "tagline": "칩셋부터 센서까지 한눈에",
        "color": "#18181B",
        "symbol": """
          <rect x="36" y="20" width="36" height="68" stroke="#fff" stroke-width="5" fill="none"/>
          <rect x="44" y="36" width="20" height="4" fill="#fff"/>
          <rect x="44" y="48" width="20" height="4" fill="#fff"/>
          <rect x="44" y="60" width="12" height="4" fill="#fff"/>""",
    },
    "bus-when": {
        "name": "내 버스 언제와",
        "tagline": "정류장별 버스 도착, 위젯까지",
        "color": "#3B6BDB",
        "symbol": """
          <rect x="28" y="36" width="52" height="44" rx="10" fill="#fff"/>
          <rect x="34" y="42" width="40" height="12" rx="2" fill="#3B6BDB"/>
          <rect x="34" y="60" width="16" height="10" fill="#3B6BDB"/>
          <rect x="58" y="60" width="16" height="10" fill="#3B6BDB"/>
          <circle cx="40" cy="82" r="5" fill="#fff"/>
          <circle cx="68" cy="82" r="5" fill="#fff"/>""",
    },
}

# 언어별 이름·한 줄 약속. 번역이 아니라 그 시장의 검색어·문법으로 다시 쓴다.
LANG_OVERRIDES = {
    "en": {
        "theme-ledger": {"name": "Gift Tracker", "tagline": "Who gave what, per event"},
        "noise-meter": {"name": "Noise Meter", "tagline": "Turn noise into evidence"},
        "level-tool": {"name": "Bubble Level", "tagline": "It buzzes when it's level"},
        "stud-finder": {"name": "Stud Finder", "tagline": "Check for metal before you drill"},
        "battery-health": {"name": "Battery Health", "tagline": "Check it before you buy used"},
        "device-spec": {"name": "Device Info", "tagline": "Chipset to sensors at a glance"},
        "bus-when": {"name": "Korea Bus", "tagline": "Arrivals per stop, plus a widget"},
    },
}

HTML = """<!doctype html>
<html><head><meta charset="utf-8"><style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  html, body {{ width:1024px; height:500px; overflow:hidden; }}
  body {{
    background: {color};
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 88px;
    font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
                 "Malgun Gothic", "Noto Sans KR", sans-serif;
    color: #fff;
  }}
  .name {{
    font-size: 84px; font-weight: 800; letter-spacing: -.03em; line-height: 1.05;
  }}
  .tag {{
    margin-top: 20px; font-size: 30px; font-weight: 500;
    letter-spacing: -.01em; opacity: .82;
  }}
  .mark {{ flex: none; opacity: .95; }}
</style></head>
<body>
  <div>
    <div class="name">{name}</div>
    <div class="tag">{tagline}</div>
  </div>
  <svg class="mark" width="280" height="280" viewBox="0 0 108 108">{symbol}</svg>
</body></html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("codenames", nargs="*", help="없으면 전부")
    ap.add_argument("--lang", default="ko", choices=["ko", *LANG_OVERRIDES])
    args = ap.parse_args()

    if not pathlib.Path(CHROME).exists():
        print(f"Chrome을 찾을 수 없습니다: {CHROME}")
        return

    for codename, base_cfg in APPS.items():
        if args.codenames and codename not in args.codenames:
            continue
        cfg = {**base_cfg, **LANG_OVERRIDES.get(args.lang, {}).get(codename, {})}
        out_dir = project_dir(codename) / "docs" / "store"
        if not project_dir(codename).exists():
            print(f"건너뜀: {codename}")
            continue
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / ("feature-graphic.png" if args.lang == "ko" else f"feature-graphic-{args.lang}.png")

        with tempfile.TemporaryDirectory() as tmp:
            page = pathlib.Path(tmp) / "fg.html"
            page.write_text(HTML.format(**cfg), encoding="utf-8")
            # 구버전 `--headless`는 최신 Chrome에서 멈춘다. `--headless=new`가 필요하고,
            # 첫 실행 마법사와 확장 로딩을 끄지 않으면 스크린샷 전에 대기 상태로 빠진다.
            #
            # 또한 이 버전(150.x)의 Chrome은 스크린샷을 쓴 뒤에도 **스스로 종료하지 않는다.**
            # 그래서 종료를 기다리지 않고, 타임아웃으로 끊은 뒤 파일 생성 여부로 성공을 판정한다.
            proc = subprocess.Popen(
                [
                    CHROME,
                    "--headless=new",
                    "--no-sandbox",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-extensions",
                    "--disable-gpu",
                    "--hide-scrollbars",
                    "--force-device-scale-factor=1",
                    # 폰트 로딩과 렌더가 끝날 시간을 준 뒤 캡처한다.
                    "--virtual-time-budget=2000",
                    "--window-size=1024,500",
                    f"--screenshot={out}",
                    f"--user-data-dir={tmp}/profile",
                    page.as_uri(),
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            # 렌더링이 끝나 파일이 생길 때까지만 기다렸다가 정리한다.
            for _ in range(120):
                if out.exists() and out.stat().st_size > 0:
                    break
                time.sleep(0.25)
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()

        if out.exists():
            size = subprocess.run(
                ["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(out)],
                capture_output=True, text=True,
            ).stdout
            dims = " ".join(line.split(":")[-1].strip() for line in size.strip().splitlines()[1:])
            print(f"{codename}: {display_path(out)}  ({dims})")
        else:
            print(f"{codename}: 생성 실패")


if __name__ == "__main__":
    main()
