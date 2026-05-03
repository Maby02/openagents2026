import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildEnvelope, canonicalize, verifyEnvelope } from "../src/envelopes.ts";
import { generateAndSaveKey, loadIdentity } from "../src/identity.ts";

const pem = path.join(os.tmpdir(), `sibyl-env-test-${process.pid}.pem`);
await generateAndSaveKey(pem);
const identity = await loadIdentity(pem);

// 1. canonicalize is order-independent
const a = canonicalize({ b: 1, a: 2, c: { y: 1, x: 2 } });
const b = canonicalize({ a: 2, c: { x: 2, y: 1 }, b: 1 });
if (a !== b) {
  console.error(`FAIL: canonicalize is not order-stable\n  ${a}\n  ${b}`);
  process.exit(1);
}
console.log("canonicalize: order-stable OK");

// 2. forecast envelope round-trip
const env = buildEnvelope(identity, {
  type: "forecast",
  body: {
    strategyName: "simple-momentum",
    strategyHash: "ab".repeat(32),
    strategyAuthor: identity.publicKeyHex,
    marketId: "mock://market/btc-100k",
    marketSnapshot: { question: "Will BTC hit $100k?", currentPrices: [0.42, 0.58], historyLength: 60 },
    outcomeIdx: 0,
    probability: 0.62,
    confidence: 0.7,
    stakeUsd: 5,
    reasoning: "+3% momentum",
  },
});
console.log(`built envelope: type=${env.type} sig=${env.sig.slice(0, 16)}…`);

const ok = verifyEnvelope(env);
if (!ok.ok) {
  console.error(`FAIL: round-trip verify failed: ${ok.error}`);
  process.exit(1);
}
console.log("round-trip verify OK");

// 3. tampering detection — flip one byte in body, signature must fail
const tampered = JSON.parse(JSON.stringify(env)) as typeof env;
(tampered.body as any).probability = 0.99;
const tamperedResult = verifyEnvelope(tampered);
if (tamperedResult.ok) {
  console.error("FAIL: tampered envelope was accepted as valid");
  process.exit(1);
}
console.log(`tamper detection OK (rejected: ${tamperedResult.error})`);

// 4. schema rejection: probability out of range
let schemaCaught = false;
try {
  buildEnvelope(identity, {
    type: "forecast",
    body: {
      strategyName: "x",
      strategyHash: "ab".repeat(32),
      strategyAuthor: identity.publicKeyHex,
      marketId: "mock://m",
      marketSnapshot: { question: "x", currentPrices: [0.5, 0.5], historyLength: 0 },
      outcomeIdx: 0,
      probability: 1.5, // invalid
      confidence: 0.5,
      stakeUsd: 0,
      reasoning: "",
    },
  });
} catch (err) {
  schemaCaught = /probability/.test(String(err));
}
if (!schemaCaught) {
  console.error("FAIL: invalid probability not rejected at build");
  process.exit(1);
}
console.log("schema rejection OK");

// 5. signature from a different key must fail
const otherPem = path.join(os.tmpdir(), `sibyl-env-test2-${process.pid}.pem`);
await generateAndSaveKey(otherPem);
const otherIdentity = await loadIdentity(otherPem);
const wrongFrom = { ...env, from: otherIdentity.publicKeyHex } as typeof env;
const wrongResult = verifyEnvelope(wrongFrom);
if (wrongResult.ok) {
  console.error("FAIL: envelope with wrong 'from' was accepted");
  process.exit(1);
}
console.log("wrong-key rejection OK");

await fs.unlink(pem);
await fs.unlink(otherPem);
console.log("\nENVELOPES OK");
