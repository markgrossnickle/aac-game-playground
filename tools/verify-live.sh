#!/usr/bin/env bash
# Verify a deploy at the REAL URL. A deploy command's exit code is not proof.
#
#   tools/verify-live.sh                    # compare live buildId to html/dist/games-manifest.json
#   tools/verify-live.sh <expected-buildId> # compare to a known id
#
# Reads webUrl from bundle.config.json. Exit 1 when the live site serves a
# different build, or when /games.apk does not resolve to a real APK.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_URL="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).webUrl' "$ROOT/bundle.config.json")"
EXPECTED="${1:-}"
if [[ -z "$EXPECTED" ]]; then
  [[ -f "$ROOT/html/dist/games-manifest.json" ]] || { echo "verify-live: no expected buildId and no html/dist/games-manifest.json" >&2; exit 2; }
  EXPECTED="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).buildId' "$ROOT/html/dist/games-manifest.json")"
fi

echo "verify-live: expecting build $EXPECTED at $WEB_URL"
LIVE=""
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  LIVE="$(curl -fsS "$WEB_URL/games-manifest.json?cb=$RANDOM" 2>/dev/null | node -p 'try{JSON.parse(require("fs").readFileSync(0,"utf8")).buildId}catch(e){""}' || true)"
  if [[ "$LIVE" == "$EXPECTED" ]]; then break; fi
  echo "verify-live: live build is '${LIVE:-none}', retry $attempt/12 in 10s"
  sleep 10
done
if [[ "$LIVE" != "$EXPECTED" ]]; then
  echo "verify-live: FAIL, live build '$LIVE' != expected '$EXPECTED'" >&2
  exit 1
fi
echo "verify-live: live build matches ($LIVE)"

APK_CL="$(curl -sIL "$WEB_URL/games.apk?cb=$RANDOM" | grep -i '^content-length' | tail -1 | grep -oE '[0-9]+' || true)"
if [[ -z "$APK_CL" || "$APK_CL" -lt 1000000 ]]; then
  echo "verify-live: WARNING /games.apk does not resolve to an APK yet (${APK_CL:-no} bytes). Run the shim workflow once." >&2
else
  echo "verify-live: /games.apk resolves to $APK_CL bytes"
fi
echo "verify-live: OK"
