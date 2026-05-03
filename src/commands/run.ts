import { GossipNode } from "../axl/gossip.ts";
import { startAxlNode, type AxlNodeHandle } from "../axl/node.ts";
import { axlApiPort, axlTcpPort, findAxlBinary, observePort, resolvePaths } from "../config.ts";
import { buildEnvelope, type Envelope } from "../envelopes.ts";
import {
  loadAllStrategies,
  type LoadedStrategy,
  meetsEnvRequirements,
  runForecast,
} from "../executor.ts";
import { loadIdentity, type Identity } from "../identity.ts";
import { EventLog } from "../log.ts";
import type { Forecast, Market, MarketSource } from "../markets/base.ts";
import { MockMarketSource } from "../markets/mock.ts";
import { startObserver, type ObserverHandle } from "../observer.ts";

export interface RunOptions {
  mode: "mock" | "real";
  tickMs: number;
  strategy?: string; // strategy name; default = first eligible
  observePort?: number;
}

const TICK_MS_DEFAULT = 5000;

export async function runRun(opts: Partial<RunOptions>): Promise<void> {
  const mode = opts.mode ?? "mock";
  if (mode !== "mock") {
    console.error(`run --mode=${mode} is not wired up yet — coming in Phase F.`);
    process.exit(1);
  }

  const tickMs = opts.tickMs ?? TICK_MS_DEFAULT;
  const paths = resolvePaths();

  // 1. Identity (required for envelope signing).
  let identity: Identity;
  try {
    identity = await loadIdentity(paths.privateKey);
  } catch (err) {
    console.error(`identity: ${(err as Error).message}. Run \`sibyl init\` first.`);
    process.exit(1);
  }

  // 2. AXL binary check.
  const axl = await findAxlBinary();
  if (!axl) {
    console.error("AXL binary not found. Run `sibyl status` for the build instructions.");
    process.exit(1);
  }

  // 3. Strategies.
  log("exec", `loading strategies from ${paths.strategiesDir}`);
  const { strategies, issues } = await loadAllStrategies(paths.strategiesDir);
  for (const issue of issues) {
    log("exec", `skipped ${issue.filePath}: ${issue.reason}`);
  }
  if (strategies.length === 0) {
    console.error(`no strategies loaded. Drop a .ts file in ${paths.strategiesDir}.`);
    process.exit(1);
  }
  for (const s of strategies) {
    const env = meetsEnvRequirements(s.meta) ? "ready" : `missing env: ${s.meta.requiresEnv?.join(",")}`;
    log("exec", `  ${s.meta.name} v${s.meta.version} by @${s.meta.authorHandle} (${env})`);
  }

  const chosen = pickStrategy(strategies, opts.strategy);
  if (!chosen) {
    console.error(
      opts.strategy
        ? `strategy '${opts.strategy}' not found among loaded strategies.`
        : "no strategy with satisfied env requirements. Set OPENAI_API_KEY for llm-headline, or simple-momentum/mean-reversion need no env.",
    );
    process.exit(1);
  }
  log("exec", `selected: ${chosen.meta.name} (${chosen.contentHash.slice(0, 12)}…)`);

  // 4. Event log.
  const eventLog = new EventLog(paths.eventsLog);
  await eventLog.ensureDir();

  // 5. AXL node (must be up before we can build a GossipNode that wraps its client).
  // Optional peering configuration from env — comma-separated lists of TLS URIs.
  const axlListen = parseList(process.env.SIBYL_AXL_LISTEN);
  const axlPeers = parseList(process.env.SIBYL_AXL_PEERS);

  log("axl", `starting node on :${axlApiPort()} (tcp :${axlTcpPort()})${axlListen.length ? ` listen=${axlListen.join(",")}` : ""}${axlPeers.length ? ` peers=${axlPeers.length}` : ""}`);
  let axlHandle: AxlNodeHandle;
  try {
    axlHandle = await startAxlNode({
      binaryPath: axl,
      configPath: paths.axlConfig,
      privateKeyPath: paths.privateKey,
      apiPort: axlApiPort(),
      tcpPort: axlTcpPort(),
      listen: axlListen,
      peers: axlPeers,
    });
  } catch (err) {
    console.error(`axl: ${(err as Error).message}`);
    process.exit(1);
  }
  log("axl", `node up — pubkey ${axlHandle.publicKeyHex}`);

  // 6. Gossip layer — sole owner of /recv.
  const gossip = new GossipNode({
    client: axlHandle.client,
    identity,
    log: (level, msg) => {
      if (level !== "drop" || process.env.SIBYL_VERBOSE) {
        printlog(`gos:${level.padEnd(4)}`, msg);
      }
    },
  });
  // Inbound envelopes from peers: persist + emit to SSE (already emitted via log).
  gossip.on("event", async (env: Envelope) => {
    try {
      await eventLog.append(env);
      printlog("gos ", `received ${env.type} from ${env.from.slice(0, 12)}… (sig ${env.sig.slice(0, 12)}…)`);
    } catch (err) {
      printlog("gos ", `error appending inbound: ${(err as Error).message}`);
    }
  });
  await gossip.start();
  log("gos ", "started — listening for peer messages");

  // 7. SSE observer + control endpoint.
  const observePortNum = opts.observePort ?? observePort();
  let observer: ObserverHandle | null = null;
  try {
    observer = await startObserver({
      port: observePortNum,
      log: eventLog,
      ownerPubkey: identity.publicKeyHex,
      onPublish: async (env) => {
        await eventLog.append(env);
        const stats = await gossip.publish(env);
        return { summary: `published ${env.type} to ${stats.delivered}/${stats.peers} peers (msgId ${stats.msgId.slice(0, 12)}…)` };
      },
    });
    log("obs ", `SSE feed at ${observer.url}/events  (history at /events/history, control at /control/publish)`);
  } catch (err) {
    log("obs ", `WARNING — could not start observer on :${observePortNum}: ${(err as Error).message}`);
    log("obs ", "continuing without live SSE feed; events still written to events.jsonl");
  }

  // 8. Shutdown handler.
  let stopping = false;
  const stop = async (code = 0): Promise<void> => {
    if (stopping) return;
    stopping = true;
    log("run ", "stopping...");
    try { await gossip.stop(); } catch { /* ignore */ }
    try {
      await axlHandle.stop();
    } catch (err) {
      log("axl ", `stop error: ${(err as Error).message}`);
    }
    if (observer) {
      try { await observer.close(); } catch { /* ignore */ }
    }
    process.exit(code);
  };
  process.on("SIGINT", () => void stop(0));
  process.on("SIGTERM", () => void stop(0));

  // 8. Forecast loop.
  const source: MarketSource = new MockMarketSource();
  log("run", `mode=mock, tick=${tickMs}ms, source=${source.name}, peer=${identity.publicKeyHex.slice(0, 12)}…`);
  log("run", "ticking forecasts. Ctrl-C to stop.");

  let tickN = 0;
  while (!stopping) {
    tickN += 1;
    try {
      await tickOnce(tickN, source, chosen, identity, eventLog);
    } catch (err) {
      log("run", `tick error: ${(err as Error).message}`);
    }
    await sleep(tickMs);
  }
}

function pickStrategy(strategies: LoadedStrategy[], requested: string | undefined): LoadedStrategy | null {
  if (requested) {
    return strategies.find((s) => s.meta.name === requested) ?? null;
  }
  return strategies.find((s) => meetsEnvRequirements(s.meta)) ?? null;
}

async function tickOnce(
  tickN: number,
  source: MarketSource,
  strategy: LoadedStrategy,
  identity: Identity,
  log: EventLog,
): Promise<void> {
  const markets = await source.listMarkets({ status: "open", limit: 10 });
  if (markets.length === 0) return;
  const market = markets[tickN % markets.length]!;
  const evidence = await source.getEvidence(market);

  const result = await runForecast(strategy, market, evidence);
  const fc = result.forecast;

  const envelope = buildEnvelope(identity, {
    type: "forecast",
    body: {
      strategyName: strategy.meta.name,
      strategyHash: strategy.contentHash,
      strategyAuthor: identity.publicKeyHex,
      marketId: market.id,
      marketSnapshot: {
        question: market.question,
        currentPrices: market.currentPrices,
        historyLength: market.history.length,
      },
      outcomeIdx: fc.outcomeIdx ?? 0,
      probability: fc.probability,
      confidence: fc.confidence,
      stakeUsd: fc.stakeUsd,
      reasoning: fc.reasoning,
    },
  });

  await log.append(envelope);
  printForecast(market, fc, strategy, result.durationMs);
}

function printForecast(market: Market, fc: Forecast, strategy: LoadedStrategy, durMs: number): void {
  const decision = fc.stakeUsd > 0 ? "BUY " : "HOLD";
  const outcome = market.outcomes[fc.outcomeIdx ?? 0] ?? "?";
  printlog(
    "fcst",
    `[${decision}] ${strategy.meta.name} → ${market.id} "${truncate(market.question, 48)}" ` +
      `${outcome}@${fc.probability.toFixed(2)} stake=$${fc.stakeUsd.toFixed(2)} (${durMs}ms) ` +
      `because="${truncate(fc.reasoning, 80)}"`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseList(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function log(tag: string, msg: string): void {
  printlog(tag, msg);
}

function printlog(tag: string, msg: string): void {
  const ts = new Date().toISOString().split("T")[1]!.replace("Z", "");
  console.log(`${ts} [${tag.padEnd(4)}] ${msg}`);
}
