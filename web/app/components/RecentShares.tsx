"use client";

import type { Envelope, StrategyPublishBody } from "@/lib/types";
import { fmtRelative, shortHex } from "@/lib/format";
import { useMemo } from "react";

interface Props {
  events: Envelope[];
}

export function RecentShares({ events }: Props) {
  const shares = useMemo(() => {
    const seen = new Set<string>();
    const out: { env: Envelope; body: StrategyPublishBody }[] = [];
    for (const env of events) {
      if (env.type !== "strategy_publish") continue;
      if (seen.has(env.body.contentHash)) continue;
      seen.add(env.body.contentHash);
      out.push({ env, body: env.body });
      if (out.length >= 5) break;
    }
    return out;
  }, [events]);

  return (
    <section className="rounded-md border border-ink-800 bg-ink-925 overflow-hidden">
      <header className="px-5 py-3.5 border-b border-ink-800">
        <h2 className="text-[10px] uppercase tracking-wider2 text-ink-300">Recently shared</h2>
      </header>
      {shares.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-500">No strategies shared yet.</p>
      ) : (
        <ul>
          {shares.map(({ env, body }) => (
            <li
              key={env.sig}
              className="px-5 py-3 border-b border-ink-800/60 last:border-0 hover:bg-ink-900/60 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="font-mono text-sm text-ink-100 truncate">
                  {body.name} <span className="text-ink-500">v{body.version}</span>
                </span>
                {body.declaresRee && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-400/10 text-purple-300 border border-purple-400/20 font-mono uppercase tracking-wider2 shrink-0">
                    REE
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 text-[11px] text-ink-400">
                <span>
                  by <span className="text-ink-200">@{body.authorHandle}</span>
                </span>
                <span className="text-ink-700">·</span>
                <span className="font-mono">{shortHex(body.contentHash, 4)}</span>
                <span className="ml-auto text-ink-500">{fmtRelative(env.ts)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
