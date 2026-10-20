#!/usr/bin/env python3
"""
Play Store 마케팅 스크린샷 합성 (언어별 · 앱당 최대 4장).

에뮬레이터에서 찍은 원본(docs/store/raw/<lang>/shot-N.png)을
브랜드 그라데이션 배경 + 상단 캡션 + 라운드/그림자 플로팅 카드로 꾸민다.
gen-screenshots-styled.py(한국어 2장 시절)의 후속이다.

- 캡션은 화면 설명이 아니라 "그 화면에서 얻는 것"을 쓴다.
- 원본은 상태바를 잘라내고, 에뮬레이터 고유값(모델명 등)이 보이는 영역은 crop 으로 프레임 밖에 둔다.
- raw/<lang>/crop.json 이 있으면 {"shot-N": [top, bottom]} 로 세로 잘라낼 범위를 덮어쓴다.

출력: docs/store/<lang>/phone-screenshot-N.png  (upload-store-listing.py 가 언어별로 집어간다)

실행: /opt/homebrew/bin/python3 gen-store-screens.py [앱코드네임 ...]   (Pillow 필요)
"""

import json
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
IDX_BOLD = 6
IDX_MEDIUM = 2

W, H = 1200, 2133          # 9:16
SHOT_W = 880
SHOT_W_SHORT = 1000       # 짧은 카드 너비
SHOT_RADIUS = 44
CARD_TOP = 500
STATUS_BAR = 90            # 1080x2400 원본 기준 상태바 높이

# 앱별: 브랜드 RGB, 샷 목록 [(원본 이름, {lang: (헤드라인, 서브)})]
# 원본 이름: raw/<lang>/<name>.png. "card" 는 앱이 만든 공유 이미지(상태바 없음).
APPS = {
    "theme-ledger": ((194, 65, 12), [
        ("shot-1", {"ko": ("그때 얼마 했더라? 바로 찾아요", "경조사·여행·회비를 이벤트별 장부로"),
                    "en": ("Who gave what? Find it fast", "One ledger per event: weddings, trips, dues")}),
        ("shot-2", {"ko": ("이름과 금액만, 3초 기록", "받은 날짜와 관계까지 자동으로"),
                    "en": ("Log a gift in three seconds", "Just a name and an amount")}),
        ("shot-3", {"ko": ("받은 마음, 관계별로 한눈에", "가족·친구·직장 합계 리포트"),
                    "en": ("Every gift, grouped for you", "Family, friends and work totals at a glance")}),
        ("shot-4", {"ko": ("여행 경비, 누가 누구에게?", "보낼 금액까지 자동 정산"),
                    "en": ("Trip costs, split for you", "See exactly who pays whom")}),
    ]),
    "noise-meter": ((59, 91, 219), [
        ("shot-1", {"ko": ("그 소음, 기록이 됩니다", "언제 몇 dB가 얼마나 지속됐는지 그래프로"),
                    "en": ("Turn noise into a record", "When it happened, how loud, how long")}),
        ("shot-2", {"ko": ("날마다 쌓이는 증빙", "최대·평균 dB와 지속 시간까지"),
                    "en": ("Evidence that adds up", "Peak and average dB for every session")}),
        ("shot-3", {"ko": ("버튼 한 번이면 측정 시작", "속삭임부터 콘서트까지 눈금으로"),
                    "en": ("One tap to start measuring", "From a whisper to a rock concert")}),
        ("shot-4", {"ko": ("내 폰에 맞춰 보정", "기준치를 넘으면 바로 경고"),
                    "en": ("Calibrate to your phone", "Get alerted when it gets too loud")}),
    ]),
    "level-tool": ((59, 91, 219), [
        ("shot-1", {"ko": ("액자, 정확히 수평으로", "기울기를 0.1° 단위로 확인"),
                    "en": ("Hang frames perfectly straight", "Tilt shown to a tenth of a degree")}),
        ("shot-2", {"ko": ("수평이 되면 진동으로 알려줘요", "벽에 대고 화면을 못 봐도 괜찮아요"),
                    "en": ("It buzzes the moment it's level", "No need to see the screen on a wall")}),
        ("shot-3", {"ko": ("선반·테이블은 표면 모드로", "앞뒤·좌우 기울기를 한 번에"),
                    "en": ("Level shelves and tables", "Front-back and side tilt at once")}),
        ("shot-4", {"ko": ("경사는 각도로 바로", "계단·경사로 각도 측정"),
                    "en": ("Measure any angle", "Ramps, stairs and slopes")}),
    ]),
    "stud-finder": ((59, 91, 219), [
        ("shot-1", {"ko": ("못 박기 전, 벽 속 금속부터", "철제 스터드·못·금속 배관을 미리 확인"),
                    "en": ("Check the wall before you drill", "Find metal studs, nails and pipes")}),
        ("shot-2", {"ko": ("벽을 천천히 훑기만 하세요", "자기 센서가 금속을 감지해요"),
                    "en": ("Just sweep slowly along the wall", "The magnetic sensor does the rest")}),
        ("shot-3", {"ko": ("가까워질수록 진동이 빨라져요", "화면을 안 봐도 위치를 찾아요"),
                    "en": ("Faster buzz as you get closer", "Find the spot without looking")}),
        ("shot-4", {"ko": ("벽에 맞춰 감도 조절", "어디서든 기준점을 다시 잡아요"),
                    "en": ("Tune sensitivity to your wall", "Reset the baseline anywhere")}),
    ]),
    "battery-health": ((24, 24, 27), [
        ("shot-1", {"ko": ("중고폰, 배터리부터 확인", "설계 용량 대비 실제 용량을 %로"),
                    "en": ("Check the battery before you buy", "Real capacity vs. design, in percent")}),
        ("card", {"ko": ("팔 때는 상태 카드로", "구매자에게 배터리 상태를 이미지로 공유"),
                  "en": ("Selling? Share a status card", "Show buyers the battery health as an image")}),
        ("shot-3", {"ko": ("충전할수록 더 정확하게", "측정이 쌓일수록 추정치가 안정돼요"),
                    "en": ("More accurate with every charge", "Each measurement refines the estimate")}),
    ]),
    # Seeker 실기기 촬영(다크 테마) — 검은 카드가 묻히지 않게 배경은 브랜드(#18181B)보다 밝은 zinc 로.
    "device-spec": ((63, 63, 70), [
        ("shot-1", {"ko": ("이 폰, 정말 그 모델일까?", "제조사·모델·칩셋을 바로 확인"),
                    "en": ("Is it really that model?", "Maker, model and chipset at a glance")}),
        ("shot-2", {"ko": ("RAM·저장공간·디스플레이까지", "중고폰 살 때 꼭 보는 사양 한눈에"),
                    "en": ("Memory, storage and display", "The specs to check before buying used")}),
        ("shot-3", {"ko": ("카메라·배터리 사양도 한 번에", "배터리 설계 용량까지 확인"),
                    "en": ("Cameras and battery, too", "Including the battery's design capacity")}),
        ("shot-4", {"ko": ("센서 목록까지 빠짐없이", "기기에 달린 센서를 이름까지 그대로"),
                    "en": ("Every sensor, listed", "Each sensor on board, by its real name")}),
    ]),
}

# 공유 카드(앱이 만든 이미지)는 상단 제목·모델명 줄을 프레임 밖에 둔다(에뮬레이터 모델명 노출 방지).
CARD_CROP_TOP = 205


def font(size, idx):
    return ImageFont.truetype(FONT_TTC, size, index=idx)


def vgrad(w, h, top, bottom):
    base = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        base.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return base.resize((w, h))


def darken(rgb, factor=0.78):
    return tuple(int(c * factor) for c in rgb)


def round_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0], size[1]], radius=radius, fill=255)
    return m


def fit_text(draw, text, size, idx, max_w):
    """한 줄에 들어가도록 글자 크기를 줄인다."""
    while size > 28:
        f = font(size, idx)
        b = draw.textbbox((0, 0), text, font=f)
        if b[2] - b[0] <= max_w:
            return f
        size -= 2
    return font(size, idx)


def center_text(draw, y, text, fnt, fill):
    b = draw.textbbox((0, 0), text, font=fnt)
    draw.text(((W - (b[2] - b[0])) / 2, y), text, font=fnt, fill=fill)


def load_shot(raw_dir: pathlib.Path, name: str, crops: dict) -> Image.Image:
    img = Image.open(raw_dir / f"{name}.png").convert("RGB")
    if name == "card":
        card = img.crop((0, CARD_CROP_TOP, img.width, img.height))
        padded = Image.new("RGB", (card.width, card.height + 40), (255, 255, 255))
        padded.paste(card, (0, 0))   # 하단 날짜가 카드 모서리에 붙지 않게 여백
        return padded
    top, bottom = crops.get(name, [STATUS_BAR, img.height])
    return img.crop((0, top, img.width, bottom))


def compose(brand, shot: Image.Image, headline: str, sub: str) -> Image.Image:
    # 짧은 카드(잘라낸 일부·공유 이미지)는 더 크게 보여주고 남는 영역 가운데에 둔다.
    # 긴 카드(전체 화면)는 하단으로 흘려보낸다.
    avail = H - CARD_TOP - 90
    card_w = SHOT_W if SHOT_W * shot.height / shot.width >= avail * 0.7 else SHOT_W_SHORT
    sh = int(card_w * shot.height / shot.width)
    shot = shot.resize((card_w, sh), Image.LANCZOS)
    top = CARD_TOP + (avail - sh) // 2 if sh < avail else CARD_TOP
    sx = (W - card_w) // 2

    canvas = vgrad(W, H, brand, darken(brand)).convert("RGBA")
    smask = round_mask((card_w, sh), SHOT_RADIUS)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow.paste(Image.new("RGBA", (card_w, sh), (0, 0, 0, 110)), (sx, top + 20), smask)
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(28)))
    card = shot.convert("RGBA")
    card.putalpha(smask)
    canvas.paste(card, (sx, top), card)

    draw = ImageDraw.Draw(canvas)
    center_text(draw, 180, headline, fit_text(draw, headline, 66, IDX_BOLD, W - 120), (255, 255, 255))
    center_text(draw, 296, sub, fit_text(draw, sub, 40, IDX_MEDIUM, W - 160), (255, 255, 255, 226))
    return canvas.convert("RGB")


def build(app: str):
    brand, shots = APPS[app]
    store = project_dir(app) / "docs" / "store"
    for lang in ("ko", "en"):
        raw_dir = store / "raw" / lang
        if not raw_dir.exists():
            print(f"  !! 원본 없음: {raw_dir}")
            continue
        crop_file = raw_dir / "crop.json"
        crops = json.loads(crop_file.read_text()) if crop_file.exists() else {}
        out_dir = store / lang
        out_dir.mkdir(parents=True, exist_ok=True)
        for old in out_dir.glob("phone-screenshot-*.png"):
            old.unlink()
        for n, (name, captions) in enumerate(shots, start=1):
            headline, sub = captions[lang]
            img = compose(brand, load_shot(raw_dir, name, crops), headline, sub)
            img.save(out_dir / f"phone-screenshot-{n}.png", "PNG")
            print(f"  OK {app} {lang} {n}: {headline}")


def main():
    for app in sys.argv[1:] or list(APPS):
        if app not in APPS:
            print(f"알 수 없는 코드네임: {app}")
            continue
        print(f"[{app}]")
        build(app)


if __name__ == "__main__":
    main()
