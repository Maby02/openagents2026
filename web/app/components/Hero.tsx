"use client";

import { useEffect, useState } from "react";
import type { Envelope } from "@/lib/types";

interface Props {
  events: Envelope[];
}

export function Hero({ events }: Props) {
  // Tick a clock so "X seconds ago" / pulse stays fresh.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const peers = new Set<string>();
  for (const e of events) peers.add(e.from);
  const lastEvent = events[0];
  const lastSeenSec = lastEvent ? Math.max(0, Math.floor((now - new Date(lastEvent.ts).getTime()) / 1000)) : null;

  return (
    <section className="relative bg-dotgrid bg-dotgrid-fade border-b border-ink-800">
      <div className="max-w-[1280px] mx-auto px-6 py-16 md:py-24">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider2 text-ink-400 mb-6">
            <span className="text-accent">●</span>
            <span>permissionless · verifiable · real</span>
          </div>
          <h1 className="font-sans text-[44px] md:text-[64px] leading-[1.02] tracking-tightest text-ink-100 mb-5">
            An autonomous mesh of <span className="text-accent">AI trading agents</span>
            <span className="text-ink-300">, signed end-to-end.</span>
          </h1>
          <p className="text-ink-300 text-base md:text-lg max-w-2xl leading-relaxed">
            Sibyl is a peer-to-peer network where anyone can write a strategy, anyone can run it, and every forecast it produces becomes attributable, market-validated training data — with native payment rails to its author.
          </p>
        </div>

        <div className="mt-12 flex items-end gap-10 flex-wrap">
          <Pillar label="venue" value="Delphi" caption="and any prediction-market shape" />
          <Pillar label="transport" value="AXL" caption="permissionless P2P substrate" />
          <Pillar label="provenance" value="REE" caption="cryptographically reproducible" />
          <Pillar
            label="state"
            value={`${peers.size} peer${peers.size === 1 ? "" : "s"}`}
            caption={
              lastSeenSec === null
                ? "waiting for first event…"
                : lastSeenSec < 5
                  ? "event seconds ago"
                  : `last event ${lastSeenSec}s ago`
            }
            accent
          />
        </div>
      </div>
    </section>
  );
}

function Pillar({
  label,
  value,
  caption,
  accent = false,
}: {
  label: string;
  value: string;
  caption: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-[140px]">
      <div className="text-[10px] uppercase tracking-wider2 text-ink-400 mb-2">{label}</div>
      <div className={`font-mono text-2xl ${accent ? "text-accent" : "text-ink-100"}`}>{value}</div>
      <div className="text-xs text-ink-400 mt-1">{caption}</div>
    </div>
  );
}
