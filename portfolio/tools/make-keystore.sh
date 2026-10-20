#!/usr/bin/env bash
#
# 공용 업로드 키스토어 생성.
#
#   ./make-keystore.sh
#
# 7개 앱이 **하나의 업로드 키**를 공유한다. 관리 대상이 1개면 백업도 1개라
# 분실 위험이 오히려 줄어든다.
#
# ⚠️  전제: Play Console에서 **Play App Signing을 켜야 한다.**
#     그래야 이 키가 "업로드 키"에 그치고, 유출되어도 구글에 재설정을 요청할 수 있다.
#     Play App Signing 없이 쓰면 이 키가 곧 앱 서명 키가 되고 교체가 불가능하다.
#
# ⚠️  키스토어를 분실하면 업데이트가 막힌다. 생성 후 반드시 별도 백업할 것.

set -euo pipefail

# 변경 전 정책: 스크립트가 있는 폴더(planner/tools)에 upload.jks / keystore.properties 생성,
#               storeFile=../planner/tools/upload.jks 고정.
# 변경 후 정책: 비밀 폴더 ${XITA_SECRETS_DIR:-$ROOT/planner/tools} 에 생성 (ROOT=${XITA_PORTFOLIO_ROOT:-$HOME/workspace/auto-money}).
#               storeFile 은 기본 비밀 폴더면 기존과 같은 ../planner/tools/upload.jks, 다른 폴더면 절대경로.
# 변경 이유: 스크립트는 XITA 저장소(git)로 옮겨왔지만 비밀 파일은 저장소 밖에 있어야 하고,
#            앱 gradle 은 planner/tools/keystore.properties 를 참조하므로 기본 위치는 그대로 둔다.
# 영향 범위: 키스토어 신규 생성 시에만. 이미 있는 키스토어는 건드리지 않는다.
ROOT="${XITA_PORTFOLIO_ROOT:-$HOME/workspace/auto-money}"
DIR="${XITA_SECRETS_DIR:-$ROOT/planner/tools}"
mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd)"
KEYSTORE="$DIR/upload.jks"
PROPS="$DIR/keystore.properties"

if [[ -f "$KEYSTORE" ]]; then
  echo "이미 키스토어가 있습니다: $KEYSTORE"
  echo "덮어쓰면 기존 키를 잃고, 이미 배포한 앱은 업데이트가 막힙니다."
  echo "정말 새로 만들려면 기존 파일을 먼저 다른 곳으로 옮기세요."
  exit 1
fi

echo "==> 공용 업로드 키스토어 생성"
echo "    위치: $KEYSTORE"
echo "    유효기간 10000일(약 27년). Play Store 요구사항입니다."
echo
echo "    이름·조직 등은 비워도 됩니다. 업로드 키에는 의미가 없습니다."
echo "    비밀번호만 기억하시면 됩니다."
echo

keytool -genkeypair -v \
  -keystore "$KEYSTORE" \
  -alias upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

if [[ ! -f "$PROPS" ]]; then
  # 기본 비밀 폴더면 기존과 같은 앱 폴더 기준 상대경로, 아니면 절대경로.
  if [[ "$DIR" == "$(cd "$ROOT" 2>/dev/null && pwd)/planner/tools" ]]; then
    STORE_FILE="../planner/tools/upload.jks"
  else
    STORE_FILE="$KEYSTORE"
  fi
  cat > "$PROPS" <<P
# 7개 앱이 공유하는 업로드 키 설정.
# storeFile 경로는 각 앱 폴더 기준 상대경로(또는 절대경로)다.
storeFile=$STORE_FILE
storePassword=
keyAlias=upload
keyPassword=
P
  echo
  echo "설정 파일을 만들었습니다. 방금 입력한 비밀번호를 채워주세요:"
  echo "  $PROPS"
fi

chmod 600 "$KEYSTORE" "$PROPS" 2>/dev/null || true

echo
echo "다음 단계:"
echo "  1. $PROPS 에 비밀번호 입력"
echo "  2. Play Console에서 Play App Signing 활성화 확인"
echo "  3. XITA 웹 콘솔에서 배포 (pnpm dev:server → http://localhost:3333/app)"
echo
echo "⚠️  upload.jks 와 비밀번호를 반드시 백업하세요."
echo "    잃어버리면 7개 앱 전부 업데이트가 막힙니다."
