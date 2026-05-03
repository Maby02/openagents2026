import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { EventLog } from "./log.ts";
import type { Envelope } from "./envelopes.ts";
import { verifyEnvelope } from "./envelopes.ts";

export interface ObserverHandle {
  port: number;
  url: string;
  close: () => Promise<void>;
}

// Hook the run loop installs so /control/publish can hand off to gossip after
// the envelope has been validated and persisted. Return value is summary text
// for the operator to see in their `sibyl share` output.
export type PublishHandler = (envelope: Envelope) => Promise<{ summary: string }>;

export interface ObserverOptions {
  port: number;
  log: EventLog;
  cors?: boolean; // default true (read endpoints)
  // Operator's identity public key — POST /control/publish only accepts envelopes
  // signed by this key, so a stray local script can't publish on the operator's behalf.
  ownerPubkey?: string;
  onPublish?: PublishHandler;
}

// Small read-only HTTP server that exposes the local event log over HTTP. The
// web app subscribes to /events for live updates and pulls historical events
// from /events/history. CORS is on by default so a Vercel-hosted frontend can
// connect directly to a Sibyl operator running anywhere.
export function startObserver(opts: ObserverOptions): Promise<ObserverHandle> {
  const cors = opts.cors ?? true;

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const isControl = url.pathname.startsWith("/control/");

    if (cors && !isControl) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // /control/* is local-only — same-machine clients (`sibyl share`) talk to the
    // running operator process. SIBYL_DISABLE_CONTROL=1 fully disables the
    // surface (production / hosted-operator default); otherwise we compare
    // against loopback addresses. Any remote IP gets a 403 before body read.
    if (isControl) {
      if (process.env.SIBYL_DISABLE_CONTROL === "1") {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("control endpoints disabled");
        return;
      }
      if (!isLoopback(req)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("control endpoints are local-only");
        return;
      }
    }

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/events") {
      handleSse(req, res, opts.log);
      return;
    }

    if (req.method === "GET" && url.pathname === "/events/history") {
      handleHistory(req, res, opts.log, url).catch((err) => {
        console.error(`observer: history error: ${(err as Error).message}`);
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/control/publish") {
      handleControlPublish(req, res, opts).catch((err) => {
        console.error(`observer: control/publish error: ${(err as Error).message}`);
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "0.0.0.0", () => {
      server.removeListener("error", reject);
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : opts.port;
      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((res) => {
            server.closeAllConnections?.();
            server.close(() => res());
          }),
      });
    });
  });
}

function handleSse(req: IncomingMessage, res: ServerResponse, log: EventLog): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Initial comment to flush headers and let proxies establish the stream.
  res.write(": connected\n\n");

  const handler = (env: Envelope) => {
    res.write(`event: ${env.type}\n`);
    res.write(`id: ${env.sig}\n`);
    res.write(`data: ${JSON.stringify(env)}\n\n`);
  };
  log.on("event", handler);

  // Heartbeat to keep idle connections alive (proxies often time out at 60s).
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    log.off("event", handler);
  };
  req.on("close", cleanup);
  req.on("error", cleanup);
}

function isLoopback(req: IncomingMessage): boolean {
  const remote = req.socket.remoteAddress ?? "";
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

async function readJsonBody(req: IncomingMessage, maxBytes = 256_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error(`request body too large (>${maxBytes} bytes)`));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(new Error(`invalid JSON: ${(err as Error).message}`));
      }
    });
    req.on("error", reject);
  });
}

async function handleControlPublish(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ObserverOptions,
): Promise<void> {
  if (!opts.onPublish) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "publish handler not installed" }));
    return;
  }

  let body: { envelope?: unknown };
  try {
    body = (await readJsonBody(req)) as { envelope?: unknown };
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (err as Error).message }));
    return;
  }

  const v = verifyEnvelope(body.envelope);
  if (!v.ok || !v.envelope) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `envelope rejected: ${v.error ?? "unknown"}` }));
    return;
  }
  if (opts.ownerPubkey && v.envelope.from !== opts.ownerPubkey) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "envelope.from does not match this node's identity" }));
    return;
  }

  try {
    const result = await opts.onPublish(v.envelope);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, msgId: v.envelope.sig, summary: result.summary }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
}

async function handleHistory(
  _req: IncomingMessage,
  res: ServerResponse,
  log: EventLog,
  url: URL,
): Promise<void> {
  const since = url.searchParams.get("since") ?? undefined;
  const type = url.searchParams.get("type") as Envelope["type"] | null;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(10000, parseInt(limitRaw, 10))) : 1000;

  const out: Envelope[] = [];
  for await (const env of log.replay({ since, type: type ?? undefined })) {
    out.push(env);
    if (out.length >= limit) break;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ events: out }));
}
