"""
Play Store 등록 문구 — 영어(en-US).

한국어판(`gen-store-listing.py`의 APPS)과 짝을 이룬다.
번역이 아니라 **영어권 사용자에게 통하는 문장으로 다시 쓴 것**이다.
"축의금", "층간소음" 같은 한국 고유 맥락은 직역하면 의미가 사라진다.

글자 수 제한: 앱 이름 30 / 간단한 설명 80 / 자세한 설명 4000
제목은 영어권 검색어(bubble level, decibel, metal detector 등)를 앞에 둔다(2026-10-08 첫 등록 전 정리).
"""

APPS_EN = {
    "theme-ledger": {
        "title": "Gift Tracker & Trip Splitter",
        "short": "Track gift money and trip costs per event, then keep the settlement report.",
        "keywords": ["gift money log", "event ledger", "split expenses", "dues tracker", "shared costs"],
        "hook": [
            "Still keeping wedding gift money in a paper guestbook or a spreadsheet?",
            "The moment you really need it isn't when you receive. It's years later when you reciprocate. Keep it where you can find it.",
        ],
        "features": [
            ("Three seconds at the reception desk",
             "Type a name, tap a preset amount, done. The screen doesn't move on, so the next guest is ready."),
            ("One ledger per event",
             "A wedding is one ledger, a trip is another. Close it when it ends and a settlement report remains."),
            ("Split trip expenses",
             "Record who paid what and the app works out who sends money to whom."),
            ("Grouped by relationship",
             "Friends, work and family totals are grouped automatically."),
            ("Keep it as an image or CSV",
             "Save the list as a file so it survives uninstalling."),
        ],
        "safety": [
            "The app doesn't access your contacts. Only names you type in are used.",
            "The list stays on this device and is never sent to a server.",
        ],
    },
    "noise-meter": {
        "title": "Noise Meter: Decibel dB Log",
        "short": "Records when, how loud and for how long. Built for documenting neighbour noise.",
        "keywords": ["noise meter", "decibel meter", "sound level meter", "dB measure", "noise log"],
        "hook": [
            "A noise complaint needs more than saying it is loud right now. It needs a record of when, how many dB, and for how long.",
            "Start and stop a measurement and the whole stretch is saved.",
        ],
        "features": [
            ("Each session becomes a record",
             "Start and end time, duration, and maximum, average and minimum dB are saved as one entry."),
            ("See how it changed",
             "A line shows how the noise moved during that stretch."),
            ("Export a report image",
             "An image with the date, time, peak dB and duration, ready to attach for a building manager or mediation office."),
            ("Calibrate per device",
             "Microphone sensitivity differs by phone. Adjust it yourself."),
        ],
        "safety": [
            "Audio is never recorded. Only loudness is computed in real time and the raw sound is discarded immediately.",
            "Conversations are never stored or transmitted.",
        ],
        "disclaimer": "Readings come from a smartphone microphone and are for reference only. "
                      "They are not certified measurements.",
    },
    "level-tool": {
        "title": "Bubble Level & Angle Meter",
        "short": "Hang frames straight. It vibrates when level, even if you can't see the screen.",
        "keywords": ["bubble level", "spirit level", "angle meter", "inclinometer", "level tool"],
        "hook": [
            "When you hold the phone against a wall to hang a frame, you can't see the screen.",
            "So this app vibrates the moment it's level. The display is the backup.",
        ],
        "features": [
            ("Vibrates when level",
             "You feel it even with the phone flat against a wall or furniture."),
            ("Three modes",
             "Surface level lying flat, wall level standing up, and free angle measurement."),
            ("Zero calibration",
             "On an uneven floor, set the current position as the reference and measure relative to it."),
            ("Numbers that don't jitter",
             "Sensor noise is filtered so the reading holds still."),
        ],
        "safety": [
            "The app does not collect location data.",
            "Sensor readings are shown on screen only; they are never stored or transmitted.",
        ],
    },
    "stud-finder": {
        "title": "Stud Finder: Metal Detector",
        "short": "Check for metal before you drill. The vibration speeds up as you get closer.",
        "keywords": ["stud finder", "metal detector", "wall scanner", "pipe detector", "find studs"],
        "hook": [
            "Hitting a wire or a water pipe turns a small job into an expensive repair.",
            "Sweep the wall for thirty seconds first. The vibration quickens as metal gets closer.",
        ],
        "features": [
            ("Vibration that speeds up",
             "You can't see the screen against a wall, so the pulse interval tells you where it is."),
            ("Reset the baseline",
             "Measurement is relative to where you started, so regional differences in magnetic field don't matter."),
            ("Adjustable sensitivity",
             "Response varies with wall thickness and finish. Tune it yourself."),
            ("Sensor location guide",
             "The magnetic sensor sits in a different spot on every phone. We show you where to place it."),
        ],
        "safety": [
            "The app does not collect location data.",
            "Sensor readings are shown on screen only; they are never stored or transmitted.",
        ],
        "disclaimer": "This app uses the magnetic sensor and finds metal only. It cannot detect wooden studs "
                      "or plastic pipes. Readings are for reference; always verify with professional equipment "
                      "before drilling.",
    },
    "battery-health": {
        "title": "Battery Health: Capacity Check",
        "short": "Estimates real battery capacity from one charge. Check before a used sale.",
        "keywords": ["battery health", "battery capacity", "battery life", "phone resale", "battery test"],
        "hook": [
            "Battery condition moves used-phone prices more than anything else, yet there's no easy way to check it.",
            "Plug in a charger and a twenty percent rise is enough to estimate real capacity.",
        ],
        "features": [
            ("Measures while you charge",
             "You don't need to keep the app open. It works from charge-counter changes."),
            ("Health against design capacity",
             "Shows what percentage remains compared with the manufacturer spec."),
            ("Status card for resale",
             "Creates an image with the model and health, ready to attach to a listing."),
            ("Current status at a glance",
             "Level, voltage, temperature and charge counter together."),
        ],
        "safety": [
            "Battery data is used only for display and estimation and is never transmitted.",
        ],
        "disclaimer": "Results are estimated from charge-counter changes during charging and are not an official "
                      "manufacturer diagnosis. Some devices don't report charge data and can't be measured.",
    },
    "device-spec": {
        "title": "Device Info: Phone Specs",
        "short": "Chipset, RAM and sensors at a glance. Check specs before buying used.",
        "keywords": ["device info", "phone specs", "cpu info", "hardware info", "system info"],
        "hook": [
            "Buying a used phone? Confirm on the spot that it really is that model with those specs.",
            "Everything from chipset to sensor list in thirty seconds.",
        ],
        "features": [
            ("All nine sections",
             "Device, processor, memory, display, camera, battery, system, network and sensors."),
            ("Spec card image",
             "Creates a tidy image of the key specs for a forum post or a sale listing."),
            ("Sensor list",
             "See which sensors are actually present, down to the vendor."),
        ],
        "safety": [
            "The app does not collect your phone number, IMEI or subscriber ID.",
            "Specs are read for on-screen display only and are never stored or transmitted.",
        ],
    },
    "bus-when": {
        "title": "Korea Bus Arrivals & Widget",
        "short": "Live bus arrivals, route maps and arrival alerts. Favourite stops on a widget.",
        "keywords": ["bus arrival", "bus route map", "bus tracker", "bus alert", "bus widget"],
        "hook": [
            "You end up scanning the departure board every few seconds to see how many minutes are left for your bus.",
            "Open a stop and this app counts down every arriving bus to the second, colour-coded by route type.",
            "Pin the stops and buses you take, and see them the moment you open the app or right on the home-screen widget.",
        ],
        "features": [
            ("Real-time arrivals", "A second-by-second countdown for every bus, with stops away and the next bus. Trunk, branch, express and circular routes are colour-coded."),
            ("Route maps and live bus positions", "Find a route by bus number, or open it straight from a stop, and see where each running bus is right now."),
            ("Arrival alerts", "Pick your bus and get notified 1, 3, 5 or 10 minutes before it arrives, even with the app closed."),
            ("Favourites and home-screen widget", "Name a stop like 'Work' and pin only the buses you take. The widget shows them without opening the app."),
            ("Crowding, seats and last bus", "Where the region provides it, see how crowded the bus is, seats left (Gyeonggi seat buses), low-floor buses and the last bus of the day."),
            ("Nearby stops and stop search", "Allow location to see stops around you instantly, or search by stop name or number. Seoul, Gyeonggi and cities nationwide are supported."),
        ],
        "safety": [
            "No sign-up, and nothing is sent to the developer's servers.",
            "Location is used only to find nearby stops: an approximate position (rounded to 100 m–2 km) is sent to Korea's public bus-information APIs to look up stops. Stop search works without location access.",
            "Notification permission is requested only when you turn on an arrival alert.",
            "Favourite and recent stops, and saved stop and route information, stay on this device.",
            "Arrival data comes from Korea's public transit data (MOLIT TAGO, Seoul, Gyeonggi) and may differ from actual times.",
        ],
    },

    "Scrawl": {
        "title": "Scrawl: AI Notes, Auto Sorted",
        "short": "AI notes: write and it files itself. On-device AI, nothing leaves your phone.",
        "keywords": ["AI notes", "auto organize", "quick memo", "offline notes", "note taking"],
        "hook": [
            "You write plenty of notes — and never get around to sorting them, right?",
            "Scrawl only asks you to write. The moment you leave the screen, an AI on your phone reads the note and adds categories, folders and tags for you.",
        ],
        "features": [
            ("Typing the instant it opens",
             "No list screen, no dashboard — the input field is right there. There isn't even a save button; leaving the screen saves it."),
            ("AI does the filing",
             "When you exit, an on-device AI reads your note and attaches categories, folders and tags. Sorting is now the app's job, not yours."),
            ("Your notes never leave the phone",
             "Classification runs entirely on your device. Your notes stay fully on your phone — nothing, not even attached images, is ever sent to any server."),
            ("Find anything fast",
             "Category, folder and tag filters plus full-text search dig up old notes in seconds. Swipe right to archive, left to delete."),
            ("Photos too",
             "Attach a receipt, a sticky note, a screenshot — the image AI reads and classifies it. Available on capable devices."),
        ],
        "safety": [
            "Note content and attachments are stored only on this device and are never transmitted — including for AI classification.",
            "AI model files are downloaded from Google; none of your data is uploaded.",
            "Google AdMob may collect advertising identifiers to show ads (removed with Pro).",
        ],
    },
    "lingolayer": {
        "title": "LingoLayer: Screen Translator",
        "short": "Translate any app right where the text is. On-device, nothing leaves your phone.",
        "keywords": ["screen translator", "translate apps", "game translator", "live translation", "offline translator"],
        "hook": [
            "Foreign-language apps, games and forums: tired of copying text into a translator and losing your place?",
            "LingoLayer translates what is on your screen, right where it is. Stop scrolling and the text switches to your language. Everything is processed on your phone.",
        ],
        "features": [
            ("Translations sit on top of the original",
             "Each translation appears exactly where the original text was, at a similar size and over a matching background, so the layout stays intact. The overlay never blocks touches, so you tap and scroll as usual."),
            ("Only in apps you choose",
             "Pick the apps you want translated. LingoLayer works only while one of them is on screen, and pauses as soon as you switch apps or open the keyboard."),
            ("Fully on-device",
             "Text recognition and translation both run on your phone. Download a language model once (about 30 MB per language) and translate offline."),
            ("19 target languages",
             "Translate English, Spanish, French, German and other Latin-script languages into 19 languages. Pro also reads Japanese, Chinese, Korean and Hindi screens."),
            ("No ads. Pro is a one-time purchase",
             "There are no ads at all. Use up to 3 apps for free. Pro is a single purchase, not a subscription, and unlocks unlimited apps and a different language for each app."),
        ],
        "safety": [
            "On-screen text and translations are never sent to a server. Translation happens entirely on your device.",
            "The accessibility service is used only to read text in the apps you turn on and to draw translations over them. It does not operate the screen or collect data for any other purpose.",
            "The translation cache stays on this device and can be cleared in the app at any time.",
            "Payments are handled by Google Play. The app never receives your card or account details.",
        ],
        "disclaimer": "LingoLayer needs the accessibility service permission to work. Apps that block screen capture, such as banking apps, cannot be translated, and translation quality depends on how clearly the original text can be recognized.",
    },
}
