#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="file://${DIR}/index.html"

if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$URL" --window-size=480,640
elif [ -d "/Applications/Arc.app" ]; then
  open -a Arc "$DIR/index.html"
elif [ -d "/Applications/Safari.app" ]; then
  open -a Safari "$DIR/index.html"
else
  open "$DIR/index.html"
fi
