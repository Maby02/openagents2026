import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildEnvelope } from "../src/envelopes.ts";
import { loadAllStrategies, runForecast, meetsEnvRequirements } from "../src/executor.ts";
import { generateAndSaveKey, loadIdentity } from "../src/identity.ts";
import { EventLog } from "../src/log.ts";
import { MockMarketSource } from "../src/markets/mock.ts";
import { startObserver } from "../src/observer.ts";

const tmp = path.join(os.tmpdir(), `sibyl-c-test-${process.pid}`);
await fs.mkdir(tmp, { recursive: true });
const pem = path.join(tmp, "id.pem");
await generateAndSaveKey(pem);
const identity = await loadIdentity(pem);

// 1. Discover and load bundled strategies.
const stratDir = path.resolve("strategies");
const { strategies, issues } = await loadAllStrategies(stratDir);
console.log(`loaded ${strategies.length} strategies from ${stratDir}`);
for (const s of strategies) console.log(`  - ${s.meta.name} v${s.meta.version} (${s.contentHash.slice(0, 12)}…)`);
for (const i of issues) console.log(`  ! ${i.filePath}: ${i.reason}`);
if (strategies.length < 2) {
  console.error("FAIL: expected at least simple_momentum and mean_reversion to load");
  process.exit(1);
}

// 2. llm_headline must declare requiresEnv=["OPENAI_API_KEY"] and be marked unmet
//    (assuming no key is set during the test).
const llm = strategies.find((s) => s.meta.name === "llm-headline");
if (!llm) {
  console.error("FAIL: llm-headline didn't load");
  process.exit(1);
}
const wasUnset = !process.env.OPENAI_API_KEY;
if (wasUnset && meetsEnvRequirements(llm.meta)) {
  console.error("FAIL: llm-headline should be marked unmet without OPENAI_API_KEY");
  process.exit(1);
}
console.log(`llm-headline env gating OK (set=${!wasUnset})`);

// 3. Run a forecast through one of the rule-based strategies.
const sm = strategies.find((s) => s.meta.name === "simple-momentum");
if (!sm) {
  console.error("FAIL: simple-momentum didn't load");
  process.exit(1);
}
const src = new MockMarketSource();
// Tick a few times to build history.
for (let i = 0; i < 35; i++) await src.listMarkets();
const market = (await src.listMarkets({ status: "open" }))[0]!;
const evidence = await src.getEvidence(market);
const result = await runForecast(sm, market, evidence);
console.log(`forecast: p=${result.forecast.probability.toFixed(2)} stake=$${result.forecast.stakeUsd.toFixed(2)} (${result.durationMs}ms)`);

// 4. Append a forecast envelope to the log, verify it lands as JSONL.
const logPath = path.join(tmp, "events.jsonl");
const log = new EventLog(logPath);
await log.ensureDir();

const env = buildEnvelope(identity, {
  type: "forecast",
  body: {
    strategyName: sm.meta.name,
    strategyHash: sm.contentHash,
    strategyAuthor: identity.publicKeyHex,
    marketId: market.id,
    marketSnapshot: { question: market.question, currentPrices: market.currentPrices, historyLength: market.history.length },
    outcomeIdx: result.forecast.outcomeIdx ?? 0,
    probability: result.forecast.probability,
    confidence: result.forecast.confidence,
    stakeUsd: result.forecast.stakeUsd,
    reasoning: result.forecast.reasoning,
  },
});

await log.append(env);
const lines = (await fs.readFile(logPath, "utf8")).trim().split("\n");
if (lines.length !== 1) {
  console.error(`FAIL: expected 1 line in log, got ${lines.length}`);
  process.exit(1);
}
const parsed = JSON.parse(lines[0]!);
if (parsed.type !== "forecast" || parsed.from !== identity.publicKeyHex) {
  console.error("FAIL: log line shape wrong");
  process.exit(1);
}
console.log("log append + JSONL shape OK");

// 5. SSE end-to-end: start observer, subscribe with raw fetch, see one event.
const port = 19800 + (process.pid % 100);
const observer = await startObserver({ port, log });
console.log(`observer up at ${observer.url}`);

const received: string[] = [];
const sseDone = (async () => {
  const res = await fetch(`${observer.url}/events`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (received.length < 1) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) received.push(line.slice("data: ".length));
    }
  }
  reader.cancel();
})();

// Give the SSE client a moment to attach before we fire the event.
await new Promise((r) => setTimeout(r, 200));
const env2 = buildEnvelope(identity, {
  type: "forecast",
  body: {
    strategyName: sm.meta.name,
    strategyHash: sm.contentHash,
    strategyAuthor: identity.publicKeyHex,
    marketId: market.id,
    marketSnapshot: { question: market.question, currentPrices: market.currentPrices, historyLength: market.history.length },
    outcomeIdx: 0,
    probability: 0.6,
    confidence: 0.5,
    stakeUsd: 5,
    reasoning: "second event for SSE test",
  },
});
await log.append(env2);
await Promise.race([sseDone, new Promise((_r, rej) => setTimeout(() => rej(new Error("SSE timeout")), 3000))]);

if (received.length === 0) {
  console.error("FAIL: SSE client did not receive event");
  process.exit(1);
}
const sseParsed = JSON.parse(received[0]!);
if (sseParsed.type !== "forecast" || sseParsed.body.reasoning !== "second event for SSE test") {
  console.error(`FAIL: SSE payload mismatch — got ${received[0]}`);
  process.exit(1);
}
console.log("SSE delivery OK");

// 6. /events/history returns the persisted events.
const histRes = await fetch(`${observer.url}/events/history`);
const hist = (await histRes.json()) as { events: any[] };
if (hist.events.length !== 2) {
  console.error(`FAIL: expected 2 historical events, got ${hist.events.length}`);
  process.exit(1);
}
console.log(`history endpoint OK (${hist.events.length} events)`);

await observer.close();
await fs.rm(tmp, { recursive: true, force: true });
console.log("\nEXECUTOR + LOG + SSE OK");
