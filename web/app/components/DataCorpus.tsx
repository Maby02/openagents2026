"use client";

import { useMemo } from "react";
import type { Envelope, ForecastBody } from "@/lib/types";

interface Props {
  events: Envelope[];
}

export function DataCorpus({ events }: Props) {
  const stats = useMemo(() => {
    let totalForecasts = 0;
    let withReasoning = 0;
    let withReceipt = 0;
    const authors = new Set<string>();
    const operators = new Set<string>();
    for (const e of events) {
      operators.add(e.from);
      if (e.type === "forecast") {
        totalForecasts++;
        const body = e.body as ForecastBody;
        if (body.reasoning && body.reasoning.length > 8) withReasoning++;
        if (body.receipt) withReceipt++;
        authors.add(body.strategyAuthor);
      }
    }
    return { totalForecasts, withReasoning, withReceipt, authors: authors.size, operators: operators.size };
  }, [events]);

  return (
    <section className="border-t border-ink-800 bg-ink-925">
      <div className="max-w-[1280px] mx-auto px-6 py-16">
        <div className="grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-12 items-start">
          <div>
            <div className="text-[10px] uppercase tracking-wider2 text-accent mb-3">data corpus</div>
            <h2 className="text-2xl md:text-3xl tracking-tight text-ink-100 mb-4">
              Every signed envelope is provenance-grade training data — with payment rails attached.
            </h2>
            <p className="text-ink-300 leading-relaxed mb-6 max-w-xl">
              Each forecast is signed by an identifiable peer, validated by a real market with real money, and (with
              REE) cryptographically reproducible. Future models train on it. Authors get paid every time their
              strategy produces a winning forecast. The whole pipeline is permissionless.
            </p>

            <ul className="space-y-3 text-sm">
              <Bullet color="accent" label="signed end-to-end">
                ed25519 over canonical JSON. Tampering is detectable on the wire.
              </Bullet>
              <Bullet color="sky" label="market-validated">
                Forecasts that win get rewarded, those that don't get culled. The market is the loss function.
              </Bullet>
              <Bullet color="purple" label="cryptographically reproducible (REE)">
                Re-run the inference on your own machine and get bitwise-identical output. The strongest possible
                provenance for AI training data.
              </Bullet>
              <Bullet color="amber" label="native payment rails">
                Profit splits flow to authors and operators automatically over signed IOU receipts.
              </Bullet>
            </ul>
          </div>

          <CorpusVisual stats={stats} />
        </div>
      </div>
    </section>
  );
}

function Bullet({
  color,
  label,
  children,
}: {
  color: "accent" | "sky" | "purple" | "amber";
  label: string;
  children: React.ReactNode;
}) {
  const dot = {
    accent: "bg-accent",
    sky: "bg-sky-400",
    purple: "bg-purple-400",
    amber: "bg-amber-300",
  }[color];
  return (
    <li className="flex gap-3">
      <span className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <div>
        <div className="text-ink-100 font-medium">{label}</div>
        <div className="text-ink-400 text-sm leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

function CorpusVisual({
  stats,
}: {
  stats: { totalForecasts: number; withReasoning: number; withReceipt: number; authors: number; operators: number };
}) {
  return (
    <div className="rounded-md border border-ink-800 bg-ink-950 p-6">
      <div className="flex items-baseline justify-between mb-6">
        <div className="text-[10px] uppercase tracking-wider2 text-ink-400">live corpus</div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider2 text-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-accent live-dot" />
          mining
        </div>
      </div>

      <div className="text-7xl font-mono tabular-nums text-ink-100 leading-none mb-2">
        {stats.totalForecasts}
      </div>
      <div className="text-sm text-ink-400 mb-6">signed forecasts on the mesh</div>

      <div className="grid grid-cols-2 gap-px bg-ink-800 rounded overflow-hidden">
        <CorpusStat label="with reasoning" value={stats.withReasoning} subtle="trainable I/O pairs" />
        <CorpusStat
          label="REE-verified"
          value={stats.withReceipt}
          subtle="bitwise reproducible"
          accent={stats.withReceipt > 0}
        />
        <CorpusStat label="contributing authors" value={stats.authors} subtle="payment recipients" />
        <CorpusStat label="operators online" value={stats.operators} subtle="signing peers" />
      </div>

      <div className="mt-5 pt-5 border-t border-ink-800 text-xs text-ink-400 leading-relaxed">
        Replayable from{" "}
        <code className="text-ink-200 bg-ink-900 px-1.5 py-0.5 rounded font-mono text-[11px]">
          sibyl export --verify
        </code>
        . Every line carries enough metadata to attribute and re-execute.
      </div>
    </div>
  );
}

function CorpusStat({
  label,
  value,
  subtle,
  accent = false,
}: {
  label: string;
  value: number;
  subtle: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-ink-950 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider2 text-ink-500">{label}</div>
      <div className={`text-xl font-mono tabular-nums mt-1 ${accent ? "text-accent" : "text-ink-100"}`}>{value}</div>
      <div className="text-[10px] text-ink-500">{subtle}</div>
    </div>
  );
}
