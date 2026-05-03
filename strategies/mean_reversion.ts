import type { Evidence, Forecast, Market, StrategyMeta } from "../src/strategy-api.ts";

export const meta: StrategyMeta = {
  name: "mean-reversion",
  version: "0.1.0",
  authorHandle: "sibyl-bundled",
  description: "Fades extreme prices: when implied probability strays far from the lookback mean, bets on reversion.",
  markets: ["crypto", "macro"],
};

const LOOKBACK = 60;
const FADE_THRESHOLD = 0.06; // bet against deviations bigger than this from the lookback mean
const STAKE_USD = 5;

export async function forecast(market: Market, _evidence: Evidence): Promise<Forecast> {
  const hist = market.history;
  if (hist.length < LOOKBACK) {
    return { probability: 0.5, confidence: 0, stakeUsd: 0, reasoning: "history too short for mean reversion" };
  }
  const window = hist.slice(-LOOKBACK).map((h) => h.prices[0]!);
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const recent = hist[hist.length - 1]!.prices[0]!;
  const deviation = recent - mean;

  if (Math.abs(deviation) < FADE_THRESHOLD) {
    return {
      probability: 0.5,
      confidence: 0.1,
      stakeUsd: 0,
      reasoning: `near mean (Δ=${(deviation * 100).toFixed(1)}%) — no fade`,
    };
  }

  // Bet on reversion to mean: if recent > mean (overpriced YES), buy NO.
  const outcomeIdx = deviation > 0 ? 1 : 0;
  const probability = clamp(0.5 + Math.abs(deviation) * 2, 0.55, 0.85);
  return {
    probability,
    confidence: Math.min(0.9, Math.abs(deviation) * 8),
    stakeUsd: STAKE_USD,
    outcomeIdx,
    reasoning: `Δ=${(deviation * 100).toFixed(1)}% from ${LOOKBACK}-tick mean ${(mean * 100).toFixed(1)}% — fading ${deviation > 0 ? "rich" : "cheap"} side`,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
