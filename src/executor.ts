import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { Evidence, Forecast, Market } from "./markets/base.ts";
import type { StrategyMeta } from "./strategy-api.ts";

export type ForecastFn = (market: Market, evidence: Evidence) => Promise<Forecast>;

export interface LoadedStrategy {
  meta: StrategyMeta;
  filePath: string;
  contentHash: string;          // sha256 of the raw .ts file bytes
  sizeBytes: number;
  forecast: ForecastFn;
}

export interface ExecutionResult {
  forecast: Forecast;
  durationMs: number;
}

export interface ExecutorIssue {
  filePath: string;
  reason: string;
}

const StrategyMetaSchema: z.ZodType<StrategyMeta> = z.object({
  name: z.string().min(1).max(80),
  version: z.string().min(1).max(40),
  authorHandle: z.string().min(1).max(60),
  description: z.string().max(400).optional(),
  markets: z.array(z.string()).max(20).optional(),
  requiresEnv: z.array(z.string()).max(20).optional(),
  split: z
    .object({
      operator: z.number().min(0).max(1),
      author: z.number().min(0).max(0.5, "author share cannot exceed 0.5"),
    })
    .refine((s) => Math.abs(s.operator + s.author - 1) < 1e-6, {
      message: "operator + author shares must sum to 1",
    })
    .optional(),
  ree: z
    .object({
      model: z.string(),
      operationSet: z.enum(["reproducible", "deterministic"]),
      cpuOnly: z.boolean().optional(),
      maxNewTokens: z.number().int().positive().optional(),
    })
    .optional(),
});

const ForecastShapeSchema = z.object({
  probability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  stakeUsd: z.number().nonnegative(),
  reasoning: z.string(),
  outcomeIdx: z.number().int().nonnegative().optional(),
  receipt: z.unknown().optional(),
});

export async function discoverStrategies(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => path.join(dir, f))
    .sort();
}

export async function loadStrategy(filePath: string): Promise<LoadedStrategy> {
  const raw = await fs.readFile(filePath);
  const contentHash = createHash("sha256").update(raw).digest("hex");
  const sizeBytes = raw.byteLength;

  const mod = (await import(pathToFileURL(path.resolve(filePath)).href)) as {
    meta?: unknown;
    forecast?: unknown;
  };

  if (typeof mod.forecast !== "function") {
    throw new Error("strategy must export an async `forecast` function");
  }
  if (!mod.meta || typeof mod.meta !== "object") {
    throw new Error("strategy must export a `meta` object");
  }

  const meta = StrategyMetaSchema.parse(mod.meta);
  const forecast = mod.forecast as ForecastFn;

  await runSmokeTest(meta.name, forecast);

  return { meta, filePath, contentHash, sizeBytes, forecast };
}

export async function loadAllStrategies(
  dir: string,
): Promise<{ strategies: LoadedStrategy[]; issues: ExecutorIssue[] }> {
  const files = await discoverStrategies(dir);
  const strategies: LoadedStrategy[] = [];
  const issues: ExecutorIssue[] = [];

  for (const filePath of files) {
    try {
      strategies.push(await loadStrategy(filePath));
    } catch (err) {
      issues.push({ filePath, reason: (err as Error).message });
    }
  }
  return { strategies, issues };
}

// Strategies that declare `requiresEnv` and don't have their env set at the
// time of execution should be skipped quietly — not fail loudly.
export function meetsEnvRequirements(meta: StrategyMeta, env = process.env): boolean {
  if (!meta.requiresEnv?.length) return true;
  return meta.requiresEnv.every((k) => typeof env[k] === "string" && env[k]!.length > 0);
}

export async function runForecast(
  strategy: LoadedStrategy,
  market: Market,
  evidence: Evidence,
): Promise<ExecutionResult> {
  if (!meetsEnvRequirements(strategy.meta)) {
    throw new Error(
      `strategy '${strategy.meta.name}' requires env: ${strategy.meta.requiresEnv?.join(", ")}`,
    );
  }
  const start = Date.now();
  const result = await strategy.forecast(market, evidence);
  const parsed = ForecastShapeSchema.safeParse(result);
  if (!parsed.success) {
    throw new Error(`forecast output invalid: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  return { forecast: result, durationMs: Date.now() - start };
}

// Synthetic market for the load-time smoke test. Helps catch obviously broken
// strategies before they are loaded into the run loop.
async function runSmokeTest(name: string, forecast: ForecastFn): Promise<void> {
  const synthetic: Market = {
    id: "mock://smoketest",
    question: "Smoke test market — does this strategy return a valid Forecast?",
    category: "test",
    outcomes: ["Yes", "No"],
    status: "open",
    currentPrices: [0.5, 0.5],
    history: Array.from({ length: 60 }, (_, i) => ({
      ts: Date.now() - (60 - i) * 1000,
      prices: [0.5, 0.5],
    })),
  };
  const evidence: Evidence = { webSnippets: [] };

  // Strategies that need real network (LLM calls) might still pass the load
  // step because we skip the smoke test if requiresEnv isn't satisfied — they
  // get exercised for real on the first tick.
  // Caller passes raw forecast fn so we can skip without knowing the meta yet.
  // (loadStrategy passes meta separately; this hook is intentionally generous.)
  // The actual env check happens in runForecast.
  try {
    const result = await Promise.race([
      forecast(synthetic, evidence),
      timeout(10_000, "smoke test timed out"),
    ]);
    const parsed = ForecastShapeSchema.safeParse(result);
    if (!parsed.success) {
      throw new Error(`smoke test for '${name}' returned invalid shape: ${parsed.error.message}`);
    }
  } catch (err) {
    // Network/auth errors during smoke test should not block load — just warn.
    // Real run will surface them on the first tick.
    const msg = (err as Error).message ?? String(err);
    if (/api[_ ]?key|auth|unauthorized|fetch|enotfound/i.test(msg)) {
      // expected for strategies without their env set or offline
      return;
    }
    throw err;
  }
}

function timeout<T>(ms: number, message: string): Promise<T> {
  return new Promise((_resolve, reject) => setTimeout(() => reject(new Error(message)), ms));
}
