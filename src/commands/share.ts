import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { observePort, resolvePaths } from "../config.ts";
import { buildEnvelope } from "../envelopes.ts";
import { loadStrategy } from "../executor.ts";
import { loadIdentity } from "../identity.ts";

const MAX_STRATEGY_BYTES = 100_000;

export interface ShareOptions {
  filePath: string;
  observerUrl?: string;
}

export async function runShare(opts: ShareOptions): Promise<void> {
  const filePath = path.resolve(opts.filePath);
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    console.error(`not a file: ${filePath}`);
    process.exit(1);
  }
  if (stat.size > MAX_STRATEGY_BYTES) {
    console.error(`strategy too large (${stat.size} bytes; limit ${MAX_STRATEGY_BYTES})`);
    process.exit(1);
  }

  // Validate (parses, checks meta, runs smoke test).
  const loaded = await loadStrategy(filePath).catch((err) => {
    console.error(`strategy invalid: ${(err as Error).message}`);
    process.exit(1);
  });
  if (!loaded) return; // unreachable; satisfies the type checker

  const raw = await fs.readFile(filePath);
  const contentHash = createHash("sha256").update(raw).digest("hex");
  if (contentHash !== loaded.contentHash) {
    console.error("contentHash mismatch — file changed during share?");
    process.exit(1);
  }
  const contentB64 = raw.toString("base64");

  const paths = resolvePaths();
  const identity = await loadIdentity(paths.privateKey).catch((err) => {
    console.error(`identity: ${(err as Error).message}. Run \`sibyl init\`.`);
    process.exit(1);
  });
  if (!identity) return;

  const envelope = buildEnvelope(identity, {
    type: "strategy_publish",
    body: {
      name: loaded.meta.name,
      version: loaded.meta.version,
      authorHandle: loaded.meta.authorHandle,
      contentHash,
      contentB64,
      sizeBytes: raw.byteLength,
      ...(loaded.meta.ree
        ? { declaresRee: { model: loaded.meta.ree.model, operationSet: loaded.meta.ree.operationSet } }
        : {}),
    },
  });

  const observerUrl = opts.observerUrl ?? `http://127.0.0.1:${observePort()}`;
  let res: Response;
  try {
    res = await fetch(`${observerUrl}/control/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envelope }),
    });
  } catch (err) {
    console.error(`could not reach a running sibyl process at ${observerUrl}.`);
    console.error("Start one in another terminal:");
    console.error("  sibyl run --mode mock");
    console.error(`(error: ${(err as Error).message})`);
    process.exit(1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>");
    console.error(`publish rejected (${res.status}): ${text}`);
    process.exit(1);
  }

  const result = (await res.json()) as { msgId: string; summary: string };
  console.log(`shared ${loaded.meta.name} v${loaded.meta.version}`);
  console.log(`  hash:    ${contentHash}`);
  console.log(`  size:    ${raw.byteLength} bytes`);
  console.log(`  msgId:   ${result.msgId}`);
  console.log(`  result:  ${result.summary}`);
}
