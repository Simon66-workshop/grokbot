#!/bin/sh
# Grok Bot / Grok Build hook → GrokBot pet
#   nudge-grokbot.sh waiting "optional name"
#   nudge-grokbot.sh done
#   nudge-grokbot.sh error
STATUS="${1:-waiting}"
NAME="${2:-}"
TOOL="${3:-Grok Bot}"
INBOX="${HOME}/Library/Application Support/GrokBot/inbox.json"
mkdir -p "$(dirname "$INBOX")"
printf '{"status":"%s","name":"%s","tool":"%s","at":%s}\n' "$STATUS" "$NAME" "$TOOL" "$(date +%s)" > "$INBOX"
open "grokbot://nudge?status=${STATUS}&name=${NAME}&tool=${TOOL}" >/dev/null 2>&1 || true
