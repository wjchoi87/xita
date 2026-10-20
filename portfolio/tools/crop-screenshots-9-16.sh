#!/bin/sh
# Play Store 가 휴대전화 스크린샷 비율(9:16)을 강제해서 거부할 때만 사용.
# 1200x2670 (9:20) center crop -> 1200x2133 (9:16).
# 원본은 gen-screenshots.py 로 재캡처 가능하므로 in-place crop 한다.
#
# 사용법: sh crop-screenshots-9-16.sh [앱코드네임 ...]
#   인자 없으면 7개 전부.
set -e
# 변경 전 정책: 스크립트 기준 ../.. (planner -> auto-money) 를 워크스페이스로 사용.
# 변경 후 정책: ${XITA_PORTFOLIO_ROOT:-$HOME/workspace/auto-money} 를 워크스페이스로 사용.
# 변경 이유: 도구가 XITA 저장소로 이동해 스크립트 상위 폴더가 더 이상 auto-money 가 아니다.
# 영향 범위: env 미설정 시 이전과 같은 경로.
WORKSPACE="${XITA_PORTFOLIO_ROOT:-$HOME/workspace/auto-money}"

APPS="theme-ledger noise-meter level-tool stud-finder battery-health device-spec bus-when"
TARGETS=${*:-$APPS}

# 9:16 세로 = 가로 * 16/9 = 1200 * 16/9 = 2133.33 -> 2133
H=2133
W=1200

for a in $TARGETS; do
  for n in 1 2; do
    f="$WORKSPACE/$a/docs/store/phone-screenshot-$n.png"
    if [ -f "$f" ]; then
      sips -c "$H" "$W" "$f" >/dev/null
      echo "$a shot$n -> ${W}x${H}"
    fi
  done
done
echo "crop 완료"
