#!/bin/bash
# scripts/publish.sh
# Copies this project's committed files into a separate clone of your public
# repo, checks them against your private blocklist, and pushes one commit.
# Your private files (.env.local, credentials/, resume, applyKit.json) are
# gitignored, so they are never part of what gets copied.
#
#   ./scripts/publish.sh ~/Projects/job-pipeline-public "What changed"
#
# .publish-blocklist (gitignored, one phrase per line) lists personal details
# that must never be published: your name, phone, email, sheet ID.

set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:?usage: publish.sh <public clone dir> <message>}"
MSG="${2:?usage: publish.sh <public clone dir> <message>}"

[ -d "$DEST/.git" ] || { echo "$DEST is not a git clone"; exit 1; }
[ -z "$(git -C "$SRC" status --porcelain)" ] || { echo "Commit your changes first."; exit 1; }

find "$DEST" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git -C "$SRC" archive HEAD | tar -x -C "$DEST"

if [ -f "$SRC/.publish-blocklist" ]; then
  if grep -r -i -l -F -f "$SRC/.publish-blocklist" "$DEST" --exclude-dir=.git; then
    echo "Stopped: the files above contain something from .publish-blocklist."
    git -C "$DEST" checkout -- . && git -C "$DEST" clean -fdq
    exit 1
  fi
fi

git -C "$DEST" add -A
if git -C "$DEST" diff --cached --quiet; then
  echo "Nothing new to publish."
  exit 0
fi
git -C "$DEST" commit -q -m "$MSG"
git -C "$DEST" push -q
echo "Published: $(git -C "$DEST" log --oneline -1)"
