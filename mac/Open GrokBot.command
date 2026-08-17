#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
ELECTRON="$ROOT/node_modules/.bin/electron"

if [ -x "$ELECTRON" ]; then
  exec "$ELECTRON" "$ROOT/electron/main.mjs"
fi

if command -v npx >/dev/null 2>&1; then
  cd "$ROOT" && exec npx --yes electron electron/main.mjs
fi

URL="file://${DIR}/index.html"
if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL" --window-size=400,640
elif [ -d "/Applications/Safari.app" ]; then
  open -a Safari "$DIR/index.html"
else
  open "$DIR/index.html"
fi
