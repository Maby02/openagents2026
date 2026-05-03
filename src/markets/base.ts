// Common shape consumed by the strategy executor, the trader, and the web
// frontend. Designed to be venue-agnostic — Delphi is the flagship reference
// implementation, but anything market-shaped plugs in by implementing
// MarketSource: prediction markets (Polymarket, Kalshi), DeFi event markets,
// custom DEX feeds. A change here cascades through executor, log, frontend,
// and tests, so it's frozen early.

export interface MarketHistoryPoint {
  ts: number;          // unix ms
  prices: number[];    // length = outcomes.length, sums to ~1
}

export type MarketStatus = "open" | "awaiting_settlement" | "settled" | "expired";

export interface Market {
  id: string;                    // mock://market/<id>  or  delphi://market/<onchain-address>
  question: string;
  category: string | null;
  outcomes: string[];            // outcomes[i] is the human label for outcome index i
  status: MarketStatus;
  currentPrices: number[];       // implied probabilities; sums to ~1
  history: MarketHistoryPoint[]; // ordered ascending; last is most recent
  resolution?: { outcomeIdx: number; resolvedAt: number };
}

export interface EvidenceSnippet {
  title: string;
  text: string;
  url?: string;
}

export interface Evidence {
  webSnippets: EvidenceSnippet[];
}

export interface ForecastReceipt {
  path: string;
  verifier: "gensyn-ree";
  model: string;
  operationSet: "reproducible" | "deterministic";
}

export interface Forecast {
  probability: number;     // probability assigned to outcomeIdx 0; in [0, 1]
  confidence: number;      // strategy's self-reported confidence; in [0, 1]
  stakeUsd: number;        // 0 means "no trade"
  reasoning: string;
  outcomeIdx?: number;     // optional: which outcome to bet on. Defaults to 0 if omitted.
  receipt?: ForecastReceipt;
}

export interface ListMarketsOptions {
  status?: MarketStatus;
  limit?: number;
}

export interface MarketSource {
  // Tag used in event log entries — e.g. "mock", "delphi:testnet".
  readonly name: string;

  listMarkets(opts?: ListMarketsOptions): Promise<Market[]>;
  getMarket(id: string): Promise<Market>;
  getEvidence(market: Market): Promise<Evidence>;
}
