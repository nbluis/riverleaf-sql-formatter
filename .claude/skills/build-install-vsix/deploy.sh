#!/usr/bin/env bash
# Build, package and (re)install the Riverleaf SQL Formatter extension locally.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VSCODE_PKG="$ROOT/packages/vscode"
cd "$VSCODE_PKG"

echo "→ building"
node esbuild.js

echo "→ packaging"
npx --yes @vscode/vsce package --allow-missing-repository --skip-license

VSIX="$(ls -t ./*.vsix | head -1)"
echo "→ vsix: $VSCODE_PKG/$VSIX"

echo "→ uninstalling previous builds (any publisher)"
code --list-extensions 2>/dev/null | grep -i 'riverleaf-sql-formatter' | while read -r ext; do
  echo "  - $ext"
  code --uninstall-extension "$ext" >/dev/null 2>&1 || true
done

echo "→ installing"
code --install-extension "$VSIX" --force

echo "✓ done — reload the VS Code window to pick up the new build"
