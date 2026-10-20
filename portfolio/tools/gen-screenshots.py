#!/usr/bin/env python3
"""
Play Store 휴대전화 스크린샷 자동 캡처.

연결된 실제 기기에 debug APK를 설치하고 adb screencap으로
메인 화면(phone-screenshot-1)과 두 번째 화면(phone-screenshot-2)을
PNG로 찍는다. Play listing 정식 게시에 필요한 휴대전화 스크린샷 2장 확보용.

출력:
    <앱>/docs/store/phone-screenshot-1.png   (메인 화면)
    <앱>/docs/store/phone-screenshot-2.png   (두 번째 화면)

사전 요건:
    - adb 에 기기 1대 연결
    - 각 앱 debug APK 빌드 완료 (cd <앱> && ./gradlew assembleDebug)

사용법:
    python3 gen-screenshots.py theme-ledger
    python3 gen-screenshots.py --all
"""

import argparse
import pathlib
import re
import subprocess
import sys
import time

# 경로는 xita_paths 가 env($XITA_PORTFOLIO_ROOT 등) 기준으로 해석한다.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from xita_paths import ROOT as WORKSPACE, display_path, project_dir  # noqa: E402,F401

# 변경 전 정책: 앱 폴더 = <워크스페이스(parents[2])>/<코드네임> 고정.
# 변경 후 정책: 앱 폴더 = xita_paths.project_dir(코드네임) — 레지스트리 path 우선, 없으면 <root>/<코드네임>.
# 변경 이유: 도구가 XITA 저장소로 이동해 parents[2] 가 더 이상 auto-money 가 아니다. 중첩 프로젝트도 같은 규칙으로 찾는다.
# 영향 범위: 레지스트리에 path 가 지정된 앱만 대상 폴더가 바뀐다. 나머지는 이전과 같은 경로.
ADB = pathlib.Path.home() / "Library/Android/sdk/platform-tools/adb"
ACTIVITY = "MainActivity"  # 전 앱 동일

APPS = [
    ("theme-ledger", "com.wonjin.themeledger"),
    ("noise-meter", "com.wonjin.noisemeter"),
    ("level-tool", "com.wonjin.level"),
    ("stud-finder", "com.wonjin.studfinder"),
    ("battery-health", "com.wonjin.batteryhealth"),
    ("device-spec", "com.wonjin.devicespec"),
    ("bus-when", "com.wonjin.buswhen"),
]

# 메인 화면에서 "두 번째 화면"으로 가기 위한 인터랙션.
# 값:
#   ("swipe",)                       위로 스와이프(스크롤)
#   ("tap_text", "버튼문구")          uiautomator dump 에서 해당 text/desc 노드의 중앙 탭
#   ("tap", x, y)                    절대 좌표 탭 (기기 해상도 의존 — 비권장)
SHOT2 = {
    "theme-ledger": ("tap_text", "새 장부"),      # FAB → 새 장부 만들기 폼
    "noise-meter": ("tap_text", "측정 시작"),     # → 측정 중 게이지 화면
    "level-tool": ("tap_text", "각도"),           # 세그먼트 → 경사판 시각화
    "device-spec": ("tap_text", "펼치기"),        # 센서 섹션 펼치기
    "stud-finder": ("swipe",),                    # 감도/안전 패널 스크롤
    "battery-health": ("swipe",),                 # 설계 용량/이력 스크롤
    "bus-when": ("tap_text", "도시 변경"),         # topBar 도시 변경 → City 목록
}

# 캡처 전 미리 부여할 runtime 권한. (다이얼로그 없이 핵심 화면을 찍기 위함)
PERMISSIONS = {
    "noise-meter": ["android.permission.RECORD_AUDIO"],
}


def adb(*args, timeout=60):
    return subprocess.run([str(ADB), *args],
                          capture_output=True, text=True, timeout=timeout)


def device_ready():
    out = adb("devices").stdout
    lines = [l for l in out.splitlines()[1:]
             if l.strip() and "\tdevice" in l]
    if len(lines) != 1:
        print(f"기기가 정확히 1대 연결되어야 합니다:\n{out}")
        return False
    return True


def install(codename):
    apk = project_dir(codename) / "app/build/outputs/apk/debug/app-debug.apk"
    if not apk.exists():
        print(f"  debug APK 없음: {apk}")
        print("  (cd <앱> && ./gradlew assembleDebug 먼저 실행)")
        return False
    rc = adb("install", "-r", str(apk), timeout=120).returncode
    return rc == 0


def launch(pkg):
    adb("shell", "input", "keyevent", "224")   # 화면 켜기
    adb("shell", "input", "keyevent", "82")    # 잠금 해제(무잠금 시)
    adb("shell", "am", "start", "-W", "-n", f"{pkg}/.{ACTIVITY}", timeout=30)
    time.sleep(3.0)  # 첫 프레임 + 광고 로드 대기


def screencap(path: pathlib.Path):
    with open(path, "wb") as f:
        rc = subprocess.run([str(ADB), "exec-out", "screencap", "-p"],
                            stdout=f, timeout=30).returncode
    return rc == 0 and path.exists() and path.stat().st_size > 0


def uiautomator_dump():
    """화면 UI 트리를 XML로 덤프해 반환."""
    adb("shell", "uiautomator", "dump", "/sdcard/_sshot_ui.xml", timeout=30)
    r = adb("shell", "cat", "/sdcard/_sshot_ui.xml", timeout=15)
    return r.stdout


def tap_text(needle: str):
    """uiautomator dump 에서 text/content-desc 가 needle 인 노드의
    bounds 중앙을 탭한다. Compose 의 semantics 노출에 의존."""
    xml = uiautomator_dump()
    # bounds="[x1,y1][x2,y2]" 중 앞의 text/desc 일치 노드.
    pat = re.compile(
        r'<node[^>]*(?:text|content-desc)="([^"]*'
        + re.escape(needle) + r'[^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')
    m = pat.search(xml)
    if not m:
        print(f"    (tap_text '{needle}' 노드 못 찾음 — swipe로 폴백)")
        adb("shell", "input", "swipe", "600", "1800", "600", "700", "400")
        return
    x1, y1, x2, y2 = map(int, m.groups()[1:])
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    adb("shell", "input", "tap", str(cx), str(cy))


def shot2_action(codename):
    spec = SHOT2.get(codename, ("swipe",))
    kind = spec[0]
    if kind == "tap_text":
        tap_text(spec[1])
    elif kind == "tap":
        adb("shell", "input", "tap", str(spec[1]), str(spec[2]))
    else:  # swipe
        adb("shell", "input", "swipe", "600", "1800", "600", "700", "400")
    time.sleep(2.0)


def capture_app(codename, pkg):
    out_dir = project_dir(codename) / "docs" / "store"
    out_dir.mkdir(parents=True, exist_ok=True)
    s1 = out_dir / "phone-screenshot-1.png"
    s2 = out_dir / "phone-screenshot-2.png"

    print(f"[{codename}] 설치...")
    if not install(codename):
        return False
    for p in PERMISSIONS.get(codename, []):
        adb("shell", "pm", "grant", pkg, p)
    print(f"[{codename}] 실행 + 메인 캡처...")
    launch(pkg)
    if not screencap(s1):
        print("  shot1 캡처 실패")
        return False
    print(f"  shot1 OK")
    shot2_action(codename)
    if not screencap(s2):
        print("  shot2 캡처 실패")
        return False
    print(f"  shot2 OK")
    adb("shell", "am", "force-stop", pkg)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("codename", nargs="?", default=None)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    if not device_ready():
        return 1

    if args.all:
        targets = APPS
    elif args.codename:
        targets = [(c, p) for c, p in APPS if c == args.codename]
        if not targets:
            print(f"알 수 없는 코드네임: {args.codename}")
            return 1
    else:
        ap.error("코드네임 또는 --all 필요")

    ok = 0
    for codename, pkg in targets:
        if capture_app(codename, pkg):
            ok += 1
    print(f"\n완료: {ok}/{len(targets)}")
    return 0 if ok == len(targets) else 1


if __name__ == "__main__":
    sys.exit(main())
