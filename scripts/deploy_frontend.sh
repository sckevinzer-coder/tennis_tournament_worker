#!/usr/bin/env bash
# 프론트 빌드 → worker/assets 동기화 → 배포 → 운영 자산 검증 (Step 26.2)
# 사용: npm run deploy:frontend
# 주의: assets/assets 만 교체하고, assets 루트의 정적 파일(아이콘·manifest·sw.js)은 유지/갱신한다.
set -euo pipefail

WK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FE="${FRONTEND_DIR:-/Users/chris/workspace/tennis_tournament/src/frontend}"
BASE="${BASE_URL:-https://tennis-tournament.jplee.workers.dev}"

echo "=== 1/4 프론트 빌드 ==="
( cd "$FE" && npm run build )

echo "=== 2/4 assets 동기화 ==="
cd "$WK"
rm -rf assets/assets
cp -R "$FE/dist/assets" assets/assets
cp "$FE/dist/index.html" assets/index.html
for pattern in '*.svg' '*.png' '*.webmanifest' 'sw.js'; do
  for f in "$FE"/dist/$pattern; do
    [ -f "$f" ] || continue
    cp "$f" assets/
  done
done
echo "동기화 파일 수: $(find assets -maxdepth 2 -type f | wc -l | tr -d ' ')"

echo "=== 3/4 배포 ==="
npm run deploy

echo "=== 4/4 운영 자산 검증 ==="
local_asset=$(basename "$(ls "$FE"/dist/assets/*.js | head -1)")
served_asset=$(curl -fsS -m 20 "$BASE/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1 | xargs basename)
echo "local=$local_asset / served=$served_asset"
if [ "$local_asset" != "$served_asset" ]; then
  echo "!! 배포된 번들이 로컬 빌드와 다릅니다." >&2
  exit 1
fi
for p in /health /manifest.webmanifest /sw.js; do
  printf '%-22s ' "$p"
  curl -sS -o /dev/null -m 20 -w 'HTTP %{http_code} %{content_type}\n' "$BASE$p"
done
echo "=== DONE ==="
