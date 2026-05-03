import { promises as fs } from "node:fs";
import axios from "axios";
import { axlApiPort, findAxlBinary, resolvePaths } from "../config.ts";
import { loadIdentity } from "../identity.ts";

interface TopologyResponse {
  our_public_key?: string;
  our_ipv6?: string;
  peers?: unknown[];
  tree?: unknown[];
}

export async function runStatus(): Promise<void> {
  const paths = resolvePaths();
  const port = axlApiPort();

  let identityLine = "identity:    not initialized — run `sibyl init`";
  if (await exists(paths.privateKey)) {
    try {
      const id = await loadIdentity(paths.privateKey);
      identityLine = `identity:    ready  (peer id ${id.publicKeyHex})`;
    } catch (err) {
      identityLine = `identity:    ERROR — ${(err as Error).message}`;
    }
  }

  const axl = await findAxlBinary();
  const axlLine = axl ? `axl binary:  ${axl}` : "axl binary:  not found  (see `sibyl init` output)";

  let nodeLine = `axl node:    not running on :${port}`;
  let walletLine: string | null = null;
  try {
    const res = await axios.get<TopologyResponse>(`http://127.0.0.1:${port}/topology`, { timeout: 1500 });
    const peers = Array.isArray(res.data.peers) ? res.data.peers.length : 0;
    const pk = res.data.our_public_key ?? "?";
    nodeLine = `axl node:    up on :${port}  (peers ${peers}, pubkey ${pk.slice(0, 16)}…)`;
  } catch {
    // node not up — leave default line
  }

  // Surface env presence (not values).
  const envPresent = (k: string) => (process.env[k] ? "set" : "missing");
  const envLine = [
    `wallet key:  ${envPresent("WALLET_PRIVATE_KEY")}`,
    `delphi key:  ${envPresent("DELPHI_API_ACCESS_KEY")}`,
    `openai key:  ${envPresent("OPENAI_API_KEY")} (optional)`,
  ].join("\n  ");

  console.log("");
  console.log("sibyl status");
  console.log("------------");
  console.log(`  ${identityLine}`);
  console.log(`  ${axlLine}`);
  console.log(`  ${nodeLine}`);
  console.log(`  ${envLine}`);
  console.log("");
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
