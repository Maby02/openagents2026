import { EventEmitter } from "node:events";
import { z } from "zod";
import type { AxlClient } from "./client.ts";
import type { Envelope } from "../envelopes.ts";
import { Envelope as EnvelopeSchema, verifyEnvelope } from "../envelopes.ts";
import type { Identity } from "../identity.ts";

// Wire format. Different from a Sibyl envelope: this is the gossip transport
// envelope that wraps a Sibyl envelope as its payload. Stays minimal so we can
// add IHAVE/IWANT later without a breaking change to the publish kind.
const GossipFrame = z.object({
  v: z.literal(1),
  kind: z.literal("publish"),
  topic: z.string().min(1).max(80),
  msgId: z.string().regex(/^[0-9a-f]{128}$/),
  payload: EnvelopeSchema,
});
type GossipFrame = z.infer<typeof GossipFrame>;

export const DEFAULT_TOPIC = "sibyl/v1";

export interface GossipNodeOptions {
  client: AxlClient;
  identity: Identity;
  topic?: string;
  // Bounded LRU cache for dedup. ~1024 messages is plenty for hackathon traffic.
  cacheCapacity?: number;
  // Topology refresh interval — how often we re-fetch /topology.
  topologyRefreshMs?: number;
  // /recv poll backoff when the inbox is empty.
  recvIdleMs?: number;
  log?: (level: "info" | "warn" | "drop", msg: string) => void;
}

export interface GossipPublishStats {
  msgId: string;
  peers: number;
  delivered: number;
  failed: number;
}

class MessageCache {
  private order: string[] = [];
  private set = new Set<string>();
  constructor(private readonly capacity: number) {}
  has(id: string): boolean {
    return this.set.has(id);
  }
  add(id: string): boolean {
    if (this.set.has(id)) return false;
    this.set.add(id);
    this.order.push(id);
    if (this.order.length > this.capacity) {
      const drop = this.order.shift()!;
      this.set.delete(drop);
    }
    return true;
  }
}

// GossipNode owns /recv (single-consumer requirement) and a periodic refresh
// of /topology. Inbound publishes are verified, deduped, emitted as `event`,
// then forwarded to all peers except the sender (eager-push flooding).
//
// This is intentionally simpler than libp2p gossipsub — Phase D MVP keeps the
// wire format compatible with future IHAVE/IWANT additions but only implements
// the publish kind. Mesh size is small for the hackathon so flooding is fine.
export class GossipNode extends EventEmitter {
  private readonly cache: MessageCache;
  private peers: string[] = [];
  private running = false;
  private recvTask: Promise<void> | null = null;
  private topoTimer: NodeJS.Timeout | null = null;
  private readonly topic: string;
  private readonly recvIdleMs: number;
  private readonly topologyRefreshMs: number;
  private readonly logFn: NonNullable<GossipNodeOptions["log"]>;

  constructor(private readonly opts: GossipNodeOptions) {
    super();
    this.cache = new MessageCache(opts.cacheCapacity ?? 1024);
    this.topic = opts.topic ?? DEFAULT_TOPIC;
    this.recvIdleMs = opts.recvIdleMs ?? 200;
    this.topologyRefreshMs = opts.topologyRefreshMs ?? 5000;
    this.logFn = opts.log ?? ((level, msg) => console.log(`[gossip:${level}] ${msg}`));
  }

  get knownPeers(): readonly string[] {
    return this.peers;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.refreshTopology();
    this.topoTimer = setInterval(() => {
      this.refreshTopology().catch((err) =>
        this.logFn("warn", `topology refresh: ${(err as Error).message}`),
      );
    }, this.topologyRefreshMs);
    this.recvTask = this.recvLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.topoTimer) {
      clearInterval(this.topoTimer);
      this.topoTimer = null;
    }
    if (this.recvTask) {
      try { await this.recvTask; } catch { /* ignore */ }
      this.recvTask = null;
    }
  }

  // Outbound: append to local cache, emit locally, send to all known peers.
  // Caller is responsible for appending to events.jsonl.
  async publish(envelope: Envelope): Promise<GossipPublishStats> {
    const msgId = envelope.sig;
    this.cache.add(msgId);

    const frame: GossipFrame = {
      v: 1,
      kind: "publish",
      topic: this.topic,
      msgId,
      payload: envelope,
    };
    const body = Buffer.from(JSON.stringify(frame));

    const stats = await this.broadcast(body, /* exclude */ null);
    this.logFn(
      "info",
      `publish ${envelope.type} msgId=${msgId.slice(0, 12)}… → ${stats.delivered}/${stats.peers} peers` +
        (stats.failed ? ` (${stats.failed} failed)` : ""),
    );
    return { msgId, ...stats };
  }

  private async refreshTopology(): Promise<void> {
    const t = await this.opts.client.getTopology();
    const next = extractPubkeys(t.peers).filter((p) => p !== this.opts.identity.publicKeyHex);
    if (next.length !== this.peers.length || next.some((p, i) => p !== this.peers[i])) {
      this.peers = next;
      this.logFn("info", `topology: ${next.length} peer(s)`);
    }
  }

  private async recvLoop(): Promise<void> {
    while (this.running) {
      try {
        const msg = await this.opts.client.recv();
        if (!msg) {
          await sleep(this.recvIdleMs);
          continue;
        }
        await this.handleInbound(msg.from, msg.body);
      } catch (err) {
        const message = (err as Error).message;
        if (this.running) {
          this.logFn("warn", `recv: ${message}`);
          await sleep(1000);
        }
      }
    }
  }

  private async handleInbound(fromPeer: string, body: Buffer): Promise<void> {
    let parsed: GossipFrame;
    try {
      const raw = JSON.parse(body.toString("utf8"));
      parsed = GossipFrame.parse(raw);
    } catch (err) {
      this.logFn("drop", `bad frame from ${fromPeer.slice(0, 12)}…: ${(err as Error).message}`);
      return;
    }

    if (parsed.topic !== this.topic) {
      this.logFn("drop", `frame for foreign topic '${parsed.topic}'`);
      return;
    }

    if (this.cache.has(parsed.msgId)) {
      // already seen — drop silently (this is the dedup happy path)
      return;
    }

    if (parsed.msgId !== parsed.payload.sig) {
      this.logFn("drop", `msgId/payload sig mismatch from ${fromPeer.slice(0, 12)}…`);
      return;
    }

    const v = verifyEnvelope(parsed.payload);
    if (!v.ok) {
      this.logFn("drop", `bad envelope sig from ${fromPeer.slice(0, 12)}…: ${v.error}`);
      return;
    }

    this.cache.add(parsed.msgId);
    this.emit("event", v.envelope!);

    // Forward (flood) to every peer except the one we got it from.
    const fwdBody = Buffer.from(JSON.stringify(parsed));
    const stats = await this.broadcast(fwdBody, fromPeer);
    this.logFn(
      "info",
      `recv ${v.envelope!.type} from ${fromPeer.slice(0, 12)}… → forwarded to ${stats.delivered}/${stats.peers} peers`,
    );
  }

  private async broadcast(
    body: Buffer,
    excludePeer: string | null,
  ): Promise<{ peers: number; delivered: number; failed: number }> {
    const targets = excludePeer ? this.peers.filter((p) => p !== excludePeer) : [...this.peers];
    if (targets.length === 0) return { peers: 0, delivered: 0, failed: 0 };

    const results = await Promise.allSettled(
      targets.map((peer) => this.opts.client.sendTo(peer, body)),
    );
    let delivered = 0;
    let failed = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      if (r.status === "fulfilled") {
        delivered += 1;
      } else {
        failed += 1;
        const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
        this.logFn("warn", `send to ${targets[i]!.slice(0, 12)}… failed: ${reason}`);
      }
    }
    return { peers: targets.length, delivered, failed };
  }
}

function extractPubkeys(peers: unknown): string[] {
  if (!Array.isArray(peers)) return [];
  const out: string[] = [];
  const PUBKEY_RX = /^[0-9a-f]{64}$/;
  for (const p of peers) {
    if (typeof p === "string" && PUBKEY_RX.test(p)) {
      out.push(p);
      continue;
    }
    if (typeof p === "object" && p) {
      const o = p as Record<string, unknown>;
      const candidates = [o.public_key, o.publicKey, o.pubkey, o.pub_key, o.id, o.peer_id, o.peerId];
      for (const c of candidates) {
        if (typeof c === "string" && PUBKEY_RX.test(c)) {
          out.push(c);
          break;
        }
      }
    }
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
