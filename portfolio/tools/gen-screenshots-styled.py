#!/usr/bin/env python3
"""
Play Store 마케팅 스크린샷 합성.

단순 실기기 캡처(phone-screenshot-N.png, 1200x2133)를
브랜드 그라데이션 배경 + 상단 캡션 + 라운드/그림자 플로팅 카드로 꾸민다.

- 캡션 카피는 마케터 관점(화면 설명이 아니라 "그 화면에서 얻는 것").
- 레이아웃은 디자이너 관점(브랜드 배경, 상단 캡션, 하단 플로팅 카드).

출력: docs/store/phone-screenshot-N.png 를 꾸민 버전으로 교체.
      원본은 docs/store/phone-screenshot-N-raw.png 로 백업(없을 때만).

실행: /tmp/sshot-venv/bin/python gen-screenshots-styled.py [앱코드네임 ...]
      인자 없으면 7개 전부.
"""

import pathlib
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# 경로는 xita_paths 가 env($XITA_PORTFOLIO_ROOT 등) 기준으로 해석한다.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from xita_paths import ROOT as WORKSPACE, display_path, project_dir  # noqa: E402,F401

# 변경 전 정책: 앱 폴더 = <워크스페이스(parents[2])>/<코드네임> 고정.
# 변경 후 정책: 앱 폴더 = xita_paths.project_dir(코드네임) — 레지스트리 path 우선, 없으면 <root>/<코드네임>.
# 변경 이유: 도구가 XITA 저장소로 이동해 parents[2] 가 더 이상 auto-money 가 아니다. 중첩 프로젝트도 같은 규칙으로 찾는다.
# 영향 범위: 레지스트리에 path 가 지정된 앱만 대상 폴더가 바뀐다. 나머지는 이전과 같은 경로.
FONT_TTC = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
IDX_BOLD = 6      # 헤드라인
IDX_MEDIUM = 2    # 서브

W, H = 1200, 2133          # 9:16 (Play 강제)
SHOT_W = 880               # 플로팅 카드 너비
SHOT_RADIUS = 44
CARD_TOP = 510             # 스크린샷 카드 시작 y

# 앱별: (브랜드 RGB, [shot1 캡션, shot2 캡션])  캡션 = (헤드라인, 서브)
APPS = {
    "theme-ledger": (
        (194, 65, 12),  # #C2410C warm orange
        [
            ("감사한 마음, 숫자로 남기세요", "축의금·부의금, 이벤트별로 기록"),
            ("정산은 리포트로 깔끔하게", "여행 경비도 이벤트별로 정산"),
        ],
    ),
    "noise-meter": (
        (59, 91, 219),  # #3B5BDB
        [
            ("그 소음, 기록이 됩니다", "언제 몇 dB가 얼마나 지속됐는지"),
            ("감정이 아니라 데이터로", "층간소음 증빙, 한눈에"),
        ],
        # 소음 구간 가이드: 각 구간이 실제로 어떤 상황인지 색상 칩으로.
        # (이름, 기준 dB, 칩 색) — 안전(초록)에서 위험(빨강)으로.
        [("속삭임", "~30 dB", (46, 160, 90)),
         ("대화", "~60 dB", (214, 158, 46)),
         ("지하철", "~80 dB", (221, 107, 32)),
         ("콘서트", "~110 dB", (214, 48, 49))],
    ),
    "level-tool": (
        (59, 91, 219),
        [
            ("액자, 정확히 수평으로", "기울기를 숫자로 확인"),
            ("화면을 안 봐도 됩니다", "수평이 되면 진동으로"),
        ],
    ),
    "stud-finder": (
        (59, 91, 219),
        [
            ("못 박기 전, 벽 속을 확인", "금속·배선을 미리 찾아 안전하게"),
            ("가까워지면 진동이 빨라져요", "어디에 있는지 직관적으로"),
        ],
    ),
    "battery-health": (
        (24, 24, 27),  # #18181B
        [
            ("중고폰, 배터리부터 확인", "충전 한 번으로 실제 용량 추정"),
            ("겉은 멀쩡, 속은?", "배터리 상태를 숫자로"),
        ],
    ),
    "device-spec": (
        (24, 24, 27),
        [
            ("이 폰, 정말 그 모델인가요", "칩셋·RAM·센서까지 한눈에"),
            ("30초면 사양 확인 끝", "중고 거래 전, 속지 않게"),
        ],
    ),
    "bus-when": (
        (59, 91, 219),
        [
            ("내 버스, 언제 오는지", "정류장별 실시간 도착시간"),
            ("정류장 검색으로 시작", "이름이나 번호로 바로 찾아 추가"),
        ],
    ),
}


def font(size, idx):
    return ImageFont.truetype(FONT_TTC, size, index=idx)


def vgrad(w, h, top, bottom):
    """세로 그라데이션 배경."""
    base = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        px = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        base.putpixel((0, y), px)
    return base.resize((w, h))


def darken(rgb, factor=0.78):
    return tuple(int(c * factor) for c in rgb)


def round_mask(size, radius):
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size[0], size[1]], radius=radius, fill=255)
    return m


def center_text(draw, y, text, fnt, fill, tracking=0):
    bbox = draw.textbbox((0, 0), text, font=fnt)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) / 2, y), text, font=fnt, fill=fill)


def draw_zones(canvas, zones):
    """소음 구간 가이드 칩. 각 구간이 실제로 어떤 상황인지 색상으로."""
    draw = ImageDraw.Draw(canvas)
    n = len(zones)
    margin, gap = 80, 18
    chip_w = (W - margin * 2 - gap * (n - 1)) // n
    chip_h, y = 100, 415
    x = margin
    for name, db, color in zones:
        draw.rounded_rectangle([x, y, x + chip_w, y + chip_h], radius=20, fill=color)
        nf = font(30, IDX_BOLD)
        nb = draw.textbbox((0, 0), name, font=nf)
        draw.text((x + (chip_w - (nb[2] - nb[0])) / 2, y + 16), name, font=nf, fill=(255, 255, 255))
        df = font(24, IDX_MEDIUM)
        db_b = draw.textbbox((0, 0), db, font=df)
        draw.text((x + (chip_w - (db_b[2] - db_b[0])) / 2, y + 58), db, font=df, fill=(255, 255, 255))
        x += chip_w + gap


def build(app, brand, captions, zones=None):
    store = project_dir(app) / "docs" / "store"
    # 소음 구간 칩이 있으면 카드를 아래로 낸다(칩과 안 겹치게).
    card_top = 620 if zones else CARD_TOP
    for n in (1, 2):
        src = store / f"phone-screenshot-{n}.png"
        raw = store / f"phone-screenshot-{n}-raw.png"
        if not src.exists():
            print(f"  !! 소스 없음: {src}")
            continue
        # 원본 백업(최초 1회)
        if not raw.exists():
            raw.write_bytes(src.read_bytes())
        shot = Image.open(raw).convert("RGB")  # 백업된 원본을 기준으로 합성
        # 하단 테스트 광고 배너를 잘라낸다 — 스토어 스크린샷에 광고 노출은 부적합하다.
        shot = shot.crop((0, 0, shot.width, int(shot.height * 0.92)))

        # 스크린샷을 카드 크기로 리사이즈(비율 유지)
        sh = int(SHOT_W * shot.height / shot.width)
        shot = shot.resize((SHOT_W, sh), Image.LANCZOS)

        # 배경 그라데이션
        canvas = vgrad(W, H, brand, darken(brand)).convert("RGB")

        # 플로팅 카드: 그림자
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        smask = round_mask((SHOT_W, sh), SHOT_RADIUS)
        sx, sy = (W - SHOT_W) // 2, card_top
        sh_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sh_layer.paste(Image.new("RGBA", (SHOT_W, sh), (0, 0, 0, 110)),
                       (sx, sy + 20), smask)
        sh_layer = sh_layer.filter(ImageFilter.GaussianBlur(28))
        canvas = Image.alpha_composite(canvas.convert("RGBA"), sh_layer)

        # 스크린샷 카드(라운드 적용) 합성
        shot_rgba = shot.convert("RGBA")
        shot_rgba.putalpha(smask)
        canvas.paste(shot_rgba, (sx, sy), shot_rgba)

        # 캡션 (상단, 흰색)
        draw = ImageDraw.Draw(canvas)
        headline, sub = captions[n - 1]
        center_text(draw, 190, headline, font(66, IDX_BOLD), (255, 255, 255))
        center_text(draw, 320, sub, font(34, IDX_MEDIUM), (255, 255, 255, 226))
        # 소음 구간 가이드 칩 (noise-meter 등 zones 가 있는 앱만)
        if zones:
            draw_zones(canvas, zones)

        canvas.convert("RGB").save(src, "PNG")
        print(f"  OK {app} shot{n}: {headline}")


def main():
    targets = sys.argv[1:] or list(APPS.keys())
    for app in targets:
        if app not in APPS:
            print(f"알 수 없는 코드네임: {app}")
            continue
        cfg = APPS[app]
        brand, captions = cfg[0], cfg[1]
        zones = cfg[2] if len(cfg) > 2 else None
        print(f"[{app}]")
        build(app, brand, captions, zones)
    print("완료")


if __name__ == "__main__":
    main()
