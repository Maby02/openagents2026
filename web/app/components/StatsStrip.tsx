"use client";

import { useMemo } from "react";
import type { Envelope, ForecastBody } from "@/lib/types";

interface Props {
  events: Envelope[];
}

export function StatsStrip({ events }: Props) {
  const stats = useMemo(() => {
    let forecasts = 0;
    let buys = 0;
    let stake = 0;
    const strategies = new Set<string>();
    const peers = new Set<string>();
    const reasonings = new Set<string>();

    for (const e of events) {
      peers.add(e.from);
      if (e.type === "forecast") {
        forecasts += 1;
        const body = e.body as ForecastBody;
        if (body.stakeUsd > 0) buys += 1;
        stake += body.stakeUsd;
        strategies.add(`${body.strategyName}@${body.strategyHash}`);
        if (body.reasoning) reasonings.add(body.reasoning);
      }
      if (e.type === "strategy_publish") {
        strategies.add(e.body.contentHash);
      }
    }
    return {
      forecasts,
      strategies: strategies.size,
      stake,
      peers: peers.size,
      buys,
      uniqueReasonings: reasonings.size,
    };
  }, [events]);

  return (
    <section className="border-b border-ink-800">
      <div className="max-w-[1280px] mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-px bg-ink-800">
        <Stat label="forecasts" value={stats.forecasts} sub={`${stats.buys} buys`} />
        <Stat label="strategies" value={stats.strategies} sub="unique on the mesh" />
        <Stat
          label="stake at risk"
          value={`$${stats.stake.toFixed(2)}`}
          sub="declared in forecasts"
          mono
        />
        <Stat label="peers" value={stats.peers} sub="signing envelopes" accent />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  accent = false,
  mono = false,
}: {
  label: string;
  value: number | string;
  sub: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="bg-ink-950 px-5 py-5 flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-wider2 text-ink-400">{label}</div>
      <div
        className={`text-2xl md:text-[28px] tabular-nums ${
          accent ? "text-accent" : "text-ink-100"
        } ${mono ? "font-mono" : "font-mono"}`}
      >
        {value}
      </div>
      <div className="text-[11px] text-ink-400">{sub}</div>
    </div>
  );
}
