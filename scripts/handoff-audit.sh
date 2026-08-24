#!/bin/bash
# Local Codex pass 1. Exit 0 only if static gates pass.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "FAIL: $*" >&2; exit 1; }

echo "== node --check"
for f in electron/*.mjs; do
  node --check "$f" || fail "syntax $f"
done

echo "== tsc"
npx tsc --noEmit || fail "tsc"

echo "== tests"
node --test scripts/desk.test.mjs scripts/codex-watch.test.mjs

echo "== emitMeeting intact"
grep -q "function emitMeeting" electron/main.mjs || fail "emitMeeting missing"
if grep -n "function latchAgents" -A 80 electron/main.mjs | grep -q "if (meeting === on) return"; then
  # only fail if it appears outside a function; latchAgents should not contain meeting
  if awk '
    /function latchAgents/ {in_fn=1}
    in_fn && /function emitMeeting/ {in_fn=0}
    in_fn && /if \(meeting === on\) return/ {found=1}
    END {exit found ? 0 : 1}
  ' electron/main.mjs; then
    fail "emitMeeting body still glued to latchAgents"
  fi
fi

echo "== age + meeting tick exported"
grep -q "export function ageStatus" electron/codex.mjs || fail "ageStatus missing"
grep -q "export function tickMeeting" electron/hysteresis.mjs || fail "tickMeeting missing"
grep -q "export function stampMeeting" electron/hysteresis.mjs || fail "stampMeeting missing"

echo "== protocol"
grep -q "grokbot" electron-builder.yml || fail "grokbot protocol missing"

echo "== bundle"
npm run pet:bundle
grep -q "exprHoldUntil" mac/grokbot.js || fail "bundle missing exprHoldUntil"
grep -q "setExpression(5, { hold: 4 })" src/lib/grokbot/pet-shell.ts || fail "Joy hold missing"

echo "== desk-qa"
QA=$(node scripts/desk-qa.mjs)
echo "$QA"
echo "$QA" | grep -q '"errors": \[\]' || fail "desk-qa errors"
echo "$QA" | grep -q "Grok Bot · needs you" || fail "waiting chip missing"
echo "$QA" | grep -q '"Idle"' || fail "actions missing"

echo "== secrets scan"
if grep -R --include='*.mjs' --include='*.ts' --include='*.cjs' --include='*.js' --exclude='grokbot.js' -E 'sk-[A-Za-z0-9]{20,}|BEGIN (RSA )?PRIVATE' electron src/lib/grokbot mac; then
  fail "secret-like string found"
fi

echo "PASS1 static gates ok"
