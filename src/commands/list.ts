import { resolvePaths } from "../config.ts";
import { EventLog } from "../log.ts";
import type { Envelope, StrategyPublishBody } from "../envelopes.ts";

interface SeenStrategy {
  name: string;
  version: string;
  authorHandle: string;
  contentHash: string;
  fromPeer: string;
  firstSeen: string;
  count: number;
  declaresRee?: { model: string; operationSet: string };
}

export async function runList(): Promise<void> {
  const paths = resolvePaths();
  const log = new EventLog(paths.eventsLog);

  // Dedupe by contentHash so the same strategy gossiped 50 times collapses.
  const seen = new Map<string, SeenStrategy>();
  for await (const env of log.replay({ type: "strategy_publish" })) {
    const body = env.body as StrategyPublishBody;
    const existing = seen.get(body.contentHash);
    if (existing) {
      existing.count += 1;
      continue;
    }
    seen.set(body.contentHash, {
      name: body.name,
      version: body.version,
      authorHandle: body.authorHandle,
      contentHash: body.contentHash,
      fromPeer: env.from,
      firstSeen: env.ts,
      count: 1,
      declaresRee: body.declaresRee,
    });
  }

  if (seen.size === 0) {
    console.log("no strategies seen yet on this node's view of the mesh.");
    console.log("(strategy_publish envelopes show up here once gossip delivers them.)");
    return;
  }

  console.log("");
  console.log(`Strategies on this node's view of the mesh (${seen.size})`);
  console.log("".padEnd(60, "-"));
  const sorted = [...seen.values()].sort((a, b) => (a.firstSeen < b.firstSeen ? -1 : 1));
  for (const s of sorted) {
    const reeBadge = s.declaresRee ? ` [REE:${s.declaresRee.model}]` : "";
    console.log(`  ${s.name} v${s.version} (${s.contentHash.slice(0, 12)}…)${reeBadge}`);
    console.log(`    by @${s.authorHandle}  peer ${s.fromPeer.slice(0, 16)}…`);
    console.log(`    first seen ${s.firstSeen}, ${s.count} occurrence${s.count === 1 ? "" : "s"}`);
  }
  console.log("");
}
