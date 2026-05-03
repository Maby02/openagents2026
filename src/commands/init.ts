import { promises as fs } from "node:fs";
import * as path from "node:path";
import { findAxlBinary, resolvePaths, axlApiPort, axlTcpPort } from "../config.ts";
import { generateAndSaveKey, loadIdentity } from "../identity.ts";

export async function runInit(): Promise<void> {
  const paths = resolvePaths();

  await fs.mkdir(paths.home, { recursive: true });

  const keyExisted = await exists(paths.privateKey);
  if (!keyExisted) {
    await generateAndSaveKey(paths.privateKey);
    say(`generated ed25519 identity at ${paths.privateKey}`);
  } else {
    say(`identity already exists at ${paths.privateKey}`);
  }

  // node-config.json — only write if missing, never overwrite.
  if (!(await exists(paths.axlConfig))) {
    const axlConfig = {
      PrivateKeyPath: paths.privateKey,
      Peers: [],
      api_port: axlApiPort(),
      tcp_port: axlTcpPort(),
    };
    await fs.writeFile(paths.axlConfig, JSON.stringify(axlConfig, null, 2) + "\n");
    say(`wrote AXL node config at ${paths.axlConfig}`);
  } else {
    say(`AXL node config already exists at ${paths.axlConfig}`);
  }

  await fs.mkdir(paths.strategiesDir, { recursive: true });
  await fs.mkdir(paths.dataDir, { recursive: true });
  say(`strategies dir: ${paths.strategiesDir}`);
  say(`data dir:       ${paths.dataDir}`);

  const identity = await loadIdentity(paths.privateKey);
  say(`your peer id:   ${identity.publicKeyHex}`);

  const axl = await findAxlBinary();
  if (axl) {
    say(`AXL binary:     ${axl}`);
  } else {
    console.log("");
    console.log("AXL binary not found. To use sibyl beyond `init`/`status` you need to build it:");
    console.log("");
    console.log("  git clone https://github.com/gensyn-ai/axl.git");
    console.log(`  cd axl && GOTOOLCHAIN=go1.25.5 go build -o ${path.join(paths.home, "node")} ./cmd/node/`);
    console.log("");
    console.log("Or set SIBYL_AXL_BINARY in your .env to point at an existing build.");
  }

  console.log("");
  if (!(await exists(path.resolve(".env")))) {
    console.log("Next: copy .env.example to .env and fill in WALLET_PRIVATE_KEY + DELPHI_API_ACCESS_KEY.");
  } else {
    console.log("Next: make sure .env has WALLET_PRIVATE_KEY and DELPHI_API_ACCESS_KEY set.");
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function say(line: string): void {
  console.log(`  ${line}`);
}
