"use client";

import { useMemo } from "react";
import type { Envelope, ForecastBody } from "@/lib/types";
import { shortHex } from "@/lib/format";

interface Props {
  events: Envelope[];
}

interface StrategySummary {
  name: string;
  hash: string;
  authorHandle: string | null;
  forecasts: number;
  buys: number;
  totalStake: number;
  authors: Set<string>;
  declaresRee: boolean;
}

export function StrategiesGrid({ events }: Props) {
  const top = useMemo(() => {
    const map = new Map<string, StrategySummary>();
    const handleByHash = new Map<string, string>();
    const reeByHash = new Map<string, boolean>();

    for (const env of events) {
      if (env.type === "strategy_publish") {
        handleByHash.set(env.body.contentHash, env.body.authorHandle);
        reeByHash.set(env.body.contentHash, !!env.body.declaresRee);
      }
    }

    for (const env of events) {
      if (env.type !== "forecast") continue;
      const body = env.body as ForecastBody;
      const key = `${body.strategyName}@${body.strategyHash}`;
      let s = map.get(key);
      if (!s) {
        s = {
          name: body.strategyName,
          hash: body.strategyHash,
          authorHandle: handleByHash.get(body.strategyHash) ?? null,
          forecasts: 0,
          buys: 0,
          totalStake: 0,
          authors: new Set(),
          declaresRee: reeByHash.get(body.strategyHash) ?? false,
        };
        map.set(key, s);
      }
      s.forecasts += 1;
      s.totalStake += body.stakeUsd;
      if (body.stakeUsd > 0) s.buys += 1;
      s.authors.add(body.strategyAuthor);
    }
    return [...map.values()].sort((a, b) => b.forecasts - a.forecasts).slice(0, 6);
  }, [events]);

  const maxForecasts = top.reduce((m, s) => Math.max(m, s.forecasts), 1);

  return (
    <section className="rounded-md border border-ink-800 bg-ink-925 overflow-hidden">
      <header className="px-5 py-3.5 border-b border-ink-800 flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-wider2 text-ink-300">Active strategies</h2>
        <span className="text-[10px] text-ink-500">{top.length} on the mesh</span>
      </header>
      {top.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-500">
          No strategies have produced forecasts yet.
        </p>
      ) : (
        <ul>
          {top.map((s) => (
            <li
              key={`${s.name}-${s.hash}`}
              className="px-5 py-3 border-b border-ink-800/60 last:border-0 hover:bg-ink-900/60 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-mono text-sm text-ink-100 truncate">{s.name}</span>
                  {s.declaresRee && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-400/10 text-purple-300 border border-purple-400/20 font-mono uppercase tracking-wider2 shrink-0">
                      REE
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-ink-600 font-mono shrink-0">{shortHex(s.hash, 4)}</span>
              </div>
              <div className="flex items-baseline gap-3 text-[11px] text-ink-400 mb-2">
                {s.authorHandle && (
                  <span>
                    by <span className="text-ink-200">@{s.authorHandle}</span>
                  </span>
                )}
                <span>
                  <span className="text-ink-100 font-mono tabular-nums">{s.forecasts}</span> forecasts
                </span>
                <span>
                  <span className="text-accent font-mono tabular-nums">{s.buys}</span> buys
                </span>
                {s.authors.size > 1 && <span>{s.authors.size} operators</span>}
              </div>
              <div className="h-[3px] bg-ink-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent/70"
                  style={{ width: `${Math.max(8, (s.forecasts / maxForecasts) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
