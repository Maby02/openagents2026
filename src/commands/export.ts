import { resolvePaths } from "../config.ts";
import type { Envelope } from "../envelopes.ts";
import { verifyEnvelope } from "../envelopes.ts";
import { EventLog } from "../log.ts";

export interface ExportOptions {
  type?: Envelope["type"];
  since?: string;     // ISO timestamp
  verify?: boolean;   // verify signatures during export
  pretty?: boolean;   // pretty-print JSON (one event per stanza)
}

export async function runExport(opts: ExportOptions): Promise<void> {
  const paths = resolvePaths();
  const log = new EventLog(paths.eventsLog);

  let total = 0;
  let bad = 0;
  for await (const env of log.replay({ since: opts.since, type: opts.type })) {
    total += 1;
    if (opts.verify) {
      const r = verifyEnvelope(env);
      if (!r.ok) {
        bad += 1;
        process.stderr.write(`bad signature on ${env.type}@${env.ts}: ${r.error}\n`);
        continue;
      }
    }
    if (opts.pretty) {
      process.stdout.write(JSON.stringify(env, null, 2) + "\n");
    } else {
      process.stdout.write(JSON.stringify(env) + "\n");
    }
  }

  if (total === 0) {
    process.stderr.write(`no events at ${paths.eventsLog} (run \`sibyl run --mode mock\` first)\n`);
    process.exit(1);
  }
  if (opts.verify) {
    process.stderr.write(`exported ${total} events (${bad} signature failures)\n`);
  }
}
