#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
cd "$ROOT"

ELECTRON="$ROOT/node_modules/.bin/electron"

if [ ! -x "$ELECTRON" ]; then
  if command -v npm >/dev/null 2>&1; then
    npm install --legacy-peer-deps
  fi
fi

if [ -x "$ELECTRON" ]; then
  exec "$ELECTRON" "$ROOT/electron/main.mjs"
fi

if command -v npx >/dev/null 2>&1; then
  exec npx --yes electron electron/main.mjs
fi

osascript -e 'display dialog "请先安装 Node.js，然后在仓库里运行 npm install。" buttons {"OK"} default button 1'
open "https://nodejs.org/"
