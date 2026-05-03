import type { Evidence, Forecast, Market, StrategyMeta } from "../src/strategy-api.ts";

export const meta: StrategyMeta = {
  name: "simple-momentum",
  version: "0.1.0",
  authorHandle: "sibyl-bundled",
  description: "Buys YES when the implied probability of outcome 0 has trended up over the lookback window.",
  markets: ["crypto", "macro", "politics"],
};

const LOOKBACK = 30;
const ENTRY_THRESHOLD = 0.02;
const STAKE_USD = 5;

export async function forecast(market: Market, _evidence: Evidence): Promise<Forecast> {
  const hist = market.history;
  if (hist.length < 2) {
    return { probability: 0.5, confidence: 0, stakeUsd: 0, reasoning: "no history yet" };
  }
  const recent = hist[hist.length - 1]!.prices[0]!;
  const lookback = hist[Math.max(0, hist.length - LOOKBACK)]!.prices[0]!;
  const momentum = (recent - lookback) / Math.max(0.01, lookback);

  if (Math.abs(momentum) < ENTRY_THRESHOLD) {
    return {
      probability: 0.5,
      confidence: 0.1,
      stakeUsd: 0,
      reasoning: `flat (${(momentum * 100).toFixed(2)}%) — no signal`,
    };
  }

  const probability = clamp(0.5 + momentum, 0.05, 0.95);
  const outcomeIdx = momentum > 0 ? 0 : 1;
  return {
    probability: outcomeIdx === 0 ? probability : 1 - probability,
    confidence: Math.min(0.95, Math.abs(momentum) * 6),
    stakeUsd: STAKE_USD,
    outcomeIdx,
    reasoning: `${momentum > 0 ? "+" : ""}${(momentum * 100).toFixed(1)}% momentum vs ${LOOKBACK} ticks ago — buying ${market.outcomes[outcomeIdx]}`,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}
