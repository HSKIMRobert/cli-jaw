#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

STAGING=".dist-staging"
OLD=".dist-old"

rm -rf "$STAGING"
npx tsc --outDir "$STAGING"
mkdir -p "$STAGING/src/prompt"
rsync -a --delete src/prompt/templates/ "$STAGING/src/prompt/templates/"
rsync -a --delete prompts/ "$STAGING/prompts/"

# Atomic swap
rm -rf "$OLD"
[ -d dist ] && mv dist "$OLD"
mv "$STAGING" dist
rm -rf "$OLD" &
echo "[atomic-build] dist/ swapped successfully"
