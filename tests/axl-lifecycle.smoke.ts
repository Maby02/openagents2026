import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execa } from "execa";
import { startAxlNode } from "../src/axl/node.ts";
import { generateAndSaveKey } from "../src/identity.ts";

const tmp = path.join(os.tmpdir(), `sibyl-axl-test-${process.pid}`);
await fs.mkdir(tmp, { recursive: true });
const keyPath = path.join(tmp, "private.pem");
const cfgPath = path.join(tmp, "node-config.json");
await generateAndSaveKey(keyPath);

// Pick an unlikely-to-clash port.
const apiPort = 19000 + (process.pid % 1000);
const tcpPort = apiPort + 1000;

const fakeBinary = path.resolve("tests/fixtures/fake-axl.mjs");

console.log(`starting fake AXL on :${apiPort}...`);
const handle = await startAxlNode({
  binaryPath: fakeBinary,
  configPath: cfgPath,
  privateKeyPath: keyPath,
  apiPort,
  tcpPort,
  peers: [],
});
console.log(`up. pubkey=${handle.publicKeyHex}`);

if (handle.publicKeyHex.length !== 64) {
  console.error(`FAIL: expected 64-char pubkey, got ${handle.publicKeyHex.length}`);
  process.exit(1);
}

// Send a message — fake-axl should accept it.
await handle.client.sendTo("ab".repeat(32), Buffer.from("hello"));
console.log("sendTo ok");

// Verify topology is reachable.
const topo = await handle.client.getTopology();
if (!topo.our_public_key) {
  console.error("FAIL: topology missing our_public_key");
  process.exit(1);
}
console.log("topology ok");

// Stop and verify the port is freed.
console.log("stopping...");
await handle.stop();

// Brief wait to let OS release the port, then prove no zombie.
await new Promise((r) => setTimeout(r, 300));
const lsof = await execa("lsof", ["-ti", `:${apiPort}`], { reject: false });
if (lsof.stdout.trim()) {
  console.error(`FAIL: process still on :${apiPort}: ${lsof.stdout}`);
  process.exit(1);
}
console.log("port released, no zombies");

await fs.rm(tmp, { recursive: true, force: true });
console.log("\nAXL LIFECYCLE OK");
