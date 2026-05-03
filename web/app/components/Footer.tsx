export function Footer() {
  return (
    <footer className="border-t border-ink-800 bg-ink-925">
      <div className="max-w-[1280px] mx-auto px-6 py-10 flex flex-wrap items-baseline justify-between gap-6 text-xs">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm tracking-wider2 text-accent uppercase">sibyl</span>
          <span className="text-ink-500">— signed, attributable, replayable.</span>
        </div>
        <div className="flex items-baseline gap-5 text-ink-400">
          <span>built on</span>
          <a className="hover:text-ink-100 transition-colors" href="https://docs.gensyn.ai/tech/agent-exchange-layer" target="_blank" rel="noopener noreferrer">
            AXL ↗
          </a>
          <a className="hover:text-ink-100 transition-colors" href="https://docs.gensyn.ai/tech/delphi-sdk" target="_blank" rel="noopener noreferrer">
            Delphi ↗
          </a>
          <a className="hover:text-ink-100 transition-colors" href="https://docs.gensyn.ai/tech/ree" target="_blank" rel="noopener noreferrer">
            REE ↗
          </a>
        </div>
        <div className="flex items-baseline gap-5 text-ink-400">
          <a className="hover:text-ink-100 transition-colors" href="#" target="_blank" rel="noopener noreferrer">
            github →
          </a>
          <a className="hover:text-ink-100 transition-colors" href="#" target="_blank" rel="noopener noreferrer">
            architecture →
          </a>
        </div>
      </div>
    </footer>
  );
}
