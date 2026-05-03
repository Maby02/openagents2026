# Sibyl Web

Live observer dashboard for the Sibyl mesh. Subscribes to a Sibyl operator's SSE feed and renders forecasts, strategies, and trades as they flow on the network.

## Quickstart (local)

```sh
# 1. In the project root, start a Sibyl operator (this exposes the SSE feed)
./bin/sibyl run --mode mock

# 2. In another terminal, start the dashboard
cd web
npm install     # one-time
npm run dev     # opens http://localhost:3000
```

The dashboard auto-connects to `http://127.0.0.1:9099` (the SSE port from `sibyl run`). To point it at a different operator, set `NEXT_PUBLIC_OBSERVER_URL`:

```sh
NEXT_PUBLIC_OBSERVER_URL=https://sibyl-operator.fly.dev npm run dev
```

## Production deployment (Vercel)

```sh
npm run build
```

Deploy to Vercel as a normal Next.js app. Set `NEXT_PUBLIC_OBSERVER_URL` to your hosted Sibyl operator (Fly.io / Railway / any persistent process — Vercel itself can't host one because it's serverless).

## What it shows

- **Live event ticker** — every signed envelope on the mesh, color-coded by type
- **Active strategies** — top by forecast volume, with author handle + content hash
- **Recently shared** — last 5 unique strategies gossiped on the mesh
- **Verified badge** — appears on forecasts produced via REE-reproducible inference (Phase I)

## Architecture

```
                          POST /control/publish (loopback only)
sibyl share  ─────────────────────────────────►
                                                 ┌─────────────┐
                                                 │ sibyl run   │
                                                 │             │
                                                 │  GossipNode ◄──── AXL mesh
                                                 │     │       │
                                                 │     ▼       │
                                                 │  EventLog   │
                                                 │     │       │
                                                 │     ▼       │
                                                 │  Observer   │ :9099
                                                 └─────┬───────┘
                                                       │ SSE
                                                       ▼
                                                  this app
```

The dashboard is **read-only**. It's just a viewer over the operator's signed event stream.
