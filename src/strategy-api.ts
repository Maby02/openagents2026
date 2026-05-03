// Public surface that strategy authors import from. Re-exports the types they
// need to write a `forecast()` function and declare `meta`. Everything else in
// src/ is implementation detail.

export type {
  Evidence,
  EvidenceSnippet,
  Forecast,
  ForecastReceipt,
  Market,
  MarketHistoryPoint,
  MarketStatus,
} from "./markets/base.ts";

export interface StrategySplit {
  // Fractions in [0, 1]. Author share is capped at 0.5 by the executor.
  operator: number;
  author: number;
}

export interface StrategyReeConfig {
  model: string;
  operationSet: "reproducible" | "deterministic";
  cpuOnly?: boolean;
  maxNewTokens?: number;
}

export interface StrategyMeta {
  name: string;
  version: string;
  authorHandle: string;
  description?: string;
  markets?: string[];                 // hint of which categories this strategy targets
  requiresEnv?: string[];             // env vars needed; missing = strategy is skipped
  split?: StrategySplit;              // payout split override; capped at author <= 0.5
  ree?: StrategyReeConfig;            // present means strategy uses REE for inference
}
