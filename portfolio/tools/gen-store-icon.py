#!/usr/bin/env python3
"""
Play Store 앱 아이콘(512x512) 생성기.

adaptive icon의 foreground PNG를 brand 배경색 위에 올려
정사각 512x512 PNG를 만든다. 헤드리스 Chrome으로 렌더한다.
별도 이미지 라이브러리를 설치하지 않기 위해 gen-feature-graphic.py와
같은 방식을 쓴다.

배경색은 각 앱의 values/ic_launcher_background.xml 에서 읽고,
전경은 drawable-xxxhdpi/ic_launcher_foreground.png(432x432)를
그대로 512 캔버스 중앙에 올린다. 런처 adaptive icon과 동일 외관.

사용법:
    python3 gen-store-icon.py
결과:
    <앱폴더>/docs/store/app-icon-512.png
"""

import pathlib
import re
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
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# 가계부(daily-ledger)는 삭제됨. 나머지 7개.
APPS = [
    "battery-health",
    "bus-when",
    "device-spec",
    "level-tool",
    "noise-meter",
    "stud-finder",
    "theme-ledger",
]

HTML = """<!doctype html>
<html><head><meta charset="utf-8"><style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  html, body {{ width:512px; height:512px; overflow:hidden; }}
  body {{
    background: {color};
    display: flex; align-items: center; justify-content: center;
  }}
  img {{ width: 432px; height: 432px; }}
</style></head>
<body><img src="{fg_uri}"></body></html>
"""


def bg_color(app: pathlib.Path) -> str:
    f = app / "app/src/main/res/values/ic_launcher_background.xml"
    m = re.search(r"#([0-9A-Fa-f]{6})", f.read_text(encoding="utf-8"))
    return "#" + m.group(1)


def main():
    if not pathlib.Path(CHROME).exists():
        print(f"Chrome을 찾을 수 없습니다: {CHROME}")
        return

    for codename in APPS:
        app = project_dir(codename)
        if not app.exists():
            print(f"건너뜀: {codename}")
            continue

        fg = app / "app/src/main/res/drawable-xxxhdpi/ic_launcher_foreground.png"
        if not fg.exists():
            print(f"{codename}: foreground 없음 — 건너뜀")
            continue

        out_dir = app / "docs" / "store"
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / "app-icon-512.png"
        color = bg_color(app)

        with tempfile.TemporaryDirectory() as tmp:
            page = pathlib.Path(tmp) / "icon.html"
            page.write_text(
                HTML.format(color=color, fg_uri=fg.as_uri()), encoding="utf-8"
            )
            # gen-feature-graphic.py와 동일: 이 버전 Chrome은 스크린샷 후 스스로
            # 종료하지 않으므로 파일 생성을 기다렸다가 terminate 한다.
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
                    "--virtual-time-budget=1500",
                    "--window-size=512,512",
                    f"--screenshot={out}",
                    f"--user-data-dir={tmp}/profile",
                    page.as_uri(),
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
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
            dims = " ".join(
                line.split(":")[-1].strip() for line in size.strip().splitlines()[1:]
            )
            print(f"{codename}: {display_path(out)}  ({dims})")
        else:
            print(f"{codename}: 생성 실패")


if __name__ == "__main__":
    main()
