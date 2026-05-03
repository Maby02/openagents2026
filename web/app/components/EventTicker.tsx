"use client";

import type { Envelope, ForecastBody, StrategyPublishBody } from "@/lib/types";
import { fmtTime, pct, shortHex, shortMarket } from "@/lib/format";

interface Props {
  events: Envelope[];
}

export function EventTicker({ events }: Props) {
  return (
    <section className="rounded-md border border-ink-800 bg-ink-925 overflow-hidden">
      <header className="px-5 py-3.5 border-b border-ink-800 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[10px] uppercase tracking-wider2 text-ink-300">Live mesh activity</h2>
          <span className="text-[10px] text-ink-500">newest first · signed end-to-end</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider2 text-ink-400">{events.length} loaded</span>
      </header>
      <ul className="max-h-[640px] overflow-y-auto">
        {events.length === 0 ? (
          <EmptyState />
        ) : (
          events.map((e) => (
            <li key={e.sig} className="border-b border-ink-800/60 last:border-0 fade-up">
              <EventRow env={e} />
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function EventRow({ env }: { env: Envelope }) {
  if (env.type === "forecast") return <ForecastRow env={env} body={env.body} />;
  if (env.type === "strategy_publish") return <PublishRow env={env} body={env.body} />;
  if (env.type === "trade_receipt") return <TradeRow env={env} />;
  if (env.type === "outcome") return <OutcomeRow env={env} />;
  return null;
}

function ForecastRow({ env, body }: { env: Envelope & { type: "forecast" }; body: ForecastBody }) {
  const isBuy = body.stakeUsd > 0;
  const isLlm = body.strategyName.includes("llm");
  const hasReceipt = !!body.receipt;
  return (
    <div className="px-5 py-3 hover:bg-ink-900/60 transition-colors">
      <div className="flex gap-3 items-baseline flex-wrap">
        <Tag color={isBuy ? "buy" : "hold"}>{isBuy ? "BUY" : "HOLD"}</Tag>
        <span className="font-mono text-[11px] text-ink-300">{body.strategyName}</span>
        {isLlm && <Pill kind="llm">LLM</Pill>}
        {hasReceipt && <Pill kind="ree">✓ ree</Pill>}
        <span className="text-ink-700 text-xs">·</span>
        <span className="text-sm text-ink-100 truncate flex-1 min-w-0">"{body.marketSnapshot.question}"</span>
        <span className="text-[10px] text-ink-500 font-mono shrink-0">{fmtTime(env.ts)}</span>
      </div>
      <div className="mt-1 flex gap-4 items-baseline pl-[60px] flex-wrap">
        <span className="text-xs text-ink-400">
          <span className="text-ink-100 tabular-nums font-mono">{pct(body.probability)}</span>{" "}
          on outcome <span className="font-mono">{body.outcomeIdx}</span>
        </span>
        {isBuy && (
          <span className="text-xs text-accent tabular-nums">stake ${body.stakeUsd.toFixed(2)}</span>
        )}
        <span className="text-xs text-ink-400 italic truncate flex-1 min-w-0">{body.reasoning}</span>
        <span className="text-[10px] text-ink-600 font-mono shrink-0">peer {shortHex(env.from, 4)}</span>
      </div>
    </div>
  );
}

function PublishRow({ env, body }: { env: Envelope & { type: "strategy_publish" }; body: StrategyPublishBody }) {
  return (
    <div className="px-5 py-3 hover:bg-ink-900/60 transition-colors">
      <div className="flex gap-3 items-baseline flex-wrap">
        <Tag color="share">SHARE</Tag>
        <span className="font-mono text-sm text-ink-100">
          {body.name} <span className="text-ink-500">v{body.version}</span>
        </span>
        {body.declaresRee && <Pill kind="ree">REE: {body.declaresRee.model}</Pill>}
        <span className="text-ink-500 text-xs">by</span>
        <span className="text-sm text-ink-300">@{body.authorHandle}</span>
        <span className="text-[10px] text-ink-600 font-mono">({shortHex(body.contentHash, 4)})</span>
        <span className="ml-auto text-[10px] text-ink-500 font-mono">{fmtTime(env.ts)}</span>
      </div>
      <div className="mt-1 pl-[60px] text-xs text-ink-500">
        gossiped from peer{" "}
        <span className="text-ink-300 font-mono">{shortHex(env.from, 6)}</span> · {body.sizeBytes} bytes
      </div>
    </div>
  );
}

function TradeRow({ env }: { env: Envelope & { type: "trade_receipt" } }) {
  return (
    <div className="px-5 py-3 flex gap-3 items-baseline">
      <Tag color="trade">TRADE</Tag>
      <span className="font-mono text-sm">{shortMarket(env.body.marketId)}</span>
      <span className="text-ink-300 text-sm">
        {env.body.side} <span className="text-accent tabular-nums">${env.body.sizeUsd.toFixed(2)}</span>
      </span>
      <span className="ml-auto text-[10px] text-ink-500 font-mono">{fmtTime(env.ts)}</span>
    </div>
  );
}

function OutcomeRow({ env }: { env: Envelope & { type: "outcome" } }) {
  return (
    <div className="px-5 py-3 flex gap-3 items-baseline">
      <Tag color="outcome">OUTCOME</Tag>
      <span className="font-mono text-sm">{shortMarket(env.body.marketId)}</span>
      <span className="text-ink-300 text-sm">resolved {env.body.resolution}</span>
      <span className={`text-sm tabular-nums ${env.body.pnlUsd >= 0 ? "text-accent" : "text-rose-400"}`}>
        {env.body.pnlUsd >= 0 ? "+" : ""}${env.body.pnlUsd.toFixed(2)}
      </span>
      <span className="ml-auto text-[10px] text-ink-500 font-mono">{fmtTime(env.ts)}</span>
    </div>
  );
}

function Tag({ color, children }: { color: "buy" | "hold" | "share" | "trade" | "outcome"; children: React.ReactNode }) {
  const cls = {
    buy: "bg-accent text-ink-950",
    hold: "bg-ink-800 text-ink-400",
    share: "bg-amber-300/15 text-amber-200 border border-amber-300/20",
    trade: "bg-fuchsia-300/15 text-fuchsia-200 border border-fuchsia-300/20",
    outcome: "bg-emerald-300/15 text-emerald-200 border border-emerald-300/20",
  }[color];
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider2 w-[52px] text-center ${cls}`}
    >
      {children}
    </span>
  );
}

function Pill({ kind, children }: { kind: "llm" | "ree"; children: React.ReactNode }) {
  const cls =
    kind === "ree"
      ? "bg-purple-400/10 text-purple-300 border border-purple-400/20"
      : "bg-ink-800 text-ink-300 border border-ink-700";
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider2 ${cls}`}>{children}</span>
  );
}

function EmptyState() {
  return (
    <li className="px-6 py-20 text-center">
      <p className="text-ink-300 text-sm mb-2">Waiting for the first signed envelope.</p>
      <p className="text-xs text-ink-500">
        No operator running locally? Start one with{" "}
        <code className="text-ink-200 bg-ink-900 border border-ink-800 px-1.5 py-0.5 rounded font-mono">
          sibyl run --mode mock
        </code>
      </p>
    </li>
  );
}
