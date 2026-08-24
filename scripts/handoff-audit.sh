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
VITE_PID=""
if ! curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  echo "starting vite on 8080"
  VITE_LOG="${TMPDIR:-/tmp}/grokbot-handoff-vite.log"
  npm run dev >"$VITE_LOG" 2>&1 &
  VITE_PID=$!
  ready=0
  i=0
  while [ "$i" -lt 60 ]; do
    if curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8080/; then
      ready=1
      break
    fi
    if ! kill -0 "$VITE_PID" 2>/dev/null; then
      fail "vite exited before 8080 was ready (see $VITE_LOG)"
    fi
    i=$((i + 1))
    sleep 0.5
  done
  [ "$ready" = 1 ] || fail "vite did not start on 8080 (see $VITE_LOG)"
fi
cleanup_vite() {
  if [ -z "$VITE_PID" ]; then
    return
  fi
  queue="$VITE_PID"
  pids="$VITE_PID"
  while [ -n "$queue" ]; do
    next=""
    for p in $queue; do
      kids=$(pgrep -P "$p" 2>/dev/null || true)
      next="$next $kids"
      pids="$pids $kids"
    done
    queue="$next"
  done
  for p in $pids; do
    kill "$p" 2>/dev/null || true
  done
  wait "$VITE_PID" 2>/dev/null || true
}
trap cleanup_vite EXIT
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
