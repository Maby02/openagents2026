#!/bin/sh
# Two-node demo over the REAL AXL Go binary.
# Spins up Alice + Bob as separate processes, each with their own ed25519
# identity, AXL HTTP+TCP+TLS ports, and events.jsonl. Bob dials Alice via
# `Peers`, Alice listens via `Listen`. Demonstrates cross-AXL-node gossip:
# Alice publishes a strategy_publish envelope; Bob's `sibyl list` picks it up.
#
# This is the qualification artifact for the Gensyn AXL track:
# "demonstrate communication across separate AXL nodes, not just in-process".

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIBYL="$ROOT/bin/sibyl"

# AXL binary lives at the user's real ~/.sibyl/node; the per-node SIBYL_HOMEs
# below only own keys + node-config.json, not the binary.
AXL_BINARY="${SIBYL_AXL_BINARY:-$HOME/.sibyl/node}"
if [ ! -x "$AXL_BINARY" ]; then
  echo "AXL binary not found at $AXL_BINARY"
  echo "Build it with:"
  echo "  git clone https://github.com/gensyn-ai/axl.git ~/.sibyl/axl-src"
  echo "  cd ~/.sibyl/axl-src && GOTOOLCHAIN=go1.25.5 go build -o ~/.sibyl/node ./cmd/node/"
  exit 1
fi

ALICE_HOME=$(mktemp -d -t sibyl-alice-home-XXXX)
BOB_HOME=$(mktemp -d -t sibyl-bob-home-XXXX)
ALICE_CWD=$(mktemp -d -t sibyl-alice-cwd-XXXX)
BOB_CWD=$(mktemp -d -t sibyl-bob-cwd-XXXX)

# IMPORTANT: both nodes share the SAME tcp_port. AXL's /send routes through
# its own gVisor TCP stack and dials destinations on its LOCAL tcp_port —
# so the receiver must be listening on the same port number. (Each node has
# a private gVisor stack; there's no real-port collision.) Verified against
# axl/internal/tcp/dial/dial.go.
SHARED_TCP_PORT=7000

ALICE_API=20100
ALICE_TCP=$SHARED_TCP_PORT
ALICE_OBS=20300
ALICE_LISTEN_PORT=20400

BOB_API=20101
BOB_TCP=$SHARED_TCP_PORT
BOB_OBS=20301

# Each cwd needs strategies/, node_modules, and the src/ tree so dynamic strategy
# imports (which `import` from "../src/strategy-api.ts") resolve.
for CWD in "$ALICE_CWD" "$BOB_CWD"; do
  ln -s "$ROOT/strategies"   "$CWD/strategies"
  ln -s "$ROOT/node_modules" "$CWD/node_modules"
  ln -s "$ROOT/src"          "$CWD/src"
done

cleanup() {
  echo ""
  echo "──── cleanup ────"
  if [ -n "${ALICE_CWD:-}" ] && [ -f "$ALICE_CWD/run.log" ]; then
    echo "── Alice's last run log lines ──"
    tail -25 "$ALICE_CWD/run.log"
    echo ""
  fi
  if [ -n "${BOB_CWD:-}" ] && [ -f "$BOB_CWD/run.log" ]; then
    echo "── Bob's last run log lines ──"
    tail -25 "$BOB_CWD/run.log"
    echo ""
  fi
  [ -n "${ALICE_PID:-}" ] && kill -INT "$ALICE_PID" 2>/dev/null || true
  [ -n "${BOB_PID:-}"   ] && kill -INT "$BOB_PID"   2>/dev/null || true
  wait 2>/dev/null || true
  rm -rf "$ALICE_HOME" "$BOB_HOME" "$ALICE_CWD" "$BOB_CWD"
}
trap cleanup EXIT INT TERM

echo "──── 1. init Alice + Bob ────"
SIBYL_HOME="$ALICE_HOME" "$SIBYL" init >/dev/null 2>&1
SIBYL_HOME="$BOB_HOME"   "$SIBYL" init >/dev/null 2>&1
ALICE_PEER=$(SIBYL_HOME="$ALICE_HOME" "$SIBYL" status 2>&1 | awk -F'peer id |\\)' '/peer id/ {print $2; exit}')
BOB_PEER=$(SIBYL_HOME="$BOB_HOME"     "$SIBYL" status 2>&1 | awk -F'peer id |\\)' '/peer id/ {print $2; exit}')
echo "Alice peer: $ALICE_PEER"
echo "Bob   peer: $BOB_PEER"

echo ""
echo "──── 2. start Alice (Listen=tls://127.0.0.1:$ALICE_LISTEN_PORT) ────"
cd "$ALICE_CWD"
SIBYL_HOME="$ALICE_HOME" \
SIBYL_AXL_BINARY="$AXL_BINARY" \
SIBYL_AXL_API_PORT=$ALICE_API \
SIBYL_AXL_TCP_PORT=$ALICE_TCP \
SIBYL_OBSERVE_PORT=$ALICE_OBS \
SIBYL_AXL_LISTEN="tls://127.0.0.1:$ALICE_LISTEN_PORT" \
"$SIBYL" run --mode mock --tick-ms 99999 --strategy simple-momentum > "$ALICE_CWD/run.log" 2>&1 &
ALICE_PID=$!

echo ""
echo "──── 3. start Bob (Peers=tls://127.0.0.1:$ALICE_LISTEN_PORT) ────"
cd "$BOB_CWD"
SIBYL_HOME="$BOB_HOME" \
SIBYL_AXL_BINARY="$AXL_BINARY" \
SIBYL_AXL_API_PORT=$BOB_API \
SIBYL_AXL_TCP_PORT=$BOB_TCP \
SIBYL_OBSERVE_PORT=$BOB_OBS \
SIBYL_AXL_PEERS="tls://127.0.0.1:$ALICE_LISTEN_PORT" \
"$SIBYL" run --mode mock --tick-ms 99999 --strategy mean-reversion > "$BOB_CWD/run.log" 2>&1 &
BOB_PID=$!

echo "waiting for both AXL nodes to be up..."
for i in $(seq 1 40); do
  AC=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$ALICE_API/topology 2>/dev/null || echo 0)
  BC=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$BOB_API/topology   2>/dev/null || echo 0)
  if [ "$AC" = "200" ] && [ "$BC" = "200" ]; then
    echo "both up after $((i*250))ms"
    break
  fi
  sleep 0.25
done

echo ""
echo "──── 4. confirm peers see each other in /topology ────"
echo "waiting for AXL handshake..."
for i in $(seq 1 60); do
  ALICE_PEERS=$(curl -s http://127.0.0.1:$ALICE_API/topology | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('peers',[])))" 2>/dev/null || echo 0)
  BOB_PEERS=$(curl -s http://127.0.0.1:$BOB_API/topology   | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('peers',[])))" 2>/dev/null || echo 0)
  if [ "$ALICE_PEERS" -ge "1" ] && [ "$BOB_PEERS" -ge "1" ]; then
    echo "Alice sees $ALICE_PEERS peer(s), Bob sees $BOB_PEERS peer(s) — handshake done after $((i*500))ms"
    break
  fi
  sleep 0.5
done

echo ""
echo "Alice's view of /topology:"
curl -s http://127.0.0.1:$ALICE_API/topology | python3 -m json.tool 2>/dev/null | head -25

echo ""
echo "Bob's view of /topology:"
curl -s http://127.0.0.1:$BOB_API/topology | python3 -m json.tool 2>/dev/null | head -25

echo ""
echo "──── 5. Alice shares a strategy onto the mesh ────"
cd "$ALICE_CWD"
SIBYL_HOME="$ALICE_HOME" \
SIBYL_OBSERVE_PORT=$ALICE_OBS \
"$SIBYL" share strategies/llm_headline.ts

echo ""
echo "──── 6. wait for gossip to deliver ────"
sleep 3

echo ""
echo "──── 7. Bob's view of strategies seen on the mesh ────"
cd "$BOB_CWD"
SIBYL_HOME="$BOB_HOME" "$SIBYL" list

echo ""
echo "──── 8. Bob's events.jsonl envelope types ────"
echo "(this is the cross-AXL-node proof — strategy_publish landed via gossip)"
grep -o '"type":"[^"]*"' "$BOB_CWD/data/events.jsonl" 2>/dev/null | sort | uniq -c

echo ""
echo "──── done ────"
echo ""
echo "Alice run log: $ALICE_CWD/run.log"
echo "Bob   run log: $BOB_CWD/run.log"
echo "(the trap above will clean these up momentarily)"
