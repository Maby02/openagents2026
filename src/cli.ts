import { Command } from "commander";
import * as path from "node:path";
import { existsSync } from "node:fs";
import { runInit } from "./commands/init.ts";
import { runStatus } from "./commands/status.ts";
import { runStop } from "./commands/stop.ts";
import { runRun } from "./commands/run.ts";
import { runExport } from "./commands/export.ts";
import { runShare } from "./commands/share.ts";
import { runList } from "./commands/list.ts";
import { runDemo } from "./commands/demo.ts";

// Auto-load .env from the current working directory if it's there. Silent if absent.
const envPath = path.resolve(".env");
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // file present but unreadable — ignore; status command will surface missing keys
  }
}

const program = new Command();

program
  .name("sibyl")
  .description("Permissionless network for AI trading agents on Delphi prediction markets.")
  .version("0.0.1");

program
  .command("init")
  .description("Generate identity, write AXL node config, scaffold local dirs.")
  .action(async () => {
    try {
      await runInit();
    } catch (err) {
      console.error(`init failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show identity, AXL binary, and node state.")
  .action(async () => {
    try {
      await runStatus();
    } catch (err) {
      console.error(`status failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("stop")
  .description("Stop the AXL node and free its API port.")
  .action(async () => {
    try {
      await runStop();
    } catch (err) {
      console.error(`stop failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

const stub = (name: string, phase: string, summary: string) =>
  program
    .command(name)
    .description(`${summary}  (lands in ${phase})`)
    .action(() => {
      console.error(`'${name}' is not wired up yet — coming in ${phase}.`);
      process.exit(1);
    });

program
  .command("run")
  .description("Run a strategy loop against a market source.")
  .option("--mode <mode>", "market source: 'mock' (offline) or 'real' (Delphi testnet, Phase F)", "mock")
  .option("--tick-ms <ms>", "milliseconds between forecast ticks", (v) => parseInt(v, 10), 5000)
  .option("--strategy <name>", "strategy name to run (default: first eligible)")
  .option(
    "--observe-port <port>",
    "SSE port for the observer feed (default: $SIBYL_OBSERVE_PORT or 9099)",
    (v) => parseInt(v, 10),
  )
  .action(async (opts: { mode: string; tickMs: number; strategy?: string; observePort?: number }) => {
    if (opts.mode !== "mock" && opts.mode !== "real") {
      console.error(`unknown --mode '${opts.mode}', expected 'mock' or 'real'`);
      process.exit(1);
    }
    try {
      await runRun({
        mode: opts.mode,
        tickMs: opts.tickMs,
        strategy: opts.strategy,
        observePort: opts.observePort,
      });
    } catch (err) {
      console.error(`run failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("export")
  .description("Dump signed events.jsonl to stdout (JSONL).")
  .option("--type <type>", "filter by envelope type (forecast|strategy_publish|trade_receipt|outcome)")
  .option("--since <iso>", "include only events with ts >= this ISO timestamp")
  .option("--verify", "verify signatures (skips bad-sig events; reports count to stderr)")
  .option("--pretty", "pretty-print each event")
  .action(async (opts: { type?: string; since?: string; verify?: boolean; pretty?: boolean }) => {
    const validTypes = ["forecast", "strategy_publish", "trade_receipt", "outcome"];
    if (opts.type && !validTypes.includes(opts.type)) {
      console.error(`unknown --type '${opts.type}'. Valid: ${validTypes.join(", ")}`);
      process.exit(1);
    }
    try {
      await runExport({
        type: opts.type as any,
        since: opts.since,
        verify: opts.verify,
        pretty: opts.pretty,
      });
    } catch (err) {
      console.error(`export failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("share <strategy-file>")
  .description("Gossip a strategy file (.ts) to peers via a running `sibyl run`.")
  .option("--observer-url <url>", "where the running sibyl process is listening")
  .action(async (file: string, opts: { observerUrl?: string }) => {
    try {
      await runShare({ filePath: file, observerUrl: opts.observerUrl });
    } catch (err) {
      console.error(`share failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("list")
  .description("Show strategies this node has seen via gossip.")
  .action(async () => {
    try {
      await runList();
    } catch (err) {
      console.error(`list failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("demo")
  .description("Two-node offline walkthrough — virtual mesh, no AXL binary required.")
  .option("--duration <seconds>", "auto-exit after this many seconds (default: run until 'q')", (v) => parseInt(v, 10))
  .option("--tick-ms <ms>", "milliseconds between forecast ticks", (v) => parseInt(v, 10), 2000)
  .option("--share-every <seconds>", "auto-share a strategy this often", (v) => parseInt(v, 10), 12)
  .action(async (opts: { duration?: number; tickMs: number; shareEvery: number }) => {
    try {
      await runDemo({
        durationSec: opts.duration,
        tickMs: opts.tickMs,
        shareEverySec: opts.shareEvery,
      });
    } catch (err) {
      console.error(`demo failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

stub("verify", "Phase I", "Re-run an REE receipt to confirm reproducibility");

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
