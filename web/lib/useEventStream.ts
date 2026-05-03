"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ConnectionStatus, Envelope } from "./types";

interface State {
  events: Envelope[];     // newest first; bounded
  status: ConnectionStatus;
  totalSeen: number;
  error: string | null;
}

type Action =
  | { type: "init"; events: Envelope[] }
  | { type: "append"; event: Envelope }
  | { type: "status"; status: ConnectionStatus; error?: string };

const MAX_EVENTS = 250;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "init": {
      const events = action.events.slice().reverse().slice(0, MAX_EVENTS);
      return { ...state, events, totalSeen: action.events.length };
    }
    case "append": {
      // Dedup by signature in case history + first SSE event overlap.
      if (state.events.find((e) => e.sig === action.event.sig)) return state;
      const events = [action.event, ...state.events].slice(0, MAX_EVENTS);
      return { ...state, events, totalSeen: state.totalSeen + 1 };
    }
    case "status":
      return { ...state, status: action.status, error: action.error ?? null };
  }
}

export interface UseEventStreamOptions {
  observerUrl: string;
  // Set to false to skip the historical replay (useful for tests).
  fetchHistory?: boolean;
  historyLimit?: number;
}

export function useEventStream(opts: UseEventStreamOptions) {
  const [state, dispatch] = useReducer(reducer, {
    events: [],
    status: "connecting" as ConnectionStatus,
    totalSeen: 0,
    error: null,
  });
  const sseRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;
    dispatch({ type: "status", status: "connecting" });

    const sse = new EventSource(`${opts.observerUrl}/events`);
    sseRef.current = sse;

    sse.onopen = () => dispatch({ type: "status", status: "open" });
    sse.onerror = () => {
      dispatch({ type: "status", status: "error", error: "connection lost" });
      // EventSource auto-reconnects; we just surface the state to the UI.
    };

    const handler = (ev: MessageEvent) => {
      try {
        const env = JSON.parse(ev.data) as Envelope;
        dispatch({ type: "append", event: env });
      } catch {
        // skip malformed
      }
    };
    // Server sets event: <type>; bind one handler per supported type.
    (["forecast", "strategy_publish", "trade_receipt", "outcome"] as const).forEach((t) =>
      sse.addEventListener(t, handler as EventListener),
    );

    return sse;
  }, [opts.observerUrl]);

  useEffect(() => {
    let cancelled = false;
    if (opts.fetchHistory !== false) {
      const url = `${opts.observerUrl}/events/history?limit=${opts.historyLimit ?? 200}`;
      fetch(url, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`history ${r.status}`))))
        .then((data: { events: Envelope[] }) => {
          if (cancelled) return;
          dispatch({ type: "init", events: data.events ?? [] });
        })
        .catch((err) => {
          if (cancelled) return;
          dispatch({ type: "status", status: "error", error: `history: ${(err as Error).message}` });
        });
    }
    const sse = connect();
    return () => {
      cancelled = true;
      sse?.close();
      sseRef.current?.close();
    };
  }, [connect, opts.fetchHistory, opts.historyLimit, opts.observerUrl]);

  return state;
}
