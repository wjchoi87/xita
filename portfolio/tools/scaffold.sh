#!/usr/bin/env bash
#
# 앱 프로젝트 스캐폴딩.
#
# 사용법:
#   ./scaffold.sh <코드네임> <패키지명> <앱표시명> [추가권한XML]
#
# 예:
#   ./scaffold.sh device-spec com.devicespec.app "기기 정보"
#   ./scaffold.sh noise-meter com.noisemeter.app "소음 측정" \
#     '<uses-permission android:name="android.permission.RECORD_AUDIO" />'
#
# 이미 존재하는 프로젝트는 건드리지 않는다. (docs/ 는 보존)

set -euo pipefail

CODENAME="${1:?코드네임이 필요합니다}"
PKG="${2:?패키지명이 필요합니다}"
APP_LABEL="${3:?앱 표시명이 필요합니다}"
EXTRA_PERMISSIONS="${4:-}"

# 변경 전 정책: planner 위치(스크립트의 ..)를 기준으로 template 과 워크스페이스(planner/..)를 계산.
# 변경 후 정책: template 은 스크립트 기준 ../template (XITA portfolio/template),
#               앱 폴더는 ${XITA_PORTFOLIO_ROOT:-$HOME/workspace/auto-money}/<코드네임>.
# 변경 이유: 도구가 XITA 저장소로 이동해 스크립트 상위 폴더가 더 이상 auto-money 가 아니다.
# 영향 범위: env 를 설정하지 않으면 planner 시절과 같은 앱 경로를 쓴다.
PORTFOLIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$PORTFOLIO_DIR/template"
WORKSPACE_DIR="${XITA_PORTFOLIO_ROOT:-$HOME/workspace/auto-money}"
TARGET_DIR="$WORKSPACE_DIR/$CODENAME"
WRAPPER_SRC="$WORKSPACE_DIR/AndroidStandBy"

PKG_PATH="${PKG//.//}"

if [[ -f "$TARGET_DIR/settings.gradle.kts" ]]; then
  echo "이미 스캐폴딩된 프로젝트입니다: $TARGET_DIR"
  echo "다시 만들려면 gradle 파일과 app/ 을 먼저 지우세요."
  exit 1
fi

echo "==> $CODENAME 스캐폴딩 ($PKG)"
mkdir -p "$TARGET_DIR"

# --- 루트 파일 ---
cp "$TEMPLATE_DIR/gradle.properties" "$TARGET_DIR/gradle.properties"
cp "$TEMPLATE_DIR/gitignore.tpl" "$TARGET_DIR/.gitignore"
cp "$TEMPLATE_DIR/keystore.properties.example" "$TARGET_DIR/keystore.properties.example"
cp "$TEMPLATE_DIR/settings.gradle.kts.tpl" "$TARGET_DIR/settings.gradle.kts"
cp "$TEMPLATE_DIR/build.gradle.kts.tpl" "$TARGET_DIR/build.gradle.kts"

# --- gradle wrapper (검증된 기존 프로젝트에서 복사) ---
if [[ -d "$WRAPPER_SRC/gradle/wrapper" ]]; then
  mkdir -p "$TARGET_DIR/gradle/wrapper"
  cp "$WRAPPER_SRC/gradle/wrapper/gradle-wrapper.jar" "$TARGET_DIR/gradle/wrapper/"
  cp "$WRAPPER_SRC/gradle/wrapper/gradle-wrapper.properties" "$TARGET_DIR/gradle/wrapper/"
  cp "$WRAPPER_SRC/gradlew" "$TARGET_DIR/gradlew"
  [[ -f "$WRAPPER_SRC/gradlew.bat" ]] && cp "$WRAPPER_SRC/gradlew.bat" "$TARGET_DIR/" || true
  chmod +x "$TARGET_DIR/gradlew"
else
  echo "경고: gradle wrapper 원본을 찾지 못했습니다 ($WRAPPER_SRC)"
fi

# --- app 모듈 ---
mkdir -p "$TARGET_DIR/app/src/main/java/$PKG_PATH"
cp "$TEMPLATE_DIR/app/build.gradle.kts.tpl" "$TARGET_DIR/app/build.gradle.kts"
cp "$TEMPLATE_DIR/app/proguard-rules.pro" "$TARGET_DIR/app/proguard-rules.pro"
cp "$TEMPLATE_DIR/app/src/main/AndroidManifest.xml.tpl" "$TARGET_DIR/app/src/main/AndroidManifest.xml"

# --- 리소스 ---
cp -R "$TEMPLATE_DIR/app/src/main/res" "$TARGET_DIR/app/src/main/res"
mv "$TARGET_DIR/app/src/main/res/values/strings.xml.tpl" \
   "$TARGET_DIR/app/src/main/res/values/strings.xml"

# --- 코틀린 소스 (패키지 경로로 배치) ---
SRC="$TARGET_DIR/app/src/main/java/$PKG_PATH"
mkdir -p "$SRC/ads" "$SRC/ui/theme"
cp "$TEMPLATE_DIR/app/src/main/java/App.kt.tpl" "$SRC/App.kt"
cp "$TEMPLATE_DIR/app/src/main/java/MainActivity.kt.tpl" "$SRC/MainActivity.kt"
for f in "$TEMPLATE_DIR/app/src/main/java/ads/"*.tpl; do
  cp "$f" "$SRC/ads/$(basename "${f%.tpl}")"
done
cp "$TEMPLATE_DIR/app/src/main/java/ui/theme/Theme.kt.tpl" "$SRC/ui/theme/Theme.kt"

# --- 플레이스홀더 치환 ---
# BSD sed(macOS)와 GNU sed 모두에서 동작하도록 -i '' 대신 임시 파일을 쓴다.
substitute() {
  local file="$1"
  local tmp="${file}.tmp"
  sed -e "s|__PKG__|$PKG|g" \
      -e "s|__CODENAME__|$CODENAME|g" \
      -e "s|__APP_LABEL__|$APP_LABEL|g" \
      "$file" > "$tmp"
  mv "$tmp" "$file"
}

while IFS= read -r -d '' file; do
  substitute "$file"
done < <(find "$TARGET_DIR" \
  \( -name '*.kt' -o -name '*.xml' -o -name '*.kts' \) \
  -not -path '*/build/*' -print0)

# 추가 권한은 개행이 포함될 수 있어 별도 처리
MANIFEST="$TARGET_DIR/app/src/main/AndroidManifest.xml"
python3 - "$MANIFEST" "$EXTRA_PERMISSIONS" <<'PY'
import sys
path, extra = sys.argv[1], sys.argv[2]
with open(path, encoding='utf-8') as f:
    content = f.read()
content = content.replace('__EXTRA_PERMISSIONS__', ('    ' + extra) if extra else '')
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
PY

echo "완료: $TARGET_DIR"
echo "초기 커밋: (cd $TARGET_DIR && git init -q && git add -A && git commit -qm '초기 커밋')"
echo "  └ versionCode 가 git 커밋 수 + 100 으로 계산되므로 커밋이 하나는 있어야 빌드된다."
echo "빌드 확인: (cd $TARGET_DIR && ./gradlew assembleDebug)"
