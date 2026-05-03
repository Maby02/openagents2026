import { promises as fs } from "node:fs";
import { constants as fsConstants } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execa } from "execa";

export interface Paths {
  home: string;             // ~/.sibyl  (or $SIBYL_HOME)
  privateKey: string;       // ~/.sibyl/private.pem
  axlConfig: string;        // ~/.sibyl/node-config.json
  strategiesDir: string;    // ./strategies  (relative to cwd)
  dataDir: string;          // ./data        (relative to cwd)
  eventsLog: string;        // ./data/events.jsonl
}

export function resolvePaths(): Paths {
  const home = process.env.SIBYL_HOME ?? path.join(os.homedir(), ".sibyl");
  const cwd = process.cwd();
  return {
    home,
    privateKey: path.join(home, "private.pem"),
    axlConfig: path.join(home, "node-config.json"),
    strategiesDir: path.join(cwd, "strategies"),
    dataDir: path.join(cwd, "data"),
    eventsLog: path.join(cwd, "data", "events.jsonl"),
  };
}

export function axlApiPort(): number {
  const raw = process.env.SIBYL_AXL_API_PORT ?? "9002";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`invalid SIBYL_AXL_API_PORT: ${raw}`);
  return n;
}

export function axlTcpPort(): number {
  const raw = process.env.SIBYL_AXL_TCP_PORT ?? "7000";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`invalid SIBYL_AXL_TCP_PORT: ${raw}`);
  return n;
}

export function observePort(): number {
  // PORT is the standard env var on Railway / Heroku / Render — fall back to it
  // so a hosted operator picks up the platform-assigned port without manual config.
  const raw = process.env.SIBYL_OBSERVE_PORT ?? process.env.PORT ?? "9099";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`invalid observe port: ${raw}`);
  return n;
}

// AXL produces a binary literally named `node`, which collides with Node.js.
// Resolution order:
//   1. $SIBYL_AXL_BINARY (explicit path)
//   2. $SIBYL_HOME/node
//   3. `axl-node` on $PATH (if user renamed it)
export async function findAxlBinary(): Promise<string | null> {
  const candidates: string[] = [];
  if (process.env.SIBYL_AXL_BINARY) candidates.push(process.env.SIBYL_AXL_BINARY);
  candidates.push(path.join(resolvePaths().home, "node"));

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) return candidate;
  }

  try {
    const { stdout } = await execa("which", ["axl-node"], { reject: false });
    const trimmed = stdout.trim();
    if (trimmed && (await isExecutable(trimmed))) return trimmed;
  } catch {
    // ignore — `which` not available, no binary on PATH, etc.
  }

  return null;
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}
