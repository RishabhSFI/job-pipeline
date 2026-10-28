#!/bin/bash
# scripts/check-fresh.sh
# Proves a friend's first install works: copies the project into an empty
# temp folder (no private files, no node_modules), runs the installer
# without background jobs, the tests, and the offline checkup.
#
#   ./scripts/check-fresh.sh [folder to check, default: this project]

set -euo pipefail
SRC="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Every file git would share (tracked or new), never gitignored ones.
# (git still lists files deleted but not yet committed; skip those.)
(cd "$SRC" && git ls-files -z -co --exclude-standard |
  while IFS= read -r -d '' f; do [ -e "$f" ] && printf '%s\0' "$f"; done |
  xargs -0 tar -cf -) | tar -x -C "$TMP"
for f in .env.local credentials/keys.json config/applyKit.json; do
  [ ! -e "$TMP/$f" ] || { echo "FAIL: private file $f is in the shared copy"; exit 1; }
done

cd "$TMP"
JOBPIPELINE_SKIP_AGENTS=1 ./scripts/install-mac.sh > install.log 2>&1 || { cat install.log; echo "FAIL: installer"; exit 1; }
for f in .env.local config/applyKit.json node_modules; do
  [ -e "$f" ] || { echo "FAIL: installer did not create $f"; exit 1; }
done
grep -q "^GOOGLE_SERVICE_ACCOUNT_KEY_PATH=$TMP/credentials/keys.json" .env.local || { echo "FAIL: key path not set"; exit 1; }

npm test > test.log 2>&1 || { tail -30 test.log; echo "FAIL: tests"; exit 1; }

node scripts/doctor.mjs --offline > doctor.log 2>&1 || true
grep -q "✓ Settings file" doctor.log && grep -q "✗ Google key" doctor.log \
  || { cat doctor.log; echo "FAIL: checkup did not run as expected"; exit 1; }

echo "Fresh install OK"
