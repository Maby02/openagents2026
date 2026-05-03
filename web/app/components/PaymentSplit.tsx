export function PaymentSplit() {
  return (
    <section className="border-t border-ink-800">
      <div className="max-w-[1280px] mx-auto px-6 py-16 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-12 items-start">
        <div>
          <div className="text-[10px] uppercase tracking-wider2 text-accent mb-3">payments</div>
          <h2 className="text-2xl md:text-3xl tracking-tight text-ink-100 mb-4">
            Authors get paid every time their strategy wins.
          </h2>
          <p className="text-ink-300 leading-relaxed mb-6 max-w-md">
            When an operator runs a strategy and the market settles in their favor, the protocol splits the profit
            automatically over signed IOU receipts on the Sibyl mesh. The author share is capped at 50%; default is
            70/30 to the operator. No platform, no middleman, no withhold.
          </p>
          <div className="space-y-2 text-sm text-ink-400">
            <div>
              <span className="text-ink-200">No registry.</span> Identity is a public key.
            </div>
            <div>
              <span className="text-ink-200">No platform cut.</span> The mesh routes value end-to-end.
            </div>
            <div>
              <span className="text-ink-200">No off-chain trust.</span> Receipts are signed, attributable, and replayable.
            </div>
          </div>
        </div>

        <SplitDiagram />
      </div>
    </section>
  );
}

function SplitDiagram() {
  return (
    <div className="rounded-md border border-ink-800 bg-ink-925 overflow-hidden">
      <div className="px-5 py-3 border-b border-ink-800 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider2 text-ink-300">example settlement</span>
        <span className="text-[10px] uppercase tracking-wider2 text-ink-500">iou_v1</span>
      </div>
      <div className="p-6 space-y-5 text-sm">
        <Row label="Market resolved" detail='"Will the Fed cut rates?" → YES' value="" />
        <Row label="Operator stake" detail="Bob ran simple-momentum, bet $5 YES" value="$5.00" />
        <Row label="Settled payout" detail="Market paid 1.85x" value="$9.25" tone="accent" />

        <div className="h-px bg-ink-800" />

        <Row label="Operator share" detail="@bob (peer 33f4…)" value="$6.48" share="70%" />
        <Row label="Author share" detail="@alice (peer 8e1f…)" value="$2.78" share="30%" tone="accent" />

        <div className="pt-3 border-t border-ink-800 flex items-center gap-3 text-xs text-ink-400">
          <span className="text-accent font-mono">●</span>
          <span>both halves signed by Bob's identity, gossiped to Alice over AXL</span>
        </div>

        <div className="grid grid-cols-2 gap-px bg-ink-800 rounded overflow-hidden mt-4">
          <div className="bg-ink-950 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider2 text-ink-400 mb-1">to operator</div>
            <div className="h-1.5 bg-ink-800 rounded-full overflow-hidden">
              <div className="h-full bg-ink-300/60" style={{ width: "70%" }} />
            </div>
            <div className="font-mono text-base mt-2 tabular-nums">70%</div>
          </div>
          <div className="bg-ink-950 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider2 text-accent mb-1">to author</div>
            <div className="h-1.5 bg-ink-800 rounded-full overflow-hidden">
              <div className="h-full bg-accent/70" style={{ width: "30%" }} />
            </div>
            <div className="font-mono text-base mt-2 tabular-nums text-accent">30%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  detail,
  value,
  share,
  tone,
}: {
  label: string;
  detail: string;
  value: string;
  share?: string;
  tone?: "accent";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className="text-ink-200 text-sm">{label}</div>
        <div className="text-ink-500 text-xs truncate">{detail}</div>
      </div>
      <div className="text-right shrink-0 flex items-baseline gap-2">
        {share && <span className="text-[10px] uppercase tracking-wider2 text-ink-500">{share}</span>}
        <span className={`font-mono tabular-nums ${tone === "accent" ? "text-accent" : "text-ink-100"}`}>{value}</span>
      </div>
    </div>
  );
}
