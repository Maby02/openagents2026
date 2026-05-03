import { Box, Text, useApp, useInput } from "ink";
import * as React from "react";
import { useEffect, useState } from "react";
import type { Envelope, ForecastBody, StrategyPublishBody } from "../envelopes.ts";

export interface NodeView {
  label: string;
  pubkey: string;
  strategy: string;
  peerLabels: Map<string, string>; // pubkey → friendly label (e.g. "Bob")
  // Subscribe + return unsubscribe.
  subscribe: (cb: (env: Envelope) => void) => () => void;
}

export interface DemoScreenProps {
  alice: NodeView;
  bob: NodeView;
  onShareRandom: () => Promise<{ side: "alice" | "bob"; name: string } | null>;
  onQuit: () => void;
}

interface DisplayLine {
  ts: number;
  kind: "forecast" | "share" | "recv" | "info";
  text: string;
  color?: string;
}

const PANE_LINES = 9;

export function DemoScreen({ alice, bob, onShareRandom, onQuit }: DemoScreenProps): React.ReactElement {
  const { exit } = useApp();
  const [aLines, setALines] = useState<DisplayLine[]>([]);
  const [bLines, setBLines] = useState<DisplayLine[]>([]);
  const [stats, setStats] = useState({ forecasts: 0, shares: 0, recvs: 0 });
  const [hint, setHint] = useState<string>("");

  useEffect(() => {
    const unsubA = alice.subscribe((env) => {
      const line = envelopeToLine(env, alice);
      setALines((prev) => [...prev.slice(-(PANE_LINES - 1)), line]);
      bumpStats(setStats, line.kind, env.from === alice.pubkey);
    });
    const unsubB = bob.subscribe((env) => {
      const line = envelopeToLine(env, bob);
      setBLines((prev) => [...prev.slice(-(PANE_LINES - 1)), line]);
      bumpStats(setStats, line.kind, env.from === bob.pubkey);
    });
    return () => {
      unsubA();
      unsubB();
    };
  }, [alice, bob]);

  // Disable interactive keys when we're not on a TTY (piped output, CI, etc.).
  // Without this guard, ink's raw-mode setup throws on render in those contexts.
  const interactive = Boolean(process.stdin.isTTY);
  useInput(
    (input, key) => {
      if (input === "q" || key.escape) {
        onQuit();
        exit();
      } else if (input === "s") {
        void onShareRandom().then((res) => {
          if (res) setHint(`shared ${res.name} from ${res.side} → mesh`);
        });
      }
    },
    { isActive: interactive },
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="white">sibyl demo </Text>
        <Text dimColor>— virtual two-node mesh, no AXL binary required</Text>
      </Box>

      <Box>
        <Pane node={alice} lines={aLines} accent="cyan" />
        <Box width={2} />
        <Pane node={bob} lines={bLines} accent="magenta" />
      </Box>

      <Box flexDirection="column" marginTop={1} borderStyle="round" paddingX={1}>
        <Box>
          <Text>{stats.forecasts}</Text>
          <Text dimColor> forecasts  •  </Text>
          <Text>{stats.shares}</Text>
          <Text dimColor> strategies shared  •  </Text>
          <Text>{stats.recvs}</Text>
          <Text dimColor> envelopes received from peers</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>press </Text>
          <Text color="green">s</Text>
          <Text dimColor> to share a random strategy   •   </Text>
          <Text color="red">q</Text>
          <Text dimColor> to quit</Text>
        </Box>
        {hint ? (
          <Box marginTop={1}>
            <Text color="yellow">  ↳ {hint}</Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function Pane(props: { node: NodeView; lines: DisplayLine[]; accent: string }): React.ReactElement {
  const { node, lines, accent } = props;
  const peerStr =
    node.peerLabels.size > 0
      ? Array.from(node.peerLabels.entries())
          .map(([pk, lbl]) => `${lbl}/${pk.slice(0, 6)}…`)
          .join(", ")
      : "—";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1} flexGrow={1} width={56}>
      <Box>
        <Text bold color={accent}>{node.label} </Text>
        <Text dimColor>peer </Text>
        <Text>{node.pubkey.slice(0, 12)}…</Text>
      </Box>
      <Box>
        <Text dimColor>strategy: </Text>
        <Text>{node.strategy}</Text>
      </Box>
      <Box>
        <Text dimColor>peers known: </Text>
        <Text>{peerStr}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column" minHeight={PANE_LINES}>
        {lines.length === 0 ? (
          <Text dimColor>(waiting for first event…)</Text>
        ) : (
          lines.map((l, i) => (
            <Text key={i} color={l.color}>
              <Text dimColor>{fmtTs(l.ts)} </Text>
              {l.text}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

function envelopeToLine(env: Envelope, view: NodeView): DisplayLine {
  const ts = Date.parse(env.ts);
  if (env.type === "forecast") {
    const b = env.body as ForecastBody;
    const decision = b.stakeUsd > 0 ? "BUY " : "HOLD";
    return {
      ts,
      kind: "forecast",
      color: b.stakeUsd > 0 ? "green" : "white",
      text: `${decision} ${shortMarket(b.marketId)} @${b.probability.toFixed(2)} ${b.reasoning.slice(0, 28)}`,
    };
  }
  if (env.type === "strategy_publish") {
    const b = env.body as StrategyPublishBody;
    if (env.from === view.pubkey) {
      return {
        ts,
        kind: "share",
        color: "yellow",
        text: `SHARE ${b.name} v${b.version}  →  mesh`,
      };
    }
    const lbl = view.peerLabels.get(env.from) ?? env.from.slice(0, 6) + "…";
    return {
      ts,
      kind: "recv",
      color: "yellow",
      text: `RECV  ${b.name} v${b.version}  ←  ${lbl}`,
    };
  }
  return { ts, kind: "info", text: env.type, color: "gray" };
}

function shortMarket(id: string): string {
  const last = id.split("/").pop() ?? id;
  return last.length > 16 ? last.slice(0, 16) : last;
}

function fmtTs(ms: number): string {
  if (!Number.isFinite(ms)) return "??:??:??";
  const d = new Date(ms);
  return d.toISOString().slice(11, 19);
}

function bumpStats(
  setStats: React.Dispatch<React.SetStateAction<{ forecasts: number; shares: number; recvs: number }>>,
  kind: DisplayLine["kind"],
  isLocal: boolean,
): void {
  setStats((s) => {
    if (kind === "forecast") return { ...s, forecasts: s.forecasts + 1 };
    if (kind === "share" && isLocal) return { ...s, shares: s.shares + 1 };
    if (kind === "recv" && !isLocal) return { ...s, recvs: s.recvs + 1 };
    return s;
  });
}
