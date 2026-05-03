export function shortHex(hex: string, n = 6): string {
  if (!hex) return "";
  if (hex.length <= n * 2) return hex;
  return `${hex.slice(0, n)}…${hex.slice(-n)}`;
}

export function shortMarket(id: string): string {
  // mock://market/btc-100k → btc-100k; delphi://market/0xabc… → 0xabc…
  const last = id.split("/").pop() ?? id;
  return last.length > 24 ? `${last.slice(0, 24)}…` : last;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function fmtRelative(iso: string, now = Date.now()): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "—";
  const diff = (now - d) / 1000;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
