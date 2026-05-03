import type {
  Evidence,
  ListMarketsOptions,
  Market,
  MarketSource,
} from "./base.ts";

interface MockMarketSeed {
  id: string;
  question: string;
  category: string;
  outcomes: [string, string];
  startProb: number;
  drift: number;     // per-tick drift on outcome 0's probability
  noise: number;     // per-tick noise stddev-ish
}

// Seeded markets span the venue archetypes Sibyl is designed for. Categories
// match Delphi's taxonomy where applicable so Phase F's DelphiMarketSource
// drops in beside this without touching consumers.
const SEEDS: MockMarketSeed[] = [
  // ---- Prediction-market-shaped (Delphi / Polymarket / Kalshi) ----
  {
    id: "x402-3m",
    question: "Will daily x402 volume hit $3M in 2026?",
    category: "crypto",
    outcomes: ["Yes", "No"],
    startProb: 0.31,
    drift: 0.0006,
    noise: 0.011,
  },
  {
    id: "mstr-btc-buy",
    question: "Will MicroStrategy announce a Bitcoin purchase this week?",
    category: "crypto",
    outcomes: ["Yes", "No"],
    startProb: 0.62,
    drift: 0.0,
    noise: 0.009,
  },
  {
    id: "fed-cut",
    question: "Will the Fed cut rates at the next meeting?",
    category: "macro",
    outcomes: ["Yes", "No"],
    startProb: 0.34,
    drift: 0.0,
    noise: 0.015,
  },
  {
    id: "apple-headset",
    question: "Will Apple's next headset ship before EOY?",
    category: "tech",
    outcomes: ["Yes", "No"],
    startProb: 0.27,
    drift: -0.0002,
    noise: 0.008,
  },
  // ---- DeFi-event-shaped ----
  {
    id: "uni-prop-x",
    question: "Will Uniswap governance prop #54 pass by Friday?",
    category: "defi",
    outcomes: ["Yes", "No"],
    startProb: 0.55,
    drift: 0.0004,
    noise: 0.010,
  },
  {
    id: "susd-peg",
    question: "Will sUSDe stay within 25bps of peg through Q3?",
    category: "defi",
    outcomes: ["Yes", "No"],
    startProb: 0.78,
    drift: 0.0,
    noise: 0.006,
  },
  // ---- Crypto-event / token-shaped ----
  {
    id: "btc-100k",
    question: "Will BTC hit $100,000 by end of week?",
    category: "crypto",
    outcomes: ["Yes", "No"],
    startProb: 0.42,
    drift: 0.0008,
    noise: 0.012,
  },
  {
    id: "sol-250",
    question: "Will SOL trade above $250 at any point this week?",
    category: "crypto",
    outcomes: ["Yes", "No"],
    startProb: 0.39,
    drift: 0.0005,
    noise: 0.014,
  },
  {
    id: "eth-staking-spike",
    question: "Will ETH staking ratio cross 28% this month?",
    category: "crypto",
    outcomes: ["Yes", "No"],
    startProb: 0.58,
    drift: -0.0003,
    noise: 0.008,
  },
];

export class MockMarketSource implements MarketSource {
  public readonly name = "mock";
  private readonly state = new Map<string, Market>();

  constructor(private readonly seeds: MockMarketSeed[] = SEEDS) {
    for (const seed of seeds) {
      this.state.set(seed.id, seedToMarket(seed));
    }
  }

  async listMarkets(opts?: ListMarketsOptions): Promise<Market[]> {
    this.tickAll();
    let arr = Array.from(this.state.values());
    if (opts?.status) arr = arr.filter((m) => m.status === opts.status);
    if (opts?.limit !== undefined) arr = arr.slice(0, opts.limit);
    return arr.map(cloneMarket);
  }

  async getMarket(id: string): Promise<Market> {
    this.tickAll();
    // Accept either the bare seed id or the full mock://market/<id> URI.
    const key = id.startsWith("mock://market/") ? id.slice("mock://market/".length) : id;
    const m = this.state.get(key);
    if (!m) throw new Error(`mock market not found: ${id}`);
    return cloneMarket(m);
  }

  async getEvidence(market: Market): Promise<Evidence> {
    return {
      webSnippets: [
        {
          title: `${market.category ?? "general"} — synthetic headline`,
          text: `Synthetic news context for "${market.question}". Used by mock mode only.`,
        },
      ],
    };
  }

  private tickAll(): void {
    for (const seed of this.seeds) {
      const m = this.state.get(seed.id);
      if (!m) continue;
      const last = m.currentPrices[0]!;
      const noise = (Math.random() - 0.5) * 2 * seed.noise;
      const next = clamp01(last + seed.drift + noise);
      m.currentPrices = [next, 1 - next];
      m.history.push({ ts: Date.now(), prices: m.currentPrices });
      if (m.history.length > 240) m.history.splice(0, m.history.length - 240);
    }
  }
}

function seedToMarket(seed: MockMarketSeed): Market {
  const p = clamp01(seed.startProb);
  const now = Date.now();
  return {
    id: `mock://market/${seed.id}`,
    question: seed.question,
    category: seed.category,
    outcomes: [...seed.outcomes],
    status: "open",
    currentPrices: [p, 1 - p],
    history: [{ ts: now, prices: [p, 1 - p] }],
  };
}

function cloneMarket(m: Market): Market {
  return {
    ...m,
    outcomes: [...m.outcomes],
    currentPrices: [...m.currentPrices],
    history: m.history.map((h) => ({ ts: h.ts, prices: [...h.prices] })),
  };
}

function clamp01(x: number): number {
  return Math.min(0.99, Math.max(0.01, x));
}
