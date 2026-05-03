import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { render } from "ink";
import * as React from "react";
import { GossipNode } from "../axl/gossip.ts";
import { InMemoryBroker, MockAxlClient } from "../axl/mock-client.ts";
import { resolvePaths } from "../config.ts";
import { buildEnvelope, type Envelope } from "../envelopes.ts";
import {
  type LoadedStrategy,
  loadAllStrategies,
  meetsEnvRequirements,
  runForecast,
} from "../executor.ts";
import { generateAndSaveKey, type Identity, loadIdentity } from "../identity.ts";
import { EventLog } from "../log.ts";
import type { Market } from "../markets/base.ts";
import { MockMarketSource } from "../markets/mock.ts";
import { DemoScreen, type NodeView } from "../ui/demoScreen.tsx";

export interface DemoOptions {
  durationSec?: number;
  tickMs: number;
  shareEverySec: number;
}

interface Pipeline {
  label: string;
  identity: Identity;
  client: MockAxlClient;
  gossip: GossipNode;
  log: EventLog;
  source: MockMarketSource;
  strategy: LoadedStrategy;
  cleanupTmp: () => Promise<void>;
}

export async function runDemo(opts: Partial<DemoOptions>): Promise<void> {
  const tickMs = opts.tickMs ?? 2000;
  const shareEverySec = opts.shareEverySec ?? 12;
  const durationSec = opts.durationSec; // undefined → run until 'q'

  const paths = resolvePaths();
  const { strategies, issues } = await loadAllStrategies(paths.strategiesDir);
  const eligible = strategies.filter((s) => meetsEnvRequirements(s.meta));
  if (eligible.length < 2) {
    console.error(
      `demo needs at least 2 eligible strategies in ${paths.strategiesDir} (found ${eligible.length}).`,
    );
    for (const i of issues) console.error(`  ! ${i.filePath}: ${i.reason}`);
    process.exit(1);
  }

  // Pick two strategies for the two sides. Prefer rule-based pair to keep the
  // demo offline-clean; LLM strategy joins as the auto-share scenario.
  const aliceStrategy = eligible.find((s) => s.meta.name === "simple-momentum") ?? eligible[0]!;
  const bobStrategy = eligible.find((s) => s.meta.name === "mean-reversion") ?? eligible[eligible.length - 1]!;

  const broker = new InMemoryBroker();
  const alice = await buildPipeline("Alice", aliceStrategy, broker);
  const bob = await buildPipeline("Bob", bobStrategy, broker);

  // Wire each side's MockAxlClient to know about the other as its only peer.
  Object.assign((alice.client as unknown as { opts: { peers: string[] } }).opts, {
    peers: [bob.identity.publicKeyHex],
  });
  Object.assign((bob.client as unknown as { opts: { peers: string[] } }).opts, {
    peers: [alice.identity.publicKeyHex],
  });

  // Inbound from gossip → append to local log (mirrors real `sibyl run`).
  alice.gossip.on("event", (env) => {
    void alice.log.append(env);
  });
  bob.gossip.on("event", (env) => {
    void bob.log.append(env);
  });

  await alice.gossip.start();
  await bob.gossip.start();

  // Build NodeView adapters so the ink screen subscribes to each side's log.
  const peerLabels = new Map<string, string>();
  peerLabels.set(alice.identity.publicKeyHex, "Alice");
  peerLabels.set(bob.identity.publicKeyHex, "Bob");

  const aliceView: NodeView = {
    label: "Alice",
    pubkey: alice.identity.publicKeyHex,
    strategy: alice.strategy.meta.name,
    peerLabels: new Map([[bob.identity.publicKeyHex, "Bob"]]),
    subscribe: (cb) => {
      alice.log.on("event", cb);
      return () => alice.log.off("event", cb);
    },
  };
  const bobView: NodeView = {
    label: "Bob",
    pubkey: bob.identity.publicKeyHex,
    strategy: bob.strategy.meta.name,
    peerLabels: new Map([[alice.identity.publicKeyHex, "Alice"]]),
    subscribe: (cb) => {
      bob.log.on("event", cb);
      return () => bob.log.off("event", cb);
    },
  };

  // Background loops that produce traffic for the demo.
  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    try { await alice.gossip.stop(); } catch { /* ignore */ }
    try { await bob.gossip.stop(); } catch { /* ignore */ }
    try { await alice.cleanupTmp(); } catch { /* ignore */ }
    try { await bob.cleanupTmp(); } catch { /* ignore */ }
  };
  process.on("SIGINT", () => void stop().then(() => process.exit(0)));
  process.on("SIGTERM", () => void stop().then(() => process.exit(0)));

  // Forecast loops — independent ticks per side so they don't lock-step.
  let aliceTickN = 0;
  const aliceLoop = setInterval(async () => {
    if (stopping) return;
    aliceTickN++;
    await produceForecast(alice, aliceTickN).catch(() => {});
  }, tickMs);

  let bobTickN = 0;
  const bobLoop = setInterval(async () => {
    if (stopping) return;
    bobTickN++;
    await produceForecast(bob, bobTickN).catch(() => {});
  }, tickMs + 700); // offset so events don't all land at the same instant

  // Auto-share: alternate sides so the audience sees gossip flow both ways.
  let shareN = 0;
  const shareLoop = setInterval(async () => {
    if (stopping) return;
    shareN++;
    const side = shareN % 2 === 1 ? alice : bob;
    const candidate = pickShareCandidate(eligible, side.strategy);
    if (candidate) await shareStrategy(side, candidate);
  }, shareEverySec * 1000);

  const onShareRandom = async (): Promise<{ side: "alice" | "bob"; name: string } | null> => {
    const side = Math.random() < 0.5 ? alice : bob;
    const candidate = pickShareCandidate(eligible, side.strategy);
    if (!candidate) return null;
    await shareStrategy(side, candidate);
    return { side: side.label === "Alice" ? "alice" : "bob", name: candidate.meta.name };
  };

  // Render the UI.
  const inkInstance = render(
    React.createElement(DemoScreen, {
      alice: aliceView,
      bob: bobView,
      onShareRandom,
      onQuit: () => {
        clearInterval(aliceLoop);
        clearInterval(bobLoop);
        clearInterval(shareLoop);
        void stop();
      },
    }),
  );

  // Optional auto-exit after duration.
  if (durationSec) {
    setTimeout(async () => {
      clearInterval(aliceLoop);
      clearInterval(bobLoop);
      clearInterval(shareLoop);
      await stop();
      inkInstance.unmount();
      process.exit(0);
    }, durationSec * 1000);
  }

  await inkInstance.waitUntilExit();
  await stop();
}

async function buildPipeline(
  label: string,
  strategy: LoadedStrategy,
  broker: InMemoryBroker,
): Promise<Pipeline> {
  // Each pipeline gets its own ephemeral identity + tmp event log so the demo
  // never touches the operator's real ~/.sibyl state.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `sibyl-demo-${label.toLowerCase()}-`));
  const pem = path.join(tmp, "id.pem");
  await generateAndSaveKey(pem);
  const identity = await loadIdentity(pem);

  const client = new MockAxlClient({
    selfPubkey: identity.publicKeyHex,
    peers: [], // wired up by caller after both pipelines exist
    broker,
  });

  // GossipNode logs go nowhere by default — the demo UI is the channel.
  const gossip = new GossipNode({
    client: client as unknown as import("../axl/client.ts").AxlClient,
    identity,
    recvIdleMs: 50,
    topologyRefreshMs: 60_000,
    log: () => {},
  });

  const log = new EventLog(path.join(tmp, "events.jsonl"));
  await log.ensureDir();

  return {
    label,
    identity,
    client,
    gossip,
    log,
    source: new MockMarketSource(),
    strategy,
    cleanupTmp: async () => {
      await fs.rm(tmp, { recursive: true, force: true });
    },
  };
}

async function produceForecast(p: Pipeline, tickN: number): Promise<void> {
  const markets = await p.source.listMarkets({ status: "open", limit: 10 });
  if (markets.length === 0) return;
  const market: Market = markets[tickN % markets.length]!;
  const evidence = await p.source.getEvidence(market);
  const { forecast } = await runForecast(p.strategy, market, evidence);

  const env = buildEnvelope(p.identity, {
    type: "forecast",
    body: {
      strategyName: p.strategy.meta.name,
      strategyHash: p.strategy.contentHash,
      strategyAuthor: p.identity.publicKeyHex,
      marketId: market.id,
      marketSnapshot: {
        question: market.question,
        currentPrices: market.currentPrices,
        historyLength: market.history.length,
      },
      outcomeIdx: forecast.outcomeIdx ?? 0,
      probability: forecast.probability,
      confidence: forecast.confidence,
      stakeUsd: forecast.stakeUsd,
      reasoning: forecast.reasoning,
    },
  });
  await p.log.append(env);
}

async function shareStrategy(p: Pipeline, candidate: LoadedStrategy): Promise<void> {
  const raw = await fs.readFile(candidate.filePath);
  const env = buildEnvelope(p.identity, {
    type: "strategy_publish",
    body: {
      name: candidate.meta.name,
      version: candidate.meta.version,
      authorHandle: candidate.meta.authorHandle,
      contentHash: candidate.contentHash,
      contentB64: raw.toString("base64"),
      sizeBytes: raw.byteLength,
      ...(candidate.meta.ree
        ? { declaresRee: { model: candidate.meta.ree.model, operationSet: candidate.meta.ree.operationSet } }
        : {}),
    },
  });
  await p.log.append(env);
  await p.gossip.publish(env);
}

function pickShareCandidate(all: LoadedStrategy[], notThis: LoadedStrategy): LoadedStrategy | null {
  const others = all.filter((s) => s.meta.name !== notThis.meta.name);
  if (others.length === 0) return null;
  return others[Math.floor(Math.random() * others.length)] ?? null;
}
