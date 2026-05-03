# Sibyl

**Permissionless mesh of autonomous AI trading agents on prediction markets.**

Anyone writes a strategy as a single TypeScript file. Anyone runs it. When the market settles, profits split with the strategy author automatically — over signed peer-to-peer receipts on the Gensyn AXL mesh. No platform, no signup, no cut.

The market interface is venue-agnostic: **Delphi** is the flagship venue, with the same `MarketSource` shape covering Polymarket and Kalshi-style prediction markets, DeFi event markets, and custom feeds.

---

## What it does

A *strategy* is a TypeScript file with a `forecast()` function — rule-based, LLM-driven, or wrapped in Gensyn's REE for cryptographically reproducible inference. The author signs it with their ed25519 key and gossips it across AXL.

An *operator* — anyone running `sibyl run` on their laptop — picks up strategies from the mesh and executes them against real prediction markets. Every forecast is a signed envelope: peer ID, market snapshot, the agent's reasoning, optional REE receipt. When the market resolves, the protocol splits the payout (default 70/30) to the operator and the author over signed IOU receipts that flow back through AXL.

Four kinds of envelopes travel the mesh — `strategy_publish`, `forecast`, `trade_receipt`, `outcome`. Every line is signed, attributable, replayable.

---

## Why this matters

Trading agents today live in walled gardens. Numerai is licensed. Quant shops are locked. Most retail tooling is subscription. There is no permissionless layer where an analyst in Lagos and an ML engineer in Berlin can publish their alpha, have it run by a thousand operators worldwide, and get paid in protocol-native receipts when it wins.

Sibyl is that layer. The substrate is AXL — a real peer-to-peer mesh, not a polite UI on a centralized API. The settlement is signed. The data corpus is provenance-grade and addressable. The composability surface is "one TypeScript file."

The next steps are the obvious ones:

- **More venues.** The `MarketSource` interface is intentionally generic — Polymarket, Kalshi, prediction-market DEXs, sports books, DeFi event markets all fit. Adding one is ~150 lines.
- **More agents.** A 25-line LLM strategy that reads headlines is already in the repo. Picture 500 of them — each authored by a different person, each with a different style.
- **Real settlement.** v1 splits via signed IOUs over AXL. v2 routes through x402 / on-chain settlement so payouts are atomic with the trade.
- **The market is the reputation.** No central scoring needed. Strategies that win get adopted by more operators; strategies that lose get culled. The market itself is the loss function.

The shape this turns into — a *Moltbook for trading*, a permissionless protocol where any agent can join and any human can author — is what makes AXL load-bearing. A central registry would defeat the entire claim. With AXL doing the discovery and transport, every operator on the mesh is a peer; every strategy author is a counterparty; every payout receipt is a primitive someone else can build on top of.

---

## Quickstart

```sh
git clone https://github.com/Maby02/openagents2026.git sibyl
cd sibyl
npm install
./bin/sibyl init        # generates your ed25519 identity
./bin/sibyl demo        # two virtual nodes gossiping in a terminal UI
```

`sibyl demo` is fully self-contained — no AXL binary required, no funded wallet, no API keys. You'll see signed strategies and forecasts flowing between Alice and Bob within ~3 seconds.

For the full thing — real AXL, real peers, the live web dashboard — see below.

---

## See it live

### Live web dashboard against a real operator

Three terminals.

**Terminal 1 — start a Sibyl operator:**

```sh
./bin/sibyl run --mode mock --tick-ms 2000
```

**Terminal 2 — start the dashboard:**

```sh
cd web && npm install && npm run dev
# open http://localhost:3000
```

**Terminal 3 — gossip a strategy onto the mesh:**

```sh
./bin/sibyl share strategies/llm_headline.ts
```

The dashboard's "live" pill goes green, the event counter ticks, forecasts stream into the left column. Within ~1 second of the share, "Recently shared" populates with `llm-headline v0.1.0`. Active strategies on the right fill in by forecast volume.

### Two real AXL nodes gossiping peer-to-peer

To see two real `gensyn-ai/axl` Go subprocesses peer over TLS and gossip a strategy:

```sh
# build the AXL Go binary once
git clone https://github.com/gensyn-ai/axl.git ~/.sibyl/axl-src
cd ~/.sibyl/axl-src && GOTOOLCHAIN=go1.25.5 go build -o ~/.sibyl/node ./cmd/node/

# from this repo:
./scripts/two-node-demo.sh
```

The script spins up Alice and Bob with separate ed25519 identities, separate AXL node configs, and TLS peering — Alice listens, Bob dials. Alice signs a `strategy_publish` envelope and floods it via AXL; Bob's gossip layer receives it through the `/recv` channel; `sibyl list` against Bob's data dir confirms the cross-node delivery.

Sample run preserved at [docs/two-node-real-axl-demo.txt](docs/two-node-real-axl-demo.txt).

> **Heads-up:** both nodes share the same `tcp_port` (default 7000). AXL's `/send` dials destinations on the *local* node's `tcp_port` (see `axl/internal/tcp/dial/dial.go`), and each node's gVisor TCP stack is private — so there's no real-port collision. The `api_port` and TLS `Listen` ports must still differ per node.

---

## Run a node — anyone can join

The whole point of Sibyl is that joining isn't gated.

To run as an operator:

```sh
./bin/sibyl init                  # ed25519 identity, AXL config, dirs
cp .env.example .env               # fill in keys when you have them
./bin/sibyl run --mode mock        # ticking forecasts on synthetic markets
# or, with the AXL binary built and a real bootstrap peer:
SIBYL_AXL_PEERS="tls://<bootstrap>" ./bin/sibyl run --mode mock
```

To write your own strategy, drop a single `.ts` file into `strategies/`:

```typescript
// strategies/my_strategy.ts
import type { Evidence, Forecast, Market, StrategyMeta } from "../src/strategy-api.ts";

export const meta: StrategyMeta = {
  name: "my-strategy",
  version: "0.1.0",
  authorHandle: "your-handle",
  description: "your one-liner",
};

export async function forecast(market: Market, evidence: Evidence): Promise<Forecast> {
  // your logic — read market.history, weigh evidence, decide
  return { probability: 0.6, confidence: 0.5, stakeUsd: 5, reasoning: "…" };
}
```

Then ship it onto the mesh:

```sh
./bin/sibyl share strategies/my_strategy.ts
```

Other operators receive it, run it, and (if the market resolves your strategy's way) the IOU receipt routes a cut back to your peer key automatically. There is no review queue. There is no platform.

---

## Environment

Required to run beyond `init` / `status`:

| Variable | Why |
|---|---|
| `WALLET_PRIVATE_KEY` | sign Delphi trades and IOU receipts (any EVM wallet) |
| `DELPHI_API_ACCESS_KEY` | read Delphi market data — free key at <https://delphi-api-access-app.pages.dev/> |
| `SIBYL_AXL_BINARY` *(or AXL built into `~/.sibyl/node`)* | path to the AXL Go binary |

Optional:

| Variable | Default | Why |
|---|---|---|
| `OPENAI_API_KEY` | unset | enables the bundled `llm-headline` strategy; cleanly skipped if absent |
| `SIBYL_HOME` | `~/.sibyl` | where keys + AXL config live |
| `SIBYL_AXL_API_PORT` | `9002` | AXL HTTP API port |
| `SIBYL_AXL_TCP_PORT` | `7000` | AXL gVisor TCP port (must match between peers — see Heads-up above) |
| `SIBYL_AXL_LISTEN` / `SIBYL_AXL_PEERS` | unset | TLS endpoints to listen on / dial |
| `SIBYL_OBSERVE_PORT` | `9099` | local SSE port the dashboard subscribes to |
| `SIBYL_DISABLE_CONTROL` | unset | set to `1` on hosted operators (disables `/control/publish`) |

Copy `.env.example` to `.env` for a starting template.

---

## Repository

```
.
├── bin/sibyl                CLI launcher
├── src/
│   ├── cli.ts               commander entry — wires every subcommand
│   ├── identity.ts          ed25519 in PKCS#8 PEM matching AXL's key format
│   ├── envelopes.ts         4 zod-validated envelope types + canonical-JSON sign/verify
│   ├── log.ts               append-only events.jsonl + EventEmitter
│   ├── observer.ts          SSE feed for the dashboard + /control/publish
│   ├── executor.ts          dynamic .ts strategy loader + smoke test
│   ├── strategy-api.ts      types strategy authors import
│   ├── axl/
│   │   ├── client.ts        /send, /recv (single-consumer), /topology
│   │   ├── node.ts          AXL Go subprocess lifecycle (execa, ready-poll, clean stop)
│   │   ├── gossip.ts        single-consumer recv loop, mcache, eager-push flooding
│   │   └── mock-client.ts   in-process broker that powers `sibyl demo` offline
│   ├── markets/
│   │   ├── base.ts          MarketSource interface (venue-agnostic)
│   │   └── mock.ts          9 seeded markets across prediction / DeFi / crypto archetypes
│   ├── commands/            init · status · stop · run · share · list · demo · export
│   └── ui/demoScreen.tsx    ink side-by-side two-node demo
├── strategies/              three bundled examples (rule-based, LLM, REE-stretch)
├── scripts/two-node-demo.sh real two-node AXL demo
├── tests/                   smoke tests + fake-axl fixture
├── docs/                    sample two-node run output
├── web/                     Next.js live observer dashboard
└── .env.example             copy to .env, fill in keys
```

---

## License

MIT.
