#!/usr/bin/env bash
#
# 디자인 시스템(토큰 + 공통 컴포넌트)을 앱에 배포한다.
#
# 사용법:
#   ./apply-design.sh <코드네임> <패키지명> <팔레트>
#
# 팔레트: SlatePro | WarmPaper | ForestLedger | InkMinimal
# 배정 근거는 <root>/planner/docs/design-system.md 참조.
#
# 기존 Theme.kt를 덮어쓴다. 화면 코드는 건드리지 않는다.

set -euo pipefail

CODENAME="${1:?코드네임이 필요합니다}"
PKG="${2:?패키지명이 필요합니다}"
PALETTE="${3:?팔레트가 필요합니다}"

# 변경 전 정책: planner 위치(스크립트의 ..)를 기준으로 template 과 워크스페이스(planner/..)를 계산.
# 변경 후 정책: template 은 스크립트 기준 ../template (XITA portfolio/template),
#               앱 폴더는 ${XITA_PORTFOLIO_ROOT:-$HOME/workspace/auto-money}/<코드네임>.
# 변경 이유: 도구가 XITA 저장소로 이동해 스크립트 상위 폴더가 더 이상 auto-money 가 아니다.
# 영향 범위: env 를 설정하지 않으면 planner 시절과 같은 앱 경로를 쓴다.
PORTFOLIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$PORTFOLIO_DIR/template/app/src/main/java"
WORKSPACE_DIR="${XITA_PORTFOLIO_ROOT:-$HOME/workspace/auto-money}"
PKG_PATH="${PKG//.//}"
SRC="$WORKSPACE_DIR/$CODENAME/app/src/main/java/$PKG_PATH"

if [[ ! -d "$SRC" ]]; then
  echo "소스 디렉토리를 찾을 수 없습니다: $SRC"
  exit 1
fi

case "$PALETTE" in
  SlatePro|WarmPaper|ForestLedger|InkMinimal) ;;
  *) echo "알 수 없는 팔레트: $PALETTE"; exit 1 ;;
esac

echo "==> $CODENAME 디자인 시스템 적용 (팔레트: $PALETTE)"

mkdir -p "$SRC/ui/theme" "$SRC/ui/components"

copy_tpl() {
  local from="$1" to="$2"
  sed -e "s|__PKG__|$PKG|g" "$from" > "$to"
}

copy_tpl "$TEMPLATE_DIR/ui/theme/Palette.kt.tpl"          "$SRC/ui/theme/Palette.kt"
copy_tpl "$TEMPLATE_DIR/ui/theme/Tokens.kt.tpl"           "$SRC/ui/theme/Tokens.kt"
copy_tpl "$TEMPLATE_DIR/ui/theme/Type.kt.tpl"             "$SRC/ui/theme/Type.kt"
copy_tpl "$TEMPLATE_DIR/ui/theme/Theme.kt.tpl"            "$SRC/ui/theme/Theme.kt"
copy_tpl "$TEMPLATE_DIR/ui/components/Primitives.kt.tpl"  "$SRC/ui/components/Primitives.kt"

# 앱마다 다른 단 한 줄: 어떤 팔레트를 쓰는가
python3 - "$SRC/ui/theme/Theme.kt" "$PALETTE" <<'PY'
import sys
path, palette = sys.argv[1], sys.argv[2]
with open(path, encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    'private val ACTIVE_PALETTE = Palettes.SlatePro',
    f'private val ACTIVE_PALETTE = Palettes.{palette}'
)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
PY

echo "완료: $SRC/ui/"
