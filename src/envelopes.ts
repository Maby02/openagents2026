import { z } from "zod";
import { type Identity, publicKeyFromHex, signMessage, verifyMessage } from "./identity.ts";

// ---------- envelope shell ----------

const HexPubkey = z.string().regex(/^[0-9a-f]{64}$/, "expected 64-char hex pubkey");
const HexSignature = z.string().regex(/^[0-9a-f]{128}$/, "expected 128-char hex signature");
const Iso8601 = z.string().datetime({ offset: true });

export const ENVELOPE_TYPES = [
  "strategy_publish",
  "forecast",
  "trade_receipt",
  "outcome",
] as const;
export type EnvelopeType = (typeof ENVELOPE_TYPES)[number];

// ---------- body schemas ----------

export const StrategyPublishBody = z.object({
  name: z.string().min(1).max(80),
  version: z.string().min(1).max(40),
  authorHandle: z.string().min(1).max(60),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  contentB64: z.string(),
  sizeBytes: z.number().int().positive(),
  declaresRee: z
    .object({
      model: z.string(),
      operationSet: z.enum(["reproducible", "deterministic"]),
    })
    .optional(),
});
export type StrategyPublishBody = z.infer<typeof StrategyPublishBody>;

export const ForecastBody = z.object({
  strategyName: z.string().min(1),
  strategyHash: z.string().regex(/^[0-9a-f]{64}$/),
  strategyAuthor: HexPubkey,
  marketId: z.string().min(1),
  marketSnapshot: z.object({
    question: z.string(),
    currentPrices: z.array(z.number()).min(2),
    historyLength: z.number().int().nonnegative(),
  }),
  outcomeIdx: z.number().int().nonnegative(),
  probability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  stakeUsd: z.number().nonnegative(),
  reasoning: z.string().max(2000),
  receipt: z
    .object({
      path: z.string(),
      contentHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
      verifier: z.literal("gensyn-ree"),
      model: z.string(),
      operationSet: z.enum(["reproducible", "deterministic"]),
    })
    .optional(),
});
export type ForecastBody = z.infer<typeof ForecastBody>;

export const TradeReceiptBody = z.object({
  forecastRef: HexSignature,
  marketId: z.string(),
  side: z.string(),
  outcomeIdx: z.number().int().nonnegative(),
  sizeUsd: z.number().nonnegative(),
  entryPrice: z.number().min(0).max(1),
  delphiTxHash: z.string(),
});
export type TradeReceiptBody = z.infer<typeof TradeReceiptBody>;

export const OutcomeBody = z.object({
  marketId: z.string(),
  resolution: z.string(),
  resolutionOutcomeIdx: z.number().int().nonnegative(),
  tradeReceiptRef: HexSignature,
  pnlUsd: z.number(),
  split: z.object({
    operator: z.object({ pubkey: HexPubkey, share: z.number().min(0).max(1), amountUsd: z.number() }),
    author: z.object({ pubkey: HexPubkey, share: z.number().min(0).max(1), amountUsd: z.number() }),
  }),
  settlement: z.object({
    method: z.literal("iou_v1"),
    iouSig: HexSignature,
  }),
});
export type OutcomeBody = z.infer<typeof OutcomeBody>;

// ---------- envelope shell ----------

const BODY_BY_TYPE = {
  strategy_publish: StrategyPublishBody,
  forecast: ForecastBody,
  trade_receipt: TradeReceiptBody,
  outcome: OutcomeBody,
} as const;

export const Envelope = z.discriminatedUnion("type", [
  z.object({
    v: z.literal(1),
    type: z.literal("strategy_publish"),
    ts: Iso8601,
    from: HexPubkey,
    sig: HexSignature,
    body: StrategyPublishBody,
  }),
  z.object({
    v: z.literal(1),
    type: z.literal("forecast"),
    ts: Iso8601,
    from: HexPubkey,
    sig: HexSignature,
    body: ForecastBody,
  }),
  z.object({
    v: z.literal(1),
    type: z.literal("trade_receipt"),
    ts: Iso8601,
    from: HexPubkey,
    sig: HexSignature,
    body: TradeReceiptBody,
  }),
  z.object({
    v: z.literal(1),
    type: z.literal("outcome"),
    ts: Iso8601,
    from: HexPubkey,
    sig: HexSignature,
    body: OutcomeBody,
  }),
]);
export type Envelope = z.infer<typeof Envelope>;

// ---------- canonical JSON for signing ----------

// Deterministic JSON: sorted keys, no extra whitespace. Strings/numbers/bools/null
// are serialized via JSON.stringify; objects sort their keys; arrays preserve order.
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

// ---------- build / verify ----------

export interface EnvelopeInput<T extends EnvelopeType> {
  type: T;
  body: z.infer<(typeof BODY_BY_TYPE)[T]>;
  ts?: string;
}

export function buildEnvelope<T extends EnvelopeType>(
  identity: Identity,
  input: EnvelopeInput<T>,
): Envelope {
  const bodySchema = BODY_BY_TYPE[input.type];
  const parsedBody = bodySchema.parse(input.body);

  const ts = input.ts ?? new Date().toISOString();
  const unsigned = {
    v: 1 as const,
    type: input.type,
    ts,
    from: identity.publicKeyHex,
    body: parsedBody,
  };
  const sig = signMessage(identity.privateKey, canonicalize(unsigned));
  const envelope = { ...unsigned, sig } as Envelope;
  return Envelope.parse(envelope);
}

export interface VerifyResult {
  ok: boolean;
  envelope?: Envelope;
  error?: string;
}

export function verifyEnvelope(raw: unknown): VerifyResult {
  const parsed = Envelope.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `schema: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  }
  const env = parsed.data;
  const { sig, ...rest } = env;
  const message = canonicalize(rest);
  const pubKey = publicKeyFromHex(env.from);
  if (!verifyMessage(pubKey, message, sig)) {
    return { ok: false, error: "signature does not match envelope contents" };
  }
  return { ok: true, envelope: env };
}
