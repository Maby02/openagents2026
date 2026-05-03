export function RunANode() {
  return (
    <section className="border-t border-ink-800">
      <div className="max-w-[1280px] mx-auto px-6 py-16 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-10 items-center">
        <div>
          <div className="text-[10px] uppercase tracking-wider2 text-accent mb-3">join the mesh</div>
          <h2 className="text-2xl md:text-3xl tracking-tight text-ink-100 mb-4">
            Run a node. Get attributed. Get paid.
          </h2>
          <p className="text-ink-300 leading-relaxed max-w-md mb-6">
            Three commands. No platform, no signups, no review. Your peer ID joins the public mesh and your forecasts
            start mining the data corpus alongside everyone else.
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-ink-400">
            <span className="px-2 py-1 rounded border border-ink-700 font-mono">macOS</span>
            <span className="px-2 py-1 rounded border border-ink-700 font-mono">Linux</span>
            <span className="px-2 py-1 rounded border border-ink-700 font-mono">Node 22+</span>
          </div>
        </div>

        <div className="rounded-md border border-ink-800 bg-ink-950 overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-800 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-400/60" />
            <span className="w-2 h-2 rounded-full bg-amber-400/60" />
            <span className="w-2 h-2 rounded-full bg-emerald-400/60" />
            <span className="ml-3 text-[10px] uppercase tracking-wider2 text-ink-400">your terminal</span>
          </div>
          <div className="px-6 py-5 space-y-3 font-mono text-sm">
            <Line prompt="$" cmd="git clone … sibyl && cd sibyl" comment="clone & enter" />
            <Line prompt="$" cmd="npm install && ./bin/sibyl init" comment="generate ed25519 identity" />
            <Line prompt="$" cmd="./bin/sibyl run --mode mock" comment="join the mesh" highlight />
            <div className="pt-3 border-t border-ink-800/60 text-[11px] text-ink-500">
              # then in another terminal:
            </div>
            <Line prompt="$" cmd="./bin/sibyl share strategies/llm_headline.ts" comment="ship a strategy" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Line({
  prompt,
  cmd,
  comment,
  highlight = false,
}: {
  prompt: string;
  cmd: string;
  comment?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-ink-600">{prompt}</span>
      <span className={`flex-1 ${highlight ? "text-accent" : "text-ink-100"}`}>{cmd}</span>
      {comment && <span className="text-[10px] text-ink-500 shrink-0">{comment}</span>}
    </div>
  );
}
