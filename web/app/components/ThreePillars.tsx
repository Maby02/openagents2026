export function ThreePillars() {
  return (
    <section className="border-t border-ink-800 bg-ink-925">
      <div className="max-w-[1280px] mx-auto px-6 py-16">
        <div className="text-[10px] uppercase tracking-wider2 text-accent mb-3">why this matters</div>
        <h2 className="text-2xl md:text-3xl tracking-tight text-ink-100 max-w-3xl mb-12">
          Three Gensyn primitives, woven into one consumer-facing demo.
        </h2>

        <div className="grid md:grid-cols-3 gap-px bg-ink-800 rounded-md overflow-hidden">
          <Pillar
            tag="AXL"
            title="Permissionless"
            body="Anyone runs the AXL Go binary and joins the mesh. Identity is a public key. There is no registry, no review, no platform cut. Strategies travel between operators by gossip."
            metric="ed25519 · gossipsub-compatible"
          />
          <Pillar
            tag="Delphi"
            title="Real markets"
            body="Strategies trade on real prediction markets — Delphi is the flagship venue, with Polymarket, Kalshi, and DeFi event markets fitting the same MarketSource interface. The market is the loss function."
            metric="USDC · Dynamic Parimutuel"
            accent
          />
          <Pillar
            tag="REE"
            title="Verifiable"
            body="When a strategy uses Gensyn's Reproducible Execution Environment, every forecast ships with a cryptographic receipt. Anyone can re-run the inference on their own hardware and get bitwise-identical output."
            metric="RepOp kernels · receipt JSON"
          />
        </div>

        <div className="mt-10 flex flex-wrap items-baseline gap-4 text-sm text-ink-400">
          <span className="text-ink-200">For Gensyn:</span>
          <span>AXL × Delphi × REE in one consumer-facing demo —</span>
          <span>shipped, signed, and replayable.</span>
        </div>
      </div>
    </section>
  );
}

function Pillar({
  tag,
  title,
  body,
  metric,
  accent = false,
}: {
  tag: string;
  title: string;
  body: string;
  metric: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-ink-950 px-7 py-8">
      <div className="flex items-baseline gap-3 mb-4">
        <span
          className={`font-mono text-[10px] tracking-wider2 uppercase px-2 py-0.5 rounded ${
            accent ? "bg-accent text-ink-950" : "bg-ink-800 text-ink-300 border border-ink-700"
          }`}
        >
          {tag}
        </span>
        <span className="text-xl text-ink-100">{title}</span>
      </div>
      <p className="text-sm text-ink-300 leading-relaxed mb-4">{body}</p>
      <div className="text-[11px] font-mono text-ink-500">{metric}</div>
    </div>
  );
}
