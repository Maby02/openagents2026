import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execa } from "execa";
import { AxlClient } from "../src/axl/client.ts";
import { GossipNode } from "../src/axl/gossip.ts";
import { buildEnvelope, type Envelope } from "../src/envelopes.ts";
import { generateAndSaveKey, loadIdentity } from "../src/identity.ts";

const tmp = path.join(os.tmpdir(), `sibyl-gossip-test-${process.pid}`);
await fs.mkdir(tmp, { recursive: true });

// Two identities ↔ two fake-axl processes ↔ two GossipNodes.
const aliceKey = path.join(tmp, "alice.pem");
const bobKey = path.join(tmp, "bob.pem");
await generateAndSaveKey(aliceKey);
await generateAndSaveKey(bobKey);
const alice = await loadIdentity(aliceKey);
const bob = await loadIdentity(bobKey);

const aliceCfg = path.join(tmp, "alice.json");
const bobCfg = path.join(tmp, "bob.json");
const aliceApi = 19200 + (process.pid % 100);
const bobApi = aliceApi + 100;
await fs.writeFile(aliceCfg, JSON.stringify({ api_port: aliceApi, tcp_port: aliceApi + 1000 }));
await fs.writeFile(bobCfg, JSON.stringify({ api_port: bobApi, tcp_port: bobApi + 1000 }));

const fakeBin = path.resolve("tests/fixtures/fake-axl.mjs");

const aliceProc = execa(fakeBin, ["-config", aliceCfg], {
  env: {
    FAKE_AXL_PUBKEY: alice.publicKeyHex,
    FAKE_AXL_PEERS_JSON: JSON.stringify([bob.publicKeyHex]),
    FAKE_AXL_PEER_BRIDGE_JSON: JSON.stringify({ [bob.publicKeyHex]: `http://127.0.0.1:${bobApi}` }),
  },
  stdout: "pipe",
  stderr: "pipe",
});
const bobProc = execa(fakeBin, ["-config", bobCfg], {
  env: {
    FAKE_AXL_PUBKEY: bob.publicKeyHex,
    FAKE_AXL_PEERS_JSON: JSON.stringify([alice.publicKeyHex]),
    FAKE_AXL_PEER_BRIDGE_JSON: JSON.stringify({ [alice.publicKeyHex]: `http://127.0.0.1:${aliceApi}` }),
  },
  stdout: "pipe",
  stderr: "pipe",
});
aliceProc.stdout?.on("data", (c) => process.stderr.write(`[a-out] ${c}`));
aliceProc.stderr?.on("data", (c) => process.stderr.write(`[a-err] ${c}`));
bobProc.stdout?.on("data", (c) => process.stderr.write(`[b-out] ${c}`));
bobProc.stderr?.on("data", (c) => process.stderr.write(`[b-err] ${c}`));

// Wait for both to be reachable.
const aliceClient = new AxlClient(aliceApi);
const bobClient = new AxlClient(bobApi);
for (let i = 0; i < 40; i++) {
  if ((await aliceClient.ping()) && (await bobClient.ping())) break;
  await new Promise((r) => setTimeout(r, 100));
}

const aliceGossip = new GossipNode({
  client: aliceClient,
  identity: alice,
  recvIdleMs: 50,
  topologyRefreshMs: 60_000,
  log: (level, msg) => process.stderr.write(`[alice-gos:${level}] ${msg}\n`),
});
const bobGossip = new GossipNode({
  client: bobClient,
  identity: bob,
  recvIdleMs: 50,
  topologyRefreshMs: 60_000,
  log: (level, msg) => process.stderr.write(`[bob-gos:${level}] ${msg}\n`),
});

const bobReceived: Envelope[] = [];
bobGossip.on("event", (e: Envelope) => bobReceived.push(e));

await aliceGossip.start();
await bobGossip.start();
await new Promise((r) => setTimeout(r, 200));

if (aliceGossip.knownPeers.length === 0) {
  console.error(`FAIL: alice sees no peers (expected 1: ${bob.publicKeyHex.slice(0, 16)}…)`);
  process.exit(1);
}
console.log(`alice knows ${aliceGossip.knownPeers.length} peer(s)`);

// Alice publishes a strategy_publish envelope.
const env = buildEnvelope(alice, {
  type: "strategy_publish",
  body: {
    name: "test-strategy",
    version: "0.1.0",
    authorHandle: "alice",
    contentHash: "ab".repeat(32),
    contentB64: "Zm9v", // "foo"
    sizeBytes: 3,
  },
});
console.log(`alice publishing msgId=${env.sig.slice(0, 16)}…`);
await aliceGossip.publish(env);

// Wait for Bob to receive it via his /recv loop.
const deadline = Date.now() + 4000;
while (Date.now() < deadline && bobReceived.length === 0) {
  await new Promise((r) => setTimeout(r, 100));
}

if (bobReceived.length !== 1) {
  console.error(`FAIL: bob received ${bobReceived.length} envelope(s), expected 1`);
  await cleanup();
  process.exit(1);
}
const got = bobReceived[0]!;
if (got.sig !== env.sig) {
  console.error(`FAIL: signature mismatch on received envelope`);
  await cleanup();
  process.exit(1);
}
if (got.from !== alice.publicKeyHex) {
  console.error(`FAIL: 'from' field mismatch: got ${got.from}, expected ${alice.publicKeyHex}`);
  await cleanup();
  process.exit(1);
}
console.log(`bob received envelope from alice — sig matches, from matches`);

// Re-publish the same envelope — Bob's mcache must dedupe (no duplicate emit).
const before = bobReceived.length;
await aliceGossip.publish(env);
await new Promise((r) => setTimeout(r, 400));
if (bobReceived.length !== before) {
  console.error(`FAIL: bob received duplicate (${bobReceived.length - before} extra)`);
  await cleanup();
  process.exit(1);
}
console.log(`mcache dedup OK (no duplicate received on re-publish)`);

// Cleanup
await aliceGossip.stop();
await bobGossip.stop();
await cleanup();
console.log("\nGOSSIP OK");

async function cleanup(): Promise<void> {
  aliceProc.kill("SIGTERM");
  bobProc.kill("SIGTERM");
  try { await aliceProc; } catch { /* expected */ }
  try { await bobProc; } catch { /* expected */ }
  await fs.rm(tmp, { recursive: true, force: true });
}
