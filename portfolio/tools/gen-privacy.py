#!/usr/bin/env python3
"""
앱별 개인정보처리방침 HTML 생성기 (한국어 / English 토글).

방침은 **실제 구현과 일치해야 한다.** 마이크를 쓰는 앱과 안 쓰는 앱의 문구가 같으면
심사에서 걸리고, 걸리지 않더라도 나중에 분쟁 소지가 된다.
그래서 앱마다 수집 항목·권한·특이사항을 따로 정의한다.

두 언어를 같은 파일에 담고 자바스크립트로 전환한다. 파일이 하나여야
스토어에 등록하는 URL도 하나로 끝난다.

사용법:
    python3 gen-privacy.py
결과:
    <앱폴더>/docs/privacy-policy.html
"""

import pathlib
import sys

# 경로는 xita_paths 가 env($XITA_PORTFOLIO_ROOT 등) 기준으로 해석한다.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from deploy import project_dir  # noqa: E402

from xita_paths import ROOT as WORKSPACE, display_path  # noqa: E402,F401

DATE_KO = "2026년 8월 3일"
DATE_EN = "August 3, 2026"

# 배포 전 반드시 실제 값으로 교체해야 하는 자리표시자.
CONTACT_PLACEHOLDER = "dwon97@gmail.com"

APPS = {
    "theme-ledger": {
        "name_ko": "테마 장부", "name_en": "Theme Ledger",
        "package": "com.wonjin.themeledger",
        "color": "#C2410C",
        "purpose_ko": "결혼식 축의금, 여행 경비처럼 하나의 이벤트 단위로 입출금을 기록하고 정산하는 앱",
        "purpose_en": "an app for recording and settling money in and out for a single event, such as wedding gift money or a trip budget",
        "stored_ko": [
            ("이름·금액·관계", "축의금·부의금 명단 등 사용자가 직접 입력한 내역입니다."),
            ("참여자 이름", "여행 경비 정산에 사용됩니다."),
        ],
        "stored_en": [
            ("Names, amounts, relationships", "Gift-money records and similar entries you type in yourself."),
            ("Participant names", "Used to split shared trip expenses."),
        ],
        "perms_ko": [("인터넷", "광고를 불러오기 위해 사용합니다.")],
        "perms_en": [("Internet", "Used to load advertisements.")],
        "notes_ko": [
            "명단에 입력한 <strong>타인의 이름</strong>은 이 기기 안에만 저장되며 외부로 전송되지 않습니다.",
            "연락처(주소록)에 접근하지 않습니다. 이름은 사용자가 직접 입력한 것만 사용합니다.",
            "내보내기 기능으로 만든 이미지·CSV 파일은 사용자가 선택한 앱으로만 공유됩니다. "
            "공유 이후의 처리는 해당 앱의 방침을 따릅니다.",
        ],
        "notes_en": [
            "<strong>Other people's names</strong> that you enter are stored only on this device and are never transmitted.",
            "The app does not access your contacts. Only names you type in yourself are used.",
            "Exported image and CSV files are shared only with the app you choose. "
            "Handling after that point follows that app's own policy.",
        ],
    },
    "noise-meter": {
        "name_ko": "소음 측정", "name_en": "Noise Meter",
        "package": "com.wonjin.noisemeter",
        "color": "#3B5BDB",
        "purpose_ko": "주변 소음을 데시벨(dB)로 측정하고 측정 구간을 기록으로 남기는 앱",
        "purpose_en": "an app that measures ambient noise in decibels (dB) and keeps a record of each measurement session",
        "stored_ko": [
            ("측정 기록", "측정 시각, 지속 시간, 최대·평균·최소 dB 값입니다."),
            ("보정값", "사용자가 조정한 마이크 보정 수치입니다."),
        ],
        "stored_en": [
            ("Measurement records", "Timestamps, duration, and maximum, average and minimum dB values."),
            ("Calibration offset", "The microphone calibration value you adjust."),
        ],
        "perms_ko": [
            ("마이크", "소음의 크기를 계산하기 위해 사용합니다."),
            ("알림", "측정 관련 알림을 표시하기 위해 사용합니다."),
            ("인터넷", "광고를 불러오기 위해 사용합니다."),
        ],
        "perms_en": [
            ("Microphone", "Used to calculate the loudness of ambient sound."),
            ("Notifications", "Used to show measurement-related notifications."),
            ("Internet", "Used to load advertisements."),
        ],
        "highlight_ko": (
            "마이크로 들어온 소리는 저장되지 않습니다",
            "이 앱은 마이크 입력에서 <strong>소리의 크기(음압)만 실시간으로 계산</strong>하고 "
            "원본 음성 데이터는 즉시 폐기합니다. "
            "녹음 파일을 만들지 않으며, 대화 내용을 저장하거나 전송하지 않습니다. "
            "기기에 남는 것은 dB 수치와 측정 시각뿐입니다.",
        ),
        "highlight_en": (
            "Audio from the microphone is never stored",
            "This app <strong>only computes loudness (sound pressure) in real time</strong> from the microphone "
            "input and discards the raw audio immediately. "
            "It creates no recordings and never stores or transmits the content of conversations. "
            "All that remains on the device is dB values and timestamps.",
        ),
        "notes_ko": ["측정값은 스마트폰 마이크로 계산한 참고용 수치이며 공인 측정 결과가 아닙니다."],
        "notes_en": ["Readings are reference values computed from a smartphone microphone and are not certified measurements."],
    },
    "level-tool": {
        "name_ko": "수평계", "name_en": "Level Tool",
        "package": "com.wonjin.level",
        "color": "#3B5BDB",
        "purpose_ko": "기기의 기울기를 측정해 수평과 수직을 맞추는 앱",
        "purpose_en": "an app that measures device tilt to help you align surfaces level and vertical",
        "stored_ko": [
            ("보정값", "사용자가 설정한 0점 보정 수치입니다."),
            ("알림 설정", "진동·소리 사용 여부입니다."),
        ],
        "stored_en": [
            ("Calibration offset", "The zero-point calibration you set."),
            ("Alert settings", "Whether vibration and sound are enabled."),
        ],
        "perms_ko": [
            ("진동", "수평에 도달했을 때 알리기 위해 사용합니다."),
            ("인터넷", "광고를 불러오기 위해 사용합니다."),
        ],
        "perms_en": [
            ("Vibration", "Used to alert you when level is reached."),
            ("Internet", "Used to load advertisements."),
        ],
        "notes_ko": [
            "가속도 센서 값은 화면 표시에만 사용하며 저장하거나 전송하지 않습니다.",
            "위치 정보를 수집하지 않습니다.",
        ],
        "notes_en": [
            "Accelerometer readings are used for on-screen display only; they are not stored or transmitted.",
            "The app does not collect location data.",
        ],
    },
    "stud-finder": {
        "name_ko": "벽 탐지기", "name_en": "Stud Finder",
        "package": "com.wonjin.studfinder",
        "color": "#3B5BDB",
        "purpose_ko": "자기 센서로 벽 속 금속의 위치를 추정하는 앱",
        "purpose_en": "an app that estimates the location of metal inside walls using the magnetic sensor",
        "stored_ko": [
            ("감도 설정", "사용자가 조정한 탐지 임계값입니다."),
            ("알림 설정", "진동·소리 사용 여부입니다."),
        ],
        "stored_en": [
            ("Sensitivity setting", "The detection threshold you adjust."),
            ("Alert settings", "Whether vibration and sound are enabled."),
        ],
        "perms_ko": [
            ("진동", "금속에 근접했을 때 알리기 위해 사용합니다."),
            ("인터넷", "광고를 불러오기 위해 사용합니다."),
        ],
        "perms_en": [
            ("Vibration", "Used to alert you when metal is nearby."),
            ("Internet", "Used to load advertisements."),
        ],
        "notes_ko": [
            "자기 센서 값은 화면 표시에만 사용하며 저장하거나 전송하지 않습니다.",
            "위치 정보를 수집하지 않습니다. 자기 센서를 나침반 용도로 쓰지 않습니다.",
            "이 앱은 금속만 감지하며 측정값은 참고용입니다. 시공 전에는 전문 장비로 확인하시기 바랍니다.",
        ],
        "notes_en": [
            "Magnetic sensor readings are used for on-screen display only; they are not stored or transmitted.",
            "The app does not collect location data and does not use the magnetic sensor as a compass.",
            "This app detects metal only, and readings are for reference. Always verify with professional equipment before drilling.",
        ],
    },
    "battery-health": {
        "name_ko": "배터리 상태", "name_en": "Battery Health",
        "package": "com.wonjin.batteryhealth",
        "color": "#18181B",
        "purpose_ko": "충전 구간의 전하량 변화로 배터리 실용량을 추정하는 앱",
        "purpose_en": "an app that estimates real battery capacity from the change in charge during a charging session",
        "stored_ko": [
            ("측정 이력", "추정된 용량 값과 측정 시각입니다."),
            ("설계 용량", "사용자가 직접 입력한 배터리 사양입니다."),
        ],
        "stored_en": [
            ("Measurement history", "Estimated capacity values and their timestamps."),
            ("Design capacity", "The battery specification you enter yourself."),
        ],
        "perms_ko": [
            ("알림", "측정이 완료되었을 때 알리기 위해 사용합니다."),
            ("인터넷", "광고를 불러오기 위해 사용합니다."),
        ],
        "perms_en": [
            ("Notifications", "Used to alert you when a measurement completes."),
            ("Internet", "Used to load advertisements."),
        ],
        "notes_ko": [
            "배터리 잔량·전압·온도는 화면 표시와 용량 추정에만 사용하며 외부로 전송하지 않습니다.",
            "추정 결과는 참고용이며 제조사 공식 진단이 아닙니다.",
        ],
        "notes_en": [
            "Battery level, voltage and temperature are used only for display and capacity estimation; they are never transmitted.",
            "Results are estimates and are not an official manufacturer diagnosis.",
        ],
    },
    "device-spec": {
        "name_ko": "기기 정보", "name_en": "Device Spec",
        "package": "com.wonjin.devicespec",
        "color": "#18181B",
        "purpose_ko": "기기의 하드웨어·시스템 사양을 조회하고 카드 이미지로 공유하는 앱",
        "purpose_en": "an app for viewing your device's hardware and system specifications and sharing them as a card image",
        "stored_ko": [],
        "stored_en": [],
        "perms_ko": [("인터넷", "광고를 불러오기 위해 사용합니다.")],
        "perms_en": [("Internet", "Used to load advertisements.")],
        "notes_ko": [
            "이 앱은 사용자가 입력한 정보를 저장하지 않습니다.",
            "조회한 기기 사양(모델명, 칩셋, 메모리, 센서 목록 등)은 <strong>화면 표시 목적으로만</strong> "
            "읽으며 저장하거나 외부로 전송하지 않습니다.",
            "전화번호, 통신사 가입자 식별번호(IMSI), 기기 일련번호(IMEI)를 수집하지 않습니다.",
            "스펙 카드 이미지는 사용자가 공유를 실행할 때만 생성되며, 공유 대상은 사용자가 직접 선택합니다.",
        ],
        "notes_en": [
            "This app does not store any information you enter.",
            "Device specifications (model, chipset, memory, sensor list and so on) are read "
            "<strong>for on-screen display only</strong> and are never stored or transmitted.",
            "The app does not collect your phone number, IMSI, or IMEI.",
            "A spec card image is generated only when you choose to share, and you select the destination yourself.",
        ],
    },
    "bus-when": {
        "name_ko": "내 버스 언제와", "name_en": "Bus When",
        "package": "com.wonjin.buswhen",
        "color": "#3B6BDB",
        "purpose_ko": "정류장별 실시간 버스 도착 정보와 노선도를 보여 주고, 도착 전에 알림을 보내는 앱",
        "purpose_en": "an app that shows real-time bus arrivals and route maps for each stop and can alert you before your bus arrives",
        "stored_ko": [
            ("즐겨찾기 정류장", "정류장 고유번호, 정류장 이름, 사용자가 붙인 이름, 고정한 버스 번호입니다."),
            ("최근 본 정류장", "최근에 연 정류장 최대 8곳입니다."),
            ("선택한 지역", "정류장을 검색할 지역입니다."),
            ("정류장·노선 정보", "공공 API에서 받은 정류장 목록과 노선 정보를 최대 30일 보관합니다. 설정에서 언제든 지울 수 있습니다."),
        ],
        "stored_en": [
            ("Favourite stops", "Stop ID, stop name, the name you give it, and the buses you pin."),
            ("Recent stops", "Up to 8 stops you opened recently."),
            ("Selected region", "The region you search stops in."),
            ("Stop and route information", "Stop lists and route details received from public APIs, kept for up to 30 days. You can clear them in Settings at any time."),
        ],
        "perms_ko": [
            ("인터넷", "버스 도착·정류장·노선 정보(공공데이터)를 불러오고 광고를 표시하기 위해 사용합니다."),
            ("위치(선택)", "주변 정류장을 찾을 때만 사용합니다. 허용하지 않아도 정류장 검색은 그대로 쓸 수 있습니다."),
            ("알림(선택)", "사용자가 도착 알림을 켰을 때 버스 도착 전에 알려 주기 위해 사용합니다."),
            ("포그라운드 서비스", "도착 알림을 켜 둔 동안 해당 버스의 도착 정보를 주기적으로 확인하기 위해 사용합니다. 알림이 울리거나 사용자가 끄면 바로 종료됩니다."),
        ],
        "perms_en": [
            ("Internet", "Used to fetch bus arrival, stop and route data (Korea public data) and to show advertisements."),
            ("Location (optional)", "Used only to find nearby stops. Stop search still works if you deny it."),
            ("Notifications (optional)", "Used to alert you before your bus arrives when you turn on an arrival alert."),
            ("Foreground service", "While an arrival alert is on, used to check that bus's arrival periodically. It stops as soon as the alert fires or you turn it off."),
        ],
        "highlight_ko": (
            "위치는 주변 정류장을 찾을 때만 씁니다",
            "위치를 허용하면 주변 정류장을 찾기 위해 <strong>대략적인 위치</strong>를 공공 버스 정보 API에 보냅니다. "
            "국토교통부 TAGO에는 약 100m 단위 좌표를 암호화(HTTPS)해 보내고, HTTPS를 지원하지 않는 서울특별시 버스정보에는 "
            "약 2km 범위의 구역 중심점만 보냅니다. 위치를 저장하거나 추적하지 않으며, "
            "개발자 서버로 보내지 않습니다. 도착 정보를 조회할 때는 정류장·노선 식별번호만 보냅니다.",
        ),
        "highlight_en": (
            "Location is used only to find nearby stops",
            "If you allow location, the app sends an <strong>approximate position</strong> to Korea's public bus-information "
            "APIs to find nearby stops: a position rounded to about 100 m, encrypted (HTTPS), to MOLIT TAGO, and only the "
            "centre of a roughly 2 km area to Seoul bus information, which does not support HTTPS. Your location is not "
            "stored or tracked and is never sent to the developer. Arrival lookups send only stop and route IDs.",
        ),
        "notes_ko": [
            "즐겨찾기·최근 본 정류장과 선택한 지역은 이 기기 안에만 저장되며 개발자에게 전송되지 않습니다.",
            "도착 시간과 버스 위치는 저장하지 않고 화면을 볼 때마다 새로 받습니다.",
            "도착 시간은 공공데이터를 바탕으로 한 추정치이며 실제와 다를 수 있습니다.",
        ],
        "notes_en": [
            "Favourite and recent stops and your selected region stay on this device and are never sent to the developer.",
            "Arrival times and bus positions are never stored; they are fetched fresh while you view them.",
            "Arrival times are estimates based on public data and may differ from actual times.",
        ],
    },

    "Scrawl": {
        "name_ko": "끄적", "name_en": "Scrawl",
        "package": "dev.wonjin.scrawl",
        "color": "#5B54D9",
        "purpose_ko": "적기만 하면 기기 안의 AI가 카테고리·폴더·태그를 자동으로 분류해 주는 메모장 앱",
        "purpose_en": "a notes app where an on-device AI automatically sorts your notes into categories, folders and tags as you write",
        "stored_ko": [
            ("메모 본문과 분류 정보", "사용자가 적은 내용과 AI 또는 사용자가 지정한 카테고리·폴더·태그입니다."),
            ("첨부 파일", "메모에 추가한 사진·문서의 사본입니다. 앱 전용 저장소에만 저장됩니다."),
            ("앱 설정", "테마, 글꼴, 언어, 다운로드한 AI 모델 파일입니다."),
        ],
        "stored_en": [
            ("Note content and classification", "The text you write, plus categories, folders and tags assigned by you or the AI."),
            ("Attachments", "Copies of photos and documents you add to a note, stored in app-private storage only."),
            ("App settings", "Theme, font, language, and downloaded AI model files."),
        ],
        "perms_ko": [
            ("인터넷", "AI 모델 파일 다운로드, 광고 불러오기, Google Play 결제에 사용합니다."),
            ("알림", "AI 모델 다운로드 진행 상황을 표시하기 위해 사용합니다."),
        ],
        "perms_en": [
            ("Internet", "Used to download AI model files, load advertisements, and handle Google Play purchases."),
            ("Notifications", "Used to show AI model download progress."),
        ],
        "highlight_ko": (
            "메모 본문은 외부로 전송되지 않습니다",
            "자동 분류에 쓰는 AI는 <strong>내 폰 안에서 직접 실행</strong>됩니다. "
            "메모 본문, 첨부 이미지를 포함해 어떤 내용도 AI 분류를 위해 서버로 전송되지 않습니다. "
            "모델 파일 다운로드 시에도 본문 데이터는 전송되지 않습니다.",
        ),
        "highlight_en": (
            "Your notes never leave the device",
            "Auto-classification runs <strong>entirely on your phone</strong>. "
            "No note content — including attached images — is ever sent to a server for AI processing. "
            "Even model downloads carry none of your data.",
        ),
        "notes_ko": [
            "메모 본문·첨부 파일은 이 기기 안에만 저장되며 외부로 전송되지 않습니다.",
            "AI 자동분류는 온디바이스 모델로만 수행됩니다. 클라우드 AI를 사용하지 않습니다.",
            "구매는 Google Play 결제가 처리하며, 이 앱은 구매 상태만 기기에 저장합니다.",
            "백업·내보내기로 만든 파일은 사용자가 선택한 위치에만 저장됩니다.",
        ],
        "notes_en": [
            "Note content and attachments are stored only on this device and are never transmitted.",
            "AI auto-classification runs solely on an on-device model — no cloud AI is used.",
            "Purchases are handled by Google Play billing; the app stores only the entitlement on this device.",
            "Backups and exports are saved only to the location you choose.",
        ],
    },
    "lingolayer": {
        "name_ko": "LingoLayer", "name_en": "LingoLayer",
        "package": "dev.wonjin.lingolayer",
        "color": "#3B5BDB",
        "ads": False,
        "purpose_ko": "사용자가 고른 앱의 화면 글자를 기기 안에서 인식·번역해, 번역문을 원래 글자 자리에 겹쳐 보여 주는 화면 번역 앱",
        "purpose_en": "a screen translation app that recognizes and translates on-screen text of the apps you choose, entirely on your device, and draws the translation where the original text was",
        "stored_ko": [
            ("번역 캐시", "같은 문장을 다시 번역하지 않도록 남겨 두는 번역문입니다. 원문은 기본적으로 저장하지 않고 구분값만 남기며, 사용자가 켠 경우에만 원문을 함께 저장합니다."),
            ("앱 설정", "번역을 켠 앱 목록, 언어 설정, 대기 시간, Pro 구매 여부입니다."),
            ("언어 모델", "번역·글자 인식에 쓰는 모델 파일입니다. Google 서버에서 내려받기만 합니다."),
            ("성능 지표", "처리 시간·횟수 같은 숫자만 기록합니다. 원문·번역문은 들어 있지 않습니다."),
        ],
        "stored_en": [
            ("Translation cache", "Translations kept so the same sentence is not translated twice. By default only a lookup key is stored, not the original text; the original is saved only if you turn that option on."),
            ("App settings", "The apps you turned translation on for, language settings, delay settings, and whether Pro was purchased."),
            ("Language models", "Model files used for translation and text recognition, downloaded from Google servers."),
            ("Performance metrics", "Numbers only, such as processing times and counts. No original or translated text."),
        ],
        "perms_ko": [
            ("접근성 서비스", "사용자가 켠 앱이 화면에 있을 때만 화면 글자를 읽고, 번역문을 투명한 오버레이로 표시하는 데 사용합니다. 화면을 대신 조작하지 않습니다."),
            ("설치된 앱 목록", "번역할 앱을 고를 수 있도록 실행 가능한 앱 목록을 보여 주는 데만 사용합니다."),
            ("인터넷", "번역·글자 인식 모델 다운로드, Google Play 결제, Google ML Kit 기능 진단(3항)에 사용합니다. 화면 내용은 전송하지 않습니다."),
        ],
        "perms_en": [
            ("Accessibility service", "Used only while an app you turned on is on screen, to read its on-screen text and draw the translation on a transparent overlay. It never operates the screen for you."),
            ("Installed apps", "Used only to list launchable apps so you can choose which ones to translate."),
            ("Internet", "Used to download translation and text-recognition models, for Google Play purchases, and for Google ML Kit diagnostics (section 3). Screen content is never sent."),
        ],
        "sdk_ko": [
            ("Google ML Kit (번역·글자 인식·언어 판별)",
             "기기 정보(제조사·모델·OS 버전), 앱 정보(패키지명·버전), 설치별 식별자(사용자나 기기를 특정하지 않음), "
             "성능 지표·오류 코드, 설정한 원본·대상 언어를 기능 진단과 사용 통계 목적으로 Google에 보냅니다. "
             "전송 중 암호화되며 제3자에게 넘기지 않습니다."),
            ("Google Play 결제", "Pro 구매는 Google Play가 처리합니다. 앱은 결제 수단 정보를 받지 않고 구매 여부만 확인합니다."),
        ],
        "sdk_en": [
            ("Google ML Kit (translation, text recognition, language ID)",
             "Sends device information (manufacturer, model, OS version), app information (package name, version), "
             "per-installation identifiers (not intended to identify a user or device), performance metrics and error codes, "
             "and the configured source and target languages to Google for diagnostics and usage analytics. "
             "Encrypted in transit and not shared with third parties."),
            ("Google Play billing", "Pro purchases are processed by Google Play. The app never receives payment details and only checks whether Pro was purchased."),
        ],
        "highlight_ko": (
            "화면 내용은 기기 밖으로 나가지 않습니다",
            "글자 인식과 번역은 <strong>모두 내 폰 안에서</strong> 이뤄집니다. "
            "화면 캡처는 번역을 표시하는 데만 쓰고 저장하지 않으며, 원문·번역문은 어떤 서버로도 전송되지 않습니다. "
            "키보드가 떠 있거나 화면이 꺼져 있을 때는 캡처하지 않습니다.",
        ),
        "highlight_en": (
            "Your screen never leaves the device",
            "Text recognition and translation happen <strong>entirely on your phone</strong>. "
            "Screen captures are used only to display translations and are never saved, and no original or translated text is sent to any server. "
            "Nothing is captured while the keyboard is open or the screen is off.",
        ),
        "notes_ko": [
            "접근성 서비스는 사용자가 앱 목록에서 직접 켠 앱에만 동작하며, 언제든 기기 설정에서 끌 수 있습니다.",
            "Pro 구매는 Google Play 결제가 처리하며, 이 앱은 구매 여부만 기기에 저장합니다.",
            "번역 캐시는 앱의 개인정보 탭에서 언제든 지울 수 있습니다.",
        ],
        "notes_en": [
            "The accessibility service works only in apps you explicitly turn on, and you can switch it off in system settings at any time.",
            "Pro purchases are handled by Google Play billing; the app stores only whether Pro was purchased.",
            "You can clear the translation cache at any time from the Privacy tab in the app.",
        ],
    },
}


AD_SECTION_KO = '      <h2>3. 광고를 위해 수집되는 정보</h2>\n      <p>이 앱은 무료로 제공되며 <strong>Google AdMob</strong> 광고를 표시합니다.\n      광고 제공 과정에서 Google 및 광고 파트너가 아래 정보를 수집·이용할 수 있습니다.</p>\n      <ul>\n        <li>광고 식별자(Android 광고 ID)</li>\n        <li>기기 정보(모델, 운영체제 버전, 언어, 대략적 지역)</li>\n        <li>IP 주소</li>\n        <li>광고 노출·클릭 등 상호작용 기록</li>\n      </ul>\n      <p>이 정보는 광고 표시, 광고 성과 측정, 부정 클릭 방지 목적으로 사용됩니다. 자세한 내용은\n      <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">Google의 정책</a>을 참고하시기 바랍니다.</p>\n      <div class="note"><p><strong>광고 추적을 원하지 않으시면</strong> 기기의\n      <em>설정 &rsaquo; Google &rsaquo; 모든 서비스 &rsaquo; 광고</em>에서 광고 ID를 재설정하거나 삭제할 수 있습니다.</p></div>\n'
AD_SECTION_EN = '      <h2>3. Information collected for advertising</h2>\n      <p>This app is free and displays <strong>Google AdMob</strong> ads. In the course of serving ads,\n      Google and its advertising partners may collect and use the following:</p>\n      <ul>\n        <li>Advertising identifier (Android Advertising ID)</li>\n        <li>Device information (model, OS version, language, approximate region)</li>\n        <li>IP address</li>\n        <li>Ad interaction data such as impressions and clicks</li>\n      </ul>\n      <p>This information is used to display ads, measure ad performance and prevent invalid clicks. For details, see\n      <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">Google\'s policy</a>.</p>\n      <div class="note"><p><strong>If you prefer not to be tracked for advertising</strong>, you can reset or delete your\n      advertising ID under <em>Settings &rsaquo; Google &rsaquo; All services &rsaquo; Ads</em> on your device.</p></div>\n'
NO_AD_SECTION_KO = """      <h2>3. 광고·분석</h2>
      <p>이 앱은 <strong>광고를 표시하지 않으며</strong>, 광고 식별자를 수집하지 않습니다.
      개발자가 운영하는 분석·오류 보고 도구도 없습니다.</p>
"""
NO_AD_SECTION_EN = """      <h2>3. Advertising and analytics</h2>
      <p>This app <strong>shows no ads</strong> and does not collect advertising identifiers.
      The developer runs no analytics or crash-reporting tools.</p>
"""


def sdk_block(items, lang):
    """광고 없는 앱이 포함한 Google 구성요소(ML Kit 등)가 보내는 정보. 없으면 빈 문자열."""
    if not items:
        return ""
    lead = ("다만 앱에 포함된 Google 구성요소가 아래 정보를 Google로 보냅니다. 화면의 글자나 번역문은 포함되지 않습니다."
            if lang == "ko" else
            "However, the Google components included in the app send the following to Google. "
            "No on-screen text or translations are included.")
    return f"      <p>{lead}</p>\n" + f'      <div class="table-wrap"><table><tbody>\n{rows(items)}\n      </tbody></table></div>\n'


def rows(items):
    return "\n".join(
        f"          <tr><th>{a}</th><td>{b}</td></tr>" for a, b in items
    )


def stored_block(items, lang):
    if not items:
        return (
            "      <p>이 앱은 사용자가 입력한 정보나 이용 기록을 저장하지 않습니다. "
            "설정값을 제외한 어떤 개인정보도 기기에 남기지 않습니다.</p>"
            if lang == "ko"
            else "      <p>This app does not store any information you enter or any usage history. "
            "Apart from settings, no personal data is kept on the device.</p>"
        )
    intro = (
        "아래 정보는 <strong>이 기기 안에만</strong> 저장되며 외부로 전송되지 않습니다. 개발자는 이 정보에 접근할 수 없습니다."
        if lang == "ko"
        else "The following is stored <strong>only on this device</strong> and is never transmitted. The developer cannot access it."
    )
    return (
        f"      <p>{intro}</p>\n"
        f'      <div class="table-wrap"><table><tbody>\n{rows(items)}\n      </tbody></table></div>'
    )


def highlight_block(h):
    if not h:
        return ""
    title, body = h
    return f'      <div class="callout"><span class="t">{title}</span><p>{body}</p></div>\n'


def notes_block(notes, heading):
    if not notes:
        return ""
    items = "\n".join(f"        <li>{n}</li>" for n in notes)
    return f"      <h2>{heading}</h2>\n      <ul>\n{items}\n      </ul>\n"


def build_section(cfg, lang):
    ko = lang == "ko"
    name = cfg["name_ko"] if ko else cfg["name_en"]
    date = DATE_KO if ko else DATE_EN
    purpose = cfg["purpose_ko"] if ko else cfg["purpose_en"]
    stored = stored_block(cfg["stored_ko"] if ko else cfg["stored_en"], lang)
    perms = rows(cfg["perms_ko"] if ko else cfg["perms_en"])
    highlight = highlight_block(cfg.get(f"highlight_{lang}"))
    notes = notes_block(
        cfg.get(f"notes_{lang}", []),
        "이 앱의 특이사항" if ko else "App-specific notes",
    )
    # 광고 없는 앱(LingoLayer 등)은 AdMob 문단 대신 "광고·분석 없음"을 쓴다. 기본값은 광고 있음(기존 앱 출력 불변).
    ads = cfg.get("ads", True)
    if ko:
        ad_summary = (
            "<li>다만 <strong>광고 표시를 위해 Google AdMob</strong>이 광고 식별자 등 일부 정보를 수집합니다.</li>"
            if ads else
            "<li>이 앱에는 <strong>광고가 없습니다</strong>. 앱이 쓰는 Google 구성요소가 보내는 정보는 3항에 적었습니다.</li>"
        )
        ad_section = AD_SECTION_KO if ads else NO_AD_SECTION_KO + sdk_block(cfg.get("sdk_ko"), "ko")
        third_party = (
            " 다만 광고 표시를 위해 위 3항에 기재된 범위에서 Google AdMob이 정보를 처리합니다." if ads else
            " 유료 기능 구매는 Google Play가 처리하며, 개발자는 결제 수단 정보를 받지 않습니다."
        )
        rights_ad = "있으며, 광고 관련 정보는 위 3항의 방법으로 재설정할 수 있습니다." if ads else "있습니다."
    else:
        ad_summary = (
            "<li>However, <strong>Google AdMob</strong> collects certain information in order to serve ads.</li>"
            if ads else
            "<li>This app <strong>shows no ads</strong>. Information sent by the Google components it uses is listed in section 3.</li>"
        )
        ad_section = AD_SECTION_EN if ads else NO_AD_SECTION_EN + sdk_block(cfg.get("sdk_en"), "en")
        third_party = (
            " Google AdMob processes information only within the scope described in section 3." if ads else
            " In-app purchases are processed by Google Play; the developer never receives your payment details."
        )
        rights_ad = (
            " using the methods in section 6, and advertising identifiers can be reset as described in section 3."
            if ads else " using the methods in section 6."
        )

    if ko:
        return f"""    <section data-lang="ko">
      <h1>개인정보처리방침</h1>
      <p class="meta">시행일: {date} &middot; 패키지명 <code>{cfg['package']}</code></p>
      <p class="lead">{name}은(는) {purpose}입니다. 이 방침은 앱이 어떤 정보를 다루고 다루지 않는지를 설명합니다.</p>

      <h2>1. 핵심 요약</h2>
      <ul>
        <li>이 앱은 <strong>회원가입이 없고, 별도의 서버를 운영하지 않습니다.</strong></li>
        <li>사용자가 입력하거나 앱이 기록한 내용은 <strong>이 기기 안에만</strong> 저장됩니다.</li>
        {ad_summary}
      </ul>
{highlight}
      <h2>2. 앱이 기기에 저장하는 정보</h2>
{stored}

{ad_section}{notes}
      <h2>4. 앱이 요청하는 권한</h2>
      <div class="table-wrap"><table><tbody>
{perms}
      </tbody></table></div>
      <p>권한은 해당 기능을 실제로 사용하는 시점에만 요청하며, 거부하셔도 나머지 기능은 그대로 이용할 수 있습니다.</p>

      <h2>5. 제3자 제공</h2>
      <p>개발자는 사용자의 정보를 제3자에게 판매하거나 제공하지 않습니다.{third_party}</p>

      <h2>6. 보관 기간과 삭제 방법</h2>
      <ul>
        <li>앱이 저장한 정보는 별도의 보관 기간 없이 기기에 남아 있습니다.</li>
        <li><strong>앱을 삭제하면 앱이 저장한 모든 데이터가 함께 삭제됩니다.</strong></li>
        <li>앱을 지우지 않고 데이터만 없애려면 <em>설정 &rsaquo; 애플리케이션 &rsaquo; {name} &rsaquo; 저장공간 &rsaquo; 데이터 삭제</em>를 이용하시면 됩니다.</li>
        <li>개발자는 사용자의 데이터를 보유하고 있지 않으므로 별도로 삭제해 드릴 수 있는 정보가 없습니다.</li>
      </ul>

      <h2>7. 아동의 개인정보</h2>
      <p>이 앱은 만 14세 미만 아동을 대상으로 하지 않으며, 아동의 개인정보를 알면서 수집하지 않습니다.</p>

      <h2>8. 이용자의 권리</h2>
      <p>이 앱은 개발자가 접근할 수 있는 개인정보를 보유하지 않습니다. 기기에 저장된 정보는 위 6항의 방법으로 직접 열람·삭제할 수 {rights_ad}</p>

      <h2>9. 방침 변경</h2>
      <p>이 방침이 변경되는 경우 이 페이지에 수정된 내용과 시행일을 게시합니다. 중요한 변경이 있을 때는 앱 업데이트를 통해 안내합니다.</p>

      <h2>10. 문의</h2>
      <p>개인정보 처리에 관한 문의는 아래로 연락해 주시기 바랍니다.</p>
      <p><strong>{CONTACT_PLACEHOLDER}</strong></p>
      <footer>최종 수정일: {date}</footer>
    </section>"""

    return f"""    <section data-lang="en" hidden>
      <h1>Privacy Policy</h1>
      <p class="meta">Effective: {date} &middot; Package <code>{cfg['package']}</code></p>
      <p class="lead">{name} is {purpose}. This policy explains what the app does and does not do with your information.</p>

      <h2>1. Summary</h2>
      <ul>
        <li>This app has <strong>no sign-up and no server operated by the developer.</strong></li>
        <li>Anything you enter, or the app records, is stored <strong>only on this device</strong>.</li>
        {ad_summary}
      </ul>
{highlight}
      <h2>2. Information stored on your device</h2>
{stored}

{ad_section}{notes}
      <h2>4. Permissions requested</h2>
      <div class="table-wrap"><table><tbody>
{perms}
      </tbody></table></div>
      <p>Permissions are requested only when the related feature is actually used. If you decline, the rest of the app still works.</p>

      <h2>5. Sharing with third parties</h2>
      <p>The developer does not sell or share your information with third parties.{third_party}</p>

      <h2>6. Retention and deletion</h2>
      <ul>
        <li>Information stored by the app remains on your device with no fixed retention period.</li>
        <li><strong>Uninstalling the app deletes all data it stored.</strong></li>
        <li>To clear data without uninstalling, use <em>Settings &rsaquo; Apps &rsaquo; {name} &rsaquo; Storage &rsaquo; Clear data</em>.</li>
        <li>The developer holds none of your data, so there is nothing for us to delete on your behalf.</li>
      </ul>

      <h2>7. Children's privacy</h2>
      <p>This app is not directed to children under 14 and does not knowingly collect personal information from children.</p>

      <h2>8. Your rights</h2>
      <p>The developer holds no personal information that we could access. Data on your device can be viewed and deleted by you{rights_ad}</p>

      <h2>9. Changes to this policy</h2>
      <p>If this policy changes, the revised text and its effective date will be posted on this page. Significant changes will also be announced through an app update.</p>

      <h2>10. Contact</h2>
      <p>For questions about privacy, please contact:</p>
      <p><strong>{CONTACT_PLACEHOLDER}</strong></p>
      <footer>Last updated: {date}</footer>
    </section>"""


PAGE = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{name_ko} · {name_en} — Privacy Policy</title>
<style>
  :root {{
    --brand: {color};
    --canvas: #ffffff; --surface: #f7f7f8;
    --text: #18181b; --text-2: #52525b; --text-3: #71717a;
    --border: #e4e4e7; --warn-bg: #fffbeb; --warn-fg: #92400e;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --canvas: #0f1013; --surface: #17181c;
      --text: #f4f4f5; --text-2: #a1a1aa; --text-3: #8b8b93;
      --border: #2a2b31; --warn-bg: #2a1d05; --warn-fg: #fbbf24;
    }}
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 32px 20px 80px;
    background: var(--canvas); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
                 "Malgun Gothic", "Noto Sans KR", sans-serif;
    line-height: 1.7; -webkit-text-size-adjust: 100%;
  }}
  main {{ max-width: 720px; margin: 0 auto; }}
  .topbar {{
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; flex-wrap: wrap; margin-bottom: 28px;
  }}
  .eyebrow {{
    display: inline-block; padding: 5px 12px; border-radius: 999px;
    background: var(--brand); color: #fff; font-size: 13px; font-weight: 600;
  }}
  .langs {{
    display: inline-flex; padding: 3px; gap: 2px;
    background: var(--surface); border-radius: 999px; border: 1px solid var(--border);
  }}
  .langs button {{
    appearance: none; border: 0; cursor: pointer;
    padding: 7px 16px; border-radius: 999px;
    background: transparent; color: var(--text-2);
    font: inherit; font-size: 13px; font-weight: 600;
  }}
  .langs button[aria-pressed="true"] {{ background: var(--brand); color: #fff; }}
  h1 {{ font-size: 28px; line-height: 1.3; margin: 0 0 8px; letter-spacing: -.02em; }}
  .meta {{ color: var(--text-3); font-size: 14px; margin: 0 0 8px; }}
  .lead {{ color: var(--text-2); font-size: 15px; margin: 0 0 36px; }}
  h2 {{ font-size: 19px; margin: 40px 0 12px; padding-top: 24px;
        border-top: 1px solid var(--border); letter-spacing: -.01em; }}
  p, li {{ color: var(--text-2); font-size: 15px; }}
  strong {{ color: var(--text); font-weight: 600; }}
  ul {{ padding-left: 20px; }} li {{ margin: 6px 0; }}
  table {{ width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 15px; }}
  th, td {{ text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--border); }}
  th {{ color: var(--text-3); font-size: 13px; font-weight: 600; width: 36%; }}
  td {{ color: var(--text-2); }}
  .table-wrap {{ overflow-x: auto; }}
  .callout {{ background: var(--warn-bg); color: var(--warn-fg);
              border-radius: 12px; padding: 18px 20px; margin: 24px 0; }}
  .callout .t {{ display: block; font-weight: 700; margin-bottom: 6px; font-size: 15px; }}
  .callout p {{ color: inherit; margin: 0; font-size: 14px; }}
  .callout strong {{ color: inherit; }}
  .note {{ background: var(--surface); border-radius: 12px; padding: 18px 20px; margin: 20px 0; }}
  .note p {{ margin: 0; font-size: 14px; }}
  a {{ color: var(--brand); }}
  @media (prefers-color-scheme: dark) {{ a {{ color: #93b4ff; }} }}
  footer {{ margin-top: 56px; padding-top: 20px;
            border-top: 1px solid var(--border); color: var(--text-3); font-size: 13px; }}
  code {{ background: var(--surface); padding: 2px 6px; border-radius: 4px;
          font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }}
  section[hidden] {{ display: none; }}
</style>
</head>
<body>
<main>
  <div class="topbar">
    <span class="eyebrow" data-name-ko="{name_ko}" data-name-en="{name_en}">{name_ko}</span>
    <div class="langs" role="group" aria-label="Language">
      <button type="button" data-set="ko" aria-pressed="true">한국어</button>
      <button type="button" data-set="en" aria-pressed="false">English</button>
    </div>
  </div>

{ko}

{en}
</main>
<script>
  (function () {{
    var sections = document.querySelectorAll('section[data-lang]');
    var buttons = document.querySelectorAll('.langs button');
    var badge = document.querySelector('.eyebrow');

    function apply(lang) {{
      sections.forEach(function (s) {{ s.hidden = s.dataset.lang !== lang; }});
      buttons.forEach(function (b) {{
        b.setAttribute('aria-pressed', String(b.dataset.set === lang));
      }});
      badge.textContent = badge.dataset['name' + (lang === 'ko' ? 'Ko' : 'En')];
      document.documentElement.lang = lang;
      try {{ localStorage.setItem('privacy-lang', lang); }} catch (e) {{}}
    }}

    buttons.forEach(function (b) {{
      b.addEventListener('click', function () {{ apply(b.dataset.set); }});
    }});

    // 저장된 선택이 있으면 그걸 쓰고, 없으면 브라우저 언어를 따른다.
    var saved = null;
    try {{ saved = localStorage.getItem('privacy-lang'); }} catch (e) {{}}
    var initial = saved || ((navigator.language || 'ko').toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en');
    apply(initial);
  }})();
</script>
</body>
</html>
"""


def main():
    # 인자로 코드네임을 주면 그 앱만 다시 쓴다 (없으면 전체)
    only = set(sys.argv[1:])
    for codename, cfg in APPS.items():
        if only and codename not in only:
            continue
        target = project_dir(codename) / "docs"
        if not target.parent.exists():
            print(f"건너뜀: {codename}")
            continue
        target.mkdir(parents=True, exist_ok=True)
        html = PAGE.format(
            name_ko=cfg["name_ko"],
            name_en=cfg["name_en"],
            color=cfg["color"],
            ko=build_section(cfg, "ko"),
            en=build_section(cfg, "en"),
        )
        out = target / "privacy-policy.html"
        out.write_text(html, encoding="utf-8")
        print(f"{codename}: {display_path(out)}  ({len(html) // 1024}KB)")


if __name__ == "__main__":
    main()
