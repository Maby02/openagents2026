import type { ConnectionStatus } from "@/lib/types";

interface Props {
  status: ConnectionStatus;
  totalSeen: number;
}

export function Header({ status, totalSeen }: Props) {
  const open = status === "open";
  const connecting = status === "connecting";
  const dotClass = open
    ? "bg-accent live-dot"
    : connecting
      ? "bg-amber-400 live-dot"
      : "bg-rose-400";
  const pillClass = open ? "live-glow border-accent/40 text-accent" : "border-ink-700 text-ink-300";
  const label = open ? "live" : connecting ? "connecting" : "offline";

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-ink-950/80 border-b border-ink-800">
      <div className="max-w-[1280px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm tracking-wider2 text-accent uppercase">sibyl</span>
          <span className="text-ink-400 text-xs">live mesh</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono tabular-nums text-base text-ink-100">{totalSeen}</span>
            <span className="text-[10px] uppercase tracking-wider2 text-ink-400">events</span>
          </div>
          <div className={`flex items-center gap-2 text-[10px] uppercase tracking-wider2 px-2.5 py-1 rounded-full border ${pillClass}`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass}`} />
            {label}
          </div>
        </div>
      </div>
    </header>
  );
}
