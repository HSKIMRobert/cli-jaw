#!/usr/bin/env bash
set -euo pipefail

PLATFORM="${1:?Usage: bundle-sidecar.sh <platform> <arch>}"
ARCH="${2:?Usage: bundle-sidecar.sh <platform> <arch>}"
NODE_VERSION="22.16.0"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIDECAR_DIR="$PROJECT_ROOT/electron/sidecar/server"

echo "=== Bundling sidecar: $PLATFORM-$ARCH ==="

rm -rf "$SIDECAR_DIR"
mkdir -p "$SIDECAR_DIR/bin"

NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
case "$PLATFORM-$ARCH" in
  darwin-arm64)  NODE_PKG="node-v${NODE_VERSION}-darwin-arm64" ;;
  darwin-x64)    NODE_PKG="node-v${NODE_VERSION}-darwin-x64" ;;
  win32-x64)     NODE_PKG="node-v${NODE_VERSION}-win-x64" ;;
  linux-x64)     NODE_PKG="node-v${NODE_VERSION}-linux-x64" ;;
  *) echo "Unsupported: $PLATFORM-$ARCH"; exit 1 ;;
esac

echo "Downloading Node.js $NODE_VERSION ($PLATFORM-$ARCH)..."
if [[ "$PLATFORM" == "win32" ]]; then
  curl -fsSL "$NODE_URL/${NODE_PKG}.zip" -o /tmp/node-sidecar.zip
  unzip -qo /tmp/node-sidecar.zip -d /tmp/
  cp "/tmp/${NODE_PKG}/node.exe" "$SIDECAR_DIR/node.exe"
else
  curl -fsSL "$NODE_URL/${NODE_PKG}.tar.gz" | tar -xz -C /tmp
  cp "/tmp/${NODE_PKG}/bin/node" "$SIDECAR_DIR/node"
  chmod +x "$SIDECAR_DIR/node"
fi

echo "Building project..."
cd "$PROJECT_ROOT"
npm run build
npm run build:frontend

echo "Copying server artifacts..."
cp -r dist "$SIDECAR_DIR/dist"
cp -r public "$SIDECAR_DIR/public"
cp package.json "$SIDECAR_DIR/package.json"
cp package-lock.json "$SIDECAR_DIR/package-lock.json" 2>/dev/null || true

echo "Installing production dependencies..."
cd "$SIDECAR_DIR"
npm install --omit=dev --ignore-scripts 2>/dev/null

echo "Pruning frontend-only dependencies..."
PRUNE_PKGS=(
  "@codemirror/autocomplete" "@codemirror/lang-markdown" "@codemirror/language"
  "@codemirror/language-data" "@codemirror/state" "@codemirror/view"
  "@lezer/highlight" "@lucide/icons" "@milkdown/kit" "@replit/codemirror-vim"
  "@tanstack/virtual-core" "@uiw/react-codemirror" "@xterm/addon-fit" "@xterm/xterm"
  "d3" "dompurify" "highlight.js" "katex" "marked-highlight" "mermaid"
  "react" "react-dom" "react-markdown" "rehype-katex" "rehype-sanitize"
  "remark-breaks" "remark-gfm" "remark-math" "node-fetch"
)
for pkg in "${PRUNE_PKGS[@]}"; do
  rm -rf "$SIDECAR_DIR/node_modules/$pkg" 2>/dev/null || true
done
# Remove transitive-only packages (types, build tools)
rm -rf "$SIDECAR_DIR/node_modules/typescript" 2>/dev/null || true
rm -rf "$SIDECAR_DIR/node_modules/@types" 2>/dev/null || true
rm -rf "$SIDECAR_DIR/node_modules/@babel" 2>/dev/null || true
rm -rf "$SIDECAR_DIR/node_modules/@vue" 2>/dev/null || true
rm -rf "$SIDECAR_DIR/node_modules/cytoscape" 2>/dev/null || true
rm -rf "$SIDECAR_DIR/node_modules/cytoscape-fcose" 2>/dev/null || true
rm -rf "$SIDECAR_DIR/node_modules/es-toolkit" 2>/dev/null || true
rm -rf "$SIDECAR_DIR/node_modules/lodash" 2>/dev/null || true
rm -rf "$SIDECAR_DIR/node_modules/web-streams-polyfill" 2>/dev/null || true

echo "Rebuilding better-sqlite3..."
npm rebuild better-sqlite3

NODE_BIN="$SIDECAR_DIR/node"
if [[ "$PLATFORM" == "win32" ]]; then
  NODE_BIN="$SIDECAR_DIR/node.exe"
fi

echo "Verifying better-sqlite3 loads..."
"$NODE_BIN" -e "require('better-sqlite3')" && echo "  better-sqlite3 OK" || {
  echo "ERROR: better-sqlite3 failed to load with bundled Node"
  exit 1
}

echo "Cleaning up Node extract..."
rm -rf "/tmp/${NODE_PKG}" /tmp/node-sidecar.zip 2>/dev/null || true

NATIVE_BIN="$PROJECT_ROOT/native/jaw-claude-i/target/release/jaw-claude-i"
if [ -f "$NATIVE_BIN" ]; then
  echo "Copying jaw-claude-i..."
  cp "$NATIVE_BIN" "$SIDECAR_DIR/bin/jaw-claude-i"
  chmod +x "$SIDECAR_DIR/bin/jaw-claude-i"
else
  echo "WARN: jaw-claude-i not found, skipping (optional)"
fi

echo "Creating CLI shim..."
if [[ "$PLATFORM" == "win32" ]]; then
  cat > "$SIDECAR_DIR/bin/jaw.cmd" << 'SHIM'
@echo off
set "DIR=%~dp0.."
"%DIR%\node.exe" "%DIR%\dist\bin\cli-jaw.js" %*
SHIM
else
  cat > "$SIDECAR_DIR/bin/jaw" << 'SHIM'
#!/bin/sh
DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec "$DIR/node" "$DIR/dist/bin/cli-jaw.js" "$@"
SHIM
  chmod +x "$SIDECAR_DIR/bin/jaw"
fi

echo "=== Sidecar ready ==="
du -sh "$SIDECAR_DIR"
