// Mirror of the envelope shapes from src/envelopes.ts. Duplicated rather than
// imported because the web app is its own deployable unit and we don't want to
// drag the CLI's deps (zod, viem, etc.) into the browser bundle.

export type EnvelopeType = "strategy_publish" | "forecast" | "trade_receipt" | "outcome";

export interface ForecastBody {
  strategyName: string;
  strategyHash: string;
  strategyAuthor: string;
  marketId: string;
  marketSnapshot: {
    question: string;
    currentPrices: number[];
    historyLength: number;
  };
  outcomeIdx: number;
  probability: number;
  confidence: number;
  stakeUsd: number;
  reasoning: string;
  receipt?: {
    path: string;
    contentHash?: string;
    verifier: "gensyn-ree";
    model: string;
    operationSet: "reproducible" | "deterministic";
  };
}

export interface StrategyPublishBody {
  name: string;
  version: string;
  authorHandle: string;
  contentHash: string;
  contentB64: string;
  sizeBytes: number;
  declaresRee?: { model: string; operationSet: string };
}

export interface TradeReceiptBody {
  forecastRef: string;
  marketId: string;
  side: string;
  outcomeIdx: number;
  sizeUsd: number;
  entryPrice: number;
  delphiTxHash: string;
}

export interface OutcomeBody {
  marketId: string;
  resolution: string;
  resolutionOutcomeIdx: number;
  tradeReceiptRef: string;
  pnlUsd: number;
  split: {
    operator: { pubkey: string; share: number; amountUsd: number };
    author: { pubkey: string; share: number; amountUsd: number };
  };
  settlement: { method: "iou_v1"; iouSig: string };
}

export interface EnvelopeShell {
  v: 1;
  ts: string;
  from: string;
  sig: string;
}

export type Envelope =
  | (EnvelopeShell & { type: "forecast"; body: ForecastBody })
  | (EnvelopeShell & { type: "strategy_publish"; body: StrategyPublishBody })
  | (EnvelopeShell & { type: "trade_receipt"; body: TradeReceiptBody })
  | (EnvelopeShell & { type: "outcome"; body: OutcomeBody });

export type ConnectionStatus = "connecting" | "open" | "closed" | "error";
