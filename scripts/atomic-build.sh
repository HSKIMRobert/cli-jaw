#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

STAGING=".dist-staging"
OLD=".dist-old"

rm -rf "$STAGING"
npx tsc --outDir "$STAGING"
# cp -R instead of rsync: staging is always fresh (rm -rf above), and
# Git Bash on Windows runners has no rsync.
mkdir -p "$STAGING/src/prompt/templates" "$STAGING/prompts"
cp -R src/prompt/templates/. "$STAGING/src/prompt/templates/"
cp -R prompts/. "$STAGING/prompts/"

# Atomic swap with rollback on failure
rm -rf "$OLD"
if [ -d dist ]; then
    mv dist "$OLD"
    if ! mv "$STAGING" dist; then
        echo "[atomic-build] swap failed — rolling back" >&2
        mv "$OLD" dist
        exit 1
    fi
    rm -rf "$OLD" &
else
    mv "$STAGING" dist
fi
echo "[atomic-build] dist/ swapped successfully"
