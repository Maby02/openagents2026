import { promises as fs } from "node:fs";
import { execa, type ResultPromise } from "execa";
import { AxlClient } from "./client.ts";

export interface AxlNodeOptions {
  binaryPath: string;
  configPath: string;
  privateKeyPath: string;
  apiPort: number;
  tcpPort: number;
  peers?: string[];
  // TLS endpoints this node should accept inbound peers on, e.g.
  // ["tls://127.0.0.1:9101"]. Default empty (leaf node — only dials).
  // Two AXL nodes on one machine: one listens, the other dials.
  listen?: string[];
  // When true, the AXL subprocess inherits stdout/stderr instead of being piped
  // to a tagged logger. Useful for the demo screen which wants raw streams.
  inheritStdio?: boolean;
}

export interface AxlNodeHandle {
  apiPort: number;
  publicKeyHex: string;
  client: AxlClient;
  stop: () => Promise<void>;
}

async function writeConfig(opts: AxlNodeOptions): Promise<void> {
  const config: Record<string, unknown> = {
    PrivateKeyPath: opts.privateKeyPath,
    Peers: opts.peers ?? [],
    Listen: opts.listen ?? [],
    api_port: opts.apiPort,
    tcp_port: opts.tcpPort,
  };
  await fs.writeFile(opts.configPath, JSON.stringify(config, null, 2) + "\n");
}

export async function startAxlNode(opts: AxlNodeOptions): Promise<AxlNodeHandle> {
  await writeConfig(opts);

  const client = new AxlClient(opts.apiPort);
  if (await client.ping(500)) {
    throw new Error(
      `port :${opts.apiPort} is already responding to /topology — another AXL node is running. Try \`sibyl stop\`.`,
    );
  }

  const child: ResultPromise = execa(opts.binaryPath, ["-config", opts.configPath], {
    stdout: opts.inheritStdio ? "inherit" : "pipe",
    stderr: opts.inheritStdio ? "inherit" : "pipe",
    cleanup: true,
    // SIGTERM first; if the AXL node hasn't exited within 3s, follow with SIGKILL.
    forceKillAfterDelay: 3000,
  });

  const state = { stopped: false };

  if (!opts.inheritStdio) {
    child.stdout?.on("data", (chunk: Buffer) => {
      process.stderr.write(prefix("axl-out", chunk));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(prefix("axl-err", chunk));
    });
  }

  // Detect early death: if the child exits before /topology comes up, fail loudly.
  const earlyExit = (async () => {
    try {
      const result = await child;
      if (state.stopped) return null;
      throw new Error(`AXL node exited unexpectedly with code ${result.exitCode}`);
    } catch (err) {
      if (state.stopped) return null;
      throw err instanceof Error ? err : new Error(String(err));
    }
  })();

  const ready = pollUntil(
    async () => {
      try {
        const t = await client.getTopology(800);
        return t.our_public_key;
      } catch {
        return null;
      }
    },
    { totalMs: 15_000, intervalMs: 250 },
  );

  let pubkey: string;
  try {
    pubkey = (await Promise.race([ready, earlyExit])) as string;
    if (!pubkey) throw new Error("AXL node failed to start (no pubkey returned)");
  } catch (err) {
    state.stopped = true;
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore — already dead
    }
    throw err;
  }

  return {
    apiPort: opts.apiPort,
    publicKeyHex: pubkey,
    client,
    stop: async () => {
      if (state.stopped) return;
      state.stopped = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore — already terminating
      }
      try {
        await child;
      } catch {
        // expected when we asked it to stop
      }
    },
  };
}

async function pollUntil<T>(
  fn: () => Promise<T | null>,
  opts: { totalMs: number; intervalMs: number },
): Promise<T> {
  const deadline = Date.now() + opts.totalMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v !== null && v !== undefined) return v;
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  throw new Error(`AXL node did not become ready within ${opts.totalMs}ms`);
}

function prefix(tag: string, chunk: Buffer): string {
  const lines = chunk.toString().split("\n");
  return lines
    .map((l, i) => (i === lines.length - 1 && l === "" ? "" : `[${tag}] ${l}\n`))
    .join("");
}
