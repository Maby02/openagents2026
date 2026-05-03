import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Envelope } from "./envelopes.ts";

export interface EventLogEvents {
  event: (envelope: Envelope) => void;
}

// Append-only writer for events.jsonl. Serializes concurrent appends through an
// internal promise chain so the file always contains valid lines, even under
// bursty produce-rates. Subscribers (the SSE observer, the run UI) attach via
// .on("event", ...).
export class EventLog extends EventEmitter {
  private chain: Promise<void> = Promise.resolve();

  constructor(public readonly filePath: string) {
    super();
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  async append(envelope: Envelope): Promise<void> {
    const line = JSON.stringify(envelope) + "\n";
    this.chain = this.chain.then(async () => {
      await fs.appendFile(this.filePath, line);
    });
    await this.chain;
    this.emit("event", envelope);
  }

  // Read all historical events. Used by `sibyl export` and (later) the
  // observer's /events/history endpoint.
  async *replay(opts?: { since?: string; type?: Envelope["type"] }): AsyncIterable<Envelope> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
    for (const line of raw.split("\n")) {
      if (!line) continue;
      let env: Envelope;
      try {
        env = JSON.parse(line) as Envelope;
      } catch {
        continue;
      }
      if (opts?.since && env.ts < opts.since) continue;
      if (opts?.type && env.type !== opts.type) continue;
      yield env;
    }
  }
}
