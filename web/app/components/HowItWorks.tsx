export function HowItWorks() {
  return (
    <section className="border-t border-ink-800">
      <div className="max-w-[1280px] mx-auto px-6 py-16">
        <SectionHeader eyebrow="protocol" title="How a forecast becomes signed training data" />

        <div className="mt-10 grid md:grid-cols-4 gap-px bg-ink-800 rounded-md overflow-hidden">
          <Step
            n="01"
            title="Author writes"
            body="A single TypeScript file with a forecast() function — rule-based, LLM-driven, or REE-verified."
            mono="strategies/llm_headline.ts"
          />
          <Step
            n="02"
            title="Mesh gossips"
            body="sibyl share signs the file with the author's ed25519 key and floods it across AXL peers."
            mono="strategy_publish · contentHash"
            arrow
          />
          <Step
            n="03"
            title="Operators run"
            body="Anyone running sibyl run picks up strategies, executes them against real markets, and signs every forecast."
            mono="forecast · sig · marketId"
            arrow
          />
          <Step
            n="04"
            title="Markets resolve"
            body="When the market settles, profit splits 70/30 to the operator and author over signed IOU receipts."
            mono="outcome · pnl · split"
            arrow
            terminal
          />
        </div>
      </div>
    </section>
  );
}

function Step({
  n,
  title,
  body,
  mono,
  arrow = false,
  terminal = false,
}: {
  n: string;
  title: string;
  body: string;
  mono: string;
  arrow?: boolean;
  terminal?: boolean;
}) {
  return (
    <div className="bg-ink-950 px-6 py-7 relative">
      {arrow && (
        <div className="hidden md:block absolute -left-px top-1/2 -translate-y-1/2 z-10">
          <div className="bg-ink-950 border border-ink-700 rounded-full w-5 h-5 flex items-center justify-center text-ink-400 text-xs font-mono">
            →
          </div>
        </div>
      )}
      <div className="flex items-baseline gap-3 mb-3">
        <span className="font-mono text-[10px] tracking-wider2 text-ink-500">{n}</span>
        <span className={`text-sm tracking-wide ${terminal ? "text-accent" : "text-ink-100"}`}>{title}</span>
      </div>
      <p className="text-sm text-ink-300 leading-relaxed mb-4">{body}</p>
      <code className="text-[10px] font-mono text-ink-500 break-all">{mono}</code>
    </div>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider2 text-accent mb-3">{eyebrow}</div>
      <h2 className="text-2xl md:text-3xl tracking-tight text-ink-100 max-w-2xl">{title}</h2>
      <div className="section-rule mt-4 max-w-md" />
    </div>
  );
}
